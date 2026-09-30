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

function useStageScale(): number {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
      setScale(Math.max(0.3, s));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

export function App() {
  const snap = useStore();
  const scale = useStageScale();
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
    <div className="viewport">
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
