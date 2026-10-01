// 런 단위 미생물 기록과 선택 압력 (v2.1, design.md §2.4).
// 배양은 전투가 끝나도 계속 자라고, 결과는 다음 전투에서 나온다. 원인균·감수성은 환자 차트에 남는다.
// 선택 압력은 환자의 항생제 이력이다(플레이어가 안다). 이후 감염의 변이(원인균)를 내성균 쪽으로 기울인다. 변이 자체는 숨은 정답이다.
import { channelDef, diseaseDef, findingDef, hasFinding, presentationDef } from "./registry";
import { actualFinding } from "./evidence";
import { emit, log } from "./util";
import type { DiseaseDef, EnemyState, GameState, MedicalNote, MicroEntry, MicroRecord, OrganismId, VariantDef } from "./types";

/** 내성균: 선택 압력과 집락 기록이 이 원인균의 변이 확률을 올린다 */
export const RESISTANT_ORGANISMS: OrganismId[] = ["esbl", "mrsa", "pseudomonas"];
/** 선택 압력 1당 내성균 변이 가중치 +% (최대 +150%) */
export const PRESSURE_PCT = 10;
export const PRESSURE_CAP_PCT = 150;
/** 앞선 배양에서 나온 균(집락)이 같은 균의 변이 가중치에 더하는 % */
export const COLONIZED_PCT = 100;
/** 선택 압력: 광범위 항생제 +2, 원인균을 모른 채 쓴 좁은 항생제 +1, 범위 축소 −2 */
export const PRESSURE_BROAD = 2;
export const PRESSURE_EMPIRIC = 1;
export const PRESSURE_DEESCALATE = -2;

/** 소유자 검토용: 이 파일의 의학적 연결 (npm run medical:review가 목록에 넣는다) */
export const MICRO_MEDICAL: { id: string; text: string; medical: MedicalNote }[] = [
  {
    id: "pressure",
    text: `선택 압력: 광범위 항생제 +${PRESSURE_BROAD}, 원인균을 모르고 쓴 항생제 +${PRESSURE_EMPIRIC}(한 전투에 약마다 한 번), 원인균 확인 뒤 범위 축소 ${PRESSURE_DEESCALATE}. 1당 이후 감염의 내성균(ESBL·MRSA·녹농균) 변이 가중치 +${PRESSURE_PCT}%(최대 +${PRESSURE_CAP_PCT}%)`,
    medical: { fidelity: "unverified", note: "광범위 항생제 노출이 이후 내성균 감염 위험을 올린다는 방향은 맞다. 수치(점수·%)는 게임용" },
  },
  {
    id: "colonization",
    text: `집락: 앞선 배양에서 나온 균은 같은 균의 이후 감염 변이 가중치 +${COLONIZED_PCT}%. 예: 상처 배양 MRSA → 이후 인공호흡기 폐렴·카테터 혈류감염·패혈성 쇼크의 MRSA 변이`,
    medical: { fidelity: "unverified", note: "MRSA·ESBL 집락은 이후 같은 균 감염의 위험 인자다. 부위가 달라도 같은 균으로 본 것은 단순화" },
  },
  {
    id: "carryover",
    text: "배양은 전투가 끝나도 계속 자라고 결과는 다음 전투에서 나온다. 결과와 감수성은 런 끝까지 차트에 남는다",
    medical: { fidelity: "unverified", note: "배양·감수성은 보통 48–72시간. 다음 문제에서 앞 문제의 결과를 받는 시간 감각은 게임용" },
  },
];

export function micro(state: GameState): MicroRecord {
  return (state.run.micro ??= { pending: [], results: [], pressure: 0 });
}

export function changePressure(state: GameState, delta: number, reason: string): void {
  const m = micro(state);
  const before = m.pressure;
  m.pressure = Math.max(0, m.pressure + delta);
  const d = m.pressure - before;
  if (!d) return;
  emit({ type: "selection_pressure", delta: d, total: m.pressure });
  if (state.combat) log(state.combat, d > 0 ? "warn" : "info", `선택 압력 ${d > 0 ? "+" : ""}${d} (${reason}) → ${m.pressure}`);
}

