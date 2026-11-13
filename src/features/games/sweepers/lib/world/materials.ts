// Procedurális anyagok (AssetCache-en át): koszos/tiszta aszfalt maszkkal (spec 18), panelházhomlokzat
// ablakrácsa és éjjel világító ablakai, rozsdás hullámlemez, éjjel kigyulladó nátriumlámpák, LED-kijelző.
// A közös uniformok (maszk, nedvesség, éjszaka, idő) képkockánkénti állapotok, nem anyagparaméterek:
// egy objektumon osztoznak az anyagok, így a gyorsítótárazott anyagot sosem kell újrafordítani.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { MASK_HALF_EXTENT } from './cleanMask';

function neutralMask(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/** 1×1 half-clean mask used when no cleanliness render target is bound. */
export const neutralMaskTexture = (): THREE.Texture => AssetCache.get().texture('mask.neutral', neutralMask);

/** Shared per-frame uniforms of every world material. */
export const WORLD_UNIFORMS = {
  uSweepMask: { value: neutralMaskTexture() },
  /** 0 dry .. 1 soaked (drizzle). */
  uWetness: { value: 0 },
  /** 0 day .. 1 night (lit windows, lamps). */
  uNight: { value: 0 },
  uTime: { value: 0 }
};

/** Resets the per-session uniform state (a new game starts dry, at day, with the neutral mask). */
export function resetWorldUniforms(): void {
  WORLD_UNIFORMS.uSweepMask.value = neutralMaskTexture();
  WORLD_UNIFORMS.uWetness.value = 0;
  WORLD_UNIFORMS.uNight.value = 0;
  WORLD_UNIFORMS.uTime.value = 0;
}

const NOISE_GLSL = /* glsl */ `
uniform sampler2D uSweepMask;
uniform float uWetness;
uniform float uNight;
uniform float uTime;
float swHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float swNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(swHash(i), swHash(i + vec2(1.0, 0.0)), u.x), mix(swHash(i + vec2(0.0, 1.0)), swHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float swFbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * swNoise(p); p *= 2.03; a *= 0.5; } return v; }
`;

const WORLD_POS_VERTEX = /* glsl */ `
#include <begin_vertex>
vec4 swWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
swWorld = instanceMatrix * swWorld;
#endif
swWorld = modelMatrix * swWorld;
vSwWorld = swWorld.xyz;
`;

type ShaderHook = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

function withWorldUniforms(material: THREE.Material, key: string, hook: ShaderHook): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSweepMask = WORLD_UNIFORMS.uSweepMask;
    shader.uniforms.uWetness = WORLD_UNIFORMS.uWetness;
    shader.uniforms.uNight = WORLD_UNIFORMS.uNight;
    shader.uniforms.uTime = WORLD_UNIFORMS.uTime;
    hook(shader);
  };
  // the hooks share one function body, so the program key must name the variant explicitly
  material.customProgramCacheKey = () => `sweepers:${key}`;
}

export type GroundKind = 'terrain' | 'road' | 'sidewalk' | 'path' | 'rail' | 'stairs';

const GROUND_BASE: Readonly<Record<GroundKind, { color: number; roughness: number; dirt: number }>> = {
  terrain: { color: 0xffffff, roughness: 0.95, dirt: 0.75 }, // vertex colours carry the base
  road: { color: 0x2b2c30, roughness: 0.9, dirt: 1 }, // clean dark asphalt
  sidewalk: { color: 0x8d8b86, roughness: 0.92, dirt: 0.9 },
  path: { color: 0x7a6a55, roughness: 1, dirt: 0.6 },
  rail: { color: 0x5b554e, roughness: 1, dirt: 0.8 },
  stairs: { color: 0x9a978f, roughness: 0.9, dirt: 0.8 }
};

/**
 * AsphaltCleaningShader (spec 18): grime, grease and slag noise in world XZ blended over the clean
 * base by the cleanliness mask (1 = clean); drizzle darkens the albedo and lowers the roughness.
 */
