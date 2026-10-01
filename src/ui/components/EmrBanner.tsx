// 상단 EMR 환자 배너
import React from "react";
import { cyrb128 } from "../../core";
import type { GameState } from "../../core";
import { RelicBadge } from "./Relic";
import { EcgMark } from "./icons";
import { tipProps } from "../tooltip";

const DEPT: Record<number, string> = { 1: "응급의학과 · 응급실", 2: "내과 · 7병동", 3: "내과계 중환자실" };
const PLACE: Record<number, string> = { 1: "응급실", 2: "병동", 3: "중환자실" };

export function registrationNo(seed: string): string {
  return String(cyrb128(seed)[0] % 100000000).padStart(8, "0");
}

export function EmrBanner({
  state,
  pulseRelic,
  onDeck,
  onFormulary,
  onCasebook,
  onMicro,
  onSettings,
}: {
  state: GameState;
  pulseRelic?: Set<string>;
  onDeck: () => void;
  onFormulary: () => void;
  onCasebook: () => void;
  onMicro?: () => void;
  onSettings: () => void;
}) {
  const r = state.run;
  const vitPct = r.vitality / r.maxVitality;
  const floors = r.map.floors;
  return (
    <header className="emr">
      <div className="emr-logo" aria-hidden="true">
        <span>ORDER</span>
        <span>SET</span>
      </div>
      <div className="emr-field emr-patient">
        <span className="emr-label">환자</span>
        <span className="emr-value">
          {r.patient.surname}○○ <span className="emr-dim">{r.patient.sex}/{r.patient.age}</span>
        </span>
      </div>
      <div className="emr-field">
        <span className="emr-label">등록번호</span>
        <span className="emr-value mono">{registrationNo(state.seed)}</span>
      </div>
      <div className="emr-field">
        <span className="emr-label">진료과</span>
        <span className="emr-value">{DEPT[r.act]}</span>
      </div>
      <div className="emr-field">
        <span className="emr-label">경과</span>
        <span className="emr-value">
          {r.act}막 {PLACE[r.act]} · <span className="mono">{Math.min(r.floor, floors)}/{floors}</span>
        </span>
      </div>
      <div className={`emr-field emr-vital ${vitPct <= 0.3 ? "is-low" : ""}`} {...tipProps(<><div className="tip-title">활력</div>환자의 체력. 0이 되면 사망한다.</>, "bottom")}>
        <span className="emr-label">활력</span>
        <span className="emr-value num">
          <EcgMark size={14} color={vitPct <= 0.3 ? "var(--stamp)" : "var(--kind-diagnostic)"} /> {r.vitality}
          <span className="emr-dim">/{r.maxVitality}</span>
        </span>
      </div>
      <div className="emr-field" {...tipProps(<><div className="tip-title">예산</div>약제부에서 카드·가이드라인을 사거나 처방을 정리하는 데 쓴다.</>, "bottom")}>
        <span className="emr-label">예산</span>
        <span className="emr-value num">{r.gold}</span>
      </div>
      <div className={`emr-relics ${r.relics.length > 8 ? "is-dense" : ""}`} aria-label="가이드라인">
        {r.relics.map((x) => (
          <RelicBadge key={x.id} id={x.id} pulse={pulseRelic?.has(x.id)} />
        ))}
      </div>
      <nav className="emr-actions">
        <button className="emr-btn" onClick={onDeck} title="처방 목록 (D)">
          처방 목록 <span className="mono">{r.deck.length}</span>
        </button>
        <button className="emr-btn" onClick={onFormulary} title="처방집: 투약 오더로 불러내는 약과 시술">
          처방집 <span className="mono">{r.formulary.length}</span>
        </button>
        <button
          className={`emr-btn ${(r.micro?.pressure ?? 0) >= 6 ? "is-warn" : ""}`}
          onClick={onMicro}
          title="미생물 기록: 배양 결과·감수성과 선택 압력"
        >
          미생물 <span className="mono">{r.micro?.results.length ?? 0}{(r.micro?.pending.length ?? 0) > 0 ? `+${r.micro!.pending.length}` : ""}</span>
          <span className="mono emr-dim"> 압력 {r.micro?.pressure ?? 0}</span>
        </button>
        <button className="emr-btn" onClick={onCasebook} title="증례집">
          증례집 <span className="mono">{Object.keys(r.casebook).length}</span>
        </button>
        <button className="emr-btn emr-icon" onClick={onSettings} aria-label="설정" title="설정">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 3.5 H12 M2 7 H12 M2 10.5 H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </nav>
    </header>
  );
}
