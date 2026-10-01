// 임상 결정: 선택지(choose_option), 처방집 발견(discover), 협진, 시술 결정.
// 선택지를 만드는 모든 함수는 플레이어가 아는 정보(감별 목록, 소견, 작업 진단, 환자 상태, 처방집)만 쓴다.
// 실제 질병(enemy.diseaseId, 변이)은 읽지 않는다. tests/info-leak.test.ts가 이를 검사한다.
import { cardDef, channelDef, consultDef, db, diseaseDef, findingDef, hasFinding, interactionRules, organismDef, tagDef } from "./registry";
import { LEVEL_LABEL, LEVEL_RANK, channelHint, isObserved, liveHypotheses, pendingChannels, scoreDifferential } from "./evidence";
import { allTraits, cardTextbook, isTreatmentCard } from "./textbook";
import { evalCondition } from "./values";
import { emit, findEnemy, livingEnemies, log, modifierValue } from "./util";
import type {
  CardDef,
  CardInstance,
  EffectCtx,
  EffectOp,
  EnemyState,
  GameState,
  Grade,
  OptionDef,
  PendingOption,
  TagQuery,
} from "./types";

type ChooseOp = Extract<EffectOp, { op: "choose_option" }>;

function targetEnemy(state: GameState, ctx: EffectCtx): EnemyState | undefined {
  const c = state.combat;
  if (!c) return undefined;
  const e = findEnemy(c, ctx.targetUid);
  if (e && !e.cured) return e;
  return livingEnemies(c)[0];
}

// ───────────────────────── 선택지 만들기 ─────────────────────────

const GRADE_SHORT: Record<string, string> = {
  key: "특효",
  weak: "우수",
  normal: "보통",
  resistant: "저하",
  immune: "무효",
  harmful: "금기",
  not_indicated: "효과 없음",
  generic: "보존적",
};

/** 시술 위험: 이 시술이 듣는 가설 중 가장 높은 신뢰도 (플레이어 정보) */
export function procedureRisk(enemy: EnemyState | undefined, def: CardDef): { tier: "low" | "mid" | "high"; text: string } {
  if (!enemy) return { tier: "high", text: "대상이 없다" };
  let best = 0;
  for (const r of scoreDifferential(enemy)) {
    if (r.ruledOut) continue;
    const tb = cardTextbook(r.diseaseId, def);
    if (tb.classes.includes("good") || tb.classes.includes("partial")) best = Math.max(best, LEVEL_RANK[r.level]);
  }
  if (best >= LEVEL_RANK.strong) return { tier: "low", text: "근거 충분 — 합병증 위험 낮음" };
  if (best >= LEVEL_RANK.suspected) return { tier: "mid", text: "근거 보통 — 활력 −2 위험" };
  return { tier: "high", text: "근거 부족 — 활력 −5와 시술 합병증 위험" };
}

function buildOption(state: GameState, ctx: EffectCtx, o: OptionDef): PendingOption {
  const c = state.combat!;
  const enemy = targetEnemy(state, ctx);
  const cost = o.cost ?? 0;
  const out: PendingOption = { id: o.id, label: o.label, detail: o.detail, cost, available: true, effects: o.effects };
  if (o.risk) out.risk = o.risk;
  if (o.cardId) out.cardId = o.cardId;
  if (o.upgraded) out.upgraded = true;
  if (o.riskFrom === "procedure") {
    const ci = c.limbo.find((x) => x.uid === ctx.owner.id);
    if (ci) out.risk = procedureRisk(enemy, cardDef(ci.cardId, ci.upgraded)).text;
  }
  if (o.channel) {
    out.channel = o.channel;
    if (enemy) {
      if (isObserved(enemy, o.channel)) {
        out.available = false;
        out.reason = "이미 확인한 소견";
      } else if (pendingChannels(state, enemy.uid).includes(o.channel)) {
        out.available = false;
        out.reason = "결과 대기 중";
      } else out.hint = channelHint(enemy, o.channel);
    }
  }
  if (out.available && o.requires && !evalCondition(state, ctx, o.requires)) {
    out.available = false;
    out.reason = o.requiresText ?? "조건이 맞지 않는다";
  }
  if (out.available && cost > c.orders) {
    out.available = false;
    out.reason = `오더 부족 (+${cost} 필요)`;
  }
  return out;
}

