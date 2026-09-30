// 피해(질병 부담 감소) 계산 파이프라인. design.md §4.4 (R1, R5, R36)
import { cardDef, diseaseDef } from "./registry";
import { GRADE_PCT, gradeFor, textbook } from "./textbook";
import { currentOrganism } from "./disease";
import { evalCondition } from "./values";
import { combinePct, modifierValue, statusStacks } from "./util";
import type { CardDef, Condition, EffectCtx, EnemyState, GameState, Tag } from "./types";

export { GRADE_PCT, gradeFor };
export type { GradeResult, GradeBasis } from "./textbook";

export function resistancePct(n: number): number {
  return Math.max(40, 100 - 20 * n);
}

export function resistanceStacksFor(enemy: EnemyState, tags: Tag[]): number {
  let n = 0;
  for (const t of tags) n = Math.max(n, enemy.acquiredResistance[t] ?? 0);
  return n;
}

/** 치료 계획 배율의 기본값: 작업 진단의 1차 치료이면 ×1.3 */
export const PLAN_PCT = 130;

/**
 * 치료 계획 일치: 작업 진단(플레이어의 선택)에서 이 치료가 1차(특효·우수)인가.
 * 항생제는 원인균을 배양으로 확인했으면 그 균 기준, 아니면 작업 진단의 모든 원인균 후보에서 1차여야 한다.
 */
export function planMatches(enemy: EnemyState, card: CardDef | undefined, tags: Tag[]): boolean {
  const wd = enemy.workingDx;
  if (!wd) return false;
  const spectrum = card?.drug?.spectrum;
  if (spectrum && enemy.organismKnown) {
    const org = currentOrganism(enemy);
    const g = org ? spectrum[org] : undefined;
    // 확인된 균이 작업 진단의 원인균 후보에 들어 있어야 한다
    const def = diseaseDef(wd);
    const orgs = [def.organism, ...(def.variants ?? []).map((v) => v.organism)].filter(Boolean);
    return !!org && orgs.includes(org) && (g === "key" || g === "weak");
  }
  const tb = textbook(wd, tags, spectrum);
  if (tb.generic || tb.harmful) return false;
  return tb.classes.length > 0 && tb.classes.every((c) => c === "good");
}

export interface PlayerDamageCalc {
  d1: number;
  grade: ReturnType<typeof gradeFor>;
  mults: number[];
  final: number;
  plan: boolean;
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
  if (isAbx && enemy.organismKnown) {
    for (const m of modifierValue(state, "abxBonusOrganism")) a += m.value;
  }
  const d1 = Math.max(0, base + a);
  const grade = gradeFor(enemy, tags, spectrum);
  const mults: number[] = [grade.pct];
  const plan = grade.basis !== "generic" && planMatches(enemy, card, tags);
  mults.push(plan ? PLAN_PCT + enemy.planBonus : 100);
  mults.push(isAbx ? resistancePct(resistanceStacksFor(enemy, tags)) : 100);
  mults.push(c.current && ctx.owner.kind === "card" && c.current.cardUid === ctx.owner.id ? c.current.pct : 100);
  mults.push(statusStacks(enemy.statuses, "vulnerable") > 0 ? 150 : 100);
  mults.push(statusStacks(c.patientStatuses, "weak") > 0 ? 75 : 100);
  if (isAbx) for (const m of modifierValue(state, "abxPct")) mults.push(m.pct);
  for (const m of mods ?? []) if (evalCondition(state, ctx, m.if)) mults.push(m.pct);
  const P = combinePct(mults);
  return { d1, grade, mults, final: Math.floor((d1 * P) / 100), plan };
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
