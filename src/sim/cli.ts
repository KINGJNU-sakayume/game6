// npm run sim -- <combat|run> [--deck act1] [--encounter id] [--n 100] [--bot greedy|random] [--cap 300]
import { CONTENT } from "../content";
import { cardDef, db, diseaseDef, installContent, newRun, step } from "../core";
import { startCombat } from "../core/combat";
import { ClinicianBot } from "./bots/clinician";
import { RandomBot } from "./bots/random";
import { DECKS } from "./decks";
import type { GameState } from "../core";

installContent(CONTENT);

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}
const cmd = process.argv[2] ?? "combat";
const N = Number(arg("n", "100"));
const botName = arg("bot", "greedy");
const cap = Number(arg("cap", "300"));

function makeBot(seed: string) {
  return botName === "random" ? new RandomBot(seed) : new ClinicianBot(seed, cap);
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
function sd(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function combatOnce(seed: string, deck: string[], encounterId: string, act: 1 | 2 | 3): { win: boolean; loss: number; turns: number; se: number } {
  let s: GameState = newRun(seed, { deck });
  s.run.act = act;
  s.run.floor = 3;
  const enc = db().encounters.find((e) => e.id === encounterId)!;
  const kind = enc.pool === "elite" ? "elite" : enc.pool === "boss" ? "boss" : enc.pool === "gate" ? "gate" : "normal";
  startCombat(s, encounterId, kind);
  const bot = makeBot(seed);
  const start = s.run.vitality;
  let guard = 0;
  let lastTurn = 0;
  while (s.phase === "combat" && guard++ < 400) {
    lastTurn = s.combat?.turn ?? lastTurn;
    const a = bot.choose(s);
    s = step(s, a).state;
  }
  return { win: s.phase !== "gameover", loss: start - s.run.vitality, turns: lastTurn, se: s.run.stats.sideEffectsGained };
}

if (cmd === "combat") {
  const deckName = arg("deck", "starter");
  const deck = DECKS[deckName] ?? DECKS.starter!;
  const encArg = arg("encounter", "all");
  const act = Number(arg("act", deckName.startsWith("act") ? deckName.slice(3) : "1")) as 1 | 2 | 3;
  const encs = encArg === "all" ? db().encounters.filter((e) => e.act === act) : db().encounters.filter((e) => e.id === encArg);
  console.log(`deck=${deckName} (${deck.length}장) bot=${botName} n=${N}`);
  console.log("encounter".padEnd(20), "win%".padStart(6), "loss".padStart(6), "σ".padStart(5), "turns".padStart(6), "SE".padStart(5));
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
    );
  }
} else if (cmd === "run") {
  let wins = 0;
  const reached = [0, 0, 0, 0];
  const causes: Record<string, number> = {};
  const floors: number[] = [];
  for (let i = 0; i < N; i++) {
    const seed = `run-${i}`;
    let s = newRun(seed);
    const bot = makeBot(seed);
    let guard = 0;
    while (s.phase !== "gameover" && s.phase !== "victory" && guard++ < 6000) s = step(s, bot.choose(s)).state;
    reached[s.run.act]! += 1;
    floors.push(s.run.stats.floorsClimbed);
    if (s.phase === "victory") wins++;
    else {
      const dc = s.run.stats.deathCause;
      const c = !dc ? "?" : dc.startsWith("se:") ? `부작용(${cardDef(dc.slice(3)).nameKo})` : dc.startsWith("status:") ? `상태(${dc.slice(7)})` : diseaseDef(dc).nameKo;
      causes[c] = (causes[c] ?? 0) + 1;
    }
  }
  console.log(`bot=${botName} n=${N} 승률 ${((wins / N) * 100).toFixed(1)}%`);
  console.log(`도달 막: 1막 ${reached[1]}, 2막 ${reached[2]}, 3막 ${reached[3]} / 평균 층 ${mean(floors).toFixed(1)}`);
  console.log("사망 원인:", Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
}