export function groundMaterial(kind: GroundKind): THREE.Material {
  return AssetCache.get().material(`ground.${kind}`, () => {
    const base = GROUND_BASE[kind];
    const material = new THREE.MeshStandardMaterial({
      color: base.color,
      roughness: base.roughness,
      metalness: 0,
      vertexColors: kind === 'terrain',
      polygonOffset: kind !== 'terrain',
      polygonOffsetFactor: kind === 'terrain' ? 0 : -2,
      polygonOffsetUnits: kind === 'terrain' ? 0 : -2
    });
    const dirt = base.dirt.toFixed(2);
    withWorldUniforms(material, `ground.${kind}`, (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSwWorld;')
        .replace('#include <begin_vertex>', WORLD_POS_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vSwWorld;\n${NOISE_GLSL}\nfloat swGrease = 0.0;`)
        .replace('#include <color_fragment>', /* glsl */ `
#include <color_fragment>
vec2 swXZ = vSwWorld.xz;
float swClean = texture2D(uSweepMask, (swXZ + ${MASK_HALF_EXTENT.toFixed(1)}) / ${(MASK_HALF_EXTENT * 2).toFixed(1)}).r;
float swGrime = swFbm(swXZ * 0.35);
float swGreaseN = smoothstep(0.6, 0.78, swFbm(swXZ * 0.11 + 17.0));
float swSlag = step(0.82, swHash(floor(swXZ * 5.0))) * smoothstep(0.42, 0.7, swFbm(swXZ * 0.7 + 5.0));
vec3 swDirt = mix(diffuseColor.rgb * vec3(0.95, 0.85, 0.7) + vec3(0.09, 0.075, 0.05), vec3(0.2, 0.16, 0.11), swGrime * 0.85);
swDirt = mix(swDirt, vec3(0.025, 0.025, 0.03), swGreaseN * 0.85);
swDirt = mix(swDirt, vec3(0.45, 0.22, 0.09), swSlag);
float swDirtAmt = clamp((1.0 - swClean) * 1.25 - 0.1 + (swGrime - 0.5) * 0.3, 0.0, 1.0) * ${dirt};
diffuseColor.rgb = mix(diffuseColor.rgb, swDirt, swDirtAmt);
diffuseColor.rgb *= 1.0 - 0.35 * uWetness;
swGrease = swGreaseN * swDirtAmt;
`)
        .replace('#include <roughnessmap_fragment>', /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.32, swGrease);
roughnessFactor = mix(roughnessFactor, 0.1, uWetness * (0.55 + 0.45 * swFbm(swXZ * 0.18 + 3.0)));
`);
    });
    return material;
  });
}

/** Plain lit material driven by vertex colours (most procedural parts). */
export function litMaterial(): THREE.Material {
  return AssetCache.get().material('lit.vc', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }));
}

/** Weathered metal: vertex colour base, world-space rust patches, corrugation and drizzle sheen. */
export function rustMaterial(): THREE.Material {
  return AssetCache.get().material('rust.vc', () => {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.35 });
    withWorldUniforms(material, 'rust', (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSwWorld;')
        .replace('#include <begin_vertex>', WORLD_POS_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vSwWorld;\n${NOISE_GLSL}`)
        .replace('#include <color_fragment>', /* glsl */ `
#include <color_fragment>
float swRust = smoothstep(0.42, 0.75, swFbm(vSwWorld.xy * 0.6 + vSwWorld.zy * 0.45 + 11.0));
float swCorr = 0.86 + 0.14 * sin((vSwWorld.x + vSwWorld.z) * 9.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.2, 0.08) * (0.7 + 0.5 * swNoise(vSwWorld.xy * 4.0)), swRust * 0.85) * swCorr;
diffuseColor.rgb *= 1.0 - 0.25 * uWetness;
`)
        .replace('#include <roughnessmap_fragment>', /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.3, uWetness);
`);
    });
    return material;
  });
}

