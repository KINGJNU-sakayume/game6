// 화면용 정보. UI는 원본 적 상태 대신 EnemyView를 쓴다 (design.md §3.3, R6)
import { cardDef, categoryName, db, diseaseDef, organismDef, statusDef, tagDef } from "./registry";
import {
  currentEffectiveness,
  currentOrganism,
  currentTraits,
  findMove,
  phaseDef,
  variantDef,
  variantDependentOrganism,
  variantDependentTags,
} from "./disease";
import { calcPlayerDamage, gradeFor, resistanceStacksFor } from "./damage";
import { intentParts } from "./enemy-ai";
import { costOf } from "./cards";
import { canPlay } from "./combat";
import { findEnemy, statusStacks } from "./util";
import type { ArtRegion, DamagePreview, DiseaseCategory, EffectCtx, EnemyState, GameState, Grade, IntentPart, Tag, Uid } from "./types";

export interface IntentView {
  parts: IntentPart[];
  moveName?: string;
}

export interface TableRow {
  tag: Tag;
  label: string;
  grade: Grade | "?";
}

export interface AbxCell {
  cardId: string;
  short: string;
  grade: Grade | "?";
}

export interface EnemyView {
  uid: Uid;
  diseaseId?: string;           // 확진 후에만
  tier: "normal" | "elite" | "gate" | "boss";
  knowledge: 0 | 1 | 2;
  title: string;                // 주호소 또는 질병명
  nameEn?: string;
  complaint: string;
  clues: string[];
  category?: { id: DiseaseCategory; nameKo: string };
  severity: number;
  maxSeverity: number;
  stability: number;
  statuses: { id: string; nameKo: string; stacks: number; description: string; debuff: boolean }[];
  diagnosisPoints: number;
  partialAt: number;
  confirmAt: number;
  intents: IntentView[];
  countdowns: { turnsLeft: number; label: string }[];
  resistance: { tag: Tag; nameKo: string; stacks: number }[];
  table?: TableRow[];
  abx?: { organism?: string; cells?: AbxCell[]; hidden: boolean; notInfection: boolean };
  variantName?: string;
  passives?: string[];
  phaseName?: string;
  art: { region: ArtRegion; lesion: [number, number, number] };
  cured: boolean;
  revealNext: boolean;
}

const ABX_SHORT: [string, string][] = [
  ["ceftriaxone", "CRO"],
  ["pip_tazo", "TZP"],
  ["meropenem", "MEM"],
  ["vancomycin", "VAN"],
  ["gentamicin", "GEN"],
  ["levofloxacin", "LVX"],
  ["clarithromycin", "CLR"],
  ["metronidazole", "MTZ"],
];

const GRADE_ORDER: Record<Grade, number> = { key: 0, weak: 1, harmful: 2, normal: 3, resistant: 4, immune: 5 };

function therapeuticRows(enemy: EnemyState, knowledge: 0 | 1 | 2): TableRow[] {
  const def = diseaseDef(enemy.diseaseId);
  const M = currentEffectiveness(enemy);
  const vd = variantDependentTags(def);
  const traits = currentTraits(enemy);
  const rows: TableRow[] = [];
  const seen = new Set<Tag>();
  for (const [tag, g] of Object.entries(M)) {
    if (!g || tag === "abx") continue;
    const td = tagDef(tag);
    if (!td) continue;
    seen.add(tag);
    rows.push({ tag, label: td.nameKo, grade: vd.has(tag) && knowledge < 2 ? "?" : g });
  }
  for (const td of db().tags) {
    if (td.kind !== "therapeutic" || seen.has(td.id) || !td.indications) continue;
    const ok =
      td.indications.categories?.includes(def.category) || (td.indications.traits ?? []).some((t) => traits.includes(t));
    if (ok) rows.push({ tag: td.id, label: td.nameKo, grade: "normal" });
  }
  rows.sort((a, b) => (a.grade === "?" ? 9 : GRADE_ORDER[a.grade]) - (b.grade === "?" ? 9 : GRADE_ORDER[b.grade]));
  return rows;
}

