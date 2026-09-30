import React from "react";
import { cardDef, relicDef } from "../../core";
import type { GameState } from "../../core";
import { controller } from "../controller";
import { Card } from "../components/Card";
import { RelicBadge } from "../components/Relic";

const SOURCE_TITLE: Record<string, { title: string; sub: string }> = {
  normal: { title: "호출 처리 완료", sub: "환자가 고비를 넘겼다" },
  elite: { title: "급변 대응 완료", sub: "환자가 안정을 되찾았다" },
  gate: { title: "관문 통과", sub: "출혈이 멎었다. 중환자실로 옮긴다" },
  boss: { title: "주 진단 해결", sub: "다음 병동으로 옮길 준비를 한다" },
  treasure: { title: "가이드라인 개정", sub: "학회 지침이 새로 나왔다" },
};

export function RewardScreen({ state }: { state: GameState }) {
  const r = state.reward!;
  const [picking, setPicking] = React.useState<number | null>(null);
  const t = SOURCE_TITLE[r.source]!;
  const cardItem = picking !== null ? r.items[picking] : undefined;
  return (
    <div className="reward-wrap">
      <section className="sheet reward-sheet">
        <div className="sheet-head">
          <div>
            <div className="eyebrow">경과 기록 · 처치 결과</div>
            <h2 className="reward-title">{t.title}</h2>
            <div className="reward-sub hand">{t.sub}</div>
          </div>
          <div className="form-code">RX-SLIP {String(state.run.stats.combatsWon).padStart(3, "0")}</div>
        </div>
        <ul className="reward-list">
          {r.items.map((it, i) => (
            <li key={i} className={`reward-item ${it.taken ? "is-taken" : ""}`}>
              <button
                className="reward-row"
                disabled={it.taken}
                onClick={() => {
                  if (it.kind === "card") setPicking(i);
                  else controller.dispatch({ type: "claim_reward", item: i });
                }}
              >
                <span className={`checkbox ${it.taken ? "is-on" : ""}`} aria-hidden="true" />
                {it.kind === "gold" && (
                  <span className="reward-text">
                    예산 <b className="num">+{it.amount}</b>
                  </span>
                )}
                {it.kind === "card" && (
                  <span className="reward-text">
                    처방 추가 <span className="reward-dim">— {it.options.length}장 중 1장 고르기</span>
                  </span>
                )}
                {it.kind === "relic" && (
                  <span className="reward-text reward-relic">
                    <RelicBadge id={it.relicId} /> 가이드라인: <b>{relicDef(it.relicId).nameKo}</b>
                    <span className="reward-dim">{relicDef(it.relicId).description}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="reward-foot">
          <button className="stamp-btn" onClick={() => controller.dispatch({ type: "leave" })}>
            {r.source === "boss" || r.source === "gate" ? "전동 준비" : "처리 완료"}
          </button>
        </div>
      </section>

      {cardItem && cardItem.kind === "card" && picking !== null && (
        <div className="overlay" onClick={() => setPicking(null)}>
          <div className="pick-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pick-head">
              <h3>처방 추가</h3>
              <span className="hand">한 장을 골라 처방 목록에 넣는다</span>
            </div>
            <div className="pick-cards">
              {cardItem.options.map((id, k) => (
                <div key={id} className="pick-card">
                  <Card
                    cardId={id}
                    size="lg"
                    onClick={() => {
                      controller.dispatch({ type: "claim_reward", item: picking, choice: k });
                      setPicking(null);
                    }}
                    tabIndex={0}
                  />
                  <span className="pick-kind">{cardDef(id).kind === "drug" ? "약물" : cardDef(id).kind === "diagnostic" ? "진단" : "처치"}</span>
                </div>
              ))}
            </div>
            <div className="pick-foot">
              <button
                className="btn"
                onClick={() => {
                  controller.dispatch({ type: "skip_reward", item: picking });
                  setPicking(null);
                }}
              >
                처방하지 않음
              </button>
              <button className="btn btn-ghost" onClick={() => setPicking(null)}>
                나중에
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
