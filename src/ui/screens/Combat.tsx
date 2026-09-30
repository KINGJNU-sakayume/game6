// 전투 화면
import React from "react";
import { canPlay, cardCost, cardDef, isPlayable, previewDamage, previewInteractions, visibleEnemyInfo } from "../../core";
import type { GameState, InteractionPreview } from "../../core";
import type { Fx, Settings } from "../controller";
import { controller } from "../controller";
import { Card } from "../components/Card";
import { DiseasePanel } from "../components/DiseasePanel";
import { Monitor, PumpRack } from "../components/Monitor";
import { PileOverlay } from "../components/Overlays";
import { hideTip, tipProps } from "../tooltip";

interface Flying {
  id: number;
  cardId: string;
  upgraded: boolean;
  x: number;
  y: number;
  dest: "discard" | "exhaust" | "power";
}

interface Drag {
  uid: string;
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
}

function toStage(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const stage = document.querySelector(".stage");
  if (!stage) return { x: e.clientX, y: e.clientY };
  const r = stage.getBoundingClientRect();
  const scale = r.width / 1280;
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}

function enemyAt(e: { clientX: number; clientY: number }): string | undefined {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const host = el?.closest("[data-enemy]");
  return host?.getAttribute("data-enemy") ?? undefined;
}

const KIND_TONE: Record<string, string> = { hazard: "위험", synergy: "시너지", antagonism: "길항", contraindication: "금기" };

