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
export type ChannelId = string;
export type FindingId = string;
export type PresentationId = string;

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
export type Keyword = "exhaust" | "ethereal" | "retain" | "unplayable" | "power";
/** deck: 처방 목록(행동 덱)에 들어간다. formulary: 처방집·시술 목록에 들어가고 오더 카드로 불러낸다. */
export type CardZone = "deck" | "formulary";

/** 감별 진단의 가설 신뢰도 (플레이어에게 보이는 말) */
export type HypothesisLevel = "excluded" | "unlikely" | "possible" | "suspected" | "strong";

/** 질병 의도의 임상적 압박 종류 */
export type PressureKind =
  | "hemodynamic"
  | "respiratory"
  | "airway"
  | "bleeding"
  | "neuro"
  | "metabolic"
  | "infection"
  | "cardiac"
  | "renal"
  | "pain"
  | "worsening"
  | "complication";

/** 의도 크기 등급 (확진 전에는 정확한 수치 대신 이것만 보인다). 경미 ≤6 · 중등 7–12 · 심각 ≥13 */
export type IntentBand = "mild" | "moderate" | "severe";

/**
 * 내원 양상의 경과 대본. 감별 대상이 둘 이상인 문제는 의도(압박 종류·크기)를 이 대본이 정하고,
 * 실제 질병은 그 칸에 맞는 자기 행동을 낸다. 그래서 보이는 의도의 순서가 숨은 정답과 무관하다.
 * 칸 이름은 "종류:등급" (합병증 예고는 "complication:mild@턴").
 */
export interface CourseScript {
  opening?: string[];
  weights: Record<string, number>;
  noRepeat?: string[];
  /** 조건은 플레이어도 아는 것만 (turnAtLeast, noCountdown) */
  rules?: { when: Condition; sig: string; once?: boolean }[];
}

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

/**
 * 조건. 표시가 붙은 것은 플레이어가 아는 정보만 쓴다(선택지 조건에 쓸 수 있다).
 * targetCategory·targetTrait는 실제 질병을 보므로 물리(상호작용 규칙, 질병 행동)에만 쓴다.
 */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { knowledgeAtLeast: { target: TargetSel; level: 0 | 1 | 2 } } // 플레이어 정보
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
  | { handHasCard: CardId }
  // ── 플레이어 정보 조건 ──
  | { hasWorkingDx: true }
  | { organismKnown: true }
  | { channelObserved: ChannelId }
  | { ordersAtLeast: number }
  | { activeDrugAny: true }
  | { pendingResults: true }
  | { handHasSideEffect: true }
  | { activeDrugBroad: true }
  | { suspect: { traits?: Trait[]; categories?: DiseaseCategory[]; tags?: Tag[]; level: HypothesisLevel } };

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

/** 선택지 하나 (카드·자문·시술 결정 공용) */
export interface OptionDef {
  id: string;
  label: string;
  /** 얻는 것 (짧게) */
  detail: string;
  /** 대가·위험 (짧게) */
  risk?: string;
  /** 추가 오더 (킥커) */
  cost?: number;
  /** 고를 수 있는 조건. 플레이어 정보 조건만 쓴다 */
  requires?: Condition;
  /** requires를 못 채웠을 때 보여 줄 이유 */
  requiresText?: string;
  /** 검사 선택지: 이 경로의 소견을 이미 얻었으면 고를 수 없고, 관련 가설을 힌트로 보인다 */
  channel?: ChannelId;
  /** 처방집 선택지: 화면에 카드를 함께 보인다 */
  cardId?: CardId;
  upgraded?: boolean;
  /** 위험 문구를 선택 시점의 정보로 계산한다 (시술: 현재 감별 신뢰도) */
  riskFrom?: "procedure";
  effects: EffectOp[];
}

export type Specimen = "blood" | "urine" | "sputum" | "wound";

