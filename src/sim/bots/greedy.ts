// 탐욕 봇: 한 턴 안의 카드 사용 순서를 깊이 우선으로 탐색한다. design.md D8
// 탐색은 지도를 떼어 낸 가벼운 상태로 한다 (R38).
import { cardBudget, cardDef, db, diseaseDef, eventDef, legalActions, step, visibleEnemyInfo } from "../../core";
import { gradeFor } from "../../core/damage";
import { deriveStream, randInt } from "../../core/rng";
import type { Action, CardId, GameState, MapState, RngState } from "../../core";

const EMPTY_MAP: MapState = { act: 1, floors: 0, nodes: {}, bossId: "boss", visited: [] };

interface Snapshot {
  severity: number;
  cured: number;
  diag: number;
  sideEffects: number;
  vitality: number;
}

function snap(s: GameState): Snapshot {
  const c = s.combat;
  return {
    severity: c ? c.enemies.reduce((a, e) => a + (e.cured ? 0 : e.severity), 0) : 0,
    cured: c ? c.enemies.filter((e) => e.cured).length : 0,
    diag: c ? c.enemies.reduce((a, e) => a + e.diagnosisPoints, 0) : 0,
    sideEffects: s.run.stats.sideEffectsGained,
    vitality: s.run.vitality,
  };
}

function incomingDamage(s: GameState): number {
  const c = s.combat;
  if (!c) return 0;
  let total = 0;
  for (const e of c.enemies) {
    if (e.cured) continue;
    const v = visibleEnemyInfo(s, e.uid);
    const first = v?.intents[0];
    for (const p of first?.parts ?? []) if (p.kind === "attack") total += (p.value ?? 0) * (p.hits ?? 1);
    for (const cd of e.countdowns) if (cd.turnsLeft === 1) total += 15;
  }
  return total;
}

function score(start: Snapshot, s: GameState): number {
  if (s.phase === "gameover") return -100000;
  if (s.phase !== "combat") return 100000 + s.run.vitality * 10; // 전투 승리
  const end = snap(s);
  const dS = start.severity - end.severity;
  const I = incomingDamage(s);
  const B = s.combat!.stability;
  const L = Math.max(0, I - B);
  const K = end.sideEffects - start.sideEffects;
  const D = end.diag - start.diag;
  const W = end.cured - start.cured;
  const vitLoss = start.vitality - end.vitality;
  return dS - 2 * L - 3 * K + 2 * D + 20 * W - 2 * vitLoss;
}

function resolvePending(s: GameState): GameState {
  let cur = s;
  let guard = 0;
  while (cur.pending && guard++ < 10) {
    const p = cur.pending;
    const uids = p.candidates.slice(0, Math.max(p.min, p.kind === "select_cards" && p.min === 0 ? Math.min(1, p.max) : p.min));
    cur = step(cur, { type: "choose_cards", uids }).state;
  }
  return cur;
}

export class GreedyBot {
  private rng: RngState;
  nodeCap: number;
  constructor(seed: string, nodeCap = 400) {
    this.rng = deriveStream(`${seed}:sim-greedy`);
    this.nodeCap = nodeCap;
  }

