// 근거와 감별 진단. 소견은 실제 질병에서 나오고, 가설의 신뢰도는 "관찰한 소견 × 교과서 예상"으로만 계산한다.
// 이 파일의 판정 함수(scoreDifferential, channelValue, channelHint …)는 엔진 진실(적의 diseaseId·변이)을 읽지 않는다.
// 진실을 읽는 것은 actualFinding 하나뿐이며, 그 결과는 곧바로 플레이어에게 공개되는 소견이다.
import { cardDef, channelDef, db, diseaseDef, findingDef, hasFinding, organismDef, presentationDef } from "./registry";
import { allMoves, phaseDef, variantDef } from "./disease";
import { recordCulture } from "./micro";
import { textbook } from "./textbook";
import { fire } from "./triggers";
import { emit, log } from "./util";
import type {
  ChannelGroup,
  ChannelId,
  DifferentialDelta,
  DiseaseDef,
  DiseaseId,
  EnemyState,
  FindingId,
  GameState,
  HypothesisLevel,
  Observation,
  ResponseClass,
  Tag,
} from "./types";

export const RESPONSE_FINDING: Record<ResponseClass, FindingId> = {
  good: "rx_good",
  partial: "rx_partial",
  none: "rx_none",
  worse: "rx_worse",
};

/** 반대 근거가 이만큼 쌓이면 배제 (v2.1: 4 → 5. 가중치를 2로 묶은 뒤, 반대 소견 둘로 셋 중 둘이 한 턴에 배제되었다) */
export const EXCLUDE_AT = 5;

export const LEVEL_RANK: Record<HypothesisLevel, number> = { excluded: 0, unlikely: 1, possible: 2, suspected: 3, strong: 4 };
export const LEVEL_LABEL: Record<HypothesisLevel, string> = {
  excluded: "배제",
  unlikely: "가능성 낮음",
  possible: "가능",
  suspected: "의심",
  strong: "강력 의심",
};
/** 발견 선택지·봇이 쓰는 가설 가중치 */
export const LEVEL_WEIGHT: Record<HypothesisLevel, number> = { excluded: 0, unlikely: 1, possible: 2, suspected: 3, strong: 5 };

export function isResponseChannel(ch: ChannelId): boolean {
  return ch.startsWith("rx:");
}

export function responseChannelFor(cardId: string | undefined, tags: Tag[]): ChannelId {
  return cardId ? `rx:${cardId}` : `rx:tag:${tags.join(",")}`;
}

// ───────────────────────── 교과서 소견 ─────────────────────────

function gramFinding(g: string | undefined): FindingId {
  return `gs_${g ?? "none"}`;
}

/** 질병 정의에서 (변이·단계를 정해) 한 경로의 소견을 찾는다 */
function findingFromDef(def: DiseaseDef, channel: ChannelId, variantId: string | undefined, phase: number): FindingId {
  const ch = channelDef(channel);
  if (ch.gramOf) {
    const cx = findingFromDef(def, ch.gramOf, variantId, phase);
    return gramFinding(findingDef(cx).gram);
  }
  const ph = phase > 0 ? def.phases?.[phase - 1] : undefined;
  const v = variantId ? def.variants?.find((x) => x.id === variantId) : undefined;
  return ph?.findings?.[channel] ?? v?.findings?.[channel] ?? def.findings[channel] ?? ch.normal;
}

const expectedCache = new WeakMap<object, Map<string, FindingId[]>>();

/** 가설 H가 이 경로에서 보일 수 있는 소견 (모든 변이·단계의 합집합). 교과서 지식이다 */
export function expectedFindings(diseaseId: DiseaseId, channel: ChannelId): FindingId[] {
  const d = db();
  let m = expectedCache.get(d);
  if (!m) {
    m = new Map();
    expectedCache.set(d, m);
  }
  const key = `${diseaseId}|${channel}`;
  const hit = m.get(key);
  if (hit) return hit;
  const def = diseaseDef(diseaseId);
  const out = new Set<FindingId>();
  if (channel === COURSE_CHANNEL) {
    // 경과 소견: 이 질병의 행동·단계가 남길 수 있는 소견 전부 + "특별한 경과 없음"
    out.add(channelDef(channel).normal);
    for (const mv of allMoves(def)) if (mv.course) out.add(mv.course);
    for (const ph of def.phases ?? []) if (ph.course) out.add(ph.course);
    const arr = [...out];
    m.set(key, arr);
    return arr;
  }
  const variants = def.variants?.length ? def.variants.map((v) => v.id) : [undefined];
  const phases = [0, ...(def.phases ?? []).map((_, i) => i + 1)];
  for (const v of variants) for (const ph of phases) out.add(findingFromDef(def, channel, v, ph));
  const arr = [...out];
  m.set(key, arr);
  return arr;
}

