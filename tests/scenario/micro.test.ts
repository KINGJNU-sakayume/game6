// v2.1 미생물 기록과 선택 압력: 배양은 전투를 넘어 자라고, 결과·감수성은 차트에 남고, 항생제 이력이 이후 감염의 원인균을 기울인다.
import { describe, expect, it } from "vitest";
import { act, makeCombat, play, playChoose } from "../helpers";
import { diseaseDef, microView, visibleEnemyInfo } from "../../src/core";
import { startCombat } from "../../src/core/combat";
import { finishCombatVictory } from "../../src/core/run";
import { micro, variantWeight } from "../../src/core/micro";

describe("런 단위 미생물 기록", () => {
  it("전투가 끝날 때 배양 중인 검체는 다음 전투에서 결과가 나오고 차트에 남는다", () => {
    let s = makeCombat({ hand: ["culture"], enemies: [{ disease: "pyelo", variant: "esbl" }], orders: 3 });
    s = playChoose(s, "culture", ["urine"]).state;
    expect(micro(s).results).toEqual([]);
    finishCombatVictory(s);
    expect(micro(s).pending.map((p) => p.channel)).toEqual(["cx_urine"]);
    expect(micro(s).pending[0]!.organism).toBe("esbl");
    // 진단명은 확진 전이라 주호소로 적힌다
    expect(micro(s).pending[0]!.source).not.toContain("신우신염");
    s.phase = "map";
    s.reward = undefined;
    startCombat(s, "n1_abd", "normal");
    expect(micro(s).pending).toEqual([]);
    expect(micro(s).results[0]!.organism).toBe("esbl");
    expect(s.combat!.log.some((l) => l.text.includes("미생물 검사실 회신"))).toBe(true);
    const v = microView(s);
    expect(v.results[0]!.organism).toBeDefined();
    expect(v.results[0]!.antibiogram!.find((c) => c.cardId === "ceftriaxone")!.grade).toBe("immune");
  });

  it("전투 중에 나온 배양 결과도 차트에 남는다", () => {
    let s = makeCombat({ hand: ["culture"], enemies: [{ disease: "pyelo", variant: "ecoli" }], orders: 3 });
    s = playChoose(s, "culture", ["urine"]).state;
    for (let i = 0; i < 2; i++) {
      s.combat!.stability = 999;
      s = act(s, { type: "end_turn" }).state;
    }
    expect(micro(s).results.map((r) => r.organism)).toEqual(["ecoli"]);
  });
});

describe("선택 압력", () => {
  it("광범위 항생제 +2, 원인균을 모르는 좁은 항생제 +1, 원인균을 아는 좁은 항생제 0", () => {
    let s = makeCombat({ hand: ["pip_tazo", "ceftriaxone"], formulary: ["pip_tazo", "ceftriaxone"], enemies: [{ disease: "cap", variant: "pneumococcus", severity: 300 }] });
    s = play(s, "pip_tazo").state;
    expect(micro(s).pressure).toBe(2);
    s = play(s, "ceftriaxone").state;
    expect(micro(s).pressure).toBe(3);
    let t = makeCombat({ hand: ["ceftriaxone"], enemies: [{ disease: "cap", variant: "pneumococcus", severity: 300, organismKnown: true }] });
    t = play(t, "ceftriaxone").state;
    expect(micro(t).pressure).toBe(0);
  });

  it("범위 축소는 이번 전투(오더 +1, 카드 1장)와 런(선택 압력 −2)에 이득이다", () => {
    let s = makeCombat({ hand: ["pip_tazo", "med_review"], enemies: [{ disease: "pyelo", variant: "ecoli", severity: 300, organismKnown: true }], orders: 3 });
    s = play(s, "pip_tazo").state;
    micro(s).pressure = 5;
    const orders = s.combat!.orders;
    const hand = s.combat!.hand.length;
    s = playChoose(s, "med_review", ["deescalate"]).state;
    expect(s.run.stats.deescalations).toBe(1);
    expect(micro(s).pressure).toBe(3);
    // med_review 비용 1을 내고 오더 1을 돌려받는다
    expect(s.combat!.orders).toBe(orders - 1 + 1);
    expect(s.combat!.hand.length).toBe(hand - 1 + 1);
  });

  it("선택 압력과 차트의 균(집락)은 내성균 변이의 가중치만 올린다", () => {
    const s = makeCombat({});
    const cel = diseaseDef("cellulitis");
    const mrsa = cel.variants!.find((v) => v.id === "mrsa")!;
    const mssa = cel.variants!.find((v) => v.id === "mssa")!;
    expect(variantWeight(s, mrsa)).toBe(mrsa.weight);
    micro(s).pressure = 5;
    expect(variantWeight(s, mrsa)).toBe(Math.floor(mrsa.weight * 1.5));
    expect(variantWeight(s, mssa)).toBe(mssa.weight);
    micro(s).results.push({ channel: "cx_wound", finding: "cx_wound_mrsa", organism: "mrsa", source: "다리 부종", act: 2, floor: 3 });
    expect(variantWeight(s, mrsa)).toBe(Math.floor(mrsa.weight * 2.5));
  });

  it("차트의 균은 원인균 후보로 보이지만, 이번 문제의 원인균은 배양 전까지 숨는다", () => {
    const s = makeCombat({ enemies: [{ disease: "cellulitis", variant: "mssa" }] });
    micro(s).results.push({ channel: "cx_wound", finding: "cx_wound_mrsa", organism: "mrsa", source: "다리 부종", act: 2, floor: 3 });
    const v = visibleEnemyInfo(s, "e1")!;
    expect(v.organism.known).toBeUndefined();
    expect(v.organism.chart).toEqual(["MRSA"]);
  });
});
