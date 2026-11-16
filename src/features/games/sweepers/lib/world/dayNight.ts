// Napszak (spec 28): a szerveróra helyi extrapolálása és a fény-/színállapot levezetése. Tiszta kód.
import type { ClockState } from '../../worldTypes';

export interface ClockNow {
  /** 0..dayMs, 0 = sunrise. */
  readonly timeMs: number;
  readonly day: number;
}

/** The server clock advanced by the server time elapsed since the sample (never runs backwards past it). */
export function extrapolateClock(clock: ClockState, serverNow: number): ClockNow {
  const elapsed = Math.max(0, serverNow - clock.serverTime);
  const total = clock.timeMs + elapsed;
  return { timeMs: total % clock.dayMs, day: clock.day + Math.floor(total / clock.dayMs) };
}

/** In-game wall clock: sunrise at 06:00, daylight is the first `daylightMs` of the day. */
export const SUNRISE_HOUR = 6;

export function clockLabel(clock: ClockState, now: ClockNow): string {
  const dayHours = 24 * (now.timeMs / clock.dayMs);
  const minutes = Math.floor(((SUNRISE_HOUR + dayHours) % 24) * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const hexToRgb = (hex: number): Rgb => ({ r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 });
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

/** Spec 28 colours. */
export const SUN_DAY = 0xffe4b5;
export const SUN_NIGHT = 0x0f172a;
export const SODIUM = 0xff9900;
const SKY_DAY = 0x9fb4c9;
const SKY_DUSK = 0xd88a5a;
const SKY_NIGHT = 0x0b1022;
const HEMI_SKY_DAY = 0xdfe9f5;
const HEMI_SKY_NIGHT = 0x1e293b;
const HEMI_GROUND_DAY = 0x3a3a34;
const HEMI_GROUND_NIGHT = 0x0c0d12;

/** Fraction of the day over which dawn / dusk blend. */
const TWILIGHT = 0.04;

export interface LightingState {
  /** 0 = full night, 1 = full day. */
  readonly daylight: number;
  /** Sun elevation 0..1 (sin of the arc) while up, 0 at night. */
  readonly elevation: number;
  /** Sun azimuth progress 0..1 across the daylight arc (moon arc at night). */
  readonly arc: number;
  readonly night: boolean;
  /** Street / hex / depot lights are on. */
  readonly lampsOn: boolean;
  readonly sunColor: Rgb;
  readonly sunIntensity: number;
  readonly skyColor: Rgb;
  readonly hemiSky: Rgb;
  readonly hemiGround: Rgb;
  readonly hemiIntensity: number;
  readonly ambientIntensity: number;
}

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export function lightingAt(clock: ClockState, timeMs: number): LightingState {
  const p = timeMs / clock.dayMs;
  const dayFrac = clock.daylightMs / clock.dayMs;
  // daylight ramps up over [0, TWILIGHT] and down over [dayFrac − TWILIGHT, dayFrac]
  const daylight = p < dayFrac ? Math.min(smooth(p / TWILIGHT), smooth((dayFrac - p) / TWILIGHT)) : 0;
  const night = p >= dayFrac;
  const arc = night ? (p - dayFrac) / (1 - dayFrac) : p / dayFrac;
  const elevation = night ? 0 : Math.sin(arc * Math.PI);
  const sunColor = mixRgb(hexToRgb(SUN_NIGHT), hexToRgb(SUN_DAY), daylight);
  // dusk tint peaks when daylight is half-way
  const duskAmount = 1 - Math.abs(daylight * 2 - 1);
  const skyBase = mixRgb(hexToRgb(SKY_NIGHT), hexToRgb(SKY_DAY), daylight);
  return {
    daylight,
    elevation,
    arc,
    night,
    lampsOn: daylight < 0.35,
    sunColor,
    // moonlight keeps a faint key light so the night is readable
    sunIntensity: 0.35 + 2.1 * daylight,
    skyColor: mixRgb(skyBase, hexToRgb(SKY_DUSK), duskAmount * 0.45),
    hemiSky: mixRgb(hexToRgb(HEMI_SKY_NIGHT), hexToRgb(HEMI_SKY_DAY), daylight),
    hemiGround: mixRgb(hexToRgb(HEMI_GROUND_NIGHT), hexToRgb(HEMI_GROUND_DAY), daylight),
    hemiIntensity: 0.3 + 0.6 * daylight,
    ambientIntensity: 0.12 + 0.18 * daylight
  };
}
