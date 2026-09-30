// 콘텐츠 주입과 조회. core는 content를 import하지 않는다 (design.md §3.2, R33).
import type {
  CardDef,
  CardId,
  ChannelDef,
  ConsultDef,
  ContentDB,
  DiseaseDef,
  DiseaseId,
  EncounterDef,
  EventDef,
  FindingDef,
  InteractionRule,
  KeywordDef,
  OrganismDef,
  PresentationDef,
  QuizQuestion,
  RelicDef,
  RelicId,
  StatusDef,
  StatusId,
  Tag,
  TagDef,
  TraitDef,
} from "./types";

interface Indexed {
  db: ContentDB;
  cards: Map<CardId, CardDef>;
  upgraded: Map<CardId, CardDef>;
  diseases: Map<DiseaseId, DiseaseDef>;
  statuses: Map<StatusId, StatusDef>;
  relics: Map<RelicId, RelicDef>;
  tags: Map<Tag, TagDef>;
  traits: Map<string, TraitDef>;
  organisms: Map<string, OrganismDef>;
  encounters: Map<string, EncounterDef>;
  events: Map<string, EventDef>;
  keywords: Map<string, KeywordDef>;
  quiz: Map<string, QuizQuestion>;
  channels: Map<string, ChannelDef>;
  findings: Map<string, FindingDef>;
  presentations: Map<string, PresentationDef>;
  consults: Map<string, ConsultDef>;
}

let current: Indexed | null = null;

export function installContent(db: ContentDB): void {
  const cards = new Map(db.cards.map((c) => [c.id, c] as const));
  const upgraded = new Map<CardId, CardDef>();
  for (const c of db.cards) upgraded.set(c.id, applyUpgrade(c));
  current = {
    db,
    cards,
    upgraded,
    diseases: new Map(db.diseases.map((d) => [d.id, d] as const)),
    statuses: new Map(db.statuses.map((s) => [s.id, s] as const)),
    relics: new Map(db.relics.map((r) => [r.id, r] as const)),
    tags: new Map(db.tags.map((t) => [t.id, t] as const)),
    traits: new Map(db.traits.map((t) => [t.id, t] as const)),
    organisms: new Map(db.organisms.map((o) => [o.id, o] as const)),
    encounters: new Map(db.encounters.map((e) => [e.id, e] as const)),
    events: new Map(db.events.map((e) => [e.id, e] as const)),
    keywords: new Map(db.keywords.map((k) => [k.id, k] as const)),
    quiz: new Map(db.quiz.map((q) => [q.id, q] as const)),
    channels: new Map(db.channels.map((c) => [c.id, c] as const)),
    findings: new Map(db.findings.map((f) => [f.id, f] as const)),
    presentations: new Map(db.presentations.map((p) => [p.id, p] as const)),
    consults: new Map(db.consults.map((c) => [c.id, c] as const)),
  };
}

function idx(): Indexed {
  if (!current) throw new Error("content not installed: call installContent(db) first");
  return current;
}

export function contentInstalled(): boolean {
  return current !== null;
}

export function db(): ContentDB {
  return idx().db;
}

function applyUpgrade(c: CardDef): CardDef {
  const u = c.upgrade;
  const out: CardDef = { ...c };
  if (u.cost !== undefined) out.cost = u.cost;
  if (u.effects) out.effects = u.effects;
  if (u.keywords) out.keywords = u.keywords;
  if (u.drug && c.drug) out.drug = { ...c.drug, ...u.drug };
  return out;
}

export function cardDef(id: CardId, upgraded = false): CardDef {
  const map = upgraded ? idx().upgraded : idx().cards;
  const def = map.get(id);
  if (!def) {
    const fallback = idx().cards.get("obsolete_card");
    if (fallback) return fallback;
    throw new Error(`unknown card ${id}`);
  }
  return def;
}

export function hasCard(id: CardId): boolean {
  return idx().cards.has(id);
}

export function diseaseDef(id: DiseaseId): DiseaseDef {
  const def = idx().diseases.get(id);
  if (!def) throw new Error(`unknown disease ${id}`);
  return def;
}

export function statusDef(id: StatusId): StatusDef {
  const def = idx().statuses.get(id);
  if (!def) throw new Error(`unknown status ${id}`);
  return def;
}

export function relicDef(id: RelicId): RelicDef {
  const def = idx().relics.get(id);
  if (!def) {
    const fallback = idx().relics.get("obsolete_relic");
    if (fallback) return fallback;
    throw new Error(`unknown relic ${id}`);
  }
  return def;
}

export function hasRelicDef(id: RelicId): boolean {
  return idx().relics.has(id);
}

export function tagDef(id: Tag): TagDef | undefined {
  return idx().tags.get(id);
}

export function traitDef(id: string): TraitDef | undefined {
  return idx().traits.get(id);
}

export function organismDef(id: string): OrganismDef | undefined {
  return idx().organisms.get(id);
}

export function encounterDef(id: string): EncounterDef {
  const def = idx().encounters.get(id);
  if (!def) throw new Error(`unknown encounter ${id}`);
  return def;
}

export function eventDef(id: string): EventDef {
  const def = idx().events.get(id);
  if (!def) throw new Error(`unknown event ${id}`);
  return def;
}

export function keywordDef(id: string): KeywordDef | undefined {
  return idx().keywords.get(id);
}

export function quizDef(id: string): QuizQuestion {
  const q = idx().quiz.get(id);
  if (!q) throw new Error(`unknown quiz ${id}`);
  return q;
}

export function interactionRules(): InteractionRule[] {
  return idx().db.interactions;
}

export function channelDef(id: string): ChannelDef {
  const def = idx().channels.get(id);
  if (!def) throw new Error(`unknown channel ${id}`);
  return def;
}

export function hasChannel(id: string): boolean {
  return idx().channels.has(id);
}

export function findingDef(id: string): FindingDef {
  const def = idx().findings.get(id);
  if (!def) throw new Error(`unknown finding ${id}`);
  return def;
}

export function hasFinding(id: string): boolean {
  return idx().findings.has(id);
}

export function presentationDef(id: string): PresentationDef {
  const def = idx().presentations.get(id);
  if (!def) throw new Error(`unknown presentation ${id}`);
  return def;
}

export function consultDef(id: string): ConsultDef {
  const def = idx().consults.get(id);
  if (!def) throw new Error(`unknown consult ${id}`);
  return def;
}

export function hasDisease(id: string): boolean {
  return idx().diseases.has(id);
}

export function categoryName(id: string): string {
  return (idx().db.categories as Record<string, string>)[id] ?? id;
}
