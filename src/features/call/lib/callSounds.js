// Saját, eredeti hívás-hangkészlet (Web Audio szintézis, nincs hangfájl, nincs kölcsönzött dallam).
// Hangszín: lágy "üveg-harang" (szinuszos alaphang + enyhén elhangolt felhangok, gyors támadás,
// exponenciális lecsengés) finom, generált teremhanggal és kompresszorral a csúcsok ellen.
import { getCallSettings } from './callSettings';

export const RINGTONES = [
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

let ctx = null;
let master = null;
let reverbSend = null;
let activeLoops = new Set();
let unlockBound = false;

function ensure() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
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
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.28;
    reverbSend.connect(conv);
    conv.connect(master);
  }
  bindUnlock();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// A böngésző csak felhasználói művelet után engedi a hangot: az első kattintás/érintés feloldja
function bindUnlock() {
  if (unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));
}

export const unlockCallAudio = () => { ensure(); };
export const isCallAudioBlocked = () => !!ctx && ctx.state !== 'running';

const volume = () => Math.min(1, Math.max(0, getCallSettings().volume));
const enabled = () => getCallSettings().soundsEnabled;

// Egy harang-hang: alap + 2. felhang (enyhén elhangolva) + halk szub
function makeBus() {
  const bus = ctx.createGain();
  bus.connect(master);
  bus.connect(reverbSend);
  return bus;
}

function bell(bus, freq, when, { dur = 0.9, gain = 0.5, bright = 0.35 } = {}) {
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

  [[1, 1], [2.005, bright], [3.01, bright * 0.25], [0.5, 0.18]].forEach(([mul, g]) => {
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
};

function playPattern(bus, pattern, mul = 1) {
  pattern.notes.forEach(([n, at, dur, g]) => bell(bus, N[n], at, { dur, gain: g * mul }));
}

const setMasterVolume = () => {
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(volume(), ctx.currentTime);
};

// Folyamatosan ismétlődő hang (csengőhang / kicsengés). Visszaad egy stop() függvényt.
function loop(pattern, gainMul) {
  if (!enabled() || !ensure()) return () => {};
  const bus = makeBus();
  let stopped = false;
  let timer = null;
  const entry = {};

  const tick = () => {
    if (stopped) return;
    if (ctx.state === 'running' && enabled()) {
      setMasterVolume();
      playPattern(bus, pattern, gainMul);
    }
    timer = setTimeout(tick, pattern.cycle * 1000);
  };
  tick();

  entry.stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    activeLoops.delete(entry);
    // Gyors lehalkítás: a már ütemezett harangok nem szólnak tovább
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 400);
  };
  activeLoops.add(entry);
  return entry.stop;
}

export function startIncomingRingtone(id) {
  const key = id || getCallSettings().ringtone;
  return loop(PATTERNS[key] || PATTERNS.aurora, 1);
}

// Kimenő hívás: lágy, két hangos "kicsengés" (a csengőhangtól eltérő, halkabb karakter)
export function startOutgoingRingback() {
  return loop({ cycle: 3.2, notes: [['E4', 0, 1.0, 0.3], ['B4', 0.35, 1.5, 0.3]] }, 1);
}

function oneShot(notes, mul = 1) {
  if (!enabled() || !ensure() || ctx.state !== 'running') return;
  setMasterVolume();
  const bus = makeBus();
  notes.forEach(([n, at, dur, g]) => bell(bus, N[n], at, { dur, gain: g * mul }));
  setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 3000);
}

export const playCallConnected = () => oneShot([['B5', 0, 0.5, 0.3], ['F#6', 0.11, 0.8, 0.3]]);
export const playCallEnded = () => oneShot([['F#5', 0, 0.45, 0.3], ['B4', 0.12, 0.7, 0.3]]);
export const playCallMissed = () => oneShot([['A5', 0, 0.5, 0.26], ['E5', 0.2, 0.9, 0.24]]);
export const playCallDeclined = () => oneShot([['G5', 0, 0.35, 0.24], ['D5', 0.12, 0.6, 0.22]]);

// Beállításokban: egy csengőhang meghallgatása (egyszeri lejátszás, akkor is, ha a hangok ki vannak kapcsolva)
export function previewRingtone(id) {
  if (!ensure()) return;
  const p = PATTERNS[id] || PATTERNS.aurora;
  const play = () => {
    if (ctx.state !== 'running') return;
    setMasterVolume();
    const bus = makeBus();
    playPattern(bus, p, 1);
    setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, (p.cycle + 2) * 1000);
  };
  ctx.state === 'running' ? play() : ctx.resume().then(play).catch(() => {});
}

export function stopAllCallSounds() {
  [...activeLoops].forEach((e) => e.stop());
}
