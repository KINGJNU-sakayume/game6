// 지도 생성. design.md D7 (R28)
import { pickWeighted, randInt } from "./rng";
import type { MapNode, MapState, NodeType, RngState } from "./types";

export const MAP_WIDTH = 7;
const PATHS = 6;

export function actFloors(act: 1 | 2 | 3): number {
  return act === 1 ? 8 : 10;
}

export function treasureFloor(act: 1 | 2 | 3): number {
  return act === 1 ? 4 : 5;
}

const WEIGHTS: [NodeType, number][] = [
  ["battle", 50],
  ["event", 15],
  ["rest", 12],
  ["elite", 10],
  ["shop", 8],
  ["treasure", 5],
];

export function generateMap(rng: RngState, act: 1 | 2 | 3): MapState {
  const L = actFloors(act);
  const edges = new Set<string>(); // `${floor}:${from}>${to}` (floor → floor+1)
  const cells = new Set<string>(); // `${floor}-${col}`
  const starts: number[] = [];
  for (let p = 0; p < PATHS; p++) {
    let col: number;
    if (p === 1) {
      do col = randInt(rng, MAP_WIDTH);
      while (col === starts[0]);
    } else col = randInt(rng, MAP_WIDTH);
    starts.push(col);
    cells.add(`1-${col}`);
    for (let f = 1; f < L; f++) {
      let next = col;
      let placed = false;
      for (let attempt = 0; attempt < 10 && !placed; attempt++) {
        const nc = col + randInt(rng, 3) - 1;
        if (nc < 0 || nc >= MAP_WIDTH) continue;
        const crosses =
          (nc === col + 1 && edges.has(`${f}:${col + 1}>${col}`)) || (nc === col - 1 && edges.has(`${f}:${col - 1}>${col}`));
        if (crosses) continue;
        next = nc;
        placed = true;
      }
      edges.add(`${f}:${col}>${next}`);
      cells.add(`${f + 1}-${next}`);
      col = next;
    }
  }

  const nodes: Record<string, MapNode> = {};
  for (const cell of cells) {
    const [f, c] = cell.split("-").map(Number) as [number, number];
    nodes[cell] = { id: cell, floor: f, col: c, type: "battle", next: [] };
  }
  for (const e of edges) {
    const [f, rest] = e.split(":") as [string, string];
    const [from, to] = rest.split(">") as [string, string];
    const a = nodes[`${f}-${from}`]!;
    const bId = `${Number(f) + 1}-${to}`;
    if (!a.next.includes(bId)) a.next.push(bId);
  }
  for (const n of Object.values(nodes)) n.next.sort((x, y) => nodes[x]!.col - nodes[y]!.col);
  const bossId = "boss";
  nodes[bossId] = { id: bossId, floor: L + 1, col: 3, type: "boss", next: [] };
  for (const n of Object.values(nodes)) if (n.floor === L) n.next.push(bossId);

  assignTypes(rng, nodes, act, L);
  return { act, floors: L, nodes, bossId, visited: [] };
}

function parentsOf(nodes: Record<string, MapNode>, id: string): MapNode[] {
  return Object.values(nodes).filter((n) => n.next.includes(id));
}

function isFixedFloor(act: 1 | 2 | 3, floor: number, L: number): boolean {
  return floor === 1 || floor === treasureFloor(act) || floor === L;
}

function assignTypes(rng: RngState, nodes: Record<string, MapNode>, act: 1 | 2 | 3, L: number): void {
  const ordered = Object.values(nodes)
    .filter((n) => n.type !== "boss")
    .sort((a, b) => a.floor - b.floor || a.col - b.col);
  const assigned = new Set<string>();
  for (const n of ordered) {
    if (n.floor === 1) n.type = "battle";
    else if (n.floor === treasureFloor(act)) n.type = "treasure";
    else if (n.floor === L) n.type = "rest";
    else {
      let chosen: NodeType = "battle";
      for (let attempt = 0; attempt < 20; attempt++) {
        const t = pickWeighted(rng, WEIGHTS);
        if (violates(nodes, n, t, act, L, assigned)) continue;
        chosen = t;
        break;
      }
      n.type = chosen;
    }
    assigned.add(n.id);
  }
}

function violates(nodes: Record<string, MapNode>, n: MapNode, t: NodeType, act: 1 | 2 | 3, L: number, assigned: Set<string>): boolean {
  if ((t === "elite" || t === "rest") && n.floor < 4) return true;
  if (t === "rest" && n.floor === L - 1) return true;
  const parents = parentsOf(nodes, n.id);
  if (t === "elite" || t === "rest" || t === "shop") {
    for (const p of parents) if (!isFixedFloor(act, p.floor, L) && p.type === t) return true;
  }
  for (const p of parents) {
    if (p.next.length < 2) continue;
    for (const sib of p.next) {
      if (sib === n.id || !assigned.has(sib)) continue;
      const s = nodes[sib]!;
      if (isFixedFloor(act, s.floor, L)) continue;
      if (s.type === t) return true;
    }
  }
  return false;
}

/** 시작 노드(1층)부터 갈 수 있는 노드인지, 보스로 이어지는지 확인하는 데 쓴다. */
export function reachableFromStart(map: MapState): Set<string> {
  const seen = new Set<string>();
  const stack = Object.values(map.nodes)
    .filter((n) => n.floor === 1)
    .map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const nx of map.nodes[id]!.next) stack.push(nx);
  }
  return seen;
}
