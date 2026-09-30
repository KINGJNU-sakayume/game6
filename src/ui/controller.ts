// 상태 보관, dispatch, 저장, 연출 큐. design.md §3.8–3.9
import { CONTENT } from "../content";
import { cardDef, hasCard, hasRelicDef, installContent, newRun, stateHash, step } from "../core";
import type { Action, GameEvent, GameState } from "../core";
import { setSoundEnabled, sfx } from "./sfx";

installContent(CONTENT);

const SAVE_KEY = "orderset.save";
/** 저장 파일 형식. 3: 감별 진단·처방집 모델 (2 이하의 저장은 규칙이 달라 이어 하지 않는다) */
const SAVE_VERSION = 3;
const SETTINGS_KEY = "orderset.settings";

export type AnimSpeed = "normal" | "fast" | "off";
export interface Settings {
  anim: AnimSpeed;
  sound: boolean;
}

export interface Fx {
  id: number;
  kind: "float" | "toast" | "flash" | "stamp" | "turn" | "shake" | "relic";
  target?: string; // "patient" | enemy uid | relic id
  text?: string;
  tone?: string;
  at: number; // 시작 시각(ms, performance.now 기준)
  dur: number;
}

export interface Snapshot {
  state: GameState | null;
  version: number;
  fx: Fx[];
  settings: Settings;
  lastError?: string;
}

interface SaveFile {
  schemaVersion: number;
  state: GameState;
  actionLog: Action[];
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장소를 쓸 수 없어도 게임은 계속된다 */
  }
}
function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

/** 없는 카드·유물 ID를 대체한다 (design §3.9) */
function migrate(state: GameState): { state: GameState; warnings: string[] } {
  const warnings: string[] = [];
  for (const c of [...state.run.deck, ...(state.run.formulary ?? [])]) {
    if (!hasCard(c.cardId)) {
      warnings.push(`카드 ${c.cardId}`);
      c.cardId = "obsolete_card";
    }
  }
  for (const r of state.run.relics) {
    if (!hasRelicDef(r.id)) {
      warnings.push(`유물 ${r.id}`);
      r.id = "obsolete_relic";
    }
  }
  return { state, warnings };
}

class Controller {
  private listeners = new Set<() => void>();
  private snap: Snapshot;
  private log: Action[] = [];
  private fxId = 1;

  constructor() {
    let settings: Settings = { anim: "normal", sound: true };
    const raw = safeGet(SETTINGS_KEY);
    if (raw) {
      try {
        settings = { ...settings, ...(JSON.parse(raw) as Partial<Settings>) };
      } catch {
        /* 무시 */
      }
    }
    this.snap = { state: null, version: 0, fx: [], settings };
    setSoundEnabled(settings.sound);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snap;

  private emit(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 };
    for (const l of this.listeners) l();
  }

  hasSave(): boolean {
    const raw = safeGet(SAVE_KEY);
    if (!raw) return false;
    try {
      const f = JSON.parse(raw) as SaveFile;
      return f.schemaVersion === SAVE_VERSION && f.state.phase !== "gameover" && f.state.phase !== "victory";
    } catch {
      return false;
    }
  }

  savedSummary(): string | null {
    const raw = safeGet(SAVE_KEY);
    if (!raw) return null;
    try {
      const f = JSON.parse(raw) as SaveFile;
      const r = f.state.run;
      return `${r.patient.surname}○○ · ${r.act}막 ${r.floor}층 · 활력 ${r.vitality}/${r.maxVitality}`;
    } catch {
      return null;
    }
  }

  newGame(seed: string): void {
    const state = newRun(seed);
    this.log = [];
    this.persist(state);
    this.emit({ state, fx: [], lastError: undefined });
  }

  loadSave(): boolean {
    const raw = safeGet(SAVE_KEY);
    if (!raw) return false;
    try {
      const f = JSON.parse(raw) as SaveFile;
      if (f.schemaVersion !== SAVE_VERSION) return false;
      const { state, warnings } = migrate(f.state);
      this.log = f.actionLog ?? [];
      this.emit({ state, fx: [], lastError: warnings.length ? `저장 파일의 일부 항목이 사라져 대체했다: ${warnings.join(", ")}` : undefined });
      return true;
    } catch {
      return false;
    }
  }

  restore(data: { state?: GameState; log?: Action[] }): boolean {
    if (!data.state) return false;
    this.log = data.log ?? [];
    this.emit({ state: data.state, fx: [] });
    return true;
  }

  hotData(): { state: GameState | null; log: Action[] } {
    return { state: this.snap.state, log: this.log };
  }

