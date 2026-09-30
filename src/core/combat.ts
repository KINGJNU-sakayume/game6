// 전투 시작·카드 사용·턴 종료·전투 종료. design.md §3.7
import { cardDef, diseaseDef, encounterDef, relicDef } from "./registry";
import { knowledgeFor } from "./disease";
import { planIntents } from "./enemy-ai";
import { consumeCostModifiers, costOf, maxCardsPerTurn, removeFromPiles } from "./cards";
import { deriveStream, pickWeighted, randRange, shuffleInPlace } from "./rng";
import { enqueueBack, phaseOp, runQueue } from "./queue";
import { emit, findEnemy, hasRelic, livingEnemies, log } from "./util";
import type { CardInstance, CombatState, EffectCtx, EffectOp, EnemyState, GameState, Uid } from "./types";

function createEnemy(state: GameState, diseaseId: string, hpPct: number | undefined, index: number): EnemyState {
  const def = diseaseDef(diseaseId);
  const rng = state.rng.encounter;
  let sev = randRange(rng, def.severity[0], def.severity[1]);
  if (hpPct) sev = Math.max(1, Math.floor((sev * hpPct) / 100));
  let variantId: string | undefined;
  if (def.variants?.length) variantId = pickWeighted(rng, def.variants.map((v) => [v.id, v.weight] as const));
  const points = state.run.casebook[diseaseId] ? def.diagnosis.partialAt : 0;
  const res: Record<string, number> = {};
  for (const [k, v] of Object.entries(def.acquiredResistance?.start ?? {})) if (v) res[k] = v;
  const e: EnemyState = {
    uid: `e${index + 1}`,
    diseaseId,
    severity: sev,
    maxSeverity: sev,
    stability: 0,
    statuses: [],
    knowledge: knowledgeFor(def, points),
    diagnosisPoints: points,
    acquiredResistance: res,
    resistanceFraction: 0,
    phase: 0,
    ai: { history: [], planned: [], planIndex: 0, usedOnce: [] },
    countdowns: [],
    revealNext: false,
    targetedBonus: 0,
    cured: false,
  };
  if (variantId) e.variantId = variantId;
  return e;
}

export function startCombat(state: GameState, encounterId: string, kind: CombatState["kind"]): void {
  const enc = encounterDef(encounterId);
  const key = `${state.seed}:${state.run.act}:${state.run.floor}`;
  const deck: CardInstance[] = state.run.deck.map((ci) => ({ uid: ci.uid, cardId: ci.cardId, upgraded: ci.upgraded }));
  const c: CombatState = {
    kind,
    encounterId,
    turn: 0,
    orders: 0,
    ordersPerTurn: 3,
    stability: 0,
    drawPile: deck,
    hand: [],
    discardPile: [],
    exhaustPile: [],
    limbo: [],
    enemies: [],
    activeDrugs: [],
    patientStatuses: [],
    queue: [],
    delayed: [],
    costModifiers: [],
    counters: {},
    flags: {},
    log: [],
    rng: {
      shuffle: deriveStream(`${key}:shuffle`),
      enemyAi: deriveStream(`${key}:enemyAi`),
      cardEffect: deriveStream(`${key}:cardEffect`),
    },
    drugOrder: 0,
  };
  shuffleInPlace(c.rng.shuffle, c.drawPile);
  state.combat = c;
  state.phase = "combat";
  c.enemies = enc.enemies.map((x, i) => createEnemy(state, x.disease, x.hpPct, i));
  for (const e of c.enemies) planIntents(state, e);
  if (state.run.flags.fatigue) {
    c.patientStatuses.push({ id: "fatigue", stacks: 1 });
    state.run.flags.fatigue = 0;
  }
  log(c, "info", enc.title ?? "호출");
  enqueueBack(state, [phaseOp("combat_start"), phaseOp("player_turn_start")], { owner: { kind: "system", id: "combat" } });
  runQueue(state);
}

export interface PlayCheck {
  ok: boolean;
  reason?: string;
  cost?: number;
}

export function canPlay(state: GameState, cardUid: Uid, targetUid?: Uid): PlayCheck {
  const c = state.combat;
  if (!c || state.phase !== "combat" || c.over) return { ok: false, reason: "전투 중이 아니다" };
  if (state.pending) return { ok: false, reason: "선택을 먼저 마쳐야 한다" };
  const ci = c.hand.find((x) => x.uid === cardUid);
  if (!ci) return { ok: false, reason: "손에 없는 카드" };
  const def = cardDef(ci.cardId, ci.upgraded);
  const cost = costOf(state, ci);
  if (cost === null) return { ok: false, reason: "사용할 수 없는 카드" };
  if (cost > c.orders) return { ok: false, reason: "오더가 부족하다", cost };
  if ((c.counters.cardsPlayedThisTurn ?? 0) >= maxCardsPerTurn(state)) return { ok: false, reason: "이번 턴에는 더 쓸 수 없다", cost };
  if (def.target === "enemy" && def.cost !== "unplayable") {
    const t = findEnemy(c, targetUid);
    if (!t || t.cured) return { ok: false, reason: "대상을 골라야 한다", cost };
  }
  return { ok: true, cost };
}

