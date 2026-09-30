import React from "react";
import { relicDef } from "../../core";
import type { GameState } from "../../core";
import { controller } from "../controller";
import { Card } from "../components/Card";
import { RelicBadge } from "../components/Relic";

export function ShopScreen({ state }: { state: GameState }) {
  const s = state.shop!;
  const gold = state.run.gold;
  return (
    <div className="shop-wrap">
      <section className="sheet shop-sheet">
        <div className="sheet-head">
          <div>
            <div className="eyebrow">약제부 · PHARMACY</div>
            <h2 className="shop-title">원내 처방집</h2>
            <div className="hand shop-sub">"이번 주에 들어온 약이에요. 예산 안에서 고르세요."</div>
          </div>
          <div className="shop-budget">
            <span className="eyebrow">남은 예산</span>
            <span className="num shop-gold">{gold}</span>
          </div>
        </div>
        <div className="shop-cards">
          {s.cards.map((c) => (
            <div key={c.slot} className={`shop-item ${c.sold ? "is-sold" : ""}`}>
              {c.sold ? (
                <div className="sold-slot">품절</div>
              ) : (
                <Card cardId={c.cardId} playable={gold >= c.price} onClick={() => controller.dispatch({ type: "shop_buy", slot: c.slot })} tabIndex={0} />
              )}
              {!c.sold && <span className={`price-tag num ${gold < c.price ? "is-short" : ""}`}>{c.price}</span>}
            </div>
          ))}
        </div>
        <div className="shop-bottom">
          <div className="shop-relics">
            {s.relics.map((r) => (
              <button key={r.slot} className={`shop-relic ${r.sold ? "is-sold" : ""}`} disabled={r.sold || gold < r.price} onClick={() => controller.dispatch({ type: "shop_buy", slot: r.slot })}>
                <RelicBadge id={r.relicId} large />
                <span className="shop-relic-text">
                  <b>{relicDef(r.relicId).nameKo}</b>
                  <span>{relicDef(r.relicId).description}</span>
                </span>
                <span className={`price-tag num ${gold < r.price ? "is-short" : ""}`}>{r.sold ? "품절" : r.price}</span>
              </button>
            ))}
          </div>
          <button className="shop-remove" disabled={s.removalUsed || gold < s.removalPrice} onClick={() => controller.dispatch({ type: "shop_remove" })}>
            <b>처방 정리</b>
            <span>처방 목록에서 카드 1장 빼기</span>
            <span className={`price-tag num ${gold < s.removalPrice ? "is-short" : ""}`}>{s.removalUsed ? "완료" : s.removalPrice}</span>
          </button>
          <button className="stamp-btn" onClick={() => controller.dispatch({ type: "leave" })}>
            나가기
          </button>
        </div>
      </section>
    </div>
  );
}
