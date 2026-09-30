// 전투 시작·카드 사용·결정·작업 진단·반납·턴 종료. design.md §3.7
import { cardDef, diseaseDef, encounterDef, presentationDef, relicDef } from "./registry";
import { planIntents } from "./enemy-ai";
import { consumeCostModifiers, costOf, drawCards, exhaustInstance, maxCardsPerTurn, removeFromPiles } from "./cards";
import { deriveStream, pickWeighted, randInt, randRange, shuffleInPlace } from "./rng";
import { enqueueBack, enqueueFront, phaseOp, runQueue } from "./queue";
import { observe, scoreDifferential } from "./evidence";
import { resolveOption } from "./choice";
import { isTreatmentCard } from "./textbook";
import { fire } from "./triggers";
import { emit, findEnemy, hasRelic, livingEnemies, log, modifierValue } from "./util";
import type { CardInstance, CombatState, EffectCtx, EffectOp, EncounterDef, EnemyState, GameState, Uid } from "./types";

/** 문제 하나에 비전형 소견이 섞일 확률 (%) */
export const ATYPICAL_PCT = 50;

function createEnemy(state: GameState, problem: EncounterDef["problems"][number], index: number): EnemyState {
  const pres = presentationDef(problem.presentation);
  const rng = state.rng.encounter;
  const diseaseId = pickWeighted(rng, pres.candidates.map((c) => [c.disease, c.weight] as const));
  const def = diseaseDef(diseaseId);
  const range = pres.burden ?? def.severity;
  let sev = randRange(rng, range[0], range[1]);
  if (problem.hpPct) sev = Math.max(1, Math.floor((sev * problem.hpPct) / 100));
  let variantId: string | undefined;
  if (def.variants?.length) variantId = pickWeighted(rng, def.variants.map((v) => [v.id, v.weight] as const));
  const res: Record<string, number> = {};
  for (const [k, v] of Object.entries(def.acquiredResistance?.start ?? {})) if (v) res[k] = v;
  const e: EnemyState = {
    uid: `e${index + 1}`,
    diseaseId,
    presentationId: pres.id,
    hypotheses: pres.candidates.map((c) => c.disease),
    observations: [],
    organismKnown: false,
    severity: sev,
    maxSeverity: sev,
    stability: 0,
    statuses: [],
    knowledge: 0,
    acquiredResistance: res,
    resistanceFraction: 0,
    phase: 0,
    ai: { history: [], planned: [], planIndex: 0, usedOnce: [] },
    countdowns: [],
    revealNext: false,
    planBonus: 0,
    definitiveUsed: [],
    cured: false,
  };
  if (variantId) e.variantId = variantId;
  if (problem.atkPct && problem.atkPct !== 100) e.atkPct = problem.atkPct;
  // 비전형 발현: 환자는 교과서대로 오지 않는다. 문제마다 확률적으로 한 소견이 교과서와 다르다
  const atyp = Object.entries(def.atypical ?? {}).filter((x): x is [string, string] => !!x[1]);
  if (atyp.length && pres.candidates.length > 1 && randInt(rng, 100) < ATYPICAL_PCT) {
    const [channel, finding] = atyp[randInt(rng, atyp.length)]!;
    e.atypical = { channel, finding };
  }
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
    choiceTrail: [],
  };
  shuffleInPlace(c.rng.shuffle, c.drawPile);
  state.combat = c;
  state.phase = "combat";
  c.enemies = enc.problems.map((p, i) => createEnemy(state, p, i));
  log(c, "info", enc.title ?? "호출");
  c.enemies.forEach((e, i) => {
    const pres = presentationDef(e.presentationId);
    log(c, "info", `${c.enemies.length > 1 ? `#${i + 1} ` : ""}${pres.complaint}: ${pres.vignette}`);
    // 내원 즉시 보이는 소견 (활력 징후 등)
    for (const ch of pres.visible ?? ["vitals"]) observe(state, e, ch, true);
  });
  for (const e of c.enemies) planIntents(state, e);
  if (state.run.flags.fatigue) {
    c.patientStatuses.push({ id: "fatigue", stacks: 1 });
    state.run.flags.fatigue = 0;
  }
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
  if (state.pending) return { ok: false, reason: "결정을 먼저 마쳐야 한다" };
  const ci = c.hand.find((x) => x.uid === cardUid);
  if (!ci) return { ok: false, reason: "손에 없는 카드" };
  const def = cardDef(ci.cardId, ci.upgraded);
  const cost = costOf(state, ci);
  if (cost === null) return { ok: false, reason: "사용할 수 없는 카드" };
  if (cost > c.orders) return { ok: false, reason: "오더가 부족하다", cost };
  if ((c.counters.cardsPlayedThisTurn ?? 0) >= maxCardsPerTurn(state)) return { ok: false, reason: "이번 턴에는 더 쓸 수 없다", cost };
  if (def.target === "enemy" && def.cost !== "unplayable") {
    const t = findEnemy(c, targetUid);
    if (!t || t.cured) return { ok: false, reason: "대상 문제를 골라야 한다", cost };
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
  c.choiceTrail = [];
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
  log(c, "play", `${def.nameKo}${target ? ` → ${problemLabel(target)}` : ""}`);
  const body: EffectOp[] = [];
  if (def.drug) {
    c.counters.drugsPlayedThisTurn = (c.counters.drugsPlayedThisTurn ?? 0) + 1;
    body.push({ op: "administer", cardUid: ci.uid });
  }
  // 시술은 "지금 / 확인 후 / 보류" 결정을 먼저 연다
  if (def.procedure) body.push({ op: "procedure_decision" });
  else body.push(...def.effects);
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

/** 화면·기록용 문제 이름: 확진 전에는 주호소, 확진 뒤에는 질병명 (플레이어 정보) */
export function problemLabel(enemy: EnemyState): string {
  if (enemy.knowledge >= 2) return diseaseDef(enemy.workingDx ?? enemy.diseaseId).nameKo;
  return presentationDef(enemy.presentationId).complaint;
}

export function endTurn(state: GameState): string | null {
  const c = state.combat;
  if (!c || state.phase !== "combat" || c.over) return "전투 중이 아니다";
  if (state.pending) return "결정을 먼저 마쳐야 한다";
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

/** 임상 결정의 선택지 고르기 */
export function chooseOption(state: GameState, optionId: string): string | null {
  const p = state.pending;
  if (!p || p.kind !== "choose_option") return "고를 결정이 없다";
  const err = resolveOption(state, optionId, (ops, ctx) => enqueueFront(state, ops, ctx));
  if (err) return err;
  runQueue(state);
  return null;
}

// ───────────────────────── 작업 진단 ─────────────────────────

/** 작업 진단 변경 비용 (처음 정할 때는 무료) */
export const REVISE_COST = 1;

export function commitCheck(state: GameState, targetUid: Uid, diseaseId: string): { ok: boolean; reason?: string; cost: number } {
  const c = state.combat;
  if (!c || state.phase !== "combat" || c.over) return { ok: false, reason: "전투 중이 아니다", cost: 0 };
  if (state.pending) return { ok: false, reason: "결정을 먼저 마쳐야 한다", cost: 0 };
  const e = findEnemy(c, targetUid);
  if (!e || e.cured) return { ok: false, reason: "없는 문제", cost: 0 };
  if (!e.hypotheses.includes(diseaseId)) return { ok: false, reason: "감별 목록에 없는 진단", cost: 0 };
  if (e.workingDx === diseaseId) return { ok: false, reason: "이미 작업 진단이다", cost: 0 };
  const row = scoreDifferential(e).find((r) => r.diseaseId === diseaseId);
  if (!row || row.ruledOut) return { ok: false, reason: "배제된 진단", cost: 0 };
  const cost = e.workingDx ? REVISE_COST : 0;
  if (cost > c.orders) return { ok: false, reason: `치료 계획 변경에는 오더 ${cost}이 든다`, cost };
  return { ok: true, cost };
}

export function commitDiagnosis(state: GameState, targetUid: Uid, diseaseId: string): string | null {
  const check = commitCheck(state, targetUid, diseaseId);
  if (!check.ok) return check.reason ?? "불가";
  const c = state.combat!;
  const e = findEnemy(c, targetUid)!;
  const revised = !!e.workingDx;
  c.orders -= check.cost;
  const stats = state.run.stats;
  if (revised) stats.revisions += 1;
  else {
    stats.commits += 1;
    stats.commitTurnSum += c.turn;
    if (diseaseId === e.diseaseId) stats.commitsCorrect += 1; // 텔레메트리 전용. 화면에는 퇴원 뒤에만 보인다
  }
  e.workingDx = diseaseId;
  e.workingDxTurn = c.turn;
  emit({ type: "diagnosis_committed", target: e.uid, diseaseId, revised });
  log(c, "diag", `${revised ? "작업 진단 변경" : "작업 진단"}: ${diseaseDef(diseaseId).nameKo}${revised ? ` (오더 ${check.cost})` : ""}`);
  fire(state, "diagnosis_committed", { targetUid: e.uid });
  runQueue(state);
  return null;
}

// ───────────────────────── 처방 반납 ─────────────────────────

export function returnLimit(state: GameState): number {
  return 1 + modifierValue(state, "extraReturn").length;
}

export function returnCheck(state: GameState, cardUid: Uid): { ok: boolean; reason?: string } {
  const c = state.combat;
  if (!c || state.phase !== "combat" || c.over) return { ok: false, reason: "전투 중이 아니다" };
  if (state.pending) return { ok: false, reason: "결정을 먼저 마쳐야 한다" };
  const ci = c.hand.find((x) => x.uid === cardUid);
  if (!ci) return { ok: false, reason: "손에 없는 카드" };
  if (!isTreatmentCard(cardDef(ci.cardId))) return { ok: false, reason: "치료 처방만 반납할 수 있다" };
  if ((c.counters.returnsThisTurn ?? 0) >= returnLimit(state)) return { ok: false, reason: "이번 턴에는 더 반납할 수 없다" };
  return { ok: true };
}

/**
 * 처방 반납: 이 환자에게 맞지 않는 치료 처방을 거둔다. 치료가 아니다.
 * 임시 카드(처방집에서 불러낸 것)는 폐기, 덱 카드는 대기 처방 맨 아래로. 카드 1장을 뽑는다. 턴당 1회, 비용 없음.
 */
export function returnCard(state: GameState, cardUid: Uid): string | null {
  const check = returnCheck(state, cardUid);
  if (!check.ok) return check.reason ?? "불가";
  const c = state.combat!;
  const ci = c.hand.find((x) => x.uid === cardUid)!;
  c.hand.splice(c.hand.indexOf(ci), 1);
  ci.costZeroThisTurn = false;
  ci.retainThisTurn = false;
  if (ci.temp) exhaustInstance(c, ci);
  else c.drawPile.push(ci);
  c.counters.returnsThisTurn = (c.counters.returnsThisTurn ?? 0) + 1;
  state.run.stats.returns += 1;
  emit({ type: "card_returned", uid: ci.uid, cardId: ci.cardId });
  log(c, "play", `처방 반납: ${cardDef(ci.cardId).nameKo} — 이 환자에게 쓰지 않기로 했다`);
  drawCards(state, 1);
  runQueue(state);
  return null;
}

export function combatDeathCause(state: GameState): string | undefined {
  const c = state.combat;
  if (!c) return undefined;
  return state.run.stats.deathCause ?? livingEnemies(c)[0]?.diseaseId;
}
