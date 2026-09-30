// 콘텐츠 검증과 가치 예산 계산. design.md §3.10, D4
import { describeCard } from "./describe";
import { allMoves } from "./disease";
import { gradeFor } from "./damage";
import { cardDef, installContent } from "./registry";
import type { CardDef, Condition, ContentDB, EffectOp, EnemyState, TriggerDef } from "./types";

const KNOWN_CUSTOM = new Set(["relic_flash", "partner_side_effect", "random_discard", "draw_penalty"]);
const SE_CAP: Record<string, (specs: { dest: string; count: number; persistent: boolean }[]) => boolean> = {
  common: (s) => s.every((x) => x.dest === "discard" && !x.persistent) && s.reduce((a, x) => a + x.count, 0) <= 1,
  uncommon: (s) =>
    s.every((x) => !x.persistent && x.dest !== "hand") &&
    (s.filter((x) => x.dest === "draw_random").reduce((a, x) => a + x.count, 0) <= 1 ? true : false) &&
    s.reduce((a, x) => a + x.count, 0) <= 2,
  rare: (s) => s.reduce((a, x) => a + x.count, 0) <= 1,
};

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  budget: { id: string; target: number; actual: number; ratio: number }[];
}

function walkOps(ops: EffectOp[], fn: (op: EffectOp) => void): void {
  for (const op of ops) {
    fn(op);
    if (op.op === "if") {
      walkOps(op.then, fn);
      walkOps(op.else ?? [], fn);
    } else if (op.op === "repeat" || op.op === "delay") walkOps(op.effects, fn);
    else if (op.op === "select_cards") walkOps(op.then, fn);
  }
}

function walkCond(c: Condition | undefined, fn: (c: Condition) => void): void {
  if (!c) return;
  fn(c);
  if ("all" in c) c.all.forEach((x) => walkCond(x, fn));
  if ("any" in c) c.any.forEach((x) => walkCond(x, fn));
  if ("not" in c) walkCond(c.not, fn);
}

function fakeEnemy(diseaseId: string): EnemyState {
  return {
    uid: "x",
    diseaseId,
    severity: 1,
    maxSeverity: 1,
    stability: 0,
    statuses: [],
    knowledge: 0,
    diagnosisPoints: 0,
    acquiredResistance: {},
    resistanceFraction: 0,
    phase: 0,
    ai: { history: [], planned: [], planIndex: 0, usedOnce: [] },
    countdowns: [],
    revealNext: false,
    targetedBonus: 0,
    cured: false,
  };
}

/** 이 카드의 피해가 듣는 질병 수 (기본 형태 기준). 적응증 제한 가치 계수에 쓴다. */
export function indicatedDiseaseCount(dbx: ContentDB, def: CardDef): number {
  let n = 0;
  for (const d of dbx.diseases) {
    const variants = d.variants?.length ? d.variants : [undefined];
    let any = false;
    for (const v of variants) {
      const e = fakeEnemy(d.id);
      if (v) e.variantId = v.id;
      const g = gradeFor(e, def.tags, def.drug?.spectrum);
      if (!g.harmful && g.pct > 0) any = true;
    }
    if (any) n += 1;
  }
  return n;
}

