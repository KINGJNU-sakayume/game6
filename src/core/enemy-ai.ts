// 질병 행동 선택과 의도 계산. design.md §4.3
import { cardDef, diseaseDef, presentationDef, statusDef } from "./registry";
import { currentAi, findMove } from "./disease";
import { calcEnemyAttack } from "./damage";
import { pickWeighted, randRange } from "./rng";
import { evalCondition } from "./values";
import type { Condition, EffectOp, EnemyState, GameState, IntentPart, MoveDef, PlannedMove, PressureKind } from "./types";

function startsCountdown(move: MoveDef): boolean {
  return move.effects.some((op) => op.op === "start_countdown");
}

function aiCondition(state: GameState, enemy: EnemyState, cond: Condition, execTurn: number, virtualPlanned: PlannedMove[]): boolean {
  if ("all" in cond) return cond.all.every((x) => aiCondition(state, enemy, x, execTurn, virtualPlanned));
  if ("any" in cond) return cond.any.some((x) => aiCondition(state, enemy, x, execTurn, virtualPlanned));
  if ("not" in cond) return !aiCondition(state, enemy, cond.not, execTurn, virtualPlanned);
  if ("noCountdown" in cond) {
    if (enemy.countdowns.length > 0) return false;
    return !virtualPlanned.some((p) => startsCountdown(findMove(enemy, p.moveId)));
  }
  if ("turnAtLeast" in cond) return execTurn >= cond.turnAtLeast;
  return evalCondition(state, { owner: { kind: "enemy", id: enemy.uid } }, cond);
}

function baseExecTurn(state: GameState): number {
  const c = state.combat!;
  if (c.turn === 0) return 1;
  return c.flags.enemyPhase ? c.turn + 1 : c.turn;
}

function planOne(state: GameState, enemy: EnemyState, execTurn: number): PlannedMove {
  const c = state.combat!;
  const ai = currentAi(enemy);
  const idx = enemy.ai.planIndex;
  const virtualHistory = [...enemy.ai.history, ...enemy.ai.planned.map((p) => p.moveId)];
  let moveId: string | undefined;
  if (ai.opening && idx < ai.opening.length) moveId = ai.opening[idx];
  if (!moveId) {
    for (const rule of ai.rules ?? []) {
      if (rule.once && enemy.ai.usedOnce.includes(rule.move)) continue;
      if (aiCondition(state, enemy, rule.when, execTurn, enemy.ai.planned)) {
        moveId = rule.move;
        if (rule.once) enemy.ai.usedOnce.push(rule.move);
        break;
      }
    }
  }
  if (!moveId) {
    const last = virtualHistory[virtualHistory.length - 1];
    const entries = Object.entries(ai.weights).filter(([, w]) => (w ?? 0) > 0) as [string, number][];
    const filtered = entries.filter(([id]) => {
      if (last === id && ai.noRepeat?.includes(id)) return false;
      if (ai.maxInARow) {
        const tail = virtualHistory.slice(-ai.maxInARow);
        if (tail.length === ai.maxInARow && tail.every((m) => m === id)) return false;
      }
      return true;
    });
    moveId = pickWeighted(c.rng.enemyAi, filtered.length ? filtered : entries);
  }
  enemy.ai.planIndex += 1;
  const move = findMove(enemy, moveId);
  const planned: PlannedMove = { moveId };
  if (move.hitsRange) planned.hits = randRange(c.rng.enemyAi, move.hitsRange[0], move.hitsRange[1]);
  return planned;
}

/** planned를 2개까지 채운다. */
export function planIntents(state: GameState, enemy: EnemyState): void {
  if (enemy.cured) return;
  const base = baseExecTurn(state);
  while (enemy.ai.planned.length < 2) {
    const execTurn = base + enemy.ai.planned.length;
    enemy.ai.planned.push(planOne(state, enemy, execTurn));
  }
}

export function replanAll(state: GameState, enemy: EnemyState): void {
  enemy.ai.planned = [];
  enemy.ai.planIndex = 0;
  planIntents(state, enemy);
}