/** choose_option 명령 실행: 대기 결정을 연다 */
export function openChoice(state: GameState, op: ChooseOp, ctx: EffectCtx): void {
  const c = state.combat!;
  let picks = op.picks ?? 1;
  const card = ctx.owner.kind === "card" && ctx.owner.cardId ? cardDef(ctx.owner.cardId) : undefined;
  // 감별진단 체크리스트: 매 턴 처음 여는 진단 카드 선택은 하나 더 고른다
  if (card?.kind === "diagnostic" && !op.optional && modifierValue(state, "extraDiagnosticPick").length && !c.flags.ddxPickUsed) {
    c.flags.ddxPickUsed = 1;
    picks += 1;
  }
  const options = op.options.map((o) => buildOption(state, ctx, o));
  if (!options.some((o) => o.available)) {
    log(c, "info", `${op.title ?? card?.nameKo ?? "선택"}: 고를 수 있는 선택지가 없다`);
    return;
  }
  state.pending = {
    kind: "choose_option",
    title: op.title ?? card?.nameKo ?? "임상 결정",
    prompt: op.prompt,
    options,
    picksAfter: Math.max(0, picks - 1),
    canSkip: !!op.optional,
    source: ctx.owner.cardId,
    trail: [...c.choiceTrail],
    ctx,
    defs: op.options,
  };
}

/** 선택 해소. 선택지 효과 뒤에 남은 선택을 다시 연다 */
export function resolveOption(state: GameState, optionId: string, enqueueFront: (ops: EffectOp[], ctx: EffectCtx) => void): string | null {
  const p = state.pending;
  if (!p || p.kind !== "choose_option") return "고를 결정이 없다";
  const c = state.combat!;
  if (optionId === "skip") {
    if (!p.canSkip) return "이 결정은 건너뛸 수 없다";
    state.pending = undefined;
    log(c, "info", `${p.title}: 더 고르지 않음`);
    return null;
  }
  const opt = p.options.find((o) => o.id === optionId);
  if (!opt) return "없는 선택지";
  if (!opt.available) return opt.reason ?? "고를 수 없는 선택지";
  if (opt.cost > c.orders) return "오더가 부족하다";
  c.orders -= opt.cost;
  const stats = state.run.stats;
  stats.modalDecisions += 1;
  const key = `${p.source ?? p.title}:${opt.id}`;
  stats.optionPicks[key] = (stats.optionPicks[key] ?? 0) + 1;
  emit({ type: "option_chosen", source: p.source, optionId: opt.id, label: opt.label });
  log(c, "play", `${p.title} → ${opt.label}${opt.cost ? ` (오더 +${opt.cost})` : ""}`);
  c.choiceTrail.push(opt.label);
  state.pending = undefined;
  const ops: EffectOp[] = [...opt.effects];
  if (p.picksAfter > 0) {
    const remaining = p.defs.filter((d) => d.id !== opt.id);
    if (remaining.length) ops.push({ op: "choose_option", title: p.title, prompt: `${p.prompt} (하나 더)`, options: remaining, picks: p.picksAfter, optional: true });
  }
  enqueueFront(ops, p.ctx);
  return null;
}

// ───────────────────────── 처방집 발견 ─────────────────────────

const VALUE: Record<string, number> = { key: 4, weak: 3, normal: 2, resistant: 1, immune: 0, not_indicated: 0, harmful: -2, generic: 0 };

/** 배양으로 확인한 원인균 (플레이어가 본 배양 소견에서 읽는다) */
export function knownOrganism(enemy: EnemyState): string | undefined {
  for (const o of enemy.observations) {
    const f = hasFinding(o.finding) ? findingDef(o.finding) : undefined;
    if (f?.organism && f.organism !== "virus") return f.organism;
  }
  return undefined;
}

