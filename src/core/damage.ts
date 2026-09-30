// 피해 계산 파이프라인. design.md §4.4 (R1, R5, R36)
import { cardDef, diseaseDef, tagDef } from "./registry";
import { currentEffectiveness, currentOrganism, currentTraits, variantDependentOrganism, variantDependentTags } from "./disease";
import { evalCondition } from "./values";
import { combinePct, modifierValue, statusStacks } from "./util";
import type { Condition, EffectCtx, EnemyState, GameState, Grade, OrganismId, Tag } from "./types";

export const GRADE_PCT: Record<Exclude<Grade, "harmful">, number> = {
  key: 200,
  weak: 150,
  normal: 100,
  resistant: 50,
  immune: 0,
};

const GRADE_RANK: Record<Exclude<Grade, "harmful">, number> = { key: 4, weak: 3, normal: 2, resistant: 1, immune: 0 };

export type GradeBasis = "generic" | "graded" | "not_indicated";

export interface GradeResult {
  harmful: boolean;
  pct: number;                  // e (0..200)
  grade: Grade | "generic" | "not_indicated";
  basis: GradeBasis;
  /** 이 판정이 대상의 어떤 정보에 의존하는지 (미리보기에서 정보 누설을 막는 데 쓴다) */
  dependsOnVariant: boolean;
}

function indicated(enemy: EnemyState, tag: Tag): boolean {
  const td = tagDef(tag);
  if (!td?.indications) return false;
  const def = diseaseDef(enemy.diseaseId);
  if (td.indications.categories?.includes(def.category)) return true;
  const traits = currentTraits(enemy);
  return (td.indications.traits ?? []).some((t) => traits.includes(t));
}

/**
 * 카드 태그·스펙트럼으로 대상 질병에 대한 치료 등급을 구한다.
 * - 금기 항목이 하나라도 맞으면 harmful
 * - 치료 근거(치료 태그, 항생제 스펙트럼)가 있으면 그중 가장 좋은 등급
 * - 치료 근거가 모두 "해당 없음"이면 0 (적응증 아님)
 * - 치료 태그도 스펙트럼도 없으면 범용 처치 100
 */
export function gradeFor(enemy: EnemyState, tags: Tag[], spectrum?: Partial<Record<OrganismId, Grade>>): GradeResult {
  const def = diseaseDef(enemy.diseaseId);
  const M = currentEffectiveness(enemy);
  const vdTags = variantDependentTags(def);
  let dependsOnVariant = false;

  // 2단계: 금기
  for (const t of tags) {
    if (M[t] === "harmful") {
      if (vdTags.has(t)) dependsOnVariant = true;
      return { harmful: true, pct: 0, grade: "harmful", basis: "graded", dependsOnVariant };
    }
  }
  const organism = currentOrganism(enemy);
  if (spectrum && organism && M["abx"] === undefined) {
    if (spectrum[organism] === "harmful") {
      return { harmful: true, pct: 0, grade: "harmful", basis: "graded", dependsOnVariant: variantDependentOrganism(def) };
    }
  }

  // 3단계: 치료 등급
  const grades: Exclude<Grade, "harmful">[] = [];
  let hasTherapeutic = false;
  for (const t of tags) {
    const td = tagDef(t);
    if (td?.kind !== "therapeutic") continue;
    hasTherapeutic = true;
    const g = M[t];
    if (g !== undefined && g !== "harmful") {
      grades.push(g);
      if (vdTags.has(t)) dependsOnVariant = true;
    } else if (indicated(enemy, t)) grades.push("normal");
  }
  if (spectrum) {
    hasTherapeutic = true;
    const explicit = M["abx"];
    if (explicit !== undefined && explicit !== "harmful") {
      grades.push(explicit);
      if (vdTags.has("abx")) dependsOnVariant = true;
    } else if (organism) {
      grades.push((spectrum[organism] as Exclude<Grade, "harmful"> | undefined) ?? "immune");
      if (variantDependentOrganism(def)) dependsOnVariant = true;
    }
  }

  let e: number;
  let grade: GradeResult["grade"];
  let basis: GradeBasis;
  if (!hasTherapeutic) {
    e = 100;
    grade = "generic";
    basis = "generic";
  } else if (grades.length === 0) {
    e = 0;
    grade = "not_indicated";
    basis = "not_indicated";
  } else {
    let best = grades[0]!;
    for (const g of grades) if (GRADE_RANK[g] > GRADE_RANK[best]) best = g;
    e = GRADE_PCT[best];
    grade = best;
    basis = "graded";
  }

  // 계열·성질 태그의 명시 항목 (금기 제외)
  for (const t of tags) {
    const td = tagDef(t);
    if (!td || td.kind === "therapeutic") continue;
    const g = M[t];
    if (g !== undefined && g !== "harmful") {
      e = Math.floor((e * GRADE_PCT[g]) / 100);
      if (vdTags.has(t)) dependsOnVariant = true;
    }
  }
  e = Math.min(200, e);
  return { harmful: false, pct: e, grade, basis, dependsOnVariant };
}

