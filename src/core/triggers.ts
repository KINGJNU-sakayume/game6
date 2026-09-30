// 트리거 수집과 큐 삽입. design.md §3.7
// 수집 순서: 유물(획득 순) → 환자 상태(내장) → 투여 중 약물(등록 순) → 적(위치 순) → 손패의 부작용 카드(손 순서)
import { cardDef, diseaseDef, relicDef } from "./registry";
import { variantDef } from "./disease";
import { evalCondition } from "./values";
import { livingEnemies, statusStacks } from "./util";
import type { EffectCtx, EffectOp, GameState, QueuedEffect, TriggerDef, TriggerEvent, Uid } from "./types";

export type TriggerSource = "relic" | "status" | "drug" | "enemy" | "hand";

export interface FireOptions {
  sources?: TriggerSource[];
  eventDrugTags?: Tag[];
  enemyUid?: Uid;          // 적 소스를 이 적으로 한정
  drawnUid?: Uid;          // card_drawn: 뽑힌 카드
  targetUid?: Uid;
}
type Tag = string;

function passes(state: GameState, t: TriggerDef, ctx: EffectCtx, onceKey: string): boolean {
  const c = state.combat;
  if (t.oncePerCombat && c && c.flags[onceKey]) return false;
  if (t.condition && !evalCondition(state, ctx, t.condition)) return false;
  if (t.oncePerCombat && c) c.flags[onceKey] = 1;
  return true;
}

/** 사건에 반응하는 트리거 효과를 모아 큐 맨 앞에 넣는다(수집 순서 유지). */
export function fire(state: GameState, event: TriggerEvent, opts: FireOptions = {}): void {
  const c = state.combat;
  if (!c) return;
  const want = (s: TriggerSource) => !opts.sources || opts.sources.includes(s);
  const out: QueuedEffect[] = [];
  const push = (effects: EffectOp[], ctx: EffectCtx) => {
    for (const op of effects) out.push({ op, ctx });
  };

  if (want("relic")) {
    state.run.relics.forEach((r) => {
      const def = relicDef(r.id);
      def.triggers.forEach((t, i) => {
        if (t.on !== event) return;
        const ctx: EffectCtx = { owner: { kind: "relic", id: r.id }, targetUid: opts.targetUid, eventDrugTags: opts.eventDrugTags };
        if (passes(state, t, ctx, `once:relic:${r.id}:${i}`)) {
          push(t.effects, ctx);
          push([{ op: "custom", id: "relic_flash", params: { relic: r.id } }], ctx);
        }
      });
    });
  }

  if (want("status") && event === "drug_administered") {
    // 수액 투여 시 저혈압 −1 (내장 상태 반응)
    if ((opts.eventDrugTags ?? []).includes("fluid") && statusStacks(c.patientStatuses, "hypotension") > 0) {
      push([{ op: "remove_status", status: "hypotension", target: "patient", stacks: 1 }], { owner: { kind: "status", id: "hypotension" } });
    }
  }

  if (want("drug")) {
    const drugs = [...c.activeDrugs].sort((a, b) => a.order - b.order);
    for (const d of drugs) {
      const def = cardDef(d.cardId, d.upgraded);
      (def.drug?.whileActive ?? []).forEach((t, i) => {
        if (t.on !== event) return;
        const ctx: EffectCtx = { owner: { kind: "drug", id: d.uid, cardId: d.cardId }, eventDrugTags: opts.eventDrugTags };
        if (passes(state, t, ctx, `once:drug:${d.uid}:${i}`)) push(t.effects, ctx);
      });
    }
  }

  if (want("enemy")) {
    for (const e of livingEnemies(c)) {
      if (opts.enemyUid && e.uid !== opts.enemyUid) continue;
      const def = diseaseDef(e.diseaseId);
      const triggers = [...(def.passives ?? []), ...(variantDef(e)?.passives ?? [])];
      triggers.forEach((t, i) => {
        if (t.on !== event) return;
        const ctx: EffectCtx = { owner: { kind: "enemy", id: e.uid }, eventDrugTags: opts.eventDrugTags };
        if (passes(state, t, ctx, `once:enemy:${e.uid}:${i}`)) push(t.effects, ctx);
      });
    }
  }

  if (want("hand")) {
    const cards = event === "card_drawn" ? c.hand.filter((ci) => ci.uid === opts.drawnUid) : [...c.hand];
    for (const ci of cards) {
      const def = cardDef(ci.cardId, ci.upgraded);
      if (!def.sideEffect) continue;
      def.sideEffect.behavior.forEach((t) => {
        if (t.on !== event) return;
        const ctx: EffectCtx = { owner: { kind: "side_effect", id: ci.uid, cardId: ci.cardId }, eventDrugTags: opts.eventDrugTags };
        if (!t.condition || evalCondition(state, ctx, t.condition)) push(t.effects, ctx);
      });
    }
  }

  if (out.length) c.queue.unshift(...out);
}