/**
 * Prefab concrete panel block: the window grid comes from the box's metric local coordinates
 * (instance scale × unit position), so one material fits every block size. Windows light up at night
 * (hashed per window), the ground floor carries graffiti tags, the panels streak with weathering.
 */
export function panelMaterial(): THREE.Material {
  return AssetCache.get().material('panel10.facade', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.93, metalness: 0 });
    withWorldUniforms(material, 'panel', (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSwLocal;\nvarying vec3 vSwNormal;\nvarying float vSwSeed;')
        .replace('#include <begin_vertex>', /* glsl */ `
#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 swScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vSwSeed = fract(instanceMatrix[3].x * 0.131 + instanceMatrix[3].z * 0.717);
#else
vec3 swScale = vec3(1.0);
vSwSeed = 0.37;
#endif
vSwLocal = position * swScale;
vSwNormal = normal;
`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vSwLocal;\nvarying vec3 vSwNormal;\nvarying float vSwSeed;\n${NOISE_GLSL}\nfloat swLit = 0.0;`)
        .replace('#include <color_fragment>', /* glsl */ `
#include <color_fragment>
if (abs(vSwNormal.y) < 0.5) {
  float u = abs(vSwNormal.x) > 0.5 ? vSwLocal.z : vSwLocal.x;
  float v = vSwLocal.y;
  vec2 cell = vec2(floor(u / 3.0), floor(v / 2.8));
  vec2 f = vec2(fract(u / 3.0), fract(v / 2.8));
  float seam = step(f.x, 0.012) + step(f.y, 0.02);
  float streak = swNoise(vec2(u * 1.7, v * 0.12 + vSwSeed * 40.0));
  diffuseColor.rgb *= 0.86 + 0.18 * swNoise(cell * 0.7 + vSwSeed * 9.0) - 0.16 * smoothstep(0.55, 0.9, streak);
  diffuseColor.rgb *= 1.0 - 0.35 * clamp(seam, 0.0, 1.0);
  float isWindow = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.82) * step(2.8, v);
  float h = swHash(cell + vSwSeed * 31.0 + sign(vSwNormal.x + vSwNormal.z) * 7.0);
  vec3 glass = mix(vec3(0.09, 0.11, 0.14), vec3(0.32, 0.29, 0.22), step(0.8, h) * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, isWindow);
  swLit = isWindow * step(0.5, h) * uNight;
  float tagZone = 1.0 - step(2.3, v);
  float tag = smoothstep(0.62, 0.66, swFbm(vec2(u * 0.9, v * 1.3) + vSwSeed * 13.0)) * step(0.45, swHash(vec2(floor(u / 4.0), vSwSeed)));
  vec3 tagColor = 0.5 + 0.5 * cos(6.2831 * (swHash(vec2(floor(u / 4.0), 3.0)) + vec3(0.0, 0.33, 0.67)));
  diffuseColor.rgb = mix(diffuseColor.rgb, tagColor, tag * tagZone);
}
diffuseColor.rgb *= 1.0 - 0.2 * uWetness;
`)
        .replace('#include <emissivemap_fragment>', /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += swLit * vec3(1.0, 0.72, 0.38) * 1.4;
`);
    });
    return material;
  });
}

