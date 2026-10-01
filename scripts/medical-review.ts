// 의학 검토 문서 생성기 (v2.1). npm run medical:review → docs/medical-review.md
// 손으로 고치지 않는다. 콘텐츠에서 만든다. 검증되지 않은(unverified) 항목이 앞에 온다.
import { writeFileSync } from "node:fs";
import { CONTENT } from "../src/content";
import { BAND_LABEL, PRESSURE_LABEL, cardDef, channelDef, db, describeCard, diseaseDef, expectedFindings, findingDef, installContent, organismDef, statusDef, tagDef, textbookSummary } from "../src/core";
import { allMoves } from "../src/core/disease";
import { intentSignature } from "../src/core/enemy-ai";
import { MICRO_MEDICAL } from "../src/core/micro";
import type { DiseaseDef, EffectOp, EnemyState, Fidelity, MedicalNote, MoveDef, PresentationDef } from "../src/core";

installContent(CONTENT);

const FID: Record<Fidelity, string> = { unverified: "검증 안 됨", simplified: "단순화", accurate: "정확", stylized: "게임용 양식화" };
const ORDER: Record<Fidelity, number> = { unverified: 0, simplified: 1, stylized: 2, accurate: 3 };
const BOX = "☐";
const GRADE: Record<string, string> = { key: "특효", weak: "우수", normal: "보통", resistant: "저하", immune: "무효", harmful: "금기" };
const esc = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
const fid = (m?: MedicalNote) => (m ? `**${FID[m.fidelity]}**` : "**검증 안 됨** (메모 없음)");
const byFid = <T>(xs: T[], m: (x: T) => MedicalNote | undefined) => [...xs].sort((a, b) => ORDER[m(a)?.fidelity ?? "unverified"] - ORDER[m(b)?.fidelity ?? "unverified"]);

function opText(op: EffectOp): string {
  const n = (v: unknown) => (typeof v === "number" ? v : "?");
  switch (op.op) {
    case "damage":
      return op.target === "patient" ? `활력 피해 ${n(op.amount)}${op.hits && op.hits > 1 ? `×${op.hits}` : ""}${op.mods?.length ? " (조건부 배율)" : ""}` : `질병 부담 −${n(op.amount)}`;
    case "lose_vitality":
      return `활력 −${n(op.amount)} (안정화 무시)`;
    case "apply_status":
      return `${op.target === "patient" ? "환자" : "질병"}에 ${statusDef(op.status).nameKo} ${n(op.stacks)}`;
    case "remove_status":
      return `${statusDef(op.status).nameKo} 제거`;
    case "gain_stability":
      return `질병 안정화 ${n(op.amount)}`;
    case "add_card":
      return `${cardDef(op.cardId).nameKo} 카드 ${op.count}장 (${op.dest})`;
    case "start_countdown":
      return `${op.turns}턴 뒤 "${op.move}" 예고`;
    case "raise_max_severity":
      return `질병 부담 최대치 +${op.amount}`;
    case "enter_phase":
      return `단계 ${op.phase}로`;
    case "cancel_countdowns":
      return "예고 취소";
    case "exhaust_cards":
      return `${(op.filter.ids ?? []).map((id) => cardDef(id).nameKo).join("·")} 카드 정리`;
    case "plan_bonus":
      return `치료 계획 배율 +${op.pct}%`;
    case "heal":
      return `${op.target === "self" ? "질병 부담" : "활력"} 회복 ${n(op.amount)}`;
    default:
      return op.op;
  }
}
const opsText = (ops: EffectOp[]) => ops.map(opText).join(", ");

function presentationsOf(d: DiseaseDef): string {
  return db()
    .presentations.filter((p) => p.candidates.some((c) => c.disease === d.id))
    .map((p) => {
      const tot = p.candidates.reduce((a, c) => a + c.weight, 0);
      const w = p.candidates.find((c) => c.disease === d.id)!.weight;
      return `${p.complaint}(\`${p.id}\`, ${Math.round((w / tot) * 100)}%)`;
    })
    .join(", ");
}

