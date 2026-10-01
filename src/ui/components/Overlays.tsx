// 오버레이: 대기 선택, 처방 목록, 더미 보기, 증례집, 설정, 진료 안내
import React from "react";
import { cardDef, categoryName, db, diseaseDef, gradeLabel, microView, textbookSummary } from "../../core";
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

export function FormularyOverlay({ state, onClose }: { state: GameState; onClose: () => void }) {
  return (
    <Sheet title="처방집" sub={`${state.run.formulary.length}개 · 투약 오더·시술 의뢰로 이 안에서 골라 손으로 불러낸다. 덱에는 섞이지 않는다.`} onClose={onClose} wide>
      <CardGrid cards={sortCards(state.run.formulary)} />
    </Sheet>
  );
}

export function PendingOverlay({ state }: { state: GameState }) {
  const p = state.pending!;
  if (p.kind === "choose_option") return null;
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setPicked(new Set()), [p]);
  const pool: CardInstance[] =
    p.kind === "select_cards"
      ? [...(state.combat?.hand ?? []), ...(state.combat?.drawPile ?? []), ...(state.combat?.discardPile ?? [])].filter((c) => p.candidates.includes(c.uid))
      : [...state.run.deck, ...state.run.formulary].filter((c) => p.candidates.includes(c.uid));
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
  const complaints = (id: string) => db().presentations.filter((p) => p.candidates.some((c) => c.disease === id)).map((p) => p.complaint);
  return (
    <Sheet title="증례집" sub={`이번 입원에서 만난 질병 ${confirmed.length}/${all.length}. 만난 질병은 감별 목록에서 예상 소견을 보여 준다.`} onClose={onClose} wide>
      <div className="casebook">
        {all.map((d) => {
          const known = confirmed.includes(d.id);
          const tb = textbookSummary(d.id);
          return (
            <div key={d.id} className={`case ${known ? "is-known" : ""}`}>
              <div className="case-act mono">{d.act}막</div>
              <div className="case-name">{d.nameKo}</div>
              <div className="case-en">{d.nameEn}</div>
              <div className="case-meta">
                {categoryName(d.category)} · 주호소 {complaints(d.id).map((c) => `"${c}"`).join(", ")}
              </div>
              <div className="case-note">{d.textbook.keyFeatures}</div>
              {known ? (
                <div className="case-rx">
                  {tb.firstLine.length > 0 && <span>1차: {tb.firstLine.join(", ")}</span>}
                  {tb.avoid.length > 0 && <span className="case-avoid"> · 피할 것: {tb.avoid.join(", ")}</span>}
                </div>
              ) : (
                <div className="case-rx case-unknown">아직 만나지 않았다</div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/** 미생물 기록 (v2.1): 런 내내 남는 배양 결과·감수성과 선택 압력 */
export function MicroOverlay({ state, onClose }: { state: GameState; onClose: () => void }) {
  const m = microView(state);
  return (
    <Sheet title="미생물 기록" sub="이번 입원에서 받은 배양과 결과. 전투가 끝나도 배양은 계속 자라고, 결과는 다음 전투에서 온다." onClose={onClose} wide>
      <div className="micro">
        <div className="micro-pressure">
          <b>선택 압력 {m.pressure}</b>
          <span>
            광범위 항생제(+2)와 원인균을 모르고 쓴 항생제(+1)가 쌓고, 원인균을 확인한 뒤 범위 축소(−2)가 줄인다. 이후 감염이 내성균(ESBL·MRSA·녹농균)일 가능성 +{m.pressurePct}%.
          </span>
          {m.colonized.length > 0 && <span className="micro-col">차트의 균: {m.colonized.join(", ")} — 같은 균의 이후 감염 가능성이 오른다</span>}
        </div>
        {m.pending.length > 0 && (
          <div className="micro-sec">
            <h4>배양 중</h4>
            {m.pending.map((p, i) => (
              <div key={i} className="micro-row is-pending">
                <span className="micro-spec">{p.specimen}</span>
                <span className="micro-src">{p.source} · {p.where}</span>
                <span className="micro-text">다음 전투에서 결과</span>
              </div>
            ))}
          </div>
        )}
        <div className="micro-sec">
          <h4>결과</h4>
          {m.results.length === 0 && <div className="micro-empty">아직 나온 배양 결과가 없다</div>}
          {m.results.map((r, i) => (
            <div key={i} className="micro-row">
              <span className="micro-spec">{r.specimen}</span>
              <span className="micro-src">{r.source} · {r.where}</span>
              <span className="micro-text">{r.text}</span>
              {r.antibiogram && (
                <span className="abx-grid micro-abx">
                  {r.antibiogram.map((c) => (
                    <span key={c.cardId} className={`abx-cell g-${c.grade === "?" ? "unknown" : c.grade}`} title={gradeLabel(c.grade)}>
                      {c.short}
                      <b>{gradeLabel(c.grade)}</b>
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
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
          <h4>한 턴의 흐름</h4>
          <p>
            <b>안정화 → 감별 → 결정 → 치료 → 재평가.</b> 오더 3으로 카드를 쓴다. 턴을 마치면 질병이 표시된 방향으로 환자를 악화시킨다. 확진 전에는 <b>방향(압박 종류)과 크기(경미 ≤6 · 중등 7–12 · 심각 13+)</b>만 보이고, 무엇이 일어났는지는 일어난 뒤에 보인다. 나빠지는 방식이 단서가 되면 <b>경과 관찰</b> 소견으로 남는다. <b>안정화</b>는 그 악화를 먼저 막고 내 턴이 시작되면 사라진다.
          </p>
        </section>
        <section>
          <h4>감별 진단</h4>
          <p>
            처음에는 주호소와 활력징후, 감별 목록만 보인다. 병력·진찰·검사·영상·배양은 <b>무엇을 볼지 고르는</b> 결정이고, 질병을 깎지 않는다. 소견마다 각 가설을 지지(+)하거나 반대(−)한다. 정상 소견도 소견이다. 다른 가설이 모두 배제되면 확진된다.
          </p>
        </section>
        <section>
          <h4>작업 진단</h4>
          <p>
            감별 목록에서 병을 눌러 <b>작업 진단</b>으로 정한다(처음은 무료, 바꾸면 오더 1). 작업 진단의 1차 치료는 ×1.3으로 듣고, 투약 오더가 그 병에 맞춰 약을 내놓는다. 틀린 작업 진단으로 치료하면 기대한 반응이 없고, 그 무반응이 곧 소견이 된다.
          </p>
        </section>
        <section>
          <h4>처방집과 투약 오더</h4>
          <p>
            약과 결정적 시술은 덱이 아니라 <b>처방집</b>에 있다. 투약 오더·시술 의뢰를 쓰면 처방집에서 셋 중 하나를 골라 손으로 불러온다. 맞지 않는 치료 카드는 <b>반납</b>(턴당 1회, R)해 1장 뽑는다. 협진은 처방집 밖의 전문과 도구를 쥐여 준다.
          </p>
        </section>
        <section>
          <h4>반응과 원인균</h4>
          <p>
            <span className="gchip g-key">특효</span> ×2 <span className="gchip g-weak">우수</span> ×1.5 <span className="gchip g-normal">보통</span> <span className="gchip g-resistant">저하</span> ×0.5 <span className="gchip g-immune">무효</span> <span className="gchip g-harmful">금기</span> 악화. 원인균을 모른 채 쓴 항생제는 내성을 키운다. 배양은 그람 염색을 바로, 배양·감수성을 2턴 뒤에 준다. 전투가 끝나도 배양은 자라 다음 전투에서 결과가 오고, <b>미생물 기록</b>(배너)에 남는다. 광범위·경험적 항생제는 <b>선택 압력</b>을 쌓아 이후 감염을 내성균 쪽으로 기울이고, 원인균을 확인한 뒤 범위 축소가 그것을 줄인다.
          </p>
        </section>
        <section>
          <h4>조작</h4>
          <p>
            카드를 끌어 질병 위에 놓거나, 눌러서 고른 뒤 질병을 누른다. 결정 창에서는 숫자 1–4로 고르고 Esc로 그만둔다. 숫자 1–0 카드 선택, Enter 사용, R 반납, E 턴 종료.
          </p>
        </section>
      </div>
    </Sheet>
  );
}

export { diseaseDef };