export type EffectOp =
  | { op: "damage"; amount: ValueExpr; target?: TargetSel; tags?: Tag[]; hits?: number; mods?: { if: Condition; pct: number }[] }
  | { op: "lose_vitality"; amount: ValueExpr }
  | { op: "heal"; amount: ValueExpr; target?: TargetSel }
  | { op: "gain_stability"; amount: ValueExpr; target?: TargetSel }
  | { op: "gain_orders"; amount: ValueExpr }
  | { op: "draw"; amount: ValueExpr }
  /** 대기 처방에서 조건에 맞는 카드를 위에서부터 amount장 손으로 가져온다 */
  | { op: "draw_filtered"; filter: CardFilter; amount: number }
  | { op: "exhaust_cards"; from: Pile[]; filter: CardFilter; amount: number | "all" }
  | { op: "add_card"; cardId: CardId; count: number; dest: "hand" | "discard" | "draw_random"; costZeroThisTurn?: boolean; upgraded?: boolean }
  | { op: "apply_status"; status: StatusId; stacks: ValueExpr; target: TargetSel }
  | { op: "remove_status"; status: StatusId; target: TargetSel; stacks: number | "all" }
  | { op: "reveal_intent"; target: TargetSel }
  | { op: "modify_resistance"; tag: Tag | "all"; delta: number; target: TargetSel }
  | { op: "end_drug"; filter: DrugFilter }
  | { op: "extend_drug"; filter: DrugFilter; turns: number }
  | { op: "modify_current"; pct: number }
  | { op: "suppress_side_effects" }
  | { op: "extra_side_effects"; times: number }
  | { op: "cost_modifier"; filter: CardFilter; delta: number; uses: number; scope: "turn" | "combat" }
  | { op: "combat_flag"; flag: string; delta: number }
  | { op: "plan_bonus"; pct: number; target: TargetSel }
  | { op: "start_countdown"; move: MoveId; turns: number; target?: TargetSel }
  | { op: "cancel_countdowns"; target?: TargetSel }
  | { op: "enter_phase"; phase: number; target?: TargetSel }
  | { op: "raise_max_severity"; amount: number; target?: TargetSel }
  | { op: "gain_gold"; amount: number }
  | { op: "repeat"; times: number; effects: EffectOp[] }
  | { op: "if"; cond: Condition; then: EffectOp[]; else?: EffectOp[] }
  | { op: "delay"; turns: number; effects: EffectOp[]; label?: string; channel?: ChannelId }
  | { op: "select_cards"; from: Pile[]; filter?: CardFilter; min: number; max: number; then: EffectOp[]; prompt: string }
  | { op: "exhaust_selected" }
  | { op: "discard_selected" }
  | { op: "retain_selected" }
  | { op: "custom"; id: string; params?: Record<string, number | string> }
  // ── 임상 결정 ──
  /** 선택지 2–4개 중 picks개를 차례로 고른다. 선택지의 효과가 끝난 뒤 다음 선택을 연다 */
  | { op: "choose_option"; title?: string; prompt: string; options: OptionDef[]; picks?: number; optional?: boolean }
  /** 대상 문제의 한 경로를 검사해 소견을 얻는다 */
  | { op: "investigate"; channel: ChannelId; target?: TargetSel }
  /** 플레이어가 아는 감별 목록에서 가장 감별력 있는 경로를 골라 검사한다 */
  | { op: "investigate_best"; groups: ChannelGroup[]; count: number; target?: TargetSel }
  /** 검체를 받아 그람 염색을 바로 보고, 배양 결과는 delay턴 뒤에 나온다 */
  | { op: "culture"; specimen: Specimen; delay: number; target?: TargetSel }
  /** 대기 중인 검사 결과를 앞당긴다 */
  | { op: "advance_results"; turns: number; target?: TargetSel }
  /** 처방집(약물) 또는 시술 목록에서 관련 있는 선택지를 모아 고르게 한다 (플레이어 정보만 쓴다) */
  | { op: "discover"; pool: "drug" | "procedure"; count: number; target?: TargetSel; title?: string }
  /** 협진: 진료과 고르기 → 권고 고르기 */
  | { op: "consult"; count: number; target?: TargetSel }
  | { op: "consult_recommend"; specialty: string; count: number; target?: TargetSel }
  /** 시술 결정: 지금 하기 / 확인 후 하기 / 보류 */
  | { op: "procedure_decision"; target?: TargetSel }
  /** 시술 합병증 판정 (지금 시행, 플레이어가 아는 신뢰도 기준) */
  | { op: "procedure_risk"; target?: TargetSel }
  /** 처리 중인 카드를 손으로 돌려보낸다 (보류) */
  | { op: "return_to_hand" }
  /** 투여 중 약물 하나를 골라 중단한다 */
  | { op: "stop_drug_choice" }
  /** 범위 축소: 광범위 항생제 중단. 원인균을 알면 장내세균 교란 정리 */
  | { op: "deescalate" }
  /** 감수성에 맞춘 항생제: 배양으로 확인한 원인균에 가장 좁고 잘 듣는 항생제를 손에 (병원 처방집 전체에서) */
  | { op: "targeted_antibiotic"; target?: TargetSel }
  // ── 내부 명령 (콘텐츠에서 쓰지 않음) ──
  | { op: "administer"; cardUid: Uid }
  | { op: "emit_side_effects"; cardUid: Uid }
  | { op: "reset_current" }
  | { op: "card_played"; cardUid: Uid }
  | { op: "finish_card"; cardUid: Uid }
  | { op: "purge_self"; cardUid: Uid }
  | { op: "course_finding"; finding: FindingId }
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

