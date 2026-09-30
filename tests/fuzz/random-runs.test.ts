import { describe, expect, it } from "vitest";
import "../helpers";
import { checkInvariants, newRun, step } from "../../src/core";
import { RandomBot } from "../../src/sim/bots/random";
import { GreedyBot } from "../../src/sim/bots/greedy";

const N = process.env.FUZZ_LONG ? 200 : 40;

describe("퍼즈", () => {
  it(`무작위 봇 전체 런 ${N}회: 불변식 위반·예외 0`, () => {
    for (let i = 0; i < N; i++) {
      const seed = `fz-${i}`;
      let s = newRun(seed);
      const bot = new RandomBot(seed);
      for (let k = 0; k < 20000 && s.phase !== "gameover" && s.phase !== "victory"; k++) {
        const a = bot.choose(s);
        const r = step(s, a);
        expect(r.events[0]?.type, JSON.stringify(a)).not.toBe("action_rejected");
        s = r.state;
        const inv = checkInvariants(s);
        expect(inv, `${seed} step ${k}`).toEqual([]);
      }
    }
  });
  it("탐욕 봇 전체 런 6회로 2·3막까지 불변식 검사", () => {
    for (let i = 0; i < 6; i++) {
      const seed = `fzg-${i}`;
      let s = newRun(seed);
      const bot = new GreedyBot(seed, 150);
      for (let k = 0; k < 6000 && s.phase !== "gameover" && s.phase !== "victory"; k++) {
        s = step(s, bot.choose(s)).state;
        expect(checkInvariants(s)).toEqual([]);
      }
    }
  });
});
