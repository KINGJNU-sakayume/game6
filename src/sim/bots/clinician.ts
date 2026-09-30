// 임상의 봇: 플레이어가 볼 수 있는 정보(EnemyView, 미리보기, 교과서, 손패)만으로 결정한다.
// 예전 탐욕 봇은 step으로 앞을 내다보며 숨겨진 반응 등급을 엿보았다. 이 봇은 실제 질병·변이를 읽지 않는다.
// 한 턴 안에서 "버티기 → 감별 → 작업 진단 → 치료 → 반납" 순서로 우선순위를 매긴다.
import {
  cardDef,
  cardTextbook,
  channelValue,
  commitCheck,
  db,
  diseaseDef,
  eventDef,
  isPlayable,
  isTreatmentCard,
  previewDiscover,
  legalActions,
  previewDamage,
  returnCheck,
  visibleEnemyInfo,
} from "../../core";
import { deriveStream, randInt } from "../../core/rng";
import type { Action, CardDef, EffectOp, EnemyState, EnemyView, GameState, HypothesisLevel, PendingOption, RngState } from "../../core";

const LEVEL_W: Record<HypothesisLevel, number> = { excluded: 0, unlikely: 0.5, possible: 2, suspected: 4, strong: 9 };
const GRADE_V: Record<string, number> = { key: 2, weak: 1.5, normal: 1, resistant: 0.5, immune: 0, not_indicated: 0, harmful: -1.5, generic: 1, varies: 0.6 };

function belief(v: EnemyView): { id: string; p: number; level: HypothesisLevel }[] {
  const live = v.hypotheses.filter((h) => h.level !== "excluded");
  let tot = 0;
  const rows = live.map((h) => {
    const w = LEVEL_W[h.level] + (h.isWorkingDx ? 1 : 0);
    tot += w;
    return { id: h.diseaseId, p: w, level: h.level };
  });
  return rows.map((r) => ({ ...r, p: tot > 0 ? r.p / tot : 0 }));
}

function leader(v: EnemyView) {
  const live = v.hypotheses.filter((h) => h.level !== "excluded");
  return [...live].sort((a, b) => b.score - a.score)[0];
}

function firstDamage(ops: EffectOp[]): number {
  for (const op of ops) {
    if (op.op === "damage" && typeof op.amount === "number") return op.amount;
    if (op.op === "choose_option") for (const o of op.options) {
      const d = firstDamage(o.effects);
      if (d) return d;
    }
  }
  return 0;
}

function stabilityOf(ops: EffectOp[]): number {
  let s = 0;
  for (const op of ops) {
    if (op.op === "gain_stability" && typeof op.amount === "number") s += op.amount;
    if (op.op === "choose_option") s += Math.max(0, ...op.options.map((o) => stabilityOf(o.effects)));
  }
  return s;
}

export class ClinicianBot {
  private rng: RngState;
  /** 비교용: 검사를 하지 않고(진단 카드·검사 선택지를 쓰지 않고) 치료만 하는 봇 */
  private blind: boolean;
  constructor(seed: string, _cap = 0, opts: { blind?: boolean } = {}) {
    this.rng = deriveStream(`${seed}:sim-clinician`);
    this.blind = !!opts.blind;
  }

  // ───────────── 전투 ─────────────

  private views(state: GameState): EnemyView[] {
    return state.combat!.enemies.filter((e) => !e.cured).map((e) => visibleEnemyInfo(state, e.uid)!);
  }

  private threat(state: GameState): number {
    let t = 0;
    for (const v of this.views(state)) {
      t += v.intents[0]?.estimate ?? 0;
      for (const cd of v.countdowns) if (cd.turnsLeft <= 1) t += 18;
    }
    return t;
  }

  /** 작업 진단을 정하거나 바꿀 때인가 */
  private commitAction(state: GameState): Action | null {
    const c = state.combat!;
    for (const v of this.views(state)) {
      const lead = leader(v);
      if (!lead) continue;
      const live = v.hypotheses.filter((h) => h.level !== "excluded");
      const second = [...live].sort((a, b) => b.score - a.score)[1];
      const margin = lead.score - (second?.score ?? -99);
      // 첫 턴에는 강력 의심일 때만 정한다. 둘째 턴부터(또는 위협이 클 때)는 치료를 늦출 수 없으므로 앞선 가설로 정한다
      const urgent = this.threat(state) >= state.run.vitality * 0.35 || c.turn >= 2;
      const ready = lead.level === "strong" || (urgent && margin >= 1 && lead.score >= 1);
      if (!ready) continue;
      if (v.workingDx?.diseaseId === lead.diseaseId) continue;
      if (v.workingDx) {
        // 바꾸려면 새 근거가 필요하다: 작업 진단이 흔들리고(가능 이하) 다른 가설이 앞설 때만
        const wd = v.hypotheses.find((h) => h.isWorkingDx);
        if (!wd || wd.level === "suspected" || wd.level === "strong" || lead.score - wd.score < 2) continue;
      }
      if (commitCheck(state, v.uid, lead.diseaseId).ok) return { type: "commit_diagnosis", targetUid: v.uid, diseaseId: lead.diseaseId };
    }
    return null;
  }

