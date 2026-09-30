// 전역 툴팁. 무대가 축소·확대되므로 화면 좌표를 무대 좌표로 바꿔 그린다.
import React from "react";

interface TipState {
  content: React.ReactNode;
  x: number;
  y: number;
  place: "top" | "bottom" | "right" | "left";
}

type Listener = (t: TipState | null) => void;
const listeners = new Set<Listener>();
let stageEl: HTMLElement | null = null;
let stageScale = 1;

export function registerStage(el: HTMLElement | null, scale: number): void {
  stageEl = el;
  stageScale = scale;
}

export function showTip(content: React.ReactNode, target: Element, place: TipState["place"] = "top"): void {
  if (!stageEl) return;
  const s = stageEl.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const cx = (r.left + r.width / 2 - s.left) / stageScale;
  const top = (r.top - s.top) / stageScale;
  const bottom = (r.bottom - s.top) / stageScale;
  const left = (r.left - s.left) / stageScale;
  const right = (r.right - s.left) / stageScale;
  const cy = (r.top + r.height / 2 - s.top) / stageScale;
  const pos =
    place === "top" ? { x: cx, y: top } : place === "bottom" ? { x: cx, y: bottom } : place === "right" ? { x: right, y: cy } : { x: left, y: cy };
  for (const l of listeners) l({ content, place, ...pos });
}

export function hideTip(): void {
  for (const l of listeners) l(null);
}

export function tipProps(content: React.ReactNode | (() => React.ReactNode), place: TipState["place"] = "top") {
  return {
    onMouseEnter: (e: React.MouseEvent) => showTip(typeof content === "function" ? (content as () => React.ReactNode)() : content, e.currentTarget, place),
    onMouseLeave: () => hideTip(),
    onFocus: (e: React.FocusEvent) => showTip(typeof content === "function" ? (content as () => React.ReactNode)() : content, e.currentTarget, place),
    onBlur: () => hideTip(),
  };
}

export function TipLayer(): React.ReactElement | null {
  const [tip, setTip] = React.useState<TipState | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const [adj, setAdj] = React.useState({ dx: 0, dy: 0 });
  React.useEffect(() => {
    listeners.add(setTip);
    return () => {
      listeners.delete(setTip);
    };
  }, []);
  React.useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    let x = tip.x;
    let y = tip.y;
    if (tip.place === "top") {
      x -= w / 2;
      y -= h + 10;
    } else if (tip.place === "bottom") {
      x -= w / 2;
      y += 10;
    } else if (tip.place === "right") {
      x += 10;
      y -= h / 2;
    } else {
      x -= w + 10;
      y -= h / 2;
    }
    x = Math.max(8, Math.min(1280 - w - 8, x));
    y = Math.max(8, Math.min(720 - h - 8, y));
    setAdj({ dx: x, dy: y });
  }, [tip]);
  if (!tip) return null;
  return (
    <div ref={ref} className="tip" style={{ left: adj.dx, top: adj.dy }} role="tooltip">
      {tip.content}
    </div>
  );
}
