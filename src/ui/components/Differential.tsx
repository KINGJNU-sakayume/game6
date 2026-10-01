// 감별 진단 기록지: 가설과 신뢰도, 작업 진단, 소견 기록, 원인균, 결과 대기.
// 모든 내용은 EnemyView(플레이어가 아는 정보)에서만 온다.
import React from "react";
import { controller } from "../controller";
import { tipProps } from "../tooltip";
import { gradeLabel } from "../../core";
import type { EnemyView, Grade, HypothesisView } from "../../core";

const LEVEL_CLASS: Record<string, string> = {
  strong: "lv-strong",
  suspected: "lv-suspected",
  possible: "lv-possible",
  unlikely: "lv-unlikely",
  excluded: "lv-excluded",
};

/** 가설 색: 소견 표시에 쓰는 작은 점의 색 (순서 기준, 정답과 무관) */
const DOT = ["#2346a0", "#b0425a", "#3c7d4a", "#c07a12"];

function HypothesisTip({ h }: { h: HypothesisView }) {
  return (
    <div className="hx-tip">
      <div className="tip-title">
        {h.nameKo} <span className="tip-en">{h.nameEn}</span>
      </div>
      <div className="tip-sub">
        {h.category} · 신뢰도 <b>{h.levelLabel}</b> (지지 {h.support} / 반대 {h.against})
      </div>
      <p>{h.keyFeatures}</p>
      {h.firstLine.length > 0 && (
        <div>
          <b>1차 치료</b> {h.firstLine.join(", ")}
        </div>
      )}
      {h.avoid.length > 0 && (
        <div className="hx-avoid">
          <b>피할 것</b> {h.avoid.join(", ")}
        </div>
      )}
      {h.forFindings.length > 0 && <div className="hx-for">＋ {h.forFindings.join(" · ")}</div>}
      {h.againstFindings.length > 0 && <div className="hx-against">－ {h.againstFindings.join(" · ")}</div>}
      {h.casebook && h.expected && h.expected.length > 0 && (
        <div className="hx-expected">
          <div className="tip-sub">증례집: 이 병이면 보일 소견</div>
          {h.expected.slice(0, 6).map((x) => (
            <div key={x.channelName}>
              <span className="mono">{x.channelName}</span> {x.text}
            </div>
          ))}
        </div>
      )}
      <div className="tip-sub">
        {h.isWorkingDx
          ? "현재 작업 진단. 1차 치료가 계획 보너스(×1.3)를 받는다."
          : h.commitCost === null
            ? h.commitReason ?? "작업 진단으로 정할 수 없다"
            : `눌러서 작업 진단으로 정한다${h.commitCost > 0 ? ` (변경: 오더 ${h.commitCost})` : " (무료)"}`}
      </div>
    </div>
  );
}

