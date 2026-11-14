import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MASK_SIZE, MASK_TEXEL_METRES, worldLengthToClip, worldToMaskClip, worldToMaskTexel, worldToMaskUv } from '../../../../../src/features/games/sweepers/lib/world/cleanMask';
import { AsphaltCleaningShader } from '../../../../../src/features/games/sweepers/lib/world/AsphaltCleaningShader';
import { WORLD_UNIFORMS, neutralMaskTexture } from '../../../../../src/features/games/sweepers/lib/world/materials';
import { LAMP_COLORS, crossesClean, lampIntensity, lampMode } from '../../../../../src/features/games/sweepers/lib/world/lampState';
import { HexBeaconLayer } from '../../../../../src/features/games/sweepers/lib/world/cityLayers';
import { SODIUM, SUN_DAY, SUN_NIGHT, clockLabel, extrapolateClock, hexToRgb, lightingAt } from '../../../../../src/features/games/sweepers/lib/world/dayNight';
import { WEATHER_FOG, fogFor, nextWeatherBlend } from '../../../../../src/features/games/sweepers/lib/world/SceneEnvironment';
import { bearingDeg, clampToRim, compassLabel, projectToRadar, radarAngle, type RadarView } from '../../../../../src/features/games/sweepers/lib/hud/radar';
import { hexCorner } from '../../../../../src/features/games/sweepers/lib/world/hexGrid';
import { DEFAULT_CLOCK, type ClockState } from '../../../../../src/features/games/sweepers/worldTypes';

