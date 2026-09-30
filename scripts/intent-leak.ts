// 의도 누설 검사 (v2.1). npm run intent:leak
// 1) 내원 양상마다 후보 질병이 보일 수 있는 (압박 종류, 크기 등급) 칸의 집합과 첫 의도
// 2) 정답만 바꾼 전투를 8턴 진행해(플레이어는 턴만 넘긴다) 보이는 의도의 순서가 같은지
import { CONTENT } from "../src/content";
import { db, diseaseDef, installContent, newRun, step, visibleEnemyInfo } from "../src/core";
import { startCombat } from "../src/core/combat";
import { moveSignature } from "../src/core/enemy-ai";
import type { EnemyState, GameState } from "../src/core";

installContent(CONTENT);

const TURNS = 8;

function run(encId: string, disease: string, seed: string): { sigs: string[]; shown: string[] } {
  let s: GameState = newRun(seed);
  s.run.vitality = 100000;
  s.run.maxVitality = 100000;
  const enc = db().encounters.find((e) => e.id === encId)!;
  startCombat(s, encId, enc.pool === "elite" ? "elite" : "normal", [{ disease, atypical: null }]);
  const sigs: string[] = [];
  const shown: string[] = [];
  for (let t = 0; t < TURNS && s.phase === "combat"; t++) {
    const e = s.combat!.enemies[0]!;
    if (e.cured) break;
    sigs.push(e.ai.planned[0]?.sig ?? "?");
    const v = visibleEnemyInfo(s, e.uid)!;
    shown.push(v.intents.map((i) => `${i.pressure}:${i.band}`).join("+"));
    s = step(s, { type: "end_turn" }).state;
  }
  return { sigs, shown };
}

const rows: string[] = [];
rows.push("| 내원 양상 | 후보 | 보이는 의도 칸 (모든 후보 공통) | 첫 의도 | 후보별 칸 충족 | 8턴 의도 순서 (시드 20개) |");
rows.push("|---|---|---|---|---|---|");
let bad = 0;
for (const p of db().presentations) {
  if (p.candidates.length < 2) continue;
  const enc = db().encounters.find((e) => e.problems.length === 1 && e.problems[0]!.presentation === p.id);
  const script = p.course;
  const sigs = script ? [...new Set([...(script.opening ?? []), ...Object.keys(script.weights), ...(script.rules ?? []).map((r) => r.sig)])] : [];
  const cover = p.candidates.map((c) => {
    const e = { diseaseId: c.disease, presentationId: p.id } as EnemyState;
    const have = new Set(diseaseDef(c.disease).moves.map((m) => moveSignature(e, m)));
    return sigs.every((x) => have.has(x));
  });
  let same = 0;
  let total = 0;
  if (enc) {
    for (let k = 0; k < 20; k++) {
      const res = p.candidates.map((c) => run(enc.id, c.disease, `leak-${k}`));
      total += 1;
      if (res.every((r) => JSON.stringify(r.sigs) === JSON.stringify(res[0]!.sigs))) same += 1;
    }
  }
  const ok = cover.every(Boolean) && same === total && !!script;
  if (!ok) bad += 1;
  rows.push(
    `| \`${p.id}\` | ${p.candidates.map((c) => diseaseDef(c.disease).nameKo).join(", ")} | ${sigs.join(", ") || "대본 없음"} | ${script?.opening?.[0] ?? "대본 가중 추첨(정답 무관)"} | ${cover.every(Boolean) ? "예" : "아니오"} | ${enc ? `${same}/${total} 같음` : "인카운터 없음"} |`,
  );
}
console.log(rows.join("\n"));
console.log(`\n누설이 남은 내원 양상: ${bad}`);
if (bad) process.exitCode = 1;
