/**
 * Atmosphere.ts
 *
 * Quality presets, cheap image-based lighting and colour grading for the MiskolcPhobia renderer.
 *
 *  - QUALITY_PRESETS: single table the engine reads (pixel ratio, shadows, textures, IBL, grade).
 *  - createNightEnvironment(): tiny procedural night-sky + sodium-lamp scene baked once with PMREM so
 *    metal and wet surfaces have something to reflect (without it PBR metals render near-black).
 *  - ColorGradeShader: linear-space lift/gain, contrast, saturation with cold shadows and warm highlights.
 *    Runs before OutputPass, so tone mapping (ACES, set on the renderer) is applied after grading.
 */

import * as THREE from 'three';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  pixelRatio: number;
  shadows: boolean;
  flashlightShadow: boolean;
  flashlightShadowSize: number;
  floodShadowSize: number;
  textures: QualityLevel;
  envMap: boolean;
  grade: boolean;
  contactShadows: boolean;
  antialias: boolean;
  rainScale: number;
  fogDensity: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    pixelRatio: 1,
    shadows: false,
    flashlightShadow: false,
    flashlightShadowSize: 256,
    floodShadowSize: 512,
    textures: 'low',
    envMap: false,
    grade: false,
    contactShadows: true,
    antialias: false,
    rainScale: 0.5,
    fogDensity: 0.011
  },
  medium: {
    pixelRatio: 1.5,
    shadows: true,
    flashlightShadow: true,
    flashlightShadowSize: 512,
    floodShadowSize: 512,
    textures: 'medium',
    envMap: true,
    grade: true,
    contactShadows: true,
    antialias: true,
    rainScale: 0.75,
    fogDensity: 0.0095
  },
  high: {
    pixelRatio: 2,
    shadows: true,
    flashlightShadow: true,
    flashlightShadowSize: 1024,
    floodShadowSize: 1024,
    textures: 'high',
    envMap: true,
    grade: true,
    contactShadows: true,
    antialias: true,
    rainScale: 1,
    fogDensity: 0.0085
  }
};

export function normalizeQuality(level: unknown): QualityLevel | null {
  return level === 'low' || level === 'medium' || level === 'high' ? level : null;
}

/** Bake a small night environment. Caller owns (and must dispose) the returned render target texture. */
export function createNightEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();

  // vertical sky gradient dome
  const skyGeo = new THREE.SphereGeometry(50, 24, 12);
  const colors: number[] = [];
  const pos = skyGeo.getAttribute('position');
  const top = new THREE.Color(0x1a2245);
  const horizon = new THREE.Color(0x3a3f55);
  const ground = new THREE.Color(0x0c0c10);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    if (y > 0) c.copy(horizon).lerp(top, Math.pow(y, 0.7));
    else c.copy(horizon).lerp(ground, Math.min(1, -y * 3));
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  scene.add(sky);

  // a pale moon and a few warm lamp panels so reflections get highlights
  const panel = (w: number, h: number, color: THREE.ColorRepresentation, intensity: number, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(7, 7, 0xaabbff, 6, -20, 32, 14); // moon
  panel(4, 2, 0xffc27a, 5, 28, 6, -10); // sodium lamp
  panel(4, 2, 0xffc27a, 4, -26, 5, 20);
  panel(10, 1.2, 0xc8e0ff, 2, 0, 12, -30); // distant cold strip light

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();

  sky.geometry.dispose();
  sky.material.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== sky) {
      o.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
  return target;
}

export const ColorGradeShader = {
  name: 'PhobiaColorGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uShadowTint: { value: new THREE.Color(0.9, 1.0, 1.12) }, // cold teal shadows
    uHighlightTint: { value: new THREE.Color(1.1, 1.02, 0.9) }, // warm lamp highlights
    uSaturation: { value: 0.92 },
    uContrast: { value: 1.08 },
    uGain: { value: 1.0 },
    uLift: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uGain;
    uniform float uLift;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uGain + uLift;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // split toning: shadows cold, highlights warm
      float w = smoothstep(0.02, 0.6, l);
      col *= mix(uShadowTint, uHighlightTint, w);
      // contrast around mid grey (linear 0.18)
      col = max((col - 0.18) * uContrast + 0.18, 0.0);
      float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l2), col, uSaturation);
      gl_FragColor = vec4(col, c.a);
    }
  `
};
