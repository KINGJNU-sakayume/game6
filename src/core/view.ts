// 화면용 정보. UI는 원본 적 상태 대신 EnemyView를 쓴다 (design.md §3.3).
// 이 파일은 "엔진 진실"과 "플레이어가 아는 정보"의 경계다. 확진 전에는 실제 질병·변이·원인균을 내보내지 않는다.
import { cardDef, categoryName, channelDef, db, diseaseDef, findingDef, organismDef, presentationDef, statusDef, tagDef } from "./registry";
import { currentOrganism, findMove, phaseDef, variantDef } from "./disease";
import { calcPlayerDamage, resistanceStacksFor } from "./damage";
import { GRADE_PCT, isTreatmentCard, organismsOf, textbook, textbookSummary } from "./textbook";
import { LEVEL_LABEL, expectedFindings, isResponseChannel, liveHypotheses, pendingChannels, scoreDifferential } from "./evidence";
import { BAND_LABEL, BAND_RANGE, PRESSURE_LABEL, bandOf, intentParts, moveSignature, displaySig, sigBand, sigKind, visibleEstimate } from "./enemy-ai";
import { costOf } from "./cards";
import { canPlay, commitCheck, returnCheck } from "./combat";
import { combinePct, findEnemy, statusStacks } from "./util";
import { PRESSURE_CAP_PCT, PRESSURE_PCT } from "./micro";
import type {
  ArtRegion,
  DamagePreview,
  EffectCtx,
  EffectOp,
  EnemyState,
  GameState,
  Grade,
  GramClass,
  HypothesisLevel,
  HypothesisPreview,
  IntentBand,
  IntentPart,
  OrganismId,
  PressureKind,
  ResponseClass,
  Tag,
  Uid,
} from "./types";

export interface IntentView {
  pressure: PressureKind;
  pressureLabel: string;
  /** 크기 등급 (경미·중등·심각). 확진 전에는 이것만 보인다 */
  band: IntentBand;
  bandLabel: string;
  /** 등급의 활력 손실 범위 문구 ("7–12") */
  bandRange: string;
  /** 예상 활력 손실. 확진 전에는 등급 대표값에 보이는 보정만 더한 값, 확진 뒤에는 실제 계산 */
  estimate: number;
  /** 확진 뒤에만: 행동 이름과 정확한 내용 */
  moveName?: string;
  parts?: IntentPart[];
  total?: number;
}

export interface FindingView {
  index: number;
  channel: string;
  channelName: string;
  group: string;
  text: string;
  weight: number;
  turn: number;
  response?: ResponseClass;
  /** 가설마다 이 소견이 지지(+1)·반대(−1)·무관(0)인지 */
  effects: { diseaseId: string; nameKo: string; sign: 1 | -1 | 0 }[];
}

export interface HypothesisView {
  diseaseId: string;
  nameKo: string;
  nameEn: string;
  category: string;
  level: HypothesisLevel;
  levelLabel: string;
  score: number;
  support: number;
  against: number;
  isWorkingDx: boolean;
  keyFeatures: string;
  firstLine: string[];
  avoid: string[];
  /** 증례집에 있으면 경로별 예상 소견을 보여 준다 */
  casebook: boolean;
  expected?: { channelName: string; text: string }[];
  forFindings: string[];
  againstFindings: string[];
  /** 작업 진단으로 정하는 비용. 정할 수 없으면 null과 이유 */
  commitCost: number | null;
  commitReason?: string;
}

export interface AbxCell {
  cardId: string;
  short: string;
  grade: Grade | "?";
}

export interface OrganismView {
  /** 감별 목록에 원인균이 있는 가설이 있는가 */
  relevant: boolean;
  known?: string;
  gram?: string;
  candidates: string[];
  antibiogram?: AbxCell[];
  /** 환자 차트(앞선 배양)에 있는 균 중 이번 원인균 후보에 드는 것 */
  chart?: string[];
}

