import { describe, expect, it } from "vitest";
import { act, allPileIds, handIds, makeCombat, play } from "../helpers";

describe("투여 중 약물과 반감기 (R2)", () => {
  it("노르에피네프린을 쓴 다음 턴 시작에 안정화 3을 얻는다", () => {
    let s = makeCombat({ hand: ["norepinephrine"], enemies: [{ disease: "septic_shock", variant: "gram_neg" }] });
    s = play(s, "norepinephrine").state;
    expect(s.combat!.activeDrugs.map((d) => d.cardId)).toContain("norepinephrine");
    s = act(s, { type: "end_turn" }).state;
    expect(s.combat!.turn).toBe(2);
    expect(s.combat!.stability).toBeGreaterThanOrEqual(3);
    // 반감기 2: 2턴 째에도 투여 중
    expect(s.combat!.activeDrugs.find((d) => d.cardId === "norepinephrine")?.turnsLeft).toBe(1);
  });
  it("반감기 1 약물도 적 턴과 다음 턴 시작까지 유지된다", () => {
    let s = makeCombat({ hand: ["epinephrine"], enemies: [{ disease: "anaphylaxis", severity: 150 }] });
    s = play(s, "epinephrine").state;
    expect(s.combat!.activeDrugs.some((d) => d.cardId === "epinephrine")).toBe(true);
    s = act(s, { type: "end_turn" }).state;
    // 턴 시작 처리 마지막에 종료
    expect(s.combat!.activeDrugs.some((d) => d.cardId === "epinephrine")).toBe(false);
  });
  it("패혈성 쇼크 2단계: 승압제가 투여 중이면 저혈압 피해가 없다", () => {
    let s = makeCombat({ hand: ["norepinephrine"], enemies: [{ disease: "septic_shock", variant: "gram_neg", phase: 1 }] });
    s.combat!.patientStatuses.push({ id: "hypotension", stacks: 3 });
    s = play(s, "norepinephrine").state;
    s.combat!.stability = 999; // 적 공격을 막아 저혈압만 본다
    const before = s.run.vitality;
    s = act(s, { type: "end_turn" }).state;
    expect(s.run.vitality).toBe(before);
  });
  it("승압제가 없으면 저혈압만큼 활력을 잃는다", () => {
    let s = makeCombat({ hand: [], enemies: [{ disease: "septic_shock", variant: "gram_neg", phase: 1 }] });
    s.combat!.patientStatuses.push({ id: "hypotension", stacks: 3 });
    s.combat!.stability = 999;
    const before = s.run.vitality;
    s = act(s, { type: "end_turn" }).state;
    expect(before - s.run.vitality).toBe(3);
  });
  it("재투여하면 지속만 갱신되고 자기 자신과 상호작용하지 않는다", () => {
    let s = makeCombat({ hand: ["levofloxacin", "levofloxacin"], enemies: [{ disease: "cap", variant: "pneumococcus" }] });
    s = play(s, "levofloxacin").state;
    const r = play(s, "levofloxacin");
    expect(r.events.some((e) => e.type === "interaction_fired")).toBe(false);
    expect(r.state.combat!.activeDrugs.filter((d) => d.cardId === "levofloxacin")).toHaveLength(1);
  });
});

describe("부작용 생성 시점 (R3)", () => {
  it("포도당 투여 중 인슐린을 쓰면 저혈당 카드가 생기지 않는다 (S4)", () => {
    let s = makeCombat({ hand: ["kcl", "dextrose", "insulin"], enemies: [{ disease: "dka" }] });
    s = play(s, "kcl").state;
    s = play(s, "dextrose").state;
    const r = play(s, "insulin");
    expect(r.events.some((e) => e.type === "interaction_fired" && e.ruleId === "S4")).toBe(true);
    expect(allPileIds(r.state)).not.toContain("hypoglycemia");
  });
  it("포도당 없이 인슐린을 쓰면 저혈당이 생긴다", () => {
    let s = makeCombat({ hand: ["kcl", "insulin"], enemies: [{ disease: "dka" }] });
    s = play(s, "kcl").state;
    s = play(s, "insulin").state;
    expect(allPileIds(s)).toContain("hypoglycemia");
  });
  it("투약 5R 원칙은 첫 약물 부작용을 막는다", () => {
    let s = makeCombat({ hand: ["ceftriaxone", "ceftriaxone"], relics: ["five_rights"], enemies: [{ disease: "cap", variant: "pneumococcus" }] });
    s = play(s, "ceftriaxone").state;
    expect(allPileIds(s)).not.toContain("rash");
    s = play(s, "ceftriaxone").state;
    expect(allPileIds(s)).toContain("rash");
  });
});

