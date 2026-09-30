// 투여 중 약물, 상호작용 해석, 부작용 생성, DUR 미리보기. design.md D5
import { cardDef, diseaseDef, interactionRules, presentationDef, relicDef } from "./registry";
import { gradeFor } from "./damage";
import { cardTextbook } from "./textbook";
import { observeResponse, scoreDifferential } from "./evidence";
import { addGeneratedCard } from "./cards";
import { fire } from "./triggers";
import { evalCondition, evalValue } from "./values";
import { addStatus, emit, findEnemy, hasRelic, livingEnemies, log, modifierValue } from "./util";
import type {
  ActiveDrug,
  CardDef,
  Condition,
  EffectCtx,
  EnemyState,
  GameState,
  InteractionPreview,
  InteractionRule,
  QueuedEffect,
  TagQuery,
  Uid,
} from "./types";

function matchQuery(q: TagQuery, id: string, tags: string[]): boolean {
  if (q.cardId && q.cardId !== id) return false;
  if (q.all && !q.all.every((t) => tags.includes(t))) return false;
  if (q.any && !q.any.some((t) => tags.includes(t))) return false;
  return true;
}

interface FiredRule {
  rule: InteractionRule;
  partner?: ActiveDrug;
  conditional: boolean;
}

function conditionUsesTarget(cond: Condition | undefined): boolean {
  if (!cond) return false;
  if ("all" in cond) return cond.all.some(conditionUsesTarget);
  if ("any" in cond) return cond.any.some(conditionUsesTarget);
  if ("not" in cond) return conditionUsesTarget(cond.not);
  return "targetCategory" in cond || "targetTrait" in cond;
}

/**
 * 새 약물 × 투여 중 약물 규칙 판정. 상태를 바꾸지 않는다.
 * knowledgeAware가 참이면 대상 정보가 부족한 조건은 conditional로 표시한다(미리보기).
 */
function evaluateRules(state: GameState, incoming: CardDef, ctx: EffectCtx, knowledgeAware: boolean): FiredRule[] {
  const c = state.combat!;
  const others = c.activeDrugs.filter((d) => d.cardId !== incoming.id).sort((a, b) => a.order - b.order);
  const fired: FiredRule[] = [];
  const target = findEnemy(c, ctx.targetUid);
  for (const rule of interactionRules()) {
    let hit: FiredRule | undefined;
    const condOk = (): { ok: boolean; conditional: boolean } => {
      if (!rule.condition) return { ok: true, conditional: false };
      if (knowledgeAware && conditionUsesTarget(rule.condition) && (!target || target.knowledge < 2)) return { ok: true, conditional: true };
      return { ok: evalCondition(state, ctx, rule.condition), conditional: false };
    };
    if (!rule.active) {
      if (matchQuery(rule.incoming, incoming.id, incoming.tags)) {
        const r = condOk();
        if (r.ok) hit = { rule, conditional: r.conditional };
      }
    } else {
      for (const a of others) {
        const forward = matchQuery(rule.incoming, incoming.id, incoming.tags) && matchQuery(rule.active, a.cardId, a.tags);
        const backward =
          rule.symmetric && matchQuery(rule.incoming, a.cardId, a.tags) && matchQuery(rule.active, incoming.id, incoming.tags);
        if (forward || backward) {
          const r = condOk();
          if (r.ok) {
            hit = { rule, partner: a, conditional: r.conditional };
            break;
          }
        }
      }
    }
    if (hit) fired.push(hit);
  }
  const overridden = new Set(fired.filter((f) => !f.conditional).flatMap((f) => f.rule.overrides ?? []));
  return fired
    .filter((f) => !overridden.has(f.rule.id))
    .sort((a, b) => a.rule.priority - b.rule.priority || (a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0));
}

/** 금기 반응: 중증도 max(6, floor(d1/2)) 회복, 악화 +1 */
export function harmfulResponse(state: GameState, enemy: EnemyState, d1: number, sourceName: string): void {
  const c = state.combat!;
  const heal = Math.max(6, Math.floor(d1 / 2));
  const before = enemy.severity;
  enemy.severity = Math.min(enemy.maxSeverity, enemy.severity + heal);
  addStatus(enemy.statuses, "aggravation", 1);
  state.run.stats.harmfulTreatments += 1;
  emit({ type: "harmful_treatment", target: enemy.uid, healed: enemy.severity - before });
  log(c, "warn", `금기! ${sourceName} → ${diseaseLabel(enemy)} 악화 (중증도 +${enemy.severity - before})`);
}

/** 기록·화면용 이름: 확진 전에는 주호소 (플레이어 정보) */
export function diseaseLabel(enemy: EnemyState): string {
  return enemy.knowledge >= 2 ? diseaseDef(enemy.workingDx ?? enemy.diseaseId).nameKo : presentationDef(enemy.presentationId).complaint;
}

