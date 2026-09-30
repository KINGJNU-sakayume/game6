// npm run content:report — 콘텐츠 현황, fidelity 목록, 예산 이탈. design.md §3.10
import { CONTENT } from "../content";
import { validateContent } from "../core";

const db = CONTENT;
const res = validateContent(db);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log("\n== 오더 세트 콘텐츠 보고서 ==\n");
const playable = db.cards.filter((c) => c.kind !== "side_effect" && c.rarity !== "starter");
const byRarity = (r: string) => playable.filter((c) => c.rarity === r).length;
console.log(`카드 ${playable.length}장 (일반 ${byRarity("common")} / 고급 ${byRarity("uncommon")} / 희귀 ${byRarity("rare")}), 시작 카드 ${db.cards.filter((c) => c.rarity === "starter").length}종, 부작용 카드 ${db.cards.filter((c) => c.kind === "side_effect").length}종`);
for (const k of ["diagnostic", "procedure", "drug"]) console.log(`  ${pad(k, 11)} ${playable.filter((c) => c.kind === k).length}`);
console.log(`질병 ${db.diseases.length}종 (일반 ${db.diseases.filter((d) => d.tier === "normal").length} / 정예 ${db.diseases.filter((d) => d.tier === "elite").length} / 관문 ${db.diseases.filter((d) => d.tier === "gate").length} / 보스 ${db.diseases.filter((d) => d.tier === "boss").length})`);
console.log(`유물 ${db.relics.filter((r) => r.tier !== "special").length}개, 상호작용 규칙 ${db.interactions.length}개, 인카운터 ${db.encounters.length}개, 이벤트 ${db.events.length}개, 퀴즈 ${db.quiz.length}문항`);

const customCount = db.cards.reduce((n, c) => n + c.effects.filter((e) => e.op === "custom").length, 0);
const opCount = db.cards.reduce((n, c) => n + c.effects.length, 0);
console.log(`custom 비율: ${customCount}/${opCount} (${Math.round((customCount / Math.max(1, opCount)) * 100)}%)`);

console.log("\n-- fidelity (unverified 우선) --");
const med: { kind: string; id: string; name: string; fidelity: string; note: string }[] = [];
for (const c of db.cards) if (c.medical) med.push({ kind: "카드", id: c.id, name: c.nameKo, ...c.medical });
for (const d of db.diseases) med.push({ kind: "질병", id: d.id, name: d.nameKo, ...d.medical });
for (const r of db.interactions) med.push({ kind: "규칙", id: r.id, name: r.text, ...r.medical });
const order = ["unverified", "stylized", "simplified", "accurate"];
med.sort((a, b) => order.indexOf(a.fidelity) - order.indexOf(b.fidelity));
const counts = Object.fromEntries(order.map((f) => [f, med.filter((m) => m.fidelity === f).length]));
console.log(`accurate ${counts.accurate} / simplified ${counts.simplified} / stylized ${counts.stylized} / unverified ${counts.unverified}`);
for (const m of med.filter((x) => x.fidelity !== "accurate")) console.log(`  [${m.fidelity}] ${m.kind} ${m.id} ${m.name}: ${m.note}`);

console.log("\n-- 예산 이탈 (±30%) --");
for (const w of res.warnings) console.log("  " + w);
if (!res.warnings.length) console.log("  없음");

console.log("\n-- 오류 --");
for (const e of res.errors) console.log("  ✗ " + e);
if (!res.errors.length) console.log("  없음");
if (res.errors.length) process.exitCode = 1;
