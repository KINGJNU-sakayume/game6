// 치료 등급 판정과 "교과서" 조회.
// gradeFor는 실제 질병 상태(변이·단계)로 물리를 계산한다.
// textbook* 함수는 질병 ID만 받아 모든 변이·단계를 합쳐 본다. 플레이어가 아는 것은 이쪽이다.
import { cardDef, db, diseaseDef, tagDef } from "./registry";
import { currentEffectiveness, currentOrganism, currentTraits, variantDependentOrganism, variantDependentTags } from "./disease";
import type { CardDef, ContentDB, DiseaseDef, DiseaseId, EnemyState, Grade, OrganismId, ResponseClass, Tag, Trait } from "./types";

export const GRADE_PCT: Record<Exclude<Grade, "harmful">, number> = {
  key: 200,
  weak: 150,
  normal: 100,
  resistant: 50,
  immune: 0,
};

const GRADE_RANK: Record<Exclude<Grade, "harmful">, number> = { key: 4, weak: 3, normal: 2, resistant: 1, immune: 0 };

export type GradeBasis = "generic" | "graded" | "not_indicated";

export interface GradeResult {
  harmful: boolean;
  pct: number; // e (0..200)
  grade: Grade | "generic" | "not_indicated";
  basis: GradeBasis;
  /** 이 판정이 변이(원인균)에 달려 있는가 */
  dependsOnVariant: boolean;
}

function indicated(enemy: EnemyState, tag: Tag): boolean {
  const td = tagDef(tag);
  if (!td?.indications) return false;
  const def = diseaseDef(enemy.diseaseId);
  if (td.indications.categories?.includes(def.category)) return true;
  const traits = currentTraits(enemy);
  return (td.indications.traits ?? []).some((t) => traits.includes(t));
}

/**
 * 카드 태그·스펙트럼으로 대상 질병에 대한 치료 등급을 구한다 (design §4.4).
 * - 금기 항목이 하나라도 맞으면 harmful
 * - 치료 근거(치료 태그, 항생제 스펙트럼)가 있으면 그중 가장 좋은 등급
 * - 치료 근거가 모두 "해당 없음"이면 0 (적응증 아님)
 * - 치료 태그도 스펙트럼도 없으면 범용 처치 100
 */
export function gradeFor(enemy: EnemyState, tags: Tag[], spectrum?: Partial<Record<OrganismId, Grade>>): GradeResult {
  const def = diseaseDef(enemy.diseaseId);
  const M = currentEffectiveness(enemy);
  const vdTags = variantDependentTags(def);
  let dependsOnVariant = false;

  for (const t of tags) {
    if (M[t] === "harmful") {
      if (vdTags.has(t)) dependsOnVariant = true;
      return { harmful: true, pct: 0, grade: "harmful", basis: "graded", dependsOnVariant };
    }
  }
  const organism = currentOrganism(enemy);
  if (spectrum && organism && M["abx"] === undefined) {
    if (spectrum[organism] === "harmful") {
      return { harmful: true, pct: 0, grade: "harmful", basis: "graded", dependsOnVariant: variantDependentOrganism(def) };
    }
  }

  const grades: Exclude<Grade, "harmful">[] = [];
  let hasTherapeutic = false;
  for (const t of tags) {
    const td = tagDef(t);
    if (td?.kind !== "therapeutic") continue;
    hasTherapeutic = true;
    const g = M[t];
    if (g !== undefined && g !== "harmful") {
      grades.push(g);
      if (vdTags.has(t)) dependsOnVariant = true;
    } else if (indicated(enemy, t)) grades.push("normal");
  }
  if (spectrum) {
    hasTherapeutic = true;
    const explicit = M["abx"];
    if (explicit !== undefined && explicit !== "harmful") {
      grades.push(explicit);
      if (vdTags.has("abx")) dependsOnVariant = true;
    } else if (organism) {
      grades.push((spectrum[organism] as Exclude<Grade, "harmful"> | undefined) ?? "immune");
      if (variantDependentOrganism(def)) dependsOnVariant = true;
    }
  }

  let e: number;
  let grade: GradeResult["grade"];
  let basis: GradeBasis;
  if (!hasTherapeutic) {
    e = 100;
    grade = "generic";
    basis = "generic";
  } else if (grades.length === 0) {
    e = 0;
    grade = "not_indicated";
    basis = "not_indicated";
  } else {
    let best = grades[0]!;
    for (const g of grades) if (GRADE_RANK[g] > GRADE_RANK[best]) best = g;
    e = GRADE_PCT[best];
    grade = best;
    basis = "graded";
  }

  for (const t of tags) {
    const td = tagDef(t);
    if (!td || td.kind === "therapeutic") continue;
    const g = M[t];
    if (g !== undefined && g !== "harmful") {
      e = Math.floor((e * GRADE_PCT[g]) / 100);
      if (vdTags.has(t)) dependsOnVariant = true;
    }
  }
  e = Math.min(200, e);
  return { harmful: false, pct: e, grade, basis, dependsOnVariant };
}

