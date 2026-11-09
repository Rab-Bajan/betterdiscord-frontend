/**
 * VHS Hunt Glitch Shader for MiskolcPhobia
 * Provides:
 * - Dynamic RGB split chromatic aberration
 * - CRT scanlines
 * - Analog static noise
 * - Intermittent VHS tape jitter and tracking glitches during active ghost hunts
 */
export const VhsHuntGlitchShader = {
  name: 'VhsHuntGlitchShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uHuntIntensity: { value: 0.0 }, // 0.0 = inactive, 1.0 = peak hunt proximity
    uScanlineDensity: { value: 650.0 },
    uAberrationOffset: { value: 0.012 },
    uNoiseIntensity: { value: 0.35 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uHuntIntensity;
    uniform float uScanlineDensity;
    uniform float uAberrationOffset;
    uniform float uNoiseIntensity;

    varying vec2 vUv;

    // High quality pseudo-random generator
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      if (uHuntIntensity <= 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 uv = vUv;

      // 1. VHS Tracking wobble and tape glitch tear lines
      float wobble = sin(uv.y * 55.0 + uTime * 18.0) * (0.006 * uHuntIntensity);
      
      // Periodic horizontal tear band
      float tearBand = fract(uTime * 0.8);
      float tearDistance = abs(uv.y - tearBand);
      if (tearDistance < 0.035) {
        float tearShift = (1.0 - (tearDistance / 0.035)) * 0.025 * uHuntIntensity;
        wobble += tearShift * sin(uTime * 40.0);
      }

      uv.x = clamp(uv.x + wobble, 0.0, 1.0);

      // 2. RGB Split Chromatic Aberration
      float splitDistance = uAberrationOffset * uHuntIntensity;
      vec2 redOffset = vec2(splitDistance, 0.0);
      vec2 blueOffset = vec2(-splitDistance, 0.0);

      float r = texture2D(tDiffuse, clamp(uv + redOffset, 0.0, 1.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, clamp(uv - blueOffset, 0.0, 1.0)).b;
      vec3 color = vec3(r, g, b);

      // 3. CRT Scanlines
      float scanline = sin(uv.y * uScanlineDensity + uTime * 8.0) * 0.5 + 0.5;
      color -= scanline * 0.22 * uHuntIntensity;

      // 4. Analog Static Noise
      float seed = rand(uv * 500.0 + fract(uTime * 67.0));
      float staticFactor = uNoiseIntensity * uHuntIntensity;
      
      // Occasional static burst during heavy hunt
      if (uHuntIntensity > 0.45) {
        float burstRoll = rand(vec2(floor(uTime * 12.0), 4.2));
        if (burstRoll > 0.8) {
          staticFactor += 0.35 * uHuntIntensity;
        }
      }

      vec3 staticColor = vec3(seed);
      color = mix(color, staticColor, clamp(staticFactor * 0.45, 0.0, 0.85));

      // 5. Horror Vignette Darkening at Edges
      float dist = distance(uv, vec2(0.5));
      color *= clamp(1.0 - dist * 0.7 * uHuntIntensity, 0.05, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `
};
export default VhsHuntGlitchShader;
