// 합법 행동 목록. 봇과 UI 활성화에 공용.
import { cardDef, eventDef } from "./registry";
import { canPlay } from "./combat";
import { availableNodes } from "./run";
import type { Action, GameState } from "./types";

export function legalActions(state: GameState): Action[] {
  const out: Action[] = [];
  if (state.phase === "gameover" || state.phase === "victory") return out;
  const p = state.pending;
  if (p) {
    // 봇용: 최소 개수만큼 앞에서부터 고르는 선택과, 가능하면 빈 선택
    if (p.min === 0) out.push({ type: "choose_cards", uids: [] });
    const n = Math.max(p.min, Math.min(1, p.max));
    for (let i = 0; i + n <= p.candidates.length; i++) out.push({ type: "choose_cards", uids: p.candidates.slice(i, i + n) });
    return out;
  }
  switch (state.phase) {
    case "combat": {
      const c = state.combat!;
      if (c.over) return out;
      for (const ci of c.hand) {
        const def = cardDef(ci.cardId, ci.upgraded);
        if (def.target === "enemy" && def.cost !== "unplayable") {
          for (const e of c.enemies) if (!e.cured && canPlay(state, ci.uid, e.uid).ok) out.push({ type: "play_card", cardUid: ci.uid, targetUid: e.uid });
        } else if (canPlay(state, ci.uid).ok) out.push({ type: "play_card", cardUid: ci.uid });
      }
      out.push({ type: "end_turn" });
      return out;
    }
    case "map":
      for (const id of availableNodes(state)) out.push({ type: "move_map", nodeId: id });
      return out;
    case "reward": {
      const r = state.reward!;
      r.items.forEach((it, i) => {
        if (it.taken) return;
        if (it.kind === "card") {
          it.options.forEach((_, k) => out.push({ type: "claim_reward", item: i, choice: k }));
          out.push({ type: "skip_reward", item: i });
        } else out.push({ type: "claim_reward", item: i });
      });
      out.push({ type: "leave" });
      return out;
    }
    case "shop": {
      const s = state.shop!;
      for (const x of [...s.cards, ...s.relics]) if (!x.sold && x.price <= state.run.gold) out.push({ type: "shop_buy", slot: x.slot });
      if (!s.removalUsed && s.removalPrice <= state.run.gold) out.push({ type: "shop_remove" });
      out.push({ type: "leave" });
      return out;
    }
    case "rest":
      if (!state.run.restDone) {
        out.push({ type: "rest_choose", option: "rest" }, { type: "rest_choose", option: "upgrade" });
        if (state.run.deck.some((c) => cardDef(c.cardId).kind === "side_effect")) out.push({ type: "rest_choose", option: "purge" });
      }
      out.push({ type: "leave" });
      return out;
    case "event": {
      const ev = state.event!;
      if (ev.resolved) {
        out.push({ type: "leave" });
        return out;
      }
      if (ev.quiz) ev.quiz.order.forEach((_, i) => out.push({ type: "event_choose", optionId: `q${i}` }));
      else {
        // 조건(예산)을 채우지 못한 선택지는 합법 행동이 아니다. step의 검사와 같은 기준이다.
        for (const o of eventDef(ev.eventId).options) {
          if (o.requires?.goldAtLeast !== undefined && state.run.gold < o.requires.goldAtLeast) continue;
          out.push({ type: "event_choose", optionId: o.id });
        }
      }
      return out;
    }
    case "boss_relic":
      (state.bossRelic ?? []).forEach((_, i) => out.push({ type: "pick_relic", index: i }));
      out.push({ type: "leave" });
      return out;
  }
  return out;
}