export function cardBudget(dbx: ContentDB, def: CardDef): { target: number; actual: number } | undefined {
  if (def.rarity === "starter" || def.rarity === "special" || def.kind === "side_effect") return undefined;
  const cost = typeof def.cost === "number" ? def.cost : 0;
  let target = cost === 0 ? 3 : 7 * cost;
  target += def.rarity === "uncommon" ? 2 : def.rarity === "rare" ? 5 : 0;
  if (def.keywords?.includes("exhaust")) target += 3;
  for (const s of def.drug?.sideEffects ?? []) {
    const se = dbx.cards.find((c) => c.id === s.card);
    const h = se?.sideEffect?.harm ?? 3;
    const factor = se?.sideEffect?.persistent ? 3 : s.dest === "discard" ? 1 : s.dest === "draw_random" ? 1.2 : 1.5;
    target += s.count * h * factor;
  }
  const hasTherapeutic = def.tags.some((t) => dbx.tags.find((x) => x.id === t)?.kind === "therapeutic") || !!def.drug?.spectrum;
  let dmgValue = 1;
  if (hasTherapeutic) {
    const n = indicatedDiseaseCount(dbx, def);
    dmgValue = n >= 4 ? 0.8 : n >= 2 ? 0.6 : 0.5;
  }
  let actual = 0;
  const value = (op: EffectOp, weight: number): void => {
    const num = (v: unknown) => (typeof v === "number" ? v : 0);
    switch (op.op) {
      case "damage":
        actual += num(op.amount) * (op.hits ?? 1) * (op.target === "all_enemies" ? 1.5 : 1) * dmgValue * weight;
        break;
      case "gain_stability":
        actual += num(op.amount) * weight;
        break;
      case "draw":
        actual += num(op.amount) * 3 * weight;
        break;
      case "gain_orders":
        actual += num(op.amount) * 7 * weight;
        break;
      case "diagnose":
        actual += num(op.points) * 2 * (op.target === "all_enemies" ? 1.5 : 1) * weight;
        break;
      case "confirm":
        actual += 6 * weight;
        break;
      case "apply_status":
        actual += num(op.stacks) * 3 * weight;
        break;
      case "heal":
        actual += num(op.amount) * 1.5 * weight;
        break;
      case "exhaust_cards":
        actual += (op.amount === "all" ? 3 : op.amount * 2) * weight;
        break;
      case "cost_modifier":
        actual += 5 * weight;
        break;
      case "remove_status":
        actual += 2 * weight;
        break;
      case "reveal_intent":
        actual += 1 * weight;
        break;
      case "select_cards":
        actual += 2 * op.max * weight;
        break;
      case "delay":
        for (const x of op.effects) value(x, weight * 0.8);
        break;
      case "if":
        for (const x of op.then) value(x, weight * 0.5);
        for (const x of op.else ?? []) value(x, weight * 0.5);
        break;
      case "combat_flag":
      case "targeted_bonus":
      case "add_random_card":
      case "end_drug":
        actual += 5 * weight;
        break;
      default:
        break;
    }
  };
  for (const op of def.effects) value(op, 1);
  for (const t of def.drug?.whileActive ?? []) for (const op of t.effects) value(op, 1.5);
  return { target: Math.round(target * 10) / 10, actual: Math.round(actual * 10) / 10 };
}

