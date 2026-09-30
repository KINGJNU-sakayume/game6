import { describe, expect, it } from "vitest";
import { CONTENT } from "../../src/content";
import { describeCard, validateContent } from "../../src/core";

describe("콘텐츠", () => {
  it("validateContent 오류 0", () => {
    const r = validateContent(CONTENT);
    expect(r.errors).toEqual([]);
  });
  it("개수: 카드 64 / 질병 27 / 유물 17 / 규칙 17", () => {
    expect(CONTENT.cards.filter((c) => c.kind !== "side_effect" && c.rarity !== "starter")).toHaveLength(64);
    expect(CONTENT.diseases).toHaveLength(27);
    expect(CONTENT.relics.filter((r) => r.tier !== "special")).toHaveLength(17);
    expect(CONTENT.interactions).toHaveLength(17);
  });
  it("설명문이 한국어로 생성된다", () => {
    expect(describeCard("ceftriaxone").lines[0]).toBe("중증도 11 감소");
    expect(describeCard("ceftriaxone").sideEffectLine).toBe("부작용: 발진 → 완료 처방");
    expect(describeCard("urinalysis").lines.join(" ")).toContain("대상이");
    expect(describeCard("reassessment").lines[0]).toContain("대신 10");
  });
});
