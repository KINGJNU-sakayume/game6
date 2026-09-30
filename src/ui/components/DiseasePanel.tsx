// 문제 패널: 라이트박스 위 필름 + 주호소(확진 뒤 진단명) + 임상 압박(의도) + 질병 부담 + 감별 진단 기록지
import React from "react";
import { gradeLabel } from "../../core";
import type { DamagePreview, EnemyView, IntentPart, IntentView } from "../../core";
import type { Fx } from "../controller";
import { Film } from "./Film";
import { Floats, Stamps, isActive, useFxExpiry } from "./Fx";
import { IntentIcon } from "./icons";
import { tipProps } from "../tooltip";
import { Differential } from "./Differential";

const TIER_LABEL: Record<string, string> = { normal: "", elite: "급변", gate: "관문", boss: "주 진단" };

function intentText(p: IntentPart): string {
  if (p.kind === "attack") return `${p.value ?? 0}${p.hits && p.hits > 1 ? `×${p.hits}` : ""}`;
  if (p.kind === "defend") return `${p.value ?? 0}`;
  if (p.kind === "complication") return `${p.value ?? ""}턴`;
  return "";
}

function intentTip(it: IntentView): React.ReactNode {
  return (
    <>
      <div className="tip-title">
        {it.pressureLabel} · {it.bandLabel}
        {it.moveName ? ` — ${it.moveName}` : ""}
      </div>
      {it.parts ? (
        it.parts.map((p, i) => (
          <div key={i}>
            {p.kind === "attack" && `활력 ${p.value}${p.hits && p.hits > 1 ? ` × ${p.hits}회` : ""}${p.label ? " (안정화 무시)" : ""} — 안정화가 먼저 막는다`}
            {p.kind === "debuff" && `환자에게 ${p.label}`}
            {p.kind === "buff" && `질병 강화: ${p.label}`}
            {p.kind === "defend" && `질병이 버틴다 (질병 안정화 ${p.value})`}
            {p.kind === "complication" && `합병증 예고: ${p.value}턴 뒤 발동`}
            {p.kind === "card" && `덱에 ${p.label} 카드를 넣는다`}
            {p.kind === "special" && (p.label ?? "알 수 없음")}
          </div>
        ))
      ) : (
        <>
          <div>
            예상 활력 손실 {it.bandRange} (약 {it.estimate}) — 안정화가 먼저 막는다
          </div>
          {it.pressure === "complication" && <div>합병증을 예고한다. 예고된 턴이 되면 크게 나빠진다</div>}
          <div className="tip-sub">확진 전에는 어느 방향으로 얼마나 나빠질지만 안다. 정확한 수치와 내용은 일어난 뒤에야 보인다.</div>
        </>
      )}
    </>
  );
}

function IntentBody({ it, small }: { it: IntentView; small?: boolean }) {
  if (it.parts)
    return (
      <>
        {it.parts.map((p, i) => (
          <span key={i} className={`intent-part k-${p.kind}`}>
            <IntentIcon kind={p.kind} size={small ? 14 : p.kind === "attack" ? 22 : 18} />
            {intentText(p) && <span className="intent-num num">{intentText(p)}</span>}
          </span>
        ))}
      </>
    );
  return (
    <span className={`intent-part intent-band b-${it.band}`}>
      <IntentIcon kind={it.pressure === "complication" ? "complication" : "attack"} size={small ? 14 : 20} />
      <span className="intent-num">{it.bandLabel}</span>
    </span>
  );
}

function IntentRow({ view }: { view: EnemyView }) {
  const [first, second] = view.intents;
  if (!first) return <div className="intent-row" />;
  return (
    <div className="intent-row">
      <div className={`intent pr-${first.pressure}`} tabIndex={0} {...tipProps(intentTip(first), "top")}>
        <span className="intent-pressure">{first.pressureLabel}</span>
        <IntentBody it={first} />
        {first.moveName && <span className="intent-name">{first.moveName}</span>}
      </div>
      {second && (
        <div className="intent intent-next" tabIndex={0} {...tipProps(intentTip(second), "top")}>
          <span className="intent-next-label">다음</span>
          <IntentBody it={second} small />
        </div>
      )}
    </div>
  );
}

function PreviewTag({ preview }: { preview: DamagePreview }) {
  if (preview.known) {
    return (
      <span className={`preview ${preview.harmful ? "is-harm" : ""}`}>
        {preview.harmful ? "금기" : preview.grade === "not_indicated" ? "적응증 아님" : preview.grade === "immune" ? "무효" : `−${preview.amount}`}
        {preview.grade && !preview.harmful && !["generic", "not_indicated", "immune"].includes(preview.grade) && <small>{gradeLabel(preview.grade)}</small>}
      </span>
    );
  }
  // 확진 전: 가설별 교과서 반응
  return (
    <span className="preview is-unknown preview-ddx">
      {(preview.byHypothesis ?? []).map((h) => (
        <span key={h.diseaseId} className={`pv-row g-${h.grade}`}>
          <span className="pv-name">{h.nameKo}</span>
          <b>{h.grade === "harmful" ? "금기" : h.grade === "varies" ? "균에 따라" : h.amount !== undefined ? `−${h.amount}` : gradeLabel(h.grade)}</b>
        </span>
      ))}
    </span>
  );
}

