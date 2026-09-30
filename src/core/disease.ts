// 질병의 현재 상태(변이·단계 반영)와 진단. design.md D3
import { diseaseDef } from "./registry";
import { emit, modifierValue } from "./util";
import type { AiPattern, DiseaseDef, EnemyState, GameState, Grade, MoveDef, OrganismId, Tag, Trait } from "./types";

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

export function knowledgeFor(def: DiseaseDef, points: number): 0 | 1 | 2 {
  if (points >= def.diagnosis.confirmAt) return 2;
  if (points >= def.diagnosis.partialAt) return 1;
  return 0;
}

export interface DiagnoseResult {
  levelUp: 0 | 1 | 2;
}

/** 진단 포인트를 더한다. 단계가 오르면 이벤트를 내고, 확진이면 증례집에 적는다. */
export function addDiagnosis(state: GameState, enemy: EnemyState, points: number): DiagnoseResult {
  if (points <= 0 || enemy.cured) return { levelUp: 0 };
  const bonus = modifierValue(state, "diagnoseBonus").reduce((a, m) => a + m.value, 0);
  const def = diseaseDef(enemy.diseaseId);
  const before = enemy.knowledge;
  enemy.diagnosisPoints += points + bonus;
  const after = knowledgeFor(def, enemy.diagnosisPoints);
  emit({ type: "diagnosed", target: enemy.uid, points: points + bonus });
  if (after > before) {
    enemy.knowledge = after;
    emit({ type: "knowledge_up", target: enemy.uid, level: after as 1 | 2 });
    if (after === 2) {
      state.run.casebook[enemy.diseaseId] = "confirmed";
      state.run.stats.diagnosesConfirmed += 1;
    }
    return { levelUp: after as 1 | 2 };
  }
  return { levelUp: 0 };
}

export function confirmEnemy(state: GameState, enemy: EnemyState): DiagnoseResult {
  const def = diseaseDef(enemy.diseaseId);
  const need = def.diagnosis.confirmAt - enemy.diagnosisPoints;
  if (need <= 0) return { levelUp: 0 };
  const before = enemy.knowledge;
  enemy.diagnosisPoints = def.diagnosis.confirmAt;
  enemy.knowledge = 2;
  emit({ type: "knowledge_up", target: enemy.uid, level: 2 });
  state.run.casebook[enemy.diseaseId] = "confirmed";
  state.run.stats.diagnosesConfirmed += 1;
  return { levelUp: before < 2 ? 2 : 0 };
}