export interface EnemyView {
  uid: Uid;
  index: number;
  tier: "normal" | "elite" | "gate" | "boss";
  knowledge: 0 | 1 | 2;
  title: string;
  complaint: string;
  vignette: string;
  confirmedName?: string;
  nameEn?: string;
  variantName?: string;
  phaseName?: string;
  passives?: string[];
  category?: string;
  severity: number;
  maxSeverity: number;
  stability: number;
  statuses: { id: string; nameKo: string; stacks: number; description: string; debuff: boolean }[];
  intents: IntentView[];
  countdowns: { turnsLeft: number; label: string }[];
  resistance: { tag: Tag; nameKo: string; stacks: number }[];
  hypotheses: HypothesisView[];
  findings: FindingView[];
  workingDx?: { diseaseId: string; nameKo: string };
  organism: OrganismView;
  pending: { label: string; turnsLeft: number }[];
  art: { region: ArtRegion; lesion: [number, number, number] };
  cured: boolean;
  revealNext: boolean;
}

export const ABX_SHORT: [string, string][] = [
  ["ceftriaxone", "CRO"],
  ["pip_tazo", "TZP"],
  ["meropenem", "MEM"],
  ["vancomycin", "VAN"],
  ["gentamicin", "GEN"],
  ["levofloxacin", "LVX"],
  ["clarithromycin", "CLR"],
  ["metronidazole", "MTZ"],
];

const RESPONSE_OF: Record<string, ResponseClass> = { rx_good: "good", rx_partial: "partial", rx_none: "none", rx_worse: "worse" };

function organismGram(org: OrganismId): GramClass | undefined {
  for (const f of db().findings) if (f.organism === org && f.gram) return f.gram;
  return undefined;
}

function organismView(state: GameState, enemy: EnemyState): OrganismView {
  const live = liveHypotheses(enemy);
  const orgs = new Set<OrganismId>();
  for (const h of live) for (const o of organismsOf(h.diseaseId)) if (o !== "virus") orgs.add(o);
  const view: OrganismView = { relevant: orgs.size > 0, candidates: [] };
  // 그람 염색 소견 (가장 최근)
  let gram: GramClass | undefined;
  for (const o of enemy.observations) {
    const ch = channelDef(o.channel.startsWith("rx:") ? "vitals" : o.channel);
    if (!ch.gramOf) continue;
    const g = o.finding.replace("gs_", "") as GramClass;
    if (g !== "none") {
      gram = g;
      view.gram = findingDef(o.finding).text;
    }
  }
  if (enemy.organismKnown) {
    const org = currentOrganism(enemy);
    if (org) {
      view.known = organismDef(org)?.nameKo ?? org;
      view.antibiogram = ABX_SHORT.map(([id, short]) => {
        const sp = cardDef(id).drug?.spectrum;
        return { cardId: id, short, grade: sp?.[org] ?? "immune" };
      });
    }
    return view;
  }
  // 원인균 후보: 그람 염색과 항생제 반응으로 걸러낸다
  for (const org of orgs) {
    if (gram && organismGram(org) && organismGram(org) !== gram) continue;
    let ok = true;
    for (const o of enemy.observations) {
      if (!isResponseChannel(o.channel) || !o.cardId) continue;
      const sp = cardDef(o.cardId).drug?.spectrum;
      if (!sp) continue;
      const g = sp[org];
      const cls: ResponseClass = g === "key" || g === "weak" ? "good" : g === "normal" || g === "resistant" ? "partial" : g === "harmful" ? "worse" : "none";
      if (RESPONSE_OF[o.finding] && RESPONSE_OF[o.finding] !== cls) ok = false;
    }
    if (ok) view.candidates.push(organismDef(org)?.nameKo ?? org);
  }
  const chart = [...new Set((state.run.micro?.results ?? []).map((r) => r.organism).filter((o): o is string => !!o && orgs.has(o)))];
  if (chart.length) view.chart = chart.map((o) => organismDef(o)?.nameKo ?? o);
  return view;
}

