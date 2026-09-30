// 결정 지표(텔레메트리). 승률만이 아니라 "결정이 생기는가"를 잰다.
// 모든 판정은 플레이어 정보(EnemyView, 교과서)로 한다. 진실을 쓰는 지표(작업 진단 정확도)는 전투가 끝난 뒤 통계에서만 읽는다.
import { cardDef, cardTextbook, contextRelevance, isPlayable, isTreatmentCard, legalActions, newRun, step, visibleEnemyInfo } from "../core";
import type { Action, GameEvent, GameState } from "../core";

export interface RunMetrics {
  seed: string;
  won: boolean;
  act: number;
  floors: number;
  deathCause?: string;
  combats: number;
  combatLoss: { act: number; kind: string; loss: number; turns: number }[];
  handSnapshots: number;
  unusableCards: number;
  handCards: number;
  treatmentDraws: number;
  deadTreatmentDraws: number;
  rewardScreens: number;
  meaningfulOptions: number;
  rewardOptions: number;
  gainedDeck: Record<string, number>;
  playedIds: Set<string>;
  gainedFormulary: string[];
  usedFormulary: Set<string>;
  decisionPoints: number;
  plausibleSum: number;
  choicePoints: number;
  choiceOptionsSum: number;
  stats: GameState["run"]["stats"];
}

/** 치료 카드가 지금 감별 목록의 어떤 가설에도 듣지 않는가 (플레이어 정보) */
export function treatmentDead(state: GameState, cardId: string): boolean {
  const c = state.combat;
  if (!c) return false;
  const def = cardDef(cardId);
  if (!isTreatmentCard(def)) return false;
  for (const e of c.enemies) {
    if (e.cured) continue;
    const v = visibleEnemyInfo(state, e.uid)!;
    for (const h of v.hypotheses) {
      if (h.level === "excluded") continue;
      const tb = cardTextbook(h.diseaseId, def);
      if (tb.generic || tb.classes.includes("good") || tb.classes.includes("partial")) return false;
    }
  }
  // 부작용 관리 약(정리 효과)은 관리할 부작용이 있으면 쓸모가 있다
  if (def.effects.some((o) => o.op === "exhaust_cards")) return !c.hand.some((h) => cardDef(h.cardId).kind === "side_effect");
  return true;
}

function plausibleActions(state: GameState): number {
  const acts = legalActions(state);
  const seen = new Set<string>();
  for (const a of acts) {
    if (a.type === "play_card") {
      const ci = state.combat!.hand.find((h) => h.uid === a.cardUid)!;
      if (treatmentDead(state, ci.cardId)) continue;
      seen.add(`p:${ci.cardId}`);
    } else if (a.type === "commit_diagnosis") seen.add(`c:${a.targetUid}:${a.diseaseId}`);
    else if (a.type === "return_card") seen.add("r");
  }
  return seen.size;
}

export function runWithMetrics(seed: string, choose: (s: GameState) => Action, maxSteps = 8000): RunMetrics {
  let s = newRun(seed);
  const m: RunMetrics = {
    seed,
    won: false,
    act: 1,
    floors: 0,
    combats: 0,
    combatLoss: [],
    handSnapshots: 0,
    unusableCards: 0,
    handCards: 0,
    treatmentDraws: 0,
    deadTreatmentDraws: 0,
    rewardScreens: 0,
    meaningfulOptions: 0,
    rewardOptions: 0,
    gainedDeck: {},
    playedIds: new Set(),
    gainedFormulary: [],
    usedFormulary: new Set(),
    decisionPoints: 0,
    plausibleSum: 0,
    choicePoints: 0,
    choiceOptionsSum: 0,
    stats: s.run.stats,
  };
  let lastTurn = -1;
  let combatStartVit = 0;
  let combatAct = 1;
  let combatKind = "";
  let lastRewardKey = "";
  for (let k = 0; k < maxSteps && s.phase !== "gameover" && s.phase !== "victory"; k++) {
    // 턴 시작 손패 스냅숏
    if (s.phase === "combat" && s.combat && !s.pending) {
      if (s.combat.turn !== lastTurn) {
        if (lastTurn === -1 || s.combat.turn === 1) {
          combatStartVit = s.run.vitality;
          combatAct = s.run.act;
          combatKind = s.combat.kind;
        }
        lastTurn = s.combat.turn;
        m.handSnapshots += 1;
        for (const ci of s.combat.hand) {
          m.handCards += 1;
          if (!isPlayable(s, ci.uid) || treatmentDead(s, ci.cardId)) m.unusableCards += 1;
        }
        m.decisionPoints += 1;
        m.plausibleSum += plausibleActions(s);
      }
    }
    if (s.pending?.kind === "choose_option") {
      m.choicePoints += 1;
      m.choiceOptionsSum += s.pending.options.filter((o) => o.available).length;
    }
    if (s.phase === "reward" && s.reward) {
      const key = `${s.run.act}:${s.run.floor}:${s.run.stats.combatsWon}`;
      if (key !== lastRewardKey) {
        lastRewardKey = key;
        for (const it of s.reward.items) {
          if (it.kind !== "card") continue;
          m.rewardScreens += 1;
          for (const o of it.options) {
            m.rewardOptions += 1;
            const def = cardDef(o.cardId);
            const meaningful = def.zone !== "formulary" || contextRelevance(s, o.cardId, [s.run.act]) > 0;
            if (meaningful) m.meaningfulOptions += 1;
          }
        }
      }
    }
    const a = choose(s);
    const before = s;
    const r = step(s, a);
    s = r.state;
    observeEvents(m, before, s, r.events);
    if (before.phase === "combat" && s.phase !== "combat") {
      m.combats += 1;
      m.combatLoss.push({ act: combatAct, kind: combatKind, loss: combatStartVit - s.run.vitality, turns: before.combat?.turn ?? 0 });
      lastTurn = -1;
    }
    if (s.phase === "combat" && before.phase !== "combat") lastTurn = -1;
  }
  m.won = s.phase === "victory";
  m.act = s.run.act;
  m.floors = s.run.stats.floorsClimbed;
  m.deathCause = s.run.stats.deathCause;
  m.stats = s.run.stats;
  return m;
}

