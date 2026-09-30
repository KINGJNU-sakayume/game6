import { describe, expect, it } from "vitest";
import { makeCombat, makeEnemy, play } from "../helpers";
import { gradeFor, resistancePct, calcPlayerDamage } from "../../src/core/damage";
import { cardDef } from "../../src/core/registry";
import { combinePct } from "../../src/core/util";

const grade = (disease: string, card: string, variant?: string, phase = 0) => {
  const e = makeEnemy({ disease, variant, phase }, 0);
  const d = cardDef(card);
  return gradeFor(e, d.tags, d.drug?.spectrum);
};

describe("적응증·스펙트럼 판정 (R1)", () => {
  it("푸로세미드로 폐렴을 공격하면 적응증 아님", () => {
    const g = grade("cap", "furosemide", "pneumococcus");
    expect(g.pct).toBe(0);
    expect(g.grade).toBe("not_indicated");
  });
  it("겐타마이신은 폐렴알균 폐렴에 무효, 신우신염 대장균에는 우수", () => {
    expect(grade("cap", "gentamicin", "pneumococcus").grade).toBe("immune");
    expect(grade("pyelo", "gentamicin", "ecoli").grade).toBe("weak");
  });
  it("비정형균 폐렴에 세프트리악손 무효, 레보플록사신 우수", () => {
    expect(grade("cap", "ceftriaxone", "atypical").pct).toBe(0);
    expect(grade("cap", "levofloxacin", "atypical").grade).toBe("weak");
  });
  it("범용 처치는 어디서나 100", () => {
    const g = grade("dka", "supportive_care");
    expect(g.basis).toBe("generic");
    expect(g.pct).toBe(100);
  });
  it("에피네프린은 아나필락시스에 특효(200), 천식에는 저하", () => {
    expect(grade("anaphylaxis", "epinephrine").pct).toBe(200);
    expect(grade("asthma", "epinephrine").grade).toBe("resistant");
  });
  it("금기: 심부전에 수액, 천식에 β차단제, C. diff에 세프트리악손", () => {
    expect(grade("chf", "saline").harmful).toBe(true);
    expect(grade("asthma", "metoprolol").harmful).toBe(true);
    expect(grade("cdi", "ceftriaxone").harmful).toBe(true);
    expect(grade("cdi", "metronidazole").grade).toBe("weak");
  });
  it("STEMI 1단계에서 제세동은 금기, 심실세동 단계에서는 특효", () => {
    expect(grade("stemi", "defibrillation").harmful).toBe(true);
    expect(grade("stemi", "defibrillation", undefined, 1).pct).toBe(200);
  });
  it("뇌경색 골든타임이 지나면 혈전용해 금기", () => {
    expect(grade("stroke", "alteplase").pct).toBe(200);
    expect(grade("stroke", "alteplase", undefined, 1).harmful).toBe(true);
  });
  it("MRSA 봉와직염: 세프트리악손 무효, 반코마이신 우수", () => {
    expect(grade("cellulitis", "ceftriaxone", "mrsa").pct).toBe(0);
    expect(grade("cellulitis", "vancomycin", "mrsa").grade).toBe("weak");
  });
});

describe("피해 파이프라인", () => {
  it("내성 배율 n=0,1,2,3,5 → 100, 80, 60, 40, 40", () => {
    expect([0, 1, 2, 3, 5].map(resistancePct)).toEqual([100, 80, 60, 40, 40]);
  });
  it("배율을 차례로 합성하며 내림한다 (R36)", () => {
    expect(combinePct([150, 150, 75])).toBe(168); // 100→150→225→168
    expect(combinePct([200, 150, 100, 225, 150, 100])).toBe(1012);
  });
  it("세프트리악손(11) → 확진된 폐렴알균 폐렴: 우수 ×1.5, 표적 ×1.5 = 24", () => {
    const s = makeCombat({ hand: ["ceftriaxone"], enemies: [{ disease: "cap", variant: "pneumococcus", knowledge: 2 }] });
    const e = s.combat!.enemies[0]!;
    const calc = calcPlayerDamage(s, { owner: { kind: "card", id: "x", cardId: "ceftriaxone" }, targetUid: e.uid }, e, 11, cardDef("ceftriaxone").tags, undefined);
    expect(calc.final).toBe(24);
  });
  it("같은 조건에서 확진 전이면 표적 보너스 없음 = 16", () => {
    const s = makeCombat({ enemies: [{ disease: "cap", variant: "pneumococcus", knowledge: 0 }] });
    const e = s.combat!.enemies[0]!;
    const calc = calcPlayerDamage(s, { owner: { kind: "card", id: "x", cardId: "ceftriaxone" }, targetUid: e.uid }, e, 11, cardDef("ceftriaxone").tags, undefined);
    expect(calc.final).toBe(16);
  });
  it("취약한 대상에 응급 처치 6 → 9, 환자가 위축이면 6 → 4", () => {
    let s = makeCombat({ hand: ["first_aid"], enemies: [{ disease: "gastroenteritis" }] });
    s.combat!.enemies[0]!.statuses.push({ id: "vulnerable", stacks: 1 });
    const before = s.combat!.enemies[0]!.severity;
    s = play(s, "first_aid").state;
    expect(before - s.combat!.enemies[0]!.severity).toBe(9);
    let t = makeCombat({ hand: ["first_aid"], enemies: [{ disease: "gastroenteritis" }] });
    t.combat!.patientStatuses.push({ id: "weak", stacks: 1 });
    const b2 = t.combat!.enemies[0]!.severity;
    t = play(t, "first_aid").state;
    expect(b2 - t.combat!.enemies[0]!.severity).toBe(4);
  });
  it("안정화가 먼저 피해를 흡수한다", () => {
    let s = makeCombat({ hand: ["first_aid"], enemies: [{ disease: "gastroenteritis" }] });
    s.combat!.enemies[0]!.stability = 4;
    const before = s.combat!.enemies[0]!.severity;
    s = play(s, "first_aid").state;
    expect(s.combat!.enemies[0]!.stability).toBe(0);
    expect(before - s.combat!.enemies[0]!.severity).toBe(2);
  });
  it("금기 처치(맥박 있는 STEMI에 제세동)는 질병을 회복시키고 악화 +1", () => {
    let s = makeCombat({ hand: ["defibrillation"], enemies: [{ disease: "stemi", severity: 60 }] });
    s.combat!.enemies[0]!.severity = 50;
    s = play(s, "defibrillation").state;
    const e = s.combat!.enemies[0]!;
    expect(e.severity).toBe(60); // max(6, 20/2) = 10 회복, 최대치 60
    expect(e.statuses.find((x) => x.id === "aggravation")?.stacks).toBe(1);
  });
});