function hypothesisViews(state: GameState, enemy: EnemyState): HypothesisView[] {
  const rows = scoreDifferential(enemy);
  const obs = enemy.observations;
  return rows.map((r) => {
    const def = diseaseDef(r.diseaseId);
    const tb = textbookSummary(r.diseaseId);
    const casebook = !!state.run.casebook[r.diseaseId];
    const commit = commitCheck(state, enemy.uid, r.diseaseId);
    const v: HypothesisView = {
      diseaseId: r.diseaseId,
      nameKo: def.nameKo,
      nameEn: def.nameEn,
      category: categoryName(def.category),
      level: r.level,
      levelLabel: LEVEL_LABEL[r.level],
      score: r.score,
      support: r.support,
      against: r.against,
      isWorkingDx: enemy.workingDx === r.diseaseId,
      keyFeatures: def.textbook.keyFeatures,
      firstLine: tb.firstLine,
      avoid: tb.avoid,
      casebook,
      forFindings: r.forObs.map((i) => findingText(obs[i]!)),
      againstFindings: r.againstObs.map((i) => findingText(obs[i]!)),
      commitCost: commit.ok ? commit.cost : null,
    };
    if (!commit.ok && commit.reason) v.commitReason = commit.reason;
    if (casebook) {
      v.expected = db()
        .channels.filter((ch) => !ch.gramOf && ch.group !== "vitals")
        .flatMap((ch) => {
          const exp = expectedFindings(r.diseaseId, ch.id).filter((f) => f !== ch.normal);
          return exp.length ? [{ channelName: ch.nameKo, text: exp.map((f) => findingDef(f).text).join(" / ") }] : [];
        });
    }
    return v;
  });
}

function findingText(o: EnemyState["observations"][number]): string {
  if (isResponseChannel(o.channel)) {
    const name = o.cardId ? cardDef(o.cardId).nameKo : (o.tags ?? []).map((t) => tagDef(t)?.nameKo ?? t).join("·");
    return `${name}: ${findingDef(o.finding).text}`;
  }
  return findingDef(o.finding).text;
}

function findingViews(enemy: EnemyState): FindingView[] {
  const rows = scoreDifferential(enemy);
  return enemy.observations.map((o, i) => {
    const rx = isResponseChannel(o.channel);
    const ch = rx ? undefined : channelDef(o.channel);
    const v: FindingView = {
      index: i,
      channel: o.channel,
      channelName: rx ? "치료 반응" : ch!.nameKo,
      group: rx ? "response" : ch!.group,
      text: findingText(o),
      weight: findingDef(o.finding).weight,
      turn: o.turn,
      effects: rows.map((r) => ({
        diseaseId: r.diseaseId,
        nameKo: diseaseDef(r.diseaseId).nameKo,
        sign: r.forObs.includes(i) ? 1 : r.againstObs.includes(i) ? -1 : 0,
      })),
    };
    if (rx) v.response = RESPONSE_OF[o.finding];
    return v;
  });
}

