// 질병 행동 선택과 의도 계산. design.md §4.3
import { cardDef, diseaseDef, presentationDef, statusDef } from "./registry";
import { currentAi, currentMoves, findMove } from "./disease";
import { calcEnemyAttack } from "./damage";
import { cyrb128, pickWeighted } from "./rng";
import { evalCondition } from "./values";
import { phaseDef } from "./disease";
import type { Condition, CourseScript, EffectOp, EnemyState, GameState, IntentBand, IntentPart, MoveDef, PlannedMove, PressureKind } from "./types";

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

/** 여러 타격 행동의 타격 수. 난수 스트림을 쓰지 않는다 (질병마다 소모량이 다르면 이후 의도가 정답에 따라 갈라진다) */
function rollHits(state: GameState, enemy: EnemyState, move: MoveDef, idx: number): number | undefined {
  if (!move.hitsRange) return undefined;
  const [lo, hi] = move.hitsRange;
  const h = cyrb128(`${state.seed}:${state.run.act}:${state.run.floor}:${enemy.uid}:${idx}`)[0]!;
  return lo + ((h >>> 0) % (hi - lo + 1));
}

/** 대본이 이 적의 의도를 정하는가: 감별 대상이 둘 이상인 내원 양상이고, 자기 행동표를 가진 단계에 들어가지 않았다 */
export function scriptFor(enemy: EnemyState): CourseScript | undefined {
  const pres = presentationDef(enemy.presentationId);
  if (!pres.course) return undefined;
  if (phaseDef(enemy)?.ai) return undefined;
  return pres.course;
}

function planByScript(state: GameState, enemy: EnemyState, script: CourseScript, execTurn: number): PlannedMove {
  const c = state.combat!;
  const idx = enemy.ai.planIndex;
  const sigHistory = [...(enemy.ai.sigs ?? []), ...enemy.ai.planned.map((p) => p.sig ?? "")];
  let sig: string | undefined;
  if (script.opening && idx < script.opening.length) sig = script.opening[idx];
  if (!sig) {
    for (const rule of script.rules ?? []) {
      const key = `sig:${rule.sig}`;
      if (rule.once && enemy.ai.usedOnce.includes(key)) continue;
      if (aiCondition(state, enemy, rule.when, execTurn, enemy.ai.planned)) {
        sig = rule.sig;
        if (rule.once) enemy.ai.usedOnce.push(key);
        break;
      }
    }
  }
  if (!sig) {
    const last = sigHistory[sigHistory.length - 1];
    const entries = Object.entries(script.weights).filter(([, w]) => w > 0);
    const filtered = entries.filter(([k]) => !(last === k && script.noRepeat?.includes(k)));
    sig = pickWeighted(c.rng.enemyAi, filtered.length ? filtered : entries);
  }
  enemy.ai.planIndex += 1;
  const move = moveForSig(enemy, sig);
  const planned: PlannedMove = { moveId: move.id, sig: displaySig(sig) };
  const hits = rollHits(state, enemy, move, idx);
  if (hits !== undefined) planned.hits = hits;
  return planned;
}

/**
 * 대본의 칸에 맞는 실제 질병의 행동. 같은 칸의 행동이 여럿이면 덜 쓴 것부터 (난수 없이 결정적).
 * 합병증 예고가 아닌 칸에서 예고를 거는 행동(예: 충수염의 천공 위험)은 한 번만 쓴다.
 */
export function moveForSig(enemy: EnemyState, sig: string): MoveDef {
  const moves = currentMoves(enemy);
  const used = [...enemy.ai.history, ...enemy.ai.planned.map((p) => p.moveId)];
  const count = (id: string) => used.filter((x) => x === id).length;
  const ok = (m: MoveDef) => !(startsCountdown(m) && movePressure(enemy, m) !== "complication" && used.includes(m.id));
  let cands = moves.filter((m) => moveSignature(enemy, m) === sig && ok(m));
  if (!cands.length) cands = moves.filter((m) => displaySig(moveSignature(enemy, m)) === displaySig(sig) && ok(m));
  if (!cands.length) cands = moves.filter((m) => bandOfMove(m) === sigBand(sig) && ok(m));
  if (!cands.length) cands = moves.filter(ok);
  if (!cands.length) cands = moves;
  let best = cands[0]!;
  for (const m of cands) if (count(m.id) < count(best.id)) best = m;
  return best;
}

