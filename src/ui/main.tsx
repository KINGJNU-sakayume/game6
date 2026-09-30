import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/combat.css";
import { App } from "./App";
import { controller } from "./controller";
import { unlockAudio } from "./sfx";
import type { Action, GameState } from "../core";

declare global {
  interface Window {
    claude?: {
      hot?: {
        snapshot?: (fn: () => unknown) => void;
        ready?: (start: (data: unknown) => void) => void;
        data?: unknown;
      };
    };
  }
}

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

function start(data: unknown) {
  const d = (data ?? {}) as { state?: GameState | null; log?: Action[] };
  if (!d.state || !controller.restore({ state: d.state, log: d.log })) {
    // 저장이 있으면 타이틀에서 이어서 진료를 고를 수 있다
  }
  window.claude?.hot?.snapshot?.(() => controller.hotData());
  const el = document.getElementById("root");
  if (el) createRoot(el).render(<App />);
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