/** 화면·기록용 문제 이름 (플레이어가 아는 이름) */
function sourceName(enemy: EnemyState): string {
  return enemy.knowledge >= 2 ? diseaseDef(enemy.workingDx ?? enemy.diseaseId).nameKo : presentationDef(enemy.presentationId).complaint;
}

function organismOf(finding: string): OrganismId | undefined {
  const f = hasFinding(finding) ? findingDef(finding) : undefined;
  return f?.organism && f.organism !== "virus" ? f.organism : undefined;
}

/** 전투 중 배양 결과가 나왔다: 차트에 적는다 */
export function recordCulture(state: GameState, enemy: EnemyState, channel: string, finding: string): void {
  if (!channel.startsWith("cx_")) return;
  const entry: MicroEntry = { channel, finding, source: sourceName(enemy), act: state.run.act, floor: state.run.floor };
  const org = organismOf(finding);
  if (org) entry.organism = org;
  micro(state).results.push(entry);
}

/** 전투가 끝날 때 아직 배양 중인 검체는 계속 자란다 (결과는 다음 전투에서) */
export function carryOverCultures(state: GameState, onlyUid?: string): void {
  const c = state.combat;
  if (!c) return;
  const m = micro(state);
  const moving = (d: (typeof c.delayed)[number]) => !!d.channel?.startsWith("cx_") && (!onlyUid || d.ctx.targetUid === onlyUid);
  for (const d of c.delayed) {
    if (!moving(d) || !d.channel) continue;
    const enemy = c.enemies.find((e) => e.uid === d.ctx.targetUid);
    if (!enemy) continue;
    const finding = actualFinding(enemy, d.channel);
    const entry: MicroEntry = { channel: d.channel, finding, source: sourceName(enemy), act: state.run.act, floor: state.run.floor };
    const org = organismOf(finding);
    if (org) entry.organism = org;
    m.pending.push(entry);
  }
  c.delayed = c.delayed.filter((d) => !moving(d));
}

/** 새 전투가 시작되면 지난 전투에서 보낸 배양 결과가 도착한다 */
export function deliverPendingCultures(state: GameState): void {
  const m = micro(state);
  if (!m.pending.length) return;
  const c = state.combat;
  for (const p of m.pending) {
    m.results.push(p);
    emit({ type: "micro_result", channel: p.channel, finding: p.finding, source: p.source, late: true });
    if (c) log(c, "diag", `미생물 검사실 회신 — 지난 문제(${p.source})의 ${channelDef(p.channel).nameKo}: ${findingDef(p.finding).text}`);
  }
  m.pending = [];
}

/** 차트에 기록된(집락) 원인균 */
export function colonizedOrganisms(state: GameState): Set<OrganismId> {
  return new Set(micro(state).results.map((r) => r.organism).filter((o): o is OrganismId => !!o));
}

/**
 * 변이 가중치: 내성균 변이는 선택 압력만큼, 앞선 배양에서 같은 균이 나왔으면 더.
 * 플레이어가 아는 환자 이력만 쓴다. 뽑는 난수는 인카운터 스트림(결정적).
 */
export function variantWeight(state: GameState, v: VariantDef): number {
  if (!v.organism) return v.weight;
  let pct = 100;
  if (RESISTANT_ORGANISMS.includes(v.organism)) pct += Math.min(PRESSURE_CAP_PCT, micro(state).pressure * PRESSURE_PCT);
  if (colonizedOrganisms(state).has(v.organism)) pct += COLONIZED_PCT;
  return Math.max(1, Math.floor((v.weight * pct) / 100));
}

export function variantWeights(state: GameState, def: DiseaseDef): [string, number][] {
  return (def.variants ?? []).map((v) => [v.id, variantWeight(state, v)] as [string, number]);
}
