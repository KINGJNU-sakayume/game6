// 임상 결정 창: choose_option 하나를 보여 준다. 손패 자리 위에 떠서 감별 기록지는 계속 보인다.
import React from "react";
import { cardDef } from "../../core";
import type { GameState, PendingChoice } from "../../core";
import { controller } from "../controller";
import { Card } from "./Card";

type Choice = Extract<PendingChoice, { kind: "choose_option" }>;

export function DecisionPanel({ state }: { state: GameState }) {
  const p = state.pending as Choice;
  const orders = state.combat?.orders ?? 0;
  const pick = React.useCallback((id: string) => controller.dispatch({ type: "choose_option", optionId: id }), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= p.options.length) {
        const o = p.options[n - 1]!;
        if (o.available) pick(o.id);
      } else if ((e.key === "Escape" || e.key === "0") && p.canSkip) pick("skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p, pick]);

  const source = p.source ? cardDef(p.source).nameKo : undefined;
  return (
    <div className="decision-scrim" role="dialog" aria-modal="true" aria-label={`${p.title}: ${p.prompt}`}>
      <section className="decision">
        <header className="decision-head">
          <div className="decision-form mono">ORDER DECISION</div>
          <div className="decision-trail">
            {source && <span className="trail-src">{source}</span>}
            {p.trail.map((t, i) => (
              <span key={i} className="trail-step">
                › {t}
              </span>
            ))}
          </div>
          <h3 className="decision-title">
            {p.title !== source && <span className="decision-t">{p.title} · </span>}
            {p.prompt}
          </h3>
          <div className="decision-meta">
            남은 오더 <b className="num">{orders}</b>
            {p.picksAfter > 0 && <span> · 이어서 {p.picksAfter}개 더 고른다</span>}
          </div>
        </header>
        <ol className={`decision-options n${p.options.length}`}>
          {p.options.map((o, i) => (
            <li key={o.id}>
              <button
                className={`opt ${o.available ? "" : "is-off"} ${o.cardId ? "has-card" : ""}`}
                disabled={!o.available}
                onClick={() => pick(o.id)}
                aria-label={`${i + 1}. ${o.label}. ${o.detail}${o.risk ? `. 위험: ${o.risk}` : ""}${o.available ? "" : `. 고를 수 없음: ${o.reason ?? ""}`}`}
              >
                <span className="opt-key mono" aria-hidden="true">
                  {i + 1}
                </span>
                {o.cost > 0 && <span className="opt-cost">+{o.cost} 오더</span>}
                <span className="opt-label">{o.label}</span>
                {o.cardId && (
                  <span className="opt-card" aria-hidden="true">
                    <Card cardId={o.cardId} upgraded={o.upgraded} size="sm" />
                  </span>
                )}
                <span className="opt-detail">{o.detail}</span>
                {o.hint && <span className="opt-hint">{o.hint}</span>}
                {o.risk && <span className="opt-risk">⚠ {o.risk}</span>}
                {!o.available && <span className="opt-reason">{o.reason}</span>}
              </button>
            </li>
          ))}
        </ol>
        {p.canSkip && (
          <footer className="decision-foot">
            <button className="btn" onClick={() => pick("skip")}>
              {p.picksAfter > 0 || p.trail.length > 0 ? "여기까지 (Esc)" : "고르지 않음 (Esc)"}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
