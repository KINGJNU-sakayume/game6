// 카드 더미 조작, 비용 계산.
import { cardDef } from "./registry";
import { randInt, shuffleInPlace } from "./rng";
import { fire } from "./triggers";
import { HAND_LIMIT, emit, log, modifierValue, newUid } from "./util";
import type { CardDef, CardFilter, CardInstance, CombatState, GameState, Pile, Uid } from "./types";

export function matchesFilter(def: CardDef, filter: CardFilter): boolean {
  if (filter.kind && !filter.kind.includes(def.kind)) return false;
  if (filter.ids && !filter.ids.includes(def.id)) return false;
  if (filter.tags && !filter.tags.some((t) => def.tags.includes(t))) return false;
  if (filter.sideEffect !== undefined && (def.kind === "side_effect") !== filter.sideEffect) return false;
  return true;
}

export function pileOf(c: CombatState, pile: Pile): CardInstance[] {
  return pile === "hand" ? c.hand : pile === "draw" ? c.drawPile : c.discardPile;
}

export function removeFromPiles(c: CombatState, uid: Uid): CardInstance | undefined {
  for (const pile of [c.hand, c.drawPile, c.discardPile, c.limbo, c.exhaustPile]) {
    const i = pile.findIndex((ci) => ci.uid === uid);
    if (i >= 0) return pile.splice(i, 1)[0];
  }
  return undefined;
}

export function exhaustInstance(c: CombatState, ci: CardInstance): void {
  ci.costZeroThisTurn = false;
  ci.retainThisTurn = false;
  c.exhaustPile.push(ci);
  emit({ type: "exhausted", uid: ci.uid, cardId: ci.cardId });
}

/** 뽑기. 뽑을 더미가 비면 버린 더미를 섞는다. 손이 가득 차면 뽑은 카드는 버린 더미로. */
export function drawCards(state: GameState, n: number): Uid[] {
  const c = state.combat!;
  const drawn: Uid[] = [];
  for (let i = 0; i < n; i++) {
    if (c.drawPile.length === 0) {
      if (c.discardPile.length === 0) break;
      c.drawPile.push(...c.discardPile.splice(0));
      shuffleInPlace(c.rng.shuffle, c.drawPile);
      emit({ type: "shuffle" });
    }
    const ci = c.drawPile.shift();
    if (!ci) break;
    if (c.hand.length >= HAND_LIMIT) {
      c.discardPile.push(ci);
      continue;
    }
    c.hand.push(ci);
    drawn.push(ci.uid);
    emit({ type: "card_drawn", uid: ci.uid, cardId: ci.cardId });
  }
  // 뽑을 때 발동(on_draw)은 뽑기가 끝난 뒤, 뽑은 순서대로
  for (let i = drawn.length - 1; i >= 0; i--) fire(state, "card_drawn", { sources: ["hand"], drawnUid: drawn[i] });
  return drawn;
}

export function createInstance(state: GameState, cardId: string, temp: boolean, upgraded = false): CardInstance {
  const ci: CardInstance = { uid: newUid(state), cardId, upgraded };
  if (temp) ci.temp = true;
  return ci;
}

export function addCardTo(state: GameState, ci: CardInstance, dest: "hand" | "discard" | "draw_random" | "draw_top"): void {
  const c = state.combat!;
  if (dest === "hand") {
    if (c.hand.length >= HAND_LIMIT) c.discardPile.push(ci);
    else c.hand.push(ci);
  } else if (dest === "discard") c.discardPile.push(ci);
  else if (dest === "draw_top") c.drawPile.unshift(ci);
  else {
    const pos = randInt(c.rng.cardEffect, c.drawPile.length + 1);
    c.drawPile.splice(pos, 0, ci);
  }
}

/** 부작용·질병 카드 추가. 지속 부작용이면 런 덱에도 1장 넣는다. */
export function addGeneratedCard(state: GameState, cardId: string, dest: "hand" | "discard" | "draw_random", costZero = false, upgraded = false): void {
  const c = state.combat!;
  const def = cardDef(cardId);
  const ci = createInstance(state, cardId, true, upgraded);
  if (costZero) ci.costZeroThisTurn = true;
  addCardTo(state, ci, dest);
  if (def.kind === "side_effect") {
    state.run.stats.sideEffectsGained += 1;
    emit({ type: "side_effect_added", cardId, dest });
    const where = dest === "hand" ? "손" : dest === "discard" ? "완료 처방" : "대기 처방";
    log(c, "warn", `${def.nameKo} 카드가 ${where}에 들어왔다`);
    if (def.sideEffect?.persistent) {
      state.run.deck.push({ uid: newUid(state), cardId, upgraded: false });
      log(c, "warn", `${def.nameKo}은(는) 지속 부작용이다. 처방 목록에 남는다`);
    }
  } else if (dest === "hand") {
    log(c, "info", `${def.nameKo}${upgraded ? "+" : ""} 카드를 손에 넣었다`);
  }
}

/** 손패 카드의 현재 비용. 사용 불가면 null. */
export function costOf(state: GameState, ci: CardInstance): number | null {
  const c = state.combat;
  const def = cardDef(ci.cardId, ci.upgraded);
  if (def.cost === "unplayable") {
    return def.sideEffect?.purgeCost ?? null;
  }
  if (ci.costZeroThisTurn) return 0;
  let cost = def.cost;
  if (c) {
    for (const m of c.costModifiers) if (m.uses > 0 && matchesFilter(def, m.filter)) cost += m.delta;
    if (def.tags.includes("abx")) {
      const dys = c.hand.filter((h) => cardDef(h.cardId).sideEffect?.passive === "abx_cost_up").length;
      cost += dys;
    }
  }
  return Math.max(0, cost);
}

/** 카드를 낼 때 적용된 비용 수정자의 사용 횟수를 줄인다. */
export function consumeCostModifiers(state: GameState, ci: CardInstance): void {
  const c = state.combat!;
  const def = cardDef(ci.cardId, ci.upgraded);
  if (ci.costZeroThisTurn || def.cost === "unplayable") return;
  for (const m of c.costModifiers) if (m.uses > 0 && matchesFilter(def, m.filter)) m.uses -= 1;
  c.costModifiers = c.costModifiers.filter((m) => m.uses > 0);
}

export function maxCardsPerTurn(state: GameState): number {
  const mods = modifierValue(state, "maxCardsPerTurn");
  return mods.length ? Math.min(...mods.map((m) => m.value)) : Infinity;
}