  toTitle(): void {
    this.emit({ state: null, fx: [] });
  }

  abandon(): void {
    safeRemove(SAVE_KEY);
    this.log = [];
    this.emit({ state: null, fx: [] });
  }

  setSettings(s: Partial<Settings>): void {
    const settings = { ...this.snap.settings, ...s };
    safeSet(SETTINGS_KEY, JSON.stringify(settings));
    setSoundEnabled(settings.sound);
    this.emit({ settings });
  }

  exportRun(): string {
    const s = this.snap.state;
    return JSON.stringify({ seed: s?.seed, actionLog: this.log, finalHash: s ? stateHash(s) : null });
  }

  private persist(state: GameState): void {
    const file: SaveFile = { schemaVersion: SAVE_VERSION, state, actionLog: this.log };
    safeSet(SAVE_KEY, JSON.stringify(file));
  }

  dispatch = (action: Action): boolean => {
    const s = this.snap.state;
    if (!s) return false;
    const r = step(s, action);
    if (r.events[0]?.type === "action_rejected") {
      this.emit({ lastError: r.events[0].reason });
      return false;
    }
    this.log.push(action);
    this.persist(r.state);
    const fx = this.makeFx(r.events, s, r.state);
    const now = performance.now();
    this.playSounds(action, fx, s, r.state, now);
    const keep = this.snap.fx.filter((f) => f.at + f.dur > now);
    this.emit({ state: r.state, fx: [...keep, ...fx], lastError: undefined });
    return true;
  };

  /** 연출과 같은 시각에 효과음을 낸다 */
  private playSounds(action: Action, fx: Fx[], before: GameState, after: GameState, now: number): void {
    if (!this.snap.settings.sound) return;
    if (action.type === "play_card") sfx.card();
    if (action.type === "end_turn") sfx.turn();
    if (before.phase !== after.phase) {
      if (after.phase === "victory") window.setTimeout(() => sfx.victory(), 300);
      else if (after.phase === "gameover") window.setTimeout(() => sfx.defeat(), 300);
    }
    const at = (f: Fx) => Math.max(0, f.at - now);
    let lastHit = -1000;
    for (const f of fx) {
      const d = at(f);
      let play: (() => void) | null = null;
      if (f.kind === "float") {
        if (f.tone === "hurt") play = () => sfx.hurt();
        else if (f.tone === "block") play = () => sfx.block();
        else if (f.tone === "heal") play = () => sfx.heal();
        else if (f.tone === "harm") play = () => sfx.harm();
        else if (f.tone === "void") play = () => sfx.dull();
        else if (f.tone && ["key", "weak", "normal", "resistant"].includes(f.tone)) {
          // 여러 번 때리는 카드가 소리를 겹쳐 내지 않도록 간격을 둔다
          if (d - lastHit < 60) continue;
          lastHit = d;
          const grade = f.tone;
          play = () => sfx.hit(grade);
        }
      } else if (f.kind === "stamp") play = f.text === "치료" ? () => sfx.cure() : () => sfx.stamp();
      else if (f.kind === "toast" && (f.tone === "hazard" || f.tone === "contraindication")) play = () => sfx.alert();
      if (play) {
        if (d < 16) play();
        else window.setTimeout(play, d);
      }
    }
  }

  clearError(): void {
    if (this.snap.lastError) this.emit({ lastError: undefined });
  }

