// 합성 효과음. 파일을 쓰지 않고 WebAudio로 만든다. 첫 입력 전에는 소리를 내지 않는다.
type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let unlocked = false;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/** 브라우저 자동 재생 정책: 사용자 입력이 있은 뒤에만 오디오를 연다 */
export function unlockAudio(): void {
  unlocked = true;
  const c = audio();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

function audio(): AudioContext | null {
  if (!enabled || !unlocked) return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: Wave; gain?: number; delay?: number; to?: number; attack?: number } = {}): void {
  const c = audio();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const peak = opts.gain ?? 0.2;
  const a = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; q?: number; type?: BiquadFilterType } = {}): void {
  const c = audio();
  if (!c || !master) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + (opts.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.value = opts.freq ?? 2000;
  f.Q.value = opts.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** 처방전을 넘기는 종이 소리 */
  card(): void {
    noise(0.07, { freq: 3200, q: 0.6, gain: 0.16 });
    noise(0.05, { freq: 1400, q: 1.2, gain: 0.08, delay: 0.03 });
  },
  hit(grade: string): void {
    noise(0.12, { type: "lowpass", freq: 700, gain: 0.3 });
    tone(150, 0.14, { type: "triangle", gain: 0.22, to: 70 });
    if (grade === "key") tone(1320, 0.18, { gain: 0.07, delay: 0.02 });
    else if (grade === "weak") tone(990, 0.12, { gain: 0.05, delay: 0.02 });
  },
  /** 모니터 경보: 두 음 */
  hurt(): void {
    tone(988, 0.11, { type: "square", gain: 0.06 });
    tone(784, 0.16, { type: "square", gain: 0.06, delay: 0.13 });
  },
  block(): void {
    tone(520, 0.08, { type: "triangle", gain: 0.12 });
    noise(0.05, { freq: 900, gain: 0.08 });
  },
  heal(): void {
    tone(660, 0.12, { gain: 0.08 });
    tone(880, 0.16, { gain: 0.07, delay: 0.08 });
  },
  harm(): void {
    tone(220, 0.3, { type: "sawtooth", gain: 0.06 });
    tone(233, 0.3, { type: "sawtooth", gain: 0.05 });
  },
  dull(): void {
    tone(180, 0.1, { type: "triangle", gain: 0.1 });
  },
  /** 도장 */
  stamp(): void {
    noise(0.09, { type: "lowpass", freq: 420, gain: 0.4 });
    tone(95, 0.12, { type: "sine", gain: 0.3, to: 60 });
  },
  cure(): void {
    this.stamp();
    tone(784, 0.14, { gain: 0.07, delay: 0.1 });
    tone(1046, 0.22, { gain: 0.07, delay: 0.2 });
  },
  alert(): void {
    tone(1175, 0.07, { type: "square", gain: 0.04 });
    tone(1175, 0.07, { type: "square", gain: 0.04, delay: 0.1 });
  },
  /** 볼펜 딸깍 */
  turn(): void {
    noise(0.025, { freq: 4200, q: 3, gain: 0.18 });
    noise(0.03, { freq: 2600, q: 3, gain: 0.12, delay: 0.06 });
  },
  victory(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, { gain: 0.07, delay: i * 0.11 }));
  },
  defeat(): void {
    tone(988, 1.6, { type: "square", gain: 0.035 });
  },
};