/** 처방집 항목 (같은 카드는 하나, 업그레이드 우선) */
export function formularyItems(state: GameState, pool: "drug" | "procedure"): CardInstance[] {
  const out = new Map<string, CardInstance>();
  for (const ci of state.run.formulary) {
    const def = cardDef(ci.cardId);
    if (pool === "drug" ? def.kind !== "drug" : def.kind !== "procedure") continue;
    const prev = out.get(ci.cardId);
    if (!prev || (!prev.upgraded && ci.upgraded)) out.set(ci.cardId, ci);
  }
  return [...out.values()];
}

/** 보존적 가치: 약이 주는 안정화 (투여 중 효과 포함) */
function supportValue(def: CardDef): number {
  let v = 0;
  const walk = (ops: EffectOp[]) => {
    for (const op of ops) {
      if (op.op === "gain_stability" && typeof op.amount === "number") v += op.amount;
      if (op.op === "heal" && typeof op.amount === "number") v += op.amount;
      if (op.op === "choose_option") for (const o of op.options) walk(o.effects);
    }
  };
  walk(def.effects);
  for (const t of def.drug?.whileActive ?? []) walk(t.effects);
  return v;
}

/** 환자 상태에서 보이는 부작용 관리 필요 (손·더미의 부작용 카드, 환자 상태) */
function managementValue(state: GameState, def: CardDef): number {
  const c = state.combat!;
  const ids = new Set([...c.hand, ...c.drawPile, ...c.discardPile].map((ci) => ci.cardId));
  let v = 0;
  const walk = (ops: EffectOp[]) => {
    for (const op of ops) {
      if (op.op === "exhaust_cards") for (const id of op.filter.ids ?? []) if (ids.has(id)) v += 4;
      if (op.op === "remove_status" && op.target === "patient" && c.patientStatuses.some((s) => s.id === op.status)) v += 3;
      if (op.op === "choose_option") for (const o of op.options) walk(o.effects);
    }
  };
  walk(def.effects);
  return v;
}

function matchQuery(q: TagQuery, id: string, tags: string[]): boolean {
  if (q.cardId && q.cardId !== id) return false;
  if (q.all && !q.all.every((t) => tags.includes(t))) return false;
  if (q.any && !q.any.some((t) => tags.includes(t))) return false;
  return true;
}

/** 투여 중 약물과의 위험 상호작용 (조건 없는 규칙만: 대상 정보를 쓰지 않는다) */
function hazardText(state: GameState, def: CardDef): string[] {
  const c = state.combat!;
  const out: string[] = [];
  for (const r of interactionRules()) {
    if (r.kind !== "hazard" || r.condition) continue;
    if (!r.active) continue;
    const hit = c.activeDrugs.some(
      (a) =>
        a.cardId !== def.id &&
        ((matchQuery(r.incoming, def.id, def.tags) && matchQuery(r.active!, a.cardId, a.tags)) ||
          (r.symmetric && matchQuery(r.incoming, a.cardId, a.tags) && matchQuery(r.active!, def.id, def.tags))),
    );
    if (hit) out.push(r.text.split(" — ")[0]!);
  }
  return out;
}

function sideEffectText(def: CardDef): string {
  const se = def.drug?.sideEffects ?? [];
  if (!se.length) return "";
  return `부작용 ${se.map((s) => cardDef(s.card).nameKo).join("·")}`;
}