function presentationSection(p: PresentationDef): string[] {
  const out: string[] = [];
  const tot = p.candidates.reduce((a, c) => a + c.weight, 0);
  out.push(`### ${BOX} \`${p.id}\` ${p.complaint} — ${fid(p.medical)}`);
  out.push("");
  if (p.medical) out.push(`> ${p.medical.note}`);
  out.push("");
  out.push(`- 첫 문구: "${p.vignette}"`);
  out.push(`- 공통 활력 징후: ${p.vitals ? `"${findingDef(p.vitals).text}" (모든 후보가 같게 보인다, 채점하지 않음)` : "후보가 하나라 질병의 활력 징후"}`);
  out.push(`- 질병 부담: ${p.burden ? `${p.burden[0]}–${p.burden[1]}` : "질병 기준"}`);
  out.push("");
  out.push("| 검토 | 감별 대상 | 비율 | 질병 표시 |");
  out.push("|---|---|---|---|");
  for (const c of p.candidates) out.push(`| ${BOX} | ${diseaseDef(c.disease).nameKo} (\`${c.disease}\`) | ${Math.round((c.weight / tot) * 100)}% | ${FID[diseaseDef(c.disease).medical.fidelity]} |`);
  if (p.course) {
    const sigs = [...(p.course.opening ?? []).map((x) => `첫 의도 ${x}`), ...Object.entries(p.course.weights).map(([k, w]) => `${k} ${w}`), ...(p.course.rules ?? []).map((r) => `규칙 ${r.sig}`)];
    out.push("");
    out.push(`- 경과 대본(보이는 의도 칸): ${sigs.join(" · ")}`);
  }
  out.push("");
  return out;
}

function moveRow(d: DiseaseDef, m: MoveDef, where: string): string {
  const pres = db().presentations.find((p) => p.candidates.some((c) => c.disease === d.id));
  const e = { diseaseId: d.id, presentationId: pres?.id ?? "" } as EnemyState;
  const sig = intentSignature(e, m);
  const [k, b] = sig.split(":") as [keyof typeof PRESSURE_LABEL, keyof typeof BAND_LABEL];
  return `| ${BOX} | ${m.nameKo} (\`${m.id}\`)${where} | ${PRESSURE_LABEL[k]} · ${BAND_LABEL[b]} | ${esc(opsText(m.effects))} | ${m.course ? esc(findingDef(m.course).text) : ""} |`;
}

function diseaseSection(d: DiseaseDef): string[] {
  const out: string[] = [];
  out.push(`### ${BOX} \`${d.id}\` ${d.nameKo} (${d.nameEn}) — ${fid(d.medical)}`);
  out.push("");
  out.push(`> ${d.medical.note}`);
  out.push("");
  out.push(`- 교과서 요약: ${d.textbook.keyFeatures}`);
  out.push(`- 나오는 내원 양상: ${presentationsOf(d) || "없음"}`);
  out.push(`- 분류·특성: ${d.category} · ${d.traits.join(", ")} · 등급 ${d.tier} · ${d.act}막`);
  if (d.organism) out.push(`- 원인균: ${organismDef(d.organism)?.nameKo ?? d.organism}`);
  out.push("");
  out.push("**경로별 기대 소견** (모든 변이·단계의 합. 적지 않은 경로는 정상 소견)");
  out.push("");
  out.push("| 검토 | 경로 | 소견 | 가중치 |");
  out.push("|---|---|---|---|");
  const normalCh: string[] = [];
  for (const ch of db().channels) {
    if (ch.gramOf || ch.id === "course") continue;
    const exp = expectedFindings(d.id, ch.id);
    const abn = exp.filter((f) => f !== ch.normal);
    if (!abn.length) {
      normalCh.push(ch.nameKo);
      continue;
    }
    for (const f of exp) {
      const src: string[] = [];
      if (d.findings[ch.id] === f) src.push("기본");
      for (const v of d.variants ?? []) if (v.findings?.[ch.id] === f) src.push(`변이 ${v.nameKo}`);
      for (const ph of d.phases ?? []) if (ph.findings?.[ch.id] === f) src.push(`단계 ${ph.nameKo}`);
      if (f === ch.normal && !src.length) src.push("변이에 따라 정상");
      out.push(`| ${BOX} | ${ch.nameKo}${ch.id === "vitals" ? " (내원 양상 공통으로 대체될 수 있음)" : ""} | ${esc(findingDef(f).text)}${src.length ? ` _(${src.join(", ")})_` : ""} | ${findingDef(f).weight} |`);
    }
  }
  out.push("");
  out.push(`정상 소견 경로: ${normalCh.join(", ")}`);
  out.push("");
  if (d.atypical && Object.keys(d.atypical).length) {
    out.push("**비전형 소견** (문제의 60%에서 하나, 그중 30%는 약한 것 하나 더. 정답을 최대 2(둘이면 3)만 깎는다)");
    out.push("");
    out.push("| 검토 | 경로 | 비전형 소견 | 가중치 |");
    out.push("|---|---|---|---|");
    for (const [ch, f] of Object.entries(d.atypical)) if (f) out.push(`| ${BOX} | ${channelDef(ch).nameKo} | ${esc(findingDef(f).text)} | ${findingDef(f).weight} |`);
    out.push("");
  }
  out.push("**치료 반응표 (교과서)**");
  out.push("");
  out.push("| 검토 | 치료 | 반응 | 적용 |");
  out.push("|---|---|---|---|");
  for (const [t, g] of Object.entries(d.effectiveness)) out.push(`| ${BOX} | ${tagDef(t)?.nameKo ?? t} | ${GRADE[g!] ?? g} | 기본 |`);
  for (const v of d.variants ?? []) for (const [t, g] of Object.entries(v.effectivenessOverride ?? {})) out.push(`| ${BOX} | ${tagDef(t)?.nameKo ?? t} | ${GRADE[g!] ?? g} | 변이 ${v.nameKo} |`);
  for (const ph of d.phases ?? []) for (const [t, g] of Object.entries(ph.effectivenessOverride ?? {})) out.push(`| ${BOX} | ${tagDef(t)?.nameKo ?? t} | ${GRADE[g!] ?? g} | 단계 ${ph.nameKo} |`);
  const tb = textbookSummary(d.id);
  out.push("");
  out.push(`요약: 1차 ${tb.firstLine.join(", ") || "-"} · 피할 것 ${tb.avoid.join(", ") || "-"}${d.variants?.some((v) => v.organism) ? " · 항생제는 원인균(변이)의 감수성으로" : ""}`);
  out.push("");
  if (d.variants?.length) {
    out.push("**변이**: " + d.variants.map((v) => `${v.nameKo} ${v.weight}${v.organism ? ` (${organismDef(v.organism)?.nameKo ?? v.organism})` : ""}`).join(" · "));
    out.push("");
  }
  if (d.definitive?.length) {
    out.push("**결정적 치료** (이 치료가 '좋음'으로 들으면 한 번)");
    out.push("");
    out.push("| 검토 | 치료 | 문구 | 바뀌는 것 |");
    out.push("|---|---|---|---|");
    for (const df of d.definitive) out.push(`| ${BOX} | ${df.tags.map((t) => tagDef(t)?.nameKo ?? t).join("·")} | ${esc(df.text)} | ${esc(opsText(df.effects))} |`);
    out.push("");
  }
  out.push("**행동** (화면에는 확진 전 '압박 종류 · 크기 등급'만 보인다)");
  out.push("");
  out.push("| 검토 | 행동 | 보이는 칸 | 실제 효과 | 경과 소견 |");
  out.push("|---|---|---|---|---|");
  for (const m of d.moves) out.push(moveRow(d, m, ""));
  for (const ph of d.phases ?? []) for (const m of ph.moves ?? []) out.push(moveRow(d, m, ` _(단계 ${ph.nameKo})_`));
  out.push("");
  const courses = [...allMoves(d).filter((m) => m.course).map((m) => `${m.nameKo} → "${findingDef(m.course!).text}"`), ...(d.phases ?? []).filter((p) => p.course).map((p) => `단계 ${p.nameKo} → "${findingDef(p.course!).text}"`)];
  if (courses.length) {
    out.push(`**경과 소견**: ${courses.join(" · ")}`);
    out.push("");
  }
  if (d.passiveText?.length) {
    out.push(`**지속 효과**: ${d.passiveText.join(" / ")}`);
    out.push("");
  }
  return out;
}