export function resistancePct(n: number): number {
  return Math.max(40, 100 - 20 * n);
}

export function resistanceStacksFor(enemy: EnemyState, tags: Tag[]): number {
  let n = 0;
  for (const t of tags) n = Math.max(n, enemy.acquiredResistance[t] ?? 0);
  return n;
}

export interface PlayerDamageCalc {
  d1: number;
  grade: GradeResult;
  mults: number[];
  final: number;
}

/** 플레이어(카드) → 질병 피해 계산. 상태를 바꾸지 않는다. */
export function calcPlayerDamage(
  state: GameState,
  ctx: EffectCtx,
  enemy: EnemyState,
  base: number,
  tags: Tag[],
  mods: { if: Condition; pct: number }[] | undefined,
): PlayerDamageCalc {
  const c = state.combat!;
  const card = ctx.owner.kind === "card" && ctx.owner.cardId ? cardDef(ctx.owner.cardId) : undefined;
  const spectrum = card?.drug?.spectrum;
  const isAbx = !!spectrum;
  let a = 0;
  if (isAbx && enemy.knowledge >= 2) {
    for (const m of modifierValue(state, "abxBonusConfirmed")) a += m.value;
  }
  const d1 = Math.max(0, base + a);
  const grade = gradeFor(enemy, tags, spectrum);
  const mults: number[] = [grade.pct];
  const targeted = card?.keywords?.includes("targeted") ?? false;
  mults.push(targeted && enemy.knowledge >= 2 ? 150 + enemy.targetedBonus : 100);
  mults.push(isAbx ? resistancePct(resistanceStacksFor(enemy, tags)) : 100);
  mults.push(c.current && ctx.owner.kind === "card" && c.current.cardUid === ctx.owner.id ? c.current.pct : 100);
  mults.push(statusStacks(enemy.statuses, "vulnerable") > 0 ? 150 : 100);
  mults.push(statusStacks(c.patientStatuses, "weak") > 0 ? 75 : 100);
  if (isAbx) for (const m of modifierValue(state, "abxPct")) mults.push(m.pct);
  for (const m of mods ?? []) if (evalCondition(state, ctx, m.if)) mults.push(m.pct);
  const P = combinePct(mults);
  return { d1, grade, mults, final: Math.floor((d1 * P) / 100) };
}

/** 질병 → 환자 공격 피해 계산. 의도 표시에도 쓴다. */
export function calcEnemyAttack(
  state: GameState,
  enemy: EnemyState,
  base: number,
  mods: { if: Condition; pct: number }[] | undefined,
): number {
  const c = state.combat!;
  let a = statusStacks(enemy.statuses, "aggravation") + statusStacks(enemy.statuses, "acidosis");
  if (diseaseDef(enemy.diseaseId).category === "infection") {
    const immuno = c.hand.filter((ci) => cardDef(ci.cardId).sideEffect?.passive === "infection_attack_up").length;
    a += immuno * 2;
  }
  const d1 = Math.max(0, base + a);
  const mults: number[] = [enemy.atkPct ?? 100];
  mults.push(statusStacks(c.patientStatuses, "vulnerable") > 0 ? 150 : 100);
  mults.push(statusStacks(enemy.statuses, "weak") > 0 ? 75 : 100);
  const ctx: EffectCtx = { owner: { kind: "enemy", id: enemy.uid } };
  for (const m of mods ?? []) if (evalCondition(state, ctx, m.if)) mults.push(m.pct);
  return Math.floor((d1 * combinePct(mults)) / 100);
}
