import { describe, expect, it } from "vitest";
import "../helpers";
import { eventDef, legalActions, newRun, step } from "../../src/core";
import type { GameState } from "../../src/core";

function atEvent(eventId: string, gold: number): GameState {
  const s = newRun("legal");
  s.phase = "event";
  s.event = { eventId };
  s.run.gold = gold;
  return s;
}

describe("합법 행동 목록", () => {
  // 회귀: 예산이 모자란 선택지를 합법으로 내놓아 step이 거부했다 (긴 퍼즈 fz-58)
  it("돌발 상황: 예산 조건을 못 채운 선택지는 빠진다", () => {
    const poor = legalActions(atEvent("conference", 5));
    expect(poor).toEqual([{ type: "event_choose", optionId: "b" }]);
    const rich = legalActions(atEvent("conference", 100));
    expect(rich).toEqual([
      { type: "event_choose", optionId: "a" },
      { type: "event_choose", optionId: "b" },
    ]);
  });

  it("돌발 상황: 목록의 모든 행동을 step이 받아들인다", () => {
    for (const id of ["conference", "family_meeting"]) {
      for (const gold of [0, 59, 60, 200]) {
        const s = atEvent(id, gold);
        const acts = legalActions(s);
        expect(acts.length, `${id} gold ${gold}`).toBeGreaterThan(0);
        for (const a of acts) expect(step(s, a).events[0]?.type, `${id} ${JSON.stringify(a)}`).not.toBe("action_rejected");
        expect(acts.length).toBeLessThanOrEqual(eventDef(id).options.length);
      }
    }
  });
});
