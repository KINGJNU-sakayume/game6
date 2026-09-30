// 콘텐츠 작성용 명령 생성 도우미. 데이터만 만든다.
import type { Condition, EffectOp, Grade, OrganismId, StatusId, TargetSel } from "../core/types";

export const dmg = (amount: number, extra: { hits?: number; target?: TargetSel } = {}): EffectOp => ({ op: "damage", amount, target: extra.target ?? "target", ...(extra.hits ? { hits: extra.hits } : {}) });
export const stab = (amount: number): EffectOp => ({ op: "gain_stability", amount, target: "patient" });
export const draw = (amount: number): EffectOp => ({ op: "draw", amount });
export const diag = (points: number, target: TargetSel = "target"): EffectOp => ({ op: "diagnose", points, target });
export const heal = (amount: number): EffectOp => ({ op: "heal", amount, target: "patient" });
export const orders = (amount: number): EffectOp => ({ op: "gain_orders", amount });
export const status = (id: StatusId, stacks: number, target: TargetSel = "target"): EffectOp => ({ op: "apply_status", status: id, stacks, target });
export const clear = (id: StatusId, target: TargetSel = "patient"): EffectOp => ({ op: "remove_status", status: id, target, stacks: "all" });
export const iff = (cond: Condition, then: EffectOp[], otherwise?: EffectOp[]): EffectOp => (otherwise ? { op: "if", cond, then, else: otherwise } : { op: "if", cond, then });
export const purge = (ids: string[], amount: number | "all" = "all", from: ("hand" | "draw" | "discard")[] = ["hand", "draw", "discard"]): EffectOp => ({ op: "exhaust_cards", from, filter: { ids }, amount });
export const purgeHand = (ids: string[], amount: number | "all" = 1): EffectOp => ({ op: "exhaust_cards", from: ["hand"], filter: { ids }, amount });
export const addCard = (cardId: string, count: number, dest: "hand" | "discard" | "draw_random"): EffectOp => ({ op: "add_card", cardId, count, dest });

// 질병 행동
export const atk = (amount: number, hits?: number, mods?: { if: Condition; pct: number }[]): EffectOp => ({
  op: "damage",
  amount,
  target: "patient",
  ...(hits && hits > 1 ? { hits } : {}),
  ...(mods ? { mods } : {}),
});
export const toPatient = (id: StatusId, stacks: number): EffectOp => ({ op: "apply_status", status: id, stacks, target: "patient" });
export const toSelf = (id: StatusId, stacks: number): EffectOp => ({ op: "apply_status", status: id, stacks, target: "self" });
export const block = (amount: number): EffectOp => ({ op: "gain_stability", amount, target: "self" });
export const warn = (move: string, turns: number): EffectOp => ({ op: "start_countdown", move, turns, target: "self" });
export const raise = (amount: number): EffectOp => ({ op: "raise_max_severity", amount, target: "self" });
export const selfHeal = (amount: number): EffectOp => ({ op: "heal", amount, target: "self" });
export const phase = (n: number): EffectOp => ({ op: "enter_phase", phase: n, target: "self" });

/** 항생제 감수성표 한 줄: CRO TZP MEM VAN GEN LVX CLR MTZ 순서가 아니라 원인균 순서로 한 약의 등급을 적는다. */
const ORG_ORDER: OrganismId[] = [
  "pneumococcus",
  "atypical",
  "ecoli",
  "esbl",
  "mssa_strep",
  "mrsa",
  "intra_abdominal",
  "cdiff",
  "pseudomonas",
  "gram_neg",
  "virus",
  "mixed_community",
];
const LETTER: Record<string, Grade> = { K: "key", W: "weak", N: "normal", R: "resistant", I: "immune", X: "harmful" };

/** "W I W I N I R I I N I N" 형식 (원인균 순서: 폐렴알균 비정형 대장균 ESBL MSSA MRSA 복강 C.diff 녹농균 그람음성 바이러스 지역사회) */
export function spectrum(letters: string): Partial<Record<OrganismId, Grade>> {
  const parts = letters.trim().split(/\s+/);
  if (parts.length !== ORG_ORDER.length) throw new Error(`spectrum needs ${ORG_ORDER.length} grades: ${letters}`);
  const out: Partial<Record<OrganismId, Grade>> = {};
  ORG_ORDER.forEach((o, i) => {
    const g = LETTER[parts[i]!];
    if (!g) throw new Error(`bad grade letter ${parts[i]}`);
    out[o] = g;
  });
  return out;
}
