// Saját, eredeti hívás-hangkészlet (Web Audio szintézis, nincs hangfájl, nincs kölcsönzött dallam).
// Hangszín: lágy "üveg-harang" (szinuszos alaphang + enyhén elhangolt felhangok, gyors támadás,
// exponenciális lecsengés) finom, generált teremhanggal és kompresszorral a csúcsok ellen.
import { getCallSettings } from './callSettings';

export interface Ringtone {
  id: RingtoneId;
  label: string;
  hint: string;
}

export const RINGTONES: Ringtone[] = [
  { id: 'aurora', label: 'Aurora', hint: 'Emelkedő, légies pentaton futam' },
  { id: 'halo', label: 'Halo', hint: 'Lassú, meleg akkordharang' },
  { id: 'pulse', label: 'Pulse', hint: 'Játékos, ritmikus marimba-érzet' },
  { id: 'minimal', label: 'Minimal', hint: 'Két diszkrét hang' }
];

// Hangmagasságok (Hz)
const N = {
  A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, 'F#5': 739.99, G5: 783.99, A5: 880.0,
  B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, 'F#6': 1479.98, G6: 1567.98, E4: 329.63, G4: 392.0
};

type NoteName = keyof typeof N;
/** [hang, kezdet (s), hossz (s), hangerő] */
type Note = readonly [NoteName, number, number, number];

interface Pattern {
  /** a ciklus hossza (s) */
  cycle: number;
  notes: readonly Note[];
}

/** Lazily created audio graph: context -> master gain -> compressor -> destination, plus a reverb send. */
interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  reverbSend: GainNode;
}

interface LoopEntry {
  stop: () => void;
}

type AudioContextCtor = typeof AudioContext;

let graph: AudioGraph | null = null;
const activeLoops = new Set<LoopEntry>();
let unlockBound = false;

function ensure(): AudioGraph | null {
  const AC: AudioContextCtor | undefined =
    window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!AC) return null;
  if (!graph) {
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);

    // Generált lecsengő zaj = egyszerű, természetes hangzású reverb
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.28;
    reverbSend.connect(conv);
    conv.connect(master);
    graph = { ctx, master, reverbSend };
  }
  bindUnlock();
  if (graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => {});
  return graph;
}

// A böngésző csak felhasználói művelet után engedi a hangot: az első kattintás/érintés feloldja
function bindUnlock(): void {
  if (unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    if (graph && graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => {});
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));
}

export const unlockCallAudio = (): void => { ensure(); };
export const isCallAudioBlocked = (): boolean => !!graph && graph.ctx.state !== 'running';

const volume = () => Math.min(1, Math.max(0, getCallSettings().volume));
const enabled = () => getCallSettings().soundsEnabled;

// Egy harang-hang: alap + 2. felhang (enyhén elhangolva) + halk szub
function makeBus(g: AudioGraph): GainNode {
  const bus = g.ctx.createGain();
  bus.connect(g.master);
  bus.connect(g.reverbSend);
  return bus;
}

interface BellOptions {
  dur?: number;
  gain?: number;
  bright?: number;
}

function bell(ctx: AudioContext, bus: GainNode, freq: number, when: number, { dur = 0.9, gain = 0.5, bright = 0.35 }: BellOptions = {}): void {
  const t0 = ctx.currentTime + when;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4200;
  out.connect(lp);
  lp.connect(bus);

  ([[1, 1], [2.005, bright], [3.01, bright * 0.25], [0.5, 0.18]] as const).forEach(([mul, g]) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    og.gain.value = g;
    o.connect(og);
    og.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  });
}

// Dallamok: [hang, kezdet(s), hossz(s), hangerő]; a ciklus hossza a "cycle"
const PATTERNS = {
  aurora: {
    cycle: 3.4,
    notes: [
      ['E5', 0, 0.9, 0.42], ['G5', 0.16, 0.9, 0.4], ['B5', 0.32, 1.0, 0.4], ['E6', 0.5, 1.4, 0.45],
      ['D6', 1.5, 0.8, 0.3], ['B5', 1.66, 0.8, 0.3], ['G5', 1.82, 1.2, 0.34]
    ]
  },
  halo: {
    cycle: 3.8,
    notes: [
      ['A4', 0, 2.2, 0.34], ['E5', 0.05, 2.2, 0.3], ['A5', 0.1, 2.4, 0.26],
      ['G4', 1.9, 1.8, 0.26], ['D5', 1.95, 1.8, 0.24]
    ]
  },
  pulse: {
    cycle: 2.6,
    notes: [
      ['C5', 0, 0.45, 0.4], ['E5', 0.18, 0.45, 0.38], ['G5', 0.36, 0.45, 0.38], ['E5', 0.54, 0.45, 0.34],
      ['C6', 0.9, 0.9, 0.4], ['G5', 1.2, 0.8, 0.3]
    ]
  },
  minimal: {
    cycle: 3.2,
    notes: [['D6', 0, 1.0, 0.4], ['A5', 0.28, 1.3, 0.36]]
  }
} satisfies Record<string, Pattern>;

