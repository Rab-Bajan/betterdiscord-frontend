import * as THREE from 'three';

/**
 * Freezing Breath Particle System for MiskolcPhobia
 * Emits translucent vapor puffs every 3 seconds when the local ambient
 * temperature is below 0.0°C (freezing temperatures indicator).
 */
export interface FreezingBreathOptions {
  maxParticles?: number;
  temperature?: number;
  interval?: number;
}

interface BreathParticle {
  active: boolean;
  age: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  alpha: number;
}

export class FreezingBreathParticles {
  readonly group: THREE.Group;
  readonly maxParticles: number;
  temperature: number;
  readonly interval: number;
  timer: number;
  readonly particles: BreathParticle[];
  positions!: Float32Array;
  sizes!: Float32Array;
  alphas!: Float32Array;
  geometry!: THREE.BufferGeometry;
  posAttr!: THREE.BufferAttribute;
  sizeAttr!: THREE.BufferAttribute;
  alphaAttr!: THREE.BufferAttribute;
  material!: THREE.ShaderMaterial;
  points!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(options: FreezingBreathOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'FreezingBreathParticles';

    this.maxParticles = options.maxParticles ?? 64;
    this.temperature = options.temperature ?? 15.0; // Celsius
    this.interval = options.interval ?? 3.0; // 3 seconds between puffs
    this.timer = 0.0;

    // Particle pool state
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        age: 0.0,
        maxLife: 1.25,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        size: 0.1,
        alpha: 0.0
      });
    }

    this._initGeometryAndMaterial();
  }

  _initGeometryAndMaterial(): void {
    this.positions = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1);

    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('size', this.sizeAttr);
    this.geometry.setAttribute('alpha', this.alphaAttr);

    // Procedural soft vapor puff sprite
    let puffTexture: THREE.Texture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
        grad.addColorStop(0.0, 'rgba(235, 245, 255, 0.9)');
        grad.addColorStop(0.3, 'rgba(215, 230, 250, 0.5)');
        grad.addColorStop(0.7, 'rgba(190, 215, 245, 0.15)');
        grad.addColorStop(1.0, 'rgba(180, 205, 240, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        puffTexture = new THREE.CanvasTexture(canvas);
      }
    }
    if (!puffTexture) {
      puffTexture = new THREE.Texture();
    }

    // Custom shader material for soft point puffs
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: puffTexture }
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (320.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTexture;
        varying float vAlpha;
        void main() {
          if (vAlpha <= 0.005) discard;
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(tex.rgb, tex.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  setTemperature(tempCelsius: number | string): void {
    this.temperature = Number(tempCelsius);
  }

  get isFreezing(): boolean {
    return this.temperature < 0.0;
  }

  /**
   * Emits a cluster puff from player's breath
   */
  emitPuff(camera: THREE.Camera | null | undefined): void {
    if (!camera) return;

    // Mouth offset relative to camera
    const mouthOffset = new THREE.Vector3(0.0, -0.12, -0.28);
    mouthOffset.applyQuaternion(camera.quaternion);
    const spawnOrigin = camera.position.clone().add(mouthOffset);

    // Camera forward look vector
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

    // Spawn 8-10 vapor particles
    const puffCount = 9;
    let spawned = 0;

    for (let i = 0; i < this.maxParticles && spawned < puffCount; i++) {
      const p = this.particles[i];
      if (p && !p.active) {
        p.active = true;
        p.age = 0.0;
        p.maxLife = 1.1 + Math.random() * 0.3; // 1.1 to 1.4 seconds

        // Slight position jitter
        p.pos.copy(spawnOrigin).add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.04,
          (Math.random() - 0.5) * 0.04,
          (Math.random() - 0.5) * 0.04
        ));

        // Forward velocity + cone spread + slight thermal lift
        const speed = 0.42 + Math.random() * 0.16;
        p.vel.copy(lookDir).multiplyScalar(speed);
        p.vel.x += (Math.random() - 0.5) * 0.12;
        p.vel.y += 0.06 + Math.random() * 0.06; // slight rise
        p.vel.z += (Math.random() - 0.5) * 0.12;

        p.size = 0.08;
        p.alpha = 0.0;
        spawned++;
      }
    }
  }

  update(delta: number, camera: THREE.Camera | null = null): void {
    const dt = Math.min(delta, 0.1);

    // Timer logic for freezing breath
    if (this.isFreezing && camera) {
      this.timer += dt;
      if (this.timer >= this.interval) {
        this.emitPuff(camera);
        this.timer = 0.0;
      }
    } else {
      this.timer = Math.min(this.timer, this.interval - 0.1);
    }

    // Update active particles
    let activeCount = 0;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p) continue;
      if (p.active) {
        p.age += dt;
        if (p.age >= p.maxLife) {
          p.active = false;
          this.alphas[i] = 0.0;
          continue;
        }

        // Move particle
        p.pos.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(0.96); // drag / deceleration

        // Expand particle size as vapor cools and diffuses
        const progress = p.age / p.maxLife;
        p.size = 0.08 + progress * 0.38; // expands from 0.08m to ~0.46m

        // Fade in quickly, then fade out
        if (progress < 0.2) {
          p.alpha = (progress / 0.2) * 0.38;
        } else {
          p.alpha = (1.0 - (progress - 0.2) / 0.8) * 0.38;
        }

        this.positions[i * 3] = p.pos.x;
        this.positions[i * 3 + 1] = p.pos.y;
        this.positions[i * 3 + 2] = p.pos.z;
        this.sizes[i] = p.size;
        this.alphas[i] = p.alpha;
        activeCount++;
      } else {
        this.alphas[i] = 0.0;
      }
    }

    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }
}

export default FreezingBreathParticles;
