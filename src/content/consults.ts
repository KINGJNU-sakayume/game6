// 협진 진료과와 권고. 진료과는 감별 목록의 분류·특성으로 추천되고,
// 권고의 조건은 플레이어가 아는 정보(가설 신뢰도, 확인한 소견, 원인균 확인 여부)만 쓴다.
// 권고가 넘겨주는 카드는 내 처방집에 없는 것이어도 된다(전문과의 도구). 이번 전투에만 쓰는 임시 카드다.
import type { ConsultDef, EffectOp, OptionDef } from "../core/types";

// 협진이 쥐여 주는 치료는 처방집 밖이어도 되지만 비용은 그대로 낸다 (정보·접근성 ↔ 오더 템포)
const give = (cardId: string): EffectOp => ({ op: "add_card", cardId, count: 1, dest: "hand" });
const stab = (n: number): EffectOp => ({ op: "gain_stability", amount: n, target: "patient" });
const look = (channel: string): EffectOp => ({ op: "investigate", channel });

const specimen = (id: "blood" | "urine" | "sputum" | "wound", label: string, detail: string): OptionDef => ({
  id,
  label,
  detail,
  channel: `cx_${id}`,
  effects: [{ op: "culture", specimen: id, delay: 2 }],
});

export const CULTURE_OPTIONS: OptionDef[] = [
  specimen("blood", "혈액", "균혈증·라인 감염·패혈증을 찾는다"),
  specimen("urine", "소변", "요로 감염을 찾는다"),
  specimen("sputum", "객담", "폐렴의 원인균을 찾는다"),
  specimen("wound", "상처·삽입부", "피부 감염·삽입부 감염을 찾는다"),
];

