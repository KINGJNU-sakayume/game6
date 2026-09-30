// 모든 정의·상태 타입. design.md §3.5, §4.

export type Uid = string;
export type CardId = string;
export type DiseaseId = string;
export type StatusId = string;
export type RelicId = string;
export type Tag = string;
export type Trait = string;
export type MoveId = string;
export type OrganismId = string;
export type EventId = string;

export type RngState = [number, number, number, number];
export type RunRngStream = "map" | "encounter" | "reward" | "shop" | "event" | "relic" | "profile";
export type CombatRngStream = "shuffle" | "enemyAi" | "cardEffect";

export type Grade = "key" | "weak" | "normal" | "resistant" | "immune" | "harmful";

export type Fidelity = "accurate" | "simplified" | "stylized" | "unverified";
export interface MedicalNote {
  fidelity: Fidelity;
  note: string;
}

export type DiseaseCategory =
  | "infection"
  | "metabolic"
  | "cardiovascular"
  | "thrombotic"
  | "respiratory"
  | "neuro"
  | "bleeding"
  | "abdominal"
  | "allergic"
  | "renal";

export type CardKind = "procedure" | "drug" | "diagnostic" | "side_effect";
export type Rarity = "starter" | "common" | "uncommon" | "rare" | "special";
export type Keyword = "exhaust" | "ethereal" | "retain" | "targeted" | "unplayable" | "power";

// ───────────────────────── 값·조건·명령 ─────────────────────────

export type TargetSel = "patient" | "target" | "all_enemies" | "random_enemy" | "self" | "source";

export type CountRef =
  | "hand_size"
  | "active_drug_count"
  | "exhaust_count"
  | "cards_played_this_turn"
  | "drugs_played_this_turn"
  | "status_stacks"
  | "knowledge_level"
  | "side_effects_in_hand"
  | "drugs_ended_now";

export type ValueExpr =
  | number
  | { ref: CountRef; of?: TargetSel; status?: StatusId }
  | { add: [ValueExpr, ValueExpr] }
  | { mul: [ValueExpr, ValueExpr] }
  | { min: [ValueExpr, ValueExpr] };

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { knowledgeAtLeast: { target: TargetSel; level: 0 | 1 | 2 } }
  | { hasStatus: { target: TargetSel; status: StatusId; min?: number } }
  | { activeDrugTag: Tag }
  | { targetCategory: DiseaseCategory[] }
  | { targetTrait: Trait[] }
  | { vitalityBelowPct: number }
  | { severityBelowPct: { target: TargetSel; pct: number } }
  | { countAtLeast: { ref: CountRef; n: number } }
  | { turnAtLeast: number }
  | { noCountdown: true }
  | { eventDrugTag: Tag }
  | { handHasCard: CardId };

export interface CardFilter {
  kind?: CardKind[];
  ids?: CardId[];
  tags?: Tag[];
  sideEffect?: boolean;
}
export interface DrugFilter {
  tags?: Tag[];
  ids?: CardId[];
  all?: boolean;
}
export type Pile = "hand" | "draw" | "discard";

