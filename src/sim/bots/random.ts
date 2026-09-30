// 무작위 봇: 합법 행동 중 무작위. sim 전용 스트림을 쓰고 GameState에 넣지 않는다.
import { deriveStream, randInt } from "../../core/rng";
import { legalActions } from "../../core";
import type { Action, GameState, RngState } from "../../core";

export class RandomBot {
  private rng: RngState;
  constructor(seed: string) {
    this.rng = deriveStream(`${seed}:sim`);
  }
  choose(state: GameState): Action {
    const acts = legalActions(state);
    if (acts.length === 0) throw new Error(`no legal actions in phase ${state.phase}`);
    // 전투에서는 턴 종료를 덜 고르도록(카드를 쓸 기회를 준다)
    if (state.phase === "combat" && !state.pending && acts.length > 1 && randInt(this.rng, 4) !== 0) {
      const plays = acts.filter((a) => a.type !== "end_turn");
      return plays[randInt(this.rng, plays.length)]!;
    }
    return acts[randInt(this.rng, acts.length)]!;
  }
}
