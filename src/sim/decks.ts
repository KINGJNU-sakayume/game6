// 막별 표준 덱. 시뮬레이션 기준 (design.md D8)
import type { CardId } from "../core";

const STARTER: CardId[] = ["first_aid", "first_aid", "first_aid", "first_aid", "stabilize", "stabilize", "stabilize", "stabilize", "history", "acetaminophen"];

export const DECKS: Record<string, CardId[]> = {
  starter: STARTER,
  // 1막 보스 직전: 카드 6장 추가, 1장 제거
  act1: [...STARTER.slice(1), "supportive_care", "early_mobilization", "ceftriaxone", "blood_test", "saline", "insulin", "physical_exam"],
  // 인슐린 없이 1막 보스에 도달한 덱
  act1_noins: [...STARTER.slice(1), "supportive_care", "early_mobilization", "ceftriaxone", "blood_test", "saline", "reassessment", "physical_exam"],
  // 2막 관문 직전
  act2: [
    ...STARTER.slice(2),
    "supportive_care",
    "early_mobilization",
    "ceftriaxone",
    "blood_test",
    "saline",
    "insulin",
    "physical_exam",
    "heparin",
    "intensive_care",
    "furosemide",
    "vancomycin",
    "pantoprazole",
    "oxygen",
  ],
  // 3막 보스 직전
  act3: [
    ...STARTER.slice(3),
    "supportive_care",
    "supportive_care",
    "early_mobilization",
    "ceftriaxone",
    "culture",
    "saline",
    "norepinephrine",
    "physical_exam",
    "heparin",
    "intensive_care",
    "furosemide",
    "vancomycin",
    "pip_tazo",
    "oxygen",
    "monitoring",
    "chart_review",
  ],
};