export type EffectOp =
  | { op: "damage"; amount: ValueExpr; target?: TargetSel; tags?: Tag[]; hits?: number; mods?: { if: Condition; pct: number }[] }
  | { op: "lose_vitality"; amount: ValueExpr }
  | { op: "heal"; amount: ValueExpr; target?: TargetSel }
  | { op: "gain_stability"; amount: ValueExpr; target?: TargetSel }
  | { op: "gain_orders"; amount: ValueExpr }
  | { op: "draw"; amount: ValueExpr }
  | { op: "exhaust_cards"; from: Pile[]; filter: CardFilter; amount: number | "all" }
  | { op: "add_card"; cardId: CardId; count: number; dest: "hand" | "discard" | "draw_random"; costZeroThisTurn?: boolean }
  | { op: "add_random_card"; rarity: Rarity; dest: "hand"; costZeroThisTurn?: boolean }
  | { op: "apply_status"; status: StatusId; stacks: ValueExpr; target: TargetSel }
  | { op: "remove_status"; status: StatusId; target: TargetSel; stacks: number | "all" }
  | { op: "diagnose"; points: ValueExpr; target: TargetSel }
  | { op: "confirm"; target: TargetSel }
  | { op: "reveal_intent"; target: TargetSel }
  | { op: "modify_resistance"; tag: Tag | "all"; delta: number; target: TargetSel }
  | { op: "end_drug"; filter: DrugFilter }
  | { op: "extend_drug"; filter: DrugFilter; turns: number }
  | { op: "modify_current"; pct: number }
  | { op: "suppress_side_effects" }
  | { op: "extra_side_effects"; times: number }
  | { op: "cost_modifier"; filter: CardFilter; delta: number; uses: number; scope: "turn" | "combat" }
  | { op: "combat_flag"; flag: string; delta: number }
  | { op: "targeted_bonus"; pct: number; target: TargetSel }
  | { op: "start_countdown"; move: MoveId; turns: number; target?: TargetSel }
  | { op: "enter_phase"; phase: number; target?: TargetSel }
  | { op: "raise_max_severity"; amount: number; target?: TargetSel }
  | { op: "gain_gold"; amount: number }
  | { op: "repeat"; times: number; effects: EffectOp[] }
  | { op: "if"; cond: Condition; then: EffectOp[]; else?: EffectOp[] }
  | { op: "delay"; turns: number; effects: EffectOp[] }
  | { op: "select_cards"; from: Pile[]; filter?: CardFilter; min: number; max: number; then: EffectOp[]; prompt: string }
  | { op: "exhaust_selected" }
  | { op: "discard_selected" }
  | { op: "retain_selected" }
  | { op: "custom"; id: string; params?: Record<string, number | string> }
  // ── 내부 명령 (콘텐츠에서 쓰지 않음) ──
  | { op: "administer"; cardUid: Uid }
  | { op: "emit_side_effects"; cardUid: Uid }
  | { op: "reset_current" }
  | { op: "card_played"; cardUid: Uid }
  | { op: "finish_card"; cardUid: Uid }
  | { op: "purge_self"; cardUid: Uid }
  | { op: "phase"; name: TurnPhase; enemyUid?: Uid };

export type TurnPhase =
  | "combat_start"
  | "player_turn_start"
  | "delayed_tick"
  | "drug_turn_start"
  | "status_turn_start"
  | "enemy_passive_turn_start"
  | "tick_drugs"
  | "turn_draw"
  | "relic_turn_start"
  | "end_turn_hand"
  | "end_turn_discard"
  | "enemy_turns"
  | "enemy_act"
  | "enemy_turn_end"
  | "round_end";

// ───────────────────────── 정의 ─────────────────────────

export interface TagDef {
  id: Tag;
  nameKo: string;
  kind: "therapeutic" | "class" | "property";
  indications?: { categories?: DiseaseCategory[]; traits?: Trait[] };
}

export interface TraitDef {
  id: Trait;
  nameKo: string;
}

export interface OrganismDef {
  id: OrganismId;
  nameKo: string;
  nameEn: string;
}

export interface KeywordDef {
  id: string;
  nameKo: string;
  description: string;
}

export type TriggerEvent =
  | "combat_start"
  | "turn_start"
  | "turn_end"
  | "card_played"
  | "drug_administered"
  | "drug_expired"
  | "interaction_fired"
  | "damage_taken"
  | "enemy_cured"
  | "knowledge_up"
  | "countdown_started"
  | "vitality_below"
  | "card_drawn"
  | "combat_end"
  | "enemy_turn_end";

export interface TriggerDef {
  on: TriggerEvent;
  condition?: Condition;
  effects: EffectOp[];
  oncePerCombat?: boolean;
  text?: string;
}

export interface SideEffectSpec {
  card: CardId;
  count: number;
  dest: "discard" | "draw_random" | "hand";
}

export interface DrugInfo {
  halfLife: 1 | 2 | 3 | 4;
  whileActive?: TriggerDef[];
  sideEffects: SideEffectSpec[];
  spectrum?: Partial<Record<OrganismId, Grade>>;
}