export function playCard(state: GameState, cardUid: Uid, targetUid?: Uid): string | null {
  const check = canPlay(state, cardUid, targetUid);
  if (!check.ok) return check.reason ?? "불가";
  const c = state.combat!;
  const ci = c.hand.find((x) => x.uid === cardUid)!;
  const def = cardDef(ci.cardId, ci.upgraded);
  consumeCostModifiers(state, ci);
  c.orders -= check.cost ?? 0;
  removeFromPiles(c, ci.uid);
  c.limbo.push(ci);
  c.counters.cardsPlayedThisTurn = (c.counters.cardsPlayedThisTurn ?? 0) + 1;
  state.run.stats.cardsPlayed += 1;
  const tgt = def.target === "enemy" ? targetUid : undefined;
  emit({ type: "card_played", uid: ci.uid, cardId: ci.cardId, targetUid: tgt });
  const ctx: EffectCtx = { owner: { kind: "card", id: ci.uid, cardId: ci.cardId }, targetUid: tgt, cardTags: def.tags };

  if (def.cost === "unplayable") {
    // 오더를 내고 부작용 카드를 정리한다 (purgeable)
    log(c, "play", `${def.nameKo} 정리 (오더 ${check.cost})`);
    enqueueBack(state, [{ op: "purge_self", cardUid: ci.uid }], ctx);
    runQueue(state);
    return null;
  }

  c.current = { cardUid: ci.uid, pct: 100, suppressSideEffects: false, extraSideEffects: 0 };
  const target = findEnemy(c, tgt);
  log(c, "play", `${def.nameKo}${target ? ` → ${target.knowledge >= 2 ? diseaseDef(target.diseaseId).nameKo : diseaseDef(target.diseaseId).presentation.complaint}` : ""}`);
  const body: EffectOp[] = [];
  if (def.drug) {
    c.counters.drugsPlayedThisTurn = (c.counters.drugsPlayedThisTurn ?? 0) + 1;
    body.push({ op: "administer", cardUid: ci.uid });
  }
  body.push(...def.effects);
  if (def.drug) body.push({ op: "emit_side_effects", cardUid: ci.uid });
  const ops: EffectOp[] = [...body];
  if (def.drug && (c.flags.orderSetArmed ?? 0) > 0) {
    c.flags.orderSetArmed = (c.flags.orderSetArmed ?? 0) - 1;
    log(c, "info", "오더 세트: 한 번 더 투여");
    ops.push({ op: "reset_current" }, ...body);
  }
  ops.push({ op: "card_played", cardUid: ci.uid }, { op: "finish_card", cardUid: ci.uid });
  enqueueBack(state, ops, ctx);
  runQueue(state);
  return null;
}

export function endTurn(state: GameState): string | null {
  const c = state.combat;
  if (!c || state.phase !== "combat" || c.over) return "전투 중이 아니다";
  if (state.pending) return "선택을 먼저 마쳐야 한다";
  const ctx: EffectCtx = { owner: { kind: "system", id: "end_turn" } };
  const ops: EffectOp[] = [];
  if (hasRelic(state, "sbar") && c.hand.length > 0 && !c.flags.retainAll) {
    ops.push({
      op: "select_cards",
      from: ["hand"],
      min: 0,
      max: 1,
      then: [{ op: "retain_selected" }],
      prompt: `${relicDef("sbar").nameKo}: 다음 턴으로 넘길 카드 1장 (건너뛰어도 된다)`,
    });
  }
  ops.push(phaseOp("end_turn_hand"), phaseOp("end_turn_discard"), phaseOp("enemy_turns"));
  enqueueBack(state, ops, ctx);
  runQueue(state);
  return null;
}

/** 대기 선택(손패·더미) 해소 */
export function resolveCardSelection(state: GameState, uids: Uid[]): string | null {
  const p = state.pending;
  if (!p || p.kind !== "select_cards") return "선택할 것이 없다";
  const uniq = [...new Set(uids)];
  if (uniq.length < p.min || uniq.length > p.max) return `${p.min}~${p.max}장을 골라야 한다`;
  if (!uniq.every((u) => p.candidates.includes(u))) return "고를 수 없는 카드";
  state.pending = undefined;
  const c = state.combat!;
  c.queue.unshift(...p.then.map((op) => ({ op, ctx: { ...p.ctx, selected: uniq } })));
  runQueue(state);
  return null;
}

export function combatDeathCause(state: GameState): string | undefined {
  const c = state.combat;
  if (!c) return undefined;
  return state.run.stats.deathCause ?? livingEnemies(c)[0]?.diseaseId;
}
