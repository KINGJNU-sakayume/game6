// 정보 무결성: 확진 전 플레이어에게 보이는 모든 것은 숨은 정답(질병·변이·원인균)과 무관해야 한다.
// 같은 내원 양상에서 정답만 바꾼 두 전투의 화면 정보·미리보기·합법 행동·결정 선택지가 같아야 한다.
// 예외: 의도(임상 압박)의 크기와 종류. 환자가 나빠지는 방식은 관찰 가능한 임상 징후로 본다(docs/DECISIONS.md).
import { describe, expect, it } from "vitest";
import "../helpers";
import { choose, play } from "../helpers";
import { db, diseaseDef, legalActions, newRun, previewDamage, visibleEnemyInfo } from "../../src/core";
import { startCombat } from "../../src/core/combat";
import { planIntents } from "../../src/core/enemy-ai";
import { refreshKnowledge } from "../../src/core/evidence";
import type { GameState } from "../../src/core";

const DECK = ["history", "physical_exam", "lab_workup", "imaging", "consult", "med_order", "culture", "reassessment", "stabilize", "supportive_care"];

/** 정답만 바꾼 전투. 비전형 소견·초기 상태·의도 계획은 같게 맞춘다 */
function combatWithTruth(encounterId: string, disease: string, seed = "integrity"): GameState {
  const s = newRun(seed, { deck: DECK, formulary: db().starterFormulary });
  startCombat(s, encounterId, "normal");
  const e = s.combat!.enemies[0]!;
  e.diseaseId = disease;
  const v = diseaseDef(disease).variants?.[0];
  if (v) e.variantId = v.id;
  else delete e.variantId;
  delete e.atypical;
  e.statuses = [];
  e.ai = { history: [], planned: [], planIndex: 0, usedOnce: [] };
  planIntents(s, e);
  refreshKnowledge(s, e, true);
  // 손패를 덱 전체로 두어 모든 카드의 미리보기를 본다
  s.combat!.hand = DECK.map((id, i) => ({ uid: `h${i}`, cardId: id, upgraded: false }));
  s.combat!.orders = 5;
  return s;
}

function playerView(s: GameState) {
  const e = s.combat!.enemies[0]!;
  const { intents: _i, ...view } = visibleEnemyInfo(s, e.uid)!;
  return {
    view,
    previews: s.combat!.hand.map((h) => previewDamage(s, h.uid, e.uid)),
    legal: legalActions(s),
  };
}

const multi = db().encounters.filter((enc) => {
  if (enc.problems.length !== 1) return false;
  const p = db().presentations.find((x) => x.id === enc.problems[0]!.presentation)!;
  return p.candidates.length > 1;
});

describe("정보 무결성", () => {
  it("여러 감별 대상이 있는 인카운터가 충분히 있다", () => {
    expect(multi.length).toBeGreaterThanOrEqual(15);
  });

  for (const enc of multi) {
    const p = db().presentations.find((x) => x.id === enc.problems[0]!.presentation)!;
    const truths = p.candidates.map((c) => c.disease);
    it(`${enc.id} (${truths.join("/")}): 화면 정보·미리보기·합법 행동이 정답과 무관`, () => {
      const base = playerView(combatWithTruth(enc.id, truths[0]!));
      for (const t of truths.slice(1)) expect(playerView(combatWithTruth(enc.id, t))).toEqual(base);
    });
    it(`${enc.id}: 협진·투약 오더 선택지가 정답과 무관`, () => {
      const opts = (t: string) => {
        const out: unknown[] = [];
        let s = combatWithTruth(enc.id, t);
        s = play(s, "med_order", s.combat!.enemies[0]!.uid).state;
        out.push((s.pending as { options: unknown[] }).options);
        let c = combatWithTruth(enc.id, t);
        c = play(c, "consult", c.combat!.enemies[0]!.uid).state;
        const spec = c.pending as { options: { id: string; available: boolean }[] };
        out.push(spec.options);
        c = choose(c, spec.options.find((o) => o.available)!.id).state;
        out.push((c.pending as { options: unknown[] }).options);
        return out;
      };
      const base = opts(truths[0]!);
      for (const t of truths.slice(1)) expect(opts(t)).toEqual(base);
    });
  }

  it("확진 전 화면 정보는 변이(원인균)와 무관하다: MSSA와 MRSA 봉와직염이 같게 보인다", () => {
    const view = (variant: string) => {
      const s = combatWithTruth("n2_leg", "cellulitis");
      s.combat!.enemies[0]!.variantId = variant;
      return playerView(s);
    };
    const mrsa = view("mrsa");
    expect(mrsa).toEqual(view("mssa"));
    expect(mrsa.view.variantName).toBeUndefined();
    expect(mrsa.view.confirmedName).toBeUndefined();
    // 원인균 후보 목록은 감별 목록에서 나온다(정답이 아니라 가능성)
    expect(mrsa.view.organism.candidates.length).toBeGreaterThan(1);
  });

  it("확진 전 기록에는 질병 이름 대신 주호소가 쓰인다", () => {
    let s = combatWithTruth("n1_fever", "pyelo");
    s = play(s, "supportive_care", s.combat!.enemies[0]!.uid).state;
    const text = s.combat!.log.map((l) => l.text).join("\n");
    expect(text).not.toContain("신우신염");
  });
});
