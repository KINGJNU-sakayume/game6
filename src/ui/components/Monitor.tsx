// 환자 모니터: 활력(심박 초록), 안정화(청록), 상태 경보, 투여 중 약물(주입 펌프)
import React from "react";
import { cardDef, patientStatusViews, tagDef } from "../../core";
import type { GameState } from "../../core";
import type { Fx } from "../controller";
import { Floats, isActive, useFxExpiry } from "./Fx";
import { tipProps } from "../tooltip";

function useEased(target: number, ms = 500): number {
  const [v, setV] = React.useState(target);
  const from = React.useRef(target);
  React.useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const e = 1 - (1 - t) * (1 - t);
      const cur = Math.round(a + (target - a) * e);
      setV(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);
  return v;
}

/** PQRST 파형 한 주기 (가로 100) */
const BEAT = "M0 30 L18 30 C20 30 21 26 23 26 C25 26 26 30 28 30 L34 30 L36 33 L39 6 L42 40 L45 30 L55 30 C58 30 60 22 65 22 C70 22 72 30 75 30 L100 30";

export function Monitor({ state, fx }: { state: GameState; fx: Fx[] }) {
  const c = state.combat!;
  const r = state.run;
  useFxExpiry(fx);
  const vit = useEased(r.vitality);
  const stab = useEased(c.stability, 300);
  const pct = r.vitality / r.maxVitality;
  const hr = Math.round(72 + (1 - pct) * 62);
  const beatSec = 60 / hr;
  const flashing = isActive(fx, "flash", "patient");
  const statuses = patientStatusViews(state);
  const clock = (() => {
    const mins = 8 * 60 + (c.turn - 1) * 15;
    return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  })();
  const bed = r.act === 1 ? "ER-07" : r.act === 2 ? "7W-12" : "MICU-3";
  return (
    <section className={`monitor ${flashing ? "is-flash" : ""} ${pct <= 0.3 ? "is-critical" : ""}`} aria-label="환자 모니터">
      <div className="mon-head">
        <span>
          {r.patient.surname}○○ {r.patient.sex}/{r.patient.age}
        </span>
        <span>{bed}</span>
        <span className="mon-clock">{clock}</span>
      </div>
      <div className="mon-ecg" aria-hidden="true">
        <svg viewBox="0 0 400 48" preserveAspectRatio="none" className="ecg-svg">
          <g className="ecg-scroll" style={{ animationDuration: `${beatSec * 4}s` }}>
            {Array.from({ length: 8 }, (_, i) => (
              <path key={i} d={BEAT} transform={`translate(${i * 100} 0)`} className="ecg-path" />
            ))}
          </g>
        </svg>
        <span className="ecg-label">II</span>
      </div>
      <div className="mon-grid">
        <div className="mon-vital" {...tipProps(<><div className="tip-title">활력 {r.vitality}/{r.maxVitality}</div>0이 되면 환자가 사망한다. 회복은 당직실·이벤트·일부 카드로만 가능하다.</>, "right")}>
          <div className="mon-label">
            활력 <span className="mon-hr">HR {hr}</span>
          </div>
          <div className="mon-big hr-color num">
            {vit}
            <span className="mon-max">/{r.maxVitality}</span>
          </div>
          <div className="mon-bar">
            <span style={{ width: `${Math.max(0, pct) * 100}%` }} />
          </div>
          <Floats fx={fx} target="patient" />
        </div>
        <div className="mon-stab" {...tipProps(<><div className="tip-title">안정화 {c.stability}</div>들어오는 피해를 먼저 흡수한다. 내 턴이 시작되면 0이 된다.</>, "right")}>
          <div className="mon-label">안정화</div>
          <div className="mon-big spo2-color num">{stab}</div>
        </div>
      </div>
      <div className="mon-alarms">
        {statuses.length === 0 && <span className="mon-ok">경보 없음</span>}
        {statuses.map((s) => (
          <span key={s.id} className={`alarm ${s.debuff ? "is-bad" : ""}`} {...tipProps(<><div className="tip-title">{s.nameKo} {s.stacks}</div>{s.description}</>, "right")}>
            {s.nameKo} <b>{s.stacks}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

export function PumpRack({ state }: { state: GameState }) {
  const c = state.combat!;
  const drugs = [...c.activeDrugs].sort((a, b) => a.order - b.order);
  return (
    <section className="pumps" aria-label="투여 중 약물">
      <div className="pumps-head">
        <span>투여 중</span>
        <span className="mono">{drugs.length}</span>
      </div>
      {drugs.length === 0 && <div className="pump-empty">투여 중인 약물 없음</div>}
      <div className="pump-list">
        {drugs.map((d) => {
          const def = cardDef(d.cardId, d.upgraded);
          const codes = d.tags
            .filter((t) => tagDef(t)?.kind !== "therapeutic" || true)
            .slice(0, 3)
            .map((t) => tagDef(t)?.nameKo ?? t);
          return (
            <div
              key={d.uid}
              className="pump"
              {...tipProps(
                <>
                  <div className="tip-title">
                    {def.nameKo} <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>{def.nameEn}</span>
                  </div>
                  남은 지속 {d.turnsLeft}턴 (턴 시작 처리의 마지막에 1 줄어든다)
                  <div className="tip-sub">{d.tags.map((t) => tagDef(t)?.nameKo ?? t).join(" · ")}</div>
                </>,
                "right",
              )}
            >
              <div className="pump-lcd">
                <span className="pump-name">{def.nameEn.toUpperCase().slice(0, 16)}</span>
                <span className="pump-turns">
                  {Array.from({ length: Math.max(d.turnsLeft, 1) }, (_, i) => (
                    <i key={i} className={i < d.turnsLeft ? "on" : ""} />
                  ))}
                </span>
              </div>
              <div className="pump-meta">
                <span>{def.nameKo}</span>
                <span className="pump-codes">{codes.join(" · ")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
