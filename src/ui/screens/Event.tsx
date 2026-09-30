import React from "react";
import { eventDef, quizDef } from "../../core";
import type { GameState } from "../../core";
import { controller } from "../controller";

export function EventScreen({ state }: { state: GameState }) {
  const ev = state.event!;
  const def = eventDef(ev.eventId);
  const q = ev.quiz ? quizDef(ev.quiz.questionId) : null;
  const resolved = ev.resolved;
  return (
    <div className="event-wrap">
      <section className="sheet event-sheet">
        <div className="sheet-head">
          <div>
            <div className="eyebrow">돌발 상황 · 간호 기록 메모</div>
            <h2 className="event-title">{def.title}</h2>
          </div>
          <div className="form-code">NR-{String(state.run.floor).padStart(2, "0")}</div>
        </div>
        <div className="event-body">
          <p className="event-text">{def.body}</p>
          {q && ev.quiz && (
            <div className="quiz">
              <p className="quiz-q">
                <span className="quiz-mark">Q.</span> {q.question}
              </p>
              <ol className="quiz-options">
                {ev.quiz.order.map((optIdx, shown) => {
                  const chosen = resolved?.optionId === `q${shown}`;
                  const isAnswer = optIdx === q.answer;
                  return (
                    <li key={shown}>
                      <button
                        className={`quiz-opt ${resolved ? (isAnswer ? "is-answer" : chosen ? "is-wrong" : "") : ""}`}
                        disabled={!!resolved}
                        onClick={() => controller.dispatch({ type: "event_choose", optionId: `q${shown}` })}
                      >
                        <span className="quiz-num mono">{shown + 1}</span> {q.options[optIdx]}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {!q && !resolved && (
            <div className="event-options">
              {def.options.map((o) => {
                const locked = o.requires?.goldAtLeast !== undefined && state.run.gold < o.requires.goldAtLeast;
                return (
                  <button key={o.id} className="event-opt" disabled={locked} onClick={() => controller.dispatch({ type: "event_choose", optionId: o.id })}>
                    <span className="checkbox" aria-hidden="true" />
                    <span>
                      <b>{o.label}</b>
                      <span className="event-detail">{o.detail}</span>
                      {locked && <span className="event-lock">예산 {o.requires?.goldAtLeast} 필요</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {resolved && (
            <div className="event-result">
              {q && <span className={`quiz-stamp ${resolved.correct ? "is-ok" : "is-no"}`}>{resolved.correct ? "정답" : "오답"}</span>}
              <p className="hand event-result-text">{resolved.text}</p>
              {q && resolved.correct && <p className="event-reward">예산 +40, 처방 1장 최적화</p>}
            </div>
          )}
        </div>
        {resolved && (
          <div className="event-foot">
            <button className="stamp-btn" onClick={() => controller.dispatch({ type: "leave" })}>
              확인
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
