// 결정론 검사용 상태 해시. 키를 정렬한 직렬화 → cyrb128.
import { cyrb128 } from "./rng";
import type { GameState } from "./types";

export function canonicalStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalStringify(x))).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(",")}}`;
}

export function stateHash(state: GameState): string {
  const h = cyrb128(canonicalStringify(state));
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}
