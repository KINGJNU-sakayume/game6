import { describe, expect, it } from "vitest";
import { CONTENT } from "../../src/content";
import { describeCard, validateContent } from "../../src/core";

describe("콘텐츠", () => {
  it("validateContent 오류 0 (선택지 조건은 플레이어가 아는 정보만, 선택지 2–4개)", () => {
    const r = validateContent(CONTENT);
    expect(r.errors).toEqual([]);
  });
  it("개수: 카드 57(행동 18·처방집 39) / 질병 27 / 내원 양상 24 / 협진 10 / 유물 17 / 규칙 17", () => {
    const cards = CONTENT.cards.filter((c) => c.kind !== "side_effect" && c.rarity !== "starter");
    expect(cards).toHaveLength(57);
    expect(cards.filter((c) => c.zone === "formulary")).toHaveLength(39);
    expect(CONTENT.diseases).toHaveLength(27);
    expect(CONTENT.presentations).toHaveLength(24);
    expect(CONTENT.consults).toHaveLength(10);
    expect(CONTENT.relics.filter((r) => r.tier !== "special")).toHaveLength(17);
    expect(CONTENT.interactions).toHaveLength(17);
  });
  it("단순 카드가 절반 이상이다 (결정은 필요한 곳에만)", () => {
    const cards = CONTENT.cards.filter((c) => c.kind !== "side_effect");
    const modal = cards.filter((c) => /"op":"(choose_option|discover|consult)"/.test(JSON.stringify(c.effects)) || c.procedure);
    expect(modal.length / cards.length).toBeLessThanOrEqual(0.5);
    expect(modal.length).toBeGreaterThanOrEqual(15);
  });
  it("모든 내원 양상의 감별 대상은 적어도 한 경로에서 서로 다른 소견을 낸다", () => {
    // validateContent가 검사하지만, 여기서는 오류 문구로 한 번 더 확인
    expect(validateContent(CONTENT).errors.filter((e) => e.includes("구별"))).toEqual([]);
  });
  it("설명문이 한국어로 생성된다", () => {
    expect(describeCard("ceftriaxone").lines[0]).toBe("질병 부담 11 감소");
    expect(describeCard("ceftriaxone").sideEffectLine).toBe("부작용: 발진 → 완료 처방");
    expect(describeCard("history").options).toEqual(["발병 양상과 경과", "동반 증상", "병력·약물·위험 인자"]);
    expect(describeCard("history").full).toBe("하나를 고른다: 발병 양상과 경과 · 동반 증상 · 병력·약물·위험 인자");
    expect(describeCard("saline").options).toContain("적극적 소생 (+1)");
    expect(describeCard("med_order").lines[0]).toContain("처방집");
  });
});
