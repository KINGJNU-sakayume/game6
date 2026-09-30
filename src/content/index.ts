// ContentDB 조립. ui·sim·테스트가 core에 주입한다.
import { CATEGORIES, ORGANISMS, TAGS, TRAITS } from "./tags";
import { CHANNELS, FINDINGS } from "./evidence";
import { PRESENTATIONS } from "./presentations";
import { CONSULTS } from "./consults";
import { KEYWORDS, STATUSES } from "./statuses";
import { STARTER_CARDS } from "./cards/starter";
import { DIAGNOSTIC_CARDS } from "./cards/diagnostics";
import { PROCEDURE_CARDS } from "./cards/procedures";
import { DRUG_CARDS } from "./cards/drugs";
import { SIDE_EFFECT_CARDS } from "./cards/side-effects";
import { ACT1_DISEASES } from "./diseases/act1";
import { ACT2_DISEASES } from "./diseases/act2";
import { ACT3_DISEASES } from "./diseases/act3";
import { ENCOUNTERS } from "./encounters";
import { INTERACTIONS } from "./interactions";
import { RELICS } from "./relics";
import { EVENTS, QUIZ } from "./events";
import type { ContentDB } from "../core/types";

export const CONTENT: ContentDB = {
  tags: TAGS,
  traits: TRAITS,
  organisms: ORGANISMS,
  keywords: KEYWORDS,
  statuses: STATUSES,
  channels: CHANNELS,
  findings: FINDINGS,
  presentations: PRESENTATIONS,
  consults: CONSULTS,
  cards: [...STARTER_CARDS, ...DIAGNOSTIC_CARDS, ...PROCEDURE_CARDS, ...DRUG_CARDS, ...SIDE_EFFECT_CARDS],
  diseases: [...ACT1_DISEASES, ...ACT2_DISEASES, ...ACT3_DISEASES],
  encounters: ENCOUNTERS,
  interactions: INTERACTIONS,
  relics: RELICS,
  events: EVENTS,
  quiz: QUIZ,
  // 행동 덱: 묻고, 보고, 검사하고, 버티고, 처방한다
  starterDeck: ["history", "physical_exam", "lab_workup", "imaging", "stabilize", "stabilize", "supportive_care", "supportive_care", "med_order", "med_order"],
  // 응급실 처방집: 흔한 응급 약물만. 나머지는 보상·협진·이벤트로 연다
  starterFormulary: ["saline", "ceftriaxone", "clarithromycin", "metronidazole", "salbutamol", "epinephrine", "insulin", "acetaminophen"],
  starterRelic: "intern_notebook",
  categories: CATEGORIES,
};
