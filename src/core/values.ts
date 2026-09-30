// ValueExpr·Condition 평가와 대상 해석. design.md D6
import { cardDef, diseaseDef } from "./registry";
import { currentTraits } from "./disease";
import { randInt } from "./rng";
import { combatOf, findEnemy, livingEnemies, statusStacks } from "./util";
import type { Condition, EffectCtx, EnemyState, GameState, TargetSel, ValueExpr } from "./types";

export type ResolvedTarget = { kind: "patient" } | { kind: "enemy"; enemy: EnemyState };

/** 대상 선택자를 실제 대상 목록으로 바꾼다. random_enemy는 cardEffect 스트림을 쓴다. */
export function resolveTargets(state: GameState, ctx: EffectCtx, sel: TargetSel | undefined): ResolvedTarget[] {
  const c = state.combat;
  const s = sel ?? "target";
  if (s === "patient") return [{ kind: "patient" }];
  if (!c) return [];
  switch (s) {
    case "target": {
      const e = findEnemy(c, ctx.targetUid);
      if (e && !e.cured) return [{ kind: "enemy", enemy: e }];
      // 대상이 사라졌으면 첫 번째 살아 있는 적 (효과 주인이 적이면 환자)
      if (ctx.owner.kind === "enemy") return [{ kind: "patient" }];
      const first = livingEnemies(c)[0];
      return first ? [{ kind: "enemy", enemy: first }] : [];
    }
    case "all_enemies":
      return livingEnemies(c).map((enemy) => ({ kind: "enemy" as const, enemy }));
    case "random_enemy": {
      const alive = livingEnemies(c);
      if (alive.length === 0) return [];
      const e = alive[randInt(c.rng.cardEffect, alive.length)]!;
      return [{ kind: "enemy", enemy: e }];
    }
    case "self": {
      if (ctx.owner.kind === "enemy") {
        const e = findEnemy(c, ctx.owner.id);
        return e && !e.cured ? [{ kind: "enemy", enemy: e }] : [];
      }
      return [{ kind: "patient" }];
    }
    case "source": {
      const e = findEnemy(c, ctx.owner.kind === "enemy" ? ctx.owner.id : ctx.targetUid);
      return e ? [{ kind: "enemy", enemy: e }] : [{ kind: "patient" }];
    }
  }
}

function firstEnemyTarget(state: GameState, ctx: EffectCtx, sel: TargetSel): EnemyState | undefined {
  const t = resolveTargets(state, ctx, sel).find((r) => r.kind === "enemy");
  return t && t.kind === "enemy" ? t.enemy : undefined;
}

export function evalValue(state: GameState, ctx: EffectCtx, v: ValueExpr): number {
  if (typeof v === "number") return v;
  if ("add" in v) return evalValue(state, ctx, v.add[0]) + evalValue(state, ctx, v.add[1]);
  if ("mul" in v) return evalValue(state, ctx, v.mul[0]) * evalValue(state, ctx, v.mul[1]);
  if ("min" in v) return Math.min(evalValue(state, ctx, v.min[0]), evalValue(state, ctx, v.min[1]));
  const c = state.combat;
  if (!c) return 0;
  switch (v.ref) {
    case "hand_size":
      return c.hand.length;
    case "active_drug_count":
      return c.activeDrugs.length;
    case "exhaust_count":
      return c.exhaustPile.length;
    case "cards_played_this_turn":
      return c.counters.cardsPlayedThisTurn ?? 0;
    case "drugs_played_this_turn":
      return c.counters.drugsPlayedThisTurn ?? 0;
    case "drugs_ended_now":
      return c.counters.drugsEndedNow ?? 0;
    case "side_effects_in_hand":
      return c.hand.filter((ci) => cardDef(ci.cardId).kind === "side_effect").length;
    case "status_stacks": {
      if (!v.status) return 0;
      if (v.of === "patient") return statusStacks(c.patientStatuses, v.status);
      const e = firstEnemyTarget(state, ctx, v.of ?? "target");
      return e ? statusStacks(e.statuses, v.status) : 0;
    }
    case "knowledge_level": {
      const e = firstEnemyTarget(state, ctx, v.of ?? "target");
      return e ? e.knowledge : 0;
    }
  }
}

export function drugTagActive(state: GameState, tag: string): boolean {
  const c = state.combat;
  return !!c && c.activeDrugs.some((d) => d.tags.includes(tag));
}

export function evalCondition(state: GameState, ctx: EffectCtx, cond: Condition): boolean {
  if ("all" in cond) return cond.all.every((x) => evalCondition(state, ctx, x));
  if ("any" in cond) return cond.any.some((x) => evalCondition(state, ctx, x));
  if ("not" in cond) return !evalCondition(state, ctx, cond.not);
  const c = state.combat;
  if ("knowledgeAtLeast" in cond) {
    const e = firstEnemyTarget(state, ctx, cond.knowledgeAtLeast.target);
    return !!e && e.knowledge >= cond.knowledgeAtLeast.level;
  }
  if ("hasStatus" in cond) {
    const { target, status, min } = cond.hasStatus;
    const need = min ?? 1;
    if (target === "patient") return !!c && statusStacks(c.patientStatuses, status) >= need;
    const e = firstEnemyTarget(state, ctx, target);
    return !!e && statusStacks(e.statuses, status) >= need;
  }
  if ("activeDrugTag" in cond) return drugTagActive(state, cond.activeDrugTag);
  if ("targetCategory" in cond) {
    const e = firstEnemyTarget(state, ctx, "target");
    return !!e && cond.targetCategory.includes(diseaseDef(e.diseaseId).category);
  }
  if ("targetTrait" in cond) {
    const e = firstEnemyTarget(state, ctx, "target");
    if (!e) return false;
    const traits = currentTraits(e);
    return cond.targetTrait.some((t) => traits.includes(t));
  }
  if ("vitalityBelowPct" in cond) return state.run.vitality * 100 <= state.run.maxVitality * cond.vitalityBelowPct;
  if ("severityBelowPct" in cond) {
    const e = firstEnemyTarget(state, ctx, cond.severityBelowPct.target);
    return !!e && e.severity * 100 < e.maxSeverity * cond.severityBelowPct.pct;
  }
  if ("countAtLeast" in cond) return evalValue(state, ctx, { ref: cond.countAtLeast.ref }) >= cond.countAtLeast.n;
  if ("turnAtLeast" in cond) return !!c && c.turn >= cond.turnAtLeast;
  if ("noCountdown" in cond) {
    const e = ctx.owner.kind === "enemy" && c ? findEnemy(c, ctx.owner.id) : undefined;
    return !!e && e.countdowns.length === 0;
  }
  if ("eventDrugTag" in cond) return (ctx.eventDrugTags ?? []).includes(cond.eventDrugTag);
  if ("handHasCard" in cond) return !!c && c.hand.some((ci) => ci.cardId === cond.handHasCard);
  return false;
}

export function inCombat(state: GameState): boolean {
  return state.phase === "combat" && !!state.combat;
}

export { combatOf };
