// 임상 경로표 (지도). 왼쪽에서 오른쪽으로 시간이 흐른다.
import React from "react";
import { availableNodes, db, diseaseDef, treasureFloor } from "../../core";
import type { GameState, MapNode, NodeType } from "../../core";
import { controller } from "../controller";
import { NodeGlyph } from "../components/icons";
import { tipProps } from "../tooltip";
import { registrationNo } from "../components/EmrBanner";

const NODE_NAME: Record<NodeType, string> = {
  battle: "호출",
  elite: "급변",
  rest: "당직실",
  shop: "약제부",
  treasure: "가이드라인 개정",
  event: "돌발 상황",
  boss: "주 진단",
};
const NODE_DESC: Record<NodeType, string> = {
  battle: "병동에서 호출이 온다. 질병 하나 또는 둘과 싸운다.",
  elite: "환자 상태가 급격히 나빠진다. 강한 질병, 보상에 가이드라인이 있다.",
  rest: "쉬거나(활력 30% 회복), 처방 하나를 최적화하거나, 지속 부작용을 정리한다.",
  shop: "예산으로 카드와 가이드라인을 사고, 처방 하나를 정리한다.",
  treasure: "새 가이드라인 하나를 받는다.",
  event: "예상하지 못한 일이 생긴다.",
  boss: "이 막의 주 진단. 이기면 다음 병동으로 옮긴다.",
};
const ACT_TITLE: Record<number, { ko: string; en: string; code: string }> = {
  1: { ko: "응급실", en: "EMERGENCY DEPARTMENT", code: "CP-ER-01" },
  2: { ko: "내과 병동", en: "MEDICAL WARD 7W", code: "CP-WD-02" },
  3: { ko: "내과계 중환자실", en: "MEDICAL ICU", code: "CP-IC-03" },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 손으로 그린 듯 살짝 흔들리는 선 */
function wobblyLine(x1: number, y1: number, x2: number, y2: number, seed: number): string {
  const mx = (x1 + x2) / 2 + (((seed % 7) - 3) * 0.9);
  const my = (y1 + y2) / 2 + ((((seed >> 3) % 7) - 3) * 0.9);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** 빨간 펜으로 두른 동그라미 (끝이 살짝 겹친다) */
function penCircle(cx: number, cy: number, r: number, seed: number): string {
  const rot = ((seed % 40) - 20) * (Math.PI / 180);
  const pts: string[] = [];
  const n = 28;
  for (let i = 0; i <= n + 3; i++) {
    const t = (i / n) * Math.PI * 2 + rot;
    const rr = r * (1 + 0.07 * Math.sin(i * 1.7 + seed));
    const x = cx + Math.cos(t) * rr * 1.12;
    const y = cy + Math.sin(t) * rr * 0.92;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

export function MapScreen({ state }: { state: GameState }) {
  const map = state.run.map;
  const act = state.run.act;
  const L = map.floors;
  const avail = new Set(availableNodes(state));
  const visited = map.visited;
  const W = 1040;
  const H = 430;
  const x0 = 60;
  const y0 = 40;
  const dx = (W - 240) / (L - 1);
  const dy = (H - 70) / 6;
  const pos = (n: MapNode): [number, number] => {
    if (n.type === "boss") return [x0 + (L - 1) * dx + 150, y0 + 3 * dy];
    const h = hash(n.id);
    return [x0 + (n.floor - 1) * dx + ((h % 9) - 4), y0 + n.col * dy + (((h >> 4) % 9) - 4)];
  };
  const nodes = Object.values(map.nodes);
  const bossEnc = db().encounters.find((e) => e.act === act && (e.pool === "boss" || e.pool === "gate"));
  const bossComplaint = bossEnc ? diseaseDef(bossEnc.enemies[0]!.disease).presentation : undefined;
  const visitedEdges = new Set<string>();
  for (let i = 1; i < visited.length; i++) visitedEdges.add(`${visited[i - 1]}>${visited[i]}`);
  const title = ACT_TITLE[act]!;
  const current = state.run.currentNode;

  return (
    <div className="map-wrap">
      <section className="sheet map-sheet" aria-label="임상 경로표">
        <div className="sheet-head map-head">
          <div>
            <div className="eyebrow">임상 경로표 · CLINICAL PATHWAY</div>
            <h2 className="map-title">
              {act}막 {title.ko} <span className="map-title-en">{title.en}</span>
            </h2>
          </div>
          <div className="map-head-right">
            <div className="form-code">{title.code}</div>
            <div className="patient-sticker" aria-label="환자 스티커">
              <div className="ps-name">
                {state.run.patient.surname}○○ <span>{state.run.patient.sex}/{state.run.patient.age}</span>
              </div>
              <div className="ps-no mono">{registrationNo(state.seed)}</div>
              <div className="ps-dx">DM2 · HTN</div>
            </div>
          </div>
        </div>

        <svg className="map-svg" viewBox={`0 0 ${W + 60} ${H + 20}`} width={W + 60} height={H + 20} role="img" aria-label="경로 지도">
          <defs>
            <pattern id="mm" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M10 0 H0 V10" fill="none" stroke="var(--grid)" strokeWidth="0.6" />
            </pattern>
            <pattern id="cm" width="50" height="50" patternUnits="userSpaceOnUse">
              <rect width="50" height="50" fill="url(#mm)" />
              <path d="M50 0 H0 V50" fill="none" stroke="#cfdce6" strokeWidth="0.9" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={W + 60} height={H + 20} fill="url(#cm)" />
          {/* 층 머리글 */}
          {Array.from({ length: L }, (_, i) => {
            const f = i + 1;
            const label = f === treasureFloor(act) ? "개정" : f === L ? "당직" : "";
            const done = state.run.floor >= f;
            return (
              <g key={f}>
                <text x={x0 + i * dx} y={16} textAnchor="middle" className={`map-floor ${done ? "is-done" : ""}`}>
                  {f}
                </text>
                {label && (
                  <text x={x0 + i * dx} y={H + 12} textAnchor="middle" className="map-floor-note">
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          {/* 간선 */}
          {nodes.map((n) =>
            n.next.map((to) => {
              const a = pos(n);
              const b = pos(map.nodes[to]!);
              const key = `${n.id}>${to}`;
              const done = visitedEdges.has(key);
              const isNext = n.id === current && avail.has(to);
              return (
                <path
                  key={key}
                  d={wobblyLine(a[0], a[1], b[0] - (to === map.bossId ? 60 : 0), b[1], hash(key))}
                  className={`map-edge ${done ? "is-done" : ""} ${isNext ? "is-next" : ""}`}
                />
              );
            }),
          )}
          {/* 노드 */}
          {nodes.map((n) => {
            const [x, y] = pos(n);
            const isAvail = avail.has(n.id);
            const isVisited = visited.includes(n.id);
            const isCurrent = n.id === current;
            const onClick = isAvail ? () => controller.dispatch({ type: "move_map", nodeId: n.id }) : undefined;
            if (n.type === "boss") {
              return (
                <g
                  key={n.id}
                  className={`map-boss ${isAvail ? "is-avail" : ""}`}
                  onClick={onClick}
                  role={isAvail ? "button" : undefined}
                  tabIndex={isAvail ? 0 : -1}
                  onKeyDown={(e) => {
                    if (isAvail && (e.key === "Enter" || e.key === " ")) onClick?.();
                  }}
                  {...tipProps(
                    <>
                      <div className="tip-title">주 진단{act === 2 ? " (관문)" : ""}</div>
                      {NODE_DESC.boss}
                      {bossComplaint && <div className="tip-sub">주호소: {bossComplaint.complaint} — {bossComplaint.clues[0]}</div>}
                    </>,
                    "left",
                  )}
                >
                  <rect x={x - 60} y={y - 46} width={120} height={92} className="map-boss-box" />
                  <text x={x} y={y - 24} textAnchor="middle" className="map-boss-label">
                    주 진단
                  </text>
                  <text x={x} y={y + 2} textAnchor="middle" className="map-boss-cc">
                    {bossComplaint?.complaint ?? "?"}
                  </text>
                  <text x={x} y={y + 24} textAnchor="middle" className="map-boss-clue">
                    {bossComplaint?.clues[0]?.slice(0, 11) ?? ""}
                  </text>
                  {isAvail && <path d={penCircle(x, y, 62, hash(n.id))} className="map-pen" />}
                </g>
              );
            }
            return (
              <g
                key={n.id}
                className={`map-node t-${n.type} ${isAvail ? "is-avail" : ""} ${isVisited ? "is-visited" : ""}`}
                onClick={onClick}
                role={isAvail ? "button" : undefined}
                tabIndex={isAvail ? 0 : -1}
                aria-label={`${n.floor}층 ${NODE_NAME[n.type]}`}
                onKeyDown={(e) => {
                  if (isAvail && (e.key === "Enter" || e.key === " ")) onClick?.();
                }}
                {...tipProps(
                  <>
                    <div className="tip-title">
                      {n.floor}층 · {NODE_NAME[n.type]}
                    </div>
                    {NODE_DESC[n.type]}
                  </>,
                )}
              >
                <circle cx={x} cy={y} r={15} className="map-node-bg" />
                <g transform={`translate(${x - 11} ${y - 11})`}>
                  <NodeGlyph type={n.type} size={22} />
                </g>
                {isVisited && !isCurrent && <path d={`M${x - 9} ${y + 1} L${x - 3} ${y + 7} L${x + 10} ${y - 8}`} className="map-check" />}
                {isAvail && <path d={penCircle(x, y, 19, hash(n.id))} className="map-pen" />}
                {isCurrent && <circle cx={x} cy={y} r={20} className="map-current" />}
              </g>
            );
          })}
        </svg>

        <div className="map-foot">
          <ul className="map-legend" aria-label="범례">
            {(["battle", "elite", "event", "rest", "shop", "treasure"] as NodeType[]).map((t) => (
              <li key={t}>
                <NodeGlyph type={t} size={16} /> {NODE_NAME[t]}
              </li>
            ))}
          </ul>
          <div className="map-note hand">
            {avail.size > 0 ? (current ? "다음 처치를 고른다 →" : "1층에서 시작할 곳을 고른다") : ""}
          </div>
        </div>
      </section>
    </div>
  );
}
