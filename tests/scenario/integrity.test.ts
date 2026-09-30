// 정보 무결성: 확진 전 플레이어에게 보이는 모든 것은 숨은 정답(질병·변이·원인균)과 무관해야 한다.
// 같은 내원 양상에서 정답만 바꾼 두 전투의 화면 정보(의도 포함)·미리보기·합법 행동·결정 선택지가 같아야 한다.
// v2.1: 의도(임상 압박)도 비교한다. 여러 턴 동안 질병이 행동해도, 결과가 처음 갈라지기(경과가 드러나기) 전까지 화면은 같아야 한다.
import { describe, expect, it } from "vitest";
import "../helpers";
import { choose, play } from "../helpers";
import { db, diseaseDef, legalActions, newRun, previewDamage, step, visibleEnemyInfo } from "../../src/core";
import { startCombat } from "../../src/core/combat";
import { ClinicianBot } from "../../src/sim/bots/clinician";
import type { EncounterDef, GameState } from "../../src/core";

const DECK = ["history", "physical_exam", "lab_workup", "imaging", "consult", "med_order", "culture", "reassessment", "stabilize", "supportive_care"];

function kindOf(enc: EncounterDef): GameState["combat"] extends infer C ? (C extends { kind: infer K } ? K : never) : never {
  return (enc.pool === "elite" ? "elite" : enc.pool === "gate" ? "gate" : enc.pool === "boss" ? "boss" : "normal") as never;
}

/** 정답만 바꾼 전투. 난수·덱·처방집은 같고, 비전형 소견은 없다 */
function combatWithTruth(encounterId: string, disease: string, seed = "integrity", fullHand = true): GameState {
  const s = newRun(seed, { deck: DECK, formulary: db().starterFormulary });
  const enc = db().encounters.find((e) => e.id === encounterId)!;
  startCombat(s, encounterId, kindOf(enc), [{ disease, atypical: null }]);
  if (fullHand) {
    // 손패를 덱 전체로 두어 모든 카드의 미리보기를 본다
    s.combat!.hand = DECK.map((id, i) => ({ uid: `h${i}`, cardId: id, upgraded: false }));
    s.combat!.orders = 5;
  }
  return s;
}

function playerView(s: GameState) {
  const e = s.combat!.enemies[0]!;
  return {
    view: visibleEnemyInfo(s, e.uid)!,
    previews: s.combat!.hand.map((h) => previewDamage(s, h.uid, e.uid)),
    legal: legalActions(s),
  };
}

/** 질병의 행동이 남긴, 플레이어가 보는 결과 (이것이 갈라지면 경과가 드러난 것이다) */
function outcome(s: GameState) {
  const c = s.combat;
  if (!c) return { phase: s.phase, vitality: s.run.vitality };
  const e = c.enemies[0]!;
  const v = visibleEnemyInfo(s, e.uid)!;
  const { intents: _i, hypotheses: _h, ...rest } = v;
  const cards = [...c.hand, ...c.drawPile, ...c.discardPile, ...c.exhaustPile].map((x) => x.cardId).sort();
  return { vitality: s.run.vitality, patient: c.patientStatuses, cards, enemy: rest };
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
    it(`${enc.id} (${truths.join("/")}): 첫 화면(의도 포함)·미리보기·합법 행동이 정답과 무관`, () => {
      const base = playerView(combatWithTruth(enc.id, truths[0]!));
      expect(base.view.intents.length).toBeGreaterThan(0);
      for (const t of truths.slice(1)) expect(playerView(combatWithTruth(enc.id, t))).toEqual(base);
    });
    it(`${enc.id}: 질병이 여러 턴 행동해도 경과가 갈라지기 전까지 화면이 같고, 보이는 의도의 순서는 끝까지 같다`, () => {
      for (const seed of ["a", "b", "c", "d"]) {
        const states = truths.map((t) => {
          const s = combatWithTruth(enc.id, t, `multi-${seed}`, false);
          s.run.vitality = 100000;
          s.run.maxVitality = 100000;
          return s;
        });
        let diverged = false;
        for (let turn = 0; turn < 6; turn++) {
          if (states.some((s) => s.phase !== "combat" || s.combat!.enemies[0]!.cured)) break;
          // 대본이 고른 칸(종류·등급)은 정답과 무관하다: 단계가 바뀌어 경과 소견이 드러나기 전까지 끝까지 같다
          const phased = states.some((s) => s.combat!.enemies[0]!.observations.some((o) => o.channel === "course" && /vf/.test(o.finding)));
          if (!phased) {
            const sigs = states.map((s) => s.combat!.enemies[0]!.ai.planned.map((x) => x.sig));
            for (const x of sigs.slice(1)) expect(x, `${enc.id} ${seed} 턴 ${turn} 칸`).toEqual(sigs[0]);
          }
          const outs = states.map((s) => JSON.stringify(outcome(s)));
          if (!diverged && outs.some((o) => o !== outs[0])) diverged = true;
          if (!diverged) {
            const views = states.map((s) => playerView(s));
            for (const v of views.slice(1)) expect(v, `${enc.id} ${seed} 턴 ${turn} 화면`).toEqual(views[0]);
          }
          for (let i = 0; i < states.length; i++) states[i] = step(states[i]!, { type: "end_turn" }).state;
        }
      }
    });
    it(`${enc.id}: 같은 화면이면 판단 봇도 같은 행동을 고른다`, () => {
      for (const seed of ["x", "y"]) {
        let states = truths.map((t) => combatWithTruth(enc.id, t, `bot-${seed}`, false));
        const bots = truths.map(() => new ClinicianBot(`bot-${seed}`));
        for (let k = 0; k < 12; k++) {
          if (states.some((s) => s.phase !== "combat")) break;
          const views = states.map((s) => JSON.stringify(playerView(s)) + JSON.stringify(s.pending ?? null) + s.combat!.hand.map((h) => h.cardId).join());
          if (views.some((v) => v !== views[0])) break; // 경과나 소견이 갈라졌다
          const acts = states.map((s, i) => bots[i]!.choose(s));
          for (const a of acts.slice(1)) expect(a, `${enc.id} ${seed} 결정 ${k}`).toEqual(acts[0]);
          states = states.map((s, i) => step(s, acts[i]!).state);
        }
      }
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
      const s = newRun("integrity", { deck: DECK, formulary: db().starterFormulary });
      startCombat(s, "n2_leg", "normal", [{ disease: "cellulitis", variant, atypical: null }]);
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