  /** 치료 카드의 기대 질병 부담 감소 (감별 목록의 가설별 교과서 반응을 신뢰도로 가중) */
  private treatValue(state: GameState, uid: string, v: EnemyView): number {
    const pv = previewDamage(state, uid, v.uid);
    if (!pv) return 0;
    if (pv.known) return pv.harmful ? -15 : pv.amount;
    const b = belief(v);
    let val = 0;
    for (const h of pv.byHypothesis ?? []) {
      const p = b.find((x) => x.id === h.diseaseId)?.p ?? 0;
      if (h.grade === "harmful") val -= 15 * p;
      else if (h.grade === "varies") val += 0.75 * pv.amount * p;
      else val += (h.amount ?? 0) * p;
    }
    return val;
  }

  /** 진단 카드의 가치: 감별이 끝나지 않은 문제에서 가장 감별력 있는 경로 */
  private diagValue(state: GameState, def: CardDef, target: EnemyState): number {
    if (target.knowledge >= 2) return 0;
    let best = 0;
    const walk = (ops: EffectOp[]) => {
      for (const op of ops) {
        if (op.op === "choose_option") for (const o of op.options) {
          if (o.channel) best = Math.max(best, channelValue(target, o.channel) - (o.cost ?? 0) * 0.15);
          walk(o.effects);
        }
        if (op.op === "investigate") best = Math.max(best, channelValue(target, op.channel));
        if (op.op === "investigate_best") best = Math.max(best, 0.5 * op.count);
      }
    };
    walk(def.effects);
    return best * 20;
  }

  private cardValue(state: GameState, uid: string): { value: number; target?: string } {
    const c = state.combat!;
    const ci = c.hand.find((h) => h.uid === uid)!;
    const def = cardDef(ci.cardId, ci.upgraded);
    const threat = this.threat(state);
    const need = Math.max(0, threat - c.stability);
    const stab = stabilityOf(def.effects);
    const stabVal = Math.min(stab, need) * 1.1;
    if (def.kind === "side_effect") return { value: 3 };
    if (this.blind && def.kind === "diagnostic") return { value: -Infinity };
    const targets = c.enemies.filter((e) => !e.cured);
    let best = { value: -Infinity, target: undefined as string | undefined };
    for (const e of def.target === "enemy" ? targets : [undefined]) {
      let v = stabVal;
      const view = e ? visibleEnemyInfo(state, e.uid)! : undefined;
      if (def.kind === "diagnostic" && e) v += this.diagValue(state, def, e);
      else if (def.effects.some((o) => o.op === "discover") && view) {
        const pool = (def.effects.find((o) => o.op === "discover") as Extract<EffectOp, { op: "discover" }>).pool;
        const hasTreatment = c.hand.some((h) => h.uid !== uid && isTreatmentCard(cardDef(h.cardId)) && cardDef(h.cardId).kind === (pool === "drug" ? "drug" : "procedure"));
        const lead = leader(view);
        const readiness = view.workingDx ? 1 : lead?.level === "strong" ? 0.8 : lead?.level === "suspected" ? 0.5 : 0.2;
        // 처방집에 맞는 치료가 있는가 (플레이어가 아는 처방집·감별 목록으로 계산)
        const opts = previewDiscover(state, e!.uid, pool);
        const useful = opts.some((o) => o.cardId && this.optionValue(state, { id: o.id, label: o.label, detail: o.detail, cost: 0, available: true, effects: o.effects, cardId: o.cardId }, e, view) > 4);
        v += hasTreatment ? 2 : useful ? 22 * readiness : 1;
      } else if (def.effects.some((o) => o.op === "consult") && view) {
        v += view.knowledge >= 2 ? 10 : 16;
      } else if (isTreatmentCard(def) && view) {
        v += this.treatValue(state, uid, view) - (def.drug?.sideEffects.length ?? 0);
      } else if (view) {
        const dmg = firstDamage(def.effects);
        v += dmg;
      } else {
        v += def.id === "chart_review" || def.id === "iv_access" ? 3 : def.id === "rapid_response" ? 12 : 1;
      }
      if (v > best.value) best = { value: v, target: e?.uid };
    }
    return best;
  }