/** 치료 반응 관찰에 대한 가설의 예상 */
function expectedResponse(diseaseId: DiseaseId, obs: Observation): FindingId[] {
  const card = obs.cardId ? cardDef(obs.cardId) : undefined;
  const tb = textbook(diseaseId, obs.tags ?? card?.tags ?? [], card?.drug?.spectrum, true);
  if (tb.classes.length === 0) return [RESPONSE_FINDING.none];
  return tb.classes.map((c) => RESPONSE_FINDING[c]);
}

function expectedFor(diseaseId: DiseaseId, obs: Observation): FindingId[] {
  return isResponseChannel(obs.channel) ? expectedResponse(diseaseId, obs) : expectedFindings(diseaseId, obs.channel);
}

/** 경과 경로: 질병이 나빠지는 방식에서 얻는 소견 */
export const COURSE_CHANNEL = "course";

/** 엔진 진실: 실제 질병(현재 변이·단계)의 소견. 이 값은 관찰되는 즉시 공개된다 */
export function actualFinding(enemy: EnemyState, channel: ChannelId): FindingId {
  // 감별 대상이 여럿인 내원 양상은 모두 같은 활력 징후로 온다
  if (channel === "vitals") {
    const pv = presentationDef(enemy.presentationId).vitals;
    if (pv) return pv;
  }
  if (enemy.atypical?.channel === channel) return enemy.atypical.finding;
  if (enemy.atypical2?.channel === channel) return enemy.atypical2.finding;
  return findingFromDef(diseaseDef(enemy.diseaseId), channel, variantDef(enemy)?.id, phaseDef(enemy) ? enemy.phase : 0);
}

function weightOf(f: FindingId): number {
  return hasFinding(f) ? findingDef(f).weight : 1;
}

/**
 * 예상 집합과 관찰 소견의 비교. 맞으면 +weight.
 * 어긋나면 반대 근거: 이상 소견이면 그 소견의 weight, 정상 소견이면 1(기대한 소견이 없다는 것은 약한 근거다).
 * v2.1: v2.0은 max(기대, 관찰)이라 비특이 소견 하나도 2를 깎았고, 정상 소견도 2를 깎아 감별 대상 셋 중 둘이 검사 두 번에 배제되었다.
 */
export function compareFinding(expected: FindingId[], observed: FindingId): { gain: number; penalty: number } {
  if (expected.includes(observed)) return { gain: weightOf(observed), penalty: 0 };
  const wo = weightOf(observed);
  if (wo > 0) return { gain: 0, penalty: wo };
  // 정상 소견: 기대한 특징 소견이 없다 (기대 집합이 모두 정상이면 여기 오지 않는다)
  return { gain: 0, penalty: expected.some((e) => weightOf(e) > 0) ? 1 : 0 };
}

// ───────────────────────── 감별 목록 ─────────────────────────

export interface HypothesisScore {
  diseaseId: DiseaseId;
  support: number;
  against: number;
  score: number;
  ruledOut: boolean;
  level: HypothesisLevel;
  /** 이 가설을 지지한 관찰 번호 / 반대한 관찰 번호 */
  forObs: number[];
  againstObs: number[];
}

/** 플레이어 정보만으로 감별 목록의 신뢰도를 계산한다 */
export function scoreDifferential(enemy: Pick<EnemyState, "hypotheses" | "observations">): HypothesisScore[] {
  const rows: HypothesisScore[] = enemy.hypotheses.map((h) => {
    let support = 0;
    let against = 0;
    const forObs: number[] = [];
    const againstObs: number[] = [];
    enemy.observations.forEach((o, i) => {
      if (o.neutral) return;
      const r = compareFinding(expectedFor(h, o), o.finding);
      if (r.gain > 0) {
        support += r.gain;
        forObs.push(i);
      }
      if (r.penalty > 0) {
        against += r.penalty;
        againstObs.push(i);
      }
    });
    return { diseaseId: h, support, against, score: support - against, ruledOut: against >= EXCLUDE_AT, level: "possible" as HypothesisLevel, forObs, againstObs };
  });
  const live = rows.filter((r) => !r.ruledOut);
  for (const r of rows) {
    if (r.ruledOut) {
      r.level = "excluded";
      continue;
    }
    const others = live.filter((x) => x !== r);
    const lead = others.length ? r.score - Math.max(...others.map((x) => x.score)) : Infinity;
    if (others.length === 0) r.level = "strong";
    else if (r.score <= -2) r.level = "unlikely";
    else if (r.score >= 5 && lead >= 3) r.level = "strong";
    else if (r.score >= 2) r.level = "suspected";
    else r.level = "possible";
  }
  return rows;
}

