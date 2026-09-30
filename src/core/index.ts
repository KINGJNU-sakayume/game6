// core 공개 API. ui와 sim은 이 파일만 import한다. design.md §3.3
export {
  installContent,
  contentInstalled,
  cardDef,
  diseaseDef,
  relicDef,
  statusDef,
  tagDef,
  traitDef,
  organismDef,
  eventDef,
  quizDef,
  keywordDef,
  encounterDef,
  channelDef,
  findingDef,
  presentationDef,
  consultDef,
  db,
  categoryName,
  hasRelicDef,
  hasCard,
} from "./registry";
export { validateContent, cardBudget, indicatedDiseaseCount } from "./validate";
export type { ValidationResult } from "./validate";
export { newRun, availableNodes, START_VITALITY, START_GOLD, actDiseases, contextRelevance } from "./run";
export type { RunOptions } from "./run";
export { step } from "./step";
export type { StepResult } from "./step";
export { legalActions } from "./legal";
export { previewInteractions } from "./drugs";
export { visibleEnemyInfo, previewDamage, cardCost, isPlayable, returnInfo, patientStatusViews, gradeLabel, ABX_SHORT } from "./view";
export type { EnemyView, IntentView, HypothesisView, FindingView, OrganismView, AbxCell } from "./view";
export { describeCard } from "./describe";
export type { CardText } from "./describe";
export { stateHash, canonicalStringify } from "./hash";
export { checkInvariants } from "./invariants";
export { canPlay, commitCheck, returnCheck, REVISE_COST } from "./combat";
export { actFloors, treasureFloor, MAP_WIDTH, reachableFromStart } from "./map";
export { resistancePct, GRADE_PCT, PLAN_PCT } from "./damage";
export { LEVEL_LABEL, LEVEL_RANK, scoreDifferential, channelValue, bestChannels, expectedFindings } from "./evidence";
export { PRESSURE_LABEL, BAND_LABEL, BAND_RANGE, bandOf, intentSignature, moveSignature } from "./enemy-ai";
export { textbook, cardTextbook, textbookSummary, isTreatmentCard, organismsOf } from "./textbook";
export { formularyItems, previewDiscover, procedureRisk } from "./choice";
export * from "./types";
export { cyrb128 } from "./rng";