/** 발견 선택지 하나의 문구: 가설별 교과서 반응 */
function perHypothesisText(state: GameState, enemy: EnemyState | undefined, def: CardDef): { detail: string; risk: string[] } {
  const risk: string[] = [];
  if (!enemy) return { detail: "", risk };
  const live = liveHypotheses(enemy).sort((a, b) => b.weight - a.weight);
  const parts: string[] = [];
  for (const h of live.slice(0, 3)) {
    const tb = cardTextbook(h.diseaseId, def);
    if (tb.generic) continue;
    const name = diseaseDef(h.diseaseId).nameKo;
    if (tb.harmful && tb.classes.length === 1) risk.push(`${name}이면 금기`);
    else if (tb.harmful) risk.push(`${name}: 원인에 따라 금기`);
    const label = tb.varies ? `${GRADE_SHORT[tb.worst] ?? "?"}~${GRADE_SHORT[tb.best] ?? "?"}` : GRADE_SHORT[tb.best] ?? "?";
    parts.push(`${name} ${label}`);
  }
  for (const h of live.slice(3)) {
    const tb = cardTextbook(h.diseaseId, def);
    if (tb.harmful) risk.push(`${diseaseDef(h.diseaseId).nameKo}이면 금기`);
  }
  return { detail: parts.join(" · "), risk };
}

/**
 * 처방집에서 선택지를 고른다. 작업 진단이 있으면 그 진단의 1차 치료 위주(표적),
 * 없으면 감별 목록 전체를 넓게 덮는 치료 위주(경험적). 금기인 치료는 작업 진단에 대해 내놓지 않는다.
 */