function firstDamageBase(state: GameState, def: CardDef, ctx: EffectCtx): number {
  for (const op of def.effects) {
    if (op.op === "damage") return evalValue(state, ctx, op.amount);
  }
  return 0;
}

/** administer 명령: 등록·갱신, 전신 금기 판정, 상호작용, drug_administered 트리거 */
export function administer(state: GameState, cardUid: Uid, ctx: EffectCtx): void {
  const c = state.combat!;
  const ci = c.limbo.find((x) => x.uid === cardUid) ?? c.hand.find((x) => x.uid === cardUid);
  if (!ci) return;
  const def = cardDef(ci.cardId, ci.upgraded);
  if (!def.drug) return;
  const bonus = c.flags.drugHalfLifeBonus ?? 0;
  const halfLife = Math.min(5, def.drug.halfLife + bonus);
  const existing = c.activeDrugs.find((d) => d.cardId === def.id);
  if (existing) {
    existing.turnsLeft = Math.max(existing.turnsLeft, halfLife);
    existing.upgraded = existing.upgraded || ci.upgraded;
  } else {
    c.activeDrugs.push({ uid: `d${c.drugOrder}`, cardId: def.id, tags: def.tags, turnsLeft: halfLife, order: c.drugOrder, upgraded: ci.upgraded });
    c.drugOrder += 1;
  }
  // 항생제: 원인균을 배양으로 확인하기 전이면 경험적, 뒤면 표적 치료
  let empiric: boolean | undefined;
  if (def.drug.spectrum) {
    const tgt = findEnemy(c, ctx.targetUid);
    empiric = !(tgt?.organismKnown ?? false);
    if (empiric) state.run.stats.abxEmpiric += 1;
    else state.run.stats.abxTargeted += 1;
  }
  emit({ type: "drug_administered", cardId: def.id, refreshed: !!existing, ...(empiric !== undefined ? { empiric } : {}) });
  if (def.tags.includes("fluid")) c.counters.fluidsGiven = (c.counters.fluidsGiven ?? 0) + 1;

  // 전신 금기: 투여되는 순간 모든 적에 대해 판정한다. 악화는 곧 소견이다
  const d1 = firstDamageBase(state, def, ctx);
  for (const enemy of livingEnemies(c)) {
    const g = gradeFor(enemy, def.tags, def.drug.spectrum);
    if (g.harmful) {
      harmfulResponse(state, enemy, d1, def.nameKo);
      observeResponse(state, enemy, def.id, def.tags, "worse", def.nameKo);
    }
  }

  // drug_administered 트리거 (먼저 넣고, 상호작용 효과를 그 앞에 넣는다)
  fire(state, "drug_administered", { eventDrugTags: def.tags, targetUid: ctx.targetUid });

  const fired = evaluateRules(state, def, ctx, false);
  let durAvailable = modifierValue(state, "firstHazardBlocked").length > 0 && !c.flags.durUsed;
  const queued: QueuedEffect[] = [];
  for (const f of fired) {
    const blocked = durAvailable && f.rule.kind === "hazard";
    if (blocked) {
      durAvailable = false;
      c.flags.durUsed = 1;
      emit({ type: "dur_blocked", ruleId: f.rule.id });
      emit({ type: "relic_triggered", relicId: "dur_system" });
      log(c, "rule", `DUR 시스템이 ${f.rule.id} 경고를 차단했다`);
    }
    emit({ type: "interaction_fired", ruleId: f.rule.id, kind: f.rule.kind, text: f.rule.text, blocked });
    state.run.stats.interactions[f.rule.id] = (state.run.stats.interactions[f.rule.id] ?? 0) + 1;
    if (!blocked) {
      log(c, "rule", `${f.rule.id} ${f.rule.text}`);
      const rctx: EffectCtx = { owner: { kind: "rule", id: f.rule.id, cardId: f.partner?.cardId }, targetUid: ctx.targetUid, cardTags: ctx.cardTags };
      for (const op of f.rule.effects) queued.push({ op, ctx: rctx });
    }
  }
  if (queued.length) c.queue.unshift(...queued);
}

/** 전투가 끝나 부작용 생성이 실행되지 못할 때: 지속 부작용만 런 덱에 남긴다. */
export function emitPersistentOnly(state: GameState, cardUid: Uid): void {
  const c = state.combat!;
  const ci = c.limbo.find((x) => x.uid === cardUid);
  if (!ci) return;
  const def = cardDef(ci.cardId, ci.upgraded);
  if (!def.drug || c.current?.suppressSideEffects) return;
  const persistent = def.drug.sideEffects.filter((sp) => cardDef(sp.card).sideEffect?.persistent);
  if (!persistent.length) return;
  if (hasRelic(state, "five_rights") && !c.flags.fiveRightsUsed) {
    c.flags.fiveRightsUsed = 1;
    return;
  }
  const times = 1 + (c.current?.extraSideEffects ?? 0);
  for (let t = 0; t < times; t++)
    for (const sp of persistent)
      for (let k = 0; k < sp.count; k++) {
        state.run.deck.push({ uid: `c${state.nextUid++}`, cardId: sp.card, upgraded: false });
        state.run.stats.sideEffectsGained += 1;
      }
}