export type RingtoneId = keyof typeof PATTERNS;

/** Unknown ids fall back to aurora. NOTE: a plain-object lookup, so prototype keys are not filtered (kept as-is). */
const patternFor = (id: string | null | undefined): Pattern =>
  (PATTERNS as Partial<Record<string, Pattern>>)[String(id)] || PATTERNS.aurora;

function playPattern(ctx: AudioContext, bus: GainNode, pattern: Pattern, mul = 1): void {
  pattern.notes.forEach(([n, at, dur, g]) => bell(ctx, bus, N[n], at, { dur, gain: g * mul }));
}

const setMasterVolume = (g: AudioGraph): void => {
  g.master.gain.cancelScheduledValues(g.ctx.currentTime);
  g.master.gain.setValueAtTime(volume(), g.ctx.currentTime);
};

// Folyamatosan ismétlődő hang (csengőhang / kicsengés). Visszaad egy stop() függvényt.
function loop(pattern: Pattern, gainMul: number): () => void {
  const g = enabled() ? ensure() : null;
  if (!g) return () => {};
  const { ctx } = g;
  const bus = makeBus(g);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = () => {
    if (stopped) return;
    if (ctx.state === 'running' && enabled()) {
      setMasterVolume(g);
      playPattern(ctx, bus, pattern, gainMul);
    }
    timer = setTimeout(tick, pattern.cycle * 1000);
  };
  tick();

  const entry: LoopEntry = {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      activeLoops.delete(entry);
      // Gyors lehalkítás: a már ütemezett harangok nem szólnak tovább
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 400);
    }
  };
  activeLoops.add(entry);
  return entry.stop;
}

export function startIncomingRingtone(id?: string | null): () => void {
  const key = id || getCallSettings().ringtone;
  return loop(patternFor(key), 1);
}

// Kimenő hívás: lágy, két hangos "kicsengés" (a csengőhangtól eltérő, halkabb karakter)
export function startOutgoingRingback(): () => void {
  return loop({ cycle: 3.2, notes: [['E4', 0, 1.0, 0.3], ['B4', 0.35, 1.5, 0.3]] }, 1);
}

function oneShot(notes: readonly Note[], mul = 1): void {
  const g = enabled() ? ensure() : null;
  if (!g || g.ctx.state !== 'running') return;
  setMasterVolume(g);
  const bus = makeBus(g);
  notes.forEach(([n, at, dur, gain]) => bell(g.ctx, bus, N[n], at, { dur, gain: gain * mul }));
  setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 3000);
}

export const playCallConnected = (): void => oneShot([['B5', 0, 0.5, 0.3], ['F#6', 0.11, 0.8, 0.3]]);
export const playCallEnded = (): void => oneShot([['F#5', 0, 0.45, 0.3], ['B4', 0.12, 0.7, 0.3]]);
export const playCallMissed = (): void => oneShot([['A5', 0, 0.5, 0.26], ['E5', 0.2, 0.9, 0.24]]);
export const playCallDeclined = (): void => oneShot([['G5', 0, 0.35, 0.24], ['D5', 0.12, 0.6, 0.22]]);

// Beállításokban: egy csengőhang meghallgatása (egyszeri lejátszás, akkor is, ha a hangok ki vannak kapcsolva)
export function previewRingtone(id?: string | null): void {
  const g = ensure();
  if (!g) return;
  const { ctx } = g;
  const p = patternFor(id);
  const play = () => {
    if (ctx.state !== 'running') return;
    setMasterVolume(g);
    const bus = makeBus(g);
    playPattern(ctx, bus, p, 1);
    setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, (p.cycle + 2) * 1000);
  };
  ctx.state === 'running' ? play() : ctx.resume().then(play).catch(() => {});
}

export function stopAllCallSounds(): void {
  [...activeLoops].forEach((e) => e.stop());
}
