// 런 구조: 시작, 지도 이동, 보상, 상점, 당직실, 이벤트, 막 전환. design.md D7
import { cardDef, db, diseaseDef, encounterDef, eventDef, hasCard, quizDef, relicDef } from "./registry";
import { startCombat } from "./combat";
import { actFloors, generateMap } from "./map";
import { deriveStream, pickOne, pickWeighted, randInt, randRange, shuffleInPlace } from "./rng";
import { emit, hasRelic, modifierValue, newUid } from "./util";
import type {
  CardId,
  CardInstance,
  EncounterDef,
  GameState,
  NodeType,
  Rarity,
  RelicId,
  RewardItem,
  RewardState,
  RunOp,
  RunRngStream,
  Uid,
} from "./types";

const RUN_STREAMS: RunRngStream[] = ["map", "encounter", "reward", "shop", "event", "relic", "profile"];
const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "홍"];

export const START_VITALITY = 70;
export const START_GOLD = 99;

export interface RunOptions {
  deck?: CardId[];
  relics?: RelicId[];
}

export function newRun(seed: string, options: RunOptions = {}): GameState {
  const rng = Object.fromEntries(RUN_STREAMS.map((s) => [s, deriveStream(`${seed}:${s}`)])) as GameState["rng"];
  const state: GameState = {
    schemaVersion: 2,
    seed,
    rng,
    phase: "map",
    run: {
      act: 1,
      floor: 0,
      map: generateMap(rng.map, 1),
      vitality: START_VITALITY,
      maxVitality: START_VITALITY,
      gold: START_GOLD,
      deck: [],
      relics: [],
      casebook: {},
      rarePity: 0,
      shopRemovalCount: 0,
      combatsThisAct: 0,
      patient: {
        surname: pickOne(rng.profile, SURNAMES),
        age: randRange(rng.profile, 52, 74),
        sex: randInt(rng.profile, 2) === 0 ? "M" : "F",
      },
      flags: {},
      stats: {
        combatsWon: 0,
        damageTaken: 0,
        cardsPlayed: 0,
        sideEffectsGained: 0,
        interactions: {},
        diseasesCured: [],
        diagnosesConfirmed: 0,
        harmfulTreatments: 0,
        floorsClimbed: 0,
      },
      seenEvents: [],
    },
    nextUid: 1,
    actionCount: 0,
  };
  const deck = options.deck ?? db().starterDeck;
  state.run.deck = deck.map((id) => ({ uid: newUid(state), cardId: id, upgraded: false }));
  state.run.relics = (options.relics ?? [db().starterRelic]).map((id) => ({ id }));
  return state;
}

// ───────────────────────── 지도 ─────────────────────────

export function availableNodes(state: GameState): string[] {
  const map = state.run.map;
  if (!state.run.currentNode) return Object.values(map.nodes).filter((n) => n.floor === 1).map((n) => n.id);
  return map.nodes[state.run.currentNode]?.next ?? [];
}

export function moveMap(state: GameState, nodeId: string): string | null {
  if (state.phase !== "map") return "지도 화면이 아니다";
  if (!availableNodes(state).includes(nodeId)) return "갈 수 없는 곳";
  const node = state.run.map.nodes[nodeId]!;
  state.run.currentNode = nodeId;
  state.run.floor = node.floor;
  state.run.map.visited.push(nodeId);
  state.run.stats.floorsClimbed += 1;
  enterNode(state, node.type);
  return null;
}

function encounterPool(state: GameState, pool: EncounterDef["pool"]): EncounterDef[] {
  return db().encounters.filter((e) => e.act === state.run.act && e.pool === pool);
}

