import * as THREE from 'three';

// Eredeti, kódból épített karaktermodellek: külső modellfájl vagy licenc nem kell hozzájuk.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
};

const sphere = (r, d = 14) => new THREE.SphereGeometry(r, d, Math.round(d * 0.7));
const keep = (material) => {
  material.userData.keepColor = true;
  return material;
};
const white = () => keep(mat('#ffffff', { roughness: 0.2 }));
const dark = () => keep(mat('#111111', { roughness: 0.2 }));

function addEyes(group, y, z, spread, size) {
  for (const side of [-1, 1]) {
    add(group, sphere(size, 10), white(), side * spread, y, z);
    add(group, sphere(size * 0.5, 8), dark(), side * spread, y, z - size * 0.75);
  }
}

function addLegs(group, material, spread, length) {
  return [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * spread, length, 0);
    add(pivot, new THREE.CapsuleGeometry(0.11, length - 0.2, 4, 8), material, 0, -length / 2, 0);
    group.add(pivot);
    return pivot;
  });
}

const addGun = (group, color, x, y, z) => {
  const gun = add(group, new THREE.CylinderGeometry(0.09, 0.13, 0.7, 10), mat(color, { metalness: 0.5 }), x, y, z);
  gun.rotation.x = Math.PI / 2;
};

const BUILDERS = {
  bar_trooper(g) {
    const soap = mat('#8fdcff', { roughness: 0.25 });
    add(g, new THREE.BoxGeometry(1, 0.95, 0.55), soap, 0, 1.15, 0);
    add(g, new THREE.BoxGeometry(0.72, 0.1, 0.5), mat('#c9f0ff', { roughness: 0.25 }), 0, 1.66, 0);
    addEyes(g, 1.3, -0.3, 0.22, 0.13);
    addGun(g, '#e8f7ff', 0.6, 1.05, -0.35);
    return addLegs(g, mat('#3b8fc0'), 0.26, 0.68);
  },
  loofah_bruiser(g) {
    const fibre = mat('#e8c98a', { roughness: 0.95 });
    for (const [x, y, z, r] of [[0, 1.15, 0, 0.72], [0.5, 1.5, 0.1, 0.38], [-0.5, 1.5, 0.1, 0.38], [0.45, 0.8, -0.1, 0.36], [-0.45, 0.8, -0.1, 0.36], [0, 1.68, -0.1, 0.32]]) {
      add(g, sphere(r), fibre, x, y, z);
    }
    addEyes(g, 1.4, -0.62, 0.24, 0.13);
    addGun(g, '#7d5a2c', 0.82, 1.05, -0.4);
    return addLegs(g, mat('#b1925a'), 0.34, 0.62);
  },
  rinse_runner(g) {
    add(g, new THREE.CylinderGeometry(0.33, 0.4, 1.05, 16), mat('#54e0c4', { roughness: 0.3 }), 0, 1.15, 0);
    add(g, new THREE.CylinderGeometry(0.15, 0.3, 0.2, 14), mat('#54e0c4', { roughness: 0.3 }), 0, 1.76, 0);
    add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.14, 14), mat('#ffffff'), 0, 1.92, 0);
    addEyes(g, 1.34, -0.31, 0.15, 0.11);
    addGun(g, '#ffffff', 0.46, 1.1, -0.3);
    return addLegs(g, mat('#229a84'), 0.18, 0.66);
  },
  mold_creeper(g) {
    const mold = mat('#7fb13c', { roughness: 0.9 });
    add(g, sphere(0.68), mold, 0, 1.15, 0);
    for (const [x, y, z, r] of [[0.42, 1.55, -0.3, 0.18], [-0.5, 1.2, -0.42, 0.14], [0.1, 0.72, -0.56, 0.16], [-0.25, 1.68, -0.1, 0.2]]) {
      add(g, sphere(r, 10), mat('#3d5a1b', { roughness: 1 }), x, y, z);
    }
    addEyes(g, 1.3, -0.56, 0.24, 0.14);
    addGun(g, '#c9e265', 0.72, 1.05, -0.4);
    return addLegs(g, mat('#54762a'), 0.3, 0.62);
  },
  hairball_brute(g) {
    const hair = mat('#3a2a22', { roughness: 1 });
    add(g, sphere(0.88), hair, 0, 1.2, 0);
    const strand = new THREE.ConeGeometry(0.07, 0.55, 5);
    for (let i = 0; i < 44; i += 1) {
      const a = i * 2.399;
      const y = 1 - (2 * i + 1) / 44;
      const r = Math.sqrt(1 - y * y);
      const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const s = add(g, strand, hair, dir.x * 0.9, 1.2 + dir.y * 0.9, dir.z * 0.9);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
    addEyes(g, 1.42, -0.8, 0.26, 0.15);
    addGun(g, '#8c6a4a', 0.98, 1.05, -0.4);
    return addLegs(g, mat('#2a1d17'), 0.38, 0.5);
  },
  drain_skitter(g) {
    const metal = mat('#9aa3ad', { metalness: 0.75, roughness: 0.3 });
    const ring = add(g, new THREE.TorusGeometry(0.46, 0.15, 10, 22), metal, 0, 1.15, 0);
    ring.rotation.x = Math.PI / 2;
    add(g, sphere(0.36), mat('#4e5a2a', { roughness: 0.9 }), 0, 1.3, 0);
    for (let i = 0; i < 4; i += 1) {
      const bar = add(g, new THREE.BoxGeometry(0.86, 0.05, 0.06), metal, 0, 1.16, 0);
      bar.rotation.y = (i * Math.PI) / 4;
    }
    addEyes(g, 1.45, -0.3, 0.16, 0.12);
    addGun(g, '#cfd6dd', 0.62, 1.15, -0.35);
    return addLegs(g, metal, 0.32, 0.72);
  }
};