  private bestCombatAction(state: GameState): Action {
    const lean: GameState = { ...state, run: { ...state.run, map: EMPTY_MAP } };
    const start = snap(lean);
    let nodes = 0;
    let best = { score: -Infinity, first: { type: "end_turn" } as Action };
    const dfs = (s: GameState, first: Action | null, depth: number) => {
      nodes++;
      // 이 상태에서 턴을 끝내는 경우의 점수
      const sc = score(start, s);
      if (sc > best.score) best = { score: sc, first: first ?? { type: "end_turn" } };
      if (s.phase !== "combat" || nodes >= this.nodeCap || depth > 10) return;
      const acts = legalActions(s).filter((a) => a.type === "play_card");
      // 같은 카드 종류는 한 번만 시도
      const seen = new Set<string>();
      for (const a of acts) {
        if (a.type !== "play_card") continue;
        const ci = s.combat!.hand.find((h) => h.uid === a.cardUid)!;
        const key = `${ci.cardId}:${ci.upgraded}:${a.targetUid ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r = step(s, a);
        if (r.events[0]?.type === "action_rejected") continue;
        dfs(resolvePending(r.state), first ?? a, depth + 1);
        if (nodes >= this.nodeCap) return;
      }
    };
    dfs(lean, null, 0);
    return best.first;
  }

  private usefulCache = new Map<string, number>();

  /** 이 카드가 현재 막 질병 중 몇 %에 듣는지 (변이 중 하나라도 들으면 포함) */
  private usefulness(id: CardId, act: number): number {
    const key = `${id}:${act}`;
    const hit = this.usefulCache.get(key);
    if (hit !== undefined) return hit;
    const def = cardDef(id);
    const diseases = db().diseases.filter((d) => d.act === act);
    let n = 0;
    for (const d of diseases) {
      const variants = d.variants?.length ? d.variants.map((v) => v.id) : [undefined];
      const ok = variants.some((vid) => {
        const e = { uid: "x", diseaseId: d.id, severity: 1, maxSeverity: 1, stability: 0, statuses: [], knowledge: 0 as const, diagnosisPoints: 0, acquiredResistance: {}, resistanceFraction: 0, phase: 0, ai: { history: [], planned: [], planIndex: 0, usedOnce: [] }, countdowns: [], revealNext: false, targetedBonus: 0, cured: false, ...(vid ? { variantId: vid } : {}) };
        const g = gradeFor(e, def.tags, def.drug?.spectrum);
        return !g.harmful && g.pct > 0;
      });
      if (ok) n++;
    }
    const f = n / Math.max(1, diseases.length);
    this.usefulCache.set(key, f);
    return f;
  }

  private cardValue(id: CardId, state: GameState): number {
    const def = cardDef(id);
    const b = cardBudget(db(), def);
    let v = b ? b.actual : 5;
    const hasDamage = def.effects.some((e) => e.op === "damage");
    if (hasDamage && (def.drug || def.tags.some((t) => db().tags.find((x) => x.id === t)?.kind === "therapeutic"))) {
      // 피해 부분만 적응증 비율로 깎는다
      const f = this.usefulness(id, state.run.act);
      v *= 0.35 + 0.65 * f;
    }
    if (def.kind === "diagnostic") v *= 0.8;
    return v;
  }

  choose(state: GameState): Action {
    if (state.pending) {
      const p = state.pending;
      if (p.kind === "deck_select") {
        // 업그레이드는 가장 비싼 카드, 제거는 시작 카드부터
        const deck = state.run.deck.filter((c) => p.candidates.includes(c.uid));
        if (p.purpose === "upgrade") {
          deck.sort((a, b) => this.cardValue(b.cardId, state) - this.cardValue(a.cardId, state));
          return { type: "choose_cards", uids: deck.slice(0, p.max).map((c) => c.uid) };
        }
        const order = ["lung_toxicity", "first_aid", "stabilize", "history"];
        deck.sort((a, b) => {
          const ia = order.indexOf(a.cardId);
          const ib = order.indexOf(b.cardId);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        return { type: "choose_cards", uids: deck.slice(0, Math.max(p.min, 1)).map((c) => c.uid) };
      }
      const n = Math.max(p.min, p.min === 0 ? Math.min(1, p.max) : p.min);
      return { type: "choose_cards", uids: p.candidates.slice(0, n) };
    }
    const run = state.run;
    switch (state.phase) {
      case "combat":
        return this.bestCombatAction(state);
      case "map": {
        const acts = legalActions(state).filter((a): a is Extract<Action, { type: "move_map" }> => a.type === "move_map");
        const hpRatio = run.vitality / run.maxVitality;
        const pref = (type: string) => {
          switch (type) {
            case "rest":
              return hpRatio < 0.55 ? 10 : 3;
            case "elite":
              return hpRatio > 0.8 ? 7 : hpRatio > 0.6 ? 3 : -5;
            case "shop":
              return run.gold >= 120 ? 6 : 1;
            case "treasure":
              return 8;
            case "event":
              return 4;
            default:
              return 5;
          }
        };
        const scored = acts.map((a) => ({ a, s: pref(run.map.nodes[a.nodeId]!.type) + randInt(this.rng, 3) }));
        scored.sort((x, y) => y.s - x.s);
        return scored[0]!.a;
      }
      case "reward": {
        const r = state.reward!;
        for (let i = 0; i < r.items.length; i++) {
          const it = r.items[i]!;
          if (it.taken) continue;
          if (it.kind !== "card") return { type: "claim_reward", item: i };
          let bestK = -1;
          let bestV = run.deck.length < 18 ? 4 : 8;
          it.options.forEach((id, k) => {
            const v = this.cardValue(id, state);
            if (v > bestV) {
              bestV = v;
              bestK = k;
            }
          });
          if (bestK >= 0 && run.deck.length < 30) return { type: "claim_reward", item: i, choice: bestK };
          return { type: "skip_reward", item: i };
        }
        return { type: "leave" };
      }
      case "shop": {
        const s = state.shop!;
        if (!s.removalUsed && s.removalPrice <= run.gold && run.deck.some((c) => c.cardId === "first_aid" || c.cardId === "stabilize")) return { type: "shop_remove" };
        const relic = s.relics.find((x) => !x.sold && x.price <= run.gold);
        if (relic) return { type: "shop_buy", slot: relic.slot };
        const cards = s.cards.filter((x) => !x.sold && x.price <= run.gold).sort((a, b) => this.cardValue(b.cardId, state) - this.cardValue(a.cardId, state));
        if (cards[0] && this.cardValue(cards[0].cardId, state) > 11) return { type: "shop_buy", slot: cards[0].slot };
        return { type: "leave" };
      }
      case "rest":
        if (!run.restDone) {
          const canRest = !run.relics.some((r) => r.id === "icu_admission");
          if (run.vitality / run.maxVitality < 0.6 && canRest) return { type: "rest_choose", option: "rest" };
          if (run.deck.some((c) => cardDef(c.cardId).kind === "side_effect")) return { type: "rest_choose", option: "purge" };
          return { type: "rest_choose", option: "upgrade" };
        }
        return { type: "leave" };
      case "event": {
        const ev = state.event!;
        if (ev.resolved) return { type: "leave" };
        if (ev.quiz) return { type: "event_choose", optionId: `q${randInt(this.rng, ev.quiz.order.length)}` };
        const def = eventDef(ev.eventId);
        const opts = def.options.filter((o) => !o.requires?.goldAtLeast || run.gold >= o.requires.goldAtLeast);
        const healOpt = opts.find((o) => o.ops.some((op) => op.op === "heal"));
        if (healOpt && run.vitality / run.maxVitality < 0.6) return { type: "event_choose", optionId: healOpt.id };
        return { type: "event_choose", optionId: opts[0]!.id };
      }
      case "boss_relic":
        return { type: "pick_relic", index: 0 };
      default:
        return legalActions(state)[0] ?? { type: "leave" };
    }
  }
}

export function diseaseNameOf(id: string | undefined): string {
  return id ? diseaseDef(id).nameKo : "-";
}
