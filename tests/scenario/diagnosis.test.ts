import { describe, expect, it } from "vitest";
import { act, makeCombat, play } from "../helpers";
import { visibleEnemyInfo, previewDamage, previewInteractions } from "../../src/core";

describe("지식 단계와 EnemyView (R6)", () => {
  it("0단계: 주호소와 단서 1개만, 질병명·변이·반응표 없음", () => {
    const s = makeCombat({ enemies: [{ disease: "cellulitis", variant: "mrsa" }] });
    const v = visibleEnemyInfo(s, "e1")!;
    expect(v.title).toBe("다리 부종");
    expect(v.clues).toHaveLength(1);
    expect(v.diseaseId).toBeUndefined();
    expect(v.variantName).toBeUndefined();
    expect(v.table).toBeUndefined();
    expect(v.intents).toHaveLength(1);
    expect(JSON.stringify(v)).not.toContain("MRSA");
  });
  it("1단계: 분류와 반응표는 보이지만 변이에 달린 항생제는 가려진다", () => {
    const s = makeCombat({ enemies: [{ disease: "cellulitis", variant: "mrsa", knowledge: 1 }] });
    const v = visibleEnemyInfo(s, "e1")!;
    expect(v.category?.nameKo).toBe("감염");
    expect(v.abx?.hidden).toBe(true);
    expect(JSON.stringify(v)).not.toContain("MRSA");
  });
  it("2단계: 질병명, 변이, 다음 의도 2개, 항생제 감수성", () => {
    const s = makeCombat({ enemies: [{ disease: "cellulitis", variant: "mrsa", knowledge: 2 }] });
    const v = visibleEnemyInfo(s, "e1")!;
    expect(v.title).toBe("봉와직염");
    expect(v.variantName).toBe("MRSA");
    expect(v.intents).toHaveLength(2);
    expect(v.abx?.cells?.find((x) => x.short === "VAN")?.grade).toBe("weak");
    expect(v.abx?.cells?.find((x) => x.short === "CRO")?.grade).toBe("immune");
  });
  it("비감염 질환은 1단계에서 '항생제 무효'가 보인다", () => {
    const s = makeCombat({ enemies: [{ disease: "asthma", knowledge: 1 }] });
    expect(visibleEnemyInfo(s, "e1")!.abx?.notInfection).toBe(true);
  });
  it("혈액 검사 2장이면 기본 질병이 확진된다", () => {
    let s = makeCombat({ hand: ["blood_test", "blood_test"], enemies: [{ disease: "cap", variant: "pneumococcus" }] });
    s = play(s, "blood_test").state;
    expect(s.combat!.enemies[0]!.knowledge).toBe(1);
    s = play(s, "blood_test").state;
    expect(s.combat!.enemies[0]!.knowledge).toBe(2);
    expect(s.run.casebook.cap).toBe("confirmed");
  });
  it("지연 진단(배양)은 정확히 2턴 뒤 턴 시작에 발동한다", () => {
    let s = makeCombat({ hand: ["culture"], enemies: [{ disease: "septic_shock", variant: "gram_neg" }] });
    s = play(s, "culture").state;
    expect(s.combat!.enemies[0]!.diagnosisPoints).toBe(1);
    s.combat!.stability = 999;
    s = act(s, { type: "end_turn" }).state;
    expect(s.combat!.enemies[0]!.diagnosisPoints).toBe(1);
    s.combat!.stability = 999;
    s = act(s, { type: "end_turn" }).state;
    expect(s.combat!.enemies[0]!.diagnosisPoints).toBe(5);
  });
});

describe("획득 내성 (R20)", () => {
  it("확진 전 세프트리악손은 베타락탐 내성을 쌓고, 확진 후에는 쌓지 않는다", () => {
    let s = makeCombat({ hand: ["ceftriaxone", "ceftriaxone"], enemies: [{ disease: "cap", variant: "pneumococcus", severity: 200 }] });
    s = play(s, "ceftriaxone").state;
    expect(s.combat!.enemies[0]!.acquiredResistance.beta_lactam).toBe(1);
    s.combat!.enemies[0]!.diagnosisPoints = 4;
    s.combat!.enemies[0]!.knowledge = 2;
    s = play(s, "ceftriaxone").state;
    expect(s.combat!.enemies[0]!.acquiredResistance.beta_lactam).toBe(1);
  });
  it("광범위 항생제는 확진 후에도 내성을 쌓는다", () => {
    let s = makeCombat({ hand: ["pip_tazo"], enemies: [{ disease: "cap", variant: "pneumococcus", severity: 200, knowledge: 2 }] });
    s = play(s, "pip_tazo").state;
    expect(s.combat!.enemies[0]!.acquiredResistance.beta_lactam).toBe(1);
  });
});

describe("미리보기는 숨겨진 정보를 누설하지 않는다", () => {
  it("0단계에서 약물 예상 피해는 등급 미상", () => {
    const s = makeCombat({ hand: ["ceftriaxone"], enemies: [{ disease: "cellulitis", variant: "mrsa" }] });
    const p = previewDamage(s, s.combat!.hand[0]!.uid, "e1")!;
    expect(p.known).toBe(false);
    expect(p.amount).toBe(11);
  });
  it("범용 처치는 0단계에서도 정확한 수치", () => {
    const s = makeCombat({ hand: ["first_aid"], enemies: [{ disease: "cellulitis", variant: "mrsa" }] });
    const p = previewDamage(s, s.combat!.hand[0]!.uid, "e1")!;
    expect(p.known).toBe(true);
    expect(p.amount).toBe(6);
  });
  it("대상 정보가 부족한 조건부 규칙은 '대상에 따라'로 표시", () => {
    let s = makeCombat({ hand: ["aspirin", "heparin"], enemies: [{ disease: "stemi" }] });
    s = play(s, "aspirin").state;
    const heparin = s.combat!.hand.find((h) => h.cardId === "heparin")!;
    const pv = previewInteractions(s, heparin.uid, "e1");
    const s3 = pv.find((p) => p.ruleId === "S3");
    expect(s3?.conditional).toBe(true);
  });
  it("알려진 금기는 DUR 창에 경고로 뜬다", () => {
    const s = makeCombat({ hand: ["saline"], enemies: [{ disease: "chf", knowledge: 1 }] });
    const pv = previewInteractions(s, s.combat!.hand[0]!.uid, "e1");
    expect(pv.some((p) => p.kind === "contraindication")).toBe(true);
  });
});
