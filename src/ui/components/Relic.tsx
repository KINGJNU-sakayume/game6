import React from "react";
import { relicDef } from "../../core";
import { tipProps } from "../tooltip";

export function RelicTip({ id }: { id: string }) {
  const r = relicDef(id);
  return (
    <>
      <div className="tip-title">
        {r.nameKo} <span className="mono" style={{ fontWeight: 400, color: "var(--ink-soft)" }}>{r.badge}</span>
      </div>
      <div>{r.description}</div>
      {r.flavor && <div className="tip-sub">{r.flavor}</div>}
    </>
  );
}

export function RelicBadge({ id, pulse, large }: { id: string; pulse?: boolean; large?: boolean }) {
  const r = relicDef(id);
  const tierCls = `tier-${r.tier}`;
  return (
    <span className={`relic ${tierCls} ${pulse ? "is-pulse" : ""} ${large ? "is-large" : ""}`} tabIndex={0} {...tipProps(<RelicTip id={id} />, "bottom")}>
      <span className="relic-clip" aria-hidden="true" />
      <span className="relic-text">{r.badge}</span>
    </span>
  );
}
