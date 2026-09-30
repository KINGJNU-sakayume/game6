// 오버레이: 대기 선택, 처방 목록, 더미 보기, 증례집, 설정, 진료 안내
import React from "react";
import { cardDef, categoryName, db, diseaseDef } from "../../core";
import type { CardInstance, GameState } from "../../core";
import { controller } from "../controller";
import type { Snapshot } from "../controller";
import { Card } from "./Card";
import { CopyRunButton } from "./CopyRun";

function Sheet({ title, sub, onClose, children, wide, footer }: { title: string; sub?: string; onClose?: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  React.useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`ov-sheet ${wide ? "is-wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="ov-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="ov-sub">{sub}</div>}
          </div>
          {onClose && (
            <button className="btn" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
        <div className="ov-body">{children}</div>
        {footer && <div className="ov-foot">{footer}</div>}
      </div>
    </div>
  );
}

const ORDER: Record<string, number> = { procedure: 0, diagnostic: 1, drug: 2, side_effect: 3 };
function sortCards(list: CardInstance[]): CardInstance[] {
  return [...list].sort((a, b) => {
    const da = cardDef(a.cardId);
    const dbb = cardDef(b.cardId);
    return (ORDER[da.kind] ?? 9) - (ORDER[dbb.kind] ?? 9) || da.nameKo.localeCompare(dbb.nameKo, "ko");
  });
}

function CardGrid({ cards, onPick, picked, previewUpgrade }: { cards: CardInstance[]; onPick?: (uid: string) => void; picked?: Set<string>; previewUpgrade?: boolean }) {
  return (
    <div className="card-grid">
      {cards.map((c) => {
        const on = !!picked?.has(c.uid);
        const showUp = previewUpgrade && on && !c.upgraded;
        return (
          <div key={c.uid} className={`grid-cell ${on ? "is-picked" : ""}`}>
            <Card
              cardId={c.cardId}
              upgraded={c.upgraded || showUp}
              temp={c.temp}
              selected={on}
              onClick={onPick ? () => onPick(c.uid) : undefined}
              onKeyDown={onPick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(c.uid); } } : undefined}
              tabIndex={onPick ? 0 : undefined}
            />
            {showUp && <span className="grid-note hand">최적화 후</span>}
          </div>
        );
      })}
      {cards.length === 0 && <div className="grid-empty">비어 있다</div>}
    </div>
  );
}

export function DeckOverlay({ state, onClose }: { state: GameState; onClose: () => void }) {
  return (
    <Sheet title="처방 목록" sub={`${state.run.deck.length}장 · 전투가 시작되면 섞어서 대기 처방이 된다`} onClose={onClose} wide>
      <CardGrid cards={sortCards(state.run.deck)} />
    </Sheet>
  );
}

export function PileOverlay({ state, pile, onClose }: { state: GameState; pile: "draw" | "discard" | "exhaust"; onClose: () => void }) {
  const c = state.combat!;
  const list = pile === "draw" ? sortCards(c.drawPile) : pile === "discard" ? c.discardPile : c.exhaustPile;
  const title = pile === "draw" ? "대기 처방" : pile === "discard" ? "완료 처방" : "폐기";
  const sub = pile === "draw" ? "순서는 보여 주지 않는다 (종류별 정렬)" : pile === "discard" ? "대기 처방이 비면 섞여서 돌아온다" : "이번 전투 동안 돌아오지 않는다";
  return (
    <Sheet title={`${title} ${list.length}장`} sub={sub} onClose={onClose} wide>
      <CardGrid cards={list} />
    </Sheet>
  );
}

export function PendingOverlay({ state }: { state: GameState }) {
  const p = state.pending!;
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setPicked(new Set()), [p]);
  const pool: CardInstance[] =
    p.kind === "select_cards"
      ? [...(state.combat?.hand ?? []), ...(state.combat?.drawPile ?? []), ...(state.combat?.discardPile ?? [])].filter((c) => p.candidates.includes(c.uid))
      : state.run.deck.filter((c) => p.candidates.includes(c.uid));
  const toggle = (uid: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else {
        if (n.size >= p.max) {
          if (p.max === 1) n.clear();
          else return n;
        }
        n.add(uid);
      }
      return n;
    });
  };
  const ok = picked.size >= p.min && picked.size <= p.max;
  const title = p.kind === "deck_select" ? ({ upgrade: "처방 최적화", remove: "처방 정리", purge: "부작용 정리", shop_remove: "처방 정리" } as const)[p.purpose] : "선택";
  return (
    <Sheet
      title={title}
      sub={`${p.prompt} (${p.min === p.max ? `${p.max}장` : `${p.min}~${p.max}장`})`}
      wide
      footer={
        <>
          {p.min === 0 && (
            <button className="btn" onClick={() => controller.dispatch({ type: "choose_cards", uids: [] })}>
              {p.kind === "deck_select" ? "취소" : "고르지 않음"}
            </button>
          )}
          <button className="btn btn-primary" disabled={!ok || picked.size === 0} onClick={() => controller.dispatch({ type: "choose_cards", uids: [...picked] })}>
            확인 ({picked.size})
          </button>
        </>
      }
    >
      <CardGrid cards={sortCards(pool)} onPick={toggle} picked={picked} previewUpgrade={p.kind === "deck_select" && p.purpose === "upgrade"} />
    </Sheet>
  );
}

export function CasebookOverlay({ state, onClose }: { state: GameState; onClose: () => void }) {
  const confirmed = Object.keys(state.run.casebook);
  const all = db().diseases;
  return (
    <Sheet title="증례집" sub={`이번 입원에서 확진한 질병 ${confirmed.length}/${all.length}. 다시 만나면 감별 단계에서 시작한다.`} onClose={onClose} wide>
      <div className="casebook">
        {all.map((d) => {
          const known = confirmed.includes(d.id);
          return (
            <div key={d.id} className={`case ${known ? "is-known" : ""}`}>
              <div className="case-act mono">{d.act}막</div>
              {known ? (
                <>
                  <div className="case-name">{d.nameKo}</div>
                  <div className="case-en">{d.nameEn}</div>
                  <div className="case-meta">
                    {categoryName(d.category)} · 주호소 "{d.presentation.complaint}"
                  </div>
                  <div className="case-note">{d.medical.note}</div>
                </>
              ) : (
                <>
                  <div className="case-name case-unknown">미확진</div>
                  <div className="case-meta">주호소 "{d.presentation.complaint}"</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

export function SettingsOverlay({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const [confirm, setConfirm] = React.useState(false);
  return (
    <Sheet title="설정" onClose={onClose}>
      <div className="settings">
        <div className="set-row">
          <span className="set-label">연출 속도</span>
          <span className="seg">
            {(["normal", "fast", "off"] as const).map((a) => (
              <button key={a} className={`seg-btn ${snap.settings.anim === a ? "is-on" : ""}`} onClick={() => controller.setSettings({ anim: a })}>
                {a === "normal" ? "보통" : a === "fast" ? "빠름" : "끔"}
              </button>
            ))}
          </span>
        </div>
        <div className="set-row">
          <span className="set-label">효과음</span>
          <span className="seg">
            {([true, false] as const).map((on) => (
              <button key={String(on)} className={`seg-btn ${snap.settings.sound === on ? "is-on" : ""}`} onClick={() => controller.setSettings({ sound: on })}>
                {on ? "켬" : "끔"}
              </button>
            ))}
          </span>
        </div>
        {snap.state && (
          <>
            <div className="set-row">
              <span className="set-label">재생 기록</span>
              <CopyRunButton label="시드와 행동 기록 복사" />
            </div>
            <div className="set-row">
              <span className="set-label">시드</span>
              <span className="mono">{snap.state.seed}</span>
            </div>
            <div className="set-row">
              <span className="set-label">진행</span>
              <span className="set-btns">
                <button className="btn" onClick={() => { controller.toTitle(); onClose(); }}>
                  타이틀로 (저장 유지)
                </button>
                {confirm ? (
                  <>
                    <button className="btn btn-primary" onClick={() => { controller.abandon(); onClose(); }}>
                      기록 삭제하고 포기
                    </button>
                    <button className="btn" onClick={() => setConfirm(false)}>
                      취소
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setConfirm(true)}>
                    이번 입원 포기
                  </button>
                )}
              </span>
            </div>
          </>
        )}
        <p className="set-note">오락용 게임입니다. 수치와 효과는 실제 임상 판단의 근거가 아닙니다.</p>
      </div>
    </Sheet>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="진료 안내" sub="처음 당직을 서는 사람을 위한 요약" onClose={onClose} wide>
      <div className="help">
        <section>
          <h4>한 턴</h4>
          <p>
            오더 3으로 카드를 쓴다. 약은 적응증이 있는 질병에만 듣고, 처치는 어디에나 든다. 턴을 마치면 질병이 의도대로 움직인다. <b>안정화</b>는 들어오는 피해를 먼저 막고, 내 턴이 시작되면 사라진다.
          </p>
        </section>
        <section>
          <h4>진단</h4>
          <p>
            처음에는 주호소와 단서 하나만 보인다. 진단 포인트가 쌓이면 <b>감별</b>(분류, 반응표, 단서 전부)과 <b>확진</b>(질병명, 원인균, 다음 의도)으로 넘어간다. 확진된 대상에게 <b>표적</b> 카드는 1.5배, 항생제는 내성을 쌓지 않는다.
          </p>
        </section>
        <section>
          <h4>반응표</h4>
          <p>
            <span className="gchip g-key">특효</span> ×2 <span className="gchip g-weak">우수</span> ×1.5 <span className="gchip g-normal">보통</span> <span className="gchip g-resistant">저하</span> ×0.5 <span className="gchip g-immune">무효</span> <span className="gchip g-harmful">금기</span> 악화. 반응표는 진단 전에도 실제로 작동한다. 모르고 써도 결과는 같다.
          </p>
        </section>
        <section>
          <h4>약물</h4>
          <p>
            약을 쓰면 반감기만큼 <b>투여 중</b>으로 남는다. 투여 중인 약끼리 상호작용한다. 약에 커서를 올리면 <b>DUR 점검</b> 창이 발동할 규칙을 미리 보여 준다. 대부분의 약은 <b>부작용 카드</b>를 덱에 넣는다.
          </p>
        </section>
        <section>
          <h4>조작</h4>
          <p>
            카드를 끌어 질병 위에 놓거나, 눌러서 고른 뒤 질병을 누른다. 대상이 없는 카드는 한 번 더 누른다. 숫자 1–0 카드 선택, Enter 사용, E 턴 종료, Esc 취소.
          </p>
        </section>
        <section>
          <h4>경로</h4>
          <p>
            응급실(8층) → 병동(10층) → 중환자실(10층). 각 막의 끝에 주 진단이 있다. 당직실에서 쉬거나 처방을 최적화하고, 약제부에서 카드를 사고 뺀다.
          </p>
        </section>
      </div>
    </Sheet>
  );
}

export { diseaseDef };