export function DiseasePanel({
  view,
  fx,
  targeting,
  hovered,
  preview,
  compact,
  onClick,
  onHover,
}: {
  view: EnemyView;
  fx: Fx[];
  targeting: boolean;
  hovered: boolean;
  preview?: DamagePreview;
  compact?: boolean;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
}) {
  useFxExpiry(fx);
  const shaking = isActive(fx, "shake", view.uid);
  const pct = view.maxSeverity > 0 ? view.severity / view.maxSeverity : 0;
  return (
    <article
      className={`disease tier-${view.tier} ${targeting ? "is-targetable" : ""} ${hovered ? "is-hovered" : ""} ${shaking ? "is-shaking" : ""} ${view.cured ? "is-cured" : ""}`}
      data-enemy={view.uid}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      aria-label={`${view.title}, 질병 부담 ${view.severity}/${view.maxSeverity}`}
    >
      <div className="dz-main" onClick={onClick}>
        <IntentRow view={view} />
        <div className="lightbox">
          <Film region={view.art.region} lesion={view.art.lesion} knowledge={view.knowledge} uid={view.uid} cured={view.cured} />
          {TIER_LABEL[view.tier] && <span className="tier-tag">{TIER_LABEL[view.tier]}</span>}
          {view.countdowns.map((cd, i) => (
            <span
              key={i}
              className="countdown"
              style={{ top: 10 + i * 34 }}
              {...tipProps(<><div className="tip-title">합병증 예고: {cd.label}</div>{cd.turnsLeft}턴 뒤 질병의 턴이 시작될 때 발동한다. 그 전에 결정적 치료로 막을 수 있다.</>, "left")}
            >
              <IntentIcon kind="complication" size={15} />
              <b className="num">{cd.turnsLeft}</b>
            </span>
          ))}
          {view.knowledge >= 2 && <span className="dx-stamp">확진</span>}
          <Stamps fx={fx} target={view.uid} />
          <Floats fx={fx} target={view.uid} />
          {preview && hovered && targeting && <PreviewTag preview={preview} />}
        </div>

        <div className="dz-name">
          {view.knowledge >= 2 ? (
            <>
              <div className="dz-title">{view.confirmedName ?? view.title}</div>
              <div className="dz-en">
                {view.nameEn}
                {view.variantName && <span className="dz-variant"> · {view.variantName}</span>}
                {view.phaseName && <span className="dz-phase"> · {view.phaseName}</span>}
              </div>
            </>
          ) : (
            <>
              <div className="dz-tape" {...tipProps(<><div className="tip-title">주호소: {view.complaint}</div>{view.vignette}</>, "bottom")}>
                <span className="hand dz-cc">{view.complaint}</span>
              </div>
              {!compact && <div className="dz-vignette">{view.vignette}</div>}
            </>
          )}
        </div>

        <div className="dz-sev" {...tipProps(<><div className="tip-title">질병 부담 {view.severity}/{view.maxSeverity}</div>치료로 0이 되면 이 문제가 해결된다. 진단 행위는 부담을 줄이지 않는다.</>, "bottom")}>
          <span className="dz-sev-label">질병 부담</span>
          <span className="dz-bar">
            <span style={{ width: `${pct * 100}%` }} />
          </span>
          <span className="dz-sev-num num">
            {view.severity}
            <small>/{view.maxSeverity}</small>
          </span>
          {view.stability > 0 && (
            <span className="dz-block num" title="질병 안정화">
              <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 2 L17 5 V10 C17 14 14 17 10 18.5 C6 17 3 14 3 10 V5 Z" fill="var(--int-defend)" />
              </svg>
              {view.stability}
            </span>
          )}
        </div>

        {(view.statuses.length > 0 || view.resistance.length > 0 || (view.passives?.length ?? 0) > 0) && (
          <div className="dz-status">
            {view.statuses.map((s) => (
              <span key={s.id} className={`schip ${s.debuff ? "is-debuff" : "is-buff"}`} {...tipProps(<><div className="tip-title">{s.nameKo} {s.stacks}</div>{s.description}</>, "bottom")}>
                {s.nameKo} <b>{s.stacks}</b>
              </span>
            ))}
            {view.resistance.map((r) => (
              <span key={r.tag} className="schip is-res" {...tipProps(<><div className="tip-title">획득 내성: {r.nameKo} {r.stacks}</div>이 계열 항생제 효과 ×{Math.max(40, 100 - 20 * r.stacks)}%. 원인균을 모른 채 쓰거나 광범위 항생제를 쓰면 쌓인다.</>, "bottom")}>
                내성 {r.nameKo} <b>{r.stacks}</b>
              </span>
            ))}
            {(view.passives?.length ?? 0) > 0 && (
              <span className="schip is-passive" {...tipProps(<><div className="tip-title">질병 특성</div>{view.passives!.map((t, i) => <div key={i}>· {t}</div>)}</>, "bottom")}>
                특성 <b>{view.passives!.length}</b>
              </span>
            )}
          </div>
        )}
      </div>
      <Differential view={view} compact={compact} />
    </article>
  );
}