export function visibleEnemyInfo(state: GameState, uid: Uid): EnemyView | undefined {
  const c = state.combat;
  const enemy = c ? findEnemy(c, uid) : undefined;
  if (!c || !enemy) return undefined;
  const def = diseaseDef(enemy.diseaseId);
  const pres = presentationDef(enemy.presentationId);
  const k = enemy.knowledge;
  const confirmed = k >= 2;
  const intents: IntentView[] = [];
  const shownIntents = confirmed || enemy.revealNext ? 2 : 1;
  for (const p of enemy.ai.planned.slice(0, shownIntents)) {
    const mv = findMove(enemy, p.moveId);
    if (confirmed) {
      const parts = intentParts(state, enemy, p);
      const total = parts.reduce((a, x) => a + (x.kind === "attack" ? (x.value ?? 0) * (x.hits ?? 1) : 0), 0);
      const pressure = sigKind(displaySig(moveSignature(enemy, mv)));
      const band = bandOf(total);
      intents.push({ pressure, pressureLabel: PRESSURE_LABEL[pressure], band, bandLabel: BAND_LABEL[band], bandRange: BAND_RANGE[band], estimate: total, moveName: mv.nameKo, parts, total });
      continue;
    }
    // 확진 전: 경과 대본이 고른 칸(종류·등급)과 보이는 보정만. 실제 질병의 수치·효과는 쓰지 않는다
    const sig = p.sig ?? displaySig(moveSignature(enemy, mv));
    const pressure = sigKind(sig);
    const est = visibleEstimate(state, enemy, sigBand(sig));
    const band = bandOf(est);
    intents.push({ pressure, pressureLabel: PRESSURE_LABEL[pressure], band, bandLabel: BAND_LABEL[band], bandRange: BAND_RANGE[band], estimate: est });
  }
  const live = liveHypotheses(enemy);
  const cats = new Set(live.map((h) => diseaseDef(h.diseaseId).category));
  const view: EnemyView = {
    uid: enemy.uid,
    index: c.enemies.indexOf(enemy),
    // 등급은 인카운터 종류로 (질병마다 다르면 정답이 드러난다)
    tier: c.kind,
    knowledge: k,
    title: confirmed ? def.nameKo : pres.complaint,
    complaint: pres.complaint,
    vignette: pres.vignette,
    severity: enemy.severity,
    maxSeverity: enemy.maxSeverity,
    stability: enemy.stability,
    statuses: enemy.statuses.map((s) => {
      const sd = statusDef(s.id);
      return { id: s.id, nameKo: sd.nameKo, stacks: s.stacks, description: sd.description, debuff: sd.debuff };
    }),
    intents,
    countdowns: enemy.countdowns.map((cd) => ({ turnsLeft: cd.turnsLeft, label: confirmed ? findMove(enemy, cd.moveId).nameKo : "합병증 예고" })),
    // 획득 내성은 원인균의 성질이다: 원인균을 확인하거나 확진하기 전에는 보이지 않는다 (환자 쪽 기록은 미생물 기록에 있다)
    resistance: (confirmed || enemy.organismKnown ? Object.entries(enemy.acquiredResistance) : [])
      .filter(([, n]) => n > 0)
      .map(([tag, n]) => ({ tag, nameKo: tagDef(tag)?.nameKo ?? tag, stacks: n })),
    hypotheses: hypothesisViews(state, enemy),
    findings: findingViews(enemy),
    organism: organismView(state, enemy),
    pending: c.delayed.filter((d) => d.channel && d.ctx.targetUid === enemy.uid).map((d) => ({ label: d.label ?? channelDef(d.channel!).nameKo, turnsLeft: d.turnsLeft })),
    // 확진 전에는 내원 양상의 대표 부위만 (병변 위치는 진단을 드러낸다)
    art: confirmed ? def.art : { region: diseaseDef(pres.candidates[0]!.disease).art.region, lesion: [0.5, 0.5, 0] },
    cured: enemy.cured,
    revealNext: enemy.revealNext,
  };
  if (cats.size === 1 && live.length > 1) view.category = categoryName([...cats][0]!);
  if (enemy.workingDx) view.workingDx = { diseaseId: enemy.workingDx, nameKo: diseaseDef(enemy.workingDx).nameKo };
  const ph = phaseDef(enemy);
  if (confirmed) {
    if (ph) view.phaseName = ph.nameKo;
    view.confirmedName = def.nameKo;
    view.nameEn = def.nameEn;
    view.passives = def.passiveText ?? [];
    const v = variantDef(enemy);
    if (v && (!v.organism || enemy.organismKnown)) view.variantName = v.nameKo;
  }
  void pendingChannels;
  return view;
}

// ───────────────────────── 카드 미리보기 ─────────────────────────

function firstDamageOp(ops: EffectOp[]): Extract<EffectOp, { op: "damage" }> | undefined {
  for (const op of ops) {
    if (op.op === "damage") return op;
    if (op.op === "if") {
      const d = firstDamageOp(op.then);
      if (d) return d;
    }
    if (op.op === "choose_option") {
      for (const o of op.options) {
        const d = firstDamageOp(o.effects);
        if (d) return d;
      }
    }
  }
  return undefined;
}

