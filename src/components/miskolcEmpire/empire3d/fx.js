// Pooled particle systems (GPU points, CPU-simulated) and instanced debris chunks.
// One additive pool (sparks, fire, flashes) and one alpha pool (dust, smoke, puffs).
import * as THREE from 'three';

const VERT = `
  attribute float psize;
  attribute vec4 pcolor;
  uniform float uScale;
  varying vec4 vC;
  void main() {
    vC = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(512.0, psize * uScale / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform sampler2D tex;
  varying vec4 vC;
  void main() {
    float a = texture2D(tex, gl_PointCoord).a * vC.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vC.rgb, a);
  }`;

class Pool {
  constructor(parent, tex, max, additive) {
    this.max = max;
    this.n = 0;
    // simulation state, struct-of-arrays
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('pcolor', this.aCol);
    this.geo.setAttribute('psize', this.aSize);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: tex }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    parent.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a0, drag = 0, grav = 0) {
    if (this.n >= this.max) return; // pool exhausted: drop the newest instead of stalling
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
    this.a0[i] = a0; this.drag[i] = drag; this.grav[i] = grav;
  }

  // swap-remove dead particles, integrate, and upload
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.p[i * 3 + 1] < -0.3) this.p[i * 3 + 1] = -0.3;
      i++;
    }
    const pos = this.aPos.array, col = this.aCol.array, size = this.aSize.array;
    for (let k = 0; k < this.n; k++) {
      const t = this.age[k] / this.life[k];
      pos[k * 3] = this.p[k * 3]; pos[k * 3 + 1] = this.p[k * 3 + 1]; pos[k * 3 + 2] = this.p[k * 3 + 2];
      col[k * 4] = this.c[k * 3]; col[k * 4 + 1] = this.c[k * 3 + 1]; col[k * 4 + 2] = this.c[k * 3 + 2];
      // quick fade in, smooth fade out
      col[k * 4 + 3] = this.a0[k] * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      size[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * t;
    }
    this.geo.setDrawRange(0, this.n);
    if (this.n) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, this.n * 3); this.aPos.needsUpdate = true;
      this.aCol.clearUpdateRanges(); this.aCol.addUpdateRange(0, this.n * 4); this.aCol.needsUpdate = true;
      this.aSize.clearUpdateRanges(); this.aSize.addUpdateRange(0, this.n); this.aSize.needsUpdate = true;
    }
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.p[i * 3] = this.p[j * 3]; this.p[i * 3 + 1] = this.p[j * 3 + 1]; this.p[i * 3 + 2] = this.p[j * 3 + 2];
    this.v[i * 3] = this.v[j * 3]; this.v[i * 3 + 1] = this.v[j * 3 + 1]; this.v[i * 3 + 2] = this.v[j * 3 + 2];
    this.life[i] = this.life[j]; this.age[i] = this.age[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.c[i * 3] = this.c[j * 3]; this.c[i * 3 + 1] = this.c[j * 3 + 1]; this.c[i * 3 + 2] = this.c[j * 3 + 2];
    this.a0[i] = this.a0[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }

  dispose() {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

const R = Math.random;
const sr = (s) => (R() - 0.5) * s;

export function createFx(parent, lib, debrisMaterial) {
  const glow = new Pool(parent, lib.particle(), 3000, true);
  const soft = new Pool(parent, lib.particle(), 3500, false);

  // debris: small instanced chunks with simple ballistic motion and ground bounce
  const DMAX = 220;
  const dGeo = new THREE.DodecahedronGeometry(0.07, 0);
  const debris = new THREE.InstancedMesh(dGeo, debrisMaterial, DMAX);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.castShadow = true;
  debris.frustumCulled = false;
  debris.count = 0;
  parent.add(debris);
  const dl = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();

  const fx = {
    glow, soft,
    sparks(x, y, z, n = 8, power = 1, dir = null) {
      for (let i = 0; i < n; i++) {
        const sp = (1.2 + R() * 2.4) * power;
        let vx = sr(2), vy = 0.6 + R() * 1.4, vz = sr(2);
        if (dir) { vx = dir[0] + sr(1.1); vz = dir[2] + sr(1.1); vy = 0.4 + R() * 1.2; }
        const l = Math.hypot(vx, vy, vz) || 1;
        glow.spawn(x, y, z, vx / l * sp, vy / l * sp, vz / l * sp, 0.22 + R() * 0.3, 0.07, 0.02, 1.0, 0.72 + R() * 0.2, 0.32, 1.0, 1.5, 6);
      }
    },
    flash(x, y, z, size = 0.6, r = 1, g = 0.85, b = 0.55) {
      glow.spawn(x, y, z, 0, 0.2, 0, 0.14, size, size * 1.4, r, g, b, 0.9);
    },
    dust(x, y, z, n = 1, scale = 1, r = 0.52, g = 0.46, b = 0.38) {
      for (let i = 0; i < n; i++) {
        soft.spawn(x + sr(0.2 * scale), y + 0.03, z + sr(0.2 * scale), sr(0.4), 0.15 + R() * 0.25, sr(0.4), 0.7 + R() * 0.6, 0.18 * scale, 0.6 * scale, r, g, b, 0.38, 1.4, -0.05);
      }
    },
    smoke(x, y, z, dark = false, scale = 1) {
      const c = dark ? 0.12 + R() * 0.06 : 0.42 + R() * 0.12;
      soft.spawn(x + sr(0.06), y, z + sr(0.06), 0.12 + sr(0.1), 0.45 + R() * 0.3, 0.06 + sr(0.1), 2.4 + R() * 1.4, 0.22 * scale, 1.2 * scale, c, c * 0.98, c * 0.96, dark ? 0.55 : 0.35, 0.25, -0.06);
    },
    fire(x, y, z, scale = 1) {
      glow.spawn(x + sr(0.12 * scale), y, z + sr(0.12 * scale), sr(0.15), 0.6 + R() * 0.6, sr(0.15), 0.35 + R() * 0.3, 0.32 * scale, 0.08 * scale, 1.0, 0.45 + R() * 0.25, 0.12, 0.85, 0.8, -0.4);
    },
    puff(x, y, z, scale = 1) {
      for (let i = 0; i < 10; i++) {
        const a = R() * Math.PI * 2, sp = 0.6 + R() * 0.9;
        soft.spawn(x, y + 0.2, z, Math.cos(a) * sp * scale, 0.3 + R() * 0.6, Math.sin(a) * sp * scale, 0.6 + R() * 0.5, 0.25 * scale, 0.75 * scale, 0.55, 0.52, 0.48, 0.55, 2.2, 0.1);
      }
      fx.flash(x, y + 0.3, z, 0.7 * scale, 1, 0.6, 0.3);
    },
    // big dust cloud plus debris for a collapsing building of footprint `size`
    collapse(x, y, z, size) {
      const n = Math.round(16 + size * 14);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, rr = R() * size * 0.6, sp = 0.4 + R() * 1.4;
        soft.spawn(x + Math.cos(a) * rr, y + R() * 0.6, z + Math.sin(a) * rr, Math.cos(a) * sp, 0.25 + R() * 0.7, Math.sin(a) * sp, 1.6 + R() * 1.6, 0.4 * size, 1.5 * size, 0.5, 0.46, 0.4, 0.6, 1.1, -0.04);
      }
      fx.debris(x, y + 0.5, z, Math.round(10 + size * 10), size);
    },
    debris(x, y, z, n, size = 1) {
      for (let i = 0; i < n; i++) {
        if (dl.length >= DMAX) dl.shift();
        const a = R() * Math.PI * 2, sp = 1 + R() * 2.4;
        dl.push({
          x: x + sr(size * 0.6), y: y + R() * 0.5, z: z + sr(size * 0.6),
          vx: Math.cos(a) * sp, vy: 1.5 + R() * 3, vz: Math.sin(a) * sp,
          rx: R() * 6, ry: R() * 6, w: sr(14), s: 0.6 + R() * 1.4, age: 0, life: 2.2 + R()
        });
      }
    },
    update(dt, uScale, heightAt) {
      glow.mat.uniforms.uScale.value = uScale;
      soft.mat.uniforms.uScale.value = uScale;
      glow.update(dt);
      soft.update(dt);
      let j = 0;
      for (let i = 0; i < dl.length; i++) {
        const d = dl[i];
        d.age += dt;
        if (d.age > d.life) continue;
        d.vy -= 9.8 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const gy = heightAt(d.x, d.z) + 0.04;
        if (d.y < gy) { d.y = gy; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.w *= 0.6; }
        d.rx += d.w * dt; d.ry += d.w * 0.7 * dt;
        const k = d.age > d.life - 0.4 ? (d.life - d.age) / 0.4 : 1;
        q.setFromEuler(e.set(d.rx, d.ry, 0));
        m4.compose(pv.set(d.x, d.y, d.z), q, sv.set(d.s * k, d.s * k, d.s * k));
        debris.setMatrixAt(j, m4);
        dl[j++] = d;
      }
      dl.length = j;
      debris.count = j;
      debris.visible = j > 0;
      if (j) debris.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      glow.dispose();
      soft.dispose();
      debris.removeFromParent();
      debris.dispose();
      dGeo.dispose();
    }
  };
  return fx;
}