// ── 근거(소견) 체계 ──

export type ChannelGroup = "vitals" | "history" | "exam" | "lab" | "bedside" | "imaging" | "micro" | "course";
export type GramClass = "gpc" | "gnr" | "none";

/** 검사 경로 하나 (병력의 한 갈래, 진찰 부위, 검사 항목) */
export interface ChannelDef {
  id: ChannelId;
  nameKo: string;
  group: ChannelGroup;
  /** 질병이 따로 정하지 않았을 때의 소견 (보통 정상) */
  normal: FindingId;
  /** 그람 염색 경로: 이 배양 경로의 소견에서 염색 결과를 끌어낸다 */
  gramOf?: ChannelId;
}

/**
 * 소견. weight: 0 정상 · 1 비특이 · 2 특징적 · 4 결정적.
 * 소견이 가설의 예상과 맞으면 +weight, 어긋나면 −(정상 소견이면 최대 2, 아니면 둘 중 큰 weight).
 * 누적 반대 근거가 4 이상이면 그 가설은 배제된다.
 */
export interface FindingDef {
  id: FindingId;
  text: string;
  weight: 0 | 1 | 2 | 4;
  organism?: OrganismId;
  gram?: GramClass;
}

/** 내원 양상: 주호소와 감별 대상 질병. 실제 질병은 가중치로 뽑고 숨긴다 */
export interface PresentationDef {
  id: PresentationId;
  complaint: string;
  vignette: string;
  candidates: { disease: DiseaseId; weight: number }[];
  /** 내원 즉시 보이는 경로 (기본: 활력 징후) */
  visible?: ChannelId[];
  /** 질병 부담 범위. 감별 대상마다 다르면 숫자로 정체가 드러나므로 내원 양상 단위로 정한다 */
  burden?: [number, number];
  /** 행동에 압박 종류가 없을 때 쓰는 기본값 (실제 질병 분류로 추정하지 않는다) */
  pressure?: PressureKind;
  /** 내원 즉시 보이는 활력 징후. 감별 대상 모두가 같은 모습으로 온다 (채점하지 않는다) */
  vitals?: FindingId;
  /** 감별 대상이 둘 이상이면 필수: 보이는 의도의 경과 대본 */
  course?: CourseScript;
  /** 감별 대상 조합의 의학적 근거 (소유자 검토용) */
  medical?: MedicalNote;
}

export interface RecommendationDef {
  id: string;
  label: string;
  detail: string;
  risk?: string;
  cost?: number;
  requires?: Condition;
  requiresText?: string;
  effects: EffectOp[];
}

/** 협진 진료과. 관련성은 감별 목록의 분류·특성으로만 정한다 */
export interface ConsultDef {
  id: string;
  nameKo: string;
  categories: DiseaseCategory[];
  traits?: Trait[];
  recommendations: RecommendationDef[];
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
  | "diagnosis_committed"
  | "finding_revealed"
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
  /** 기본 deck. 약물과 결정적 시술은 formulary(처방집·시술 목록) */
  zone?: CardZone;
  /** 시술: 쓰면 "지금 / 확인 후 / 보류" 결정을 연다. confirm은 확인에 쓰는 검사 경로 */
  procedure?: { confirm: ChannelId };
  drug?: DrugInfo;
  sideEffect?: SideEffectInfo;
  upgrade: Partial<Pick<CardDef, "cost" | "effects" | "keywords">> & { drug?: Partial<DrugInfo> };
  /** 업그레이드가 무엇을 바꾸는지 한 줄 (구조적 업그레이드 설명) */
  upgradeText?: string;
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
  pressure?: PressureKind;
  effects: EffectOp[];
  /** 이 행동이 일어난 뒤 관찰되는 경과 소견 (course 경로, 가중치 ≤2). 나빠지는 방식이 곧 근거가 된다 */
  course?: FindingId;
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
  findings?: Partial<Record<ChannelId, FindingId>>;
  moves?: MoveDef[];
  ai?: AiPattern;
  onEnter?: EffectOp[];
  /** 이 단계로 넘어갈 때 관찰되는 경과 소견 */
  course?: FindingId;
}