export function discoverDefs(state: GameState, enemy: EnemyState | undefined, pool: "drug" | "procedure", count: number): OptionDef[] {
  const items = formularyItems(state, pool);
  if (!items.length) return [];
  const c = state.combat!;
  const live = enemy ? liveHypotheses(enemy) : [];
  const wd = enemy?.workingDx;
  const inHand = new Set(c.hand.filter((h) => h.temp).map((h) => h.cardId));
  interface Cand {
    ci: CardInstance;
    def: CardDef;
    idx: number;
    vals: number[]; // 가설별 기대 가치
    wdVal: number;
    manage: number;
    treat: boolean;
  }
  const cands: Cand[] = [];
  items.forEach((ci, idx) => {
    const def = cardDef(ci.cardId, ci.upgraded);
    const treat = isTreatmentCard(def) && (def.tags.some((t) => tagDef(t)?.kind === "therapeutic") || !!def.drug?.spectrum);
    // 배양으로 원인균을 확인했으면(공개된 소견) 항생제는 그 균의 감수성으로 본다
    const known = def.drug?.spectrum && enemy?.organismKnown ? knownOrganism(enemy) : undefined;
    const knownVal = known ? VALUE[def.drug!.spectrum![known] ?? "immune"]! - (def.tags.includes("broad_spectrum") ? 1 : 0) : undefined;
    const vals = live.map((h) => {
      if (!treat) return 0;
      if (knownVal !== undefined) return knownVal;
      const tb = cardTextbook(h.diseaseId, def);
      if (tb.generic) return 0;
      // 원인균에 따라 달라지면 최선과 최악의 중간으로 본다
      return tb.varies ? (VALUE[tb.best]! + VALUE[tb.worst]!) / 2 : VALUE[tb.best]!;
    });
    let wdVal = 0;
    if (knownVal !== undefined) wdVal = knownVal;
    else if (wd && treat) {
      const tb = cardTextbook(wd, def);
      if (tb.harmful && !tb.varies) return; // 작업 진단에 금기인 치료는 내놓지 않는다
      wdVal = tb.generic ? 0 : tb.varies ? (VALUE[tb.best]! + VALUE[tb.worst]!) / 2 : VALUE[tb.best]!;
    }
    cands.push({ ci, def, idx, vals, wdVal, manage: managementValue(state, def), treat });
  });
  const chosen: Cand[] = [];
  const covered = live.map(() => 0);
  const pick = (score: (x: Cand) => number) => {
    let best: Cand | undefined;
    let bestS = -Infinity;
    for (const x of cands) {
      if (chosen.includes(x)) continue;
      const s = score(x) - (inHand.has(x.ci.cardId) ? 3 : 0);
      if (s > bestS + 1e-9) {
        best = x;
        bestS = s;
      }
    }
    if (best && bestS > 0) {
      chosen.push(best);
      best.vals.forEach((v, i) => (covered[i] = Math.max(covered[i]!, v)));
      return true;
    }
    return false;
  };
  const coverage = (x: Cand) => x.vals.reduce((a, v, i) => a + live[i]!.weight * Math.max(0, v - covered[i]!), 0) - x.vals.reduce((a, v, i) => a + (v < 0 ? live[i]!.weight : 0), 0);
  const manageNeed = cands.some((x) => x.manage > 0);
  const treatSlots = manageNeed ? count - 1 : count;
  const roles = new Map<Cand, "first" | "alt" | "second" | "hedge" | "support">();
  const lastPicked = () => chosen[chosen.length - 1]!;
  /** 치료의 대가: 부작용 카드 수(손으로 오면 2배)와 광범위(선택 압력·내성) */
  const burden = (x: Cand) => (x.def.drug?.sideEffects ?? []).reduce((a, se) => a + se.count * (se.dest === "hand" ? 2 : 1), 0) + (x.def.tags.includes("broad_spectrum") ? 2 : 0);
  if (wd) {
    // v2.1 표적 오더는 세 역할로 고른다: 1차(가장 잘 듣는 것) · 대안(덜 듣거나 같아도 대가가 적은 것) · 보험(작업 진단이 틀렸을 때 다른 가설에 듣는 것).
    // "맨 위가 정답"인 퀴즈가 되지 않게, 효과만이 아니라 부작용·범위·진단 불확실성을 맞바꾸게 한다
    if (pick((x) => (x.wdVal >= 2 ? x.wdVal * 10 + coverage(x) * 0.1 : 0))) roles.set(lastPicked(), "first");
    const first = chosen[0];
    // 대안: 1차와 거의 같이 들으면서(한 등급 아래까지) 대가가 적은 것. 없으면 그다음으로 잘 듣는 것
    if (first && chosen.length < treatSlots && pick((x) => (x.wdVal >= 2 && x.wdVal >= first.wdVal - 1 && burden(x) < burden(first) ? 10 + x.wdVal * 3 - burden(x) : 0))) roles.set(lastPicked(), "alt");
    else if (first && chosen.length < treatSlots && pick((x) => (x.wdVal >= 2 ? x.wdVal * 10 - burden(x) : 0))) roles.set(lastPicked(), "second");
    const wdIdx = live.findIndex((h) => h.diseaseId === wd);
    const hedge = (x: Cand) => x.vals.reduce((a, v, i) => a + (i !== wdIdx ? live[i]!.weight * Math.max(0, v - covered[i]!) : 0), 0) - ((x.vals[wdIdx] ?? 0) < 0 ? 50 : 0);
    if (chosen.length < treatSlots && live.length > 1 && pick(hedge)) roles.set(lastPicked(), "hedge");
    while (chosen.length < treatSlots && pick((x) => (x.wdVal >= 2 ? x.wdVal * 10 - burden(x) : 0))) {
      /* 계속 */
    }
  }
  // 경험적(또는 표적 칸이 남으면): 감별 목록을 넓게 덮는 순서
  while (chosen.length < treatSlots && pick((x) => coverage(x))) {
    /* 계속 */
  }
  if (manageNeed) pick((x) => x.manage);
  // 모자라면 쓸모 있는 나머지(관리 약, 가치가 있는 치료)로 채운다
  while (chosen.length < Math.min(2, count) && pick((x) => x.manage + Math.max(0, ...x.vals, 0) + (x.treat ? 0 : 1))) {
    /* 계속 */
  }
  // 표적 오더의 빈 칸은 보존적 치료(진단과 무관한 안정화)로: 치료 대신 버티는 것도 선택지다
  if (wd && chosen.length < count && pick((x) => (!x.treat && supportValue(x.def) > 0 ? 1 + supportValue(x.def) / 10 : 0))) roles.set(lastPicked(), "support");
  const out = chosen.map((x) => {
    const { detail, risk } = perHypothesisText(state, enemy, x.def);
    const r = [...risk, ...hazardText(state, x.def)];
    const se = sideEffectText(x.def);
    if (se) r.push(se);
    const org = x.def.drug?.spectrum && enemy?.organismKnown ? knownOrganism(enemy) : undefined;
    const lead = org
      ? `배양 감수성(${organismDef(org)?.nameKo ?? org}): ${GRADE_SHORT[x.def.drug!.spectrum![org] ?? "immune"]}${x.def.tags.includes("broad_spectrum") ? " · 광범위" : ""}. `
      : wd && x.wdVal >= 3
        ? `작업 진단(${diseaseDef(wd).nameKo})의 1차 치료. `
        : "";
    const manage = x.manage > 0 ? "부작용·환자 상태를 정리한다. " : "";
    const role = roles.get(x);
    const others = live.filter((h) => h.diseaseId !== wd).map((h) => diseaseDef(h.diseaseId).nameKo);
    const roleText =
      role === "alt"
        ? "대안: 1차보다 대가(부작용·범위)가 적다. "
        : role === "second"
          ? "차선: 1차와 다른 약 — 덜 들을 수 있지만 같은 약을 거듭 쓰지 않고 함께 쓸 수 있다. "
        : role === "hedge"
          ? `보험: 작업 진단이 틀렸다면(${others.slice(0, 2).join("·")}) 듣는다. `
          : role === "support"
            ? "보존적: 진단과 무관하게 버틴다. "
            : "";
    const o: OptionDef = {
      id: x.ci.cardId,
      label: `${x.def.nameKo}${x.ci.upgraded ? "+" : ""}`,
      detail: `${roleText}${lead}${manage}${detail}`.trim() || x.def.nameEn,
      effects: [{ op: "add_card", cardId: x.ci.cardId, count: 1, dest: "hand", costZeroThisTurn: true, ...(x.ci.upgraded ? { upgraded: true } : {}) }],
      cardId: x.ci.cardId,
    };
    if (x.ci.upgraded) o.upgraded = true;
    if (r.length) o.risk = r.join(" · ");
    return o;
  });
  // 맞는 치료가 하나뿐이거나 없으면 "처방하지 않음"도 판단이다: 오더를 돌려받고 카드 1장
  const treatOffers = chosen.filter((x) => x.treat && roles.get(x) !== "support").length;
  if (out.length < 2 || (wd && treatOffers < 2 && out.length < 4)) {
    out.push({
      id: "none",
      label: "처방하지 않음",
      detail: "처방집에 이 환자에게 맞는 것이 없다고 판단한다. 오더 1을 돌려받고 카드 1장",
      effects: [{ op: "gain_orders", amount: 1 }, { op: "draw", amount: 1 }],
    });
  }
  return out;
}

