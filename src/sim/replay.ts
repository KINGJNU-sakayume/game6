// 재생 기록 검증: 설정 창의 "시드와 행동 기록 복사"로 받은 JSON을 다시 돌려 최종 해시를 비교한다.
// 사용: npm run replay -- run.json   (또는 표준 입력으로 JSON)
import { readFileSync } from "node:fs";
import { CONTENT } from "../content";
import { installContent, newRun, stateHash, step } from "../core";
import type { Action } from "../core";

installContent(CONTENT);

interface Export {
  seed: string;
  actionLog: Action[];
  finalHash: string | null;
}

const file = process.argv[2];
const raw = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
const data = JSON.parse(raw) as Export;
if (!data.seed || !Array.isArray(data.actionLog)) {
  console.error("seed와 actionLog가 있는 JSON이 필요하다");
  process.exit(2);
}

let s = newRun(data.seed);
for (let i = 0; i < data.actionLog.length; i++) {
  const r = step(s, data.actionLog[i]!);
  if (r.events[0]?.type === "action_rejected") {
    console.error(`행동 #${i} 거부됨: ${JSON.stringify(data.actionLog[i])} — ${r.events[0].reason}`);
    process.exit(1);
  }
  s = r.state;
}
const hash = stateHash(s);
console.log(`시드 ${data.seed} · 행동 ${data.actionLog.length}개 · ${s.run.act}막 ${s.run.floor}층 · ${s.phase}`);
console.log(`최종 해시 ${hash}`);
if (data.finalHash && data.finalHash !== hash) {
  console.error(`불일치: 기록된 해시 ${data.finalHash}`);
  process.exit(1);
}
if (data.finalHash) console.log("일치");