function observeEvents(m: RunMetrics, before: GameState, after: GameState, events: GameEvent[]): void {
  for (const ev of events) {
    if (ev.type === "card_played") {
      m.playedIds.add(ev.cardId);
      if (cardDef(ev.cardId).zone === "formulary") m.usedFormulary.add(ev.cardId);
    }
    if (ev.type === "card_gained") {
      if (ev.zone === "formulary") m.gainedFormulary.push(ev.cardId);
      else m.gainedDeck[ev.cardId] = (m.gainedDeck[ev.cardId] ?? 0) + 1;
    }
    if (ev.type === "card_drawn" && after.combat) {
      const def = cardDef(ev.cardId);
      if (isTreatmentCard(def)) {
        m.treatmentDraws += 1;
        if (treatmentDead(after, ev.cardId)) m.deadTreatmentDraws += 1;
      }
    }
  }
  void before;
}

export interface Aggregate {
  n: number;
  winRate: number;
  actReach: Record<number, number>;
  avgFloors: number;
  deaths: Record<string, number>;
  combatLossByAct: Record<string, { mean: number; n: number; turns: number }>;
  unusableHandPct: number;
  deadTreatmentDrawPct: number;
  meaningfulPerReward: number;
  rewardMeaningfulPct: number;
  unusedDeckCardPct: number;
  unusedFormularyPct: number;
  modalPerCombat: number;
  optionDistribution: [string, number][];
  commitAccuracy: number;
  finalDxAccuracy: number;
  turnsBeforeCommit: number;
  commitsPerCombat: number;
  empiricPct: number;
  abxUses: number;
  revisionsPerCombat: number;
  deescalationsPerCombat: number;
  returnsPerCombat: number;
  noResponsePerCombat: number;
  findingsPerCombat: number;
  plausiblePerTurn: number;
  optionsPerChoice: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export function aggregate(runs: RunMetrics[]): Aggregate {
  const sum = (f: (r: RunMetrics) => number) => runs.reduce((a, r) => a + f(r), 0);
  const combats = sum((r) => r.combats);
  const actReach: Record<number, number> = {};
  const deaths: Record<string, number> = {};
  for (const r of runs) {
    actReach[r.act] = (actReach[r.act] ?? 0) + 1;
    if (!r.won) deaths[r.deathCause ?? "?"] = (deaths[r.deathCause ?? "?"] ?? 0) + 1;
  }
  const byAct: Record<string, number[]> = {};
  const turnsByAct: Record<string, number[]> = {};
  for (const r of runs)
    for (const cl of r.combatLoss) {
      const key = `${cl.act}막 ${cl.kind}`;
      (byAct[key] ??= []).push(cl.loss);
      (turnsByAct[key] ??= []).push(cl.turns);
    }
  const combatLossByAct: Aggregate["combatLossByAct"] = {};
  for (const [k, xs] of Object.entries(byAct)) combatLossByAct[k] = { mean: mean(xs), n: xs.length, turns: mean(turnsByAct[k]!) };
  const opt: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.stats.optionPicks)) opt[k] = (opt[k] ?? 0) + v;
  let gained = 0;
  let unused = 0;
  for (const r of runs)
    for (const [id, n] of Object.entries(r.gainedDeck)) {
      gained += n;
      if (!r.playedIds.has(id)) unused += n;
    }
  let fGained = 0;
  let fUnused = 0;
  for (const r of runs)
    for (const id of r.gainedFormulary) {
      fGained += 1;
      if (!r.usedFormulary.has(id)) fUnused += 1;
    }
  const st = (f: (s: RunMetrics["stats"]) => number) => sum((r) => f(r.stats));
  const abx = st((s) => s.abxEmpiric + s.abxTargeted);
  return {
    n: runs.length,
    winRate: sum((r) => (r.won ? 1 : 0)) / Math.max(1, runs.length),
    actReach,
    avgFloors: sum((r) => r.floors) / Math.max(1, runs.length),
    deaths,
    combatLossByAct,
    unusableHandPct: sum((r) => r.unusableCards) / Math.max(1, sum((r) => r.handCards)),
    deadTreatmentDrawPct: sum((r) => r.deadTreatmentDraws) / Math.max(1, sum((r) => r.treatmentDraws)),
    meaningfulPerReward: sum((r) => r.meaningfulOptions) / Math.max(1, sum((r) => r.rewardScreens)),
    rewardMeaningfulPct: sum((r) => r.meaningfulOptions) / Math.max(1, sum((r) => r.rewardOptions)),
    unusedDeckCardPct: unused / Math.max(1, gained),
    unusedFormularyPct: fUnused / Math.max(1, fGained),
    modalPerCombat: st((s) => s.modalDecisions) / Math.max(1, combats),
    optionDistribution: Object.entries(opt).sort((a, b) => b[1] - a[1]),
    commitAccuracy: st((s) => s.commitsCorrect) / Math.max(1, st((s) => s.commits)),
    finalDxAccuracy: st((s) => s.finalDxCorrect) / Math.max(1, st((s) => s.finalDx)),
    turnsBeforeCommit: st((s) => s.commitTurnSum) / Math.max(1, st((s) => s.commits)),
    commitsPerCombat: st((s) => s.commits) / Math.max(1, combats),
    empiricPct: st((s) => s.abxEmpiric) / Math.max(1, abx),
    abxUses: abx,
    revisionsPerCombat: st((s) => s.revisions) / Math.max(1, combats),
    deescalationsPerCombat: st((s) => s.deescalations) / Math.max(1, combats),
    returnsPerCombat: st((s) => s.returns) / Math.max(1, combats),
    noResponsePerCombat: st((s) => s.noResponse) / Math.max(1, combats),
    findingsPerCombat: st((s) => s.findingsRevealed) / Math.max(1, combats),
    plausiblePerTurn: sum((r) => r.plausibleSum) / Math.max(1, sum((r) => r.decisionPoints)),
    optionsPerChoice: sum((r) => r.choiceOptionsSum) / Math.max(1, sum((r) => r.choicePoints)),
  };
}