export function visibleEnemyInfo(state: GameState, uid: Uid): EnemyView | undefined {
  const c = state.combat;
  const enemy = c ? findEnemy(c, uid) : undefined;
  if (!enemy) return undefined;
  const def = diseaseDef(enemy.diseaseId);
  const k = enemy.knowledge;
  const intents: IntentView[] = [];
  const shownIntents = k >= 2 || enemy.revealNext ? 2 : 1;
  for (const p of enemy.ai.planned.slice(0, shownIntents)) {
    intents.push({ parts: intentParts(state, enemy, p), moveName: k >= 1 ? findMove(enemy, p.moveId).nameKo : undefined });
  }
  const view: EnemyView = {
    uid: enemy.uid,
    tier: def.tier,
    knowledge: k,
    title: k >= 2 ? def.nameKo : def.presentation.complaint,
    complaint: def.presentation.complaint,
    clues: k >= 1 ? def.presentation.clues : def.presentation.clues.slice(0, 1),
    severity: enemy.severity,
    maxSeverity: enemy.maxSeverity,
    stability: enemy.stability,
    statuses: enemy.statuses.map((s) => {
      const sd = statusDef(s.id);
      return { id: s.id, nameKo: sd.nameKo, stacks: s.stacks, description: sd.description, debuff: sd.debuff };
    }),
    diagnosisPoints: enemy.diagnosisPoints,
    partialAt: def.diagnosis.partialAt,
    confirmAt: def.diagnosis.confirmAt,
    intents,
    countdowns: enemy.countdowns.map((cd) => ({ turnsLeft: cd.turnsLeft, label: k >= 1 ? findMove(enemy, cd.moveId).nameKo : "?" })),
    resistance: Object.entries(enemy.acquiredResistance)
      .filter(([, n]) => n > 0)
      .map(([tag, n]) => ({ tag, nameKo: tagDef(tag)?.nameKo ?? tag, stacks: n })),
    art: def.art,
    cured: enemy.cured,
    revealNext: enemy.revealNext,
  };
  if (k >= 1) {
    view.category = { id: def.category, nameKo: categoryName(def.category) };
    view.table = therapeuticRows(enemy, k);
    const organism = currentOrganism(enemy);
    const hidden = variantDependentOrganism(def) && k < 2;
    const M = currentEffectiveness(enemy);
    if (!organism && M["abx"] === undefined) view.abx = { hidden: false, notInfection: true };
    else if (hidden) view.abx = { hidden: true, notInfection: false };
    else {
      const cells: AbxCell[] = ABX_SHORT.map(([id, short]) => {
        const sp = cardDef(id).drug?.spectrum;
        const g = M["abx"] ?? (organism ? sp?.[organism] ?? "immune" : "immune");
        return { cardId: id, short, grade: g };
      });
      view.abx = { hidden: false, notInfection: false, cells, organism: organism ? organismDef(organism)?.nameKo : undefined };
    }
    const ph = phaseDef(enemy);
    if (ph) view.phaseName = ph.nameKo;
  }
  if (k >= 2) {
    view.diseaseId = def.id;
    view.nameEn = def.nameEn;
    const v = variantDef(enemy);
    if (v) view.variantName = v.nameKo;
    view.passives = def.passiveText ?? [];
  }
  return view;
}

function firstDamage(state: GameState, cardUid: Uid) {
  const c = state.combat!;
  const ci = c.hand.find((x) => x.uid === cardUid);
  if (!ci) return undefined;
  const def = cardDef(ci.cardId, ci.upgraded);
  const op = def.effects.find((e) => e.op === "damage") as Extract<(typeof def.effects)[number], { op: "damage" }> | undefined;
  return op ? { ci, def, op } : undefined;
}

/** 대상 위로 카드를 가져갔을 때의 예상 중증도 감소. 알 수 없는 배율은 숨긴다. */
export function previewDamage(state: GameState, cardUid: Uid, targetUid: Uid): DamagePreview | undefined {
  const c = state.combat;
  if (!c) return undefined;
  const enemy = findEnemy(c, targetUid);
  const found = firstDamage(state, cardUid);
  if (!enemy || !found) return undefined;
  const { ci, def, op } = found;
  const ctx: EffectCtx = { owner: { kind: "card", id: ci.uid, cardId: def.id }, targetUid, cardTags: def.tags };
  const tags = op.tags ?? def.tags;
  const base = typeof op.amount === "number" ? op.amount : 0;
  const calc = calcPlayerDamage(state, ctx, enemy, base, tags, op.mods);
  const g = calc.grade;
  const known = g.basis === "generic" || (enemy.knowledge >= 1 && (!g.dependsOnVariant || enemy.knowledge >= 2));
  const hits = op.hits ?? 1;
  if (!known) {
    // 등급을 모르면 등급 배율을 뺀 값으로 보여 준다
    const mults = calc.mults.slice(1);
    let p = 100;
    for (const m of mults) p = Math.floor((p * m) / 100);
    return { amount: Math.floor((calc.d1 * p) / 100) * hits, known: false };
  }
  if (g.harmful) return { amount: 0, known: true, grade: "harmful", harmful: true };
  const grade: DamagePreview["grade"] = g.grade === "not_indicated" ? "not_indicated" : g.grade;
  return { amount: calc.final * hits, known: true, grade };
}

export function cardCost(state: GameState, cardUid: Uid): number | null {
  const c = state.combat;
  const ci = c?.hand.find((x) => x.uid === cardUid);
  return ci ? costOf(state, ci) : null;
}

export function isPlayable(state: GameState, cardUid: Uid): boolean {
  const c = state.combat;
  const ci = c?.hand.find((x) => x.uid === cardUid);
  if (!c || !ci) return false;
  const def = cardDef(ci.cardId, ci.upgraded);
  if (def.target === "enemy" && def.cost !== "unplayable") {
    return c.enemies.some((e) => !e.cured && canPlay(state, cardUid, e.uid).ok);
  }
  return canPlay(state, cardUid).ok;
}

export function patientStatusViews(state: GameState) {
  const c = state.combat;
  if (!c) return [];
  return c.patientStatuses.map((s) => {
    const sd = statusDef(s.id);
    return { id: s.id, nameKo: sd.nameKo, stacks: s.stacks, description: sd.description, debuff: sd.debuff };
  });
}

export function gradeLabel(g: Grade | "generic" | "not_indicated" | "?"): string {
  switch (g) {
    case "key":
      return "특효";
    case "weak":
      return "우수";
    case "normal":
      return "보통";
    case "resistant":
      return "저하";
    case "immune":
      return "무효";
    case "harmful":
      return "금기";
    case "generic":
      return "보존적";
    case "not_indicated":
      return "적응증 아님";
    case "?":
      return "?";
  }
}

export { gradeFor, resistanceStacksFor, statusStacks };