export function validateContent(dbx: ContentDB): ValidationResult {
  installContent(dbx);
  const errors: string[] = [];
  const warnings: string[] = [];
  const budget: ValidationResult["budget"] = [];
  const dupCheck = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${kind} ID 중복: ${id}`);
      seen.add(id);
    }
  };
  dupCheck("카드", dbx.cards.map((c) => c.id));
  dupCheck("질병", dbx.diseases.map((d) => d.id));
  dupCheck("유물", dbx.relics.map((r) => r.id));
  dupCheck("태그", dbx.tags.map((t) => t.id));
  dupCheck("상태", dbx.statuses.map((s) => s.id));
  dupCheck("인카운터", dbx.encounters.map((e) => e.id));
  dupCheck("규칙", dbx.interactions.map((r) => r.id));
  dupCheck("이벤트", dbx.events.map((e) => e.id));

  const tagIds = new Set(dbx.tags.map((t) => t.id));
  const traitIds = new Set(dbx.traits.map((t) => t.id));
  const cardIds = new Set(dbx.cards.map((c) => c.id));
  const statusIds = new Set(dbx.statuses.map((s) => s.id));
  const organismIds = new Set(dbx.organisms.map((o) => o.id));

  const checkOps = (where: string, ops: EffectOp[], moveIds?: Set<string>) => {
    walkOps(ops, (op) => {
      if (op.op === "add_card" && !cardIds.has(op.cardId)) errors.push(`${where}: 없는 카드 ${op.cardId}`);
      if ((op.op === "apply_status" || op.op === "remove_status") && !statusIds.has(op.status)) errors.push(`${where}: 없는 상태 ${op.status}`);
      if (op.op === "custom" && !KNOWN_CUSTOM.has(op.id)) errors.push(`${where}: 없는 custom ${op.id}`);
      if (op.op === "exhaust_cards") for (const id of op.filter.ids ?? []) if (!cardIds.has(id)) errors.push(`${where}: 없는 카드 ${id}`);
      if (op.op === "damage" || op.op === "if") {
        const conds = op.op === "damage" ? (op.mods ?? []).map((m) => m.if) : [op.cond];
        for (const c of conds)
          walkCond(c, (x) => {
            if ("targetTrait" in x) for (const t of x.targetTrait) if (!traitIds.has(t)) errors.push(`${where}: 없는 특성 ${t}`);
            if ("activeDrugTag" in x && !tagIds.has(x.activeDrugTag)) errors.push(`${where}: 없는 태그 ${x.activeDrugTag}`);
          });
      }
      if (op.op === "start_countdown" && moveIds && !moveIds.has(op.move)) errors.push(`${where}: 없는 행동 ${op.move}`);
    });
  };
  const checkTriggers = (where: string, ts: TriggerDef[] | undefined, moveIds?: Set<string>) => {
    for (const t of ts ?? []) checkOps(where, t.effects, moveIds);
  };

  for (const c of dbx.cards) {
    for (const t of c.tags) if (!tagIds.has(t)) errors.push(`카드 ${c.id}: 선언되지 않은 태그 ${t}`);
    checkOps(`카드 ${c.id}`, c.effects);
    if (c.upgrade.effects) checkOps(`카드 ${c.id}+`, c.upgrade.effects);
    if ((c.kind === "drug" || c.kind === "side_effect") && !c.medical) errors.push(`카드 ${c.id}: medical 필드 없음`);
    if (c.kind === "drug" && !c.drug) errors.push(`카드 ${c.id}: 약물 정보 없음`);
    if (c.kind === "side_effect" && !c.sideEffect) errors.push(`카드 ${c.id}: 부작용 정보 없음`);
    if (c.drug) {
      for (const s of c.drug.sideEffects) if (!cardIds.has(s.card)) errors.push(`카드 ${c.id}: 없는 부작용 카드 ${s.card}`);
      checkTriggers(`카드 ${c.id}`, c.drug.whileActive);
      const cap = SE_CAP[c.rarity];
      if (cap) {
        const specs = c.drug.sideEffects.map((s) => ({ dest: s.dest, count: s.count, persistent: !!dbx.cards.find((x) => x.id === s.card)?.sideEffect?.persistent }));
        if (!cap(specs)) errors.push(`카드 ${c.id}: 희귀도(${c.rarity}) 부작용 상한 초과`);
      }
      if (c.tags.includes("abx")) {
        if (!c.drug.spectrum) errors.push(`항생제 ${c.id}: 스펙트럼 없음`);
        else for (const o of organismIds) if (!c.drug.spectrum[o]) errors.push(`항생제 ${c.id}: 원인균 ${o} 등급 없음`);
      }
    }
    if (c.sideEffect) checkTriggers(`카드 ${c.id}`, c.sideEffect.behavior);
    try {
      describeCard(c.id, false);
      describeCard(c.id, true);
    } catch (e) {
      errors.push(`카드 ${c.id}: 설명문 생성 실패 ${(e as Error).message}`);
    }
    const b = cardBudget(dbx, c);
    if (b) {
      const ratio = b.target > 0 ? b.actual / b.target : 1;
      budget.push({ id: c.id, ...b, ratio: Math.round(ratio * 100) / 100 });
      if (Math.abs(ratio - 1) > 0.3) warnings.push(`예산 이탈 ${c.id}: 목표 ${b.target}V, 실제 ${b.actual}V (${Math.round(ratio * 100)}%)`);
    }
  }

  for (const d of dbx.diseases) {
    if (!d.medical) errors.push(`질병 ${d.id}: medical 필드 없음`);
    for (const t of d.traits) if (!traitIds.has(t)) errors.push(`질병 ${d.id}: 없는 특성 ${t}`);
    for (const t of Object.keys(d.effectiveness)) if (!tagIds.has(t)) errors.push(`질병 ${d.id}: 반응표의 없는 태그 ${t}`);
    if (d.organism && !organismIds.has(d.organism)) errors.push(`질병 ${d.id}: 없는 원인균 ${d.organism}`);
    const moveIds = new Set(allMoves(d).map((m) => m.id));
    const ais = [d.ai, ...(d.phases ?? []).map((p) => p.ai).filter((x): x is NonNullable<typeof x> => !!x)];
    for (const ai of ais) {
      for (const m of [...(ai.opening ?? []), ...Object.keys(ai.weights), ...(ai.rules ?? []).map((r) => r.move)])
        if (!moveIds.has(m)) errors.push(`질병 ${d.id}: AI가 없는 행동 ${m}을(를) 참조`);
    }
    for (const m of allMoves(d)) checkOps(`질병 ${d.id}/${m.id}`, m.effects, moveIds);
    checkTriggers(`질병 ${d.id}`, d.passives, moveIds);
    for (const v of d.variants ?? []) {
      if (v.organism && !organismIds.has(v.organism)) errors.push(`질병 ${d.id}: 변이의 없는 원인균 ${v.organism}`);
      for (const t of Object.keys(v.effectivenessOverride ?? {})) if (!tagIds.has(t)) errors.push(`질병 ${d.id}: 변이 반응표의 없는 태그 ${t}`);
      checkTriggers(`질병 ${d.id}/${v.id}`, v.passives, moveIds);
    }
    for (const p of d.phases ?? []) {
      for (const t of [...(p.traitsAdd ?? []), ...(p.traitsRemove ?? [])]) if (!traitIds.has(t)) errors.push(`질병 ${d.id}: 단계의 없는 특성 ${t}`);
      for (const t of Object.keys(p.effectivenessOverride ?? {})) if (!tagIds.has(t)) errors.push(`질병 ${d.id}: 단계 반응표의 없는 태그 ${t}`);
      checkOps(`질병 ${d.id}/${p.id}`, p.onEnter ?? [], moveIds);
    }
  }
  for (const e of dbx.encounters) for (const x of e.enemies) if (!dbx.diseases.some((d) => d.id === x.disease)) errors.push(`인카운터 ${e.id}: 없는 질병 ${x.disease}`);
  for (const r of dbx.interactions) {
    if (!r.medical) errors.push(`규칙 ${r.id}: medical 필드 없음`);
    for (const t of [...(r.incoming.all ?? []), ...(r.incoming.any ?? []), ...(r.active?.all ?? []), ...(r.active?.any ?? [])])
      if (!tagIds.has(t)) errors.push(`규칙 ${r.id}: 없는 태그 ${t}`);
    checkOps(`규칙 ${r.id}`, r.effects);
  }
  for (const r of dbx.relics) checkTriggers(`유물 ${r.id}`, r.triggers);
  for (const id of dbx.starterDeck) if (!cardIds.has(id)) errors.push(`시작 덱: 없는 카드 ${id}`);
  if (!dbx.relics.some((r) => r.id === dbx.starterRelic)) errors.push(`시작 유물 없음: ${dbx.starterRelic}`);
  for (const t of dbx.tags) for (const tr of t.indications?.traits ?? []) if (!traitIds.has(tr)) errors.push(`태그 ${t.id}: 없는 특성 ${tr}`);
  void cardDef;
  return { errors, warnings, budget };
}
