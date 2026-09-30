import React from "react";
import { cardDef, diseaseDef, relicDef } from "../../core";
import type { GameState } from "../../core";
import { controller } from "../controller";
import { Card } from "../components/Card";
import { RelicBadge } from "../components/Relic";

const SLOT_LABEL: Record<string, { label: string; sub: string }> = {
  general: { label: "일반", sub: "어디서나 쓰는 행동 카드" },
  context: { label: "상황", sub: "이 병동 환자에게 듣는 처방" },
  special: { label: "특수", sub: "빌드를 정하는 선택" },
};

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
        {r.summary && r.summary.length > 0 && (
          <div className="discharge" aria-label="퇴원 요약">
            <div className="discharge-title mono">DISCHARGE SUMMARY · 퇴원 요약</div>
            {r.summary.map((row, i) => {
              const right = row.workingDx === row.diseaseId;
              return (
                <div key={i} className="discharge-row">
                  <span className="dc-cc">"{row.complaint}"</span>
                  <span className="dc-arrow">→</span>
                  <b className="dc-dx">
                    {diseaseDef(row.diseaseId).nameKo}
                    {row.variantName && <span className="dc-var"> ({row.variantName})</span>}
                  </b>
                  <span className={`dc-wd ${row.workingDx ? (right ? "is-right" : "is-wrong") : ""}`}>
                    {row.workingDx ? (right ? "작업 진단 일치" : `작업 진단: ${diseaseDef(row.workingDx).nameKo}`) : "작업 진단 없음"}
                  </span>
                  <span className="dc-meta">소견 {row.findings}{row.confirmed ? " · 확진" : ""}</span>
                </div>
              );
            })}
          </div>
        )}
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
                    {it.options.every((o) => cardDef(o.cardId).zone === "formulary") ? "다음 병동 처방집 신청" : "처방 추가"}{" "}
                    <span className="reward-dim">— {it.options.length}개 중 1개 고르기</span>
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
              <span className="hand">약·시술은 처방집으로, 행동 카드는 덱으로 간다</span>
            </div>
            <div className="pick-cards">
              {cardItem.options.map((o, k) => {
                const def = cardDef(o.cardId);
                const toFormulary = def.zone === "formulary";
                const owned = toFormulary && state.run.formulary.some((c) => c.cardId === o.cardId);
                return (
                  <div key={o.cardId} className={`pick-card slot-${o.slot}`}>
                    <Card
                      cardId={o.cardId}
                      size="lg"
                      onClick={() => {
                        controller.dispatch({ type: "claim_reward", item: picking, choice: k });
                        setPicking(null);
                      }}
                      tabIndex={0}
                    />
                    <span className="pick-kind">
                      <b className="pick-slot-name">{SLOT_LABEL[o.slot]?.label}</b> {toFormulary ? (owned ? "처방집 · 이미 있음 → 최적화" : "처방집에 추가") : "처방 목록(덱)에 추가"}
                    </span>
                    <span className="pick-slot">{SLOT_LABEL[o.slot]?.sub}</span>
                  </div>
                );
              })}
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