export const CONSULTS = [
  {
    id: "internal",
    nameKo: "내과",
    categories: ["metabolic", "renal"],
    traits: ["hyperglycemia"],
    recommendations: [
      { id: "im_workup", label: "감별 소견 정리", detail: "감별력이 가장 높은 병력·진찰 소견 2개를 얻는다", effects: [{ op: "investigate_best", groups: ["history", "exam"], count: 2 }] },
      {
        id: "im_insulin",
        label: "인슐린 프로토콜",
        detail: "인슐린과 염화칼륨을 손에",
        requires: { suspect: { traits: ["hyperglycemia"], level: "suspected" } },
        requiresText: "고혈당 위기가 의심될 때만",
        effects: [give("insulin"), give("kcl")],
      },
      { id: "im_support", label: "수액·전해질 관리", detail: "안정화 6, 탈수 제거", effects: [stab(6), { op: "remove_status", status: "dehydration", target: "patient", stacks: "all" }] },
    ],
  },
  {
    id: "id",
    nameKo: "감염내과",
    categories: ["infection"],
    traits: ["source"],
    recommendations: [
      {
        id: "id_culture",
        label: "배양 먼저",
        detail: "검체를 골라 배양을 보낸다 (비용 없음). 그람 염색은 바로, 배양은 2턴 뒤",
        effects: [{ op: "choose_option", title: "배양 검체", prompt: "어디서 검체를 받을까", options: CULTURE_OPTIONS }],
      },
      {
        id: "id_targeted",
        label: "감수성에 맞춘 항생제",
        detail: "확인된 원인균에 가장 잘 듣는 좁은 항생제를 손에 (처방집에 없어도)",
        requires: { organismKnown: true },
        requiresText: "배양으로 원인균을 확인한 뒤에",
        effects: [{ op: "targeted_antibiotic" }],
      },
      {
        id: "id_narrow",
        label: "원인균에 맞춰 범위 축소",
        detail: "광범위 항생제를 끊고 장내세균 교란 정리, 치료 계획 배율 +20%",
        requires: { organismKnown: true },
        requiresText: "배양으로 원인균을 확인한 뒤에",
        effects: [{ op: "deescalate" }, { op: "plan_bonus", pct: 20, target: "target" }],
      },
      {
        id: "id_empiric",
        label: "경험적 광범위 항생제",
        detail: "피페라실린-타조박탐을 손에",
        risk: "광범위: 내성과 장내세균 교란",
        requires: { suspect: { categories: ["infection"], level: "possible" } },
        requiresText: "감염 가설이 남아 있을 때만",
        effects: [give("pip_tazo")],
      },
      {
        id: "id_mrsa",
        label: "MRSA 대비",
        detail: "반코마이신을 손에",
        risk: "신독성",
        requires: { suspect: { categories: ["infection"], level: "suspected" } },
        requiresText: "감염이 의심될 때만",
        effects: [give("vancomycin")],
      },
    ],
  },
  {
    id: "cardio",
    nameKo: "심장내과",
    categories: ["cardiovascular", "thrombotic"],
    traits: ["acs", "arrhythmia", "pericardial"],
    recommendations: [
      { id: "cv_echo", label: "심초음파와 심전도", detail: "현장 초음파와 심전도 소견을 얻는다", effects: [look("pocus"), look("ecg")] },
      {
        id: "cv_cath",
        label: "응급 관상동맥 중재술",
        detail: "혈관 재개통술을 손에",
        requires: { suspect: { traits: ["acs"], level: "suspected" } },
        requiresText: "급성 관상동맥 증후군이 의심될 때만",
        effects: [give("revascularization")],
      },
      {
        id: "cv_antithrombotic",
        label: "항응고 시작",
        detail: "헤파린을 손에",
        risk: "출혈",
        requires: { suspect: { traits: ["arterial_thrombus", "venous_thrombus"], level: "possible" } },
        requiresText: "혈전 질환 가설이 있을 때만",
        effects: [give("heparin")],
      },
      {
        id: "cv_rate",
        label: "심박수 조절",
        detail: "메토프롤롤을 손에",
        requires: { suspect: { traits: ["arrhythmia"], level: "possible" } },
        requiresText: "부정맥 가설이 있을 때만",
        effects: [give("metoprolol")],
      },
    ],
  },
  {
    id: "pulm",
    nameKo: "호흡기내과",
    categories: ["respiratory"],
    traits: ["bronchospasm", "resp_failure", "pleural"],
    recommendations: [
      { id: "pu_ct", label: "흉부 CT", detail: "CT 소견을 바로 얻는다", effects: [look("ct")] },
      { id: "pu_niv", label: "산소·비침습 환기", detail: "안정화 8, 저산소 제거", effects: [stab(8), { op: "remove_status", status: "hypoxia", target: "patient", stacks: "all" }] },
      {
        id: "pu_steroid",
        label: "전신 스테로이드",
        detail: "메틸프레드니솔론을 손에",
        risk: "면역억제",
        requires: { suspect: { traits: ["bronchospasm"], level: "possible" } },
        requiresText: "기관지 연축 가설이 있을 때만",
        effects: [give("methylprednisolone")],
      },
      {
        id: "pu_decompress",
        label: "흉강 감압",
        detail: "흉관 삽입을 손에",
        requires: { suspect: { traits: ["pleural"], level: "suspected" } },
        requiresText: "흉막강 질환이 의심될 때만",
        effects: [give("chest_tube")],
      },
    ],
  },
  {
    id: "surgery",
    nameKo: "외과",
    categories: ["abdominal", "bleeding"],
    traits: ["source"],
    recommendations: [
      { id: "su_ct", label: "CT 먼저", detail: "CT 소견을 바로 얻는다", effects: [look("ct")] },
      {
        id: "su_source",
        label: "수술적 감염원 제거",
        detail: "감염원 제거를 손에",
        requires: { suspect: { traits: ["source"], level: "suspected" } },
        requiresText: "제거할 감염원이 의심될 때만",
        effects: [give("source_control")],
      },
      { id: "su_observe", label: "경과 관찰", detail: "안정화 6, 다음 의도 공개", effects: [stab(6), { op: "reveal_intent", target: "target" }] },
    ],
  },
  {
    id: "neuro",
    nameKo: "신경과",
    categories: ["neuro"],
    traits: ["thrombolysable", "intracranial_bleed"],
    recommendations: [
      { id: "ne_ct", label: "뇌 CT", detail: "CT 소견을 바로 얻는다 (혈전용해 전에 필수)", effects: [look("ct")] },
      {
        id: "ne_bp",
        label: "혈압 조절",
        detail: "메토프롤롤을 손에 (뇌출혈의 혈종 확장을 줄인다)",
        risk: "뇌경색이면 이득이 적다",
        requires: { suspect: { traits: ["intracranial_bleed"], level: "possible" } },
        requiresText: "뇌출혈 가설이 있을 때만",
        effects: [give("metoprolol")],
      },
      {
        id: "ne_tpa",
        label: "혈전용해 준비",
        detail: "알테플라제를 손에",
        risk: "CT로 출혈을 배제하지 않고 쓰면 출혈 합병증",
        requires: { suspect: { traits: ["thrombolysable"], level: "suspected" } },
        requiresText: "혈전이 의심될 때만",
        effects: [give("alteplase")],
      },
      { id: "ne_exam", label: "신경학적 재평가", detail: "신경학적 진찰과 발병 양상을 확인한다", effects: [look("ex_neuro"), look("hx_onset")] },
    ],
  },
  {
    id: "gi",
    nameKo: "소화기내과",
    categories: ["abdominal", "bleeding"],
    traits: ["gi_bleed", "hyperammonemia"],
    recommendations: [
      {
        id: "gi_scope",
        label: "응급 내시경",
        detail: "내시경 지혈술을 손에",
        requires: { suspect: { traits: ["gi_bleed"], level: "suspected" } },
        requiresText: "위장관 출혈이 의심될 때만",
        effects: [give("endoscopy")],
      },
      {
        id: "gi_ppi",
        label: "PPI 시작",
        detail: "판토프라졸을 손에",
        requires: { suspect: { traits: ["gi_bleed"], level: "possible" } },
        requiresText: "위장관 출혈 가설이 있을 때만",
        effects: [give("pantoprazole")],
      },
      {
        id: "gi_lactulose",
        label: "간성뇌증 치료",
        detail: "락툴로오스를 손에",
        requires: { suspect: { traits: ["hyperammonemia"], level: "possible" } },
        requiresText: "간성뇌증 가설이 있을 때만",
        effects: [give("lactulose")],
      },
      { id: "gi_labs", label: "간기능·응고 검사", detail: "화학 검사와 응고 검사를 확인한다", effects: [look("lab_chem"), look("lab_coag")] },
    ],
  },
  {
    id: "nephro",
    nameKo: "신장내과",
    categories: ["renal"],
    traits: ["renal_failure", "volume_overload"],
    recommendations: [
      {
        id: "nx_dialysis",
        label: "응급 투석",
        detail: "투석을 손에",
        requires: { suspect: { traits: ["renal_failure"], level: "suspected" } },
        requiresText: "신부전이 의심될 때만",
        effects: [give("dialysis")],
      },
      {
        id: "nx_stop_nephrotoxins",
        label: "신독성 약물 중단",
        detail: "신독성 약물을 끊고 신독성 카드 정리",
        effects: [{ op: "end_drug", filter: { tags: ["nephrotoxic"] } }, { op: "exhaust_cards", from: ["hand", "draw", "discard"], filter: { ids: ["nephrotoxicity"] }, amount: "all" }],
      },
      { id: "nx_volume", label: "체액 상태 평가", detail: "현장 초음파와 소변 검사를 확인한다", effects: [look("pocus"), look("lab_ua")] },
    ],
  },
  {
    id: "icu",
    nameKo: "중환자의학과",
    categories: [],
    traits: ["shock", "resp_failure"],
    recommendations: [
      {
        id: "icu_pressor",
        label: "승압제 시작",
        detail: "노르에피네프린을 손에",
        requires: { suspect: { traits: ["shock"], level: "possible" } },
        requiresText: "쇼크 가설이 있을 때만",
        effects: [give("norepinephrine")],
      },
      {
        id: "icu_airway",
        label: "기관 삽관",
        detail: "기관 삽관을 손에",
        requires: { suspect: { traits: ["resp_failure"], level: "suspected" } },
        requiresText: "호흡 부전이 의심될 때만",
        effects: [give("intubation")],
      },
      { id: "icu_resus", label: "소생 번들", detail: "안정화 10, 다음 의도 공개", effects: [stab(10), { op: "reveal_intent", target: "target" }] },
    ],
  },
  {
    id: "psych",
    nameKo: "정신건강의학과",
    categories: ["neuro"],
    traits: ["agitation"],
    recommendations: [
      { id: "ps_nonpharm", label: "비약물적 섬망 관리", detail: "안정화 5, 착란 카드 전부 정리", effects: [stab(5), { op: "exhaust_cards", from: ["hand", "draw", "discard"], filter: { ids: ["confusion"] }, amount: "all" }] },
      {
        id: "ps_antipsychotic",
        label: "항정신병제",
        detail: "할로페리돌을 손에",
        requires: { suspect: { traits: ["agitation"], level: "possible" } },
        requiresText: "초조·섬망 가설이 있을 때만",
        effects: [give("haloperidol")],
      },
      { id: "ps_review", label: "진정제 검토", detail: "중추신경 억제 약물을 끊고 카드 1장", effects: [{ op: "end_drug", filter: { tags: ["cns_depressant"] } }, { op: "draw", amount: 1 }] },
    ],
  },
] satisfies ConsultDef[];