/** 행동 효과에서 의도를 만든다. 공격 수치는 현재 상태로 계산한다. */
export function intentParts(state: GameState, enemy: EnemyState, planned: PlannedMove): IntentPart[] {
  const move = findMove(enemy, planned.moveId);
  const parts: IntentPart[] = [];
  const walk = (ops: EffectOp[]) => {
    for (const op of ops) {
      switch (op.op) {
        case "damage": {
          if (op.target && op.target !== "patient" && op.target !== "target") break;
          const base = typeof op.amount === "number" ? op.amount : 0;
          parts.push({ kind: "attack", value: calcEnemyAttack(state, enemy, base, op.mods), hits: planned.hits ?? op.hits ?? 1 });
          break;
        }
        case "lose_vitality":
          parts.push({ kind: "attack", value: typeof op.amount === "number" ? op.amount : 0, hits: 1, label: "직접" });
          break;
        case "apply_status": {
          const st = statusDef(op.status);
          const stacks = typeof op.stacks === "number" ? op.stacks : 0;
          if (op.target === "patient") parts.push({ kind: "debuff", label: `${st.nameKo} ${stacks}` });
          else parts.push({ kind: "buff", label: `${st.nameKo} +${stacks}` });
          break;
        }
        case "heal":
        case "raise_max_severity":
          parts.push({ kind: "buff", label: op.op === "heal" ? "회복" : "악화" });
          break;
        case "gain_stability":
          parts.push({ kind: "defend", value: typeof op.amount === "number" ? op.amount : 0 });
          break;
        case "start_countdown":
          parts.push({ kind: "complication", value: op.turns });
          break;
        case "add_card":
          parts.push({ kind: "card", label: `${cardDef(op.cardId).nameKo} ×${op.count}` });
          break;
        case "enter_phase":
          parts.push({ kind: "special", label: "상태 변화" });
          break;
        case "if":
          walk(op.then);
          break;
        default:
          break;
      }
    }
  };
  walk(move.effects);
  if (parts.length === 0) parts.push({ kind: "special", label: move.nameKo });
  return parts;
}

export function moveName(enemy: EnemyState, moveId: string): string {
  return findMove(enemy, moveId).nameKo;
}

export function diseaseTier(enemy: EnemyState) {
  return diseaseDef(enemy.diseaseId).tier;
}

export const PRESSURE_LABEL: Record<PressureKind, string> = {
  hemodynamic: "혈압·순환 악화",
  respiratory: "호흡 악화",
  airway: "기도 위협",
  bleeding: "출혈 진행",
  neuro: "의식·신경 악화",
  metabolic: "대사 악화",
  infection: "염증 진행",
  cardiac: "심장 부담·부정맥 위험",
  renal: "신기능 악화",
  pain: "통증·불안정",
  worsening: "병세 진행",
  complication: "합병증 예고",
};

const STATUS_PRESSURE: Record<string, PressureKind> = {
  hypotension: "hemodynamic",
  dehydration: "hemodynamic",
  hypoxia: "respiratory",
  vulnerable: "hemodynamic",
  weak: "pain",
};
const CARD_PRESSURE: Record<string, PressureKind> = {
  bleeding: "bleeding",
  confusion: "neuro",
  hyperkalemia: "renal",
  nausea: "metabolic",
};

/**
 * 행동의 임상적 압박. 행동에 적힌 값 → 효과에서 끌어낸 값 → 내원 양상의 기본값 순서.
 * 마지막 기본값을 실제 질병의 분류가 아니라 내원 양상에서 가져와, 표시가 숨겨진 진단을 드러내지 않게 한다.
 */
export function movePressure(enemy: EnemyState, move: MoveDef): PressureKind {
  if (move.pressure) return move.pressure;
  let found: PressureKind | undefined;
  const walk = (ops: EffectOp[]) => {
    for (const op of ops) {
      if (found) return;
      if (op.op === "start_countdown" || op.op === "enter_phase") found = "complication";
      else if (op.op === "apply_status" && op.target === "patient") found = STATUS_PRESSURE[op.status];
      else if (op.op === "add_card") found = CARD_PRESSURE[op.cardId];
      else if (op.op === "apply_status" && op.status === "inflammation") found = "infection";
      else if (op.op === "raise_max_severity" || (op.op === "apply_status" && (op.status === "aggravation" || op.status === "acidosis"))) found = "worsening";
      else if (op.op === "if") walk(op.then);
    }
  };
  walk(move.effects);
  return found ?? presentationDef(enemy.presentationId).pressure ?? "worsening";
}
