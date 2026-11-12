// Synthesized MiskolcEmpire sound effects (WebAudio, no assets) and speech-synthesis voice lines.
// The HUD mute toggle lives in store.ui.muted; callers pass it through `muted`.
let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
const MUTE_KEY = 'empire:muted';

export function loadMuted(): boolean {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function saveMuted(v: boolean): void {
  try { window.localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  if (v) window.speechSynthesis?.cancel();
}

type AudioContextCtor = new () => AudioContext;

function audio(): AudioContext | null {
  if (!ctx) {
    const legacy = (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    const AC: AudioContextCtor | undefined = window.AudioContext || legacy;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function noise(ac: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 2.5);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  noiseBuf = buf;
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = (Math.random() * 2 - 1) * 0.5 + b * 6; }
  return buf;
}

// Collapsing building: low rumble, filtered crumble noise sweeping down, scattered debris clicks.
function collapse(ac: AudioContext, volume: number, now: number): void {
  const out = ac.createGain();
  out.gain.value = volume;
  out.connect(ac.destination);

  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, now);
  lp.frequency.exponentialRampToValueAtTime(140, now + 1.9);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.55, now + 0.06);
  g.gain.exponentialRampToValueAtTime(0.2, now + 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  src.connect(lp); lp.connect(g); g.connect(out);
  src.start(now); src.stop(now + 2.3);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(62, now);
  osc.frequency.exponentialRampToValueAtTime(28, now + 1.6);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
  osc.connect(og); og.connect(out);
  osc.start(now); osc.stop(now + 1.9);

  for (let i = 0; i < 9; i++) {
    const t = now + 0.1 + Math.random() * 1.3;
    const c = ac.createBufferSource();
    c.buffer = noiseBuf;
    const hp = ac.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 900 + Math.random() * 2600;
    hp.Q.value = 3;
    const cg = ac.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.25, t + 0.005);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + Math.random() * 0.08);
    c.connect(hp); hp.connect(cg); cg.connect(out);
    c.start(t, Math.random() * 2); c.stop(t + 0.2);
  }
}

// Thrown wooden clog: a breathy whoosh sweeping up and back down, with a dry tick on release.
function clogThrow(ac: AudioContext, volume: number, now: number): void {
  const out = ac.createGain();
  out.gain.value = volume * 0.7;
  out.connect(ac.destination);
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(500, now);
  bp.frequency.exponentialRampToValueAtTime(1700, now + 0.12);
  bp.frequency.exponentialRampToValueAtTime(700, now + 0.3);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.45, now + 0.09);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  src.connect(bp); bp.connect(g); g.connect(out);
  src.start(now, Math.random() * 2); src.stop(now + 0.35);
  woodTick(ac, out, now, 2400, 0.25);
}

// Hollow wooden "klopp": a short resonant body with a falling pitch plus a bright knock.
function clogHit(ac: AudioContext, volume: number, now: number, pitch = 1): void {
  const out = ac.createGain();
  out.gain.value = volume;
  out.connect(ac.destination);
  for (const [f, peak, len] of [[310, 0.55, 0.16], [760, 0.22, 0.08]] as const) {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(f * pitch * 0.72, now + len);
    const og = ac.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, now + len);
    osc.connect(og); og.connect(out);
    osc.start(now); osc.stop(now + len + 0.02);
  }
  woodTick(ac, out, now, 1800 * pitch, 0.5);
}

function woodTick(ac: AudioContext, out: AudioNode, now: number, freq: number, peak: number): void {
  const c = ac.createBufferSource();
  c.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
  c.connect(bp); bp.connect(g); g.connect(out);
  c.start(now, Math.random() * 2); c.stop(now + 0.05);
}

type SfxFn = (ac: AudioContext, volume: number, now: number) => void;

