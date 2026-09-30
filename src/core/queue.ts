// 효과 큐 처리와 명령 실행기, 턴 흐름 단계. design.md §3.7, D6
import { cardDef, db, diseaseDef, relicDef, statusDef } from "./registry";
import { addDiagnosis, confirmEnemy, findMove, phaseDef } from "./disease";
import { calcEnemyAttack, calcPlayerDamage } from "./damage";
import { administer, diseaseLabel, emitSideEffects, endDrugs, harmfulResponse, tickDrugs } from "./drugs";
import { addCardTo, addGeneratedCard, createInstance, drawCards, exhaustInstance, matchesFilter, pileOf, removeFromPiles } from "./cards";
import { planIntents, replanAll } from "./enemy-ai";
import { fire } from "./triggers";
import { pickOne } from "./rng";
import { drugTagActive, evalCondition, evalValue, resolveTargets } from "./values";
import { addStatus, clamp, emit, findEnemy, hasRelic, livingEnemies, log, modifierValue, removeStatus, statusStacks } from "./util";
import type { CardInstance, EffectCtx, EffectOp, EnemyState, GameState, QueuedEffect, TurnPhase } from "./types";

const QUEUE_LIMIT = 1000;

export function enqueueBack(state: GameState, ops: EffectOp[], ctx: EffectCtx): void {
  const c = state.combat!;
  for (const op of ops) c.queue.push({ op, ctx });
}

export function enqueueFront(state: GameState, ops: EffectOp[], ctx: EffectCtx): void {
  const c = state.combat!;
  c.queue.unshift(...ops.map((op): QueuedEffect => ({ op, ctx })));
}

export function phaseOp(name: TurnPhase, enemyUid?: string): EffectOp {
  return enemyUid ? { op: "phase", name, enemyUid } : { op: "phase", name };
}

const SYSTEM: EffectCtx = { owner: { kind: "system", id: "turn" } };

/** 전투 종료 여부. 종료면 큐를 비운다. */
export function checkCombatOver(state: GameState): boolean {
  const c = state.combat;
  if (!c || c.over) return !!c?.over;
  if (state.run.vitality <= 0) {
    state.run.vitality = 0;
    c.over = "defeat";
  } else if (livingEnemies(c).length === 0) {
    c.over = "victory";
  }
  if (c.over) {
    c.queue = [];
    state.pending = undefined;
    return true;
  }
  return false;
}

export function runQueue(state: GameState): void {
  let guard = 0;
  while (state.combat && !state.combat.over && state.combat.queue.length > 0 && !state.pending) {
    guard += 1;
    if (guard > QUEUE_LIMIT) throw new Error("effect queue exceeded 1000 steps in one step");
    const item = state.combat.queue.shift()!;
    execute(state, item);
    if (checkCombatOver(state)) break;
  }
}

// ───────────────────────── 피해·회복 ─────────────────────────

function cureEnemy(state: GameState, enemy: EnemyState): void {
  const c = state.combat!;
  enemy.severity = 0;
  enemy.cured = true;
  enemy.countdowns = [];
  enemy.stability = 0;
  c.delayed = c.delayed.filter((d) => d.ctx.targetUid !== enemy.uid);
  state.run.stats.diseasesCured.push(enemy.diseaseId);
  emit({ type: "enemy_cured", target: enemy.uid, diseaseId: enemy.diseaseId });
  log(c, "info", `${diseaseLabel(enemy)} 치료됨`);
  fire(state, "enemy_cured", { targetUid: enemy.uid });
}

export function enterPhase(state: GameState, enemy: EnemyState, phase: number): void {
  const c = state.combat!;
  if (enemy.phase >= phase) return;
  enemy.phase = phase;
  const ph = phaseDef(enemy);
  emit({ type: "phase_changed", target: enemy.uid, phase, name: ph?.nameKo ?? "" });
  log(c, "warn", `${diseaseLabel(enemy)}: ${ph?.nameKo ?? "상태 변화"}`);
  replanAll(state, enemy);
  if (ph?.onEnter?.length) enqueueFront(state, ph.onEnter, { owner: { kind: "enemy", id: enemy.uid } });
}