const L: string[] = [];
L.push("# 의학 검토 문서");
L.push("");
L.push("> 자동 생성: `npm run medical:review`. 손으로 고치지 말고 콘텐츠(`src/content/`)를 고친 뒤 다시 만든다.");
L.push("> 검토 칸(☐)은 소유자가 확인한 뒤 ☑로 바꿔 체크리스트로 쓴다(다시 생성하면 지워지므로 따로 복사해 둔다). 고칠 점은 해당 콘텐츠의 `medical.note`에 적고 `fidelity`를 바꾼다.");
L.push("> 표시: **검증 안 됨**(소유자가 아직 보지 않음, v2.0·v2.1에서 새로 만들었거나 바뀜) · **단순화**(방향은 맞으나 게임용으로 줄임) · **정확** · **게임용 양식화**. 검증 안 됨이 앞에 온다.");
L.push("");
const allMed: { kind: string; f: Fidelity }[] = [
  ...db().presentations.map((p) => ({ kind: "내원 양상", f: p.medical?.fidelity ?? "unverified" })),
  ...db().diseases.map((d) => ({ kind: "질병", f: d.medical.fidelity })),
  ...db().cards.filter((c) => c.medical).map((c) => ({ kind: c.kind === "side_effect" ? "부작용 카드" : c.kind === "procedure" ? "시술 카드" : "약물 카드", f: c.medical!.fidelity })),
  ...db().interactions.map((r) => ({ kind: "상호작용 규칙", f: r.medical.fidelity })),
  ...db().statuses.filter((s) => s.medical).map((s) => ({ kind: "상태", f: s.medical!.fidelity })),
  ...MICRO_MEDICAL.map((m) => ({ kind: "미생물 연결", f: m.medical.fidelity })),
];
L.push("## 요약");
L.push("");
L.push("| 종류 | 검증 안 됨 | 단순화 | 정확 | 양식화 |");
L.push("|---|---|---|---|---|");
for (const k of [...new Set(allMed.map((x) => x.kind))]) {
  const c = (f: Fidelity) => allMed.filter((x) => x.kind === k && x.f === f).length;
  L.push(`| ${k} | ${c("unverified")} | ${c("simplified")} | ${c("accurate")} | ${c("stylized")} |`);
}
L.push("");
L.push(`소견 ${db().findings.length}개(경로 ${db().channels.length}개)는 질병 절의 "경로별 기대 소견" 표에서 본다. 가중치 규칙: 병력 ≤1, 활력·진찰·혈액·현장 검사·X선·현장 초음파 ≤2, CT·배양 결과만 4, 경과 소견 ≤2.`);
L.push("");
L.push("## 어디서부터 볼까");
L.push("");
L.push("1. v2.1에서 새로 만든 것: 뇌내출혈(`ich`), 새 감별 짝(내원 양상 메모가 v2.1로 시작하는 것), 경과 소견, 미생물 연결.");
L.push("2. 감별의 근거가 되는 소견: 질병마다 \"경로별 기대 소견\"과 \"비전형 소견\". 잘못되면 플레이어가 틀린 것을 배운다.");
L.push("3. 치료 반응표와 금기(피할 것): 금기가 틀리면 게임이 해로운 처방을 가르친다.");
L.push("");
L.push("## 1. 내원 양상 (감별 대상 조합)");
L.push("");
for (const p of byFid(db().presentations, (x) => x.medical)) L.push(...presentationSection(p));
L.push("## 2. 질병");
L.push("");
for (const d of byFid(db().diseases, (x) => x.medical)) L.push(...diseaseSection(d));
L.push("## 3. 미생물 연결 (런 단위)");
L.push("");
L.push("| 검토 | 항목 | 내용 | 표시 | 메모 |");
L.push("|---|---|---|---|---|");
for (const m of MICRO_MEDICAL) L.push(`| ${BOX} | ${m.id} | ${esc(m.text)} | ${fid(m.medical)} | ${esc(m.medical.note)} |`);
L.push("");
L.push("## 4. 약물·시술 카드");
L.push("");
L.push("| 검토 | 카드 | 표시 | 효과 | 메모 |");
L.push("|---|---|---|---|---|");
for (const c of byFid(db().cards.filter((x) => x.medical && x.kind !== "side_effect"), (x) => x.medical)) {
  const t = describeCard(c.id, false);
  const spec = c.drug?.spectrum ? ` 감수성: ${Object.entries(c.drug.spectrum).map(([o, g]) => `${organismDef(o)?.nameKo ?? o} ${GRADE[g!] ?? g}`).join(", ")}` : "";
  L.push(`| ${BOX} | ${c.nameKo} (\`${c.id}\`) | ${fid(c.medical)} | ${esc([...t.lines, t.drugLine ?? "", t.sideEffectLine ?? ""].filter(Boolean).join(" / "))}${esc(spec)} | ${esc(c.medical!.note)} |`);
}
L.push("");
L.push("## 5. 부작용 카드·상호작용 규칙·상태");
L.push("");
L.push("| 검토 | 항목 | 표시 | 내용 | 메모 |");
L.push("|---|---|---|---|---|");
for (const c of byFid(db().cards.filter((x) => x.medical && x.kind === "side_effect"), (x) => x.medical)) L.push(`| ${BOX} | 부작용 ${c.nameKo} | ${fid(c.medical)} | ${esc(describeCard(c.id).lines.join(" / "))} | ${esc(c.medical!.note)} |`);
for (const r of byFid(db().interactions, (x) => x.medical)) L.push(`| ${BOX} | 규칙 ${r.id} | ${fid(r.medical)} | ${esc(r.text)} | ${esc(r.medical.note)} |`);
for (const s of byFid(db().statuses.filter((x) => x.medical), (x) => x.medical)) L.push(`| ${BOX} | 상태 ${s.nameKo} | ${fid(s.medical)} | ${esc(s.description)} | ${esc(s.medical!.note)} |`);
L.push("");
L.push("## 6. 협진 권고 (모두 검증 안 됨, v2.0 신규)");
L.push("");
L.push("| 검토 | 진료과 | 권고 | 내용 | 조건 |");
L.push("|---|---|---|---|---|");
for (const cd of db().consults) for (const r of cd.recommendations) L.push(`| ${BOX} | ${cd.nameKo} | ${r.label} | ${esc(r.detail)}${r.risk ? ` (위험: ${esc(r.risk)})` : ""} | ${r.requiresText ?? "언제나"} |`);
L.push("");
writeFileSync("docs/medical-review.md", L.join("\n"));
console.log(`docs/medical-review.md: ${L.length}줄, 검증 안 됨 ${allMed.filter((x) => x.f === "unverified").length}/${allMed.length}`);