function enterNode(state: GameState, type: NodeType): void {
  const run = state.run;
  state.run.restDone = false;
  switch (type) {
    case "battle": {
      const pool = encounterPool(state, run.combatsThisAct < 2 ? "easy" : "normal");
      const options = pool.filter((e) => e.id !== run.lastEncounter);
      const enc = pickOne(state.rng.encounter, options.length ? options : pool);
      run.lastEncounter = enc.id;
      startCombat(state, enc.id, "normal");
      return;
    }
    case "elite": {
      const pool = encounterPool(state, "elite");
      const options = pool.filter((e) => e.id !== run.lastElite);
      const enc = pickOne(state.rng.encounter, options.length ? options : pool);
      run.lastElite = enc.id;
      startCombat(state, enc.id, "elite");
      return;
    }
    case "boss": {
      const pool = encounterPool(state, run.act === 2 ? "gate" : "boss");
      const enc = pool[0]!;
      startCombat(state, enc.id, run.act === 2 ? "gate" : "boss");
      return;
    }
    case "rest":
      state.phase = "rest";
      return;
    case "shop":
      generateShop(state);
      state.phase = "shop";
      return;
    case "treasure": {
      const relic = rollRelic(state, "treasure");
      state.reward = { source: "treasure", items: relic ? [{ kind: "relic", relicId: relic, taken: false }] : [{ kind: "gold", amount: 50, taken: false }] };
      state.phase = "reward";
      emit({ type: "reward_offered" });
      return;
    }
    case "event":
      startEvent(state);
      return;
  }
}

// ───────────────────────── 보상 ─────────────────────────

function rewardPool(rarity: Rarity): CardId[] {
  return db()
    .cards.filter((c) => c.rarity === rarity && c.kind !== "side_effect")
    .map((c) => c.id);
}

function rollRarity(state: GameState, source: RewardState["source"] | "shop"): Rarity {
  const r = state.rng.reward;
  if (source === "boss" || source === "gate") return "rare";
  if (source === "shop") return pickWeighted(state.rng.shop, [["common", 50], ["uncommon", 38], ["rare", 12]] as const);
  if (source === "elite") {
    const p = Math.min(30, state.run.rarePity);
    return pickWeighted(r, [["common", 50 - p], ["uncommon", 40], ["rare", 10 + p]] as const);
  }
  const p = Math.min(37, state.run.rarePity);
  return pickWeighted(r, [["common", 60 - p], ["uncommon", 37], ["rare", 3 + p]] as const);
}

export function generateCardChoices(state: GameState, source: RewardState["source"]): CardId[] {
  const choicesMod = modifierValue(state, "cardRewardChoices");
  const n = choicesMod.length ? Math.min(...choicesMod.map((m) => m.value)) : 3;
  const out: CardId[] = [];
  for (let i = 0; i < n; i++) {
    const rarity = rollRarity(state, source);
    if (source === "normal" || source === "elite") {
      if (rarity === "rare") state.run.rarePity = 0;
      else if (rarity === "common") state.run.rarePity += 1;
    }
    const pool = rewardPool(rarity).filter((id) => !out.includes(id));
    if (!pool.length) continue;
    out.push(pickOne(state.rng.reward, pool));
  }
  return out;
}

function ownedRelics(state: GameState): Set<RelicId> {
  return new Set(state.run.relics.map((r) => r.id));
}

export function rollRelic(state: GameState, _why: "elite" | "treasure" | "shop" | "event", tier?: "common" | "uncommon"): RelicId | undefined {
  const owned = ownedRelics(state);
  const rng = state.rng.relic;
  const pickTier = tier ?? pickWeighted(rng, [["common", 60], ["uncommon", 40]] as const);
  let pool = db().relics.filter((r) => r.tier === pickTier && !owned.has(r.id));
  if (!pool.length) pool = db().relics.filter((r) => (r.tier === "common" || r.tier === "uncommon") && !owned.has(r.id));
  if (!pool.length) return undefined;
  return pickOne(rng, pool).id;
}

export function gainRelic(state: GameState, id: RelicId): void {
  if (state.run.relics.some((r) => r.id === id)) return;
  state.run.relics.push({ id });
  emit({ type: "relic_gained", relicId: id });
}

