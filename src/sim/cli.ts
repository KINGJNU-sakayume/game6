// npm run sim -- <combat|run|metrics> [--deck starter] [--encounter id] [--n 100] [--bot clinician|random]
import { CONTENT } from "../content";
import { db, diseaseDef, cardDef, installContent, newRun, step } from "../core";
import { startCombat } from "../core/combat";
import { ClinicianBot } from "./bots/clinician";
import { RandomBot } from "./bots/random";
import { DECKS, FORMULARIES } from "./decks";
import { aggregate, formatAggregate, runWithMetrics } from "./metrics";
import type { GameState } from "../core";

installContent(CONTENT);

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}
const cmd = process.argv[2] ?? "combat";
const N = Number(arg("n", "100"));
const botName = arg("bot", "clinician");

function makeBot(seed: string) {
  return botName === "random" ? new RandomBot(seed) : new ClinicianBot(seed, 0, { blind: botName === "blind" });
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
function sd(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function combatOnce(seed: string, deck: string[], encounterId: string, act: 1 | 2 | 3, blind?: boolean): { win: boolean; loss: number; turns: number; se: number; correct: number } {
  const f = arg("formulary", "");
  let s: GameState = newRun(seed, { deck, formulary: f ? (FORMULARIES[f] ?? f.split(",")) : FORMULARIES[`act${act}`] });
  s.run.act = act;
  s.run.floor = 3;
  const enc = db().encounters.find((e) => e.id === encounterId)!;
  const kind = enc.pool === "elite" ? "elite" : enc.pool === "boss" ? "boss" : enc.pool === "gate" ? "gate" : "normal";
  startCombat(s, encounterId, kind);
  const bot = blind === undefined ? makeBot(seed) : new ClinicianBot(seed, 0, { blind });
  const start = s.run.vitality;
  let guard = 0;
  let lastTurn = 0;
  while (s.phase === "combat" && guard++ < 600) {
    lastTurn = s.combat?.turn ?? lastTurn;
    s = step(s, bot.choose(s)).state;
  }
  return { win: s.phase !== "gameover", loss: start - s.run.vitality, turns: lastTurn, se: s.run.stats.sideEffectsGained, correct: s.run.stats.finalDxCorrect / Math.max(1, s.run.stats.finalDx) };
}

if (cmd === "combat") {
  const deckName = arg("deck", "starter");
  const deck = DECKS[deckName] ?? DECKS.starter!;
  const encArg = arg("encounter", "all");
  const act = Number(arg("act", deckName.startsWith("act") ? deckName.slice(3) : "1")) as 1 | 2 | 3;
  const encs = encArg === "all" ? db().encounters.filter((e) => e.act === act) : db().encounters.filter((e) => e.id === encArg);
  console.log(`deck=${deckName} (${deck.length}장) bot=${botName} n=${N}`);
  console.log("encounter".padEnd(20), "win%".padStart(6), "loss".padStart(6), "σ".padStart(5), "turns".padStart(6), "SE".padStart(5), "dx%".padStart(5));
  for (const e of encs) {
    const res = Array.from({ length: N }, (_, i) => combatOnce(`${e.id}-${i}`, deck, e.id, act));
    const losses = res.map((r) => r.loss);
    console.log(
      e.id.padEnd(20),
      ((mean(res.map((r) => (r.win ? 1 : 0))) * 100).toFixed(0) + "%").padStart(6),
      mean(losses).toFixed(1).padStart(6),
      sd(losses).toFixed(1).padStart(5),
      mean(res.map((r) => r.turns)).toFixed(1).padStart(6),
      mean(res.map((r) => r.se)).toFixed(1).padStart(5),
      (mean(res.map((r) => r.correct)) * 100).toFixed(0).padStart(5),
    );
  }
} else if (cmd === "blind") {
  // 검사한 전투와 검사 없이 치료만 한 전투를 같은 시드로 짝지어 비교한다 (감별 대상이 둘 이상인 일반·정예 전투)
  let pairs = 0;
  let better = 0;
  let worse = 0;
  const rows: string[] = [];
  for (const act of [1, 2, 3] as const) {
    const deck = DECKS[`act${act}`]!;
    const encs = db().encounters.filter((e) => e.act === act && e.pool !== "boss" && e.pool !== "gate" && e.problems.some((p) => db().presentations.find((x) => x.id === p.presentation)!.candidates.length > 1));
    for (const e of encs) {
      const inv = Array.from({ length: N }, (_, i) => combatOnce(`${e.id}-${i}`, deck, e.id, act, false));
      const bl = Array.from({ length: N }, (_, i) => combatOnce(`${e.id}-${i}`, deck, e.id, act, true));
      let b = 0;
      let w = 0;
      inv.forEach((r, i) => {
        const x = r.loss + (r.win ? 0 : 50);
        const y = bl[i]!.loss + (bl[i]!.win ? 0 : 50);
        if (x < y) b++;
        else if (x > y) w++;
      });
      pairs += N;
      better += b;
      worse += w;
      rows.push(`${e.id.padEnd(16)} 검사 ${mean(inv.map((r) => r.loss)).toFixed(1).padStart(5)} · 검사 없음 ${mean(bl.map((r) => r.loss)).toFixed(1).padStart(5)} · 검사가 나음 ${((b / N) * 100).toFixed(0).padStart(3)}% · 못함 ${((w / N) * 100).toFixed(0).padStart(3)}%`);
    }
  }
  console.log(rows.join("\n"));
  console.log(`전체 ${pairs}쌍: 검사가 활력을 덜 잃음 ${((better / pairs) * 100).toFixed(1)}% · 더 잃음 ${((worse / pairs) * 100).toFixed(1)}% · 같음 ${(((pairs - better - worse) / pairs) * 100).toFixed(1)}%`);
} else if (cmd === "run" || cmd === "metrics") {
  const runs = Array.from({ length: N }, (_, i) => {
    const seed = `run-${i}`;
    const bot = makeBot(seed);
    return runWithMetrics(seed, (s) => bot.choose(s));
  });
  const agg = aggregate(runs);
  const rename = (d: Record<string, number>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [deathName(k), v]));
  const named = { ...agg, deaths: rename(agg.deaths), deathsByAct: Object.fromEntries(Object.entries(agg.deathsByAct).map(([a, d]) => [a, rename(d)])) };
  console.log(`bot=${botName}`);
  console.log(formatAggregate(named, cmd === "metrics" ? 30 : 0));
  if (arg("json", "")) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(arg("json", ""), JSON.stringify(named, null, 2));
  }
}

function deathName(dc: string): string {
  if (!dc || dc === "?") return "?";
  if (dc.startsWith("se:")) return `부작용(${cardDef(dc.slice(3)).nameKo})`;
  if (dc.startsWith("status:")) return `상태(${dc.slice(7)})`;
  try {
    return diseaseDef(dc).nameKo;
  } catch {
    return dc;
  }
}