/** Lamp heads, window bands and aviation lights: dim by day, glowing at night (sodium #FF9900). */
export function nightGlowMaterial(): THREE.Material {
  return AssetCache.get().material('glow.night', () => {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    withWorldUniforms(material, 'glow', (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uNight;`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.18, 1.6, uNight);');
    });
    return material;
  });
}

/** Unlit, instance-coloured (hex beacons, surface highlights). */
export function beaconMaterial(): THREE.Material {
  return AssetCache.get().material('beacon', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
}

/** 7-segment glyph bits: a b c d e f g. */
const SEGMENTS: Readonly<Record<string, number>> = {
  '0': 0b1111110,
  '1': 0b0110000,
  '2': 0b1101101,
  '3': 0b1111001,
  '4': 0b0110011,
  '5': 0b1011011,
  '6': 0b1011111,
  '7': 0b1110000,
  '8': 0b1111111,
  '9': 0b1111011,
  '-': 0b0000001,
  ' ': 0
};

/** Rasterises `text` as green 7-segment digits on a black board (DataTexture, no canvas needed). */
export function sevenSegmentTexture(text: string): THREE.DataTexture {
  const digitW = 20;
  const width = digitW * text.length + 8;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 6;
    data[i * 4 + 1] = 14;
    data[i * 4 + 2] = 8;
    data[i * 4 + 3] = 255;
  }
  const rect = (x0: number, y0: number, w: number, h: number): void => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        // DataTexture row 0 is the bottom row of the image
        const i = ((height - 1 - y) * width + x) * 4;
        data[i] = 40;
        data[i + 1] = 255;
        data[i + 2] = 90;
      }
    }
  };
  [...text].forEach((ch, n) => {
    const bits = SEGMENTS[ch] ?? 0;
    const x = 6 + n * digitW;
    const on = (bit: number): boolean => (bits & (1 << (6 - bit))) !== 0;
    if (on(0)) rect(x + 2, 3, 10, 2); // a
    if (on(1)) rect(x + 12, 5, 2, 10); // b
    if (on(2)) rect(x + 12, 17, 2, 10); // c
    if (on(3)) rect(x + 2, 27, 10, 2); // d
    if (on(4)) rect(x, 17, 2, 10); // e
    if (on(5)) rect(x, 5, 2, 10); // f
    if (on(6)) rect(x + 2, 15, 10, 2); // g
  });
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Weighbridge LED board: "0000" kg until Phase E drives it. */
export function ledMaterial(): THREE.Material {
  const cache = AssetCache.get();
  return cache.material('led.display', () =>
    new THREE.MeshBasicMaterial({ map: cache.texture('tex.led.idle', () => sevenSegmentTexture('0000')), toneMapped: false }));
}

function stripeTexture(a: number, b: number): THREE.DataTexture {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  const data = new Uint8Array(8 * 4);
  for (let i = 0; i < 8; i++) {
    const c = i < 4 ? ca : cb;
    data[i * 4] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 8, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Yellow/black hazard tape; uv.x runs in metres along the tape (one stripe pair per 0.6 m). */
export function hazardTapeMaterial(): THREE.Material {
  const cache = AssetCache.get();
  return cache.material('hazard.tape', () => {
    const map = cache.texture('tex.hazard', () => stripeTexture(0xffcc00, 0x111111));
    map.repeat.set(1 / 0.6, 1);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.6, side: THREE.DoubleSide });
  });
}

export const SURFACE_STYLE = {
  wet: { color: 0x1d2630, roughness: 0.05, opacity: 0.55 },
  mud: { color: 0x4a3622, roughness: 1, opacity: 0.85 },
  grease: { color: 0x0c0c0e, roughness: 0.18, opacity: 0.85 },
  acid: { color: 0x7fd12a, roughness: 0.3, opacity: 0.7 }
} as const;

/** Decal for a layout surface patch. */
export function surfaceMaterial(kind: keyof typeof SURFACE_STYLE): THREE.Material {
  return AssetCache.get().material(`surface.${kind}`, () => {
    const s = SURFACE_STYLE[kind];
    return new THREE.MeshStandardMaterial({
      color: s.color,
      roughness: s.roughness,
      metalness: kind === 'grease' ? 0.2 : 0,
      transparent: true,
      opacity: s.opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      emissive: kind === 'acid' ? 0x2a5a08 : 0x000000
    });
  });
}
