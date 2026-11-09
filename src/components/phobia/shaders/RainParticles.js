import * as THREE from 'three';

/**
 * Dynamic Rain & Ground Mist Particle System for MiskolcPhobia
 * Provides:
 * - 3000 falling rain line streaks (6000 vertices) with wind drift and auto-recycling
 * - Translucent ground mist / fog particles floating over the scrap yard terrain
 * - Position tracking around the active camera
 */
export class RainParticles {
  constructor(options = {}) {
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

  _initRainStreaks() {
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
      const length = 0.6 + Math.random() * 0.7; // 0.6m to 1.3m streak
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
      opacity: 0.42,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    this.rainMesh = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.group.add(this.rainMesh);
  }

  _initGroundMist() {
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
    let mistTex = null;
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
      }
    }
    if (!mistTex) {
      mistTex = new THREE.Texture();
    }

    this.mistMaterial = new THREE.PointsMaterial({
      color: 0x90a5be,
      size: 4.5,
      map: mistTex,
      transparent: true,
      opacity: 0.32,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    this.mistPoints = new THREE.Points(this.mistGeometry, this.mistMaterial);
    this.group.add(this.mistPoints);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.group.visible = this.enabled;
  }

  update(delta, cameraPosition = null) {
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
      const len = this.rainLengths[i];

      // Update Top vertex
      pos[idx] += dx;
      pos[idx + 1] -= dy;
      pos[idx + 2] += dz;

      // Wrap if fallen below ground
      if (pos[idx + 1] < 0) {
        pos[idx] = camX + (Math.random() - 0.5) * this.boxWidth;
        pos[idx + 1] = this.boxHeight + Math.random() * 2.0;
        pos[idx + 2] = camZ + (Math.random() - 0.5) * this.boxDepth;
      } else {
        // Wrap horizontally around camera
        if (pos[idx] < camX - halfW) pos[idx] += this.boxWidth;
        else if (pos[idx] > camX + halfW) pos[idx] -= this.boxWidth;

        if (pos[idx + 2] < camZ - halfD) pos[idx + 2] += this.boxDepth;
        else if (pos[idx + 2] > camZ + halfD) pos[idx + 2] -= this.boxDepth;
      }

      // Update Bottom vertex relative to Top vertex
      const topX = pos[idx];
      const topY = pos[idx + 1];
      const topZ = pos[idx + 2];

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
      mistPos[mIdx] += vel.vx * dt;
      mistPos[mIdx + 2] += vel.vz * dt;

      // Keep mist bounded around camera
      if (mistPos[mIdx] < camX - halfW) mistPos[mIdx] += this.boxWidth;
      else if (mistPos[mIdx] > camX + halfW) mistPos[mIdx] -= this.boxWidth;

      if (mistPos[mIdx + 2] < camZ - halfD) mistPos[mIdx + 2] += this.boxDepth;
      else if (mistPos[mIdx + 2] > camZ + halfD) mistPos[mIdx + 2] -= this.boxDepth;

      mIdx += 3;
    }
    this.mistPosAttribute.needsUpdate = true;
  }

  dispose() {
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.mistGeometry.dispose();
    this.mistMaterial.dispose();
    this.group.clear();
  }
}

export default RainParticles;
