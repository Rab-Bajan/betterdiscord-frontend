// Égbolt, köd és fények: egyetlen árnyékot vető nap (2048² árnyéktérkép), amely követi a játékost.
// Phase B: a napszak (spec 28) a nap/hold színét, irányát, a félgömb- és szórt fényt hajtja; az időjárás
// (spec 29) a ködöt: szmog ≈ 30 m látótáv, szitálás párás távol-köd.
import * as THREE from 'three';
import type { LightingState } from './dayNight';
import type { WeatherKind } from '../../worldTypes';

export const SHADOW_MAP_SIZE = 2048;
const SHADOW_EXTENT = 60;
const SUN_DISTANCE = 120;

/** Fog per weather (metres) and its tint; smog keeps the view to about 30 m. */
export const WEATHER_FOG: Readonly<Record<WeatherKind, { near: number; far: number; tint: number; tintAmount: number }>> = {
  clear: { near: 120, far: 520, tint: 0x9fb4c9, tintAmount: 0 },
  smog: { near: 2, far: 32, tint: 0x8d8a76, tintAmount: 0.85 },
  drizzle: { near: 25, far: 200, tint: 0x7d8894, tintAmount: 0.6 }
};

export interface WeatherBlend {
  readonly from: WeatherKind;
  readonly to: WeatherKind;
  /** 0 = `from`, 1 = `to`. */
  readonly t: number;
}

/** The fade after a `miskolc:weather` change to `kind`, continuing from `current` without a pop. */
export function nextWeatherBlend(current: WeatherBlend, kind: WeatherKind): WeatherBlend {
  // reversal mid-fade: run the same fade backwards from where it is
  if (kind === current.from && current.t < 1) return { from: current.to, to: current.from, t: 1 - current.t };
  if (kind === current.to) return current;
  // a third kind mid-fade (the server always passes through clear, so this is rare): start from the dominant one
  return { from: current.t >= 0.5 ? current.to : current.from, to: kind, t: 0 };
}

const fogFrom = new THREE.Color();
const fogTo = new THREE.Color();

export function fogFor(blend: WeatherBlend): { near: number; far: number; tint: number; tintAmount: number } {
  const a = WEATHER_FOG[blend.from];
  const b = WEATHER_FOG[blend.to];
  const t = Math.min(1, Math.max(0, blend.t));
  const color = fogFrom.setHex(a.tint).lerp(fogTo.setHex(b.tint), t);
  return {
    near: a.near + (b.near - a.near) * t,
    far: a.far + (b.far - a.far) * t,
    tint: color.getHex(),
    tintAmount: a.tintAmount + (b.tintAmount - a.tintAmount) * t
  };
}

export class SceneEnvironment {
  readonly sun: THREE.DirectionalLight;
  readonly #hemi: THREE.HemisphereLight;
  readonly #ambient: THREE.AmbientLight;
  readonly #scene: THREE.Scene;
  readonly #fog: THREE.Fog;
  readonly #background = new THREE.Color(0x9fb4c9);
  readonly #sunOffset = new THREE.Vector3(70, 110, 45);
  readonly #tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    scene.background = this.#background;
    this.#fog = new THREE.Fog(0x9fb4c9, 120, 520);
    scene.fog = this.#fog;

    this.#hemi = new THREE.HemisphereLight(0xdfe9f5, 0x3a3a34, 0.9);
    this.#ambient = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(this.#hemi, this.#ambient);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 10;
    cam.far = 320;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun, this.sun.target);
  }

  /** Keeps the shadow frustum centred on the player; snapped to texels to avoid shimmering. */
  follow(x: number, y: number, z: number): void {
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP_SIZE;
    const sx = Math.round(x / texel) * texel;
    const sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, y, sz);
    this.sun.position.set(sx + this.#sunOffset.x, y + this.#sunOffset.y, sz + this.#sunOffset.z);
  }

  /** Day/night colours and the sun (or moon) arc; the weather sets the fog over the sky tint. */
  apply(light: LightingState, weather: WeatherBlend): void {
    // east (+X) at sunrise, overhead at noon, west at sunset; the moon takes the same arc at night
    const a = light.arc * Math.PI;
    const elevation = light.night ? 0.35 + 0.4 * Math.sin(a) : Math.max(0.12, light.elevation);
    this.#sunOffset.set(Math.cos(a) * SUN_DISTANCE, elevation * SUN_DISTANCE, 45);
    this.sun.color.setRGB(light.sunColor.r, light.sunColor.g, light.sunColor.b, THREE.SRGBColorSpace);
    if (light.night) this.sun.color.lerp(this.#tmp.setHex(0x8fa6d8), 0.55); // moonlight stays readable
    this.sun.intensity = light.sunIntensity;
    this.#hemi.color.setRGB(light.hemiSky.r, light.hemiSky.g, light.hemiSky.b, THREE.SRGBColorSpace);
    this.#hemi.groundColor.setRGB(light.hemiGround.r, light.hemiGround.g, light.hemiGround.b, THREE.SRGBColorSpace);
    this.#hemi.intensity = light.hemiIntensity;
    this.#ambient.intensity = light.ambientIntensity;

    const fog = fogFor(weather);
    this.#background.setRGB(light.skyColor.r, light.skyColor.g, light.skyColor.b, THREE.SRGBColorSpace);
    // weather tint dims with the daylight so a smoggy night is not a glowing grey wall
    this.#tmp.setHex(fog.tint).multiplyScalar(0.25 + 0.75 * light.daylight);
    this.#background.lerp(this.#tmp, fog.tintAmount);
    this.#fog.color.copy(this.#background);
    this.#fog.near = fog.near;
    this.#fog.far = fog.far;
  }

  dispose(): void {
    this.#scene.remove(this.#hemi, this.#ambient, this.sun, this.sun.target);
    this.sun.shadow.dispose();
    this.sun.dispose();
    this.#hemi.dispose();
    this.#ambient.dispose();
    this.#scene.fog = null;
    this.#scene.background = null;
  }
}
