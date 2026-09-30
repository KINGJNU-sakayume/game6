// 질병의 현재 상태(변이·단계 반영). 모두 엔진 진실이다. 플레이어 정보는 evidence.ts가 만든다.
import { diseaseDef } from "./registry";
import type { AiPattern, DiseaseDef, EnemyState, Grade, MoveDef, OrganismId, Tag, Trait } from "./types";

export function phaseDef(enemy: EnemyState) {
  const def = diseaseDef(enemy.diseaseId);
  if (enemy.phase <= 0 || !def.phases) return undefined;
  return def.phases[enemy.phase - 1];
}

export function variantDef(enemy: EnemyState) {
  const def = diseaseDef(enemy.diseaseId);
  if (!enemy.variantId || !def.variants) return undefined;
  return def.variants.find((v) => v.id === enemy.variantId);
}

export function currentTraits(enemy: EnemyState): Trait[] {
  const def = diseaseDef(enemy.diseaseId);
  const set = new Set(def.traits);
  const ph = phaseDef(enemy);
  if (ph) {
    for (const t of ph.traitsRemove ?? []) set.delete(t);
    for (const t of ph.traitsAdd ?? []) set.add(t);
  }
  return [...set];
}

export function currentOrganism(enemy: EnemyState): OrganismId | undefined {
  const v = variantDef(enemy);
  if (v?.organism) return v.organism;
  return diseaseDef(enemy.diseaseId).organism;
}

/** 기본 → 변이 → 단계 순으로 덮어쓴 반응표 */
export function currentEffectiveness(enemy: EnemyState): Partial<Record<Tag, Grade>> {
  const def = diseaseDef(enemy.diseaseId);
  return {
    ...def.effectiveness,
    ...(variantDef(enemy)?.effectivenessOverride ?? {}),
    ...(phaseDef(enemy)?.effectivenessOverride ?? {}),
  };
}

/** 변이에 따라 달라지는 반응표 항목 (확진 전에는 "?"로 표시, R6) */
export function variantDependentTags(def: DiseaseDef): Set<Tag> {
  const out = new Set<Tag>();
  for (const v of def.variants ?? []) for (const t of Object.keys(v.effectivenessOverride ?? {})) out.add(t);
  return out;
}

export function variantDependentOrganism(def: DiseaseDef): boolean {
  return (def.variants ?? []).some((v) => v.organism !== undefined);
}

export function currentMoves(enemy: EnemyState): MoveDef[] {
  const ph = phaseDef(enemy);
  if (ph?.moves) return ph.moves;
  return diseaseDef(enemy.diseaseId).moves;
}

export function allMoves(def: DiseaseDef): MoveDef[] {
  const out = [...def.moves];
  for (const ph of def.phases ?? []) if (ph.moves) out.push(...ph.moves);
  return out;
}

export function findMove(enemy: EnemyState, moveId: string): MoveDef {
  const def = diseaseDef(enemy.diseaseId);
  const m = currentMoves(enemy).find((x) => x.id === moveId) ?? allMoves(def).find((x) => x.id === moveId);
  if (!m) throw new Error(`unknown move ${moveId} for ${enemy.diseaseId}`);
  return m;
}

export function currentAi(enemy: EnemyState): AiPattern {
  const ph = phaseDef(enemy);
  if (ph?.ai) return ph.ai;
  return diseaseDef(enemy.diseaseId).ai;
}
