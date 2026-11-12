/**
 * GeometryKit.ts
 *
 * Small procedural geometry helpers shared by the map, truck and tools:
 *  - roundedBox / lathe profiles / corrugated panel extrusion
 *  - mergeParts(): bake many small parts into one geometry per material (draw-call saver)
 *  - applyWorldUVs(): re-tile Box/Plane UVs in metres so shared PBR textures do not stretch
 *  - contact-shadow blobs (cheap fake ambient occlusion), merged into one mesh
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getBlobShadowTexture } from './ProceduralTextures.ts';

export type Vec3Tuple = readonly [number, number, number];

/** One part for `mergeParts`: a geometry placed by position / Euler rotation / scale. */
export interface MergePart {
  geometry: THREE.BufferGeometry;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
}

export interface MergeOptions {
  /** When set, replace UVs by a box projection with this tile size (metres per repeat). */
  tile?: number;
}

/** A ground blob for `createContactShadows`. */
export interface ContactShadowItem {
  x: number;
  z: number;
  w: number;
  d: number;
  rot?: number;
  y?: number;
  strength?: number;
}

export function roundedBox(w: number, h: number, d: number, r = 0.02, segments = 2): RoundedBoxGeometry {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
}

/** Lathe from [radius, y] pairs (bottom to top). */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, segments = 16): THREE.LatheGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, segments);
}

/**
 * Corrugated sheet: a displaced plane (width along X, height along Y, ridges as +/- Z relief).
 * Render with side: DoubleSide or use as a wall face. Cheap (no earcut), real silhouette ridges.
 */
export function corrugatedPanel(width: number, height: number, ridgeW = 0.2, depth = 0.035): THREE.PlaneGeometry {
  const n = Math.max(2, Math.round(width / ridgeW));
  const geo = new THREE.PlaneGeometry(width, height, n * 6, 1);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, Math.sin((pos.getX(i) / width + 0.5) * n * Math.PI * 2) * depth);
  }
  geo.translate(0, height / 2, 0); // base at y = 0
  geo.computeVertexNormals();
  return geo;
}

/**
 * Merge a list of { geometry, matrix? / position, rotation, scale } into one geometry.
 * `parts` geometries are consumed (transformed in place on a clone) and NOT disposed here.
 */
export function mergeParts(parts: readonly MergePart[], opts: MergeOptions = {}): THREE.BufferGeometry {
  const geos = parts.map((p): THREE.BufferGeometry => {
    const g = p.geometry.clone();
    const m = new THREE.Matrix4();
    const pos = p.position || [0, 0, 0];
    const rot = p.rotation || [0, 0, 0];
    const scl = p.scale || [1, 1, 1];
    m.compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scl[0], scl[1], scl[2])
    );
    g.applyMatrix4(m);
    // Merge requires identical attribute sets
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    return g.index ? g.toNonIndexed() : g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (opts.tile) boxProjectUVs(merged, opts.tile);
  return merged;
}

/**
 * Replace UVs by a box projection in the geometry's own space (metres / tile). Each vertex projects along
 * its dominant normal axis, so merged props keep a constant texel density on every face.
 */
export function boxProjectUVs(geo: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  let uv = geo.getAttribute('uv');
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
    geo.setAttribute('uv', uv);
  }
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const x = pos.getX(i) / tile;
    const y = pos.getY(i) / tile;
    const z = pos.getZ(i) / tile;
    if (ax >= ay && ax >= az) uv.setXY(i, z, y);
    else if (ay >= az) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Scale UVs of BoxGeometry / PlaneGeometry meshes by their metric size so that a texture with
 * userData.worldUV = N (metres per repeat) tiles at a constant density.
 * Only meshes whose material is tagged (shared PBR materials) are touched. Idempotent per geometry.
 */
export function applyWorldUVs(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo: unknown = o.geometry;
    if (!(geo instanceof THREE.BufferGeometry) || geo.userData.worldUVDone) return;
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    const tile: unknown = mats[0]?.userData?.worldUV;
    if (typeof tile !== 'number' || !tile) return;
    const uv = geo.getAttribute('uv');
    if (!uv) return;
    const s = o.scale;
    if (geo instanceof THREE.BoxGeometry) {
      const p = geo.parameters;
      const w = p.width * s.x / tile;
      const h = p.height * s.y / tile;
      const d = p.depth * s.z / tile;
      // face order: +x, -x, +y, -y, +z, -z (4 verts each)
      const dims: ReadonlyArray<readonly [number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) {
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          const [du, dv] = dims[f] ?? [1, 1];
          uv.setXY(i, uv.getX(i) * du, uv.getY(i) * dv);
        }
      }
    } else if (geo instanceof THREE.PlaneGeometry) {
      const p = geo.parameters;
      const w = p.width * s.x / tile;
      const h = p.height * s.y / tile;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
    } else {
      return;
    }
    uv.needsUpdate = true;
    geo.userData.worldUVDone = true;
  });
}

/**
 * One merged mesh of soft dark blobs lying on the ground (fake ambient occlusion).
 * items: [{ x, z, w, d, rot?, y?, strength? }]. Uses multiply blending; no depth writes.
 */
export function createContactShadows(items: readonly ContactShadowItem[]): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null {
  const geos: THREE.PlaneGeometry[] = [];
  for (const it of items) {
    const g = new THREE.PlaneGeometry(it.w, it.d);
    g.rotateX(-Math.PI / 2);
    if (it.rot) g.rotateY(it.rot);
    g.translate(it.x, (it.y ?? 0) + 0.035, it.z);
    geos.push(g);
  }
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  const mat = new THREE.MeshBasicMaterial({
    map: getBlobShadowTexture(),
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    transparent: true,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'ContactShadows';
  mesh.frustumCulled = false;
  return mesh;
}

/** Dispose geometries and (non-shared) materials below root. Shared library materials are left to the library. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const { geometry, material } = o as { geometry?: unknown; material?: unknown };
    if (geometry instanceof THREE.BufferGeometry) geometry.dispose();
    const mats: unknown[] = Array.isArray(material) ? material : material ? [material] : [];
    mats.forEach((m) => {
      if (!(m instanceof THREE.Material)) return;
      if (!m.userData?.shared) m.dispose();
    });
  });
}
