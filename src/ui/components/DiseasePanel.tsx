// 질병 판독 패널: 라이트박스 위 필름 + 주호소/진단명 + 의도 + 중증도 + 진단 게이지 + 반응표
import React from "react";
import { gradeLabel } from "../../core";
import type { DamagePreview, EnemyView, Grade, IntentPart } from "../../core";
import type { Fx } from "../controller";
import { Film } from "./Film";
import { Floats, Stamps, isActive, useFxExpiry } from "./Fx";
import { IntentIcon } from "./icons";
import { tipProps } from "../tooltip";

const TIER_LABEL: Record<string, string> = { normal: "", elite: "급변", gate: "관문", boss: "주 진단" };

function intentText(p: IntentPart): string {
  if (p.kind === "attack") return `${p.value ?? 0}${p.hits && p.hits > 1 ? `×${p.hits}` : ""}`;
  if (p.kind === "defend") return `${p.value ?? 0}`;
  if (p.kind === "complication") return `${p.value ?? ""}턴`;
  return "";
}

function intentTip(parts: IntentPart[], moveName?: string): React.ReactNode {
  return (
    <>
      <div className="tip-title">{moveName ?? "이번 턴 의도"}</div>
      {parts.map((p, i) => (
        <div key={i}>
          {p.kind === "attack" && `공격 ${p.value}${p.hits && p.hits > 1 ? ` × ${p.hits}회` : ""}${p.label ? " (안정화 무시)" : ""} — 안정화가 먼저 막는다`}
          {p.kind === "debuff" && `환자에게 ${p.label}`}
          {p.kind === "buff" && `질병 강화: ${p.label}`}
          {p.kind === "defend" && `질병이 방어 ${p.value}을 얻는다`}
          {p.kind === "complication" && `합병증 예고: ${p.value}턴 뒤 발동`}
          {p.kind === "card" && `덱에 ${p.label} 카드를 넣는다`}
          {p.kind === "special" && (p.label ?? "알 수 없음")}
        </div>
      ))}
    </>
  );
}

