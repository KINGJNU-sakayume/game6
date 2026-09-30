import { describe, expect, it } from "vitest";
import { cyrb128, deriveStream, nextU32, randInt, shuffleInPlace } from "../../src/core/rng";

describe("rng", () => {
  it("cyrb128 + sfc32는 고정 시드에서 같은 값을 낸다", () => {
    const a = deriveStream("seed:map");
    const b = deriveStream("seed:map");
    const xs = Array.from({ length: 5 }, () => nextU32(a));
    const ys = Array.from({ length: 5 }, () => nextU32(b));
    expect(xs).toEqual(ys);
    expect(cyrb128("order-set")).toEqual(cyrb128("order-set"));
    expect(xs.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)).toBe(true);
  });

  it("기준값이 바뀌지 않는다", () => {
    const s = deriveStream("baseline");
    expect([nextU32(s), nextU32(s), nextU32(s)]).toMatchInlineSnapshot(`
      [
        677111148,
        226828448,
        2159388714,
      ]
    `);
  });

  it("스트림 독립성: map을 100번 써도 reward 출력은 같다", () => {
    const reward1 = deriveStream("s:reward");
    const expected = Array.from({ length: 10 }, () => nextU32(reward1));
    const map = deriveStream("s:map");
    for (let i = 0; i < 100; i++) nextU32(map);
    const reward2 = deriveStream("s:reward");
    expect(Array.from({ length: 10 }, () => nextU32(reward2))).toEqual(expected);
  });

  it("randInt 범위와 셔플 보존", () => {
    const s = deriveStream("x");
    for (let i = 0; i < 1000; i++) {
      const v = randInt(s, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    const arr = [1, 2, 3, 4, 5, 6];
    shuffleInPlace(s, arr);
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