/** 0 미분화 · 1 좁혀짐(의심 이상인 가설) · 2 확진(하나만 남고 지지 근거 2 이상) */
export function knowledgeFromScores(rows: HypothesisScore[]): { knowledge: 0 | 1 | 2; confirmed?: DiseaseId } {
  const live = rows.filter((r) => !r.ruledOut);
  if (live.length === 1 && live[0]!.score >= 2) return { knowledge: 2, confirmed: live[0]!.diseaseId };
  if (live.some((r) => LEVEL_RANK[r.level] >= LEVEL_RANK.suspected)) return { knowledge: 1 };
  return { knowledge: 0 };
}

export function levelOf(enemy: EnemyState, diseaseId: DiseaseId): HypothesisLevel {
  return scoreDifferential(enemy).find((r) => r.diseaseId === diseaseId)?.level ?? "excluded";
}

/** 감별 목록에서 배제되지 않은 가설과 가중치 */
export function liveHypotheses(enemy: EnemyState): { diseaseId: DiseaseId; level: HypothesisLevel; weight: number }[] {
  return scoreDifferential(enemy)
    .filter((r) => !r.ruledOut)
    .map((r) => ({ diseaseId: r.diseaseId, level: r.level, weight: LEVEL_WEIGHT[r.level] + (enemy.workingDx === r.diseaseId ? 3 : 0) }));
}

export function isObserved(enemy: EnemyState, channel: ChannelId): boolean {
  return enemy.observations.some((o) => o.channel === channel);
}

// ───────────────────────── 관찰 ─────────────────────────

function diffDeltas(before: HypothesisScore[], after: HypothesisScore[]): DifferentialDelta[] {
  const out: DifferentialDelta[] = [];
  for (const a of after) {
    const b = before.find((x) => x.diseaseId === a.diseaseId)!;
    const delta = a.score - b.score;
    if (delta !== 0 || a.level !== b.level) out.push({ diseaseId: a.diseaseId, delta, before: b.level, after: a.level });
  }
  return out;
}

/** 감별 목록이 바뀐 뒤: 지식 단계, 확진, 배제된 작업 진단 처리 */
export function refreshKnowledge(state: GameState, enemy: EnemyState, silent = false): void {
  const rows = scoreDifferential(enemy);
  const k = knowledgeFromScores(rows);
  const c = state.combat;
  const before = enemy.knowledge;
  if (enemy.workingDx && rows.find((r) => r.diseaseId === enemy.workingDx)?.ruledOut) {
    if (c && !silent) log(c, "warn", `작업 진단 ${diseaseDef(enemy.workingDx).nameKo}이(가) 소견과 맞지 않아 배제되었다`);
    enemy.workingDx = undefined;
    enemy.workingDxTurn = undefined;
  }
  if (k.knowledge !== before) {
    enemy.knowledge = k.knowledge;
    if (k.knowledge > before && !silent) emit({ type: "knowledge_up", target: enemy.uid, level: k.knowledge as 1 | 2 });
  }
  if (k.knowledge === 2 && before < 2 && k.confirmed) {
    state.run.casebook[k.confirmed] = "confirmed";
    state.run.stats.diagnosesConfirmed += 1;
    if (enemy.workingDx !== k.confirmed) {
      // 이미 정했던 작업 진단이 확진으로 바뀌면(배제되었거나 다른 진단이었으면) 변경으로 센다
      if (enemy.dxCommitted) {
        enemy.dxChanges = (enemy.dxChanges ?? 0) + 1;
        if (enemy.dxChanges === 1) state.run.stats.problemsRevised += 1;
      } else if (!silent) {
        // 텔레메트리: 확진으로 처음 작업 진단이 생겼다
        enemy.dxCommitted = true;
        if (enemy.hypotheses.length > 1) {
          const st = state.run.stats;
          st.firstDx = (st.firstDx ?? 0) + 1;
          st.firstDxTurnSum = (st.firstDxTurnSum ?? 0) + (c?.turn ?? 0);
          if (k.confirmed === enemy.diseaseId) st.firstDxCorrect = (st.firstDxCorrect ?? 0) + 1;
        }
      }
      enemy.workingDx = k.confirmed;
      enemy.workingDxTurn = c?.turn;
    }
    if (!silent) {
      emit({ type: "diagnosis_confirmed", target: enemy.uid, diseaseId: k.confirmed });
      if (c) log(c, "diag", `확진: ${diseaseDef(k.confirmed).nameKo} — 다른 가설이 모두 배제되었다`);
      fire(state, "knowledge_up", { targetUid: enemy.uid });
    }
  }
}

