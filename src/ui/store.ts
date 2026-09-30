import React from "react";
import { controller } from "./controller";
import type { Snapshot } from "./controller";

export function useStore(): Snapshot {
  return React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

/** 연출이 끝날 때까지 화면을 다시 그리도록 한다 */
export function useFxClock(active: boolean): number {
  const [now, setNow] = React.useState(() => performance.now());
  React.useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}