export function gainCard(state: GameState, cardId: CardId, upgraded = false): void {
  state.run.deck.push({ uid: newUid(state), cardId, upgraded });
  emit({ type: "card_gained", cardId });
}

/** 전투 승리 후 보상 단계로 */
export function finishCombatVictory(state: GameState): void {
  const c = state.combat!;
  const kind = c.kind;
  // 전투 종료 트리거(유물)
  if (hasRelic(state, "fluid_protocol") && (c.counters.fluidsGiven ?? 0) > 0) {
    const before = state.run.vitality;
    state.run.vitality = Math.min(state.run.maxVitality, state.run.vitality + 3);
    emit({ type: "healed", target: "patient", amount: state.run.vitality - before });
    emit({ type: "relic_triggered", relicId: "fluid_protocol" });
  }
  state.run.stats.combatsWon += 1;
  state.run.combatsThisAct += 1;
  emit({ type: "combat_won" });
  state.combat = undefined;
  state.pending = undefined;
  if (kind === "boss" && state.run.act === 3) {
    state.phase = "victory";
    return;
  }
  const r = state.rng.reward;
  const items: RewardItem[] = [];
  const gold = kind === "normal" ? randRange(r, 10, 20) : kind === "elite" ? randRange(r, 25, 35) : kind === "gate" ? 60 : 70;
  items.push({ kind: "gold", amount: gold, taken: false });
  const source: RewardState["source"] = kind;
  items.push({ kind: "card", options: generateCardChoices(state, source), taken: false });
  if (kind === "elite") {
    const relic = rollRelic(state, "elite");
    if (relic) items.push({ kind: "relic", relicId: relic, taken: false });
  }
  state.reward = { source, items };
  state.phase = "reward";
  emit({ type: "reward_offered" });
}

export function claimReward(state: GameState, index: number, choice?: number): string | null {
  if (state.phase !== "reward" || !state.reward) return "보상 화면이 아니다";
  const item = state.reward.items[index];
  if (!item || item.taken) return "받을 수 없는 보상";
  if (item.kind === "gold") {
    state.run.gold += item.amount;
    emit({ type: "gold_changed", amount: item.amount });
  } else if (item.kind === "relic") gainRelic(state, item.relicId);
  else {
    const id = item.options[choice ?? -1];
    if (!id) return "카드를 골라야 한다";
    gainCard(state, id);
  }
  item.taken = true;
  return null;
}

export function skipReward(state: GameState, index: number): string | null {
  if (state.phase !== "reward" || !state.reward) return "보상 화면이 아니다";
  const item = state.reward.items[index];
  if (!item || item.taken) return "건너뛸 수 없다";
  item.taken = true;
  return null;
}

function rollBossRelics(state: GameState): RelicId[] {
  const owned = ownedRelics(state);
  const pool = db()
    .relics.filter((r) => r.tier === "boss" && !owned.has(r.id))
    .map((r) => r.id);
  shuffleInPlace(state.rng.relic, pool);
  return pool.slice(0, 3);
}

export function leaveReward(state: GameState): void {
  const src = state.reward?.source;
  state.reward = undefined;
  if (src === "boss" || src === "gate") {
    const options = rollBossRelics(state);
    if (options.length) {
      state.bossRelic = options;
      state.phase = "boss_relic";
      return;
    }
    advanceAct(state);
    return;
  }
  state.phase = "map";
}

export function pickBossRelic(state: GameState, index: number): string | null {
  if (state.phase !== "boss_relic" || !state.bossRelic) return "보스 유물 선택이 아니다";
  if (index >= 0) {
    const id = state.bossRelic[index];
    if (!id) return "없는 선택지";
    gainRelic(state, id);
  }
  state.bossRelic = undefined;
  advanceAct(state);
  return null;
}

