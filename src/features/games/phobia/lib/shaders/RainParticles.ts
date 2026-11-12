import * as THREE from 'three';

/**
 * Dynamic Rain & Ground Mist Particle System for MiskolcPhobia
 * Provides:
 * - 3000 falling rain line streaks (6000 vertices) with wind drift and auto-recycling
 * - Translucent ground mist / fog particles floating over the scrap yard terrain
 * - Position tracking around the active camera
 */
export interface RainParticlesOptions {
  rainCount?: number;
  mistCount?: number;
  enabled?: boolean;
  boxWidth?: number;
  boxHeight?: number;
  boxDepth?: number;
  fallSpeed?: number;
  windX?: number;
  windZ?: number;
}

interface MistVelocity {
  vx: number;
  vz: number;
  rotSpeed: number;
}

export class RainParticles {
  readonly group: THREE.Group;
  readonly rainCount: number;
  readonly mistCount: number;
  enabled: boolean;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly boxDepth: number;
  readonly fallSpeed: number;
  readonly windX: number;
  readonly windZ: number;
  rainPositions!: Float32Array;
  rainLengths!: Float32Array;
  rainGeometry!: THREE.BufferGeometry;
  rainPosAttribute!: THREE.BufferAttribute;
  rainMaterial!: THREE.LineBasicMaterial;
  rainMesh!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  mistVelocities!: MistVelocity[];
  mistGeometry!: THREE.BufferGeometry;
  mistPosAttribute!: THREE.BufferAttribute;
  mistMaterial!: THREE.PointsMaterial;
  mistPoints!: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  constructor(options: RainParticlesOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = 'RainAndMistParticles';

    this.rainCount = options.rainCount ?? 3000;
    this.mistCount = options.mistCount ?? 100;
    this.enabled = options.enabled ?? true;

    // Extents around player camera
    this.boxWidth = options.boxWidth ?? 70.0;
    this.boxHeight = options.boxHeight ?? 20.0;
    this.boxDepth = options.boxDepth ?? 80.0;

    this.fallSpeed = options.fallSpeed ?? 22.0;
    this.windX = options.windX ?? -1.8;
    this.windZ = options.windZ ?? -0.6;

    this._initRainStreaks();
    this._initGroundMist();
  }

  _initRainStreaks(): void {
    // 3000 line streaks -> 6000 vertices (top point and bottom point for each streak)
    this.rainPositions = new Float32Array(this.rainCount * 6);
    this.rainLengths = new Float32Array(this.rainCount);

    const halfW = this.boxWidth / 2;
    const halfD = this.boxDepth / 2;

    let idx = 0;
    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * this.boxWidth;
      const y = Math.random() * this.boxHeight;
      const z = (Math.random() - 0.5) * this.boxDepth;
      const length = 0.3 + Math.random() * 0.35; // 0.3m to 0.65m streak
      this.rainLengths[i] = length;

      // Top vertex
      this.rainPositions[idx++] = x;
      this.rainPositions[idx++] = y;
      this.rainPositions[idx++] = z;

      // Bottom vertex (slanted slightly along wind vector)
      this.rainPositions[idx++] = x + (this.windX / this.fallSpeed) * length;
      this.rainPositions[idx++] = y - length;
      this.rainPositions[idx++] = z + (this.windZ / this.fallSpeed) * length;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainPosAttribute = new THREE.BufferAttribute(this.rainPositions, 3);
    this.rainGeometry.setAttribute('position', this.rainPosAttribute);

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0x98b8df,
      transparent: true,
      opacity: 0.22,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    this.rainMesh = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rainMesh.frustumCulled = false; // positions follow the camera; bounding sphere would be stale
    this.group.add(this.rainMesh);
  }