export function emitSideEffects(state: GameState, cardUid: Uid): void {
  const c = state.combat!;
  const ci = c.limbo.find((x) => x.uid === cardUid);
  if (!ci) return;
  const def = cardDef(ci.cardId, ci.upgraded);
  if (!def.drug || def.drug.sideEffects.length === 0) return;
  if (c.current?.suppressSideEffects) {
    log(c, "info", `${def.nameKo}의 부작용이 억제되었다`);
    return;
  }
  if (hasRelic(state, "five_rights") && !c.flags.fiveRightsUsed) {
    c.flags.fiveRightsUsed = 1;
    emit({ type: "relic_triggered", relicId: "five_rights" });
    log(c, "info", `${relicDef("five_rights").nameKo}: ${def.nameKo}의 부작용을 막았다`);
    return;
  }
  const times = 1 + (c.current?.extraSideEffects ?? 0);
  for (let t = 0; t < times; t++) {
    for (const spec of def.drug.sideEffects) {
      for (let k = 0; k < spec.count; k++) addGeneratedCard(state, spec.card, spec.dest);
    }
  }
}

/** 투여 중 약물 지속 −1, 0이면 종료 (플레이어 턴 시작 처리의 마지막, R2) */
export function tickDrugs(state: GameState): void {
  const c = state.combat!;
  const expired: ActiveDrug[] = [];
  for (const d of c.activeDrugs) {
    d.turnsLeft -= 1;
    if (d.turnsLeft <= 0) expired.push(d);
  }
  if (!expired.length) return;
  c.activeDrugs = c.activeDrugs.filter((d) => d.turnsLeft > 0);
  for (const d of expired) {
    emit({ type: "drug_expired", cardId: d.cardId });
    log(c, "drug", `${cardDef(d.cardId).nameKo} 투여 종료`);
  }
  fire(state, "drug_expired");
}

export function endDrugs(state: GameState, pred: (d: ActiveDrug) => boolean): number {
  const c = state.combat!;
  const ended = c.activeDrugs.filter(pred);
  c.activeDrugs = c.activeDrugs.filter((d) => !pred(d));
  for (const d of ended) {
    emit({ type: "drug_expired", cardId: d.cardId });
    log(c, "drug", `${cardDef(d.cardId).nameKo} 투여 중단`);
  }
  return ended.length;
}

/** DUR 점검: 지금 쓰면 발동할 규칙과 알려진 금기. 숨겨진 정보는 누설하지 않는다. */
export function previewInteractions(state: GameState, cardUid: Uid, targetUid?: Uid): InteractionPreview[] {
  const c = state.combat;
  if (!c) return [];
  const ci = c.hand.find((x) => x.uid === cardUid);
  if (!ci) return [];
  const def = cardDef(ci.cardId, ci.upgraded);
  if (!def.drug) return [];
  const ctx: EffectCtx = { owner: { kind: "card", id: ci.uid, cardId: def.id }, targetUid, cardTags: def.tags };
  const out: InteractionPreview[] = [];
  let durAvailable = modifierValue(state, "firstHazardBlocked").length > 0 && !c.flags.durUsed;
  for (const f of evaluateRules(state, def, ctx, true)) {
    const blockedByDur = durAvailable && f.rule.kind === "hazard" && !f.conditional;
    if (blockedByDur) durAvailable = false;
    out.push({ ruleId: f.rule.id, kind: f.rule.kind, text: f.rule.text, conditional: f.conditional, blockedByDur });
  }
  // 금기 경고: 감별 목록에서 배제되지 않은 가설 중 이 약이 금기인 것 (교과서, 플레이어 정보)
  for (const enemy of livingEnemies(c)) {
    for (const r of scoreDifferential(enemy)) {
      if (r.ruledOut) continue;
      const tb = cardTextbook(r.diseaseId, def);
      if (!tb.harmful) continue;
      const name = diseaseDef(r.diseaseId).nameKo;
      const where = c.enemies.length > 1 ? `${presentationDef(enemy.presentationId).complaint} — ` : "";
      out.push({
        ruleId: "금기",
        kind: "contraindication",
        text: `${where}${name}${tb.varies ? "(원인균에 따라)" : ""}이면 금기: 투여하면 악화된다`,
        conditional: r.level !== "strong",
      });
    }
  }
  return out;
}