function IntentRow({ view }: { view: EnemyView }) {
  const [first, second] = view.intents;
  if (!first) return <div className="intent-row" />;
  return (
    <div className="intent-row">
      <div className="intent" tabIndex={0} {...tipProps(intentTip(first.parts, first.moveName), "top")}>
        {first.parts.map((p, i) => (
          <span key={i} className={`intent-part k-${p.kind}`}>
            <IntentIcon kind={p.kind} size={p.kind === "attack" ? 22 : 18} />
            {intentText(p) && <span className="intent-num num">{intentText(p)}</span>}
          </span>
        ))}
        {first.moveName && <span className="intent-name">{first.moveName}</span>}
      </div>
      {second && (
        <div className="intent intent-next" tabIndex={0} {...tipProps(intentTip(second.parts, second.moveName), "top")}>
          <span className="intent-next-label">다음</span>
          {second.parts.map((p, i) => (
            <span key={i} className={`intent-part k-${p.kind}`}>
              <IntentIcon kind={p.kind} size={14} />
              {intentText(p) && <span className="intent-num num">{intentText(p)}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const GRADE_CLASS: Record<string, string> = {
  key: "g-key",
  weak: "g-weak",
  normal: "g-normal",
  resistant: "g-resistant",
  immune: "g-immune",
  harmful: "g-harmful",
  "?": "g-unknown",
};

function TableTip({ view }: { view: EnemyView }) {
  return (
    <div className="rtable">
      <div className="tip-title">치료 반응표 {view.category ? `· ${view.category.nameKo} 질환` : ""}</div>
      {view.table && view.table.length > 0 ? (
        <table>
          <tbody>
            {view.table.map((r) => (
              <tr key={r.tag}>
                <td>{r.label}</td>
                <td>
                  <span className={`gchip ${GRADE_CLASS[r.grade]}`}>{gradeLabel(r.grade as Grade | "?")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>적응이 되는 약물 계열이 없다. 처치로 치료한다.</div>
      )}
      <div className="rtable-abx">
        <span className="rtable-abx-title">항생제</span>
        {view.abx?.notInfection && <span className="gchip g-immune">무효 · 감염 아님</span>}
        {view.abx?.hidden && <span className="gchip g-unknown">원인균 확인 필요 (확진)</span>}
        {view.abx?.cells && (
          <>
            {view.abx.organism && <span className="rtable-org">{view.abx.organism}</span>}
            <span className="abx-grid">
              {view.abx.cells.map((c) => (
                <span key={c.cardId} className={`abx-cell ${GRADE_CLASS[c.grade]}`}>
                  <b>{c.short}</b>
                  {gradeLabel(c.grade as Grade)}
                </span>
              ))}
            </span>
          </>
        )}
      </div>
      <div className="tip-sub">반응표에 없는 약은 적응증이 없으면 듣지 않는다. 처치는 어디에나 든다.</div>
    </div>
  );
}

export function DiseasePanel({
  view,
  fx,
  targeting,
  hovered,
  preview,
  onClick,
  onHover,
}: {
  view: EnemyView;
  fx: Fx[];
  targeting: boolean;
  hovered: boolean;
  preview?: DamagePreview;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
}) {
  useFxExpiry(fx);
  const shaking = isActive(fx, "shake", view.uid);
  const pct = view.maxSeverity > 0 ? view.severity / view.maxSeverity : 0;
  const notable = (view.table ?? []).filter((r) => r.grade === "key" || r.grade === "weak" || r.grade === "harmful").slice(0, 4);
  const pips = Array.from({ length: view.confirmAt }, (_, i) => i < view.diagnosisPoints);
  return (
    <article
      className={`disease tier-${view.tier} ${targeting ? "is-targetable" : ""} ${hovered ? "is-hovered" : ""} ${shaking ? "is-shaking" : ""} ${view.cured ? "is-cured" : ""}`}
      data-enemy={view.uid}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      aria-label={`${view.title}, 중증도 ${view.severity}/${view.maxSeverity}`}
    >
      <IntentRow view={view} />
      <div className="lightbox">
        <Film region={view.art.region} lesion={view.art.lesion} knowledge={view.knowledge} uid={view.uid} cured={view.cured} />
        {TIER_LABEL[view.tier] && <span className="tier-tag">{TIER_LABEL[view.tier]}</span>}
        {view.countdowns.map((cd, i) => (
          <span
            key={i}
            className="countdown"
            style={{ top: 10 + i * 34 }}
            {...tipProps(<><div className="tip-title">합병증 예고: {cd.label}</div>{cd.turnsLeft}턴 뒤 질병의 턴이 시작될 때 발동한다. 그 전에 치료하면 막을 수 있다.</>, "left")}
          >
            <IntentIcon kind="complication" size={15} />
            <b className="num">{cd.turnsLeft}</b>
          </span>
        ))}
        {view.knowledge >= 2 && <span className="dx-stamp">확진</span>}
        <Stamps fx={fx} target={view.uid} />
        <Floats fx={fx} target={view.uid} />
        {preview && hovered && targeting && (
          <span className={`preview ${preview.harmful ? "is-harm" : ""} ${preview.known ? "" : "is-unknown"}`}>
            {preview.harmful ? "금기" : preview.grade === "not_indicated" ? "적응증 아님" : preview.grade === "immune" ? "무효" : `−${preview.amount}`}
            {preview.known && preview.grade && !preview.harmful && preview.grade !== "generic" && preview.grade !== "not_indicated" && preview.grade !== "immune" && (
              <small>{gradeLabel(preview.grade)}</small>
            )}
            {!preview.known && <small>반응 미상</small>}
          </span>
        )}
      </div>

      <div className="dz-name">
        {view.knowledge >= 2 ? (
          <>
            <div className="dz-title">{view.title}</div>
            <div className="dz-en">
              {view.nameEn}
              {view.variantName && <span className="dz-variant"> · {view.variantName}</span>}
              {view.phaseName && <span className="dz-phase"> · {view.phaseName}</span>}
            </div>
          </>
        ) : (
          <>
            <div className="dz-tape">
              <span className="hand dz-cc">{view.title}</span>
              {view.category && <span className="dz-cat">{view.category.nameKo} 질환 의심</span>}
            </div>
            {view.phaseName && <div className="dz-en dz-phase">{view.phaseName}</div>}
          </>
        )}
      </div>
      <ul className="dz-clues">
        {view.clues.map((c) => (
          <li key={c}>{c}</li>
        ))}
        {view.knowledge === 0 && <li className="dz-more">단서 {view.confirmAt > 0 ? "더 보기: 감별 필요" : ""}</li>}
      </ul>

      <div className="dz-sev" {...tipProps(<><div className="tip-title">중증도 {view.severity}/{view.maxSeverity}</div>0이 되면 치료된다.</>, "bottom")}>
        <span className="dz-sev-label">중증도</span>
        <span className="dz-bar">
          <span style={{ width: `${pct * 100}%` }} />
        </span>
        <span className="dz-sev-num num">
          {view.severity}
          <small>/{view.maxSeverity}</small>
        </span>
        {view.stability > 0 && (
          <span className="dz-block num" title="방어">
            <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2 L17 5 V10 C17 14 14 17 10 18.5 C6 17 3 14 3 10 V5 Z" fill="var(--int-defend)" />
            </svg>
            {view.stability}
          </span>
        )}
      </div>

      <div className="dz-diag">
        <span className="dz-pips" {...tipProps(<><div className="tip-title">진단 {view.diagnosisPoints}/{view.confirmAt}</div>{view.partialAt}점: 감별(분류·반응표·단서 전부). {view.confirmAt}점: 확진(질병명·원인균·다음 의도, 표적 보너스, 항생제 내성 멈춤).</>, "bottom")}>
          {pips.map((on, i) => (
            <i key={i} className={`${on ? "on" : ""} ${i + 1 === view.partialAt ? "mark" : ""}`} />
          ))}
        </span>
        <span className="dz-stage">{view.knowledge === 2 ? "확진" : view.knowledge === 1 ? "감별" : "미진단"}</span>
        <span className="dz-table-btn" tabIndex={0} {...tipProps(view.knowledge >= 1 ? <TableTip view={view} /> : <><div className="tip-title">반응표</div>진단 포인트 {view.partialAt}점(감별)부터 보인다. 반응은 진단과 상관없이 실제로 작동한다.</>, "bottom")}>
          반응표
        </span>
      </div>

      {notable.length > 0 && (
        <div className="dz-notable">
          {notable.map((r) => (
            <span key={r.tag} className={`gchip ${GRADE_CLASS[r.grade]}`}>
              {gradeLabel(r.grade as Grade)} {r.label}
            </span>
          ))}
        </div>
      )}

      {(view.statuses.length > 0 || view.resistance.length > 0) && (
        <div className="dz-status">
          {view.statuses.map((s) => (
            <span key={s.id} className={`schip ${s.debuff ? "is-debuff" : "is-buff"}`} {...tipProps(<><div className="tip-title">{s.nameKo} {s.stacks}</div>{s.description}</>, "bottom")}>
              {s.nameKo} <b>{s.stacks}</b>
            </span>
          ))}
          {view.resistance.map((r) => (
            <span key={r.tag} className="schip is-res" {...tipProps(<><div className="tip-title">획득 내성: {r.nameKo} {r.stacks}</div>이 계열 항생제 피해 ×{Math.max(40, 100 - 20 * r.stacks)}%. 확진 전 사용이나 광범위 항생제로 쌓인다.</>, "bottom")}>
              내성 {r.nameKo} <b>{r.stacks}</b>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
