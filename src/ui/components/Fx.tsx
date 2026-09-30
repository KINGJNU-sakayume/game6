// 연출: 떠오르는 숫자, 토스트, 도장. 이벤트를 재생할 뿐 결과를 바꾸지 않는다.
import React from "react";
import type { Fx } from "../controller";

/** fx가 끝날 때 다시 그려 목록에서 빠지게 한다 */
export function useFxExpiry(fx: Fx[]): number {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const now = performance.now();
    const ends = fx.map((f) => f.at + f.dur - now).filter((d) => d > 0);
    if (!ends.length) return;
    const t = window.setTimeout(force, Math.min(...ends) + 30);
    return () => window.clearTimeout(t);
  });
  return performance.now();
}

function live(fx: Fx[], now: number, pred: (f: Fx) => boolean): Fx[] {
  return fx.filter((f) => pred(f) && f.at + f.dur > now);
}

export function Floats({ fx, target }: { fx: Fx[]; target: string }) {
  const now = useFxExpiry(fx);
  const items = live(fx, now, (f) => f.kind === "float" && f.target === target);
  return (
    <div className="floats" aria-hidden="true">
      {items.map((f, i) => (
        <span
          key={f.id}
          className={`float tone-${f.tone}`}
          style={{ animationDelay: `${Math.max(0, f.at - now)}ms`, animationDuration: `${f.dur}ms`, left: `${(i % 3) * 22 - 22}px` }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}

export function Stamps({ fx, target }: { fx: Fx[]; target: string }) {
  const now = useFxExpiry(fx);
  const items = live(fx, now, (f) => f.kind === "stamp" && f.target === target);
  return (
    <>
      {items.map((f) => (
        <span key={f.id} className={`fx-stamp ${f.text === "치료" ? "is-cure" : ""}`} style={{ animationDelay: `${Math.max(0, f.at - now)}ms`, animationDuration: `${f.dur}ms` }} aria-hidden="true">
          {f.text}
        </span>
      ))}
    </>
  );
}

export function isActive(fx: Fx[], kind: Fx["kind"], target: string, now = performance.now()): boolean {
  return fx.some((f) => f.kind === kind && f.target === target && f.at <= now && f.at + f.dur > now);
}

export function Toasts({ fx }: { fx: Fx[] }) {
  const now = useFxExpiry(fx);
  const items = live(fx, now, (f) => f.kind === "toast" || f.kind === "turn").slice(-4);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((f) =>
        f.kind === "turn" ? (
          <div key={f.id} className="turn-banner" style={{ animationDelay: `${Math.max(0, f.at - now)}ms`, animationDuration: `${f.dur}ms` }}>
            {f.text}
          </div>
        ) : (
          <div key={f.id} className={`toast tone-${f.tone}`} style={{ animationDelay: `${Math.max(0, f.at - now)}ms`, animationDuration: `${f.dur}ms` }}>
            <span className="toast-tag">{f.tone === "hazard" ? "위험" : f.tone === "synergy" ? "시너지" : f.tone === "antagonism" ? "길항" : f.tone === "side" ? "부작용" : "알림"}</span>
            {f.text}
          </div>
        ),
      )}
    </div>
  );
}
