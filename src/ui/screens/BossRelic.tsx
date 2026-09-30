import React from "react";
import { relicDef } from "../../core";
import type { GameState } from "../../core";
import { controller } from "../controller";
import { RelicBadge } from "../components/Relic";

export function BossRelicScreen({ state }: { state: GameState }) {
  const options = state.bossRelic ?? [];
  return (
    <div className="boss-wrap">
      <section className="sheet boss-sheet">
        <div className="sheet-head">
          <div>
            <div className="eyebrow">전동 전 결정 · 병원 정책</div>
            <h2 className="boss-title">새 병동에서 따를 지침 하나</h2>
            <div className="hand boss-sub">강력하지만 대가가 따른다.</div>
          </div>
          <div className="form-code">POLICY-{state.run.act}</div>
        </div>
        <div className="boss-options">
          {options.map((id, i) => {
            const r = relicDef(id);
            return (
              <button key={id} className="boss-opt" onClick={() => controller.dispatch({ type: "pick_relic", index: i })}>
                <RelicBadge id={id} large />
                <b className="boss-name">{r.nameKo}</b>
                <span className="boss-en">{r.nameEn}</span>
                <span className="boss-desc">{r.description}</span>
                <span className="boss-flavor hand">{r.flavor}</span>
              </button>
            );
          })}
        </div>
        <div className="boss-foot">
          <button className="btn" onClick={() => controller.dispatch({ type: "leave" })}>
            지침 없이 옮긴다
          </button>
        </div>
      </section>
    </div>
  );
}
