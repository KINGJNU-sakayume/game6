// 진단 행동 카드 (처방 목록). 대부분 무엇을 확인할지 고르는 결정 카드다.
import { choose, lookOpt, opt, stab } from "../ops";
import { CULTURE_OPTIONS } from "../consults";
import type { CardDef, OptionDef } from "../../core/types";

const BEDSIDE: OptionDef[] = [
  lookOpt("lab_ua", "소변 검사", "농뇨, 케톤, 원주"),
  lookOpt("ecg", "심전도", "허혈, 부정맥, 칼륨의 흔적"),
  lookOpt("abga", "동맥혈 가스", "산증, 저산소, 호흡 피로"),
  lookOpt("stool", "대변 검사", "독소, 바이러스 항원"),
];

const cultureWith = (delay: number): OptionDef[] => CULTURE_OPTIONS.map((o) => ({ ...o, effects: o.effects.map((e) => (e.op === "culture" ? { ...e, delay } : e)) }));

export const DIAGNOSTIC_CARDS = [
  {
    id: "bedside_tests",
    nameKo: "현장 검사",
    nameEn: "Bedside tests",
    kind: "diagnostic",
    rarity: "common",
    cost: 0,
    target: "enemy",
    tags: [],
    effects: [choose("침대 옆에서 무엇을 볼까", BEDSIDE)],
    upgrade: { effects: [choose("침대 옆에서 무엇을 볼까", BEDSIDE, 2)] },
    upgradeText: "두 가지를 본다",
    flavor: "10분 안에 나오는 결과들.",
  },
  {
    id: "culture",
    nameKo: "배양 검사",
    nameEn: "Culture",
    kind: "diagnostic",
    rarity: "uncommon",
    cost: 1,
    target: "enemy",
    tags: [],
    effects: [choose("어디서 검체를 받을까 — 그람 염색은 바로, 배양·감수성은 2턴 뒤", cultureWith(2))],
    upgrade: { effects: [choose("어디서 검체를 받을까 — 그람 염색은 바로, 배양·감수성은 1턴 뒤", cultureWith(1))] },
    upgradeText: "결과가 1턴 빨리 나온다",
    flavor: "항생제보다 먼저. 기다리는 동안 환자는 나빠질 수 있다.",
  },
  {
    id: "reassessment",
    nameKo: "재평가",
    nameEn: "Reassessment",
    kind: "diagnostic",
    rarity: "common",
    cost: 1,
    target: "enemy",
    tags: [],
    effects: [
      choose("지금 무엇을 다시 볼까", [
        opt("reexam", "재진찰", "지금 감별 목록을 가장 잘 가르는 병력·진찰 소견 1개, 안정화 2", [{ op: "investigate_best", groups: ["history", "exam"], count: 1 }, stab(2)]),
        opt("results", "대기 결과 확인", "기다리는 검사 결과를 1턴 앞당긴다", [{ op: "advance_results", turns: 1 }], {
          requires: { pendingResults: true },
          requiresText: "기다리는 검사 결과가 없다",
        }),
        opt("meds", "투약 검토", "투여 중인 약 하나를 끊고 카드 1장", [{ op: "stop_drug_choice" }], { requires: { activeDrugAny: true }, requiresText: "투여 중인 약이 없다" }),
      ]),
    ],
    upgrade: { cost: 0 },
    upgradeText: "비용 0",
    flavor: "처음 인상이 틀렸을 수도 있다.",
  },
  {
    id: "attending_rounds",
    nameKo: "교수 회진",
    nameEn: "Attending rounds",
    kind: "diagnostic",
    rarity: "rare",
    cost: 1,
    target: "enemy",
    tags: [],
    keywords: ["exhaust"],
    effects: [
      { op: "investigate_best", groups: ["history", "exam", "lab", "bedside", "imaging"], count: 2 },
      { op: "plan_bonus", pct: 30, target: "target" },
    ],
    upgrade: { cost: 0 },
    upgradeText: "비용 0",
    flavor: "\"이 환자에게서 꼭 확인할 것 두 가지만 말해 봐.\"",
  },
] satisfies CardDef[];