/** 등급 → 반응 분류 */
export function responseClass(g: GradeResult): ResponseClass | null {
  if (g.basis === "generic") return null;
  if (g.harmful) return "worse";
  if (g.pct >= 150) return "good";
  if (g.pct > 0) return "partial";
  return "none";
}

/** 검증·교과서 조회용 가짜 적. 엔진 진실이 아니라 "이 질병이라면"을 계산할 때만 쓴다. */
export function hypotheticalEnemy(diseaseId: DiseaseId, variantId?: string, phase = 0): EnemyState {
  const e: EnemyState = {
    uid: "hypo",
    diseaseId,
    presentationId: "",
    hypotheses: [diseaseId],
    observations: [],
    organismKnown: false,
    severity: 1,
    maxSeverity: 1,
    stability: 0,
    statuses: [],
    knowledge: 0,
    acquiredResistance: {},
    resistanceFraction: 0,
    phase,
    ai: { history: [], planned: [], planIndex: 0, usedOnce: [] },
    countdowns: [],
    revealNext: false,
    planBonus: 0,
    definitiveUsed: [],
    cured: false,
  };
  if (variantId) e.variantId = variantId;
  return e;
}

function variantIds(def: DiseaseDef): (string | undefined)[] {
  return def.variants?.length ? def.variants.map((v) => v.id) : [undefined];
}

export interface TextbookEntry {
  /** 가능한 반응 분류 (변이·단계별로 다르면 여럿) */
  classes: ResponseClass[];
  /** 가장 좋은 경우의 등급 */
  best: Grade | "generic" | "not_indicated";
  /** 가장 나쁜 경우의 등급 */
  worst: Grade | "generic" | "not_indicated";
  harmful: boolean;
  /** 변이(원인균)에 따라 달라진다 */
  varies: boolean;
  generic: boolean;
}

const cache = new WeakMap<ContentDB, Map<string, TextbookEntry>>();

const ORDER: Record<string, number> = { harmful: -1, not_indicated: 0, immune: 0, resistant: 1, normal: 2, weak: 3, key: 4, generic: 2 };

/**
 * 교과서 반응: 이 태그·스펙트럼의 치료가 "이 질병이라면" 어떻게 듣는가.
 * 모든 변이, 기본 단계만 본다(단계는 경과 중에 바뀌므로 첫 판단 기준으로 쓴다).
 * includePhases가 참이면 모든 단계를 합친다(근거 판정용).
 */