/**
 * 대상 위로 카드를 가져갔을 때의 예상 질병 부담 감소.
 * 확진(원인균이 달린 항생제는 원인균 확인)이 아니면 실제 등급 대신 감별 목록의 가설별 교과서 반응을 보여 준다.
 */
export function previewDamage(state: GameState, cardUid: Uid, targetUid: Uid): DamagePreview | undefined {
  const c = state.combat;
  if (!c) return undefined;
  const enemy = findEnemy(c, targetUid);
  const ci = c.hand.find((x) => x.uid === cardUid);
  if (!enemy || !ci) return undefined;
  const def = cardDef(ci.cardId, ci.upgraded);
  const op = firstDamageOp(def.effects);
  if (!op) return undefined;
  const ctx: EffectCtx = { owner: { kind: "card", id: ci.uid, cardId: def.id }, targetUid, cardTags: def.tags };
  const tags = op.tags ?? def.tags;
  const base = typeof op.amount === "number" ? op.amount : 0;
  const hits = op.hits ?? 1;
  const calc = calcPlayerDamage(state, ctx, enemy, base, tags, op.mods);
  // 배율 [등급, 계획, 내성, …]. 내성은 원인균을 알기 전에는 보이지 않는 정보라 미리보기에서 뺀다
  const resistanceKnown = enemy.knowledge >= 2 || enemy.organismKnown;
  const others = calc.mults.slice(1).map((m, i) => (i === 1 && !resistanceKnown ? 100 : m));
  const spectrum = def.drug?.spectrum;
  const confirmed = enemy.knowledge >= 2;
  // 범용 여부도 감별 목록으로 판단한다 (숨은 질병의 판정을 쓰면 정답이 샌다)
  const live = liveHypotheses(enemy);
  if (!confirmed && live.every((h) => textbook(h.diseaseId, tags, spectrum).generic)) {
    return { amount: Math.floor((calc.d1 * combinePct(others)) / 100) * hits, known: true, grade: "generic" };
  }
  if (confirmed && calc.grade.basis === "generic") return { amount: calc.final * hits, known: true, grade: "generic" };
  const variantKnown = !calc.grade.dependsOnVariant || enemy.organismKnown;
  if (confirmed && variantKnown) {
    if (calc.grade.harmful) return { amount: 0, known: true, grade: "harmful", harmful: true };
    return { amount: calc.final * hits, known: true, grade: calc.grade.grade === "not_indicated" ? "not_indicated" : calc.grade.grade };
  }
  const byHypothesis: HypothesisPreview[] = [];
  for (const h of live) {
    const tb = textbook(h.diseaseId, tags, spectrum);
    const nameKo = diseaseDef(h.diseaseId).nameKo;
    if (tb.harmful && !tb.varies) {
      byHypothesis.push({ diseaseId: h.diseaseId, nameKo, level: h.level, grade: "harmful" });
      continue;
    }
    if (tb.varies) {
      byHypothesis.push({ diseaseId: h.diseaseId, nameKo, level: h.level, grade: "varies" });
      continue;
    }
    const g = tb.best;
    const pct = g === "generic" ? 100 : g === "not_indicated" || g === "harmful" ? 0 : GRADE_PCT[g];
    byHypothesis.push({ diseaseId: h.diseaseId, nameKo, level: h.level, grade: g, amount: Math.floor((calc.d1 * combinePct([pct, ...others])) / 100) * hits });
  }
  return { amount: Math.floor((calc.d1 * combinePct(others)) / 100) * hits, known: false, byHypothesis };
}

export function cardCost(state: GameState, cardUid: Uid): number | null {
  const c = state.combat;
  const ci = c?.hand.find((x) => x.uid === cardUid);
  return ci ? costOf(state, ci) : null;
}