function checkPhaseThreshold(state: GameState, enemy: EnemyState): void {
  const def = diseaseDef(enemy.diseaseId);
  (def.phases ?? []).forEach((ph, i) => {
    if (ph.enterAtSeverityPct === undefined) return;
    if (enemy.phase < i + 1 && enemy.severity > 0 && enemy.severity * 100 <= enemy.maxSeverity * ph.enterAtSeverityPct) {
      enterPhase(state, enemy, i + 1);
    }
  });
}

export function damagePatient(state: GameState, amount: number, source?: EnemyState): void {
  const c = state.combat!;
  const absorbed = Math.min(c.stability, amount);
  c.stability -= absorbed;
  const loss = amount - absorbed;
  const before = state.run.vitality;
  state.run.vitality = Math.max(0, state.run.vitality - loss);
  state.run.stats.damageTaken += before - state.run.vitality;
  emit({ type: "damage", target: "patient", amount, absorbed });
  if (loss > 0) {
    if (source && state.run.vitality <= 0) state.run.stats.deathCause = source.diseaseId;
    fire(state, "vitality_below");
    fire(state, "damage_taken");
  }
}

export function loseVitality(state: GameState, amount: number, cause?: string): void {
  if (amount <= 0) return;
  const before = state.run.vitality;
  state.run.vitality = Math.max(0, state.run.vitality - amount);
  state.run.stats.damageTaken += before - state.run.vitality;
  emit({ type: "vitality_lost", amount: before - state.run.vitality });
  if (state.run.vitality <= 0 && cause) state.run.stats.deathCause = cause;
  if (state.combat) fire(state, "vitality_below");
}

function gainResistance(state: GameState, enemy: EnemyState, tags: string[]): void {
  const def = diseaseDef(enemy.diseaseId);
  const ar = def.acquiredResistance;
  if (!ar) return;
  const half = modifierValue(state, "resistanceHalf").length > 0;
  let gain = ar.gainPerHit;
  if (half) {
    enemy.resistanceFraction += ar.gainPerHit;
    gain = Math.floor(enemy.resistanceFraction / 2);
    enemy.resistanceFraction -= gain * 2;
  }
  if (gain <= 0) return;
  for (const t of tags) {
    if (!ar.tags.includes(t)) continue;
    enemy.acquiredResistance[t] = (enemy.acquiredResistance[t] ?? 0) + gain;
    emit({ type: "resistance_up", target: enemy.uid, tag: t, stacks: enemy.acquiredResistance[t]! });
  }
}

function execDamage(state: GameState, op: Extract<EffectOp, { op: "damage" }>, ctx: EffectCtx): void {
  const c = state.combat!;
  const amount = evalValue(state, ctx, op.amount);
  const hits = op.hits ?? 1;
  if (ctx.owner.kind === "enemy") {
    const enemy = findEnemy(c, ctx.owner.id);
    if (!enemy || enemy.cured) return;
    for (let h = 0; h < hits; h++) {
      const dmg = calcEnemyAttack(state, enemy, amount, op.mods);
      damagePatient(state, dmg, enemy);
      if (state.run.vitality <= 0) return;
    }
    return;
  }
  const tags = op.tags ?? ctx.cardTags ?? [];
  const card = ctx.owner.kind === "card" && ctx.owner.cardId ? cardDef(ctx.owner.cardId) : undefined;
  for (const t of resolveTargets(state, ctx, op.target ?? "target")) {
    if (t.kind !== "enemy") continue;
    const enemy = t.enemy;
    for (let h = 0; h < hits; h++) {
      if (enemy.cured) break;
      const calc = calcPlayerDamage(state, ctx, enemy, amount, tags, op.mods);
      if (calc.grade.harmful) {
        if (card?.kind === "drug") {
          emit({ type: "ineffective", target: enemy.uid, reason: "immune" });
        } else {
          harmfulResponse(state, enemy, calc.d1, card?.nameKo ?? "처치");
        }
        break;
      }
      if (calc.grade.pct === 0) {
        emit({ type: "ineffective", target: enemy.uid, reason: calc.grade.basis === "not_indicated" ? "not_indicated" : "immune" });
        if (card) log(c, "info", `${card.nameKo}: ${diseaseLabel(enemy)}에 ${calc.grade.basis === "not_indicated" ? "적응증 아님" : "무효"}`);
        break;
      }
      const d = calc.final;
      const absorbed = Math.min(enemy.stability, d);
      enemy.stability -= absorbed;
      enemy.severity = Math.max(0, enemy.severity - (d - absorbed));
      emit({ type: "damage", target: enemy.uid, amount: d, absorbed, grade: calc.grade.grade === "not_indicated" ? undefined : calc.grade.grade });
      if (card?.drug?.spectrum && d >= 1 && (enemy.knowledge < 2 || tags.includes("broad_spectrum"))) gainResistance(state, enemy, tags);
      if (enemy.severity <= 0) {
        cureEnemy(state, enemy);
        break;
      }
      checkPhaseThreshold(state, enemy);
    }
  }
}

