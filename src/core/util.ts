// 공용 도우미. 상태를 직접 변경하는 함수는 이름에 동사를 쓴다.
import { cardDef, relicDef, statusDef } from "./registry";
import type {
  CardInstance,
  CombatState,
  EnemyState,
  GameEvent,
  GameState,
  LogEntry,
  RelicModifier,
  StatusStack,
  Uid,
} from "./types";

export const HAND_LIMIT = 10;

/** step 한 번 동안 쌓이는 이벤트. step이 시작될 때 비운다. */
export const eventSink: { events: GameEvent[] } = { events: [] };

export function emit(ev: GameEvent): void {
  eventSink.events.push(ev);
}

export function newUid(state: GameState, prefix = "c"): Uid {
  const id = `${prefix}${state.nextUid}`;
  state.nextUid += 1;
  return id;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function combatOf(state: GameState): CombatState {
  if (!state.combat) throw new Error("not in combat");
  return state.combat;
}

export function livingEnemies(c: CombatState): EnemyState[] {
  return c.enemies.filter((e) => !e.cured && e.severity > 0);
}

export function findEnemy(c: CombatState, uid: Uid | undefined): EnemyState | undefined {
  if (!uid) return undefined;
  return c.enemies.find((e) => e.uid === uid);
}

export function hasRelic(state: GameState, id: string): boolean {
  return state.run.relics.some((r) => r.id === id);
}

export function relicModifiers(state: GameState): RelicModifier[] {
  const out: RelicModifier[] = [];
  for (const r of state.run.relics) {
    const def = relicDef(r.id);
    if (def.modifiers) out.push(...def.modifiers);
  }
  return out;
}

export function modifierValue<K extends RelicModifier["kind"]>(state: GameState, kind: K): Extract<RelicModifier, { kind: K }>[] {
  return relicModifiers(state).filter((m): m is Extract<RelicModifier, { kind: K }> => m.kind === kind);
}

export function statusStacks(list: StatusStack[], id: string): number {
  return list.find((s) => s.id === id)?.stacks ?? 0;
}

export function addStatus(list: StatusStack[], id: string, stacks: number, fresh = false): number {
  const def = statusDef(id);
  const existing = list.find((s) => s.id === id);
  if (existing) {
    existing.stacks += stacks;
    if (fresh && def.stacking === "duration") existing.fresh = true;
    if (existing.stacks <= 0) list.splice(list.indexOf(existing), 1);
    return existing.stacks;
  }
  if (stacks <= 0) return 0;
  const s: StatusStack = { id, stacks };
  if (fresh && def.stacking === "duration") s.fresh = true;
  list.push(s);
  return stacks;
}

export function removeStatus(list: StatusStack[], id: string, stacks: number | "all"): void {
  const existing = list.find((s) => s.id === id);
  if (!existing) return;
  if (stacks === "all" || existing.stacks <= stacks) list.splice(list.indexOf(existing), 1);
  else existing.stacks -= stacks;
}

export function log(c: CombatState, kind: LogEntry["kind"], text: string): void {
  c.log.push({ turn: c.turn, kind, text });
  if (c.log.length > 80) c.log.splice(0, c.log.length - 80);
}

export function allCombatCards(c: CombatState): CardInstance[] {
  return [...c.drawPile, ...c.hand, ...c.discardPile, ...c.exhaustPile, ...c.limbo];
}

export function isSideEffectCard(ci: CardInstance): boolean {
  return cardDef(ci.cardId).kind === "side_effect";
}

export function pctOf(value: number, pct: number): number {
  return Math.floor((value * pct) / 100);
}

/** 배율을 백분율로 차례로 합성한다 (R36). */
export function combinePct(mults: number[]): number {
  let p = 100;
  for (const m of mults) p = Math.floor((p * m) / 100);
  return p;
}
