import * as THREE from 'three';

/**
 * Ghost Dissolve Shader Material for MiskolcPhobia
 * Features:
 * - 3D procedural simplex noise slicing for spectral dissolution / materialization
 * - Optional custom 2D noise texture support
 * - Glowing spectral rim-light
 * - Vibrant burning / ectoplasmic dissolve edge glow
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDissolveProgress; // 0.0 = solid, 1.0 = dissolved
  uniform vec3 uRimColor;
  uniform float uRimPower;
  uniform float uRimIntensity;
  uniform vec3 uBaseColor;
  uniform vec3 uEdgeColor;
  uniform float uEdgeWidth;
  uniform float uNoiseScale;

  uniform sampler2D uBaseTexture;
  uniform float uUseBaseTexture;
  uniform sampler2D uNoiseTexture;
  uniform float uUseNoiseTexture;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPosition;

  // Ashima / Stefan Gustavson Simplex 3D Noise
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    float noiseVal = 0.0;
    if (uUseNoiseTexture > 0.5) {
      noiseVal = texture2D(uNoiseTexture, vUv * 3.0).r;
    } else {
      noiseVal = snoise(vWorldPosition * uNoiseScale + vec3(0.0, uTime * 0.35, 0.0)) * 0.5 + 0.5;
    }

    float threshold = uDissolveProgress * 1.35 - 0.15;
    if (uDissolveProgress > 0.0 && noiseVal < threshold) {
      discard;
    }

    vec4 baseColor = vec4(uBaseColor, 1.0);
    if (uUseBaseTexture > 0.5) {
      baseColor = texture2D(uBaseTexture, vUv);
    }

    // Rim lighting
    float NdotV = max(dot(vNormal, vViewDir), 0.0);
    float rim = pow(1.0 - NdotV, uRimPower) * uRimIntensity;

    // Dissolving edge glow
    float edge = 0.0;
    if (uDissolveProgress > 0.005) {
      edge = smoothstep(threshold, threshold + uEdgeWidth, noiseVal);
      edge = (1.0 - edge) * step(0.005, uDissolveProgress);
    }

    vec3 finalRgb = baseColor.rgb + (uRimColor * rim) + (uEdgeColor * edge * 2.8);
    float alpha = baseColor.a * (1.0 - smoothstep(0.75, 1.0, uDissolveProgress));

    gl_FragColor = vec4(finalRgb, alpha);
  }
`;

export class GhostDissolveMaterial extends THREE.ShaderMaterial {
  constructor(options = {}) {
    const uniforms = {
      uTime: { value: 0.0 },
      uDissolveProgress: { value: options.dissolveProgress ?? 0.0 },
      uRimColor: { value: new THREE.Color(options.rimColor ?? 0x61a6fa) },
      uRimPower: { value: options.rimPower ?? 3.0 },
      uRimIntensity: { value: options.rimIntensity ?? 2.0 },
      uBaseColor: { value: new THREE.Color(options.baseColor ?? 0xdce7f5) },
      uEdgeColor: { value: new THREE.Color(options.edgeColor ?? 0x38e8c6) },
      uEdgeWidth: { value: options.edgeWidth ?? 0.08 },
      uNoiseScale: { value: options.noiseScale ?? 2.5 },
      uBaseTexture: { value: options.baseTexture ?? null },
      uUseBaseTexture: { value: options.baseTexture ? 1.0 : 0.0 },
      uNoiseTexture: { value: options.noiseTexture ?? null },
      uUseNoiseTexture: { value: options.noiseTexture ? 1.0 : 0.0 }
    };

    super({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true
    });
  }

  setDissolveProgress(val) {
    this.uniforms.uDissolveProgress.value = THREE.MathUtils.clamp(val, 0.0, 1.0);
  }

  getDissolveProgress() {
    return this.uniforms.uDissolveProgress.value;
  }

  update(delta) {
    this.uniforms.uTime.value += delta;
  }
}

export default GhostDissolveMaterial;