  /** 이벤트 → 연출. 적 턴의 연출은 차례로 늦춰 재생한다. */
  private makeFx(events: GameEvent[], before: GameState, after: GameState): Fx[] {
    const speed = this.snap.settings.anim;
    if (speed === "off") return [];
    const k = speed === "fast" ? 0.5 : 1;
    const out: Fx[] = [];
    let t = performance.now();
    let enemyPhase = false;
    const push = (f: Omit<Fx, "id" | "at">, delay = 0) => {
      out.push({ ...f, dur: f.dur * k, id: this.fxId++, at: t + delay * k });
    };
    for (const ev of events) {
      switch (ev.type) {
        case "enemy_move":
          enemyPhase = true;
          t += 420 * k;
          push({ kind: "shake", target: ev.target, dur: 360 });
          break;
        case "damage":
          if (ev.target === "patient") {
            if (ev.amount - ev.absorbed > 0) push({ kind: "flash", target: "patient", dur: 380 });
            push({ kind: "float", target: "patient", text: ev.amount - ev.absorbed > 0 ? `−${ev.amount - ev.absorbed}` : "막음", tone: ev.amount - ev.absorbed > 0 ? "hurt" : "block", dur: 1100 });
          } else {
            const tone = ev.grade === "key" ? "key" : ev.grade === "weak" ? "weak" : ev.grade === "resistant" ? "resistant" : "normal";
            push({ kind: "float", target: ev.target, text: ev.absorbed && ev.amount === ev.absorbed ? "막힘" : `−${ev.amount - ev.absorbed}`, tone, dur: 1100 });
            push({ kind: "shake", target: ev.target, dur: 260 });
          }
          if (!enemyPhase) t += 90 * k;
          break;
        case "ineffective":
          push({ kind: "float", target: ev.target, text: ev.reason === "not_indicated" ? "적응증 아님" : "무효", tone: "void", dur: 1300 });
          break;
        case "harmful_treatment":
          push({ kind: "float", target: ev.target, text: `금기 +${ev.healed}`, tone: "harm", dur: 1500 });
          push({ kind: "toast", text: "금기 약물이 질병을 악화시켰다", tone: "hazard", dur: 2400 });
          break;
        case "healed":
          if (ev.target === "patient" && ev.amount > 0) push({ kind: "float", target: "patient", text: `+${ev.amount}`, tone: "heal", dur: 1100 });
          else if (ev.target !== "patient" && ev.amount > 0) push({ kind: "float", target: ev.target, text: `+${ev.amount}`, tone: "regen", dur: 1000 });
          break;
        case "vitality_lost":
          push({ kind: "flash", target: "patient", dur: 380 });
          push({ kind: "float", target: "patient", text: `−${ev.amount}`, tone: "hurt", dur: 1100 });
          break;
        case "stability_gained":
          if (ev.target === "patient" && ev.amount > 0) push({ kind: "float", target: "patient", text: `안정화 +${ev.amount}`, tone: "block", dur: 900 });
          break;
        case "interaction_fired":
          push({ kind: "toast", text: `${ev.blocked ? "DUR 차단 · " : ""}${ev.ruleId} ${ev.text}`, tone: ev.blocked ? "info" : ev.kind, dur: 2600 });
          break;
        case "knowledge_up":
          if (ev.level === 2) push({ kind: "stamp", target: ev.target, text: "확진", dur: 1400 });
          break;
        case "finding_revealed": {
          const moved = ev.changes.filter((x) => x.before !== x.after);
          push({ kind: "float", target: ev.target, text: "새 소견", tone: "info", dur: 900 });
          if (moved.length) push({ kind: "toast", text: `소견: ${ev.text}`, tone: "info", dur: 2000 });
          break;
        }
        case "result_pending":
          push({ kind: "toast", text: `${ev.label}: ${ev.turns}턴 뒤 결과`, tone: "info", dur: 1600 });
          break;
        case "diagnosis_committed":
          push({ kind: "toast", text: ev.revised ? "작업 진단을 바꿨다" : "작업 진단을 정했다", tone: "info", dur: 1500 });
          break;
        case "organism_identified":
          push({ kind: "toast", text: "배양 결과: 원인균 확인", tone: "info", dur: 2200 });
          break;
        case "treatment_response":
          if (ev.response === "none") push({ kind: "toast", text: "기대한 반응이 없다 — 진단을 다시 생각해 본다", tone: "hazard", dur: 2600 });
          break;
        case "definitive":
          push({ kind: "stamp", target: ev.target, text: "결정적 치료", dur: 1400 });
          push({ kind: "toast", text: ev.text, tone: "synergy", dur: 2600 });
          break;
        case "card_returned":
          push({ kind: "toast", text: `처방 반납: ${cardDef(ev.cardId).nameKo}`, tone: "info", dur: 1400 });
          break;
        case "phase_changed":
          push({ kind: "toast", text: `상태 변화: ${ev.name}`, tone: "hazard", dur: 2400 });
          break;
        case "countdown_fired":
          push({ kind: "shake", target: ev.target, dur: 500 });
          break;
        case "enemy_cured":
          push({ kind: "stamp", target: ev.target, text: "치료", dur: 1600 });
          break;
        case "turn_started":
          if (ev.turn > 1) push({ kind: "turn", text: `${ev.turn}턴`, dur: 900 }, 200);
          enemyPhase = false;
          break;
        case "relic_triggered":
          push({ kind: "relic", target: ev.relicId, dur: 900 });
          break;
        case "side_effect_added":
          push({ kind: "toast", text: `부작용: ${cardDef(ev.cardId).nameKo}`, tone: "side", dur: 1800 });
          break;
        default:
          break;
      }
    }
    void before;
    void after;
    return out;
  }
}

export const controller = new Controller();