export interface SideEffectInfo {
  harm: number;
  persistent?: boolean;
  behavior: TriggerDef[];
  purgeCost?: number;
  passive?: "abx_cost_up" | "infection_attack_up";
}

export interface CardDef {
  id: CardId;
  nameKo: string;
  nameEn: string;
  kind: CardKind;
  rarity: Rarity;
  cost: number | "unplayable";
  target: "enemy" | "none";
  tags: Tag[];
  keywords?: Keyword[];
  effects: EffectOp[];
  drug?: DrugInfo;
  sideEffect?: SideEffectInfo;
  upgrade: Partial<Pick<CardDef, "cost" | "effects" | "keywords">> & { drug?: Partial<DrugInfo> };
  textOverride?: string;
  flavor?: string;
  medical?: MedicalNote;
}

export interface IntentPart {
  kind: "attack" | "debuff" | "buff" | "defend" | "complication" | "card" | "special";
  value?: number;
  hits?: number;
  label?: string;
}

export interface MoveDef {
  id: MoveId;
  nameKo: string;
  hitsRange?: [number, number];
  effects: EffectOp[];
}

export interface AiPattern {
  opening?: MoveId[];
  rules?: { when: Condition; move: MoveId; once?: boolean }[];
  weights: Partial<Record<MoveId, number>>;
  noRepeat?: MoveId[];
  maxInARow?: number;
}

export interface PhaseDef {
  id: string;
  nameKo: string;
  enterAtSeverityPct?: number;
  traitsAdd?: Trait[];
  traitsRemove?: Trait[];
  effectivenessOverride?: Partial<Record<Tag, Grade>>;
  moves?: MoveDef[];
  ai?: AiPattern;
  onEnter?: EffectOp[];
}

export interface VariantDef {
  id: string;
  weight: number;
  nameKo: string;
  organism?: OrganismId;
  effectivenessOverride?: Partial<Record<Tag, Grade>>;
  passives?: TriggerDef[];
}

export type ArtRegion = "head" | "chest" | "abdomen" | "pelvis" | "leg" | "body";

export interface DiseaseDef {
  id: DiseaseId;
  nameKo: string;
  nameEn: string;
  presentation: { complaint: string; clues: string[] };
  category: DiseaseCategory;
  traits: Trait[];
  tier: "normal" | "elite" | "gate" | "boss";
  act: 1 | 2 | 3;
  severity: [number, number];
  diagnosis: { partialAt: number; confirmAt: number };
  organism?: OrganismId;
  effectiveness: Partial<Record<Tag, Grade>>;
  acquiredResistance?: { tags: Tag[]; gainPerHit: number; start?: Partial<Record<Tag, number>> };
  passives?: TriggerDef[];
  passiveText?: string[];
  variants?: VariantDef[];
  phases?: PhaseDef[];
  moves: MoveDef[];
  ai: AiPattern;
  art: { region: ArtRegion; lesion: [number, number, number] };
  medical: MedicalNote;
}

export interface EncounterDef {
  id: string;
  act: 1 | 2 | 3;
  pool: "easy" | "normal" | "elite" | "gate" | "boss";
  enemies: { disease: DiseaseId; hpPct?: number; atkPct?: number }[];
  title?: string;
}

export interface TagQuery {
  all?: Tag[];
  any?: Tag[];
  cardId?: CardId;
}

export interface InteractionRule {
  id: string;
  kind: "synergy" | "hazard" | "antagonism";
  incoming: TagQuery;
  active?: TagQuery;
  symmetric: boolean;
  condition?: Condition;
  activeCondition?: "not_active";
  priority: number;
  overrides?: string[];
  effects: EffectOp[];
  text: string;
  medical: MedicalNote;
}

export interface StatusDef {
  id: StatusId;
  nameKo: string;
  owner: "patient" | "enemy" | "both";
  stacking: "intensity" | "duration";
  decay: "none" | "round_end" | "custom";
  debuff: boolean;
  description: string;
  medical?: MedicalNote;
}