// ───────────────────────── 실행기 ─────────────────────────

function selectedCards(state: GameState, ctx: EffectCtx): CardInstance[] {
  const c = state.combat!;
  const set = new Set(ctx.selected ?? []);
  return [...c.hand, ...c.drawPile, ...c.discardPile].filter((ci) => set.has(ci.uid));
}

function execute(state: GameState, item: QueuedEffect): void {
  const c = state.combat!;
  const { op, ctx } = item;
  switch (op.op) {
    case "damage":
      execDamage(state, op, ctx);
      return;
    case "lose_vitality": {
      const cause = ctx.owner.kind === "enemy" ? findEnemy(c, ctx.owner.id)?.diseaseId : undefined;
      loseVitality(state, evalValue(state, ctx, op.amount), cause);
      return;
    }
    case "heal": {
      const amount = evalValue(state, ctx, op.amount);
      for (const t of resolveTargets(state, ctx, op.target ?? "patient")) {
        if (t.kind === "patient") {
          const before = state.run.vitality;
          state.run.vitality = Math.min(state.run.maxVitality, state.run.vitality + amount);
          emit({ type: "healed", target: "patient", amount: state.run.vitality - before });
        } else {
          const e = t.enemy;
          const before = e.severity;
          e.severity = Math.min(e.maxSeverity, e.severity + amount);
          emit({ type: "healed", target: e.uid, amount: e.severity - before });
        }
      }
      return;
    }
    case "gain_stability": {
      const amount = evalValue(state, ctx, op.amount);
      for (const t of resolveTargets(state, ctx, op.target ?? (ctx.owner.kind === "enemy" ? "self" : "patient"))) {
        if (t.kind === "patient") {
          const pct = statusStacks(c.patientStatuses, "dehydration") > 0 ? 75 : 100;
          const v = Math.floor((amount * pct) / 100);
          c.stability += v;
          emit({ type: "stability_gained", target: "patient", amount: v });
        } else {
          t.enemy.stability += amount;
          emit({ type: "stability_gained", target: t.enemy.uid, amount });
        }
      }
      return;
    }
    case "gain_orders":
      c.orders = Math.max(0, c.orders + evalValue(state, ctx, op.amount));
      return;
    case "draw":
      drawCards(state, Math.max(0, evalValue(state, ctx, op.amount)));
      return;
    case "exhaust_cards": {
      let left = op.amount === "all" ? Infinity : op.amount;
      for (const pile of op.from) {
        const arr = pileOf(c, pile);
        for (const ci of [...arr]) {
          if (left <= 0) break;
          if (!matchesFilter(cardDef(ci.cardId), op.filter)) continue;
          arr.splice(arr.indexOf(ci), 1);
          exhaustInstance(c, ci);
          left -= 1;
        }
      }
      return;
    }
    case "add_card":
      for (let i = 0; i < op.count; i++) addGeneratedCard(state, op.cardId, op.dest, op.costZeroThisTurn);
      return;
    case "add_random_card": {
      const pool = db().cards.filter((d) => d.rarity === op.rarity && d.kind !== "side_effect");
      if (!pool.length) return;
      const pick = pickOne(c.rng.cardEffect, pool);
      const ci = createInstance(state, pick.id, true);
      if (op.costZeroThisTurn) ci.costZeroThisTurn = true;
      addCardTo(state, ci, "hand");
      emit({ type: "card_gained", cardId: pick.id });
      log(c, "info", `${pick.nameKo} 카드를 손에 넣었다`);
      return;
    }
    case "apply_status": {
      const stacks = evalValue(state, ctx, op.stacks);
      const fresh = !!c.flags.enemyPhase;
      for (const t of resolveTargets(state, ctx, op.target)) {
        if (t.kind === "patient") {
          addStatus(c.patientStatuses, op.status, stacks, fresh);
          emit({ type: "status_applied", target: "patient", status: op.status, stacks });
        } else {
          addStatus(t.enemy.statuses, op.status, stacks, fresh);
          emit({ type: "status_applied", target: t.enemy.uid, status: op.status, stacks });
        }
      }
      return;
    }
    case "remove_status":
      for (const t of resolveTargets(state, ctx, op.target)) {
        if (t.kind === "patient") removeStatus(c.patientStatuses, op.status, op.stacks);
        else removeStatus(t.enemy.statuses, op.status, op.stacks);
      }
      return;
    case "diagnose": {
      const pts = evalValue(state, ctx, op.points);
      for (const t of resolveTargets(state, ctx, op.target)) {
        if (t.kind !== "enemy") continue;
        const r = addDiagnosis(state, t.enemy, pts);
        if (r.levelUp) onKnowledgeUp(state, t.enemy, r.levelUp);
      }
      return;
    }
    case "confirm":
      for (const t of resolveTargets(state, ctx, op.target)) {
        if (t.kind !== "enemy") continue;
        const r = confirmEnemy(state, t.enemy);
        if (r.levelUp) onKnowledgeUp(state, t.enemy, 2);
      }
      return;
    case "reveal_intent":
      for (const t of resolveTargets(state, ctx, op.target)) if (t.kind === "enemy") t.enemy.revealNext = true;
      return;
    case "modify_resistance":
      for (const t of resolveTargets(state, ctx, op.target)) {
        if (t.kind !== "enemy") continue;
        const keys = op.tag === "all" ? Object.keys(t.enemy.acquiredResistance) : [op.tag];
        for (const k of keys) t.enemy.acquiredResistance[k] = Math.max(0, (t.enemy.acquiredResistance[k] ?? 0) + op.delta);
      }
      return;
    case "end_drug": {
      const f = op.filter;
      const n = endDrugs(state, (d) => !!f.all || (f.ids?.includes(d.cardId) ?? false) || (f.tags?.some((t) => d.tags.includes(t)) ?? false));
      c.counters.drugsEndedNow = n;
      return;
    }
    case "extend_drug": {
      const f = op.filter;
      for (const d of c.activeDrugs) {
        if (f.all || f.ids?.includes(d.cardId) || f.tags?.some((t) => d.tags.includes(t))) d.turnsLeft += op.turns;
      }
      return;
    }
    case "modify_current":
      if (c.current) c.current.pct = Math.floor((c.current.pct * op.pct) / 100);
      return;
    case "suppress_side_effects":
      if (c.current) c.current.suppressSideEffects = true;
      return;
    case "extra_side_effects":
      if (c.current) c.current.extraSideEffects += op.times;
      return;
    case "cost_modifier":
      c.costModifiers.push({ filter: op.filter, delta: op.delta, uses: op.uses, scope: op.scope });
      return;
    case "combat_flag":
      c.flags[op.flag] = (c.flags[op.flag] ?? 0) + op.delta;
      return;
    case "targeted_bonus":
      for (const t of resolveTargets(state, ctx, op.target)) if (t.kind === "enemy") t.enemy.targetedBonus += op.pct;
      return;
    case "start_countdown":
      for (const t of resolveTargets(state, ctx, op.target ?? "self")) {
        if (t.kind !== "enemy") continue;
        t.enemy.countdowns.push({ moveId: op.move, turnsLeft: op.turns });
        emit({ type: "countdown_started", target: t.enemy.uid, moveId: op.move, turns: op.turns });
        log(c, "warn", `${diseaseLabel(t.enemy)}: 합병증 예고 (${op.turns}턴)`);
        fire(state, "countdown_started", { targetUid: t.enemy.uid });
      }
      return;
    case "enter_phase":
      for (const t of resolveTargets(state, ctx, op.target ?? "self")) if (t.kind === "enemy") enterPhase(state, t.enemy, op.phase);
      return;
    case "raise_max_severity":
      for (const t of resolveTargets(state, ctx, op.target ?? "self")) {
        if (t.kind !== "enemy") continue;
        t.enemy.maxSeverity += op.amount;
        t.enemy.severity += op.amount;
        emit({ type: "healed", target: t.enemy.uid, amount: op.amount });
      }
      return;
    case "gain_gold":
      state.run.gold += op.amount;
      emit({ type: "gold_changed", amount: op.amount });
      return;
    case "repeat": {
      const ops: EffectOp[] = [];
      for (let i = 0; i < op.times; i++) ops.push(...op.effects);
      enqueueFront(state, ops, ctx);
      return;
    }
    case "if":
      enqueueFront(state, evalCondition(state, ctx, op.cond) ? op.then : op.else ?? [], ctx);
      return;
    case "delay":
      c.delayed.push({ turnsLeft: op.turns, effects: op.effects, ctx });
      return;
    case "select_cards": {
      const candidates = op.from
        .flatMap((p) => pileOf(c, p))
        .filter((ci) => !op.filter || matchesFilter(cardDef(ci.cardId), op.filter))
        .map((ci) => ci.uid);
      if (candidates.length === 0) return;
      const max = Math.min(op.max, candidates.length);
      const min = Math.min(op.min, max);
      if (min === max && max === candidates.length && min > 0) {
        enqueueFront(state, op.then, { ...ctx, selected: candidates });
        return;
      }
      state.pending = { kind: "select_cards", candidates, min, max, prompt: op.prompt, then: op.then, ctx };
      return;
    }
    case "exhaust_selected":
      for (const ci of selectedCards(state, ctx)) {
        removeFromPiles(c, ci.uid);
        exhaustInstance(c, ci);
      }
      return;
    case "discard_selected":
      for (const ci of selectedCards(state, ctx)) {
        removeFromPiles(c, ci.uid);
        c.discardPile.push(ci);
      }
      return;
    case "retain_selected":
      for (const ci of selectedCards(state, ctx)) ci.retainThisTurn = true;
      return;
    case "custom":
      execCustom(state, op, ctx);
      return;
    case "administer":
      administer(state, op.cardUid, ctx);
      return;
    case "emit_side_effects":
      emitSideEffects(state, op.cardUid);
      return;
    case "reset_current":
      if (c.current) {
        c.current.pct = 100;
        c.current.suppressSideEffects = false;
        c.current.extraSideEffects = 0;
      }
      return;
    case "card_played":
      fire(state, "card_played");
      return;
    case "finish_card": {
      const i = c.limbo.findIndex((x) => x.uid === op.cardUid);
      if (i >= 0) {
        const ci = c.limbo.splice(i, 1)[0]!;
        const def = cardDef(ci.cardId, ci.upgraded);
        ci.costZeroThisTurn = false;
        if (def.keywords?.includes("exhaust") || def.keywords?.includes("power")) exhaustInstance(c, ci);
        else c.discardPile.push(ci);
      }
      if (c.current?.cardUid === op.cardUid) c.current = undefined;
      return;
    }
    case "purge_self": {
      const i = c.limbo.findIndex((x) => x.uid === op.cardUid);
      if (i >= 0) exhaustInstance(c, c.limbo.splice(i, 1)[0]!);
      return;
    }
    case "phase":
      runPhase(state, op.name, op.enemyUid);
      return;
  }
}

