// Synthesized MiskolcEmpire sound effects (WebAudio, no assets). The HUD mute toggle lives in
// store.ui.muted; callers pass it through `muted`.
let ctx = null;
let noiseBuf = null;
const MUTE_KEY = 'empire:muted';

export function loadMuted() {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function saveMuted(v) {
  try { window.localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function noise(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 2.5);
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = (Math.random() * 2 - 1) * 0.5 + b * 6; }
  return noiseBuf;
}

// Collapsing building: low rumble, filtered crumble noise sweeping down, scattered debris clicks.
function collapse(ac, volume) {
  const now = ac.currentTime;
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

const SFX = { sfx_building_collapse: collapse };

export function playEmpireSfx(id, { volume = 0.8, muted = false } = {}) {
  if (muted || volume <= 0.01) return;
  const fn = SFX[id];
  if (!fn) return;
  try {
    const ac = audio();
    // before the first user gesture the context stays suspended: skip instead of queueing a burst
    if (ac && ac.state === 'running') fn(ac, Math.min(1, volume));
  } catch {
    // audio is best-effort; a blocked AudioContext must never break the game loop
  }
}