function recordObservation(state: GameState, enemy: EnemyState, obs: Observation, text: string, silent: boolean): DifferentialDelta[] {
  const before = scoreDifferential(enemy);
  enemy.observations.push(obs);
  const after = scoreDifferential(enemy);
  const changes = diffDeltas(before, after);
  const f = hasFinding(obs.finding) ? findingDef(obs.finding) : undefined;
  if (f?.organism && f.organism !== "virus") {
    if (!enemy.organismKnown) {
      enemy.organismKnown = true;
      if (!silent) emit({ type: "organism_identified", target: enemy.uid, organism: f.organism });
      if (state.combat && !silent) log(state.combat, "diag", `원인균 확인: ${organismDef(f.organism)?.nameKo ?? f.organism}`);
    }
  }
  if (!silent) {
    state.run.stats.findingsRevealed += 1;
    emit({ type: "finding_revealed", target: enemy.uid, channel: obs.channel, findingId: obs.finding, text, changes });
    fire(state, "finding_revealed", { targetUid: enemy.uid });
  }
  refreshKnowledge(state, enemy, silent);
  return changes;
}

function changeText(changes: DifferentialDelta[]): string {
  const parts = changes
    .filter((d) => d.before !== d.after)
    .map((d) => `${diseaseDef(d.diseaseId).nameKo} ${d.delta > 0 ? "↑" : "↓"}${d.after === "excluded" ? "(배제)" : ""}`);
  return parts.length ? ` → ${parts.join(", ")}` : "";
}

/** 한 경로를 검사한다. 이미 본 경로면 false */
export function observe(state: GameState, enemy: EnemyState, channel: ChannelId, silent = false): boolean {
  if (enemy.cured || isObserved(enemy, channel)) {
    if (state.combat && !silent && !enemy.cured) log(state.combat, "info", `${channelDef(channel).nameKo}: 이미 확인한 소견`);
    return false;
  }
  const finding = actualFinding(enemy, channel);
  const text = findingDef(finding).text;
  const obs: Observation = { channel, finding, turn: state.combat?.turn ?? 0 };
  if (channel === "vitals" && presentationDef(enemy.presentationId).vitals) obs.neutral = true;
  const changes = recordObservation(state, enemy, obs, text, silent);
  if (state.combat && !silent) log(state.combat, "diag", `${channelDef(channel).nameKo}: ${text}${changeText(changes)}`);
  if (!silent) recordCulture(state, enemy, channel, finding);
  return true;
}

/** 경과 소견: 질병의 행동이 일어난 뒤 드러난 것. 같은 소견은 한 번만 기록한다 */
export function observeCourse(state: GameState, enemy: EnemyState, finding: FindingId): void {
  if (enemy.cured) return;
  if (enemy.observations.some((o) => o.channel === COURSE_CHANNEL && o.finding === finding)) return;
  const text = findingDef(finding).text;
  const changes = recordObservation(state, enemy, { channel: COURSE_CHANNEL, finding, turn: state.combat?.turn ?? 0 }, text, false);
  if (state.combat) log(state.combat, "diag", `경과 관찰: ${text}${changeText(changes)}`);
}

const RESPONSE_TEXT: Record<ResponseClass, string> = {
  good: "뚜렷한 호전",
  partial: "부분적인 반응",
  none: "기대한 반응 없음",
  worse: "오히려 악화",
};

