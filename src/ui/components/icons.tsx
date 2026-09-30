// 직접 그린 SVG 글리프. 이모지를 쓰지 않는다.
import React from "react";
import type { IntentPart, NodeType } from "../../core";

type P = { size?: number; className?: string };

export function IntentIcon({ kind, size = 20 }: { kind: IntentPart["kind"]; size?: number }) {
  const s = size;
  switch (kind) {
    case "attack":
      // 악화 곡선이 꺾여 내리꽂히는 모양
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M2 5 L8 9 L6 11 L14 16 L11 17.5 L18 18 L16.5 11 L15 14 L9 8.5 L11 6.5 Z" fill="var(--int-attack)" />
        </svg>
      );
    case "debuff":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="var(--int-debuff)" strokeWidth="2" />
          <path d="M10 5 V14 M6.5 10.5 L10 14 L13.5 10.5" fill="none" stroke="var(--int-debuff)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "buff":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="var(--int-buff)" strokeWidth="2" />
          <path d="M10 15 V6 M6.5 9.5 L10 6 L13.5 9.5" fill="none" stroke="var(--int-buff)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "defend":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2 L17 5 V10 C17 14 14 17 10 18.5 C6 17 3 14 3 10 V5 Z" fill="var(--int-defend)" />
          <path d="M10 5 V15.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
        </svg>
      );
    case "complication":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="11" r="7" fill="none" stroke="var(--int-comp)" strokeWidth="2" />
          <path d="M10 7 V11 L12.5 12.5" fill="none" stroke="var(--int-comp)" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 2 H13" stroke="var(--int-comp)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "card":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true">
          <rect x="4" y="2.5" width="11" height="15" rx="1" fill="#fff8dc" stroke="var(--int-card)" strokeWidth="1.8" />
          <path d="M7 7 H12 M7 10 H12 M7 13 H10" stroke="var(--int-card)" strokeWidth="1.4" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="var(--ink-soft)" strokeWidth="2" />
          <path d="M7.5 7.5 C7.5 5 12.5 5 12.5 7.8 C12.5 10 10 9.8 10 12.2 M10 14.6 V15" fill="none" stroke="var(--ink-soft)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

export function NodeGlyph({ type, size = 22 }: { type: NodeType; size?: number }) {
  const s = size;
  const ink = "var(--ink)";
  switch (type) {
    case "battle": // 호출: 간호사 호출벨
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 17 C5 11 7.5 7.5 12 7.5 C16.5 7.5 19 11 19 17 Z" fill="none" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M3.5 17.5 H20.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="5.5" r="1.4" fill={ink} />
          <path d="M9 12 C9.5 10.5 10.5 10 11.5 9.8" stroke={ink} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "elite": // 급변: 심전도 스파이크
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z" fill="none" stroke="var(--stamp)" strokeWidth="1.8" />
          <path d="M5.5 12.5 H9 L10.3 9 L12 16 L13.6 7.5 L15 12.5 H18.5" fill="none" stroke="var(--stamp)" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "rest": // 당직실: 초승달
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.5 3.5 A8.5 8.5 0 1 0 20.5 16 A7 7 0 1 1 15.5 3.5 Z" fill="none" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M17 6.5 L17.6 8 L19 8.4 L17.6 8.9 L17 10.3 L16.4 8.9 L15 8.4 L16.4 8 Z" fill={ink} />
        </svg>
      );
    case "shop": // 약제부: Rx
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 20 V4.5 H11.5 C14.5 4.5 15.5 6.5 15.5 8.2 C15.5 10.5 13.8 12 11.2 12 H6 M10.5 12 L18.5 20.5 M18.5 13.5 L12.5 20" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "treasure": // 가이드라인 개정: 책
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5 C7 4.5 9.5 4.8 12 6.3 C14.5 4.8 17 4.5 20 5.5 V19 C17 18 14.5 18.3 12 19.8 C9.5 18.3 7 18 4 19 Z" fill="none" stroke={ink} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 6.3 V19.8" stroke={ink} strokeWidth="1.5" />
          <path d="M14.5 9 H17.5 M14.5 12 H17.5" stroke="var(--ballpoint)" strokeWidth="1.3" />
        </svg>
      );
    case "event": // 돌발 상황
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 8.5 C8.5 5 15.5 5 15.5 9 C15.5 12 12 11.8 12 15 M12 18.3 V18.8" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "boss":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" fill="none" stroke="var(--stamp)" strokeWidth="2" />
          <path d="M7 12 H9.5 L11 8 L13 16 L14.5 12 H17" fill="none" stroke="var(--stamp)" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function KindGlyph({ kind, size = 12 }: { kind: string; size?: number }) {
  const s = size;
  const c = "currentColor";
  switch (kind) {
    case "drug":
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 1 H8 M4.5 1 V3 L3 5 V11 H9 V5 L7.5 3 V1" fill="none" stroke={c} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M3 7 H9" stroke={c} strokeWidth="1" />
        </svg>
      );
    case "diagnostic":
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="5" cy="5" r="3.3" fill="none" stroke={c} strokeWidth="1.3" />
          <path d="M7.5 7.5 L10.8 10.8" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "side_effect":
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.2 L11 10.5 H1 Z" fill="none" stroke={c} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M6 4.5 V7.3 M6 8.7 V9" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 10 L7.5 4.5 M6.5 3.5 L8.5 1.5 L10.5 3.5 L8.5 5.5 Z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function EcgMark({ size = 16, color = "currentColor" }: P & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 9 H4 L5.3 5 L7.2 12.5 L9 3 L10.4 9 H15" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** 카드 ID로 만드는 결정적 바코드 */
export function Barcode({ seed, width = 64, height = 12 }: { seed: string; width?: number; height?: number }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: React.ReactElement[] = [];
  let x = 0;
  let k = 0;
  while (x < width) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const w = 1 + (Math.abs(h) % 3);
    const gap = 1 + ((Math.abs(h) >> 3) % 2);
    bars.push(<rect key={k++} x={x} y={0} width={w * 0.8} height={height} fill="currentColor" />);
    x += w + gap;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {bars}
    </svg>
  );
}
