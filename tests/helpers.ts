// 시나리오 테스트용 상태 빌더 (design.md §6)
import { CONTENT } from "../src/content";
import { installContent, newRun, step } from "../src/core";
import { startCombat } from "../src/core/combat";
import { planIntents } from "../src/core/enemy-ai";
import { observe, refreshKnowledge } from "../src/core/evidence";
import { cardDef, db, diseaseDef } from "../src/core/registry";
import type { Action, CardInstance, EnemyState, GameEvent, GameState } from "../src/core";

installContent(CONTENT);

export interface EnemySpec {
  disease: string;
  variant?: string;
  severity?: number;
  phase?: number;
  /** 감별 목록. 없으면 그 질병이 들어 있는 첫 내원 양상의 후보 */
  hypotheses?: string[];
  /** 참이면 감별 목록을 그 질병 하나로 두고 확진 상태로 만든다 */
  confirmed?: boolean;
  organismKnown?: boolean;
  workingDx?: string;
}

export interface CombatSpec {
  hand?: string[];
  draw?: string[];
  enemies?: EnemySpec[];
  relics?: string[];
  formulary?: string[];
  orders?: number;
  seed?: string;
}

export function presentationFor(disease: string): string {
  const p = db().presentations.find((x) => x.candidates.some((c) => c.disease === disease));
  return p?.id ?? "p_dka";
}

export function makeEnemy(spec: EnemySpec, i: number): EnemyState {
  const def = diseaseDef(spec.disease);
  const sev = spec.severity ?? def.severity[1];
  const presId = presentationFor(spec.disease);
  const pres = db().presentations.find((p) => p.id === presId)!;
  const hyps = spec.confirmed ? [spec.disease] : spec.hypotheses ?? pres.candidates.map((c) => c.disease);
  const e: EnemyState = {
    uid: `e${i + 1}`,
    diseaseId: spec.disease,
    presentationId: presId,
    hypotheses: hyps.includes(spec.disease) ? hyps : [...hyps, spec.disease],
    observations: [],
    organismKnown: !!spec.organismKnown,
    severity: sev,
    maxSeverity: sev,
    stability: 0,
    statuses: [],
    knowledge: 0,
    acquiredResistance: {},
    resistanceFraction: 0,
    phase: spec.phase ?? 0,
    ai: { history: [], planned: [], planIndex: 0, usedOnce: [] },
    countdowns: [],
    revealNext: false,
    planBonus: 0,
    definitiveUsed: [],
    cured: false,
  };
  if (spec.variant) e.variantId = spec.variant;
  if (spec.workingDx) e.workingDx = spec.workingDx;
  return e;
}

/** 전투 하나를 만들고 손패·적을 원하는 대로 바꾼다. 턴 1, 대기 행동 없음. */
export function makeCombat(spec: CombatSpec = {}): GameState {
  const s = newRun(spec.seed ?? "scenario", { deck: ["stabilize", "stabilize", "stabilize", "stabilize", "stabilize"], relics: spec.relics ?? [], formulary: spec.formulary });
  startCombat(s, "n1_fever", "normal");
  const c = s.combat!;
  c.enemies = (spec.enemies ?? [{ disease: "cap", variant: "pneumococcus" }]).map(makeEnemy);
  c.enemies.forEach((e, i) => {
    const es = (spec.enemies ?? [{ disease: "cap" }])[i]!;
    observe(s, e, "vitals", true);
    if (es.confirmed) {
      // 확진: 질병의 특징 소견을 모두 본 상태
      for (const ch of Object.keys(diseaseDef(e.diseaseId).findings)) if (!ch.startsWith("cx_") && ch !== "stool") observe(s, e, ch, true);
    }
    refreshKnowledge(s, e, true);
    if (es.workingDx) e.workingDx = es.workingDx;
  });
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

/** 대기 중인 결정에서 선택지를 고른다 */
export function choose(s: GameState, optionId: string): { state: GameState; events: GameEvent[] } {
  const r = step(s, { type: "choose_option", optionId });
  if (r.events[0]?.type === "action_rejected") throw new Error(`rejected: ${(r.events[0] as { reason: string }).reason}`);
  return r;
}

/** 카드를 쓰고 이어지는 결정을 차례로 고른다 */
export function playChoose(s: GameState, cardId: string, options: string[], targetUid?: string): { state: GameState; events: GameEvent[] } {
  let r = play(s, cardId, targetUid);
  const events = [...r.events];
  for (const o of options) {
    r = choose(r.state, o);
    events.push(...r.events);
  }
  return { state: r.state, events };
}

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
