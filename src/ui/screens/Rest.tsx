import React from "react";
import { cardDef, relicDef } from "../../core";
import type { GameState } from "../../core";
import { controller } from "../controller";

export function RestScreen({ state }: { state: GameState }) {
  const r = state.run;
  const heal = Math.floor((r.maxVitality * 30) / 100);
  const noRest = r.relics.some((x) => relicDef(x.id).modifiers?.some((m) => m.kind === "noRestHeal"));
  const hasPersistent = r.deck.some((c) => cardDef(c.cardId).kind === "side_effect");
  const done = !!r.restDone;
  return (
    <div className="rest-wrap">
      <section className="rest-board" aria-label="당직실">
        <div className="rest-head">
          <div className="eyebrow">당직실 · ON-CALL ROOM</div>
          <h2 className="rest-title">잠깐의 틈</h2>
          <p className="rest-sub">한 가지만 할 수 있다. 호출기가 언제 다시 울릴지 모른다.</p>
        </div>
        <div className="rest-notes">
          <button className="postit postit-y" disabled={done || noRest} onClick={() => controller.dispatch({ type: "rest_choose", option: "rest" })}>
            <span className="postit-title hand">눈 붙이기</span>
            <span className="postit-body">
              활력 <b>+{Math.min(heal, r.maxVitality - r.vitality)}</b>
              <br />
              <small>
                {r.vitality}/{r.maxVitality} → {Math.min(r.maxVitality, r.vitality + heal)}
              </small>
            </span>
            {noRest && <span className="postit-block">중환자실 입실: 휴식 불가</span>}
          </button>
          <button className="postit postit-b" disabled={done} onClick={() => controller.dispatch({ type: "rest_choose", option: "upgrade" })}>
            <span className="postit-title hand">처방 최적화</span>
            <span className="postit-body">
              카드 1장을 업그레이드한다
              <br />
              <small>이름 뒤에 +가 붙는다</small>
            </span>
          </button>
          <button className="postit postit-p" disabled={done || !hasPersistent} onClick={() => controller.dispatch({ type: "rest_choose", option: "purge" })}>
            <span className="postit-title hand">부작용 정리</span>
            <span className="postit-body">
              지속 부작용 카드 1장 제거
              <br />
              <small>{hasPersistent ? "처방 목록에 남은 부작용을 정리한다" : "정리할 지속 부작용이 없다"}</small>
            </span>
          </button>
        </div>
        <div className="rest-foot">
          {done && <span className="hand rest-done">다시 병동으로.</span>}
          <button className="stamp-btn" onClick={() => controller.dispatch({ type: "leave" })}>
            {done ? "복귀" : "그냥 나가기"}
          </button>
        </div>
      </section>
    </div>
  );
}
