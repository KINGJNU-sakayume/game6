// sfc32 + cyrb128. 스트림 파생. design.md §3.6
import type { RngState } from "./types";

export function cyrb128(str: string): RngState {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** 상태를 제자리에서 갱신하고 부호 없는 32비트 정수를 돌려준다. */
export function nextU32(s: RngState): number {
  let a = s[0] >>> 0,
    b = s[1] >>> 0,
    c = s[2] >>> 0,
    d = s[3] >>> 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t >>> 0;
}

export function deriveStream(key: string): RngState {
  const s = cyrb128(key);
  for (let i = 0; i < 12; i++) nextU32(s);
  return s;
}

/** [0, n) 정수. n ≤ 0이면 0. */
export function randInt(s: RngState, n: number): number {
  if (n <= 1) return 0;
  return nextU32(s) % n;
}

/** [lo, hi] 정수. */
export function randRange(s: RngState, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + randInt(s, hi - lo + 1);
}

export function pickWeighted<T>(s: RngState, entries: readonly (readonly [T, number])[]): T {
  const valid = entries.filter(([, w]) => w > 0);
  if (valid.length === 0) {
    const first = entries[0];
    if (!first) throw new Error("pickWeighted: empty");
    return first[0];
  }
  const total = valid.reduce((acc, [, w]) => acc + w, 0);
  let roll = randInt(s, total);
  for (const [item, w] of valid) {
    if (roll < w) return item;
    roll -= w;
  }
  return valid[valid.length - 1]![0];
}

export function pickOne<T>(s: RngState, items: readonly T[]): T {
  const item = items[randInt(s, items.length)];
  if (item === undefined) throw new Error("pickOne: empty");
  return item;
}

export function shuffleInPlace<T>(s: RngState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
