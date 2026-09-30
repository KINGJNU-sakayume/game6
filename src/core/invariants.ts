// 불변식 검사. 테스트·퍼즈에서 매 step 뒤에 실행한다. design.md §6
import { HAND_LIMIT, allCombatCards } from "./util";
import type { GameState } from "./types";

function isInt(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n);
}

export function checkInvariants(state: GameState): string[] {
  const errs: string[] = [];
  const run = state.run;
  if (!isInt(run.vitality) || run.vitality < 0 || run.vitality > run.maxVitality) errs.push(`활력 범위 위반: ${run.vitality}/${run.maxVitality}`);
  if (!isInt(run.gold) || run.gold < 0) errs.push(`예산 위반: ${run.gold}`);
  const deckUids = new Set<string>();
  for (const ci of [...run.deck, ...run.formulary]) {
    if (deckUids.has(ci.uid)) errs.push(`덱 UID 중복: ${ci.uid}`);
    deckUids.add(ci.uid);
  }
  const c = state.combat;
  if (c && state.phase === "combat") {
    if (c.hand.length > HAND_LIMIT) errs.push(`손패 초과: ${c.hand.length}`);
    if (!isInt(c.orders) || c.orders < 0) errs.push(`오더 위반: ${c.orders}`);
    if (!isInt(c.stability) || c.stability < 0) errs.push(`안정화 위반: ${c.stability}`);
    const uids = new Set<string>();
    for (const ci of allCombatCards(c)) {
      if (uids.has(ci.uid)) errs.push(`전투 카드 UID 중복: ${ci.uid}`);
      uids.add(ci.uid);
    }
    for (const e of c.enemies) {
      if (!isInt(e.severity) || e.severity < 0 || e.severity > e.maxSeverity) errs.push(`중증도 위반: ${e.uid} ${e.severity}/${e.maxSeverity}`);
      if (!isInt(e.stability) || e.stability < 0) errs.push(`적 안정화 위반: ${e.uid}`);
      for (const s of e.statuses) if (!isInt(s.stacks) || s.stacks <= 0) errs.push(`적 상태 위반: ${e.uid} ${s.id}`);
    }
    for (const s of c.patientStatuses) if (!isInt(s.stacks) || s.stacks <= 0) errs.push(`환자 상태 위반: ${s.id}`);
    if (!c.over && c.enemies.every((e) => e.cured)) errs.push("모든 적이 치료되었는데 전투가 끝나지 않았다");
    if (!state.pending && c.queue.length > 0) errs.push(`대기 선택 없이 큐가 남았다: ${c.queue.length}`);
    if (!state.pending && c.limbo.length > 0) errs.push(`처리 중 카드가 남았다: ${c.limbo.length}`);
    for (const e of c.enemies) {
      if (!e.hypotheses.includes(e.diseaseId)) errs.push(`실제 질병이 감별 목록에 없다: ${e.uid}`);
      if (e.workingDx && !e.hypotheses.includes(e.workingDx)) errs.push(`작업 진단이 감별 목록 밖: ${e.uid}`);
    }
    if (state.pending?.kind === "choose_option" && !state.pending.options.some((o) => o.available) && !state.pending.canSkip)
      errs.push("고를 수 있는 선택지가 없는 결정이 열려 있다");
  }
  return errs;
}