export function advanceAct(state: GameState): void {
  const run = state.run;
  if (run.act >= 3) {
    state.phase = "victory";
    return;
  }
  run.act = (run.act + 1) as 2 | 3;
  run.floor = 0;
  run.currentNode = undefined;
  run.map = generateMap(state.rng.map, run.act);
  run.combatsThisAct = 0;
  run.lastEncounter = undefined;
  run.lastElite = undefined;
  const heal = Math.floor((run.maxVitality * 30) / 100);
  run.vitality = Math.min(run.maxVitality, run.vitality + heal);
  state.phase = "map";
  emit({ type: "act_changed", act: run.act });
}

// ───────────────────────── 상점 ─────────────────────────

const BASE_PRICE: Record<string, number> = { common: 50, uncommon: 75, rare: 150 };

function generateShop(state: GameState): void {
  const s = state.rng.shop;
  const cards: { slot: string; cardId: CardId; price: number; sold: boolean }[] = [];
  const taken = new Set<CardId>();
  for (let i = 0; i < 5; i++) {
    const rarity = rollRarity(state, "shop");
    const pool = rewardPool(rarity).filter((id) => !taken.has(id));
    if (!pool.length) continue;
    const id = pickOne(s, pool);
    taken.add(id);
    const base = BASE_PRICE[rarity] ?? 60;
    cards.push({ slot: `c${i}`, cardId: id, price: Math.floor((base * randRange(s, 90, 110)) / 100), sold: false });
  }
  const relics: { slot: string; relicId: RelicId; price: number; sold: boolean }[] = [];
  const owned = ownedRelics(state);
  for (let i = 0; i < 2; i++) {
    const tier = pickWeighted(s, [["common", 60], ["uncommon", 40]] as const);
    const pool = db().relics.filter((r) => r.tier === tier && !owned.has(r.id) && !relics.some((x) => x.relicId === r.id));
    if (!pool.length) continue;
    const r = pickOne(s, pool);
    relics.push({ slot: `r${i}`, relicId: r.id, price: randRange(s, 150, 250), sold: false });
  }
  state.shop = { cards, relics, removalPrice: 75 + 25 * state.run.shopRemovalCount, removalUsed: false };
}

export function shopBuy(state: GameState, slot: string): string | null {
  if (state.phase !== "shop" || !state.shop) return "약제부가 아니다";
  const card = state.shop.cards.find((c) => c.slot === slot);
  const relic = state.shop.relics.find((r) => r.slot === slot);
  const item = card ?? relic;
  if (!item || item.sold) return "살 수 없다";
  if (state.run.gold < item.price) return "예산이 부족하다";
  state.run.gold -= item.price;
  emit({ type: "gold_changed", amount: -item.price });
  item.sold = true;
  if (card) gainCard(state, card.cardId);
  if (relic) gainRelic(state, relic.relicId);
  return null;
}

export function shopRemove(state: GameState): string | null {
  if (state.phase !== "shop" || !state.shop) return "약제부가 아니다";
  if (state.shop.removalUsed) return "이미 사용했다";
  if (state.run.gold < state.shop.removalPrice) return "예산이 부족하다";
  if (state.run.deck.length === 0) return "제거할 카드가 없다";
  state.pending = {
    kind: "deck_select",
    purpose: "shop_remove",
    candidates: state.run.deck.map((c) => c.uid),
    min: 0,
    max: 1,
    prompt: `처방 목록에서 뺄 카드 1장 (예산 ${state.shop.removalPrice})`,
  };
  return null;
}

// ───────────────────────── 당직실 ─────────────────────────