const SFX: Readonly<Record<string, SfxFn | undefined>> = {
  sfx_building_collapse: collapse,
  sfx_clog_throw: clogThrow,
  sfx_clog_hit: (ac, volume, now) => clogHit(ac, volume, now),
  sfx_clog_ricochet: (ac, volume, now) => clogHit(ac, volume * 0.75, now, 1.35)
};

// Cigány asszony voice lines, spoken with the browser's Hungarian speech synthesis.
const VOICE_LINES: Readonly<Record<string, readonly string[] | undefined>> = {
  voice_asszony_attack: [
    'Rák egye ki a szívedet, te!',
    'Az isten verjen meg, de nagyon!',
    'Hogy esne beléd a guta!',
    'Fene egye meg a pofádat!',
    'Hogy száradna le a kezed!',
    'A nyavalya törjön ki, te mihaszna!',
    'Vigyen el az ördög, de most rögtön!',
    'Hogy rohadnál meg a saját levedben!',
    'Megállj csak, te büdös semmirekellő!',
    'Ezt a papucsot is megérdemled, te!',
    'Szakadjon rád a plafon, te nyomorult!'
  ],
  voice_asszony_order: [
    'Na mi van, mit akarsz?',
    'Megyek már, ne siettess!',
    'Jól van, jól van, ne kiabálj!',
    'Itt vagyok, mit kell már megint?',
    'Ha én egyszer elindulok, abból baj lesz!'
  ],
  voice_asszony_trained: [
    'Na, itt vagyok, lehet félni!',
    'Hol az a gazember, aki bántott?',
    'Megjöttem, és hoztam a papucsomat is!'
  ]
};
const VOICE_GAP_MS = 7000;
let nextVoiceAt = 0;
let voice: SpeechSynthesisVoice | null | undefined;
const lastLine: Record<string, number> = {};

// Prefer a female Hungarian voice; null when the browser has no Hungarian voice at all.
function huVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (voice !== undefined) return voice;
  const list = synth.getVoices();
  if (!list.length) return null;
  const hu = list.filter((v) => /^hu([-_]|$)/i.test(v.lang));
  voice = hu.find((v) => /female|n[őo]i|noemi|mariska|t[üu]nde|krisztina|eszter/i.test(v.name)) || hu.find((v) => !/\bmale\b|szabolcs/i.test(v.name)) || hu[0] || null;
  return voice;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => { voice = undefined; });
}

function speak(id: string, lines: readonly string[], volume: number): void {
  const synth = window.speechSynthesis;
  const now = Date.now();
  if (!synth || now < nextVoiceAt || synth.speaking || synth.pending) return;
  const v = huVoice(synth);
  if (!v) return;
  let i = Math.floor(Math.random() * lines.length);
  if (i === lastLine[id]) i = (i + 1) % lines.length;
  lastLine[id] = i;
  const u = new window.SpeechSynthesisUtterance(lines[i] ?? '');
  u.voice = v;
  u.lang = v.lang;
  u.rate = 0.9;
  u.pitch = 0.8;
  u.volume = volume;
  nextVoiceAt = now + VOICE_GAP_MS;
  synth.speak(u);
}

// delay (seconds) schedules the sound ahead on the audio clock, e.g. a hit that lands when the projectile arrives
export interface SfxOptions {
  volume?: number;
  muted?: boolean;
  delay?: number | undefined;
}

export function playEmpireSfx(id: string, { volume = 0.8, muted = false, delay = 0 }: SfxOptions = {}): void {
  if (muted || volume <= 0.01) return;
  try {
    const lines = VOICE_LINES[id];
    if (lines) { speak(id, lines, Math.min(1, volume)); return; }
    const fn = SFX[id];
    if (!fn) return;
    const ac = audio();
    // before the first user gesture the context stays suspended: skip instead of queueing a burst
    if (ac && ac.state === 'running') fn(ac, Math.min(1, volume), ac.currentTime + Math.max(0, delay));
  } catch {
    // audio is best-effort; a blocked AudioContext or speech engine must never break the game loop
  }
}