describe("상호작용 규칙", () => {
  it("H1: 레보플록사신 → 온단세트론이면 손에 부정맥", () => {
    let s = makeCombat({ hand: ["levofloxacin", "ondansetron"] });
    s = play(s, "levofloxacin").state;
    const r = play(s, "ondansetron");
    expect(r.events.some((e) => e.type === "interaction_fired" && e.ruleId === "H1")).toBe(true);
    expect(handIds(r.state)).toContain("arrhythmia");
  });
  it("H1 비발동: 온단세트론 단독", () => {
    const s = makeCombat({ hand: ["ondansetron"] });
    const r = play(s, "ondansetron");
    expect(r.events.some((e) => e.type === "interaction_fired")).toBe(false);
  });
  it("H8: 칼륨 없이 인슐린 → 저칼륨혈증, 염화칼륨 뒤에는 없음", () => {
    let s = makeCombat({ hand: ["insulin"], enemies: [{ disease: "dka" }] });
    let r = play(s, "insulin");
    expect(r.events.some((e) => e.type === "interaction_fired" && e.ruleId === "H8")).toBe(true);
    s = makeCombat({ hand: ["kcl", "insulin"], enemies: [{ disease: "dka" }] });
    s = play(s, "kcl").state;
    r = play(s, "insulin");
    expect(r.events.some((e) => e.type === "interaction_fired" && e.ruleId === "H8")).toBe(false);
  });
  it("S1: 겐타마이신 투여 중 세프트리악손은 ×1.5가 같은 카드 피해에 반영된다", () => {
    let s = makeCombat({ hand: ["gentamicin", "ceftriaxone"], enemies: [{ disease: "pyelo", variant: "ecoli", severity: 200 }] });
    s = play(s, "gentamicin").state;
    const before = s.combat!.enemies[0]!.severity;
    s = play(s, "ceftriaxone").state;
    // 11 × 우수 150 × 내성(겐타마이신은 aminoglycoside라 무관) × S1 150 = 24
    expect(before - s.combat!.enemies[0]!.severity).toBe(24);
  });
  it("S3는 급성 관상동맥 증후군에서만 발동한다 (R10)", () => {
    let s = makeCombat({ hand: ["aspirin", "heparin"], enemies: [{ disease: "stemi" }] });
    s = play(s, "aspirin").state;
    let r = play(s, "heparin");
    expect(r.events.some((e) => e.type === "interaction_fired" && e.ruleId === "S3")).toBe(true);
    s = makeCombat({ hand: ["aspirin", "heparin"], enemies: [{ disease: "dvt" }] });
    s = play(s, "aspirin").state;
    r = play(s, "heparin");
    expect(r.events.some((e) => e.type === "interaction_fired" && e.ruleId === "S3")).toBe(false);
    expect(r.events.some((e) => e.type === "interaction_fired" && e.ruleId === "H7")).toBe(true);
  });
  it("같은 규칙은 한 번의 투여에서 한 번만 발동한다", () => {
    let s = makeCombat({ hand: ["levofloxacin", "haloperidol", "ondansetron"], orders: 5 });
    s = play(s, "levofloxacin").state;
    s = play(s, "haloperidol").state;
    const r = play(s, "ondansetron");
    expect(r.events.filter((e) => e.type === "interaction_fired" && e.ruleId === "H1")).toHaveLength(1);
  });
  it("DUR 시스템은 첫 위험 상호작용을 막는다", () => {
    let s = makeCombat({ hand: ["levofloxacin", "ondansetron"], relics: ["dur_system"] });
    s = play(s, "levofloxacin").state;
    const r = play(s, "ondansetron");
    expect(r.events.some((e) => e.type === "dur_blocked")).toBe(true);
    expect(handIds(r.state)).not.toContain("arrhythmia");
  });
  it("A1: 날록손은 오피오이드를 종료하고 호흡억제를 없앤다 (과진정은 남는다, R11)", () => {
    let s = makeCombat({ hand: ["morphine", "naloxone"] });
    s = play(s, "morphine").state;
    s.combat!.hand.push({ uid: "rd1", cardId: "resp_depression", upgraded: false }, { uid: "os1", cardId: "oversedation", upgraded: false });
    s = play(s, "naloxone").state;
    expect(s.combat!.activeDrugs.some((d) => d.cardId === "morphine")).toBe(false);
    expect(handIds(s)).not.toContain("resp_depression");
    expect(handIds(s)).toContain("oversedation");
  });
});

describe("전신 금기", () => {
  it("급성 신손상과 함께 있으면 폐렴을 겨냥한 반코마이신도 신손상을 악화시킨다", () => {
    let s = makeCombat({ hand: ["vancomycin"], enemies: [{ disease: "vap", variant: "mrsa" }, { disease: "aki" }] });
    const aki = s.combat!.enemies[1]!;
    aki.severity = 30;
    s = play(s, "vancomycin", "e1").state;
    expect(s.combat!.enemies[1]!.severity).toBeGreaterThan(30);
  });
});

describe("부작용 수명", () => {
  it("전투 한정 부작용은 전투 후 덱에 없고, 지속 부작용은 남는다", () => {
    let s = makeCombat({ hand: ["amiodarone", "ceftriaxone"], enemies: [{ disease: "af", severity: 5 }], orders: 5 });
    s = play(s, "ceftriaxone").state; // 발진 (전투 한정)
    s = play(s, "amiodarone").state; // 폐 독성 (지속), 적 치료
    expect(s.phase).toBe("reward");
    const ids = s.run.deck.map((c) => c.cardId);
    expect(ids).toContain("lung_toxicity");
    expect(ids).not.toContain("rash");
  });
});

describe("효과 순서 (R4)", () => {
  it("card_played 반응은 카드 효과 뒤에 온다", () => {
    const s = makeCombat({ hand: ["first_aid"], enemies: [{ disease: "gastroenteritis" }] });
    const r = play(s, "first_aid");
    const iDamage = r.events.findIndex((e) => e.type === "damage");
    const iPlayed = r.events.findIndex((e) => e.type === "card_played");
    expect(iPlayed).toBeGreaterThanOrEqual(0);
    expect(iDamage).toBeGreaterThan(iPlayed);
  });
});