/** 봇·도움말용: 지금 발견을 열면 나올 선택지 (플레이어 정보로 계산) */
export function previewDiscover(state: GameState, targetUid: string | undefined, pool: "drug" | "procedure"): OptionDef[] {
  const c = state.combat;
  if (!c) return [];
  const e = findEnemy(c, targetUid) ?? livingEnemies(c)[0];
  return discoverDefs(state, e && !e.cured ? e : undefined, pool, 3);
}

// ───────────────────────── 협진 ─────────────────────────

/** 진료과 선택지: 감별 목록의 분류·특성과 맞는 과 (플레이어 정보) */
export function consultSpecialtyDefs(state: GameState, enemy: EnemyState | undefined, count: number): OptionDef[] {
  const live = enemy ? liveHypotheses(enemy) : [];
  const scored = db().consults.map((cd, idx) => {
    let s = 0;
    const names: string[] = [];
    for (const h of live) {
      const def = diseaseDef(h.diseaseId);
      // 특성이 맞으면(그 과가 직접 다루는 문제) 범주만 맞는 것보다 두 배로 친다
      const m = (cd.categories.includes(def.category) ? 1 : 0) + ((cd.traits ?? []).some((t) => allTraits(def).includes(t)) ? 2 : 0);
      if (m > 0) {
        s += h.weight * m;
        names.push(def.nameKo);
      }
    }
    return { cd, idx, s, names };
  });
  scored.sort((a, b) => b.s - a.s || a.idx - b.idx);
  return scored.slice(0, count).map(({ cd, names }) => ({
    id: cd.id,
    label: cd.nameKo,
    detail: names.length ? `관련 가설: ${names.join("·")}` : "일반 자문",
    effects: [{ op: "consult_recommend", specialty: cd.id, count: 3 }],
  }));
}