export function textbook(diseaseId: DiseaseId, tags: Tag[], spectrum?: Partial<Record<OrganismId, Grade>>, includePhases = false, variant?: string): TextbookEntry {
  const d = db();
  let m = cache.get(d);
  if (!m) {
    m = new Map();
    cache.set(d, m);
  }
  const key = `${diseaseId}|${tags.join(",")}|${spectrum ? JSON.stringify(spectrum) : ""}|${includePhases ? 1 : 0}|${variant ?? ""}`;
  const hit = m.get(key);
  if (hit) return hit;
  const def = diseaseDef(diseaseId);
  const phases = includePhases ? [0, ...(def.phases ?? []).map((_, i) => i + 1)] : [0];
  const classes = new Set<ResponseClass>();
  let best: TextbookEntry["best"] | undefined;
  let worst: TextbookEntry["worst"] | undefined;
  let harmful = false;
  let generic = false;
  const vids = variant ? [variant] : variantIds(def);
  for (const v of vids) {
    for (const ph of phases) {
      const g = gradeFor(hypotheticalEnemy(diseaseId, v, ph), tags, spectrum);
      if (g.basis === "generic") generic = true;
      if (g.harmful) harmful = true;
      const cls = responseClass(g);
      if (cls) classes.add(cls);
      if (best === undefined || (ORDER[g.grade] ?? 0) > (ORDER[best] ?? 0)) best = g.grade;
      if (worst === undefined || (ORDER[g.grade] ?? 0) < (ORDER[worst] ?? 0)) worst = g.grade;
    }
  }
  const entry: TextbookEntry = { classes: [...classes], best: best ?? "not_indicated", worst: worst ?? "not_indicated", harmful, varies: classes.size > 1, generic };
  m.set(key, entry);
  return entry;
}

export function cardTextbook(diseaseId: DiseaseId, card: CardDef, includePhases = false, variant?: string): TextbookEntry {
  return textbook(diseaseId, card.tags, card.drug?.spectrum, includePhases, variant);
}

/** 모든 단계의 특성을 합친 것 (가설 조건 판정용) */
export function allTraits(def: DiseaseDef): Trait[] {
  const set = new Set(def.traits);
  for (const ph of def.phases ?? []) for (const t of ph.traitsAdd ?? []) set.add(t);
  return [...set];
}

/** 이 질병에서 1차(특효·우수) 치료로 쓰는 치료 태그 이름과 금기 이름. 교과서 요약 */
export function textbookSummary(diseaseId: DiseaseId): { firstLine: string[]; avoid: string[]; abx: "none" | "organism" | "no_abx" } {
  const def = diseaseDef(diseaseId);
  const firstLine: string[] = [];
  const avoid: string[] = [];
  for (const [t, g] of Object.entries(def.effectiveness)) {
    const td = tagDef(t);
    if (!td) continue;
    if (g === "key" || g === "weak") firstLine.push(td.nameKo);
    if (g === "harmful") avoid.push(td.nameKo);
  }
  for (const v of def.variants ?? []) {
    for (const [t, g] of Object.entries(v.effectivenessOverride ?? {})) {
      const td = tagDef(t);
      if (td && g === "harmful" && !avoid.includes(td.nameKo)) avoid.push(`${td.nameKo}(${v.nameKo})`);
    }
  }
  const organisms = def.organism || (def.variants ?? []).some((v) => v.organism);
  const abx = organisms ? (def.organism === "virus" ? "no_abx" : "organism") : "none";
  if (abx === "organism") firstLine.push("항생제(원인균에 맞게)");
  return { firstLine, avoid, abx };
}

/** 이 질병의 원인균 후보 (변이 포함) */
export function organismsOf(diseaseId: DiseaseId): OrganismId[] {
  const def = diseaseDef(diseaseId);
  const out: OrganismId[] = [];
  if (def.organism) out.push(def.organism);
  for (const v of def.variants ?? []) if (v.organism && !out.includes(v.organism)) out.push(v.organism);
  return out;
}

export function isTreatmentCard(def: CardDef): boolean {
  if (def.kind === "drug") return true;
  if (def.kind !== "procedure") return false;
  if (def.zone === "formulary") return true;
  return def.tags.some((t) => tagDef(t)?.kind === "therapeutic");
}

export { cardDef };