export function formatAggregate(a: Aggregate, top = 25): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`런 ${a.n}회 · 승률 ${pct(a.winRate)} · 평균 도달 층 ${a.avgFloors.toFixed(1)} · 도달 막 ${JSON.stringify(a.actReach)}`);
  lines.push(`사망 원인: ${Object.entries(a.deaths).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  lines.push("전투당 활력 손실:");
  for (const [k, v] of Object.entries(a.combatLossByAct).sort()) lines.push(`  ${k.padEnd(12)} ${v.mean.toFixed(1).padStart(5)} (n=${v.n}, 평균 ${v.turns.toFixed(1)}턴)`);
  lines.push("── 결정 지표 ──");
  lines.push(`턴 시작 손패 중 쓸 수 없는 카드 비율      ${pct(a.unusableHandPct)}`);
  lines.push(`치료 카드 드로우 중 적응증 없는 비율      ${pct(a.deadTreatmentDrawPct)}`);
  lines.push(`보상 화면당 의미 있는 선택지 수          ${a.meaningfulPerReward.toFixed(2)} (${pct(a.rewardMeaningfulPct)})`);
  lines.push(`얻고 한 번도 쓰지 않은 덱 카드 비율       ${pct(a.unusedDeckCardPct)}`);
  lines.push(`얻고 한 번도 쓰지 않은 처방집 항목 비율   ${pct(a.unusedFormularyPct)}`);
  lines.push(`전투당 임상 결정(선택지) 수             ${a.modalPerCombat.toFixed(1)}`);
  lines.push(`결정 한 번에 고를 수 있는 선택지 평균     ${a.optionsPerChoice.toFixed(2)}`);
  lines.push(`턴당 그럴듯한 행동 수                   ${a.plausiblePerTurn.toFixed(2)}`);
  lines.push(`전투당 얻은 소견                        ${a.findingsPerCombat.toFixed(1)}`);
  lines.push(`첫 작업 진단 정확도                     ${pct(a.commitAccuracy)} (전투당 ${a.commitsPerCombat.toFixed(2)}회, 평균 ${a.turnsBeforeCommit.toFixed(2)}턴째)`);
  lines.push(`전투 종료 시 작업 진단 정확도            ${pct(a.finalDxAccuracy)}`);
  lines.push(`작업 진단 변경 / 전투                   ${a.revisionsPerCombat.toFixed(2)}`);
  lines.push(`항생제: 경험적 ${pct(a.empiricPct)} / 표적 ${pct(1 - a.empiricPct)} (투여 ${a.abxUses})`);
  lines.push(`범위 축소 / 전투                        ${a.deescalationsPerCombat.toFixed(2)}`);
  lines.push(`처방 반납 / 전투                        ${a.returnsPerCombat.toFixed(2)}`);
  lines.push(`기대 반응 없음(치료 실패 소견) / 전투     ${a.noResponsePerCombat.toFixed(2)}`);
  lines.push(`선택지 분포 (상위 ${top}):`);
  for (const [k, v] of a.optionDistribution.slice(0, top)) lines.push(`  ${k.padEnd(34)} ${v}`);
  return lines.join("\n");
}
