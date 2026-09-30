// 보상 3칸(일반·상황·특수)과 처방집, 퇴원 요약
import { describe, expect, it } from "vitest";
import { makeCombat, play } from "../helpers";
import { contextRelevance, db, step } from "../../src/core";
import { cardDef } from "../../src/core/registry";
import { gainCard } from "../../src/core/run";
import type { GameState, RewardItem } from "../../src/core";

function winCombat(seed: string, kind: "normal" | "elite" | "gate" | "boss" = "normal", act: 1 | 2 | 3 = 1): GameState {
  let s = makeCombat({ seed, hand: ["supportive_care"], enemies: [{ disease: "pyelo", variant: "ecoli", severity: 1 }] });
  s.run.act = act;
  s.run.floor = 2;
  s.combat!.kind = kind;
  s = play(s, "supportive_care").state;
  expect(s.phase).toBe("reward");
  return s;
}

const cardItems = (s: GameState) => s.reward!.items.filter((i): i is Extract<RewardItem, { kind: "card" }> => i.kind === "card");

describe("카드 보상", () => {
  it("세 칸: 일반(행동 덱) · 상황(이번 막 환자에게 듣는 처방집) · 특수", () => {
    for (let i = 0; i < 25; i++) {
      const s = winCombat(`rw-${i}`);
      const opts = cardItems(s)[0]!.options;
      expect(opts.map((o) => o.slot)).toEqual(["general", "context", "special"]);
      expect(new Set(opts.map((o) => o.cardId)).size).toBe(3);
      const general = opts[0]!;
      expect(cardDef(general.cardId).zone ?? "deck").toBe("deck");
      const ctx = opts[1]!;
      if (cardDef(ctx.cardId).zone === "formulary") {
        expect(s.run.formulary.map((c) => c.cardId)).not.toContain(ctx.cardId);
        expect(contextRelevance(s, ctx.cardId, [1, 2])).toBeGreaterThan(0);
      }
    }
  });

  it("약·시술을 고르면 처방집으로, 행동 카드는 덱으로 간다", () => {
    let s = winCombat("rw-zone");
    const item = s.reward!.items.findIndex((i) => i.kind === "card");
    const opts = cardItems(s)[0]!.options;
    const idx = opts.findIndex((o) => cardDef(o.cardId).zone === "formulary");
    expect(idx).toBeGreaterThanOrEqual(0);
    const id = opts[idx]!.cardId;
    const deckBefore = s.run.deck.length;
    const r = step(s, { type: "claim_reward", item, choice: idx });
    expect(r.events[0]?.type).not.toBe("action_rejected");
    s = r.state;
    expect(s.run.formulary.map((c) => c.cardId)).toContain(id);
    expect(s.run.deck.length).toBe(deckBefore);
  });

  it("이미 처방집에 있는 약을 또 얻으면 최적화(강화)된다", () => {
    const s = winCombat("rw-dup");
    const have = s.run.formulary.find((c) => c.cardId === "ceftriaxone")!;
    expect(have.upgraded).toBe(false);
    gainCard(s, "ceftriaxone");
    expect(s.run.formulary.filter((c) => c.cardId === "ceftriaxone")).toHaveLength(1);
    expect(have.upgraded).toBe(true);
  });

  it("관문·보스 보상에는 다음 막 환자를 위한 처방집 신청(1/3)이 붙는다", () => {
    const s = winCombat("rw-boss", "boss", 1);
    const items = cardItems(s);
    expect(items).toHaveLength(2);
    const next = items[1]!.options;
    expect(next.length).toBeGreaterThanOrEqual(2);
    for (const o of next) {
      expect(cardDef(o.cardId).zone).toBe("formulary");
      expect(contextRelevance(s, o.cardId, [2])).toBeGreaterThan(0);
    }
  });

  it("퇴원 요약이 전투 뒤에야 실제 진단을 공개한다", () => {
    const s = winCombat("rw-sum");
    const row = s.reward!.summary![0]!;
    expect(row.diseaseId).toBe("pyelo");
    expect(row.variantName).toBe("대장균");
    expect(s.run.casebook.pyelo).toBe("confirmed");
  });
});

describe("처방집 콘텐츠", () => {
  it("약은 모두 처방집에, 시작 덱에는 약이 없다", () => {
    for (const c of db().cards) if (c.kind === "drug") expect(c.zone, c.id).toBe("formulary");
    for (const id of db().starterDeck) expect(cardDef(id).kind).not.toBe("drug");
    for (const id of db().starterFormulary) expect(cardDef(id).zone).toBe("formulary");
  });
});
