// 인카운터. design.md §5.6
// 인카운터는 "문제 목록"이다. 문제마다 내원 양상 하나이고, 실제 질병은 그 감별 대상 중에서 숨겨 뽑는다.
// 제목은 내원 양상만 말한다. 진단을 암시하는 제목(예: "CT실에서 호출")은 쓰지 않는다.
import type { EncounterDef } from "../core/types";

const P = 60; // 두 문제 인카운터의 질병 부담 비율
const A = 60; // 두 문제 인카운터의 공격 비율

export const ENCOUNTERS = [
  // 1막 응급실
  { id: "e1_vomit", act: 1, pool: "easy", problems: [{ presentation: "p_vomit" }], title: "새벽 3시, 구토하는 환자" },
  { id: "e1_wheeze", act: 1, pool: "easy", problems: [{ presentation: "p_wheeze" }], title: "숨소리가 이상하다" },
  { id: "e1_fever", act: 1, pool: "easy", problems: [{ presentation: "p_fever_easy" }], title: "열이 떨어지지 않는다" },
  { id: "n1_abd", act: 1, pool: "normal", problems: [{ presentation: "p_abd_pain" }], title: "배를 움켜쥐고 있다" },
  { id: "n1_fever", act: 1, pool: "normal", problems: [{ presentation: "p_fever" }], title: "열과 오한" },
  { id: "n1_dyspnea", act: 1, pool: "normal", problems: [{ presentation: "p_dyspnea", hpPct: 120, atkPct: 130 }], title: "갑자기 숨이 차다는 호출" },
  { id: "n1_vomit", act: 1, pool: "normal", problems: [{ presentation: "p_vomit", hpPct: 125, atkPct: 115 }], title: "토하고 배가 아프다" },
  { id: "el1_chest", act: 1, pool: "elite", problems: [{ presentation: "p_chest_pain" }], title: "식은땀을 흘린다" },
  { id: "el1_neuro", act: 1, pool: "elite", problems: [{ presentation: "p_focal_neuro" }], title: "말이 어눌해졌다" },
  { id: "b1_dka", act: 1, pool: "boss", problems: [{ presentation: "p_dka", hpPct: 125, atkPct: 150 }], title: "주 진단" },
  // 2막 병동
  { id: "e2_confusion", act: 2, pool: "easy", problems: [{ presentation: "p_confusion", atkPct: 110 }], title: "밤중에 병동이 소란하다" },
  { id: "e2_leg", act: 2, pool: "easy", problems: [{ presentation: "p_leg", hpPct: 85 }], title: "다리가 붓는다" },
  { id: "n2_leg", act: 2, pool: "normal", problems: [{ presentation: "p_leg" }], title: "한쪽 다리가 붓고 아프다" },
  { id: "n2_confusion", act: 2, pool: "normal", problems: [{ presentation: "p_confusion", hpPct: 110, atkPct: 125 }], title: "대답이 엉뚱하다" },
  { id: "n2_dyspnea", act: 2, pool: "normal", problems: [{ presentation: "p_ward_dyspnea" }], title: "산소포화도 저하 호출" },
  { id: "n2_diarrhea", act: 2, pool: "normal", problems: [{ presentation: "p_diarrhea", hpPct: 115, atkPct: 140 }], title: "설사가 멈추지 않는다" },
  { id: "n2_palp", act: 2, pool: "normal", problems: [{ presentation: "p_palpitation", hpPct: 125, atkPct: 140 }], title: "모니터 알람" },
  { id: "el2_dyspnea", act: 2, pool: "elite", problems: [{ presentation: "p_sudden_dyspnea", atkPct: 130 }], title: "갑자기 숨을 못 쉰다" },
  { id: "el2_abd", act: 2, pool: "elite", problems: [{ presentation: "p_severe_abd", hpPct: 120, atkPct: 170 }], title: "등까지 뻗치는 통증" },
  { id: "g2_ugib", act: 2, pool: "gate", problems: [{ presentation: "p_hematemesis" }], title: "주 진단" },
  // 3막 중환자실
  { id: "e3_oliguria", act: 3, pool: "easy", problems: [{ presentation: "p_oliguria", hpPct: 85 }], title: "소변 주머니가 비어 있다" },
  { id: "e3_fever", act: 3, pool: "easy", problems: [{ presentation: "p_icu_fever", hpPct: 85 }], title: "열이 다시 오른다" },
  { id: "n3_fever", act: 3, pool: "normal", problems: [{ presentation: "p_icu_fever" }], title: "새로 난 열" },
  { id: "n3_oliguria", act: 3, pool: "normal", problems: [{ presentation: "p_oliguria" }], title: "크레아티닌 상승" },
  { id: "n3_hypoxemia", act: 3, pool: "normal", problems: [{ presentation: "p_hypoxemia" }], title: "산소포화도가 오르지 않는다" },
  { id: "n3_bleeding", act: 3, pool: "normal", problems: [{ presentation: "p_bleeding" }], title: "피가 멎지 않는다" },
  {
    id: "n3_multi",
    act: 3,
    pool: "normal",
    problems: [
      { presentation: "p_icu_fever", hpPct: P, atkPct: A },
      { presentation: "p_oliguria", hpPct: P, atkPct: A },
    ],
    title: "열과 소변 감소 — 문제 두 개",
  },
  {
    id: "n3_multi2",
    act: 3,
    pool: "normal",
    problems: [
      { presentation: "p_hypoxemia", hpPct: P, atkPct: A },
      { presentation: "p_bleeding", hpPct: P, atkPct: A },
    ],
    title: "저산소와 출혈 — 문제 두 개",
  },
  { id: "el3_shock", act: 3, pool: "elite", problems: [{ presentation: "p_obstructive_shock" }], title: "혈압이 떨어진다" },
  { id: "el3_crash", act: 3, pool: "elite", problems: [{ presentation: "p_icu_crash", hpPct: 115, atkPct: 135 }], title: "인공호흡기 경보" },
  { id: "b3_septic", act: 3, pool: "boss", problems: [{ presentation: "p_septic" }], title: "주 진단" },
] satisfies EncounterDef[];