  _initGroundMist(): void {
    const mistPositions = new Float32Array(this.mistCount * 3);
    this.mistVelocities = [];

    const halfW = this.boxWidth / 2;
    const halfD = this.boxDepth / 2;

    let idx = 0;
    for (let i = 0; i < this.mistCount; i++) {
      mistPositions[idx++] = (Math.random() - 0.5) * this.boxWidth;
      mistPositions[idx++] = 0.15 + Math.random() * 1.25; // low near ground
      mistPositions[idx++] = (Math.random() - 0.5) * this.boxDepth;

      this.mistVelocities.push({
        vx: (Math.random() - 0.5) * 0.2 + this.windX * 0.1,
        vz: (Math.random() - 0.5) * 0.2 + this.windZ * 0.1,
        rotSpeed: (Math.random() - 0.5) * 0.05
      });
    }

    this.mistGeometry = new THREE.BufferGeometry();
    this.mistPosAttribute = new THREE.BufferAttribute(mistPositions, 3);
    this.mistGeometry.setAttribute('position', this.mistPosAttribute);

    // Procedural soft circular puff texture for mist
    let mistTex: THREE.Texture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
        grad.addColorStop(0.0, 'rgba(180, 195, 215, 0.4)');
        grad.addColorStop(0.4, 'rgba(160, 180, 205, 0.2)');
        grad.addColorStop(0.8, 'rgba(140, 160, 185, 0.05)');
        grad.addColorStop(1.0, 'rgba(120, 140, 165, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        mistTex = new THREE.CanvasTexture(canvas);
        mistTex.colorSpace = THREE.SRGBColorSpace;
      }
    }
    if (!mistTex) {
      mistTex = new THREE.Texture();
    }

    this.mistMaterial = new THREE.PointsMaterial({
      color: 0x90a5be,
      size: 3.5,
      map: mistTex,
      transparent: true,
      opacity: 0.18,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    this.mistPoints = new THREE.Points(this.mistGeometry, this.mistMaterial);
    this.mistPoints.frustumCulled = false;
    this.group.add(this.mistPoints);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = !!enabled;
    this.group.visible = this.enabled;
  }

  update(delta: number, cameraPosition: THREE.Vector3 | null = null): void {
    if (!this.enabled) return;

    const dt = Math.min(delta, 0.1);
    const camX = cameraPosition ? cameraPosition.x : 0;
    const camZ = cameraPosition ? cameraPosition.z : 0;

    const halfW = this.boxWidth / 2;
    const halfD = this.boxDepth / 2;

    // 1. Update Rain Streaks
    const pos = this.rainPositions;
    const dy = this.fallSpeed * dt;
    const dx = this.windX * dt;
    const dz = this.windZ * dt;

    let idx = 0;
    for (let i = 0; i < this.rainCount; i++) {
      const len = this.rainLengths[i] ?? 0;

      // Update Top vertex
      let topX = (pos[idx] ?? 0) + dx;
      let topY = (pos[idx + 1] ?? 0) - dy;
      let topZ = (pos[idx + 2] ?? 0) + dz;

      // Wrap if fallen below ground
      if (topY < 0) {
        topX = camX + (Math.random() - 0.5) * this.boxWidth;
        topY = this.boxHeight + Math.random() * 2.0;
        topZ = camZ + (Math.random() - 0.5) * this.boxDepth;
      } else {
        // Wrap horizontally around camera
        if (topX < camX - halfW) topX += this.boxWidth;
        else if (topX > camX + halfW) topX -= this.boxWidth;

        if (topZ < camZ - halfD) topZ += this.boxDepth;
        else if (topZ > camZ + halfD) topZ -= this.boxDepth;
      }

      pos[idx] = topX;
      pos[idx + 1] = topY;
      pos[idx + 2] = topZ;

      // Update Bottom vertex relative to Top vertex
      pos[idx + 3] = topX + (this.windX / this.fallSpeed) * len;
      pos[idx + 4] = topY - len;
      pos[idx + 5] = topZ + (this.windZ / this.fallSpeed) * len;

      idx += 6;
    }
    this.rainPosAttribute.needsUpdate = true;

    // 2. Update Ground Mist
    const mistPos = this.mistPosAttribute.array;
    let mIdx = 0;
    for (let i = 0; i < this.mistCount; i++) {
      const vel = this.mistVelocities[i];
      if (!vel) break;
      let x = (mistPos[mIdx] ?? 0) + vel.vx * dt;
      let z = (mistPos[mIdx + 2] ?? 0) + vel.vz * dt;

      // Keep mist bounded around camera
      if (x < camX - halfW) x += this.boxWidth;
      else if (x > camX + halfW) x -= this.boxWidth;

      if (z < camZ - halfD) z += this.boxDepth;
      else if (z > camZ + halfD) z -= this.boxDepth;

      mistPos[mIdx] = x;
      mistPos[mIdx + 2] = z;
      mIdx += 3;
    }
    this.mistPosAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.mistGeometry.dispose();
    this.mistMaterial.dispose();
    this.group.clear();
  }
}

export default RainParticles;
