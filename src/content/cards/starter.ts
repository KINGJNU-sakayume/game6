// 시작 덱: 의사가 "하는 일"만 담는다. 약과 결정적 시술은 처방집에 있고 투약 오더로 불러낸다.
import { choose, dmg, lookOpt, stab } from "../ops";
import type { CardDef, EffectOp, OptionDef } from "../../core/types";

const HISTORY: OptionDef[] = [
  lookOpt("hx_onset", "발병 양상과 경과", "언제, 어떻게 시작해 어떻게 변했나"),
  lookOpt("hx_assoc", "동반 증상", "함께 나타난 다른 증상"),
  lookOpt("hx_risk", "병력·약물·위험 인자", "지병, 먹는 약, 노출, 최근 입원·수술"),
];

const EXAM: OptionDef[] = [
  lookOpt("ex_cardio", "심폐", "폐 소리, 심음, 목정맥"),
  lookOpt("ex_abd", "복부", "압통, 반발통, 복수, 옆구리 통증"),
  lookOpt("ex_neuro", "신경", "의식, 국소 결손, 떨림"),
  lookOpt("ex_limb", "피부·사지", "발진, 부종, 다리, 주사 자리·라인"),
];

const LABS: OptionDef[] = [
  lookOpt("lab_cbc", "혈구·염증", "백혈구, 혈색소, 혈소판, 염증 수치"),
  lookOpt("lab_chem", "화학·대사", "혈당, 전해질, 신기능, 케톤, 효소, 암모니아"),
  lookOpt("lab_coag", "응고", "PT, D-dimer, 피브리노겐"),
];

/** 조영제: 치료가 아니다. 급성 신손상이면 악화(금기 반응)되고, 그 악화가 곧 소견이 된다 */
const contrastRisk: EffectOp = { op: "damage", amount: 0, tags: ["nephrotoxic"] };

export const imagingOptions = (ctImmediate: boolean): OptionDef[] => [
  lookOpt("xray", "X선", "빠르고 싸다. 폐·심장 윤곽에 강하다. 카드 1장", [{ op: "draw", amount: 1 }], { risk: "배·신경 질환은 거의 보이지 않는다" }),
  lookOpt("pocus", "현장 초음파", "침대 옆에서 즉시. 체액·심낭·기흉·혈전·충수에 강하다", [], { risk: "보이는 곳만 보인다" }),
  {
    id: "ct",
    label: "CT",
    detail: ctImmediate ? "가장 정확하다. 바로 판독" : "가장 정확하다. 판독은 다음 턴",
    risk: "오더 +1 · 조영제: 신장이 나쁘면 악화",
    cost: 1,
    channel: "ct",
    effects: ctImmediate
      ? [contrastRisk, { op: "investigate", channel: "ct" }]
      : [contrastRisk, { op: "delay", turns: 1, effects: [{ op: "investigate", channel: "ct" }], label: "CT 판독", channel: "ct" }],
  },
];

export const STARTER_CARDS = [
  {
    id: "history",
    nameKo: "병력 청취",
    nameEn: "History taking",
    kind: "diagnostic",
    rarity: "starter",
    cost: 0,
    target: "enemy",
    tags: [],
    effects: [choose("무엇을 물을까", HISTORY)],
    upgrade: { effects: [choose("무엇을 물을까", HISTORY, 2)] },
    upgradeText: "두 가지를 묻는다",
    flavor: "진단의 절반은 이야기에 있다.",
  },
  {
    id: "physical_exam",
    nameKo: "신체 진찰",
    nameEn: "Physical examination",
    kind: "diagnostic",
    rarity: "starter",
    cost: 1,
    target: "enemy",
    tags: [],
    effects: [stab(3), choose("어디를 볼까", EXAM)],
    upgrade: { effects: [stab(3), choose("어디를 볼까", EXAM, 2)] },
    upgradeText: "두 부위를 본다",
    flavor: "시진, 촉진, 타진, 청진. 정상 소견도 소견이다.",
  },
  {
    id: "lab_workup",
    nameKo: "혈액 검사",
    nameEn: "Laboratory workup",
    kind: "diagnostic",
    rarity: "starter",
    cost: 1,
    target: "enemy",
    tags: [],
    effects: [choose("어떤 검사를 낼까", LABS)],
    upgrade: { effects: [choose("어떤 검사를 낼까", LABS, 2)] },
    upgradeText: "두 묶음을 낸다",
    flavor: "무엇을 확인하려는지 모르면 결과도 읽을 수 없다.",
  },
  {
    id: "imaging",
    nameKo: "영상 검사",
    nameEn: "Imaging order",
    kind: "diagnostic",
    rarity: "starter",
    cost: 1,
    target: "enemy",
    tags: [],
    effects: [choose("속도, 정확도, 비용 중 무엇을 택할까", imagingOptions(false))],
    upgrade: { effects: [choose("속도, 정확도, 비용 중 무엇을 택할까", imagingOptions(true))] },
    upgradeText: "CT를 바로 판독한다",
    flavor: "환자가 버틸 수 있는 동안만 기다릴 수 있다.",
  },
  {
    id: "stabilize",
    nameKo: "안정화 조치",
    nameEn: "Stabilize",
    kind: "procedure",
    rarity: "starter",
    cost: 1,
    target: "none",
    tags: [],
    effects: [stab(6)],
    upgrade: { effects: [stab(9)] },
    flavor: "기도, 호흡, 순환.",
  },
  {
    id: "supportive_care",
    nameKo: "보존적 치료",
    nameEn: "Supportive care",
    kind: "procedure",
    rarity: "starter",
    cost: 1,
    target: "enemy",
    tags: [],
    effects: [dmg(4), stab(3)],
    upgrade: { effects: [dmg(6), stab(5)] },
    flavor: "원인을 몰라도 환자가 스스로 회복할 시간을 번다.",
  },
  {
    id: "med_order",
    nameKo: "투약 오더",
    nameEn: "Medication order",
    kind: "procedure",
    rarity: "starter",
    cost: 1,
    target: "enemy",
    tags: [],
    effects: [{ op: "discover", pool: "drug", count: 3 }],
    upgrade: { cost: 0 },
    upgradeText: "비용 0",
    flavor: "작업 진단이 있으면 그 진단에 맞춰, 없으면 감별 목록 전체를 덮도록 처방집을 연다.",
  },
] satisfies CardDef[];
