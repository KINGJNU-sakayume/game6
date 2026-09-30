// 감별 진단: 검사는 피해가 아니라 소견을 만들고, 소견이 가설의 신뢰도를 바꾼다. 확진·작업 진단·치료 반응·배양.
import { describe, expect, it } from "vitest";
import { act, choose, makeCombat, makeEnemy, play, playChoose } from "../helpers";
import { db, diseaseDef, expectedFindings, legalActions, LEVEL_RANK, scoreDifferential, visibleEnemyInfo } from "../../src/core";
import { actualFinding, observe, refreshKnowledge } from "../../src/core/evidence";
import type { GameState } from "../../src/core";

const levelOf = (s: GameState, disease: string) => visibleEnemyInfo(s, "e1")!.hypotheses.find((h) => h.diseaseId === disease)!;

describe("감별 목록 (진단 점수 대신)", () => {
  it("전투 시작: 감별 목록은 내원 양상의 후보, 모두 '가능', 활력징후만 보인다", () => {
    const s = makeCombat({ enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    const v = visibleEnemyInfo(s, "e1")!;
    expect(v.hypotheses.map((h) => h.diseaseId).sort()).toEqual(["cap", "pyelo"]);
    expect(v.hypotheses.every((h) => h.level === "possible")).toBe(true);
    expect(v.findings.map((f) => f.channel)).toEqual(["vitals"]);
    expect(v.knowledge).toBe(0);
    expect(v.confirmedName).toBeUndefined();
  });

  it("진단 카드는 질병 부담을 깎지 않는다 (점수를 쌓아 자동 확진하는 구조가 없다)", () => {
    let s = makeCombat({ hand: ["history", "physical_exam", "lab_workup"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    const before = s.combat!.enemies[0]!.severity;
    s = playChoose(s, "history", ["hx_onset"]).state;
    s = playChoose(s, "physical_exam", ["ex_neuro"]).state;
    s = playChoose(s, "lab_workup", ["lab_coag"]).state;
    expect(s.combat!.enemies[0]!.severity).toBe(before);
    // 둘 다 같은 소견(발병 며칠, 신경·응고 정상)이라 아무것도 가려지지 않았다
    const rows = scoreDifferential(s.combat!.enemies[0]!);
    expect(rows[0]!.score).toBe(rows[1]!.score);
    expect(s.combat!.enemies[0]!.knowledge).toBeLessThan(2);
  });

  it("양성 소견은 맞는 가설을 올리고 안 맞는 가설을 내린다", () => {
    let s = makeCombat({ hand: ["physical_exam"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = playChoose(s, "physical_exam", ["ex_abd"]).state;
    const e = s.combat!.enemies[0]!;
    expect(e.observations.find((o) => o.channel === "ex_abd")?.finding).toBe("ab_flank_cva");
    const rows = scoreDifferential(e);
    expect(rows.find((r) => r.diseaseId === "pyelo")!.score).toBeGreaterThan(rows.find((r) => r.diseaseId === "cap")!.score);
    const f = visibleEnemyInfo(s, "e1")!.findings.find((x) => x.channel === "ex_abd")!;
    expect(f.effects.find((x) => x.diseaseId === "pyelo")?.sign).toBe(1);
    expect(f.effects.find((x) => x.diseaseId === "cap")?.sign).toBe(-1);
  });

  it("음성 소견도 소견이다: 폐렴인데 배가 부드러우면 신우신염 가능성이 내려간다", () => {
    let s = makeCombat({ hand: ["physical_exam"], enemies: [{ disease: "cap", variant: "pneumococcus", hypotheses: ["pyelo", "cap"] }] });
    const before = scoreDifferential(s.combat!.enemies[0]!).find((r) => r.diseaseId === "pyelo")!.score;
    s = playChoose(s, "physical_exam", ["ex_abd"]).state;
    const after = scoreDifferential(s.combat!.enemies[0]!).find((r) => r.diseaseId === "pyelo")!.score;
    expect(s.combat!.enemies[0]!.observations.find((o) => o.channel === "ex_abd")?.finding).toBe("ab_soft");
    expect(after).toBeLessThan(before);
  });

  it("가설이 하나만 남으면 확진: 병례집 기록, 작업 진단 자동 설정, 질병 이름 공개", () => {
    let s = makeCombat({ hand: ["physical_exam", "imaging"], enemies: [{ disease: "cap", variant: "pneumococcus" }], orders: 3 });
    s = playChoose(s, "physical_exam", ["ex_cardio"]).state;
    const r = playChoose(s, "imaging", ["xray"]);
    s = r.state;
    const e = s.combat!.enemies[0]!;
    expect(e.knowledge).toBe(2);
    expect(e.workingDx).toBe("cap");
    expect(s.run.casebook.cap).toBe("confirmed");
    expect(r.events.some((x) => x.type === "diagnosis_confirmed")).toBe(true);
    expect(visibleEnemyInfo(s, "e1")!.confirmedName).toBe("폐렴");
  });

  it("속성: 모든 경로를 다 봐도 실제 질병은 배제되지 않는다 (비전형 소견 포함)", () => {
    const channels = db().channels.map((c) => c.id);
    let checked = 0;
    for (const p of db().presentations) {
      for (const cand of p.candidates) {
        const d = diseaseDef(cand.disease);
        const variants = d.variants?.map((v) => v.id) ?? [undefined];
        const atypicals: ([string, string] | undefined)[] = [undefined, ...Object.entries(d.atypical ?? {}).map(([k, v]) => [k, v!] as [string, string])];
        for (const variant of variants) {
          for (const atypical of atypicals) {
            const s = makeCombat({ enemies: [{ disease: cand.disease, variant, hypotheses: p.candidates.map((c) => c.disease) }] });
            const e = s.combat!.enemies[0]!;
            if (atypical) e.atypical = { channel: atypical[0], finding: atypical[1] };
            for (const ch of channels) observe(s, e, ch, true);
            refreshKnowledge(s, e, true);
            const row = scoreDifferential(e).find((r) => r.diseaseId === cand.disease)!;
            expect(row.ruledOut, `${p.id} ${cand.disease}/${variant} atypical=${!!atypical}`).toBe(false);
            expect(row.against).toBeLessThanOrEqual(2);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("관찰한 소견은 언제나 실제 질병의 교과서 소견(또는 등록된 비전형 소견)이다", () => {
    for (const d of db().diseases) {
      for (const ch of db().channels.map((c) => c.id)) {
        // 활력 징후는 내원 양상 공통(채점하지 않음), 경과 소견은 행동이 남긴다
        if (ch === "vitals" || ch === "course") continue;
        const e = makeEnemy({ disease: d.id, variant: d.variants?.[0]?.id }, 0);
        const f = actualFinding(e, ch);
        expect(expectedFindings(d.id, ch), `${d.id} ${ch}`).toContain(f);
      }
    }
  });
});

describe("작업 진단 (플레이어의 결정)", () => {
  it("처음 정하는 것은 무료, 바꾸면 오더 1", () => {
    let s = makeCombat({ enemies: [{ disease: "pyelo", variant: "ecoli" }], orders: 3 });
    const r = act(s, { type: "commit_diagnosis", targetUid: "e1", diseaseId: "cap" });
    s = r.state;
    expect(r.events.some((e) => e.type === "diagnosis_committed")).toBe(true);
    expect(s.combat!.orders).toBe(3);
    expect(s.combat!.enemies[0]!.workingDx).toBe("cap");
    s = act(s, { type: "commit_diagnosis", targetUid: "e1", diseaseId: "pyelo" }).state;
    expect(s.combat!.orders).toBe(2);
    expect(s.run.stats.revisions).toBe(1);
  });

  it("오더가 없으면 바꿀 수 없고, 감별 목록에 없거나 배제된 진단은 고를 수 없다", () => {
    let s = makeCombat({ enemies: [{ disease: "pyelo", variant: "ecoli", workingDx: "cap" }], orders: 0 });
    expect(() => act(s, { type: "commit_diagnosis", targetUid: "e1", diseaseId: "pyelo" })).toThrow(/오더/);
    expect(() => act(s, { type: "commit_diagnosis", targetUid: "e1", diseaseId: "stemi" })).toThrow(/감별 목록/);
    s = makeCombat({ hand: ["physical_exam"], enemies: [{ disease: "pyelo", variant: "ecoli" }], orders: 3 });
    s = playChoose(s, "physical_exam", ["ex_abd"]).state;
    const e = s.combat!.enemies[0]!;
    observe(s, e, "lab_ua", true);
    observe(s, e, "hx_assoc", true);
    refreshKnowledge(s, e, true);
    expect(scoreDifferential(e).find((r) => r.diseaseId === "cap")!.ruledOut).toBe(true);
    expect(legalActions(s).some((a) => a.type === "commit_diagnosis" && a.diseaseId === "cap")).toBe(false);
  });

  it("치료 반응이 소견이 된다: 아나필락시스에 에피네프린이 극적으로 들으면 천식 가설이 내려간다", () => {
    let s = makeCombat({ hand: ["epinephrine"], enemies: [{ disease: "anaphylaxis", hypotheses: ["asthma", "anaphylaxis"], severity: 200 }] });
    const before = scoreDifferential(s.combat!.enemies[0]!).find((r) => r.diseaseId === "asthma")!.score;
    s = playChoose(s, "epinephrine", ["im"]).state;
    const e = s.combat!.enemies[0]!;
    const rx = e.observations.find((o) => o.channel === "rx:epinephrine");
    expect(rx?.finding).toBe("rx_good");
    expect(scoreDifferential(e).find((r) => r.diseaseId === "asthma")!.score).toBeLessThan(before);
  });

  it("틀린 작업 진단으로 치료하면 기대 반응이 없고, 기록이 재고를 권한다", () => {
    let s = makeCombat({ hand: ["salbutamol"], enemies: [{ disease: "cap", variant: "pneumococcus", hypotheses: ["asthma", "cap"], workingDx: "asthma", severity: 200 }] });
    s = play(s, "salbutamol").state;
    const e = s.combat!.enemies[0]!;
    expect(e.observations.find((o) => o.channel === "rx:salbutamol")?.finding).not.toBe("rx_good");
    expect(s.combat!.log.some((l) => l.text.includes("재고"))).toBe(true);
    expect(LEVEL_RANK[levelOf(s, "asthma").level]).toBeLessThanOrEqual(LEVEL_RANK.possible);
  });
});

describe("배양과 원인균", () => {
  it("그람 염색은 바로, 배양·감수성은 2턴 뒤에 나오고 원인균이 확인된다", () => {
    let s = makeCombat({ hand: ["culture"], enemies: [{ disease: "pyelo", variant: "ecoli" }], orders: 3 });
    s = playChoose(s, "culture", ["urine"]).state;
    let e = s.combat!.enemies[0]!;
    expect(e.observations.find((o) => o.channel === "gs_urine")?.finding).toBe("gs_gnr");
    expect(e.organismKnown).toBe(false);
    expect(visibleEnemyInfo(s, "e1")!.pending.some((p) => p.turnsLeft === 2)).toBe(true);
    s.combat!.stability = 999;
    s = act(s, { type: "end_turn" }).state;
    expect(s.combat!.enemies[0]!.organismKnown).toBe(false);
    s.combat!.stability = 999;
    const r = act(s, { type: "end_turn" });
    s = r.state;
    e = s.combat!.enemies[0]!;
    expect(e.observations.find((o) => o.channel === "cx_urine")?.finding).toBe("cx_urine_ecoli");
    expect(e.organismKnown).toBe(true);
    expect(r.events.some((x) => x.type === "organism_identified")).toBe(true);
  });

  it("원인균을 모른 채 쓴 항생제는 내성을 키우고, 배양으로 확인한 뒤의 좁은 항생제는 키우지 않는다", () => {
    let s = makeCombat({ hand: ["ceftriaxone"], enemies: [{ disease: "cap", variant: "pneumococcus", severity: 200 }] });
    s = play(s, "ceftriaxone").state;
    expect(s.combat!.enemies[0]!.acquiredResistance.beta_lactam ?? 0).toBeGreaterThan(0);
    let t = makeCombat({ hand: ["ceftriaxone"], enemies: [{ disease: "cap", variant: "pneumococcus", severity: 200, organismKnown: true }] });
    t = play(t, "ceftriaxone").state;
    expect(t.combat!.enemies[0]!.acquiredResistance.beta_lactam ?? 0).toBe(0);
    expect(t.run.stats.abxTargeted).toBe(1);
    expect(s.run.stats.abxEmpiric).toBe(1);
  });
});

describe("대기 결정 중 다른 행동은 막힌다", () => {
  it("결정 중에는 카드 사용·턴 종료·작업 진단이 거부된다", () => {
    let s = makeCombat({ hand: ["history", "stabilize"], enemies: [{ disease: "pyelo", variant: "ecoli" }] });
    s = play(s, "history").state;
    expect(() => act(s, { type: "end_turn" })).toThrow();
    expect(() => act(s, { type: "commit_diagnosis", targetUid: "e1", diseaseId: "pyelo" })).toThrow();
    expect(() => play(s, "stabilize")).toThrow();
    s = choose(s, "hx_assoc").state;
    expect(s.pending).toBeUndefined();
  });
});
