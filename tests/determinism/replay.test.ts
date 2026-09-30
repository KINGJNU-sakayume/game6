import { describe, expect, it } from "vitest";
import "../helpers";
import { newRun, stateHash, step } from "../../src/core";
import { RandomBot } from "../../src/sim/bots/random";
import type { Action, GameState } from "../../src/core";

function play(seed: string, maxSteps: number): { state: GameState; log: Action[] } {
  let s = newRun(seed);
  const bot = new RandomBot(seed);
  const log: Action[] = [];
  for (let i = 0; i < maxSteps && s.phase !== "gameover" && s.phase !== "victory"; i++) {
    const a = bot.choose(s);
    log.push(a);
    s = step(s, a).state;
  }
  return { state: s, log };
}

describe("결정론", () => {
  it("같은 시드와 행동 로그 → 같은 해시 (2회)", () => {
    const a = play("det-1", 400);
    let s = newRun("det-1");
    for (const x of a.log) s = step(s, x).state;
    expect(stateHash(s)).toBe(stateHash(a.state));
  });
  it("리플레이 결정론: 시드 20개의 무작위 봇 전체 런", () => {
    for (let i = 0; i < 20; i++) {
      const r = play(`replay-${i}`, 3000);
      let s = newRun(`replay-${i}`);
      for (const x of r.log) s = step(s, x).state;
      expect(stateHash(s)).toBe(stateHash(r.state));
    }
  });
  it("저장·복원 왕복(JSON) 후 해시와 이후 진행이 같다", () => {
    const r = play("save-1", 120);
    const restored = JSON.parse(JSON.stringify(r.state)) as GameState;
    expect(stateHash(restored)).toBe(stateHash(r.state));
    const bot1 = new RandomBot("cont");
    const bot2 = new RandomBot("cont");
    let a = r.state;
    let b = restored;
    for (let i = 0; i < 50 && a.phase !== "gameover" && a.phase !== "victory"; i++) {
      a = step(a, bot1.choose(a)).state;
      b = step(b, bot2.choose(b)).state;
    }
    expect(stateHash(a)).toBe(stateHash(b));
  });
  it("step은 입력 상태를 바꾸지 않는다", () => {
    const s = newRun("immut");
    const before = stateHash(s);
    step(s, { type: "move_map", nodeId: Object.values(s.run.map.nodes).find((n) => n.floor === 1)!.id });
    expect(stateHash(s)).toBe(before);
  });
  it("대기 선택 중 저장·복원 후 재개해도 결과가 같다 (큐 직렬화)", async () => {
    const { makeCombat, play: playCard } = await import("../helpers");
    let s = makeCombat({ hand: ["chart_review", "first_aid", "stabilize"] });
    s = playCard(s, "chart_review").state;
    expect(s.pending?.kind).toBe("select_cards");
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    const pick = s.pending!.candidates[0]!;
    const a = step(s, { type: "choose_cards", uids: [pick] }).state;
    const b = step(copy, { type: "choose_cards", uids: [pick] }).state;
    expect(stateHash(a)).toBe(stateHash(b));
  });
});
