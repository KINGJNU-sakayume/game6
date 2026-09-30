import { describe, expect, it } from "vitest";
import { choose, makeCombat, makeEnemy, play } from "../helpers";
import { gradeFor, resistancePct, calcPlayerDamage, planMatches } from "../../src/core/damage";
import { cardDef } from "../../src/core/registry";
import { combinePct } from "../../src/core/util";

const grade = (disease: string, card: string, variant?: string, phase = 0) => {
  const e = makeEnemy({ disease, variant, phase }, 0);
  const d = cardDef(card);
  return gradeFor(e, d.tags, d.drug?.spectrum);
};

const calc = (s: ReturnType<typeof makeCombat>, cardId: string, base: number) => {
  const e = s.combat!.enemies[0]!;
  return calcPlayerDamage(s, { owner: { kind: "card", id: "x", cardId }, targetUid: e.uid }, e, base, cardDef(cardId).tags, undefined).final;
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
  it("세프트리악손(11) → 폐렴알균 폐렴: 우수 ×1.5 = 16. 진단 점수·확진 보너스는 없다", () => {
    const s = makeCombat({ enemies: [{ disease: "cap", variant: "pneumococcus" }] });
    expect(calc(s, "ceftriaxone", 11)).toBe(16);
    const t = makeCombat({ enemies: [{ disease: "cap", variant: "pneumococcus", confirmed: true }] });
    expect(calc(t, "ceftriaxone", 11)).toBe(16);
  });
  it("치료 계획 일치(×1.3): 원인균을 배양으로 확인하고 작업 진단이 폐렴이면 16 → 21", () => {
    const s = makeCombat({ enemies: [{ disease: "cap", variant: "pneumococcus", workingDx: "cap", organismKnown: true }] });
    expect(calc(s, "ceftriaxone", 11)).toBe(21);
  });
  it("원인균을 모르면 폐렴에 세프트리악손은 1차가 아니다(비정형균이면 무효): 계획 보너스 없음", () => {
    const s = makeCombat({ enemies: [{ disease: "cap", variant: "pneumococcus", workingDx: "cap" }] });
    expect(planMatches(s.combat!.enemies[0]!, cardDef("ceftriaxone"), cardDef("ceftriaxone").tags)).toBe(false);
    expect(calc(s, "ceftriaxone", 11)).toBe(16);
  });
  it("계획 보너스는 작업 진단 기준이다: 틀린 작업 진단에는 붙지 않는다", () => {
    const right = makeCombat({ enemies: [{ disease: "anaphylaxis", hypotheses: ["asthma", "anaphylaxis"], workingDx: "anaphylaxis" }] });
    const wrong = makeCombat({ enemies: [{ disease: "anaphylaxis", hypotheses: ["asthma", "anaphylaxis"], workingDx: "asthma" }] });
    const epi = cardDef("epinephrine");
    expect(planMatches(right.combat!.enemies[0]!, epi, epi.tags)).toBe(true);
    expect(planMatches(wrong.combat!.enemies[0]!, epi, epi.tags)).toBe(false);
    expect(calc(right, "epinephrine", 10)).toBeGreaterThan(calc(wrong, "epinephrine", 10));
  });
  it("취약한 대상에 보존적 치료 5 → 7, 환자가 위축이면 5 → 3", () => {
    let s = makeCombat({ hand: ["supportive_care"], enemies: [{ disease: "gastroenteritis" }] });
    s.combat!.enemies[0]!.statuses.push({ id: "vulnerable", stacks: 1 });
    const before = s.combat!.enemies[0]!.severity;
    s = play(s, "supportive_care").state;
    expect(before - s.combat!.enemies[0]!.severity).toBe(7);
    let t = makeCombat({ hand: ["supportive_care"], enemies: [{ disease: "gastroenteritis" }] });
    t.combat!.patientStatuses.push({ id: "weak", stacks: 1 });
    const b2 = t.combat!.enemies[0]!.severity;
    t = play(t, "supportive_care").state;
    expect(b2 - t.combat!.enemies[0]!.severity).toBe(3);
  });
  it("질병의 안정화가 먼저 피해를 흡수한다", () => {
    let s = makeCombat({ hand: ["supportive_care"], enemies: [{ disease: "gastroenteritis" }] });
    s.combat!.enemies[0]!.stability = 4;
    const before = s.combat!.enemies[0]!.severity;
    s = play(s, "supportive_care").state;
    expect(s.combat!.enemies[0]!.stability).toBe(0);
    expect(before - s.combat!.enemies[0]!.severity).toBe(1);
  });
  it("금기 처치(맥박 있는 STEMI에 제세동)는 질병을 악화시키고 '악화' 반응 소견을 남긴다", () => {
    let s = makeCombat({ hand: ["defibrillation"], enemies: [{ disease: "stemi", severity: 60 }], orders: 5 });
    s.combat!.enemies[0]!.severity = 50;
    s = play(s, "defibrillation").state;
    expect(s.pending?.kind).toBe("choose_option");
    s = choose(s, "now").state;
    const e = s.combat!.enemies[0]!;
    expect(e.severity).toBeGreaterThan(50);
    expect(e.statuses.find((x) => x.id === "aggravation")?.stacks).toBe(1);
    expect(e.observations.some((o) => o.channel.startsWith("rx:") && o.finding === "rx_worse")).toBe(true);
  });
});