export interface VariantDef {
  id: string;
  weight: number;
  nameKo: string;
  organism?: OrganismId;
  effectivenessOverride?: Partial<Record<Tag, Grade>>;
  findings?: Partial<Record<ChannelId, FindingId>>;
  passives?: TriggerDef[];
}

/** 결정적 치료: 이 태그의 치료가 들으면 질병의 기전 자체가 바뀐다 */
export interface DefinitiveDef {
  tags: Tag[];
  text: string;
  effects: EffectOp[];
}

export type ArtRegion = "head" | "chest" | "abdomen" | "pelvis" | "leg" | "body";

export interface DiseaseDef {
  id: DiseaseId;
  nameKo: string;
  nameEn: string;
  /** 교과서 요약: 전형적인 양상 (가설 설명에 쓴다. 숨겨진 정보가 아니다) */
  textbook: { keyFeatures: string };
  category: DiseaseCategory;
  traits: Trait[];
  tier: "normal" | "elite" | "gate" | "boss";
  act: 1 | 2 | 3;
  severity: [number, number];
  /** 경로별 소견. 없는 경로는 그 경로의 정상 소견 */
  findings: Partial<Record<ChannelId, FindingId>>;
  /**
   * 비전형 소견 후보. 문제마다 일정 확률로 이 중 한 경로가 교과서와 다른 소견을 보인다.
   * 교과서 예상(채점 기준)에는 들어가지 않으므로 실제 질병에 반대 근거가 될 수 있다(최대 2, 배제되지는 않는다).
   */
  atypical?: Partial<Record<ChannelId, FindingId>>;
  organism?: OrganismId;
  effectiveness: Partial<Record<Tag, Grade>>;
  acquiredResistance?: { tags: Tag[]; gainPerHit: number; start?: Partial<Record<Tag, number>> };
  definitive?: DefinitiveDef[];
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
  /** 문제 목록. 문제마다 내원 양상 하나 */
  problems: { presentation: PresentationId; hpPct?: number; atkPct?: number }[];
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
  | { kind: "abxBonusOrganism"; value: number }
  | { kind: "extraDiagnosticPick" }
  | { kind: "extraReturn" }
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
  | { op: "gain_random_card"; rarity: Rarity; kind?: CardKind; zone?: CardZone }
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
  channels: ChannelDef[];
  findings: FindingDef[];
  presentations: PresentationDef[];
  consults: ConsultDef[];
  cards: CardDef[];
  diseases: DiseaseDef[];
  encounters: EncounterDef[];
  interactions: InteractionRule[];
  relics: RelicDef[];
  events: EventDef[];
  quiz: QuizQuestion[];
  starterDeck: CardId[];
  starterFormulary: CardId[];
  starterRelic: RelicId;
  categories: Record<DiseaseCategory, string>;
}

// ───────────────────────── 상태 ─────────────────────────

export interface CardInstance {
  uid: Uid;
  cardId: CardId;
  upgraded: boolean;
  temp?: boolean;               // 전투 한정 (부작용, 처방집에서 불러낸 카드)
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
  /** 경과 대본이 고른 칸 ("종류:등급"). 화면의 의도는 이것만 쓴다 */
  sig?: string;
}

/** 얻은 소견 하나. rx: 경로는 치료 반응 */
export interface Observation {
  channel: ChannelId;
  finding: FindingId;
  turn: number;
  /** 치료 반응 관찰이면 그 치료의 태그·카드 (교과서 예상 반응을 계산하는 데 쓴다) */
  cardId?: CardId;
  tags?: Tag[];
  /** 채점하지 않는 관찰 (내원 양상 공통 활력 징후) */
  neutral?: boolean;
}