function DurPanel({ name, items }: { name: string; items: InteractionPreview[] }) {
  return (
    <div className="dur" role="dialog" aria-label="DUR 점검">
      <div className="dur-title">
        <span>DUR 점검 — {name}</span>
        <span className="dur-win" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="dur-body">
        {items.length === 0 ? (
          <div className="dur-ok">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 7.5 L5.5 11 L12 3.5" fill="none" stroke="var(--kind-diagnostic)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            병용 경고 없음
          </div>
        ) : (
          items.map((p, i) => (
            <div key={i} className={`dur-item k-${p.kind} ${p.conditional ? "is-cond" : ""} ${p.blockedByDur ? "is-blocked" : ""}`}>
              <span className="dur-kind">{KIND_TONE[p.kind] ?? p.kind}</span>
              <span className="dur-text">
                {p.ruleId !== "금기" && <b className="mono">{p.ruleId} </b>}
                {p.text}
                {p.conditional && <em> (대상에 따라)</em>}
                {p.blockedByDur && <em> — DUR 시스템이 막는다</em>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** 1턴 = 15분, 08:00에 시작한다 */
function clock(turn: number): string {
  const m = 8 * 60 + (turn - 1) * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 첫 전투에서만 보이는 인턴 수첩 메모 */
function CoachNote({ onClose }: { onClose: () => void }) {
  return (
    <aside className="coach" aria-label="인턴 수첩">
      <button className="coach-x" onClick={onClose} aria-label="메모 닫기">
        ×
      </button>
      <div className="coach-title hand">인턴 수첩</div>
      <ol className="coach-list">
        <li>카드를 끌어 질병 위에 놓는다. 눌러서 고른 뒤 질병을 눌러도 된다.</li>
        <li>질병 위 빨간 숫자가 이번 턴에 받을 피해. 안정화가 먼저 막는다.</li>
        <li>진단 카드로 질병을 밝히면 반응표가 보인다. 특효 약은 두 배로 듣는다.</li>
        <li>오더를 다 쓰면 턴 종료 (E).</li>
      </ol>
    </aside>
  );
}

function LogPanel({ state, open, onToggle }: { state: GameState; open: boolean; onToggle: () => void }) {
  const log = state.combat!.log;
  const ref = React.useRef<HTMLOListElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length, open]);
  return (
    <aside className={`log ${open ? "is-open" : ""}`} aria-label="경과 기록">
      <button className="log-tab" onClick={onToggle} aria-expanded={open}>
        경과 기록
      </button>
      {open && (
        <div className="log-sheet">
          <div className="log-head">
            <span>경과 기록 PROGRESS NOTE</span>
            <button className="btn btn-ghost" onClick={onToggle} aria-label="닫기">
              닫기
            </button>
          </div>
          <ol ref={ref} className="log-list">
            {log.map((l, i) => (
              <li key={i} className={`log-${l.kind}`}>
                <span className="log-time mono">{clock(l.turn)}</span>
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}

export function CombatScreen({ state, fx, settings }: { state: GameState; fx: Fx[]; settings: Settings }) {
  const c = state.combat!;
  const [selected, setSelected] = React.useState<string | null>(null);
  const [hoverCard, setHoverCard] = React.useState<string | null>(null);
  const [hoverEnemy, setHoverEnemy] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [pile, setPile] = React.useState<null | "draw" | "discard" | "exhaust">(null);
  const [logOpen, setLogOpen] = React.useState(false);
  const [flying, setFlying] = React.useState<Flying[]>([]);
  const [coachOpen, setCoachOpen] = React.useState(true);
  const firstFight = state.run.stats.combatsWon === 0 && state.run.act === 1 && c.enemies.length === 1;
  const flyId = React.useRef(1);
  const handRef = React.useRef(c.hand);
  handRef.current = c.hand;
  const animOn = settings.anim !== "off";

  const hand = c.hand;
  const living = c.enemies.filter((e) => !e.cured);
  const selDef = selected ? (() => {
    const ci = hand.find((h) => h.uid === selected);
    return ci ? cardDef(ci.cardId, ci.upgraded) : null;
  })() : null;
  const activeUid = drag?.moved ? drag.uid : selected;
  const activeCi = activeUid ? hand.find((h) => h.uid === activeUid) : undefined;
  const activeDef = activeCi ? cardDef(activeCi.cardId, activeCi.upgraded) : null;
  const targeting = !!activeDef && activeDef.target === "enemy" && activeDef.cost !== "unplayable";

  // 선택한 카드가 손에서 사라지면 선택 해제
  React.useEffect(() => {
    if (selected && !hand.some((h) => h.uid === selected)) setSelected(null);
    if (hoverCard && !hand.some((h) => h.uid === hoverCard)) setHoverCard(null);
  }, [hand, selected, hoverCard]);

  const play = React.useCallback(
    (uid: string, targetUid?: string) => {
      // 손에서 떠나는 카드의 자리를 기억했다가 더미로 날려 보낸다
      const ci = handRef.current.find((h) => h.uid === uid);
      const el = document.querySelector(`.hand-slot[data-uid="${uid}"]`);
      const from = el ? toStage({ clientX: el.getBoundingClientRect().left, clientY: el.getBoundingClientRect().top }) : null;
      const ok = controller.dispatch({ type: "play_card", cardUid: uid, targetUid });
      if (ok) {
        setSelected(null);
        setHoverCard(null);
        hideTip();
        if (ci && from && animOn) {
          const kws = cardDef(ci.cardId, ci.upgraded).keywords ?? [];
          const dest: Flying["dest"] = kws.includes("power") ? "power" : kws.includes("exhaust") ? "exhaust" : "discard";
          const id = flyId.current++;
          setFlying((f) => [...f, { id, cardId: ci.cardId, upgraded: ci.upgraded, x: from.x, y: Math.min(from.y, 500), dest }]);
          window.setTimeout(() => setFlying((f) => f.filter((x) => x.id !== id)), 560);
        }
      }
      return ok;
    },
    [animOn],
  );

  const tryPlaySelected = React.useCallback(
    (uid: string) => {
      const ci = hand.find((h) => h.uid === uid);
      if (!ci) return;
      const def = cardDef(ci.cardId, ci.upgraded);
      if (def.target === "enemy" && def.cost !== "unplayable") {
        if (living.length === 1) play(uid, living[0]!.uid);
        else setSelected(uid);
      } else play(uid);
    },
    [hand, living, play],
  );

  const onCardClick = (uid: string) => {
    if (drag?.moved) return;
    if (!isPlayable(state, uid)) {
      const ci = hand.find((h) => h.uid === uid)!;
      const check = canPlay(state, uid, living[0]?.uid);
      controller.dispatch({ type: "play_card", cardUid: ci.uid, targetUid: living[0]?.uid }); // 사유 표시용
      void check;
      return;
    }
    if (selected === uid) tryPlaySelected(uid);
    else setSelected(uid);
  };

  // 끌어서 쓰기
  React.useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const p = toStage(e);
      setDrag((d) => (d ? { ...d, x: p.x, y: p.y, moved: d.moved || Math.hypot(p.x - d.sx, p.y - d.sy) > 14 } : d));
      const en = enemyAt(e);
      setHoverEnemy(en ?? null);
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      setDrag(null);
      if (!d || !d.moved) return;
      const ci = hand.find((h) => h.uid === d.uid);
      if (!ci) return;
      const def = cardDef(ci.cardId, ci.upgraded);
      const p = toStage(e);
      if (def.target === "enemy" && def.cost !== "unplayable") {
        const en = enemyAt(e);
        if (en) play(d.uid, en);
      } else if (p.y < 470) play(d.uid);
      setHoverEnemy(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, hand, play]);

  // 키보드
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.pending) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key;
      if (k >= "1" && k <= "9") {
        const ci = hand[Number(k) - 1];
        if (ci) setSelected(ci.uid);
      } else if (k === "0") {
        const ci = hand[9];
        if (ci) setSelected(ci.uid);
      } else if (k === "Escape") setSelected(null);
      else if (k === "Enter" && selected) tryPlaySelected(selected);
      else if ((k === "e" || k === "E") && !e.ctrlKey && !e.metaKey) controller.dispatch({ type: "end_turn" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hand, selected, state.pending, tryPlaySelected]);

  const views = c.enemies.map((e) => visibleEnemyInfo(state, e.uid)!).filter(Boolean);
  const durUid = activeUid ?? hoverCard;
  const durCi = durUid ? hand.find((h) => h.uid === durUid) : undefined;
  const durDef = durCi ? cardDef(durCi.cardId, durCi.upgraded) : null;
  const durTarget = hoverEnemy ?? (living.length === 1 ? living[0]!.uid : undefined);
  const durItems = durCi && durDef?.drug ? previewInteractions(state, durCi.uid, durTarget) : null;

  // 손패 배치
  const n = hand.length;
  const areaW = 780;
  const cw = 140;
  const spacing = n > 1 ? Math.min(148, (areaW - cw) / (n - 1)) : 0;
  const startX = 640 - ((n - 1) * spacing + cw) / 2 + 20;

  return (
    <div className={`combat ${animOn ? "" : "anim-off"}`} onClick={(e) => {
      if (e.target === e.currentTarget) setSelected(null);
    }}>
      <div className="combat-left">
        <Monitor state={state} fx={fx} />
        <PumpRack state={state} />
        {durItems && durDef && <DurPanel name={durDef.nameKo} items={durItems} />}
      </div>

      <div className={`combat-field n${views.length}`} onClick={(e) => {
        if (e.target === e.currentTarget && selected && selDef && selDef.target !== "enemy") tryPlaySelected(selected);
        else if (e.target === e.currentTarget) setSelected(null);
      }}>
        {views.map((v) => {
          const preview = activeUid && targeting && !v.cured ? previewDamage(state, activeUid, v.uid) : undefined;
          return (
            <DiseasePanel
              key={v.uid}
              view={v}
              fx={fx}
              targeting={targeting && !v.cured}
              hovered={hoverEnemy === v.uid}
              preview={preview}
              onHover={(on) => setHoverEnemy(on ? v.uid : null)}
              onClick={() => {
                if (selected && targeting && !v.cured) play(selected, v.uid);
              }}
            />
          );
        })}
        {selected && selDef && selDef.target !== "enemy" && (
          <div className="play-hint hand">한 번 더 누르거나 이곳을 누르면 사용한다</div>
        )}
        {targeting && !drag && <div className="play-hint hand">대상 질병을 고른다</div>}
      </div>

      <div className="orders" {...tipProps(<><div className="tip-title">오더 {c.orders}/{c.ordersPerTurn}</div>카드를 쓰는 데 드는 자원. 매 턴 다시 채워지고 남은 오더는 사라진다.</>, "right")}>
        <div className="orders-ring">
          <span className="orders-num">{c.orders}</span>
          <span className="orders-max">/{c.ordersPerTurn}</span>
        </div>
        <span className="orders-label">오더</span>
      </div>

      <button className="pile pile-draw" onClick={() => setPile("draw")} {...tipProps("대기 처방: 앞으로 뽑을 카드", "right")}>
        <span className="pile-stack" aria-hidden="true" />
        <span className="pile-count num">{c.drawPile.length}</span>
        <span className="pile-label">대기</span>
      </button>
      <button className="pile pile-discard" onClick={() => setPile("discard")} {...tipProps("완료 처방: 쓴 카드. 대기 처방이 비면 섞여 돌아온다", "left")}>
        <span className="pile-stack" aria-hidden="true" />
        <span className="pile-count num">{c.discardPile.length}</span>
        <span className="pile-label">완료</span>
      </button>
      <button className="pile pile-exhaust" onClick={() => setPile("exhaust")} {...tipProps("폐기: 이번 전투에서 소진된 카드", "left")}>
        <span className="pile-stack" aria-hidden="true" />
        <span className="pile-count num">{c.exhaustPile.length}</span>
        <span className="pile-label">폐기</span>
      </button>

      <button className="end-turn" onClick={() => controller.dispatch({ type: "end_turn" })} disabled={!!state.pending}>
        <span className="end-turn-main">턴 종료</span>
        <span className="end-turn-sub">서명 후 인계 · E</span>
      </button>

      <div className="hand-area" aria-label="손패">
        {hand.map((ci, i) => {
          const playable = isPlayable(state, ci.uid);
          const isSel = selected === ci.uid;
          const isHover = hoverCard === ci.uid && !drag;
          const isDragging = drag?.uid === ci.uid && drag.moved;
          const mid = (n - 1) / 2;
          const rot = (i - mid) * (n > 6 ? 2.2 : 3);
          const yOff = Math.abs(i - mid) ** 2 * (n > 6 ? 1.2 : 2.2);
          const x = startX + i * spacing;
          let transform = `translate(${x}px, ${524 + yOff}px) rotate(${rot}deg)`;
          if (isSel) transform = `translate(${x}px, ${480}px) rotate(0deg)`;
          if (isHover && !isSel) transform = `translate(${x - 10}px, ${430}px) rotate(0deg) scale(1.2)`;
          return (
            <div
              key={ci.uid}
              data-uid={ci.uid}
              className={`hand-slot ${isHover ? "is-hover" : ""} ${isSel ? "is-sel" : ""} ${isDragging ? "is-dragging" : ""}`}
              style={{ transform, zIndex: isHover || isSel ? 40 : 10 + i, animationDelay: `${i * 45}ms` }}
            >
              <Card
                cardId={ci.cardId}
                upgraded={ci.upgraded}
                cost={cardCost(state, ci.uid)}
                playable={playable}
                selected={isSel}
                temp={ci.temp}
                tabIndex={0}
                onMouseEnter={() => setHoverCard(ci.uid)}
                onMouseLeave={() => setHoverCard((h) => (h === ci.uid ? null : h))}
                onClick={() => onCardClick(ci.uid)}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !playable) return;
                  const p = toStage(e);
                  setDrag({ uid: ci.uid, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false });
                }}
              />
              <span className="hand-key mono" aria-hidden="true">
                {i === 9 ? 0 : i + 1}
              </span>
            </div>
          );
        })}
      </div>

      {flying.map((f) => (
        <div key={f.id} className={`fly-card to-${f.dest}`} style={{ "--fx": `${f.x}px`, "--fy": `${f.y}px` } as React.CSSProperties} aria-hidden="true">
          <Card cardId={f.cardId} upgraded={f.upgraded} />
        </div>
      ))}

      {drag?.moved && activeCi && (
        <div className="drag-ghost" style={{ transform: `translate(${drag.x - 70}px, ${drag.y - 60}px) rotate(-4deg)` }}>
          <Card cardId={activeCi.cardId} upgraded={activeCi.upgraded} cost={cardCost(state, activeCi.uid)} />
        </div>
      )}
      {drag?.moved && targeting && (
        <svg className="aim" width="1280" height="720" aria-hidden="true">
          <path d={`M${drag.sx} ${drag.sy - 40} Q${(drag.sx + drag.x) / 2} ${Math.min(drag.sy, drag.y) - 120} ${drag.x} ${drag.y}`} />
        </svg>
      )}

      {firstFight && coachOpen && <CoachNote onClose={() => setCoachOpen(false)} />}
      <LogPanel state={state} open={logOpen} onToggle={() => setLogOpen((o) => !o)} />
      {pile && <PileOverlay state={state} pile={pile} onClose={() => setPile(null)} />}
    </div>
  );
}
