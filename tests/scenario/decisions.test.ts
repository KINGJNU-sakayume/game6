// 임상 결정(choose_option) 회귀 테스트: 선택지, 킥커 비용, 여러 개 고르기, 중첩, 조건, 직렬화, 처방집 호출, 시술, 반납.
import { describe, expect, it } from "vitest";
import { act, allPileIds, choose, handIds, makeCombat, play, playChoose } from "../helpers";
import { legalActions, stateHash, step, visibleEnemyInfo } from "../../src/core";
import { cardDef } from "../../src/core/registry";
import type { GameState, PendingChoice } from "../../src/core";

type Choice = Extract<PendingChoice, { kind: "choose_option" }>;
const pending = (s: GameState) => {
  expect(s.pending?.kind).toBe("choose_option");
  return s.pending as Choice;
};

describe("결정 모달의 기본", () => {
  it("병력 청취: 선택지 3개, 고른 경로의 소견만 얻는다", () => {
    let s = makeCombat({ hand: ["history"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = play(s, "history").state;
    const p = pending(s);
    expect(p.options.map((o) => o.id)).toEqual(["hx_onset", "hx_assoc", "hx_risk"]);
    expect(p.options.every((o) => o.label && o.detail)).toBe(true);
    s = choose(s, "hx_assoc").state;
    const obs = s.combat!.enemies[0]!.observations.map((o) => o.channel);
    expect(obs).toContain("hx_assoc");
    expect(obs).not.toContain("hx_onset");
    expect(s.run.stats.modalDecisions).toBe(1);
  });

  it("이미 확인한 소견은 고를 수 없고 이유가 붙는다", () => {
    let s = makeCombat({ hand: ["history", "history"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = playChoose(s, "history", ["hx_onset"]).state;
    s = play(s, "history").state;
    const o = pending(s).options.find((x) => x.id === "hx_onset")!;
    expect(o.available).toBe(false);
    expect(o.reason).toContain("이미");
    expect(() => choose(s, "hx_onset")).toThrow();
  });

  it("킥커: CT는 오더 +1. 오더가 모자라면 고를 수 없고 '오더 부족' 이유가 보인다", () => {
    let s = makeCombat({ hand: ["imaging"], enemies: [{ disease: "pyelo", variant: "ecoli" }], orders: 1 });
    s = play(s, "imaging").state;
    const ct = pending(s).options.find((o) => o.id === "ct")!;
    expect(ct.cost).toBe(1);
    expect(ct.available).toBe(false);
    expect(ct.reason).toContain("오더 부족");
    let t = makeCombat({ hand: ["imaging"], enemies: [{ disease: "pyelo", variant: "ecoli" }], orders: 3 });
    t = playChoose(t, "imaging", ["ct"]).state;
    expect(t.combat!.orders).toBe(1);
    // 판독은 다음 턴: 결과 대기
    expect(visibleEnemyInfo(t, "e1")!.pending.map((x) => x.label).join()).toContain("CT");
  });

  it("여러 개 고르기: 강화한 병력 청취는 두 가지를 묻고, 두 번째는 건너뛸 수 있다", () => {
    let s = makeCombat({ hand: [], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s.combat!.hand.push({ uid: "up1", cardId: "history", upgraded: true });
    s = act(s, { type: "play_card", cardUid: "up1", targetUid: "e1" }).state;
    s = choose(s, "hx_onset").state;
    const p = pending(s);
    expect(p.canSkip).toBe(true);
    expect(p.options.map((o) => o.id)).toEqual(["hx_assoc", "hx_risk"]);
    expect(legalActions(s)).toContainEqual({ type: "choose_option", optionId: "skip" });
    s = choose(s, "skip").state;
    expect(s.pending).toBeUndefined();
  });

  it("조건부 선택지: 기다리는 결과가 없으면 '대기 결과 확인'을 고를 수 없다 (플레이어가 아는 조건)", () => {
    let s = makeCombat({ hand: ["reassessment"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = play(s, "reassessment").state;
    const o = pending(s).options.find((x) => x.id === "results")!;
    expect(o.available).toBe(false);
    expect(o.reason).toBe("기다리는 검사 결과가 없다");
  });

  it("중첩 결정: 협진 → 진료과 → 권고", () => {
    let s = makeCombat({ hand: ["consult"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = play(s, "consult").state;
    const spec = pending(s);
    expect(spec.options.length).toBeGreaterThanOrEqual(2);
    expect(spec.options.length).toBeLessThanOrEqual(4);
    expect(spec.options[0]!.id).toBe("id"); // 감염 가설 둘 → 감염내과가 먼저
    s = choose(s, "id").state;
    const rec = pending(s);
    expect(rec.options.map((o) => o.id)).toContain("id_culture");
    s = choose(s, "id_culture").state;
    // 배양 검체 선택까지 한 번 더
    expect(pending(s).options.map((o) => o.id)).toEqual(["blood", "urine", "sputum", "wound"]);
    s = choose(s, "urine").state;
    expect(s.pending).toBeUndefined();
    expect(s.combat!.enemies[0]!.observations.some((o) => o.channel === "gs_urine")).toBe(true);
  });

  it("결정 중 합법 행동 = 고를 수 있는 선택지뿐, 모두 step이 받아들인다", () => {
    let s = makeCombat({ hand: ["imaging"], enemies: [{ disease: "pyelo", variant: "ecoli" }], orders: 1 });
    s = play(s, "imaging").state;
    const acts = legalActions(s);
    expect(acts.every((a) => a.type === "choose_option")).toBe(true);
    expect(acts.map((a) => (a as { optionId: string }).optionId).sort()).toEqual(["pocus", "xray"]);
    for (const a of acts) expect(step(s, a).events[0]?.type).not.toBe("action_rejected");
  });

  it("결정 중 저장·복원(JSON) 후 같은 선택 → 같은 해시", () => {
    let s = makeCombat({ hand: ["consult"], enemies: [{ disease: "cap", variant: "pneumococcus", hypotheses: ["pyelo", "cap"] }] });
    s = play(s, "consult").state;
    s = choose(s, "id").state;
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    const a = choose(s, "id_culture").state;
    const b = choose(copy, "id_culture").state;
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(choose(a, "sputum").state)).toBe(stateHash(choose(b, "sputum").state));
  });
});

describe("처방집과 투약 오더", () => {
  const formulary = ["saline", "ceftriaxone", "clarithromycin", "salbutamol", "epinephrine", "acetaminophen"];

  it("투약 오더는 내 처방집 안에서만 고르고, 고른 약은 이번 턴 비용 0인 임시 카드", () => {
    let s = makeCombat({ hand: ["med_order"], formulary, enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = play(s, "med_order").state;
    const p = pending(s);
    expect(p.options.length).toBeGreaterThanOrEqual(2);
    expect(p.options.length).toBeLessThanOrEqual(3);
    for (const o of p.options) if (o.cardId) expect(formulary).toContain(o.cardId);
    const pick = p.options.find((o) => o.cardId)!;
    s = choose(s, pick.id).state;
    const ci = s.combat!.hand.find((h) => h.cardId === pick.cardId)!;
    expect(ci.temp).toBe(true);
    expect(ci.costZeroThisTurn).toBe(true);
  });

  it("작업 진단에 금기인 약은 내놓지 않는다 (심부전에 수액)", () => {
    let s = makeCombat({ hand: ["med_order"], formulary, enemies: [{ disease: "chf", hypotheses: ["chf", "cap"], workingDx: "chf" }] });
    s = play(s, "med_order").state;
    expect(pending(s).options.map((o) => o.cardId)).not.toContain("saline");
  });

  it("처방집에서 하나만 나오면 '처방하지 않음'이 붙는다 (가짜 결정을 만들지 않는다)", () => {
    let s = makeCombat({ hand: ["med_order"], formulary: ["ceftriaxone"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = play(s, "med_order").state;
    const p = pending(s);
    expect(p.options).toHaveLength(2);
    expect(p.options.filter((o) => !o.cardId)).toHaveLength(1);
  });

  it("투약 오더 선택지는 숨은 정답을 쓰지 않는다: 진실만 다른 두 환자에게 같은 선택지", () => {
    const opts = (disease: string) => {
      let s = makeCombat({ hand: ["med_order"], formulary, enemies: [{ disease, hypotheses: ["pyelo", "cap"], variant: disease === "cap" ? "pneumococcus" : "ecoli" }] });
      s = play(s, "med_order").state;
      return pending(s).options.map((o) => [o.id, o.detail, o.available]);
    };
    expect(opts("cap")).toEqual(opts("pyelo"));
  });
});

describe("결정적 시술", () => {
  it("시술 카드는 즉시·확인 후·보류 결정을 연다. 보류하면 안정화 4와 카드가 손으로 돌아온다", () => {
    let s = makeCombat({ hand: ["defibrillation"], enemies: [{ disease: "stemi" }], orders: 5 });
    s = play(s, "defibrillation").state;
    const p = pending(s);
    expect(p.options.map((o) => o.id)).toEqual(["now", "guided", "hold"]);
    expect(p.options.find((o) => o.id === "now")!.risk).toBeTruthy();
    s = choose(s, "hold").state;
    expect(handIds(s)).toContain("defibrillation");
    expect(s.combat!.stability).toBe(4);
    expect(s.combat!.hand.find((h) => h.cardId === "defibrillation")!.costZeroThisTurn).toBeFalsy();
  });

  it("확인 후 시행: 확인 검사 소견을 먼저 얻고, 그다음 시행·보류를 고른다", () => {
    let s = makeCombat({ hand: ["defibrillation"], enemies: [{ disease: "stemi" }], orders: 5 });
    s = play(s, "defibrillation").state;
    s = choose(s, "guided").state;
    expect(s.combat!.enemies[0]!.observations.some((o) => o.channel === "ecg")).toBe(true);
    expect(pending(s).options.map((o) => o.id)).toEqual(["go", "hold"]);
    s = choose(s, "hold").state;
    expect(handIds(s)).toContain("defibrillation");
  });
});

describe("처방 반납", () => {
  it("치료 처방만, 턴당 한 번, 덱 카드는 대기 처방 맨 아래로 가고 1장 뽑는다", () => {
    let s = makeCombat({ hand: ["ceftriaxone", "salbutamol", "stabilize"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    const cro = s.combat!.hand.find((h) => h.cardId === "ceftriaxone")!.uid;
    const stab = s.combat!.hand.find((h) => h.cardId === "stabilize")!.uid;
    expect(() => act(s, { type: "return_card", cardUid: stab })).toThrow(/치료/);
    const drawBefore = s.combat!.drawPile.length;
    const r = act(s, { type: "return_card", cardUid: cro });
    s = r.state;
    expect(r.events.some((e) => e.type === "card_returned")).toBe(true);
    expect(r.events.some((e) => e.type === "card_played")).toBe(false);
    expect(s.combat!.drawPile.at(-1)!.cardId).toBe("ceftriaxone");
    expect(s.combat!.drawPile.length).toBe(drawBefore); // 한 장 넣고 한 장 뽑았다
    expect(s.combat!.hand).toHaveLength(3);
    const sal = s.combat!.hand.find((h) => h.cardId === "salbutamol")!.uid;
    expect(() => act(s, { type: "return_card", cardUid: sal })).toThrow(/이번 턴/);
  });

  it("처방집에서 불러낸 임시 카드는 반납하면 폐기된다", () => {
    let s = makeCombat({ hand: ["med_order"], formulary: ["ceftriaxone", "salbutamol"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = play(s, "med_order").state;
    const pick = pending(s).options.find((o) => o.cardId === "salbutamol") ?? pending(s).options.find((o) => o.cardId)!;
    s = choose(s, pick.id).state;
    const temp = s.combat!.hand.find((h) => h.temp)!;
    s = act(s, { type: "return_card", cardUid: temp.uid }).state;
    expect(allPileIds(s)).not.toContain(temp.cardId);
    expect(s.combat!.exhaustPile.some((h) => h.uid === temp.uid)).toBe(true);
  });

  it("반납은 치료가 아니다: 질병 부담·반응 소견이 바뀌지 않는다", () => {
    let s = makeCombat({ hand: ["ceftriaxone"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    const e0 = JSON.stringify(s.combat!.enemies[0]);
    s = act(s, { type: "return_card", cardUid: s.combat!.hand[0]!.uid }).state;
    expect(JSON.stringify(s.combat!.enemies[0])).toBe(e0);
    expect(cardDef("ceftriaxone").zone).toBe("formulary");
  });
});

describe("처방 반납 유물", () => {
  it("DUR 시스템이 있으면 턴마다 두 번 반납할 수 있다", () => {
    let s = makeCombat({ hand: ["ceftriaxone", "salbutamol"], relics: ["dur_system"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = act(s, { type: "return_card", cardUid: s.combat!.hand.find((h) => h.cardId === "ceftriaxone")!.uid }).state;
    s = act(s, { type: "return_card", cardUid: s.combat!.hand.find((h) => h.cardId === "salbutamol")!.uid }).state;
    expect(s.run.stats.returns).toBe(2);
  });
});

describe("v2.1 표적 투약 오더: 1차·대안·보험", () => {
  it("작업 진단이 있으면 세 역할로 고르고, 선택지마다 무엇을 맞바꾸는지 적는다", () => {
    let s = makeCombat({
      hand: ["med_order"],
      formulary: ["ceftriaxone", "levofloxacin", "clarithromycin", "pip_tazo", "acetaminophen", "saline"],
      enemies: [{ disease: "cap", variant: "pneumococcus", hypotheses: ["cap", "pyelo", "cellulitis"], workingDx: "cap" }],
    });
    s = play(s, "med_order").state;
    const p = s.pending as { options: { id: string; detail: string }[] };
    expect(p.options).toHaveLength(3);
    expect(p.options[0]!.detail).toContain("작업 진단");
    // 둘째·셋째는 대가가 적은 대안이거나, 작업 진단이 틀렸을 때의 보험이거나, 보존적 치료다
    expect(p.options.slice(1).every((o) => /대안|차선|보험|보존적/.test(o.detail))).toBe(true);
  });
});