export function restChoose(state: GameState, option: "rest" | "upgrade" | "purge"): string | null {
  if (state.phase !== "rest") return "당직실이 아니다";
  if (state.run.restDone) return "이미 선택했다";
  if (option === "rest") {
    if (modifierValue(state, "noRestHeal").length) return "중환자실 입실 중에는 휴식할 수 없다";
    const heal = Math.floor((state.run.maxVitality * 30) / 100);
    const before = state.run.vitality;
    state.run.vitality = Math.min(state.run.maxVitality, state.run.vitality + heal);
    emit({ type: "healed", target: "patient", amount: state.run.vitality - before });
    state.run.restDone = true;
    return null;
  }
  if (option === "upgrade") {
    const cands = upgradableCards(state);
    if (!cands.length) return "업그레이드할 카드가 없다";
    state.pending = { kind: "deck_select", purpose: "upgrade", candidates: cands, min: 0, max: 1, prompt: "최적화할 처방 1장" };
    return null;
  }
  const cands = state.run.deck.filter((c) => cardDef(c.cardId).kind === "side_effect").map((c) => c.uid);
  if (!cands.length) return "정리할 지속 부작용이 없다";
  state.pending = { kind: "deck_select", purpose: "purge", candidates: cands, min: 0, max: 1, prompt: "정리할 지속 부작용 1장" };
  return null;
}

function upgradableCards(state: GameState): Uid[] {
  return state.run.deck
    .filter((c) => !c.upgraded && cardDef(c.cardId).kind !== "side_effect" && hasUpgrade(c.cardId))
    .map((c) => c.uid);
}

function hasUpgrade(id: CardId): boolean {
  const u = cardDef(id).upgrade;
  return u.cost !== undefined || !!u.effects || !!u.keywords || !!u.drug;
}

export function resolveDeckSelection(state: GameState, uids: Uid[]): string | null {
  const p = state.pending;
  if (!p || p.kind !== "deck_select") return "선택할 것이 없다";
  const uniq = [...new Set(uids)];
  if (uniq.length === 0 && p.min === 0) {
    // 아무것도 고르지 않으면 취소 (당직실은 다시 고를 수 있고, 상점은 비용을 내지 않는다)
    state.pending = undefined;
    return null;
  }
  if (uniq.length < p.min || uniq.length > p.max) return `${p.min}~${p.max}장을 골라야 한다`;
  if (!uniq.every((u) => p.candidates.includes(u))) return "고를 수 없는 카드";
  const deck = state.run.deck;
  switch (p.purpose) {
    case "upgrade":
      for (const u of uniq) {
        const ci = deck.find((c) => c.uid === u);
        if (ci) {
          ci.upgraded = true;
          emit({ type: "card_upgraded", cardId: ci.cardId });
        }
      }
      if (state.phase === "rest") state.run.restDone = true;
      break;
    case "remove":
    case "purge":
      state.run.deck = deck.filter((c) => {
        if (!uniq.includes(c.uid)) return true;
        emit({ type: "card_removed", cardId: c.cardId });
        return false;
      });
      if (state.phase === "rest") state.run.restDone = true;
      break;
    case "shop_remove": {
      const price = state.shop?.removalPrice ?? 0;
      state.run.deck = deck.filter((c) => {
        if (!uniq.includes(c.uid)) return true;
        emit({ type: "card_removed", cardId: c.cardId });
        return false;
      });
      state.run.gold -= price;
      emit({ type: "gold_changed", amount: -price });
      state.run.shopRemovalCount += 1;
      if (state.shop) state.shop.removalUsed = true;
      break;
    }
  }
  state.pending = undefined;
  return null;
}

// ───────────────────────── 이벤트 ─────────────────────────

function startEvent(state: GameState): void {
  const all = db().events;
  const unseen = all.filter((e) => !state.run.seenEvents.includes(e.id));
  const ev = pickOne(state.rng.event, unseen.length ? unseen : all);
  state.run.seenEvents.push(ev.id);
  state.event = { eventId: ev.id };
  if (ev.quiz) {
    const q = pickOne(state.rng.event, db().quiz);
    const order = q.options.map((_, i) => i);
    shuffleInPlace(state.rng.event, order);
    state.event.quiz = { questionId: q.id, order };
  }
  state.phase = "event";
}

