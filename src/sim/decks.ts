// 막별 표준 덱. 시뮬레이션 기준 (design.md D8). 처방집은 시작 처방집을 쓴다(--formulary로 바꿀 수 있다).
import type { CardId } from "../core";

const STARTER: CardId[] = ["history", "physical_exam", "lab_workup", "imaging", "stabilize", "stabilize", "supportive_care", "consult", "med_order", "med_order"];
const STARTER_FORMULARY: CardId[] = ["saline", "ceftriaxone", "clarithromycin", "metronidazole", "salbutamol", "epinephrine", "insulin", "aspirin", "heparin", "acetaminophen"];

/** 막별 표준 처방집: 앞 막 보상에서 두세 개를 얻었다고 본다 */
export const FORMULARIES: Record<string, CardId[]> = {
  starter: STARTER_FORMULARY,
  act1: STARTER_FORMULARY,
  act2: [...STARTER_FORMULARY, "furosemide", "lactulose", "haloperidol", "kcl", "vancomycin", "metoprolol"],
  act3: [...STARTER_FORMULARY, "furosemide", "lactulose", "haloperidol", "kcl", "vancomycin", "metoprolol", "pip_tazo", "pantoprazole", "norepinephrine", "source_control", "chest_tube", "transfusion"],
};

export const DECKS: Record<string, CardId[]> = {
  starter: STARTER,
  // 1막 보스 직전: 행동 카드 4장 추가
  act1: [...STARTER, "bedside_tests", "culture", "reassessment", "monitoring"],
  // 2막 관문 직전
  act2: [...STARTER, "bedside_tests", "culture", "reassessment", "monitoring", "consult", "med_order", "oxygen", "procedure_order"],
  // 3막 보스 직전
  act3: [...STARTER, "bedside_tests", "culture", "reassessment", "monitoring", "consult", "med_order", "oxygen", "procedure_order", "intensive_care", "med_review", "chart_review"],
};
