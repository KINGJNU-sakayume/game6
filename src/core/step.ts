// 진입점: step(state, action) → { state, events }. design.md §3.3–3.4
import { chooseOption, commitDiagnosis, endTurn, playCard, resolveCardSelection, returnCard } from "./combat";
import {
  claimReward,
  eventChoose,
  finishCombatVictory,
  leaveRoom,
  moveMap,
  pickBossRelic,
  resolveDeckSelection,
  restChoose,
  shopBuy,
  shopRemove,
  skipReward,
} from "./run";
import { eventSink } from "./util";
import type { Action, GameEvent, GameState } from "./types";

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

function apply(state: GameState, action: Action): string | null {
  if (state.phase === "gameover" || state.phase === "victory") return "런이 끝났다";
  if (state.pending && action.type !== "choose_cards" && action.type !== "choose_option") return "결정을 먼저 마쳐야 한다";
  switch (action.type) {
    case "play_card":
      return playCard(state, action.cardUid, action.targetUid);
    case "end_turn":
      return endTurn(state);
    case "choose_cards":
      if (!state.pending) return "선택할 것이 없다";
      if (state.pending.kind === "choose_option") return "카드가 아니라 선택지를 골라야 한다";
      return state.pending.kind === "select_cards" ? resolveCardSelection(state, action.uids) : resolveDeckSelection(state, action.uids);
    case "choose_option":
      return chooseOption(state, action.optionId);
    case "commit_diagnosis":
      return commitDiagnosis(state, action.targetUid, action.diseaseId);
    case "return_card":
      return returnCard(state, action.cardUid);
    case "move_map":
      return moveMap(state, action.nodeId);
    case "claim_reward":
      return claimReward(state, action.item, action.choice);
    case "skip_reward":
      return skipReward(state, action.item);
    case "shop_buy":
      return shopBuy(state, action.slot);
    case "shop_remove":
      return shopRemove(state);
    case "rest_choose":
      return restChoose(state, action.option);
    case "event_choose":
      return eventChoose(state, action.optionId);
    case "pick_relic":
      return pickBossRelic(state, action.index);
    case "leave":
      return leaveRoom(state);
  }
}

/** 전투가 끝났으면 다음 단계로 넘긴다. */
function settle(state: GameState): void {
  const c = state.combat;
  if (!c || !c.over) return;
  if (c.over === "defeat") {
    state.phase = "gameover";
    state.pending = undefined;
    return;
  }
  if (state.phase === "combat") finishCombatVictory(state);
}

export function step(prev: GameState, action: Action): StepResult {
  eventSink.events = [];
  const state = structuredClone(prev);
  const err = apply(state, action);
  if (err) {
    eventSink.events = [];
    return { state: prev, events: [{ type: "action_rejected", reason: err }] };
  }
  settle(state);
  state.actionCount += 1;
  const events = eventSink.events;
  eventSink.events = [];
  return { state, events };
}