export type RelicModifier =
  | { kind: "ordersPerTurn"; delta: number }
  | { kind: "cardRewardChoices"; value: number }
  | { kind: "noRestHeal" }
  | { kind: "maxCardsPerTurn"; value: number }
  | { kind: "abxPct"; pct: number }
  | { kind: "resistanceHalf" }
  | { kind: "abxBonusConfirmed"; value: number }
  | { kind: "diagnoseBonus"; value: number }
  | { kind: "firstDrugNoSideEffects" }
  | { kind: "firstHazardBlocked" }
  | { kind: "retainOne" };

export interface RelicDef {
  id: RelicId;
  nameKo: string;
  nameEn?: string;
  badge: string;
  tier: "starter" | "common" | "uncommon" | "boss" | "special";
  triggers: TriggerDef[];
  modifiers?: RelicModifier[];
  description: string;
  flavor: string;
}

export type RunOp =
  | { op: "gain_gold"; amount: number }
  | { op: "lose_gold"; amount: number }
  | { op: "heal"; amount: number }
  | { op: "lose_vitality"; amount: number }
  | { op: "gain_random_card"; rarity: Rarity; kind?: CardKind }
  | { op: "gain_random_relic"; tier: "common" | "uncommon" }
  | { op: "upgrade_random"; count: number; kind?: CardKind }
  | { op: "deck_select"; purpose: "upgrade" | "remove"; min: number; max: number; prompt: string }
  | { op: "set_flag"; flag: string; value: number };

export interface EventOption {
  id: string;
  label: string;
  detail: string;
  requires?: { goldAtLeast?: number };
  ops: RunOp[];
  result: string;
}

