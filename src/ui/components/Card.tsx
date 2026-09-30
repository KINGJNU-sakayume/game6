// 처방 용지 모양의 카드
import React from "react";
import { cardDef, describeCard, keywordDef } from "../../core";
import { Barcode, KindGlyph } from "./icons";
import { tipProps } from "../tooltip";

const KIND_LABEL: Record<string, string> = { procedure: "처치", drug: "약물", diagnostic: "진단", side_effect: "부작용" };
const KIND_EN: Record<string, string> = { procedure: "PROCEDURE", drug: "MEDICATION", diagnostic: "DIAGNOSTIC", side_effect: "ADVERSE EVENT" };
const KW_ID: Record<string, string> = { 소진: "exhaust", 보존: "retain", 휘발: "ethereal", "지속 효과": "power" };

/** 업그레이드로 바뀐 숫자를 표시한다 */
function diffLine(base: string | undefined, up: string, upgraded: boolean): React.ReactNode {
  const parts = up.split(/(\d+)/);
  const bparts = base?.split(/(\d+)/) ?? [];
  return parts.map((p, i) => {
    if (/^\d+$/.test(p)) {
      const changed = upgraded && bparts[i] !== undefined && bparts[i] !== p;
      return (
        <b key={i} className={changed ? "up" : undefined}>
          {p}
        </b>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

export interface CardProps {
  cardId: string;
  upgraded?: boolean;
  cost?: number | null;
  playable?: boolean;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
  temp?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
  className?: string;
  badge?: React.ReactNode;
  tabIndex?: number;
}

export function Card(props: CardProps): React.ReactElement {
  const { cardId, upgraded = false, size = "md" } = props;
  const def = cardDef(cardId, upgraded);
  const text = describeCard(cardId, upgraded);
  const base = upgraded ? describeCard(cardId, false) : undefined;
  const costShown = props.cost !== undefined ? props.cost : def.cost === "unplayable" ? def.sideEffect?.purgeCost ?? null : def.cost;
  const unplayable = def.cost === "unplayable";
  const cls = [
    "card",
    `card-${def.kind}`,
    `card-${size}`,
    `rarity-${def.rarity}`,
    props.playable === false ? "is-dim" : "",
    props.selected ? "is-selected" : "",
    upgraded ? "is-upgraded" : "",
    props.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const formNo = `${def.kind === "drug" ? "RX" : def.kind === "diagnostic" ? "DX" : def.kind === "side_effect" ? "AE" : "PX"}-${(cardId.length * 7 + cardId.charCodeAt(0)) % 90 + 10}`;
  return (
    <div
      className={cls}
      onClick={props.onClick}
      onPointerDown={props.onPointerDown}
      onKeyDown={props.onKeyDown}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      style={props.style}
      tabIndex={props.tabIndex}
      role={props.onClick ? "button" : undefined}
      aria-label={`${def.nameKo}${upgraded ? "+" : ""}, ${text.full}`}
    >
      <div className="card-band">
        <span className="card-kind">
          <KindGlyph kind={def.kind} size={10} /> {KIND_LABEL[def.kind]} <span className="card-kind-en">{KIND_EN[def.kind]}</span>
        </span>
      </div>
      <div className={`card-cost ${unplayable && costShown === null ? "is-none" : ""} ${unplayable ? "is-purge" : ""}`}>
        {costShown === null ? "—" : costShown}
      </div>
      {props.badge}
      <div className="card-title">
        <div className="card-name">
          {def.nameKo}
          {upgraded ? <span className="card-plus">+</span> : null}
        </div>
        <div className="card-en">{def.nameEn}</div>
      </div>
      <div className="card-body">
        {text.lines.map((l, i) => (
          <div key={i} className="card-line">
            {diffLine(base?.lines[i], l, upgraded)}
          </div>
        ))}
        {text.options && text.options.length > 0 && (
          <ul className="card-opts">
            {text.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        )}
        {text.keywords.length > 0 && (
          <div className="card-kw">
            {text.keywords.map((k) => {
              const kd = keywordDef(KW_ID[k] ?? "");
              return (
                <span key={k} className="kw" {...(kd ? tipProps(<><div className="tip-title">{kd.nameKo}</div>{kd.description}</>) : {})}>
                  {k}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {def.drug && (
        <div className="card-label">
          <div className="card-hl">{text.drugLine}</div>
          <div className={`card-se ${def.drug.sideEffects.length ? "" : "is-none"}`}>{text.sideEffectLine}</div>
        </div>
      )}
      <div className="card-foot">
        <Barcode seed={cardId} width={56} height={9} />
        <span className="card-form">{formNo}</span>
        <span className="card-foot-gap" />
        {def.rarity === "uncommon" && <span className="rarity-tag">고급</span>}
        {def.rarity === "rare" && <span className="rarity-tag rare">희귀</span>}
        {props.temp && <span className="rarity-tag temp">임시</span>}
        {!props.temp && def.zone === "formulary" && <span className="rarity-tag rx">처방집</span>}
      </div>
    </div>
  );
}