function onKnowledgeUp(state: GameState, enemy: EnemyState, level: 1 | 2): void {
  const c = state.combat!;
  const def = diseaseDef(enemy.diseaseId);
  log(c, "diag", level === 2 ? `확진: ${def.nameKo}` : `감별: ${db().categories[def.category]} 질환으로 좁혀짐`);
  if (level === 2) fire(state, "knowledge_up", { targetUid: enemy.uid });
}

function execCustom(state: GameState, op: Extract<EffectOp, { op: "custom" }>, ctx: EffectCtx): void {
  const c = state.combat!;
  switch (op.id) {
    case "relic_flash":
      emit({ type: "relic_triggered", relicId: String(op.params?.relic ?? "") });
      return;
    case "partner_side_effect": {
      const partner = ctx.owner.cardId ? cardDef(ctx.owner.cardId) : undefined;
      const spec = partner?.drug?.sideEffects[0];
      if (spec) addGeneratedCard(state, spec.card, "discard");
      return;
    }
    case "random_discard": {
      if (c.hand.length === 0) return;
      const others = c.hand.filter((ci) => ci.uid !== ctx.owner.id);
      const pool = others.length ? others : c.hand;
      const pick = pickOne(c.rng.cardEffect, pool);
      c.hand.splice(c.hand.indexOf(pick), 1);
      c.discardPile.push(pick);
      log(c, "warn", `착란: ${cardDef(pick.cardId).nameKo}을(를) 떨어뜨렸다`);
      return;
    }
    case "draw_penalty":
      c.flags.nextDrawPenalty = (c.flags.nextDrawPenalty ?? 0) + Number(op.params?.n ?? 1);
      return;
    default:
      throw new Error(`unknown custom effect ${op.id}`);
  }
}

