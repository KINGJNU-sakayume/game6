// 시나리오 테스트용 상태 빌더 (design.md §6)
import { CONTENT } from "../src/content";
import { installContent, newRun, step } from "../src/core";
import { startCombat } from "../src/core/combat";
import { planIntents } from "../src/core/enemy-ai";
import { knowledgeFor } from "../src/core/disease";
import { diseaseDef } from "../src/core/registry";
import type { Action, CardInstance, EnemyState, GameEvent, GameState } from "../src/core";

installContent(CONTENT);

export interface EnemySpec {
  disease: string;
  variant?: string;
  severity?: number;
  knowledge?: 0 | 1 | 2;
  phase?: number;
}

export interface CombatSpec {
  hand?: string[];
  draw?: string[];
  enemies?: EnemySpec[];
  relics?: string[];
  orders?: number;
  seed?: string;
}

export function makeEnemy(spec: EnemySpec, i: number): EnemyState {
  const def = diseaseDef(spec.disease);
  const sev = spec.severity ?? def.severity[1];
  const points = spec.knowledge === 2 ? def.diagnosis.confirmAt : spec.knowledge === 1 ? def.diagnosis.partialAt : 0;
  const e: EnemyState = {
    uid: `e${i + 1}`,
    diseaseId: spec.disease,
    severity: sev,
    maxSeverity: sev,
    stability: 0,
    statuses: [],
    knowledge: knowledgeFor(def, points),
    diagnosisPoints: points,
    acquiredResistance: {},
    resistanceFraction: 0,
    phase: spec.phase ?? 0,
    ai: { history: [], planned: [], planIndex: 0, usedOnce: [] },
    countdowns: [],
    revealNext: false,
    targetedBonus: 0,
    cured: false,
  };
  if (spec.variant) e.variantId = spec.variant;
  return e;
}

/** 전투 하나를 만들고 손패·적을 원하는 대로 바꾼다. 턴 1, 대기 행동 없음. */
export function makeCombat(spec: CombatSpec = {}): GameState {
  const s = newRun(spec.seed ?? "scenario", { deck: ["stabilize", "stabilize", "stabilize", "stabilize", "stabilize"], relics: spec.relics ?? [] });
  startCombat(s, "n1_cap", "normal");
  const c = s.combat!;
  c.enemies = (spec.enemies ?? [{ disease: "cap", variant: "pneumococcus" }]).map(makeEnemy);
  for (const e of c.enemies) planIntents(s, e);
  const mk = (id: string): CardInstance => ({ uid: `t${s.nextUid++}`, cardId: id, upgraded: false });
  c.hand = (spec.hand ?? []).map(mk);
  c.drawPile = (spec.draw ?? ["stabilize", "stabilize", "stabilize", "stabilize", "stabilize", "stabilize"]).map(mk);
  c.discardPile = [];
  c.orders = spec.orders ?? 3;
  c.stability = 0;
  c.log = [];
  return s;
}

export function play(s: GameState, cardId: string, targetUid?: string): { state: GameState; events: GameEvent[] } {
  const ci = s.combat!.hand.find((h) => h.cardId === cardId);
  if (!ci) throw new Error(`card ${cardId} not in hand`);
  const r = step(s, { type: "play_card", cardUid: ci.uid, targetUid: targetUid ?? (cardTargetsEnemy(cardId) ? s.combat!.enemies.find((e) => !e.cured)?.uid : undefined) });
  if (r.events[0]?.type === "action_rejected") throw new Error(`rejected: ${(r.events[0] as { reason: string }).reason}`);
  return r;
}

import { cardDef } from "../src/core/registry";
function cardTargetsEnemy(id: string): boolean {
  return cardDef(id).target === "enemy";
}

export function act(s: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  const r = step(s, a);
  if (r.events[0]?.type === "action_rejected") throw new Error(`rejected: ${(r.events[0] as { reason: string }).reason}`);
  return r;
}

export function handIds(s: GameState): string[] {
  return s.combat!.hand.map((h) => h.cardId);
}

export function allPileIds(s: GameState): string[] {
  const c = s.combat!;
  return [...c.hand, ...c.drawPile, ...c.discardPile].map((h) => h.cardId);
}