/** 치료 반응을 소견으로 기록한다. 같은 치료의 반응은 처음 한 번만 */
export function observeResponse(state: GameState, enemy: EnemyState, cardId: string | undefined, tags: Tag[], response: ResponseClass, name: string): void {
  if (enemy.cured) return;
  const channel = responseChannelFor(cardId, tags);
  if (isObserved(enemy, channel)) return;
  const obs: Observation = { channel, finding: RESPONSE_FINDING[response], turn: state.combat?.turn ?? 0 };
  if (cardId) obs.cardId = cardId;
  else obs.tags = tags;
  const text = `${name}: ${RESPONSE_TEXT[response]}`;
  emit({ type: "treatment_response", target: enemy.uid, cardId: cardId ?? tags.join(","), response });
  const wd = enemy.workingDx;
  const changes = recordObservation(state, enemy, obs, text, false);
  const c = state.combat;
  if (!c) return;
  if (response === "none" || response === "worse") {
    state.run.stats.noResponse += 1;
    let hint = "";
    if (wd) {
      const exp = expectedFor(wd, obs);
      if (!exp.includes(obs.finding)) hint = ` — 작업 진단 ${diseaseDef(wd).nameKo}이라면 들었어야 한다. 진단을 재고하라`;
      else if (response === "none") hint = " — 이 치료는 이 기전을 다루지 못한다";
    } else if (response === "none") hint = " — 이 치료가 겨냥하는 기전이 아닐 수 있다";
    log(c, "warn", `${text}${hint}${changeText(changes)}`);
  } else log(c, "diag", `${text}${changeText(changes)}`);
}

// ───────────────────────── 감별력 (플레이어 정보) ─────────────────────────

/** 이 경로를 검사하면 감별 목록이 얼마나 갈라지는가 (지니 불순도, 0이면 쓸모없음) */
export function channelValue(enemy: EnemyState, channel: ChannelId): number {
  if (isObserved(enemy, channel)) return 0;
  const live = liveHypotheses(enemy);
  if (live.length <= 1) return 0;
  const groups = new Map<string, number>();
  let total = 0;
  let maxW = 0;
  for (const h of live) {
    const exp = expectedFindings(h.diseaseId, channel);
    const key = [...exp].sort().join("|");
    groups.set(key, (groups.get(key) ?? 0) + h.weight);
    total += h.weight;
    for (const f of exp) maxW = Math.max(maxW, weightOf(f));
  }
  if (groups.size <= 1 || total === 0) return 0;
  let sq = 0;
  for (const w of groups.values()) sq += (w / total) ** 2;
  return 1 - sq + (maxW / 4) * 0.1;
}

/** 감별력이 높은 경로 n개 (같으면 콘텐츠 순서). 쓸모 있는 경로가 없으면 빈 배열 */
export function bestChannels(enemy: EnemyState, groups: ChannelGroup[], count: number): ChannelId[] {
  const chans = db().channels.filter((c) => groups.includes(c.group) && !c.gramOf && !isObserved(enemy, c.id));
  const scored = chans.map((c, i) => ({ id: c.id, v: channelValue(enemy, c.id), i })).filter((x) => x.v > 0);
  scored.sort((a, b) => b.v - a.v || a.i - b.i);
  return scored.slice(0, count).map((x) => x.id);
}

/** 검사 선택지 힌트: 이 경로에서 이상 소견을 보일 가설 (교과서 지식) */
export function channelHint(enemy: EnemyState, channel: ChannelId): string {
  const live = liveHypotheses(enemy);
  if (live.length === 0) return "";
  const ch = channelDef(channel);
  const names: string[] = [];
  for (const h of live) {
    const exp = expectedFindings(h.diseaseId, channel);
    if (exp.some((f) => f !== ch.normal && weightOf(f) > 0)) names.push(diseaseDef(h.diseaseId).nameKo);
  }
  if (names.length === 0) return "감별 중인 가설 모두 정상 소견이 예상된다";
  if (names.length === live.length && channelValue(enemy, channel) === 0) return `${names.join("·")} 모두 같은 소견이 예상된다`;
  return `특징 소견이 예상되는 가설: ${names.join("·")}`;
}

/** 대기 중인 검사 결과가 있는 경로 */
export function pendingChannels(state: GameState, enemyUid: string): ChannelId[] {
  const c = state.combat;
  if (!c) return [];
  return c.delayed.filter((d) => d.channel && d.ctx.targetUid === enemyUid).map((d) => d.channel!);
}

export { observe as investigate };
