import { describe, expect, it } from "vitest";
import "../helpers";
import { generateMap, reachableFromStart, treasureFloor } from "../../src/core/map";
import { deriveStream } from "../../src/core/rng";

describe("지도 생성 (시드 500)", () => {
  it("모든 제약을 만족하고 모든 노드가 도달 가능하며 보스로 이어진다", () => {
    for (let i = 0; i < 500; i++) {
      const act = ((i % 3) + 1) as 1 | 2 | 3;
      const map = generateMap(deriveStream(`map-${i}`), act);
      const nodes = Object.values(map.nodes);
      const L = map.floors;
      const reach = reachableFromStart(map);
      for (const n of nodes) {
        expect(reach.has(n.id)).toBe(true);
        if (n.type === "boss") continue;
        // 보스로 이어짐
        const seen = new Set<string>();
        const stack = [n.id];
        let reachesBoss = false;
        while (stack.length) {
          const id = stack.pop()!;
          if (id === map.bossId) reachesBoss = true;
          if (seen.has(id)) continue;
          seen.add(id);
          stack.push(...map.nodes[id]!.next);
        }
        expect(reachesBoss).toBe(true);
        if (n.floor === 1) expect(n.type).toBe("battle");
        if (n.floor === treasureFloor(act)) expect(n.type).toBe("treasure");
        if (n.floor === L) expect(n.type).toBe("rest");
        if (n.floor < 4) expect(["elite", "rest"]).not.toContain(n.type);
        if (n.floor === L - 1) expect(n.type).not.toBe("rest");
        const fixed = (f: number) => f === 1 || f === treasureFloor(act) || f === L;
        for (const nx of n.next) {
          const child = map.nodes[nx]!;
          if (child.type === "boss" || fixed(child.floor) || fixed(n.floor)) continue;
          if (["elite", "rest", "shop"].includes(n.type)) expect(child.type).not.toBe(n.type);
        }
        if (n.next.length >= 2) {
          const kids = n.next.map((id) => map.nodes[id]!).filter((k) => k.type !== "boss" && !fixed(k.floor));
          expect(new Set(kids.map((k) => k.type)).size).toBe(kids.length);
        }
      }
      // 교차 금지
      for (const a of nodes) for (const b of nodes) {
        if (a.floor !== b.floor || a.col >= b.col) continue;
        for (const an of a.next) for (const bn of b.next) {
          const ac = map.nodes[an]!, bc = map.nodes[bn]!;
          if (ac.type === "boss" || bc.type === "boss") continue;
          expect(ac.col <= bc.col).toBe(true);
        }
      }
    }
  });
});