export function isPlayable(state: GameState, cardUid: Uid): boolean {
  const c = state.combat;
  const ci = c?.hand.find((x) => x.uid === cardUid);
  if (!c || !ci) return false;
  const def = cardDef(ci.cardId, ci.upgraded);
  if (def.target === "enemy" && def.cost !== "unplayable") {
    return c.enemies.some((e) => !e.cured && canPlay(state, cardUid, e.uid).ok);
  }
  return canPlay(state, cardUid).ok;
}

/** 손패 카드의 반납 가능 여부 (화면의 "반납" 단추) */
export function returnInfo(state: GameState, cardUid: Uid): { eligible: boolean; ok: boolean; reason?: string } {
  const c = state.combat;
  const ci = c?.hand.find((x) => x.uid === cardUid);
  if (!ci) return { eligible: false, ok: false };
  const eligible = isTreatmentCard(cardDef(ci.cardId));
  const r = returnCheck(state, cardUid);
  return { eligible, ok: r.ok, reason: r.reason };
}

export function patientStatusViews(state: GameState) {
  const c = state.combat;
  if (!c) return [];
  return c.patientStatuses.map((s) => {
    const sd = statusDef(s.id);
    return { id: s.id, nameKo: sd.nameKo, stacks: s.stacks, description: sd.description, debuff: sd.debuff };
  });
}

export function gradeLabel(g: Grade | "generic" | "not_indicated" | "varies" | "?"): string {
  switch (g) {
    case "key":
      return "특효";
    case "weak":
      return "우수";
    case "normal":
      return "보통";
    case "resistant":
      return "저하";
    case "immune":
      return "무효";
    case "harmful":
      return "금기";
    case "generic":
      return "보존적";
    case "not_indicated":
      return "적응증 아님";
    case "varies":
      return "원인균에 따라";
    case "?":
      return "?";
  }
}

export { resistanceStacksFor, statusStacks };

// ───────────────────────── 미생물 기록 (v2.1) ─────────────────────────

export interface MicroEntryView {
  specimen: string;
  source: string;
  where: string;
  text: string;
  organism?: string;
  antibiogram?: AbxCell[];
}

export interface MicroView {
  pressure: number;
  /** 선택 압력이 이후 감염의 내성균(ESBL·MRSA·녹농균) 변이 가중치에 더하는 % */
  pressurePct: number;
  pending: { specimen: string; source: string; where: string }[];
  results: MicroEntryView[];
  /** 차트에 있는 원인균 (집락): 같은 균의 이후 감염 가능성이 오른다 */
  colonized: string[];
}

const PLACE_KO: Record<number, string> = { 1: "응급실", 2: "병동", 3: "중환자실" };

/** 환자 차트의 미생물 기록. 모두 플레이어가 이미 본 결과와 자기 항생제 이력이다 */
export function microView(state: GameState): MicroView {
  const m = state.run.micro ?? { pending: [], results: [], pressure: 0 };
  const where = (e: { act: number; floor: number }) => `${e.act}막 ${PLACE_KO[e.act] ?? ""} ${e.floor}층`;
  const orgs = new Set<string>();
  const results = m.results.map((r) => {
    const v: MicroEntryView = { specimen: channelDef(r.channel).nameKo, source: r.source, where: where(r), text: findingDef(r.finding).text };
    if (r.organism) {
      orgs.add(r.organism);
      v.organism = organismDef(r.organism)?.nameKo ?? r.organism;
      v.antibiogram = ABX_SHORT.map(([id, short]) => ({ cardId: id, short, grade: cardDef(id).drug?.spectrum?.[r.organism!] ?? "immune" }));
    }
    return v;
  });
  return {
    pressure: m.pressure,
    pressurePct: Math.min(PRESSURE_CAP_PCT, m.pressure * PRESSURE_PCT),
    pending: m.pending.map((p) => ({ specimen: channelDef(p.channel).nameKo, source: p.source, where: where(p) })),
    results,
    colonized: [...orgs].map((o) => organismDef(o)?.nameKo ?? o),
  };
}