describe('cleanliness mask mapping (spec 18)', () => {
  it('maps world XZ ±300 m onto UV [0, 1]² and clip [-1, 1]²', () => {
    expect(worldToMaskUv(-300, -300)).toEqual({ u: 0, v: 0 });
    expect(worldToMaskUv(300, 300)).toEqual({ u: 1, v: 1 });
    expect(worldToMaskUv(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(worldToMaskUv(150, -75)).toEqual({ u: 0.75, v: 0.375 });
    expect(worldToMaskClip(0, 0)).toEqual({ x: 0, y: 0 });
    expect(worldToMaskClip(300, -300)).toEqual({ x: 1, y: -1 });
    expect(worldLengthToClip(300)).toBe(1);
  });
  it('2048² texels, ≈0.29 m each, clamped at the edges', () => {
    expect(MASK_SIZE).toBe(2048);
    expect(MASK_TEXEL_METRES).toBeCloseTo(0.293, 3);
    expect(worldToMaskTexel(0, 0)).toEqual({ px: 1024, py: 1024 });
    expect(worldToMaskTexel(-1000, 1000)).toEqual({ px: 0, py: 2047 });
  });
  it('the hex fill polygon has its corners where the world hex has them', () => {
    const shader = new AsphaltCleaningShader();
    expect(shader.target.width).toBe(MASK_SIZE);
    expect(shader.target.height).toBe(MASK_SIZE);
    // same construction as the shader's cached 'mask.hex' geometry
    const geo = new THREE.CircleGeometry(worldLengthToClip(40), 6, Math.PI / 6);
    const pos = geo.getAttribute('position');
    const corners = Array.from({ length: 6 }, (_, i) => worldToMaskClip(hexCorner(0, 0, i).x, hexCorner(0, 0, i).z));
    for (let v = 1; v < pos.count; v++) {
      const hit = corners.some((c) => Math.abs(c.x - pos.getX(v)) < 1e-6 && Math.abs(c.y - pos.getY(v)) < 1e-6);
      expect(hit).toBe(true);
    }
    shader.dispose();
  });
  it('queues paint() brushes for the next flush, ignores junk and binds the mask uniform', () => {
    const shader = new AsphaltCleaningShader();
    expect(WORLD_UNIFORMS.uSweepMask.value).toBe(shader.target.texture);
    shader.setHexes([{ id: 0, q: 0, r: 0, district: 0, cleanliness: 35 }]);
    expect(shader.needsInit).toBe(true);
    shader.paint(1, 2, 1.5, 0.4);
    shader.paint(Number.NaN, 0, 1, 1);
    shader.paint(0, 0, -1, 1);
    shader.paint(0, 0, 1, 0);
    shader.paint(3, 4, 1, 7);
    expect(shader.pendingBrushes).toEqual([{ x: 1, z: 2, radius: 1.5, strength: 0.4 }, { x: 3, z: 4, radius: 1, strength: 1 }]);
    shader.dispose();
    expect(WORLD_UNIFORMS.uSweepMask.value).toBe(neutralMaskTexture());
  });
});

describe('hex lamp beacons (spec 24)', () => {
  it('strobing yellow < 50, steady orange 50–89, bright green ≥ 90', () => {
    expect(lampMode(0)).toBe('strobe');
    expect(lampMode(49.9)).toBe('strobe');
    expect(lampMode(50)).toBe('steady');
    expect(lampMode(89.9)).toBe('steady');
    expect(lampMode(90)).toBe('clean');
    expect(LAMP_COLORS.strobe).toBe(0xffd400);
    expect(lampIntensity('strobe', 0)).toBe(1);
    expect(lampIntensity('strobe', 0.25)).toBeLessThan(0.1); // 2 Hz: half a period later it is off
    expect(lampIntensity('steady', 0.25)).toBe(1);
  });
  it('chimes only when crossing 90 upwards', () => {
    expect(crossesClean(89.9, 90)).toBe(true);
    expect(crossesClean(90, 95)).toBe(false);
    expect(crossesClean(95, 80)).toBe(false);
  });
  it('the beacon layer colours each lamp by its hex', () => {
    const layer = new HexBeaconLayer([{ kind: 'hex_lamp', x: 0, z: 0, rotY: 0, s: 1 }, { kind: 'hex_lamp', x: 69.28, z: 0, rotY: 0, s: 1 }], () => 0);
    layer.setCleanliness(0, 0, 95);
    layer.setCleanliness(1, 0, 60);
    layer.update(0);
    const c = new THREE.Color();
    layer.root.getColorAt(0, c);
    expect(c.g).toBeGreaterThan(c.r);
    layer.root.getColorAt(1, c);
    expect(c.r).toBeGreaterThan(c.b);
    expect(c.getHex()).not.toBe(0);
    layer.dispose();
  });
});

describe('day/night clock (spec 28)', () => {
  const clock: ClockState = { ...DEFAULT_CLOCK, timeMs: 1_000_000, day: 2, serverTime: 50_000 };
  it('extrapolates with server time, wraps into the next day, never runs backwards', () => {
    expect(extrapolateClock(clock, 50_000)).toEqual({ timeMs: 1_000_000, day: 2 });
    expect(extrapolateClock(clock, 60_000)).toEqual({ timeMs: 1_010_000, day: 2 });
    expect(extrapolateClock(clock, 50_000 + 1_160_000 + 5)).toEqual({ timeMs: 5, day: 3 });
    expect(extrapolateClock(clock, 0)).toEqual({ timeMs: 1_000_000, day: 2 });
  });
  it('labels sunrise 06:00, noon-ish mid-daylight and night after 22:00', () => {
    expect(clockLabel(DEFAULT_CLOCK, { timeMs: 0, day: 1 })).toBe('06:00');
    expect(clockLabel(DEFAULT_CLOCK, { timeMs: DEFAULT_CLOCK.daylightMs / 2, day: 1 })).toBe('14:00');
    expect(clockLabel(DEFAULT_CLOCK, { timeMs: DEFAULT_CLOCK.daylightMs, day: 1 })).toBe('22:00');
  });
  it('sun warm by day, deep blue at night, lamps on at night', () => {
    const noon = lightingAt(DEFAULT_CLOCK, DEFAULT_CLOCK.daylightMs / 2);
    expect(noon.daylight).toBe(1);
    expect(noon.lampsOn).toBe(false);
    expect(noon.sunColor).toEqual(hexToRgb(SUN_DAY));
    expect(noon.elevation).toBeCloseTo(1);
    const night = lightingAt(DEFAULT_CLOCK, DEFAULT_CLOCK.daylightMs + 100_000);
    expect(night.night).toBe(true);
    expect(night.daylight).toBe(0);
    expect(night.lampsOn).toBe(true);
    expect(night.sunColor).toEqual(hexToRgb(SUN_NIGHT));
    expect(night.hemiIntensity).toBeLessThan(noon.hemiIntensity);
    expect(night.ambientIntensity).toBeLessThan(noon.ambientIntensity);
    const dusk = lightingAt(DEFAULT_CLOCK, DEFAULT_CLOCK.daylightMs - 20_000);
    expect(dusk.daylight).toBeGreaterThan(0);
    expect(dusk.daylight).toBeLessThan(1);
    expect(SODIUM).toBe(0xff9900);
  });
});

describe('weather fog (spec 29)', () => {
  it('smog limits the view to about 30 m and blends smoothly', () => {
    expect(WEATHER_FOG.smog.far).toBeLessThanOrEqual(35);
    expect(fogFor({ from: 'clear', to: 'smog', t: 1 }).far).toBe(WEATHER_FOG.smog.far);
    const half = fogFor({ from: 'clear', to: 'smog', t: 0.5 }).far;
    expect(half).toBeGreaterThan(WEATHER_FOG.smog.far);
    expect(half).toBeLessThan(WEATHER_FOG.clear.far);
  });
});

describe('GPS radar projection (spec 30)', () => {
  const view: RadarView = { cx: 10, cz: 20, yaw: 0, rangeM: 100, radiusPx: 80, headingUp: true };
  it('heading up: straight ahead is up, right is right', () => {
    expect(projectToRadar(view, 10, -30)).toEqual({ px: 0, py: -40 }); // 50 m ahead (−Z)
    const right = projectToRadar(view, 60, 20);
    expect(right.px).toBeCloseTo(40);
    expect(right.py).toBeCloseTo(0);
    const turned = { ...view, yaw: Math.PI / 2 }; // facing −X
    const ahead = projectToRadar(turned, -40, 20);
    expect(ahead.px).toBeCloseTo(0);
    expect(ahead.py).toBeCloseTo(-40);
  });
  it('north up (full map) ignores the yaw', () => {
    expect(projectToRadar({ ...view, headingUp: false, yaw: 1 }, 10, -30)).toEqual({ px: 0, py: -40 });
  });
  it('clamps far pins to the rim and turns headings into screen angles', () => {
    expect(clampToRim({ px: 0, py: -500 }, 80)).toEqual({ px: 0, py: -74, clamped: true });
    expect(clampToRim({ px: 3, py: 4 }, 80).clamped).toBe(false);
    expect(radarAngle(view, 0)).toBe(0);
    expect(radarAngle({ ...view, headingUp: false }, -Math.PI / 2)).toBeCloseTo(Math.PI / 2); // facing east → right
  });
  it('compass: yaw 0 = north (É), facing −X = west (NY)', () => {
    expect(bearingDeg(0)).toBe(0);
    expect(bearingDeg(Math.PI / 2)).toBeCloseTo(270);
    expect(compassLabel(bearingDeg(Math.PI / 2))).toBe('NY');
    expect(compassLabel(bearingDeg(-Math.PI / 2))).toBe('K');
    expect(compassLabel(359)).toBe('É');
  });
});

describe('weather fade on a change (LOW-5)', () => {
  it('a reversal mid-fade runs the same fade backwards, without a jump', () => {
    const mid = { from: 'clear', to: 'smog', t: 0.3 } as const;
    const back = nextWeatherBlend(mid, 'clear');
    expect(back.from).toBe('smog');
    expect(back.to).toBe('clear');
    expect(back.t).toBeCloseTo(0.7, 12);
    const a = fogFor(back);
    const b = fogFor(mid);
    expect(a.near).toBeCloseTo(b.near, 9);
    expect(a.far).toBeCloseTo(b.far, 9);
    expect(a.tintAmount).toBeCloseTo(b.tintAmount, 9);
  });

  it('a finished fade starts a new one; the same kind keeps the fade; a third kind starts from the dominant one', () => {
    expect(nextWeatherBlend({ from: 'clear', to: 'smog', t: 1 }, 'clear')).toEqual({ from: 'smog', to: 'clear', t: 0 });
    const mid = { from: 'clear', to: 'smog', t: 0.4 } as const;
    expect(nextWeatherBlend(mid, 'smog')).toBe(mid);
    expect(nextWeatherBlend(mid, 'drizzle')).toEqual({ from: 'clear', to: 'drizzle', t: 0 });
    expect(nextWeatherBlend({ ...mid, t: 0.6 }, 'drizzle')).toEqual({ from: 'smog', to: 'drizzle', t: 0 });
  });
});