  private combatAction(state: GameState): Action {
    const c = state.combat!;
    const commit = this.commitAction(state);
    if (commit) return commit;
    let best: { a: Action; v: number } | null = null;
    for (const ci of c.hand) {
      if (!isPlayable(state, ci.uid)) continue;
      const cv = this.cardValue(state, ci.uid);
      const cost = cardDef(ci.cardId, ci.upgraded).cost;
      const v = cv.value - (typeof cost === "number" ? cost * 0.5 : 0);
      if (!best || v > best.v) best = { a: { type: "play_card", cardUid: ci.uid, targetUid: cv.target }, v };
    }
    // 쓸모없는 치료 처방 반납
    for (const ci of c.hand) {
      const def = cardDef(ci.cardId);
      if (!isTreatmentCard(def) || !returnCheck(state, ci.uid).ok) continue;
      const vals = c.enemies.filter((e) => !e.cured).map((e) => this.treatValue(state, ci.uid, visibleEnemyInfo(state, e.uid)!));
      const support = stabilityOf(def.effects) + (def.effects.some((o) => o.op === "exhaust_cards") ? 3 : 0);
      if (Math.max(...vals) <= 0.5 && support <= 2) return { type: "return_card", cardUid: ci.uid };
    }
    if (best && best.v > 1.5) return best.a;
    return { type: "end_turn" };
  }

  // ───────────── 결정 ─────────────

  private optionValue(state: GameState, o: PendingOption, target: EnemyState | undefined, view: EnemyView | undefined): number {
    const c = state.combat!;
    if (!o.available) return -Infinity;
    if (this.blind && (o.channel || o.effects.some((e) => e.op === "investigate" || e.op === "investigate_best" || e.op === "culture"))) return -50;
    let v = 0;
    if (o.channel && target) v += channelValue(target, o.channel) * 14 - o.cost * 3;
    // 협진 권고가 손에 쥐여 주는 치료도 처방 선택지처럼 평가
    const given = o.cardId ?? o.effects.find((e): e is Extract<EffectOp, { op: "add_card" }> => e.op === "add_card" && isTreatmentCard(cardDef(e.cardId)))?.cardId;
    if (given && view) {
      const def = cardDef(given, o.upgraded);
      const b = belief(view);
      let treat = 0;
      for (const h of b) {
        const tb = cardTextbook(h.id, def);
        if (tb.generic) continue;
        const g = tb.harmful && tb.classes.length === 1 ? "harmful" : tb.varies ? "varies" : tb.best;
        treat += (GRADE_V[g] ?? 0) * h.p * 12;
      }
      v += treat;
      // 이미 투여 중인 약보다 다른 기전·병용을 먼저 (같은 약은 반복해도 지속만 갱신된다)
      if (c.activeDrugs.some((d) => d.cardId === given)) v -= 4;
      if (c.hand.some((h) => h.cardId === given)) v -= 3;
      // 치료가 아닌 약(해열진통제·관리 약)은 안정화·정리 가치로만 본다
      const need = Math.max(0, this.threat(state) - c.stability);
      v += Math.min(stabilityOf(def.effects), need) * 0.4;
      if (view.workingDx) {
        const tb = cardTextbook(view.workingDx.diseaseId, def);
        if (!tb.varies && (tb.best === "key" || tb.best === "weak")) v += 6;
      }
      v -= (def.drug?.sideEffects.length ?? 0) * 1.5;
      if (/정리/.test(o.detail)) v += 6;
    }
    // 킥커: 여유 오더가 있을 때만
    if (o.cost > 0 && !o.channel) v += c.orders - o.cost >= 1 ? 2 : -6;
    if (o.id === "now") v += /충분/.test(o.risk ?? "") ? 20 : /보통/.test(o.risk ?? "") ? 8 : -10;
    if (o.id === "go") v += /부족/.test(o.risk ?? "") ? -5 : 15;
    if (o.id === "guided") v += c.orders >= 1 ? 10 : -10;
    if (o.id === "hold") v += 0;
    if (o.id === "reexam") v += target && target.knowledge < 2 ? 8 : 0;
    if (o.id === "results") v += 6;
    if (o.id === "deescalate") v += 7;
    if (o.id === "standard" || o.id === "im" || o.id === "low") v += 3;
    if (!o.channel && !o.cardId && v === 0) v = 1;
    return v;
  }

