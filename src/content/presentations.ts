// 내원 양상. 한 문제는 주호소 하나로 시작하고, 실제 질병은 감별 대상 중에서 가중치로 뽑아 숨긴다.
// 질병 부담 범위를 내원 양상 단위로 두는 이유: 질병마다 다르면 숫자만 보고 진단이 드러난다.
import type { PresentationDef } from "../core/types";

export const PRESENTATIONS = [
  // ── 1막 응급실 ──
  {
    id: "p_vomit",
    complaint: "구토와 복통",
    vignette: "새벽부터 여러 번 토했고 배가 아프다고 한다.",
    candidates: [
      { disease: "gastroenteritis", weight: 65 },
      { disease: "appendicitis", weight: 35 },
    ],
    burden: [30, 34],
    pressure: "pain",
  },
  {
    id: "p_wheeze",
    complaint: "숨참",
    vignette: "숨이 차서 말을 끊어 가며 한다.",
    candidates: [
      { disease: "asthma", weight: 65 },
      { disease: "cap", weight: 35 },
    ],
    burden: [30, 34],
    pressure: "respiratory",
  },
  {
    id: "p_fever_easy",
    complaint: "발열",
    vignette: "사흘째 열이 떨어지지 않는다며 왔다.",
    candidates: [
      { disease: "pyelo", weight: 60 },
      { disease: "cap", weight: 40 },
    ],
    burden: [34, 38],
    pressure: "infection",
  },
  {
    id: "p_abd_pain",
    complaint: "복통",
    vignette: "배를 움켜쥐고 침대에 웅크려 있다.",
    candidates: [
      { disease: "appendicitis", weight: 40 },
      { disease: "gastroenteritis", weight: 30 },
      { disease: "pyelo", weight: 30 },
    ],
    burden: [40, 44],
    pressure: "pain",
  },
  {
    id: "p_fever",
    complaint: "발열과 오한",
    vignette: "열이 나고 온몸이 떨린다.",
    candidates: [
      { disease: "cap", weight: 55 },
      { disease: "pyelo", weight: 45 },
    ],
    burden: [42, 46],
    pressure: "infection",
  },
  {
    id: "p_dyspnea",
    complaint: "호흡곤란",
    vignette: "갑자기 숨이 차다며 호출이 왔다.",
    candidates: [
      { disease: "asthma", weight: 35 },
      { disease: "anaphylaxis", weight: 35 },
      { disease: "cap", weight: 30 },
    ],
    burden: [30, 34],
    pressure: "respiratory",
  },
  {
    id: "p_chest_pain",
    complaint: "흉통",
    vignette: "가슴을 부여잡고 식은땀을 흘린다.",
    candidates: [
      { disease: "stemi", weight: 70 },
      { disease: "pe", weight: 30 },
    ],
    burden: [64, 70],
    pressure: "cardiac",
  },
  {
    id: "p_focal_neuro",
    complaint: "편측 마비",
    vignette: "한쪽 팔다리에 힘이 빠지고 말이 어눌하다.",
    candidates: [{ disease: "stroke", weight: 1 }],
    pressure: "neuro",
  },
  {
    id: "p_dka",
    complaint: "구토와 깊은 호흡",
    vignette: "당뇨가 있는 환자가 토하며 깊고 빠르게 숨을 쉰다. 이번 입원의 주 진단이 될 문제다.",
    candidates: [{ disease: "dka", weight: 1 }],
    pressure: "metabolic",
  },
  // ── 2막 병동 ──
  {
    id: "p_leg",
    complaint: "다리 부종",
    vignette: "한쪽 다리가 붓고 아프다고 한다.",
    candidates: [
      { disease: "dvt", weight: 55 },
      { disease: "cellulitis", weight: 45 },
    ],
    burden: [48, 54],
    pressure: "pain",
  },
  {
    id: "p_confusion",
    complaint: "의식 변화",
    vignette: "보호자가 오늘따라 대답이 엉뚱하다고 한다.",
    candidates: [
      { disease: "delirium", weight: 55 },
      { disease: "he", weight: 45 },
    ],
    burden: [40, 46],
    pressure: "neuro",
  },
  {
    id: "p_ward_dyspnea",
    complaint: "숨참",
    vignette: "병동 간호사가 산소포화도가 떨어진다고 호출했다.",
    candidates: [
      { disease: "chf", weight: 60 },
      { disease: "cap", weight: 40 },
    ],
    burden: [48, 54],
    pressure: "respiratory",
  },
  {
    id: "p_diarrhea",
    complaint: "설사",
    vignette: "하루 종일 설사가 멈추지 않는다.",
    candidates: [
      { disease: "cdi", weight: 65 },
      { disease: "gastroenteritis", weight: 35 },
    ],
    burden: [44, 50],
    pressure: "hemodynamic",
  },
  {
    id: "p_palpitation",
    complaint: "두근거림",
    vignette: "모니터 알람이 울린다. 맥박이 빠르고 불규칙하다.",
    candidates: [{ disease: "af", weight: 1 }],
    pressure: "cardiac",
  },
  {
    id: "p_sudden_dyspnea",
    complaint: "갑작스러운 숨참",
    vignette: "잘 지내던 환자가 갑자기 숨을 못 쉬겠다고 한다.",
    candidates: [
      { disease: "pe", weight: 70 },
      { disease: "stemi", weight: 30 },
    ],
    burden: [76, 82],
    pressure: "respiratory",
  },
  {
    id: "p_severe_abd",
    complaint: "심한 윗배 통증",
    vignette: "등까지 뻗치는 통증으로 몸을 웅크리고 있다.",
    candidates: [{ disease: "pancreatitis", weight: 1 }],
    pressure: "pain",
  },
  {
    id: "p_hematemesis",
    complaint: "토혈",
    vignette: "선홍색 피를 한 사발 토했다. 이번 입원의 두 번째 고비다.",
    candidates: [{ disease: "ugib", weight: 1 }],
    pressure: "bleeding",
  },
  // ── 3막 중환자실 ──
  {
    id: "p_icu_fever",
    complaint: "새로 난 열",
    vignette: "중환자실 엿새째, 열이 다시 오른다.",
    candidates: [
      { disease: "vap", weight: 50 },
      { disease: "clabsi", weight: 50 },
    ],
    burden: [58, 64],
    pressure: "infection",
  },
  {
    id: "p_oliguria",
    complaint: "소변 감소",
    vignette: "소변 주머니가 몇 시간째 거의 비어 있다.",
    candidates: [
      { disease: "aki", weight: 65 },
      { disease: "chf", weight: 35 },
    ],
    burden: [54, 60],
    pressure: "renal",
  },
  {
    id: "p_hypoxemia",
    complaint: "저산소증",
    vignette: "산소를 올려도 산소포화도가 오르지 않는다.",
    candidates: [
      { disease: "ards", weight: 50 },
      { disease: "chf", weight: 25 },
      { disease: "vap", weight: 25 },
    ],
    burden: [60, 66],
    pressure: "respiratory",
  },
  {
    id: "p_bleeding",
    complaint: "출혈",
    vignette: "주사 자리마다 피가 배어 나온다.",
    candidates: [{ disease: "dic", weight: 1 }],
    pressure: "bleeding",
  },
  {
    id: "p_obstructive_shock",
    complaint: "쇼크",
    vignette: "혈압이 계속 떨어지고 목정맥이 불룩하다.",
    candidates: [
      { disease: "tamponade", weight: 50 },
      { disease: "tension_ptx", weight: 50 },
    ],
    burden: [80, 86],
    pressure: "hemodynamic",
  },
  {
    id: "p_icu_crash",
    complaint: "급격한 호흡 악화",
    vignette: "인공호흡기 경보가 울리고 산소포화도가 곤두박질친다.",
    candidates: [
      { disease: "tension_ptx", weight: 55 },
      { disease: "pe", weight: 45 },
    ],
    burden: [78, 84],
    pressure: "respiratory",
  },
  {
    id: "p_septic",
    complaint: "고열과 저혈압",
    vignette: "열이 치솟고 혈압이 무너진다. 이번 입원의 마지막 고비다.",
    candidates: [{ disease: "septic_shock", weight: 1 }],
    pressure: "hemodynamic",
  },
] satisfies PresentationDef[];
