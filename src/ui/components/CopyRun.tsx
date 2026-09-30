// 재생 기록(시드 + 행동 목록) 복사. 클립보드를 쓸 수 없으면 글을 펼쳐 직접 고르게 한다.
import React from "react";
import { controller } from "../controller";

export function CopyRunButton({ label = "재생 기록 복사" }: { label?: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "manual">("idle");
  const [text, setText] = React.useState("");
  const area = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (state === "manual") area.current?.select();
  }, [state]);
  return (
    <span className="copy-run">
      <button
        className="btn"
        onClick={() => {
          const t = controller.exportRun();
          setText(t);
          const fallback = () => setState("manual");
          try {
            if (!navigator.clipboard?.writeText) return fallback();
            navigator.clipboard.writeText(t).then(() => setState("copied"), fallback);
          } catch {
            fallback();
          }
        }}
      >
        {state === "copied" ? "복사했다" : label}
      </button>
      {state === "manual" && (
        <span className="copy-manual">
          <span className="copy-note">복사가 막혀 있다. 아래 글을 골라 직접 복사한다.</span>
          <textarea id="run-export" ref={area} readOnly value={text} rows={3} onFocus={(e) => e.currentTarget.select()} />
        </span>
      )}
    </span>
  );
}