  private chooseOption(state: GameState): Action {
    const p = state.pending as Extract<NonNullable<GameState["pending"]>, { kind: "choose_option" }>;
    const c = state.combat!;
    const target = c.enemies.find((e) => e.uid === p.ctx.targetUid && !e.cured) ?? c.enemies.find((e) => !e.cured);
    const view = target ? visibleEnemyInfo(state, target.uid) : undefined;
    let best: { id: string; v: number } | null = null;
    p.options.forEach((o, i) => {
      const v = this.optionValue(state, o, target, view) - i * 0.01;
      if (!best || v > best.v) best = { id: o.id, v };
    });
    const b = best as { id: string; v: number } | null;
    if (p.canSkip && (!b || b.v <= 0.5)) return { type: "choose_option", optionId: "skip" };
    return { type: "choose_option", optionId: b?.id ?? p.options.find((o) => o.available)!.id };
  }

  // ───────────── 런 ─────────────

  private rewardValue(state: GameState, id: string): number {
    const def = cardDef(id);
    if (def.zone === "formulary") {
      let rel = 0;
      const act = state.run.act;
      const diseases = db().diseases.filter((d) => d.act === act || d.act === Math.min(3, act + 1));
      for (const d of diseases) {
        const tb = cardTextbook(d.id, def);
        if (!tb.generic && !tb.harmful && (tb.best === "key" || tb.best === "weak")) rel += 2;
        else if (!tb.generic && !tb.harmful && tb.best === "normal") rel += 1;
      }
      return 4 + rel * 1.5;
    }
    const base: Record<string, number> = {
      culture: 11,
      consult: 12,
      bedside_tests: 9,
      reassessment: 8,
      attending_rounds: 12,
      procedure_order: 10,
      monitoring: 6,
      oxygen: 5,
      med_review: 5,
      rapid_response: 9,
      intensive_care: 7,
      chart_review: 5,
      history: 7,
      physical_exam: 7,
      lab_workup: 7,
      imaging: 7,
      med_order: 10,
      supportive_care: 5,
      stabilize: 5,
    };
    return base[id] ?? 4;
  }

  choose(state: GameState): Action {
    if (state.pending) {
      const p = state.pending;
      if (p.kind === "choose_option") return this.chooseOption(state);
      if (p.kind === "deck_select") {
        const pool = [...state.run.deck, ...state.run.formulary].filter((c) => p.candidates.includes(c.uid));
        if (p.purpose === "upgrade") {
          pool.sort((a, b) => this.rewardValue(state, b.cardId) - this.rewardValue(state, a.cardId));
          return { type: "choose_cards", uids: pool.slice(0, p.max).map((c) => c.uid) };
        }
        const order = ["lung_toxicity", "procedural_complication", "supportive_care", "stabilize"];
        pool.sort((a, b) => {
          const ia = order.indexOf(a.cardId);
          const ib = order.indexOf(b.cardId);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        return { type: "choose_cards", uids: pool.slice(0, Math.max(p.min, 1)).map((c) => c.uid) };
      }
      const n = Math.max(p.min, p.min === 0 ? Math.min(1, p.max) : p.min);
      return { type: "choose_cards", uids: p.candidates.slice(0, n) };
    }
    const run = state.run;
    switch (state.phase) {
      case "combat":
        return this.combatAction(state);
      case "map": {
        const acts = legalActions(state).filter((a): a is Extract<Action, { type: "move_map" }> => a.type === "move_map");
        const hpRatio = run.vitality / run.maxVitality;
        const pref = (type: string) => {
          switch (type) {
            case "rest":
              return hpRatio < 0.55 ? 10 : 3;
            case "elite":
              return hpRatio > 0.8 ? 6 : hpRatio > 0.6 ? 2 : -5;
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
          let bestV = run.deck.length < 16 ? 5 : 9;
          it.options.forEach((o, k) => {
            const v = this.rewardValue(state, o.cardId);
            if (v > bestV) {
              bestV = v;
              bestK = k;
            }
          });
          if (bestK >= 0 && run.deck.length < 28) return { type: "claim_reward", item: i, choice: bestK };
          return { type: "skip_reward", item: i };
        }
        return { type: "leave" };
      }
      case "shop": {
        const s = state.shop!;
        if (!s.removalUsed && s.removalPrice <= run.gold && run.deck.some((c) => c.cardId === "supportive_care")) return { type: "shop_remove" };
        const relic = s.relics.find((x) => !x.sold && x.price <= run.gold);
        if (relic) return { type: "shop_buy", slot: relic.slot };
        const cards = s.cards.filter((x) => !x.sold && x.price <= run.gold).sort((a, b) => this.rewardValue(state, b.cardId) - this.rewardValue(state, a.cardId));
        if (cards[0] && this.rewardValue(state, cards[0].cardId) > 9) return { type: "shop_buy", slot: cards[0].slot };
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