export function Differential({ view, compact }: { view: EnemyView; compact?: boolean }) {
  const listRef = React.useRef<HTMLOListElement>(null);
  const colorOf = (id: string) => DOT[view.hypotheses.findIndex((h) => h.diseaseId === id) % DOT.length]!;
  React.useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [view.findings.length]);
  const commit = (h: HypothesisView) => {
    if (h.isWorkingDx || h.commitCost === null || view.cured) return;
    controller.dispatch({ type: "commit_diagnosis", targetUid: view.uid, diseaseId: h.diseaseId });
  };
  const shownFindings = compact ? view.findings.slice(-3) : view.findings;
  return (
    <section className={`ddx ${compact ? "is-compact" : ""}`} aria-label={`${view.complaint} 감별 진단`}>
      <header className="ddx-head">
        <span className="ddx-title">감별 진단</span>
        <span className="ddx-wd">
          작업 진단: <b>{view.workingDx ? view.workingDx.nameKo : "미정"}</b>
        </span>
      </header>
      <ul className="ddx-hyps">
        {view.hypotheses.map((h) => {
          const canCommit = !h.isWorkingDx && h.commitCost !== null && !view.cured;
          return (
            <li key={h.diseaseId} className={`hyp ${LEVEL_CLASS[h.level]} ${h.isWorkingDx ? "is-wd" : ""}`}>
              <button
                className="hyp-btn"
                onClick={() => commit(h)}
                disabled={!canCommit && !h.isWorkingDx}
                aria-label={`${h.nameKo}, ${h.levelLabel}${h.isWorkingDx ? ", 작업 진단" : canCommit ? ", 눌러서 작업 진단으로" : ""}`}
                {...tipProps(<HypothesisTip h={h} />, "left")}
              >
                <i className="hyp-dot" style={{ background: colorOf(h.diseaseId) }} aria-hidden="true" />
                <span className="hyp-name">{h.nameKo}</span>
                <span className="hyp-meter" aria-hidden="true">
                  {[1, 2, 3, 4].map((k) => (
                    <i key={k} className={k <= ({ excluded: 0, unlikely: 1, possible: 2, suspected: 3, strong: 4 } as const)[h.level] ? "on" : ""} />
                  ))}
                </span>
                <span className="hyp-level">{h.levelLabel}</span>
                {h.isWorkingDx ? (
                  <span className="hyp-wd" aria-hidden="true">
                    작업 진단
                  </span>
                ) : canCommit ? (
                  <span className="hyp-commit" aria-hidden="true">
                    {h.commitCost ? `변경 ${h.commitCost}` : "정하기"}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="ddx-sub">
        <span>소견 {view.findings.length}</span>
        {view.pending.map((p, i) => (
          <span key={i} className="ddx-pending" {...tipProps(<><div className="tip-title">결과 대기</div>{p.label}: {p.turnsLeft}턴 뒤 턴 시작에 나온다.</>, "top")}>
            ⧗ {p.label} {p.turnsLeft}턴
          </span>
        ))}
      </div>
      <ol className="ddx-findings" ref={listRef}>
        {shownFindings.map((f) => (
          <li key={f.index} className={`fnd ${f.response ? `rx-${f.response}` : ""}`}>
            <span className="fnd-ch">{f.channelName}</span>
            <span className="fnd-text">{f.text}</span>
            <span className="fnd-signs" aria-label={f.effects.map((x) => `${x.nameKo} ${x.sign > 0 ? "지지" : x.sign < 0 ? "반대" : "무관"}`).join(", ")}>
              {f.effects.map((x) => (
                <b key={x.diseaseId} className={`sign s${x.sign}`} style={{ color: colorOf(x.diseaseId) }}>
                  {x.sign > 0 ? "+" : x.sign < 0 ? "−" : "·"}
                </b>
              ))}
            </span>
          </li>
        ))}
      </ol>

      {view.organism.relevant && (
        <div
          className="ddx-org"
          {...tipProps(
            <>
              <div className="tip-title">원인균</div>
              {view.organism.known ? (
                <>
                  배양으로 확인: <b>{view.organism.known}</b>. 좁은 항생제로 바꾸면 내성이 쌓이지 않는다.
                  {view.organism.antibiogram && (
                    <div className="abx-grid">
                      {view.organism.antibiogram.map((c) => (
                        <span key={c.cardId} className={`abx-cell g-${c.grade === "?" ? "unknown" : c.grade}`}>
                          <b>{c.short}</b>
                          {gradeLabel(c.grade as Grade)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  원인균을 모르고 쓴 항생제는 내성을 키운다. 배양 검사로 확인한다. 후보는 감별 목록과 그람 염색, 치료 반응으로 좁혀진다.
                  {view.organism.chart && <div className="tip-sub">환자 차트의 앞선 배양: {view.organism.chart.join(", ")} — 같은 균일 가능성이 높다</div>}
                </>
              )}
            </>,
            "top",
          )}
        >
          <span className="org-label">원인균</span>
          {view.organism.known ? (
            <b>{view.organism.known}</b>
          ) : (
            <>
              {view.organism.gram && <span className="org-gram">{view.organism.gram}</span>}
              <span className="org-cands">{view.organism.candidates.join(" · ") || "미상"}</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