export interface EnemyState {
  uid: Uid;
  /** 실제 질병 (엔진 진실). UI는 읽지 않는다 */
  diseaseId: DiseaseId;
  variantId?: string;
  presentationId: PresentationId;
  /** 감별 목록 (내원 양상의 후보 순서 그대로) */
  hypotheses: DiseaseId[];
  observations: Observation[];
  workingDx?: DiseaseId;
  workingDxTurn?: number;
  /** 텔레메트리: 이 문제에서 작업 진단을 처음 정했는가, 그 뒤 몇 번 바뀌었는가 (배제 후 다시 정함·확진으로 바뀜 포함) */
  dxCommitted?: boolean;
  dxChanges?: number;
  /** 배양으로 원인균이 확인되었는가 */
  organismKnown: boolean;
  /** 엔진 진실: 이 환자에게서 비전형으로 나타나는 소견 하나 */
  atypical?: { channel: ChannelId; finding: FindingId };
  /** 엔진 진실: 두 번째(약한, 가중치 ≤1) 비전형 소견 */
  atypical2?: { channel: ChannelId; finding: FindingId };
  severity: number;
  maxSeverity: number;
  stability: number;
  statuses: StatusStack[];
  /** 0 미분화 · 1 좁혀짐 · 2 확진 (감별 목록에서 계산) */
  knowledge: 0 | 1 | 2;
  acquiredResistance: Record<Tag, number>;
  resistanceFraction: number;
  phase: number;
  ai: { history: MoveId[]; planned: PlannedMove[]; planIndex: number; usedOnce: MoveId[]; /** 실행된 의도 칸 (대본용) */ sigs?: string[] };
  countdowns: { moveId: MoveId; turnsLeft: number }[];
  revealNext: boolean;
  planBonus: number;
  definitiveUsed: string[];
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
  label?: string;
  channel?: ChannelId;
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
  /** 지금 처리 중인 카드에서 고른 선택지 이름 (중첩 결정 표시용) */
  choiceTrail: string[];
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

/** 보상 칸: 일반(어디서나 쓸모) · 상황(이번 막의 환자) · 전문(빌드를 정하는 카드) */
export type RewardSlot = "general" | "context" | "special";
export interface RewardCardOption {
  cardId: CardId;
  slot: RewardSlot;
}

export type RewardItem =
  | { kind: "gold"; amount: number; taken: boolean }
  | { kind: "card"; options: RewardCardOption[]; taken: boolean }
  | { kind: "relic"; relicId: RelicId; taken: boolean };

/** 전투가 끝난 뒤에야 보여 주는 퇴원 요약 (진실 공개) */
export interface CaseSummary {
  complaint: string;
  diseaseId: DiseaseId;
  variantName?: string;
  workingDx?: DiseaseId;
  confirmed: boolean;
  findings: number;
}

export interface RewardState {
  source: "normal" | "elite" | "gate" | "boss" | "treasure";
  items: RewardItem[];
  summary?: CaseSummary[];
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

/** 대기 중인 결정의 선택지 (고를 수 있는지와 그 이유까지 계산해 둔다) */
export interface PendingOption {
  id: string;
  label: string;
  detail: string;
  risk?: string;
  cost: number;
  available: boolean;
  reason?: string;
  /** 플레이어가 아는 정보로 만든 짧은 힌트 (예: 이 검사로 구별되는 가설) */
  hint?: string;
  channel?: ChannelId;
  cardId?: CardId;
  upgraded?: boolean;
  effects: EffectOp[];
}

export type PendingChoice =
  | { kind: "select_cards"; candidates: Uid[]; min: number; max: number; prompt: string; then: EffectOp[]; ctx: EffectCtx }
  | { kind: "deck_select"; purpose: "upgrade" | "remove" | "purge" | "shop_remove"; candidates: Uid[]; min: number; max: number; prompt: string }
  | {
      kind: "choose_option";
      title: string;
      prompt: string;
      options: PendingOption[];
      /** 이 선택 뒤에 남은 선택 수 (0이면 마지막) */
      picksAfter: number;
      canSkip: boolean;
      source?: CardId;
      /** 이번 카드에서 이미 고른 것들 (중첩 결정의 경로 표시) */
      trail: string[];
      ctx: EffectCtx;
      /** 이어지는 선택에 다시 쓸 원본 선택지 */
      defs: OptionDef[];
    };

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
  // ── 결정 기록 (텔레메트리) ──
  modalDecisions: number;
  optionPicks: Record<string, number>;
  findingsRevealed: number;
  /** 첫 작업 진단 수와 그중 맞은 수 (퇴원 후에만 보여 준다) */
  commits: number;
  commitsCorrect: number;
  revisions: number;
  commitTurnSum: number;
  /** 문제마다 처음 작업 진단이 생긴 때(플레이어가 정했거나 확진으로 자동): 수·맞은 수·턴 합 */
  firstDx?: number;
  firstDxCorrect?: number;
  firstDxTurnSum?: number;
  /** 작업 진단이 한 번이라도 바뀐 문제 수 (플레이어 변경, 배제 뒤 다시 정함, 확진으로 교체) */
  problemsRevised: number;
  /** 전투가 끝났을 때 작업 진단이 있던 문제 수와 그중 맞은 수 */
  finalDx: number;
  finalDxCorrect: number;
  abxEmpiric: number;
  abxTargeted: number;
  deescalations: number;
  returns: number;
  noResponse: number;
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
  /** 처방집·시술 목록. 투약 오더·시술 의뢰로 불러낸다 */
  formulary: CardInstance[];
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
  schemaVersion: 3;
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
  | { type: "choose_option"; optionId: string }
  | { type: "commit_diagnosis"; targetUid: Uid; diseaseId: DiseaseId }
  | { type: "return_card"; cardUid: Uid }
  | { type: "move_map"; nodeId: string }
  | { type: "claim_reward"; item: number; choice?: number }
  | { type: "skip_reward"; item: number }
  | { type: "shop_buy"; slot: string }
  | { type: "shop_remove" }
  | { type: "rest_choose"; option: "rest" | "upgrade" | "purge" }
  | { type: "event_choose"; optionId: string }
  | { type: "pick_relic"; index: number }
  | { type: "leave" };

export interface DifferentialDelta {
  diseaseId: DiseaseId;
  delta: number;
  before: HypothesisLevel;
  after: HypothesisLevel;
}

export type GameEvent =
  | { type: "action_rejected"; reason: string }
  | { type: "card_drawn"; uid: Uid; cardId: CardId }
  | { type: "card_played"; uid: Uid; cardId: CardId; targetUid?: Uid }
  | { type: "drug_administered"; cardId: CardId; refreshed: boolean; empiric?: boolean }
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
  | { type: "finding_revealed"; target: Uid; channel: ChannelId; findingId: FindingId; text: string; changes: DifferentialDelta[] }
  | { type: "result_pending"; target: Uid; label: string; turns: number }
  | { type: "diagnosis_committed"; target: Uid; diseaseId: DiseaseId; revised: boolean }
  | { type: "diagnosis_confirmed"; target: Uid; diseaseId: DiseaseId }
  | { type: "organism_identified"; target: Uid; organism: OrganismId }
  | { type: "treatment_response"; target: Uid; cardId: CardId; response: ResponseClass }
  | { type: "option_chosen"; source?: CardId; optionId: string; label: string }
  | { type: "card_returned"; uid: Uid; cardId: CardId }
  | { type: "definitive"; target: Uid; text: string }
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
  | { type: "card_gained"; cardId: CardId; zone?: CardZone }
  | { type: "card_removed"; cardId: CardId }
  | { type: "card_upgraded"; cardId: CardId }
  | { type: "gold_changed"; amount: number }
  | { type: "exhausted"; uid: Uid; cardId: CardId }
  | { type: "resistance_up"; target: Uid; tag: Tag; stacks: number }
  | { type: "dur_blocked"; ruleId: string }
  | { type: "act_changed"; act: number }
  | { type: "reward_offered" };

/** 치료 반응의 분류: 좋음(특효·우수) · 부분(보통·저하) · 없음(무효·적응증 아님) · 악화(금기) */
export type ResponseClass = "good" | "partial" | "none" | "worse";

export interface InteractionPreview {
  ruleId: string;
  kind: InteractionRule["kind"] | "contraindication";
  text: string;
  conditional?: boolean;
  blockedByDur?: boolean;
}

export interface HypothesisPreview {
  diseaseId: DiseaseId;
  nameKo: string;
  level: HypothesisLevel;
  grade: Grade | "generic" | "not_indicated" | "varies";
  amount?: number;
}

export interface DamagePreview {
  amount: number;
  known: boolean;
  grade?: Grade | "generic" | "not_indicated";
  harmful?: boolean;
  /** 감별 목록의 가설마다 교과서상 예상 반응 (확진 전) */
  byHypothesis?: HypothesisPreview[];
}
