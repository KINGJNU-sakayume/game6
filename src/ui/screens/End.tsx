import React from "react";
import { cardDef, diseaseDef, db } from "../../core";
import type { GameState } from "../../core";
import { controller } from "../controller";
import { registrationNo } from "../components/EmrBanner";

function causeText(cause: string | undefined): string {
  if (!cause) return "원인 미상";
  if (cause.startsWith("se:")) return `치료 부작용 — ${cardDef(cause.slice(3)).nameKo}`;
  if (cause.startsWith("status:")) {
    const id = cause.slice(7);
    return id === "hypotension" ? "쇼크(저혈압)" : id === "bleeding_tendency" ? "출혈 경향" : id;
  }
  return diseaseDef(cause).nameKo;
}

export function EndScreen({ state }: { state: GameState }) {
  const r = state.run;
  const won = state.phase === "victory";
  const cured = r.stats.diseasesCured;
  const uniq = [...new Set(cured)];
  const topRules = Object.entries(r.stats.interactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const rules = new Map(db().interactions.map((x) => [x.id, x.text]));
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="end-wrap">
      <section className={`sheet end-sheet ${won ? "is-won" : "is-lost"}`}>
        <div className="sheet-head">
          <div>
            <div className="eyebrow">{won ? "퇴원 요약지 · DISCHARGE SUMMARY" : "경과 기록 종료 · RECORD CLOSED"}</div>
            <h2 className="end-title">{won ? "퇴원" : "환자 사망"}</h2>
          </div>
          <div className="end-id">
            <span>
              {r.patient.surname}○○ {r.patient.sex}/{r.patient.age}
            </span>
            <span className="mono">{registrationNo(state.seed)}</span>
          </div>
        </div>
        <div className="end-grid">
          <dl className="end-facts">
            <div>
              <dt>입원 경로</dt>
              <dd>
                {r.act}막 {r.act === 1 ? "응급실" : r.act === 2 ? "병동" : "중환자실"} · 누적 {r.stats.floorsClimbed}층
              </dd>
            </div>
            {!won && (
              <div>
                <dt>사망 원인</dt>
                <dd className="end-cause">{causeText(r.stats.deathCause)}</dd>
              </div>
            )}
            <div>
              <dt>치료한 질병</dt>
              <dd>{uniq.length ? uniq.map((d) => diseaseDef(d).nameKo).join(", ") : "없음"}</dd>
            </div>
            <div>
              <dt>확진</dt>
              <dd>{r.stats.diagnosesConfirmed}건</dd>
            </div>
            <div>
              <dt>금기 투여</dt>
              <dd>{r.stats.harmfulTreatments}건</dd>
            </div>
            <div>
              <dt>부작용 카드</dt>
              <dd>{r.stats.sideEffectsGained}장</dd>
            </div>
            <div>
              <dt>받은 피해</dt>
              <dd>{r.stats.damageTaken}</dd>
            </div>
            <div>
              <dt>상호작용</dt>
              <dd>{topRules.length ? topRules.map(([id, n]) => `${id} ${rules.get(id)?.split(" — ")[0] ?? ""} ×${n}`).join(" / ") : "없음"}</dd>
            </div>
          </dl>
          <div className="end-deck">
            <div className="eyebrow">최종 처방 목록 ({r.deck.length})</div>
            <ul>
              {r.deck.map((c) => (
                <li key={c.uid} className={`k-${cardDef(c.cardId).kind}`}>
                  {cardDef(c.cardId).nameKo}
                  {c.upgraded ? "+" : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <span className={`end-stamp ${won ? "" : "is-lost"}`} aria-hidden="true">
          {won ? "퇴원" : "종결"}
        </span>
        <div className="end-foot">
          <button
            className="btn"
            onClick={() => {
              const text = controller.exportRun();
              navigator.clipboard?.writeText(text).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "기록을 복사했다" : "재생 기록 복사"}
          </button>
          <button
            className="stamp-btn"
            onClick={() => {
              controller.abandon();
            }}
          >
            새 환자
          </button>
        </div>
      </section>
    </div>
  );
}