export interface EventDef {
  id: EventId;
  title: string;
  body: string;
  options: EventOption[];
  quiz?: boolean;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface ContentDB {
  tags: TagDef[];
  traits: TraitDef[];
  organisms: OrganismDef[];
  keywords: KeywordDef[];
  statuses: StatusDef[];
  cards: CardDef[];
  diseases: DiseaseDef[];
  encounters: EncounterDef[];
  interactions: InteractionRule[];
  relics: RelicDef[];
  events: EventDef[];
  quiz: QuizQuestion[];
  starterDeck: CardId[];
  starterRelic: RelicId;
  categories: Record<DiseaseCategory, string>;
}

// ───────────────────────── 상태 ─────────────────────────

export interface CardInstance {
  uid: Uid;
  cardId: CardId;
  upgraded: boolean;
  temp?: boolean;               // 전투 한정 (부작용, 생성 카드)
  costZeroThisTurn?: boolean;
  retainThisTurn?: boolean;
}

export interface RelicInstance {
  id: RelicId;
  counter?: number;
}

export interface StatusStack {
  id: StatusId;
  stacks: number;
  fresh?: boolean;              // 이번 적 턴에 걸린 지속형 상태: 라운드 종료 감소를 한 번 건너뜀
}

export interface PlannedMove {
  moveId: MoveId;
  hits?: number;
}

export interface EnemyState {
  uid: Uid;
  diseaseId: DiseaseId;
  variantId?: string;
  severity: number;
  maxSeverity: number;
  stability: number;
  statuses: StatusStack[];
  knowledge: 0 | 1 | 2;
  diagnosisPoints: number;
  acquiredResistance: Record<Tag, number>;
  resistanceFraction: number;
  phase: number;
  ai: { history: MoveId[]; planned: PlannedMove[]; planIndex: number; usedOnce: MoveId[] };
  countdowns: { moveId: MoveId; turnsLeft: number }[];
  revealNext: boolean;
  targetedBonus: number;
  cured: boolean;
  atkPct?: number;
}

export interface ActiveDrug {
  uid: Uid;
  cardId: CardId;
  tags: Tag[];
  turnsLeft: number;
  order: number;
  upgraded: boolean;
}

export interface EffectOwner {
  kind: "card" | "enemy" | "relic" | "drug" | "status" | "rule" | "system" | "side_effect";
  id: string;                   // uid 또는 정의 id
  cardId?: CardId;
}

export interface EffectCtx {
  owner: EffectOwner;
  targetUid?: Uid;
  selected?: Uid[];
  cardTags?: Tag[];
  eventDrugTags?: Tag[];
}

export interface QueuedEffect {
  op: EffectOp;
  ctx: EffectCtx;
}

export interface DelayedEffect {
  turnsLeft: number;
  effects: EffectOp[];
  ctx: EffectCtx;
}

export interface CostModifier {
  filter: CardFilter;
  delta: number;
  uses: number;
  scope: "turn" | "combat";
}

export interface LogEntry {
  turn: number;
  kind: "play" | "enemy" | "drug" | "rule" | "diag" | "info" | "warn" | "turn";
  text: string;
}

export interface CombatState {
  kind: "normal" | "elite" | "gate" | "boss";
  encounterId: string;
  turn: number;
  orders: number;
  ordersPerTurn: number;
  stability: number;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  limbo: CardInstance[];
  enemies: EnemyState[];
  activeDrugs: ActiveDrug[];
  patientStatuses: StatusStack[];
  queue: QueuedEffect[];
  delayed: DelayedEffect[];
  costModifiers: CostModifier[];
  current?: { cardUid: Uid; pct: number; suppressSideEffects: boolean; extraSideEffects: number };
  counters: Record<string, number>;
  flags: Record<string, number>;
  log: LogEntry[];
  rng: Record<CombatRngStream, RngState>;
  drugOrder: number;
  over?: "victory" | "defeat";
}

export type NodeType = "battle" | "elite" | "rest" | "shop" | "treasure" | "event" | "boss";

export interface MapNode {
  id: string;
  floor: number;
  col: number;
  type: NodeType;
  next: string[];
}

export interface MapState {
  act: 1 | 2 | 3;
  floors: number;
  nodes: Record<string, MapNode>;
  bossId: string;
  visited: string[];
}

export type RewardItem =
  | { kind: "gold"; amount: number; taken: boolean }
  | { kind: "card"; options: CardId[]; taken: boolean }
  | { kind: "relic"; relicId: RelicId; taken: boolean };

export interface RewardState {
  source: "normal" | "elite" | "gate" | "boss" | "treasure";
  items: RewardItem[];
}

export interface ShopState {
  cards: { slot: string; cardId: CardId; price: number; sold: boolean }[];
  relics: { slot: string; relicId: RelicId; price: number; sold: boolean }[];
  removalPrice: number;
  removalUsed: boolean;
}

export interface EventState {
  eventId: EventId;
  resolved?: { optionId: string; text: string; correct?: boolean };
  quiz?: { questionId: string; order: number[] };
}

export type PendingChoice =
  | { kind: "select_cards"; candidates: Uid[]; min: number; max: number; prompt: string; then: EffectOp[]; ctx: EffectCtx }
  | { kind: "deck_select"; purpose: "upgrade" | "remove" | "purge" | "shop_remove"; candidates: Uid[]; min: number; max: number; prompt: string };

export interface RunStats {
  combatsWon: number;
  damageTaken: number;
  cardsPlayed: number;
  sideEffectsGained: number;
  interactions: Record<string, number>;
  diseasesCured: DiseaseId[];
  diagnosesConfirmed: number;
  harmfulTreatments: number;
  deathCause?: DiseaseId;
  floorsClimbed: number;
}

export interface RunState {
  act: 1 | 2 | 3;
  floor: number;
  map: MapState;
  currentNode?: string;
  vitality: number;
  maxVitality: number;
  gold: number;
  deck: CardInstance[];
  relics: RelicInstance[];
  casebook: Partial<Record<DiseaseId, "confirmed">>;
  rarePity: number;
  shopRemovalCount: number;
  combatsThisAct: number;
  lastEncounter?: string;
  lastElite?: string;
  patient: { surname: string; age: number; sex: "M" | "F" };
  flags: Record<string, number>;
  stats: RunStats;
  restDone?: boolean;
  seenEvents: EventId[];
}

export type Phase = "map" | "combat" | "reward" | "shop" | "rest" | "event" | "boss_relic" | "gameover" | "victory";

export interface GameState {
  schemaVersion: 2;
  seed: string;
  rng: Record<RunRngStream, RngState>;
  phase: Phase;
  run: RunState;
  combat?: CombatState;
  reward?: RewardState;
  shop?: ShopState;
  event?: EventState;
  bossRelic?: RelicId[];
  pending?: PendingChoice;
  nextUid: number;
  actionCount: number;
}

// ───────────────────────── 행동·이벤트 ─────────────────────────

export type Action =
  | { type: "play_card"; cardUid: Uid; targetUid?: Uid }
  | { type: "end_turn" }
  | { type: "choose_cards"; uids: Uid[] }
  | { type: "move_map"; nodeId: string }
  | { type: "claim_reward"; item: number; choice?: number }
  | { type: "skip_reward"; item: number }
  | { type: "shop_buy"; slot: string }
  | { type: "shop_remove" }
  | { type: "rest_choose"; option: "rest" | "upgrade" | "purge" }
  | { type: "event_choose"; optionId: string }
  | { type: "pick_relic"; index: number }
  | { type: "leave" };

export type GameEvent =
  | { type: "action_rejected"; reason: string }
  | { type: "card_drawn"; uid: Uid; cardId: CardId }
  | { type: "card_played"; uid: Uid; cardId: CardId; targetUid?: Uid }
  | { type: "drug_administered"; cardId: CardId; refreshed: boolean }
  | { type: "drug_expired"; cardId: CardId }
  | { type: "interaction_fired"; ruleId: string; kind: InteractionRule["kind"]; text: string; blocked?: boolean }
  | { type: "side_effect_added"; cardId: CardId; dest: string }
  | { type: "damage"; target: "patient" | Uid; amount: number; absorbed: number; grade?: Grade | "generic"; hits?: number }
  | { type: "harmful_treatment"; target: Uid; healed: number }
  | { type: "ineffective"; target: Uid; reason: "immune" | "not_indicated" }
  | { type: "stability_gained"; target: "patient" | Uid; amount: number }
  | { type: "healed"; target: "patient" | Uid; amount: number }
  | { type: "vitality_lost"; amount: number }
  | { type: "status_applied"; target: "patient" | Uid; status: StatusId; stacks: number }
  | { type: "knowledge_up"; target: Uid; level: 1 | 2 }
  | { type: "diagnosed"; target: Uid; points: number }
  | { type: "countdown_started"; target: Uid; moveId: MoveId; turns: number }
  | { type: "countdown_fired"; target: Uid; moveId: MoveId }
  | { type: "phase_changed"; target: Uid; phase: number; name: string }
  | { type: "enemy_move"; target: Uid; moveId: MoveId; name: string }
  | { type: "enemy_cured"; target: Uid; diseaseId: DiseaseId }
  | { type: "patient_died" }
  | { type: "shuffle" }
  | { type: "turn_started"; turn: number }
  | { type: "combat_won" }
  | { type: "relic_triggered"; relicId: RelicId }
  | { type: "relic_gained"; relicId: RelicId }
  | { type: "card_gained"; cardId: CardId }
  | { type: "card_removed"; cardId: CardId }
  | { type: "card_upgraded"; cardId: CardId }
  | { type: "gold_changed"; amount: number }
  | { type: "exhausted"; uid: Uid; cardId: CardId }
  | { type: "resistance_up"; target: Uid; tag: Tag; stacks: number }
  | { type: "dur_blocked"; ruleId: string }
  | { type: "act_changed"; act: number }
  | { type: "reward_offered" };

export interface InteractionPreview {
  ruleId: string;
  kind: InteractionRule["kind"] | "contraindication";
  text: string;
  conditional?: boolean;
  blockedByDur?: boolean;
}

export interface DamagePreview {
  amount: number;
  known: boolean;
  grade?: Grade | "generic" | "not_indicated";
  harmful?: boolean;
}