export function eventChoose(state: GameState, optionId: string): string | null {
  if (state.phase !== "event" || !state.event) return "이벤트가 아니다";
  if (state.event.resolved) return "이미 선택했다";
  const ev = eventDef(state.event.eventId);
  if (ev.quiz && state.event.quiz) {
    const shown = Number(optionId.replace("q", ""));
    const q = quizDef(state.event.quiz.questionId);
    const picked = state.event.quiz.order[shown];
    if (picked === undefined) return "없는 선택지";
    const correct = picked === q.answer;
    if (correct) {
      applyRunOps(state, [
        { op: "gain_gold", amount: 40 },
        { op: "upgrade_random", count: 1 },
      ]);
    }
    state.event.resolved = { optionId, text: q.explanation, correct };
    return null;
  }
  const opt = ev.options.find((o) => o.id === optionId);
  if (!opt) return "없는 선택지";
  if (opt.requires?.goldAtLeast !== undefined && state.run.gold < opt.requires.goldAtLeast) return "예산이 부족하다";
  applyRunOps(state, opt.ops);
  state.event.resolved = { optionId, text: opt.result };
  return null;
}

export function applyRunOps(state: GameState, ops: RunOp[]): void {
  const run = state.run;
  const rng = state.rng.event;
  for (const op of ops) {
    switch (op.op) {
      case "gain_gold":
        run.gold += op.amount;
        emit({ type: "gold_changed", amount: op.amount });
        break;
      case "lose_gold":
        run.gold = Math.max(0, run.gold - op.amount);
        emit({ type: "gold_changed", amount: -op.amount });
        break;
      case "heal": {
        const before = run.vitality;
        run.vitality = Math.min(run.maxVitality, run.vitality + op.amount);
        emit({ type: "healed", target: "patient", amount: run.vitality - before });
        break;
      }
      case "lose_vitality":
        run.vitality = Math.max(1, run.vitality - op.amount);
        break;
      case "gain_random_card": {
        const pool = db().cards.filter((c) => c.rarity === op.rarity && (!op.kind || c.kind === op.kind));
        if (pool.length) gainCard(state, pickOne(rng, pool).id);
        break;
      }
      case "gain_random_relic": {
        const id = rollRelic(state, "event", op.tier);
        if (id) gainRelic(state, id);
        break;
      }
      case "upgrade_random": {
        const cands = run.deck.filter(
          (c) => !c.upgraded && cardDef(c.cardId).kind !== "side_effect" && hasUpgrade(c.cardId) && (!op.kind || cardDef(c.cardId).kind === op.kind),
        );
        shuffleInPlace(rng, cands);
        for (const ci of cands.slice(0, op.count)) {
          ci.upgraded = true;
          emit({ type: "card_upgraded", cardId: ci.cardId });
        }
        break;
      }
      case "deck_select": {
        const cands = op.purpose === "upgrade" ? upgradableCards(state) : run.deck.map((c) => c.uid);
        if (!cands.length) break;
        state.pending = {
          kind: "deck_select",
          purpose: op.purpose,
          candidates: cands,
          min: 0,
          max: Math.min(op.max, cands.length),
          prompt: op.prompt,
        };
        break;
      }
      case "set_flag":
        run.flags[op.flag] = op.value;
        break;
    }
  }
}

export function leaveRoom(state: GameState): string | null {
  if (state.pending) return "선택을 먼저 마쳐야 한다";
  switch (state.phase) {
    case "reward":
      leaveReward(state);
      return null;
    case "shop":
      state.shop = undefined;
      state.phase = "map";
      return null;
    case "rest":
      state.phase = "map";
      return null;
    case "event":
      if (!state.event?.resolved) return "선택지를 먼저 골라야 한다";
      state.event = undefined;
      state.phase = "map";
      return null;
    case "boss_relic":
      return pickBossRelic(state, -1);
    default:
      return "떠날 수 없다";
  }
}

export function upgradeTarget(ci: CardInstance): boolean {
  return !ci.upgraded && hasCard(ci.cardId) && hasUpgrade(ci.cardId);
}

export function diseaseName(id: string): string {
  return diseaseDef(id).nameKo;
}

export function encounterTitle(id: string): string {
  return encounterDef(id).title ?? "";
}

export function relicName(id: string): string {
  return relicDef(id).nameKo;
}