const HATS = {
  cap: (g, color, top) => {
    add(g, new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color), 0, top - 0.05, 0);
  },
  cone: (g, color, top) => {
    add(g, new THREE.ConeGeometry(0.34, 0.75, 14), mat(color), 0, top + 0.32, 0);
  },
  crown: (g, color, top) => {
    add(g, new THREE.CylinderGeometry(0.34, 0.3, 0.26, 8, 1, true), mat(color, { metalness: 0.8, side: THREE.DoubleSide }), 0, top + 0.1, 0);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      add(g, new THREE.ConeGeometry(0.07, 0.2, 5), mat(color, { metalness: 0.8 }), Math.cos(a) * 0.32, top + 0.32, Math.sin(a) * 0.32);
    }
  },
  halo: (g, color, top) => {
    const halo = add(g, new THREE.TorusGeometry(0.34, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color }), 0, top + 0.42, 0);
    halo.rotation.x = Math.PI / 2;
    halo.castShadow = false;
  }
};

function applyCosmetics(body, cosmetics = {}) {
  if (cosmetics.tint) {
    const tint = new THREE.Color(cosmetics.tint);
    body.traverse((o) => {
      if (o.isMesh && !o.material.userData.keepColor) o.material.color.lerp(tint, 0.65);
    });
  }
  if (cosmetics.hat && HATS[cosmetics.hat]) {
    const top = new THREE.Box3().setFromObject(body).max.y;
    HATS[cosmetics.hat](body, cosmetics.color || '#ffffff', top);
  }
}

export function buildCharacter(characterId, cosmetics) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const legs = (BUILDERS[characterId] || BUILDERS.bar_trooper)(body);
  applyCosmetics(body, cosmetics);

  return {
    group,
    animate(time, moving, sprinting, onGround) {
      const stride = moving ? Math.sin(time * (sprinting ? 16 : 11)) * 0.75 : 0;
      legs[0].rotation.x = onGround ? stride : -0.5;
      legs[1].rotation.x = onGround ? -stride : 0.5;
      body.position.y = moving ? Math.abs(Math.sin(time * 11)) * 0.06 : Math.sin(time * 2.2) * 0.02;
      body.rotation.z = moving ? Math.sin(time * 11) * 0.05 : 0;
    }
  };
}

// Versenyjármű: kerekes fürdőkád, benne a játékos karakterével
export function buildVehicle(characterId, cosmetics = {}) {
  const group = new THREE.Group();
  const tub = new THREE.Group();
  group.add(tub);
  const shell = mat(cosmetics.car || '#e6edf5', { roughness: 0.25, metalness: 0.2 });
  add(tub, new THREE.BoxGeometry(1.7, 0.7, 3), shell, 0, 0.75, 0);
  add(tub, new THREE.BoxGeometry(1.25, 0.2, 2.4), mat('#2563eb', { roughness: 0.1 }), 0, 1.06, 0);
  add(tub, new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), mat('#94a3b8', { metalness: 0.8 }), 0, 1.3, 1.2);
  const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14);
  const wheels = [[-0.95, -1.05], [0.95, -1.05], [-0.95, 1.05], [0.95, 1.05]].map(([x, z]) => {
    const wheel = add(tub, wheelGeometry, keep(mat('#111827')), x, 0.36, z);
    wheel.rotation.z = Math.PI / 2;
    return wheel;
  });
  const rider = buildCharacter(characterId, cosmetics);
  rider.group.scale.setScalar(0.55);
  rider.group.position.y = 0.7;
  tub.add(rider.group);

  return {
    group,
    animate(time, moving, sprinting) {
      if (moving) wheels.forEach((w) => { w.rotation.x -= 0.5; });
      tub.position.y = sprinting ? Math.sin(time * 40) * 0.03 : 0;
    }
  };
}

const NPC_COLORS = { slime: '#65a30d', spitter: '#a3e635', brute: '#57534e', clog_giant: '#44403c', mold_queen: '#4d7c0f', hair_titan: '#292524', void_plunger: '#581c87' };

export function buildNpc(type, size) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const material = mat(NPC_COLORS[type] || '#65a30d', { roughness: 0.85 });
  add(body, sphere(0.78, 12), material, 0, 0.78, 0);
  if (size > 1.5) {
    const spike = new THREE.ConeGeometry(0.1, 0.55, 5);
    for (let i = 0; i < 12; i += 1) {
      const a = i * 2.399;
      const y = 1 - (2 * i + 1) / 12;
      const r = Math.sqrt(1 - y * y);
      const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const s = add(body, spike, material, dir.x * 0.75, 0.78 + dir.y * 0.75, dir.z * 0.75);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
  }
  addEyes(body, 1, -0.66, 0.24, 0.14);
  group.scale.setScalar(size);
  return {
    group,
    animate(time) {
      body.scale.set(1 + Math.sin(time * 6) * 0.05, 1 - Math.sin(time * 6) * 0.05, 1 + Math.sin(time * 6) * 0.05);
    }
  };
}