/** 권고 선택지: 쓸 수 있는 권고를 먼저, 그다음 조건이 안 맞는 권고(이유와 함께) */
export function consultRecommendDefs(state: GameState, ctx: EffectCtx, specialty: string, count: number): OptionDef[] {
  const cd = consultDef(specialty);
  const ok: OptionDef[] = [];
  const blocked: OptionDef[] = [];
  for (const r of cd.recommendations) {
    const o: OptionDef = { id: r.id, label: r.label, detail: r.detail, effects: r.effects };
    if (r.risk) o.risk = r.risk;
    if (r.cost) o.cost = r.cost;
    if (r.requires) o.requires = r.requires;
    if (r.requiresText) o.requiresText = r.requiresText;
    if (!r.requires || evalCondition(state, ctx, r.requires)) ok.push(o);
    else blocked.push(o);
  }
  return [...ok, ...blocked].slice(0, count);
}

// ───────────────────────── 시술 결정 ─────────────────────────

export function procedureDecisionDefs(state: GameState, ctx: EffectCtx): OptionDef[] | null {
  const c = state.combat!;
  const ci = c.limbo.find((x) => x.uid === ctx.owner.id);
  if (!ci) return null;
  const def = cardDef(ci.cardId, ci.upgraded);
  const confirm = def.procedure?.confirm;
  const treat = def.effects;
  const now: OptionDef = {
    id: "now",
    label: "즉시 시행",
    detail: "지금 결정적 처치를 한다. 진단이 맞으면 질병의 기전이 바뀐다",
    riskFrom: "procedure",
    effects: [{ op: "procedure_risk" }, ...treat],
  };
  const out: OptionDef[] = [now];
  if (confirm) {
    out.push({
      id: "guided",
      label: "확인 후 시행",
      detail: `${channelDef(confirm).nameKo}로 먼저 확인하고, 결과를 보고 시행 여부를 정한다`,
      risk: "오더 +1",
      cost: 1,
      channel: confirm,
      effects: [
        { op: "investigate", channel: confirm },
        {
          op: "choose_option",
          title: def.nameKo,
          prompt: "확인 소견을 보고 결정한다",
          options: [
            { id: "go", label: "시행", detail: "결정적 처치를 한다", riskFrom: "procedure", effects: [{ op: "procedure_risk" }, ...treat] },
            { id: "hold", label: "보류", detail: "시술 카드를 손으로 돌려받는다", effects: [{ op: "return_to_hand" }] },
          ],
        },
      ],
    });
  }
  out.push({
    id: "hold",
    label: "보존적 치료 유지",
    detail: "안정화 4. 시술 카드는 손으로 돌아온다",
    effects: [{ op: "gain_stability", amount: 4, target: "patient" }, { op: "return_to_hand" }],
  });
  return out;
}

/** 투여 중 약물 중단 선택지 */
export function stopDrugDefs(state: GameState): OptionDef[] {
  const c = state.combat!;
  return [...c.activeDrugs]
    .sort((a, b) => a.order - b.order)
    .slice(0, 4)
    .map((d) => {
      const def = cardDef(d.cardId, d.upgraded);
      const broad = d.tags.includes("broad_spectrum");
      return {
        id: d.cardId,
        label: `중단: ${def.nameKo}`,
        detail: `남은 ${d.turnsLeft}턴을 끊고 카드 1장 뽑기${broad ? ". 광범위 항생제 — 원인균을 알면 범위 축소" : ""}`,
        effects: broad ? [{ op: "deescalate" }, { op: "draw", amount: 1 }] : [{ op: "end_drug", filter: { ids: [d.cardId] } }, { op: "draw", amount: 1 }],
      };
    });
}

export function levelLabel(level: keyof typeof LEVEL_LABEL): string {
  return LEVEL_LABEL[level];
}

export type { Grade };
