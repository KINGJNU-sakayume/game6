// 인카운터. design.md §5.6
import type { EncounterDef } from "../core/types";

const P = 60; // 두 질병 인카운터의 중증도 비율
const A = 60; // 두 질병 인카운터의 공격 비율

export const ENCOUNTERS = [
  // 1막
  { id: "e1_gastro", act: 1, pool: "easy", enemies: [{ disease: "gastroenteritis" }], title: "새벽 3시, 구토하는 환자" },
  { id: "e1_asthma", act: 1, pool: "easy", enemies: [{ disease: "asthma" }], title: "숨소리가 이상하다" },
  { id: "e1_pyelo", act: 1, pool: "easy", enemies: [{ disease: "pyelo" }], title: "열이 떨어지지 않는다" },
  { id: "n1_appendicitis", act: 1, pool: "normal", enemies: [{ disease: "appendicitis" }], title: "배를 움켜쥐고 있다" },
  { id: "n1_cap", act: 1, pool: "normal", enemies: [{ disease: "cap" }], title: "기침과 열" },
  { id: "n1_pyelo", act: 1, pool: "normal", enemies: [{ disease: "pyelo" }], title: "오한이 온다" },
  { id: "n1_anaphylaxis", act: 1, pool: "normal", enemies: [{ disease: "anaphylaxis" }], title: "CT실에서 급히 호출" },
  { id: "n1_cap_asthma", act: 1, pool: "normal", enemies: [{ disease: "cap", hpPct: P, atkPct: A }, { disease: "asthma", hpPct: P, atkPct: A }], title: "열나고 숨차다" },
  { id: "n1_abdomen", act: 1, pool: "normal", enemies: [{ disease: "appendicitis", hpPct: P, atkPct: A }, { disease: "gastroenteritis", hpPct: P, atkPct: A }], title: "복통 감별" },
  { id: "el1_stemi", act: 1, pool: "elite", enemies: [{ disease: "stemi" }], title: "식은땀을 흘린다" },
  { id: "el1_stroke", act: 1, pool: "elite", enemies: [{ disease: "stroke" }], title: "말이 어눌해졌다" },
  { id: "b1_dka", act: 1, pool: "boss", enemies: [{ disease: "dka" }], title: "주 진단" },
  // 2막
  { id: "e2_delirium", act: 2, pool: "easy", enemies: [{ disease: "delirium" }], title: "밤중에 병동이 소란하다" },
  { id: "e2_dvt", act: 2, pool: "easy", enemies: [{ disease: "dvt" }], title: "다리가 붓는다" },
  { id: "n2_cellulitis", act: 2, pool: "normal", enemies: [{ disease: "cellulitis" }], title: "주사 자리가 붉다" },
  { id: "n2_dvt", act: 2, pool: "normal", enemies: [{ disease: "dvt" }], title: "한쪽 다리만 붓는다" },
  { id: "n2_chf", act: 2, pool: "normal", enemies: [{ disease: "chf" }], title: "누우면 숨차다" },
  { id: "n2_he", act: 2, pool: "normal", enemies: [{ disease: "he" }], title: "대답이 엉뚱하다" },
  { id: "n2_cdi", act: 2, pool: "normal", enemies: [{ disease: "cdi" }], title: "설사가 멈추지 않는다" },
  { id: "n2_af", act: 2, pool: "normal", enemies: [{ disease: "af" }], title: "모니터 알람" },
  { id: "n2_leg", act: 2, pool: "normal", enemies: [{ disease: "cellulitis", hpPct: P, atkPct: A }, { disease: "dvt", hpPct: P, atkPct: A }], title: "다리 부종 감별" },
  { id: "n2_mental", act: 2, pool: "normal", enemies: [{ disease: "he", hpPct: P, atkPct: A }, { disease: "delirium", hpPct: P, atkPct: A }], title: "의식 변화 감별" },
  { id: "el2_pe", act: 2, pool: "elite", enemies: [{ disease: "pe" }], title: "갑자기 숨을 못 쉰다" },
  { id: "el2_pancreatitis", act: 2, pool: "elite", enemies: [{ disease: "pancreatitis" }], title: "등까지 뻗치는 통증" },
  { id: "g2_ugib", act: 2, pool: "gate", enemies: [{ disease: "ugib" }], title: "주 진단" },
  // 3막
  { id: "e3_aki", act: 3, pool: "easy", enemies: [{ disease: "aki" }], title: "소변 주머니가 비어 있다" },
  { id: "e3_clabsi", act: 3, pool: "easy", enemies: [{ disease: "clabsi" }], title: "라인 주변이 붉다" },
  { id: "n3_vap", act: 3, pool: "normal", enemies: [{ disease: "vap" }], title: "가래가 늘었다" },
  { id: "n3_aki", act: 3, pool: "normal", enemies: [{ disease: "aki" }], title: "크레아티닌 상승" },
  { id: "n3_ards", act: 3, pool: "normal", enemies: [{ disease: "ards" }], title: "산소포화도가 오르지 않는다" },
  { id: "n3_dic", act: 3, pool: "normal", enemies: [{ disease: "dic" }], title: "피가 멎지 않는다" },
  { id: "n3_clabsi", act: 3, pool: "normal", enemies: [{ disease: "clabsi" }], title: "혈액배양 양성" },
  { id: "n3_vap_aki", act: 3, pool: "normal", enemies: [{ disease: "vap", hpPct: P, atkPct: A }, { disease: "aki", hpPct: P, atkPct: A }], title: "폐렴과 신장" },
  { id: "n3_ards_dic", act: 3, pool: "normal", enemies: [{ disease: "ards", hpPct: P, atkPct: A }, { disease: "dic", hpPct: P, atkPct: A }], title: "다장기 손상" },
  { id: "el3_tamponade", act: 3, pool: "elite", enemies: [{ disease: "tamponade" }], title: "혈압이 떨어진다" },
  { id: "el3_ptx", act: 3, pool: "elite", enemies: [{ disease: "tension_ptx" }], title: "기도압 경보" },
  { id: "b3_septic", act: 3, pool: "boss", enemies: [{ disease: "septic_shock" }], title: "주 진단" },
] satisfies EncounterDef[];
