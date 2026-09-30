import React from "react";
import { useStore } from "./store";
import { controller } from "./controller";
import { registerStage, TipLayer, hideTip } from "./tooltip";
import { TitleScreen } from "./screens/Title";
import { EmrBanner } from "./components/EmrBanner";
import { MapScreen } from "./screens/Map";
import { CombatScreen } from "./screens/Combat";
import { RewardScreen } from "./screens/Reward";
import { ShopScreen } from "./screens/Shop";
import { RestScreen } from "./screens/Rest";
import { EventScreen } from "./screens/Event";
import { BossRelicScreen } from "./screens/BossRelic";
import { EndScreen } from "./screens/End";
import { DeckOverlay, CasebookOverlay, SettingsOverlay, HelpOverlay, PendingOverlay } from "./components/Overlays";
import { Toasts } from "./components/Fx";

type OverlayKind = null | "deck" | "casebook" | "settings" | "help";

/** 무대(1280×720)를 뷰포트에 맞춰 줄이고 늘린다. 좁은 화면에서는 좌우 16px 여백을 둔다. */
function useStageScale(ref: React.RefObject<HTMLDivElement>): number {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const el = ref.current;
    const fit = () => {
      const w = el?.clientWidth || window.innerWidth;
      const h = el?.clientHeight || window.innerHeight;
      const gutter = w < 900 ? 16 : 0;
      setScale(Math.max(0.2, Math.min((w - gutter * 2) / 1280, h / 720)));
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(fit) : null;
    if (ro && el) ro.observe(el);
    return () => {
      window.removeEventListener("resize", fit);
      ro?.disconnect();
    };
  }, [ref]);
  return scale;
}

export function App() {
  const snap = useStore();
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const scale = useStageScale(viewportRef);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = React.useState<OverlayKind>(null);
  React.useEffect(() => {
    registerStage(stageRef.current, scale);
  }, [scale]);
  const state = snap.state;
  React.useEffect(() => {
    hideTip();
  }, [state?.phase, overlay]);

  const now = performance.now();
  const pulseRelic = new Set(snap.fx.filter((f) => f.kind === "relic" && f.at <= now + 50 && f.at + f.dur > now).map((f) => f.target ?? ""));

  let screen: React.ReactNode = null;
  if (!state) screen = <TitleScreen onHelp={() => setOverlay("help")} />;
  else {
    switch (state.phase) {
      case "map":
        screen = <MapScreen state={state} />;
        break;
      case "combat":
        screen = <CombatScreen state={state} fx={snap.fx} settings={snap.settings} />;
        break;
      case "reward":
        screen = <RewardScreen state={state} />;
        break;
      case "shop":
        screen = <ShopScreen state={state} />;
        break;
      case "rest":
        screen = <RestScreen state={state} />;
        break;
      case "event":
        screen = <EventScreen state={state} />;
        break;
      case "boss_relic":
        screen = <BossRelicScreen state={state} />;
        break;
      case "gameover":
      case "victory":
        screen = <EndScreen state={state} />;
        break;
    }
  }

  return (
    <div className="viewport" ref={viewportRef}>
      <div className="stage" ref={stageRef} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {state && (
          <EmrBanner
            state={state}
            pulseRelic={pulseRelic}
            onDeck={() => setOverlay("deck")}
            onCasebook={() => setOverlay("casebook")}
            onSettings={() => setOverlay("settings")}
          />
        )}
        <main className={`screen screen-${state ? state.phase : "title"}`}>{screen}</main>
        {state?.pending && <PendingOverlay state={state} />}
        {overlay === "deck" && state && <DeckOverlay state={state} onClose={() => setOverlay(null)} />}
        {overlay === "casebook" && state && <CasebookOverlay state={state} onClose={() => setOverlay(null)} />}
        {overlay === "settings" && <SettingsOverlay snap={snap} onClose={() => setOverlay(null)} />}
        {overlay === "help" && <HelpOverlay onClose={() => setOverlay(null)} />}
        <Toasts fx={snap.fx} />
        {snap.lastError && (
          <div className="error-note" role="status" onClick={() => controller.clearError()}>
            {snap.lastError}
          </div>
        )}
        <TipLayer />
      </div>
      <div className="rotate-hint">가로 화면에서 더 잘 보인다. 기기를 돌려 주세요.</div>
    </div>
  );
}
