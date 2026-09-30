// src/content의 질병 수치를 design.md에 붙일 마크다운 표로 뽑는다.
// 사용: npx tsx scripts/gen-disease-table.ts > /tmp/table.md
import { CONTENT } from "../src/content";
import { installContent, statusDef, db } from "../src/core";
import type { DiseaseDef, EffectOp, MoveDef } from "../src/core";

installContent(CONTENT);

const TIER: Record<DiseaseDef["tier"], string> = { normal: "일반", elite: "정예", gate: "관문", boss: "보스" };

function val(v: unknown): string {
  return typeof v === "number" ? String(v) : "X";
}

function op(e: EffectOp, moves: MoveDef[]): string {
  const o = e as Record<string, unknown> & { op: string };
  switch (o.op) {
    case "damage": {
      const hits = typeof o.hits === "number" && o.hits > 1 ? `×${o.hits}` : "";
      const mods = Array.isArray(o.mods) && o.mods.length ? " (조건부 배율)" : "";
      return `공격 ${val(o.amount)}${hits}${mods}`;
    }
    case "gain_stability":
      return `방어 ${val(o.amount)}`;
    case "apply_status": {
      const who = o.target === "patient" ? "환자" : "자신";
      return `${who} ${statusDef(String(o.status)).nameKo} ${val(o.stacks)}`;
    }
    case "remove_status":
      return `${statusDef(String(o.status)).nameKo} 제거`;
    case "start_countdown": {
      const m = moves.find((x) => x.id === o.move);
      return `예고 ${val(o.turns)} → ${m?.nameKo ?? String(o.move)}`;
    }
    case "raise_max_severity":
      return `최대 +${val(o.amount)}`;
    case "heal":
      return `${o.target === "self" ? "자신 회복" : "회복"} ${val(o.amount)}`;
    case "enter_phase":
      return `단계 ${val(o.phase)}`;
    case "add_card":
      return `덱 +${String(o.cardId)}×${val(o.count)} → ${String(o.dest)}`;
    case "lose_vitality":
      return `활력 −${val(o.amount)}`;
    case "if":
      return `조건: ${((o.then as EffectOp[]) ?? []).map((x) => op(x, moves)).join(", ")}`;
    default:
      return o.op;
  }
}

function moveText(m: MoveDef, all: MoveDef[]): string {
  return `${m.nameKo}(${m.effects.map((e) => op(e, all)).join(", ")})`;
}

const rows: string[] = [];
rows.push("| ID | 질병 | 막 | 등급 | 중증도 | 진단 | 행동 |");
rows.push("|---|---|---|---|---|---|---|");
for (const d of db().diseases) {
  const all = [...d.moves, ...(d.phases ?? []).flatMap((p) => p.moves ?? [])];
  let moves = d.moves.map((m) => moveText(m, all)).join(" · ");
  for (const p of d.phases ?? []) {
    if (p.moves?.length) moves += ` · [${p.nameKo}] ${p.moves.map((m) => moveText(m, all)).join(" · ")}`;
  }
  rows.push(`| \`${d.id}\` | ${d.nameKo} | ${d.act} | ${TIER[d.tier]} | ${d.severity[0]}–${d.severity[1]} | ${d.diagnosis.partialAt}/${d.diagnosis.confirmAt} | ${moves} |`);
}
console.log(rows.join("\n"));