function planOne(state: GameState, enemy: EnemyState, execTurn: number): PlannedMove {
  const script = scriptFor(enemy);
  if (script) return planByScript(state, enemy, script, execTurn);
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
  const planned: PlannedMove = { moveId, sig: displaySig(moveSignature(enemy, move)) };
  const hits = rollHits(state, enemy, move, idx);
  if (hits !== undefined) planned.hits = hits;
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

// ───────────────────────── 의도 크기 등급 ─────────────────────────

export const BAND_LABEL: Record<IntentBand, string> = { mild: "경미", moderate: "중등", severe: "심각" };
/** 등급 경계 (예상 활력 손실): 경미 ≤6 · 중등 7–12 · 심각 ≥13 */
export const BAND_MAX: Record<IntentBand, number> = { mild: 6, moderate: 12, severe: Infinity };
/** 확진 전 예상치를 만들 때 쓰는 등급의 대표값 */
export const BAND_NOMINAL: Record<IntentBand, number> = { mild: 4, moderate: 10, severe: 16 };
export const BAND_RANGE: Record<IntentBand, string> = { mild: "≤6", moderate: "7–12", severe: "13+" };

export function bandOf(total: number): IntentBand {
  return total <= BAND_MAX.mild ? "mild" : total <= BAND_MAX.moderate ? "moderate" : "severe";
}

/** 행동이 적힌 그대로의 환자 피해 합 (상태 보정 전). 등급은 이것으로 정한다 */
export function moveBaseTotal(move: MoveDef): number {
  let t = 0;
  const walk = (ops: EffectOp[]) => {
    for (const op of ops) {
      if (op.op === "damage" && (op.target === "patient" || op.target === undefined)) t += (typeof op.amount === "number" ? op.amount : 0) * (op.hits ?? 1);
      else if (op.op === "lose_vitality") t += typeof op.amount === "number" ? op.amount : 0;
    }
  };
  walk(move.effects);
  return t;
}

function bandOfMove(move: MoveDef): IntentBand {
  return bandOf(moveBaseTotal(move));
}

function countdownTurns(move: MoveDef): number | undefined {
  for (const op of move.effects) if (op.op === "start_countdown") return op.turns;
  return undefined;
}

/** 행동의 칸: "종류:등급", 합병증 예고는 "complication:등급@턴" */
export function moveSignature(enemy: EnemyState, move: MoveDef): string {
  const kind = movePressure(enemy, move);
  const base = `${kind}:${bandOfMove(move)}`;
  const turns = countdownTurns(move);
  return kind === "complication" && turns !== undefined ? `${base}@${turns}` : base;
}

/** 화면에 보이는 칸 ("종류:등급") */
export function displaySig(sig: string): string {
  return sig.split("@")[0]!;
}

export function sigKind(sig: string): PressureKind {
  return sig.split(":")[0] as PressureKind;
}

export function sigBand(sig: string): IntentBand {
  return displaySig(sig).split(":")[1] as IntentBand;
}

/** 분석·검증용: 행동의 화면 칸 */
export function intentSignature(enemy: EnemyState, move: MoveDef): string {
  return displaySig(moveSignature(enemy, move));
}

/**
 * 확진 전 예상 활력 손실: 등급의 대표값에 플레이어가 보는 보정(질병의 악화·산증, 환자의 취약, 질병의 약화, 인카운터 공격 배율)만 더한다.
 * 실제 질병의 수치는 쓰지 않는다.
 */
export function visibleEstimate(state: GameState, enemy: EnemyState, band: IntentBand): number {
  const c = state.combat!;
  const add = statusStacksOf(enemy, "aggravation") + statusStacksOf(enemy, "acidosis");
  let v = BAND_NOMINAL[band] + add;
  v = Math.floor((v * (enemy.atkPct ?? 100)) / 100);
  if (c.patientStatuses.some((s) => s.id === "vulnerable" && s.stacks > 0)) v = Math.floor((v * 150) / 100);
  if (statusStacksOf(enemy, "weak") > 0) v = Math.floor((v * 75) / 100);
  return v;
}

function statusStacksOf(enemy: EnemyState, id: string): number {
  return enemy.statuses.find((s) => s.id === id)?.stacks ?? 0;
}

/** 기록·화면용 의도 이름 (확진 전): "호흡 악화 (중등)" */
export function intentLabel(sig: string | undefined): string {
  if (!sig) return "상태 변화";
  return `${PRESSURE_LABEL[sigKind(sig)] ?? "병세 진행"} (${BAND_LABEL[sigBand(sig)] ?? "?"})`;
}