// ───────────────────────── 턴 흐름 ─────────────────────────

export function ordersPerTurn(state: GameState): number {
  return 3 + modifierValue(state, "ordersPerTurn").reduce((a, m) => a + m.delta, 0);
}

function runPhase(state: GameState, name: TurnPhase, enemyUid?: string): void {
  const c = state.combat!;
  switch (name) {
    case "combat_start":
      fire(state, "combat_start", { sources: ["relic", "enemy"] });
      return;
    case "player_turn_start": {
      c.turn += 1;
      c.flags.enemyPhase = 0;
      c.stability = 0;
      c.ordersPerTurn = ordersPerTurn(state);
      c.orders = c.ordersPerTurn;
      c.counters.cardsPlayedThisTurn = 0;
      c.counters.drugsPlayedThisTurn = 0;
      emit({ type: "turn_started", turn: c.turn });
      log(c, "turn", `${c.turn}턴`);
      enqueueFront(
        state,
        (
          [
            "delayed_tick",
            "drug_turn_start",
            "status_turn_start",
            "enemy_passive_turn_start",
            "tick_drugs",
            "turn_draw",
            "relic_turn_start",
          ] as TurnPhase[]
        ).map((p) => phaseOp(p)),
        SYSTEM,
      );
      return;
    }
    case "delayed_tick": {
      const due: QueuedEffect[] = [];
      for (const d of c.delayed) {
        d.turnsLeft -= 1;
        if (d.turnsLeft <= 0) for (const op of d.effects) due.push({ op, ctx: d.ctx });
      }
      c.delayed = c.delayed.filter((d) => d.turnsLeft > 0);
      if (due.length) c.queue.unshift(...due);
      return;
    }
    case "drug_turn_start":
      fire(state, "turn_start", { sources: ["drug"] });
      return;
    case "status_turn_start": {
      const ops: EffectOp[] = [];
      if (statusStacks(c.patientStatuses, "fatigue") > 0) {
        c.orders = Math.max(0, c.orders - 1);
        removeStatus(c.patientStatuses, "fatigue", "all");
        log(c, "warn", "피로: 오더 −1");
      }
      if (statusStacks(c.patientStatuses, "hypoxia") > 0) {
        c.orders = Math.max(0, c.orders - 1);
        removeStatus(c.patientStatuses, "hypoxia", 1);
        log(c, "warn", "저산소: 오더 −1");
      }
      const hypo = statusStacks(c.patientStatuses, "hypotension");
      if (hypo > 0) {
        if (drugTagActive(state, "vasopressor")) log(c, "info", "저혈압: 승압제로 유지됨");
        else {
          ops.push({ op: "lose_vitality", amount: hypo });
          log(c, "warn", `저혈압: 활력 −${hypo}`);
        }
      }
      if (statusStacks(c.patientStatuses, "bleeding_tendency") > 0) {
        if (drugTagActive(state, "anticoagulant") && drugTagActive(state, "antiplatelet")) {
          ops.push({ op: "lose_vitality", amount: 2 });
          log(c, "warn", "출혈 경향: 활력 −2");
        } else removeStatus(c.patientStatuses, "bleeding_tendency", "all");
      }
      if (ops.length) enqueueFront(state, ops, { owner: { kind: "status", id: "patient" } });
      return;
    }
    case "enemy_passive_turn_start":
      fire(state, "turn_start", { sources: ["enemy"] });
      return;
    case "tick_drugs":
      tickDrugs(state);
      return;
    case "turn_draw": {
      const penalty = c.flags.nextDrawPenalty ?? 0;
      c.flags.nextDrawPenalty = 0;
      drawCards(state, Math.max(0, 5 - penalty));
      return;
    }
    case "relic_turn_start":
      fire(state, "turn_start", { sources: ["relic"] });
      return;
    case "end_turn_hand":
      fire(state, "turn_end", { sources: ["relic", "hand"] });
      return;
    case "end_turn_discard": {
      for (const ci of [...c.hand]) {
        const def = cardDef(ci.cardId, ci.upgraded);
        if (def.keywords?.includes("ethereal")) {
          c.hand.splice(c.hand.indexOf(ci), 1);
          exhaustInstance(c, ci);
        }
      }
      const keep: CardInstance[] = [];
      for (const ci of c.hand) {
        const def = cardDef(ci.cardId, ci.upgraded);
        const retain = def.keywords?.includes("retain") || ci.retainThisTurn || !!c.flags.retainAll;
        ci.costZeroThisTurn = false;
        ci.retainThisTurn = false;
        if (retain) keep.push(ci);
        else c.discardPile.push(ci);
      }
      c.hand = keep;
      c.flags.retainAll = 0;
      c.costModifiers = c.costModifiers.filter((m) => m.scope === "combat");
      for (const e of c.enemies) e.revealNext = false;
      c.flags.enemyPhase = 1;
      return;
    }
    case "enemy_turns": {
      const ops: EffectOp[] = livingEnemies(c).map((e) => phaseOp("enemy_act", e.uid));
      ops.push(phaseOp("round_end"), phaseOp("player_turn_start"));
      enqueueFront(state, ops, SYSTEM);
      return;
    }
    case "enemy_act": {
      const e = findEnemy(c, enemyUid);
      if (!e || e.cured) return;
      e.stability = 0;
      const ectx: EffectCtx = { owner: { kind: "enemy", id: e.uid } };
      const queued: QueuedEffect[] = [];
      for (const cd of e.countdowns) cd.turnsLeft -= 1;
      const due = e.countdowns.filter((cd) => cd.turnsLeft <= 0);
      e.countdowns = e.countdowns.filter((cd) => cd.turnsLeft > 0);
      for (const cd of due) {
        const mv = findMove(e, cd.moveId);
        emit({ type: "countdown_fired", target: e.uid, moveId: cd.moveId });
        log(c, "enemy", `${diseaseLabel(e)}: ${mv.nameKo}!`);
        for (const x of mv.effects) queued.push({ op: x, ctx: ectx });
      }
      const planned = e.ai.planned.shift();
      if (planned) {
        e.ai.history.push(planned.moveId);
        const mv = findMove(e, planned.moveId);
        emit({ type: "enemy_move", target: e.uid, moveId: mv.id, name: mv.nameKo });
        log(c, "enemy", `${diseaseLabel(e)}: ${mv.nameKo}`);
        for (const x of mv.effects) {
          const opx = x.op === "damage" && planned.hits !== undefined ? { ...x, hits: planned.hits } : x;
          queued.push({ op: opx, ctx: ectx });
        }
      }
      queued.push({ op: phaseOp("enemy_turn_end", e.uid), ctx: SYSTEM });
      c.queue.unshift(...queued);
      return;
    }
    case "enemy_turn_end": {
      const e = findEnemy(c, enemyUid);
      if (!e || e.cured) return;
      const infl = statusStacks(e.statuses, "inflammation");
      if (infl > 0) {
        const before = e.severity;
        e.severity = Math.min(e.maxSeverity, e.severity + infl);
        if (e.severity > before) emit({ type: "healed", target: e.uid, amount: e.severity - before });
        removeStatus(e.statuses, "inflammation", 1);
      }
      fire(state, "enemy_turn_end", { sources: ["enemy"], enemyUid: e.uid });
      return;
    }
    case "round_end": {
      const decay = (list: typeof c.patientStatuses) => {
        for (const s of [...list]) {
          const def = statusDef(s.id);
          if (def.decay !== "round_end") continue;
          if (s.fresh) {
            s.fresh = false;
            continue;
          }
          s.stacks -= 1;
          if (s.stacks <= 0) list.splice(list.indexOf(s), 1);
        }
      };
      decay(c.patientStatuses);
      for (const e of c.enemies) decay(e.statuses);
      // 적 턴 단계 표시가 켜진 채로 계획해야 실행 턴이 다음 턴으로 계산된다
      for (const e of livingEnemies(c)) planIntents(state, e);
      c.flags.enemyPhase = 0;
      return;
    }
  }
}

export function relicName(id: string): string {
  return relicDef(id).nameKo;
}

export { clamp, hasRelic };
