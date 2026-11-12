import * as THREE from 'three';
import type { SocketLike } from '../../../../shared/services/socket/SocketLike';
import { buildCharacter, buildNpc, buildVehicle, type CharacterModel } from './characterModels';
import { stepMovement, stepVehicle, type MovementInput, type VehicleBody } from './movement';
import type {
  ArenaCollider, ArenaTrack, ArenaWorld, CharacterStats, GameEvent, HudState, KillFeedEntry, MatchInfo,
  MatchPlayer, Pickup, PlayerState, Snapshot, Vec3
} from '../types';

export type KeyBindings = typeof DEFAULT_BINDINGS;
export type QualityId = keyof typeof QUALITY_PRESETS;
type SoundKind = 'shot' | 'hit' | 'boom' | 'pick';
type Point3 = { x: number; y: number; z: number };

/** On-screen touch controls, written by GameView. */
export interface TouchInput {
  mx: number;
  mz: number;
  fire: boolean;
  jump: boolean;
  sprint: boolean;
  interact: boolean;
}

/** One sampled input tick, sent as `game:input` and replayed for prediction. */
interface ClientInput extends MovementInput {
  pitch: number;
  fire: boolean;
  interact: boolean;
  ability: boolean;
}

interface PlayerAvatar extends CharacterModel {
  shield: THREE.Mesh;
  tag: THREE.Sprite | null;
  aura: THREE.Mesh;
  trail: string | null;
  emote?: THREE.Sprite | null;
  emoteUntil?: number;
}

interface NpcAvatar extends CharacterModel {
  target: { x: number; y: number; z: number; yaw: number };
}

interface Particle {
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Interpolation {
  a: PlayerState;
  b: PlayerState;
  t: number;
}

type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
type StandardMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

interface DomHandlers {
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  blur: () => void;
  mousemove: (e: MouseEvent) => void;
  mousedown: (e: MouseEvent) => void;
  mouseup: (e: MouseEvent) => void;
  wheel: (e: WheelEvent) => void;
  pointerlock: () => void;
  contextmenu: (e: Event) => void;
}

/** Disposes the geometry and materials (and their textures) of an object tree. */
function disposeTree(object: THREE.Object3D): void {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite || o instanceof THREE.Points)) return;
    o.geometry?.dispose();
    const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    }
  });
}

// Snapshot mezők sorrendje (lásd szerver simulation.js)
const X = 0;
const Y = 1;
const Z = 2;
const YAW = 3;
const PITCH = 4;
const HP = 5;
const FLAGS = 6;
const SEQ = 7;
const VY = 8;
const KX = 9;
const KZ = 10;
const DASH_T = 11;
const DASH_X = 12;
const DASH_Z = 13;
const COOLDOWN = 14;
const KILLS = 15;
const DEATHS = 16;
const RESPAWN = 17;
const SIDE = 18;
const SPEED = 19;
const HEADING = 20;
const LAP = 21;
const CHECKPOINT = 22;
const NITRO = 23;
const BOOST = 24;
const STUN = 25;
const ITEM = 26;
const ARMOR = 27;
const PLACE = 28;
const REVIVE = 29;
const F_ALIVE = 1;
const F_SHIELD = 2;
const F_GROUND = 4;
const F_MOVING = 8;
const F_CONNECTED = 16;
const F_DOWNED = 64;
const F_ELIMINATED = 128;

const AIM_HEIGHT = 1.9;
const INTERP_DELAY_MS = 130;
const MAX_PARTICLES = 400;
const MAX_TRACERS = 48;
const MAX_FEED = 5;
const MAX_HAZARDS = 24;
const KILL_VERBS = ['elmosta', 'lesúrolta', 'kiöblítette', 'lehúzta', 'kifertőtlenítette', 'beszappanozta'];
const PICKUP_COLORS: Readonly<Record<string, string>> = { medkit: '#34d399', armor: '#60a5fa', pistol: '#e5e7eb', smg: '#a78bfa', shotgun: '#fb923c', rifle: '#22d3ee', sniper: '#f472b6' };

export const DEFAULT_BINDINGS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft', ability: 'KeyQ', interact: 'KeyE', emote: 'KeyT' };
export const BINDINGS_KEY = 'sudswar_keys';
export const SOUND_KEY = 'sudswar_sound';

function loadBindings(): KeyBindings {
  try {
    return { ...DEFAULT_BINDINGS, ...JSON.parse(localStorage.getItem(BINDINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_BINDINGS;
  }
}

function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas nem érhető el');
  return ctx;
}

// Halk, térbeli szintetizált hangok: külső hangfájl nélkül, a hangcsevegést nem nyomják el
const SOUNDS: Record<SoundKind, [freq: number, end: number, length: number, type: OscillatorType, level: number]> = {
  shot: [620, 160, 0.09, 'square', 0.035],
  hit: [900, 300, 0.07, 'triangle', 0.05],
  boom: [120, 30, 0.45, 'sawtooth', 0.09],
  pick: [500, 1100, 0.14, 'sine', 0.06]
};

class Sfx {
  readonly #enabled = soundEnabled();
  #ctx: AudioContext | null = null;
  #lastAt = 0;

  ensure(): void {
    if (!this.#enabled || this.#ctx) return;
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) this.#ctx = new Ctx();
  }

  listener(camera: THREE.Camera): void {
    const ctx = this.#ctx;
    const l = ctx?.listener;
    if (!ctx || !l?.positionX) return;
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    const t = ctx.currentTime;
    l.positionX.setValueAtTime(camera.position.x, t);
    l.positionY.setValueAtTime(camera.position.y, t);
    l.positionZ.setValueAtTime(camera.position.z, t);
    l.forwardX.setValueAtTime(f.x, t);
    l.forwardY.setValueAtTime(f.y, t);
    l.forwardZ.setValueAtTime(f.z, t);
  }

  play(kind: SoundKind, pos: Point3): void {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.#lastAt < 0.02) return;
    this.#lastAt = now;
    const [freq, end, length, type, level] = SOUNDS[kind];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.refDistance = 6;
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(end, now + length);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(gain).connect(panner).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + length);
  }

  dispose(): void {
    this.#ctx?.close().catch(() => {});
  }
}

export interface QualityPreset {
  label: string;
  pixelRatio: number;
  shadow: number;
  bubbles: number;
}

export const QUALITY_PRESETS = {
  low: { label: 'Alacsony', pixelRatio: 0.75, shadow: 0, bubbles: 0 },
  medium: { label: 'Közepes', pixelRatio: 1, shadow: 1024, bubbles: 40 },
  high: { label: 'Magas', pixelRatio: 1.5, shadow: 2048, bubbles: 90 },
  ultra: { label: 'Ultra', pixelRatio: 2, shadow: 4096, bubbles: 160 }
} satisfies Record<string, QualityPreset>;

const PRESET_BY_ID: ReadonlyMap<string, QualityPreset> = new Map(Object.entries(QUALITY_PRESETS));

const COLLIDER_COLORS: Readonly<Record<string, string>> = { tub: '#e6edf5', crate: '#6d7fa8', wall: '#46557c', step: '#9bb0cf' };

function tileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = context2d(canvas);
  ctx.fillStyle = '#2d3a5c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#34446d';
  ctx.fillRect(4, 4, 56, 56);
  ctx.fillRect(68, 68, 56, 56);
  ctx.fillStyle = '#293552';
  ctx.fillRect(68, 4, 56, 56);
  ctx.fillRect(4, 68, 56, 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function nameSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = context2d(canvas);
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text.slice(0, 16), 128, 36);
  ctx.fillStyle = color;
  ctx.fillText(text.slice(0, 16), 128, 36);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.set(2.6, 0.49, 1);
  return sprite;
}

const AXES = [0, 1, 2] as const;

function raySlab(o: Vec3, d: Vec3, c: ArenaCollider, maxT: number): number | null {
  let tMin = 0;
  let tMax = maxT;
  for (const i of AXES) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < c.min[i] || o[i] > c.max[i]) return null;
    } else {
      let a = (c.min[i] - o[i]) / d[i];
      let b = (c.max[i] - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      tMin = Math.max(tMin, a);
      tMax = Math.min(tMax, b);
      if (tMin > tMax) return null;
    }
  }
  return tMin;
}

const lerpAngle = (a: number, b: number, t: number): number => {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
};

export default class GameClient {
  /** On-screen touch controls; GameView writes them directly. */
  readonly touch: TouchInput = { mx: 0, mz: 0, fire: false, jump: false, sprint: false, interact: false };

  readonly #container: HTMLElement;
  readonly #socket: SocketLike;
  readonly #info: MatchInfo;
  readonly #onHud: (hud: HudState) => void;
  readonly #preset: QualityPreset;
  readonly #me: MatchPlayer;
  readonly #stats: CharacterStats;
  readonly #step: number;
  readonly #keys = new Set<string>();
  readonly #bindings: KeyBindings;
  readonly #isVehicle: boolean;
  readonly #sfx = new Sfx();
  readonly #pickupMeshes = new Map<string, BasicMesh>();
  readonly #npcAvatars = new Map<string, NpcAvatar>();
  readonly #mineMeshes = new Map<string, BasicMesh>();
  readonly #visualOffset = new THREE.Vector3();
  #spectate = -1;
  #announcement: { text: string; until: number } | null = null;
  #finished = false;
  #yaw: number;
  #pitch = -0.08;
  #mouseDown = false;
  #abilityQueued = false;
  #locked = false;
  #wasLocked = false;
  #paused = false;
  #seq = 0;
  #accumulator = 0;
  #pending: Array<{ seq: number; input: ClientInput }> = [];
  #body: VehicleBody | null = null;
  #prev: Point3 | null = null;
  #snapshots: Array<{ at: number; data: Snapshot }> = [];
  #latest: Snapshot | null = null;
  #feed: KillFeedEntry[] = [];
  #lastHudAt = 0;
  #showScoreboard = false;
  #cameraDistance = 6;
  #currentDistance = 6;
  #lastFrame = performance.now();
  #disposed = false;
  #hitMarkerUntil = 0;
  #damageFlashUntil = 0;
  #raf = 0;

  // Az alábbiakat a konstruktorból hívott #init* metódusok hozzák létre (definite assignment).
  #renderer!: THREE.WebGLRenderer;
  #scene!: THREE.Scene;
  #camera!: THREE.PerspectiveCamera;
  #resizeObserver!: ResizeObserver;
  #handlers!: DomHandlers;
  #avatars!: PlayerAvatar[];
  #structureMeshes!: StandardMesh[];
  #nodeMeshes!: Map<string, BasicMesh>;
  #hazardMeshes!: BasicMesh[];
  #pickupGeometry!: THREE.BoxGeometry;
  #particles!: THREE.InstancedMesh;
  #particleState!: Particle[];
  #particleCursor = 0;
  #scratch!: THREE.Object3D;
  #tracers!: Array<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  #tracerCursor = 0;
  #color!: THREE.Color;
  #bubbles: THREE.InstancedMesh | null = null;
  #bubbleSeeds: Array<[x: number, y: number, z: number, speed: number, size: number]> = [];
  #gate: BasicMesh | null = null;
  #zone: BasicMesh | null = null;
  constructor(container: HTMLElement, socket: SocketLike, info: MatchInfo, onHud: (hud: HudState) => void, quality: string = 'medium') {
    this.#container = container;
    this.#socket = socket;
    this.#info = info;
    this.#onHud = onHud;
    this.#preset = PRESET_BY_ID.get(quality) ?? QUALITY_PRESETS.medium;
    const me = info.players[info.you];
    const stats = me ? info.characters[me.characterId] : undefined;
    if (!me || !stats) throw new Error('Hiányos meccsadat: a saját játékos vagy karaktere nem található');
    this.#me = me;
    this.#stats = stats;
    this.#step = 1 / info.tickRate;
    this.#bindings = loadBindings();
    this.#isVehicle = info.flags.vehicle;
    this.#yaw = info.world.heading ?? (me.team === Object.keys(info.world.spawns)[0] ? -Math.PI / 2 : Math.PI / 2);

    this.#initRenderer();
    this.#initWorld();
    this.#initPlayers();
    this.#initEffects();
    this.#bind();
    this.#raf = requestAnimationFrame(this.#frame);
  }

  #initRenderer(): void {
    const preset = this.#preset;
    this.#renderer = new THREE.WebGLRenderer({ antialias: preset.pixelRatio >= 1 });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    this.#renderer.shadowMap.enabled = preset.shadow > 0;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#container.appendChild(this.#renderer.domElement);
    this.#renderer.domElement.style.display = 'block';

    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color('#141a33');
    this.#scene.fog = new THREE.Fog('#141a33', 45, 110);
    this.#camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(this.#container);
    this.#resize();
  }

  #resize(): void {
    const { clientWidth: w, clientHeight: h } = this.#container;
    if (!w || !h) return;
    this.#renderer.setSize(w, h);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
  }

  #initWorld(): void {
    const { world } = this.#info;
    const { bounds } = world;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;

    this.#scene.add(new THREE.HemisphereLight('#d6e4ff', '#4a4468', 2.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(18, 34, 14);
    if (this.#preset.shadow) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.#preset.shadow, this.#preset.shadow);
      Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 32, bottom: -32, near: 1, far: 90 });
      sun.shadow.bias = -0.0006;
    }
    this.#scene.add(sun);

    const tiles = tileTexture();
    tiles.repeat.set(width / 4, depth / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.35, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.#scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: '#39486f', roughness: 0.6 });
    const h = bounds.height;
    const walls: Array<[x: number, z: number, sx: number, sz: number]> = [[0, bounds.minZ - 0.5, width + 2, 1], [0, bounds.maxZ + 0.5, width + 2, 1], [bounds.minX - 0.5, 0, 1, depth], [bounds.maxX + 0.5, 0, 1, depth]];
    for (const [x, z, sx, sz] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), wallMat);
      wall.position.set(x, h / 2, z);
      wall.receiveShadow = true;
      this.#scene.add(wall);
    }

    this.#buildColliders(world);
    if (world.track) this.#buildTrack(world.track);
    this.#buildStructures();
    this.#buildZone();

    // Lebegő buborékok: egy példányosított háló, a beállítástól függő mennyiségben
    const count = this.#preset.bubbles;
    if (count) {
      this.#bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.45, roughness: 0.1 }), count);
      this.#bubbleSeeds = Array.from({ length: count }, () => [bounds.minX + Math.random() * width, Math.random() * h, bounds.minZ + Math.random() * depth, 0.4 + Math.random() * 0.8, 0.5 + Math.random()]);
      this.#bubbles.frustumCulled = false;
      this.#scene.add(this.#bubbles);
    }
  }

  // Pályaelemek fajtánként egyetlen példányosított hálóban: a nagy térképen is kevés rajzolási hívás
  #buildColliders(world: ArenaWorld): void {
    const structureSet = new Set((this.#info.structures || []).map((s) => `${s.min}:${s.max}`));
    const groups = new Map<string, ArenaCollider[]>();
    for (const c of world.colliders) {
      if (structureSet.has(`${c.min}:${c.max}`)) continue;
      const group = groups.get(c.kind) ?? [];
      group.push(c);
      groups.set(c.kind, group);
    }
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const dummy = new THREE.Object3D();
    for (const [kind, list] of groups) {
      const mesh = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: COLLIDER_COLORS[kind] || '#6d7fa8', roughness: kind === 'tub' ? 0.2 : 0.7 }), list.length);
      list.forEach((c, i) => {
        dummy.position.set((c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2);
        dummy.scale.set(c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#scene.add(mesh);
    }
  }

  #buildTrack(track: ArenaTrack): void {
    const dummy = new THREE.Object3D();
    for (const route of track.routes) {
      const segments = route.open ? route.points.length - 1 : route.points.length;
      const color = route.shortcut ? '#4b5563' : '#334155';
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), material, segments);
      const joints = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 20), material, route.points.length);
      route.points.forEach(([x, z], i) => {
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(x, 0.02, z);
        dummy.scale.set(route.width, 1, route.width);
        dummy.updateMatrix();
        joints.setMatrixAt(i, dummy.matrix);
        if (i >= segments) return;
        const next = route.points[(i + 1) % route.points.length];
        if (!next) return;
        const [nx, nz] = next;
        dummy.position.set((x + nx) / 2, 0.02, (z + nz) / 2);
        dummy.rotation.y = Math.atan2(nx - x, nz - z);
        dummy.scale.set(route.width, 1, Math.hypot(nx - x, nz - z));
        dummy.updateMatrix();
        strips.setMatrixAt(i, dummy.matrix);
      });
      strips.receiveShadow = true;
      joints.receiveShadow = true;
      this.#scene.add(strips, joints);
    }
    const place = (points: Array<[number, number]>, geometry: THREE.BufferGeometry, color: string, y: number) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color }), points.length);
      points.forEach(([x, z], i) => {
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(x, y, z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      this.#scene.add(mesh);
    };
    place(track.boostPads, new THREE.CylinderGeometry(6, 6, 0.04, 20), '#22d3ee', 0.05);
    place(track.itemBoxes, new THREE.BoxGeometry(1.5, 1.5, 1.5), '#facc15', 1.1);
    this.#gate = new THREE.Mesh(new THREE.TorusGeometry(track.checkpointRadius * 0.7, 0.4, 8, 32), new THREE.MeshBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.75 }));
    this.#scene.add(this.#gate);
  }

  #buildStructures(): void {
    this.#structureMeshes = (this.#info.structures || []).map((s) => {
      const size = [s.max[0] - s.min[0], s.max[1] - s.min[1], s.max[2] - s.min[2]];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color: s.side === 'a' ? '#5ec8ff' : '#9bd14b', roughness: 0.4 }));
      mesh.position.set((s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2);
      mesh.castShadow = true;
      mesh.userData = { maxHp: s.hp, height: size[1], baseY: s.min[1] };
      this.#scene.add(mesh);
      return mesh;
    });
    this.#nodeMeshes = new Map((this.#info.world.nodes || []).map((n) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.05, 28), new THREE.MeshBasicMaterial({ color: '#9ca3af', transparent: true, opacity: 0.5 }));
      ring.position.set(n.x, 0.05, n.z);
      this.#scene.add(ring);
      return [n.id, ring];
    }));
    this.#hazardMeshes = Array.from({ length: MAX_HAZARDS }, () => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.06, 28), new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.45 }));
      mesh.visible = false;
      this.#scene.add(mesh);
      return mesh;
    });
    this.#pickupGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    this.#info.pickups.forEach((p) => this.#addPickup(p));
  }

  #buildZone(): void {
    if (this.#info.mode !== 'royale') return;
    this.#zone = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 64, 1, true), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    this.#zone.position.y = 30;
    this.#scene.add(this.#zone);
  }

  #addPickup(p: Pickup): void {
    const mesh = new THREE.Mesh(this.#pickupGeometry, new THREE.MeshBasicMaterial({ color: PICKUP_COLORS[p.type] || '#ffffff' }));
    mesh.position.set(p.x, 0.9, p.z);
    this.#scene.add(mesh);
    this.#pickupMeshes.set(p.id, mesh);
  }

  #removeMesh(map: Map<string, BasicMesh>, id: string): void {
    const mesh = map.get(id);
    if (!mesh) return;
    this.#scene.remove(mesh);
    mesh.material.dispose();
    map.delete(id);
  }

  #syncMines(list: Array<[string, number, number]>): void {
    const ids = new Set(list.map(([id]) => id));
    for (const id of [...this.#mineMeshes.keys()]) if (!ids.has(id)) this.#removeMesh(this.#mineMeshes, id);
    for (const [id, x, z] of list) {
      if (this.#mineMeshes.has(id)) continue;
      const mesh = new THREE.Mesh(this.#pickupGeometry, new THREE.MeshBasicMaterial({ color: '#ef4444' }));
      mesh.position.set(x, 0.5, z);
      this.#scene.add(mesh);
      this.#mineMeshes.set(id, mesh);
    }
  }

  #announce(text: string): void {
    this.#announcement = { text, until: performance.now() + 3000 };
    this.#pushHud(true);
  }

  #initPlayers(): void {
    const myTeam = this.#me.team;
    this.#avatars = this.#info.players.map((p) => {
      const model = this.#isVehicle ? buildVehicle(p.characterId, p.cosmetics) : buildCharacter(p.characterId, p.cosmetics);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 24), new THREE.MeshBasicMaterial({ color: this.#info.factions[p.team]?.color, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      model.group.add(ring);

      const shield = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 12), new THREE.MeshStandardMaterial({ color: '#9fe4ff', transparent: true, opacity: 0.3, roughness: 0.1 }));
      shield.position.y = 1;
      shield.visible = false;
      model.group.add(shield);

      let tag = null;
      if (p.i !== this.#info.you) {
        const ally = this.#info.flags.pve || (!this.#info.flags.ffa && p.side === this.#me.side && p.team === myTeam);
        tag = nameSprite(p.username, ally ? '#7dffb0' : '#ff8d8d');
        tag.position.y = 2.6;
        model.group.add(tag);
      }

      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), new THREE.MeshBasicMaterial({ color: '#84cc16', transparent: true, opacity: 0.22 }));
      aura.position.y = 1;
      aura.visible = false;
      model.group.add(aura);

      this.#scene.add(model.group);
      return { ...model, shield, tag, aura, trail: p.cosmetics?.trail || null };
    });
  }

  #initEffects(): void {
    this.#particles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_PARTICLES);
    this.#particles.frustumCulled = false;
    this.#particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#particleState = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
    this.#particleCursor = 0;
    this.#scratch = new THREE.Object3D();
    this.#scratch.scale.setScalar(0);
    this.#scratch.updateMatrix();
    for (let i = 0; i < MAX_PARTICLES; i += 1) this.#particles.setMatrixAt(i, this.#scratch.matrix);
    this.#particles.setColorAt(0, new THREE.Color('#ffffff'));
    this.#scene.add(this.#particles);

    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.#tracers = Array.from({ length: MAX_TRACERS }, () => {
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true }));
      line.visible = false;
      line.frustumCulled = false;
      line.userData.life = 0;
      this.#scene.add(line);
      return line;
    });
    this.#tracerCursor = 0;
    this.#color = new THREE.Color();
  }

  #burst(x: number, y: number, z: number, count: number, speed: number, color: THREE.ColorRepresentation): void {
    this.#color.set(color);
    for (let i = 0; i < count; i += 1) {
      const index = (this.#particleCursor += 1) % MAX_PARTICLES;
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.6);
      const particle = this.#particleState[index];
      if (particle) Object.assign(particle, { life: 0.35 + Math.random() * 0.4, x, y, z, vx: Math.cos(a) * r * v, vy: u * v + 2, vz: Math.sin(a) * r * v });
      this.#particles.setColorAt(index, this.#color);
    }
    if (this.#particles.instanceColor) this.#particles.instanceColor.needsUpdate = true;
  }

  #tracer(from: Vec3, to: Vec3, color: THREE.ColorRepresentation): void {
    const line = this.#tracers[(this.#tracerCursor += 1) % MAX_TRACERS];
    if (!line) return;
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    line.position.copy(start);
    line.lookAt(end);
    line.scale.set(1, 1, start.distanceTo(end));
    line.material.color.set(color);
    line.material.opacity = 1;
    line.userData.life = 0.09;
    line.visible = true;
  }

  #bind(): void {
    this.#handlers = {
      keydown: (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        this.#sfx.ensure();
        if (e.code === 'Tab') {
          e.preventDefault();
          this.#showScoreboard = true;
        }
        if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
        if (e.code === this.#bindings.ability && !e.repeat) this.#abilityQueued = true;
        if (e.code === this.#bindings.emote && !e.repeat) this.#socket.emit('game:emote');
        if (e.code === 'Space' && !e.repeat) this.#cycleSpectate();
        this.#keys.add(e.code);
      },
      keyup: (e) => {
        if (e.code === 'Tab') this.#showScoreboard = false;
        this.#keys.delete(e.code);
      },
      blur: () => {
        this.#keys.clear();
        this.#mouseDown = false;
        this.#showScoreboard = false;
      },
      mousemove: (e) => {
        if (!this.#locked) return;
        this.#yaw -= e.movementX * 0.0024;
        this.#pitch = Math.max(-1.35, Math.min(1.35, this.#pitch - e.movementY * 0.0024));
      },
      mousedown: (e) => {
        if (e.target !== this.#renderer.domElement) return;
        this.#sfx.ensure();
        if (this.#isSpectating()) this.#cycleSpectate();
        if (!this.#locked) {
          this.#requestLock();
          return;
        }
        if (e.button === 0) this.#mouseDown = true;
      },
      mouseup: (e) => {
        if (e.button === 0) this.#mouseDown = false;
      },
      wheel: (e) => {
        e.preventDefault();
        this.#cameraDistance = Math.max(2.5, Math.min(11, this.#cameraDistance + Math.sign(e.deltaY) * 0.6));
      },
      pointerlock: () => {
        this.#locked = document.pointerLockElement === this.#renderer.domElement;
        this.#paused = !this.#locked && this.#wasLocked === true;
        this.#wasLocked = this.#locked;
        if (this.#paused) this.#mouseDown = false;
        this.#pushHud(true);
      },
      contextmenu: (e) => e.preventDefault()
    };
    const h = this.#handlers;
    window.addEventListener('keydown', h.keydown);
    window.addEventListener('keyup', h.keyup);
    window.addEventListener('blur', h.blur);
    window.addEventListener('mouseup', h.mouseup);
    document.addEventListener('mousemove', h.mousemove);
    document.addEventListener('mousedown', h.mousedown);
    document.addEventListener('pointerlockchange', h.pointerlock);
    this.#renderer.domElement.addEventListener('wheel', h.wheel, { passive: false });
    this.#renderer.domElement.addEventListener('contextmenu', h.contextmenu);
  }

  #isSpectating(): boolean {
    const own = this.#latest?.p[this.#info.you];
    return !!own && (own[FLAGS] & F_ELIMINATED) !== 0;
  }

  #cycleSpectate(): void {
    const latest = this.#latest;
    if (!latest || !this.#isSpectating()) return;
    const alive = latest.p.map((e, i) => (e && e[FLAGS] & F_ALIVE ? i : -1)).filter((i) => i >= 0);
    if (!alive.length) return;
    this.#spectate = alive[(alive.indexOf(this.#spectate) + 1) % alive.length] ?? this.#spectate;
  }

  /** Touch-screen camera drag. */
  look(dx: number, dy: number): void {
    if (this.#isVehicle) return;
    this.#yaw -= dx * 0.005;
    this.#pitch = Math.max(-1.35, Math.min(1.35, this.#pitch - dy * 0.005));
  }

  triggerAbility(): void {
    this.#abilityQueued = true;
  }

  // Hangcsevegéshez: játékosok helyzete a saját nézőponthoz képest
  /** Players' distance from the local viewpoint, for proximity voice. */
  voiceDistances(): Array<{ sid: string | null; side: string; distance: number }> {
    const latest = this.#latest;
    const own = latest?.p[this.#info.you];
    if (!latest || !own) return [];
    return this.#info.players.map((p, i) => {
      const e = latest.p[i];
      return { sid: p.sid, side: e?.[SIDE] ?? p.side, distance: e ? Math.hypot(e[X] - own[X], e[Z] - own[Z]) : Infinity };
    });
  }

  #requestLock(): void {
    Promise.resolve(this.#renderer.domElement.requestPointerLock?.()).catch(() => {});
    this.#paused = false;
  }

  onSnapshot(snapshot: Snapshot): void {
    const now = performance.now();
    this.#snapshots.push({ at: now, data: snapshot });
    while (this.#snapshots.length > 30) this.#snapshots.shift();
    this.#latest = snapshot;

    const own = snapshot.p[this.#info.you];
    if (!own) return;
    const before = this.#body ? { x: this.#body.x, y: this.#body.y, z: this.#body.z } : null;
    this.#body = {
      x: own[X], y: own[Y], z: own[Z], vy: own[VY], kx: own[KX], kz: own[KZ],
      onGround: (own[FLAGS] & F_GROUND) !== 0, dashTime: own[DASH_T], dashX: own[DASH_X], dashZ: own[DASH_Z],
      speed: own[SPEED], heading: own[HEADING], nitro: own[NITRO], boostTime: own[BOOST], stunTime: own[STUN]
    };

    // Saját mozgás: a szerver állapotára ráfuttatjuk a még nem nyugtázott bemeneteket
    this.#pending = this.#pending.filter((p) => p.seq > own[SEQ]);
    if (own[FLAGS] & F_ALIVE) {
      for (const p of this.#pending) this.#stepBody(p.input);
    } else {
      this.#pending = [];
    }

    if (before) {
      this.#visualOffset.x += before.x - this.#body.x;
      this.#visualOffset.y += before.y - this.#body.y;
      this.#visualOffset.z += before.z - this.#body.z;
      if (this.#visualOffset.length() > 3) this.#visualOffset.set(0, 0, 0);
    }
    this.#prev = { x: this.#body.x, y: this.#body.y, z: this.#body.z };
    this.#applySnapshotVisuals(snapshot);
  }

  #stepBody(input: MovementInput): void {
    if (!this.#body) return;
    if (this.#isVehicle) stepVehicle(this.#body, input, this.#info.world, this.#step);
    else stepMovement(this.#body, input, this.#stats.speed, this.#info.world, this.#step);
  }

  #applySnapshotVisuals(snapshot: Snapshot): void {
    if (snapshot.st) {
      snapshot.st.forEach((hp, i) => {
        const mesh = this.#structureMeshes[i];
        if (!mesh) return;
        const ratio = Math.max(0.12, hp / mesh.userData.maxHp);
        mesh.scale.y = ratio;
        mesh.position.y = mesh.userData.baseY + (mesh.userData.height * ratio) / 2;
        if (hp <= 0) mesh.material.color.set('#374151');
      });
    }
    if (snapshot.m?.nodes) {
      for (const [id, owner] of snapshot.m.nodes) {
        this.#nodeMeshes.get(id)?.material.color.set(owner === 'a' ? '#5ec8ff' : owner === 'b' ? '#9bd14b' : '#9ca3af');
      }
    }
    const zoneHud = snapshot.m;
    if (this.#zone && zoneHud && zoneHud.zx !== undefined && zoneHud.zz !== undefined && zoneHud.zr !== undefined) {
      this.#zone.position.x = zoneHud.zx;
      this.#zone.position.z = zoneHud.zz;
      this.#zone.scale.set(zoneHud.zr, 1, zoneHud.zr);
    }
    this.#hazardMeshes.forEach((mesh, i) => {
      const h = snapshot.hz?.[i];
      mesh.visible = !!h;
      if (!h) return;
      mesh.position.set(h[1], 0.06, h[2]);
      mesh.scale.set(h[3], 1, h[3]);
      mesh.material.color.set(h[4] ? '#ef4444' : '#f97316');
    });
    const seen = new Set<string>();
    for (const [id, type, x, y, z, yaw] of snapshot.n || []) {
      seen.add(id);
      const avatar = this.#npcAvatars.get(id);
      if (avatar) {
        avatar.target = { x, y, z, yaw };
      } else {
        const created: NpcAvatar = { ...buildNpc(type, this.#info.npcDefs[type]?.size || 1), target: { x, y, z, yaw } };
        created.group.position.set(x, y, z);
        this.#scene.add(created.group);
        this.#npcAvatars.set(id, created);
      }
    }
    for (const [id, avatar] of this.#npcAvatars) {
      if (seen.has(id)) continue;
      this.#disposeObject(avatar.group);
      this.#scene.remove(avatar.group);
      this.#npcAvatars.delete(id);
    }
    const checkpoints = this.#info.world.track?.checkpoints;
    const own = snapshot.p[this.#info.you];
    if (this.#gate && this.#latest && checkpoints && own) {
      const checkpoint = checkpoints[own[CHECKPOINT] % checkpoints.length];
      if (checkpoint) this.#gate.position.set(checkpoint[0], 5, checkpoint[1]);
    }
  }

  #disposeObject(object: THREE.Object3D): void {
    disposeTree(object);
  }

  #showEmote(index: number, emoji: string): void {
    const avatar = this.#avatars[index];
    if (!avatar) return;
    if (avatar.emote) avatar.group.remove(avatar.emote);
    const sprite = nameSprite(emoji, '#ffffff');
    sprite.position.y = 3.2;
    avatar.group.add(sprite);
    avatar.emote = sprite;
    avatar.emoteUntil = performance.now() + 2000;
  }

  onEvents(events: GameEvent[]): void {
    for (const e of events) this.#handleEvent(e);
  }

  #handleEvent(e: GameEvent): void {
    const index = 'i' in e ? e.i : -1;
    const info = this.#info.players[index];
    const avatar = this.#avatars[index];
    const color = info ? this.#info.factions[info.team]?.color ?? '#ffffff' : '#ffffff';
    switch (e.t) {
      case 'shot': {
        if (!avatar) return;
        const p = avatar.group.position;
        this.#tracer([p.x, p.y + 1.15, p.z], e.to, color);
        this.#burst(e.to[0], e.to[1], e.to[2], e.hit >= 0 ? 8 : 3, 4, e.hit >= 0 ? '#ffffff' : color);
        this.#sfx.play('shot', p);
        return;
      }
      case 'hit':
        if (e.by === this.#info.you) {
          this.#hitMarkerUntil = performance.now() + 140;
          if (avatar) this.#sfx.play('hit', avatar.group.position);
        }
        if (e.i === this.#info.you) this.#damageFlashUntil = performance.now() + 220;
        return;
      case 'npc_hit':
        if (e.by === this.#info.you) this.#hitMarkerUntil = performance.now() + 140;
        return;
      case 'npc_kill': {
        const npc = this.#npcAvatars.get(e.id);
        if (npc) this.#burst(npc.group.position.x, npc.group.position.y + 1, npc.group.position.z, 26, 7, '#84cc16');
        return;
      }
      case 'npc_attack': {
        const npc = this.#npcAvatars.get(e.id);
        const victim = this.#avatars[e.to];
        if (npc && victim) {
          const a = npc.group.position;
          const b = victim.group.position;
          this.#tracer([a.x, a.y + 1, a.z], [b.x, b.y + 1, b.z], '#a3e635');
        }
        return;
      }
      case 'ability': {
        if (!avatar) return;
        const p = avatar.group.position;
        if (e.kind === 'blast') {
          this.#burst(p.x, p.y + 1, p.z, 90, 14, color);
          this.#sfx.play('boom', p);
        } else if (e.kind === 'dash') this.#burst(p.x, p.y + 0.5, p.z, 24, 5, color);
        else this.#burst(p.x, p.y + 1, p.z, 30, 3, '#9fe4ff');
        return;
      }
      case 'kill': {
        if (!avatar) return;
        const p = avatar.group.position;
        this.#burst(p.x, p.y + 1, p.z, 70, 9, color);
        this.#sfx.play('boom', p);
        const killer = e.by >= 0 ? this.#info.players[e.by] : null;
        const verb = KILL_VERBS[Math.floor(Math.random() * KILL_VERBS.length)];
        this.#feed = [{ id: performance.now() + Math.random(), killer: killer?.username || 'A pálya', killerTeam: killer?.team || null, victim: info?.username, victimTeam: info?.team, verb, at: performance.now() }, ...this.#feed].slice(0, MAX_FEED);
        return;
      }
      case 'pickup_add':
        this.#addPickup(e.p);
        return;
      case 'pickup_gone': {
        const mesh = this.#pickupMeshes.get(e.id);
        if (mesh) this.#sfx.play('pick', mesh.position);
        this.#removeMesh(this.#pickupMeshes, e.id);
        return;
      }
      case 'emote':
        this.#showEmote(e.i, e.e);
        return;
      case 'mine':
        this.#syncMines(e.mines);
        if (e.blast) this.#burst(e.blast[0], 1, e.blast[1], 60, 12, '#ef4444');
        return;
      case 'rocket': {
        const target = this.#avatars[e.to];
        if (!avatar || !target) return;
        const a = avatar.group.position;
        const b = target.group.position;
        this.#tracer([a.x, 1, a.z], [b.x, 1, b.z], '#f97316');
        this.#burst(b.x, 1, b.z, 40, 10, '#f97316');
        return;
      }
      case 'structure_down':
        this.#announce('Egy épület leomlott!');
        return;
      case 'tower': {
        const victim = this.#avatars[e.to]?.group.position;
        if (victim) this.#burst(victim.x, victim.y + 1, victim.z, 6, 4, '#fde047');
        return;
      }
      case 'wave':
        this.#announce(`${e.wave}. hullám`);
        return;
      case 'boss_wave':
        this.#announce('Főellenség hullám!');
        return;
      case 'boss_phase':
        this.#announce(`A főellenség ${e.phase}. fázisba lépett!`);
        return;
      case 'zone':
        this.#announce('A zóna hamarosan szűkül!');
        return;
      case 'chaos':
        this.#announce('BUBORÉKŐRÜLET! Dupla tűzgyorsaság!');
        return;
      case 'infected':
        if (avatar) this.#burst(avatar.group.position.x, 1, avatar.group.position.z, 50, 6, '#84cc16');
        this.#announce(`${info?.username} megfertőződött!`);
        return;
      case 'revived':
        this.#announce(`${info?.username} újra talpon!`);
        return;
      case 'siege':
        this.#announce('Ostrom-bónusz aktív!');
        return;
      case 'go':
        this.#announce('RAJT!');
        return;
      case 'finish':
        if (e.i === this.#info.you) this.#finished = true;
        this.#announce(`${info?.username} célba ért: ${e.place}. hely`);
        return;
    }
  }

  #buildInput(): ClientInput {
    const k = this.#keys;
    const b = this.#bindings;
    const t = this.touch;
    const active = !this.#paused;
    const ability = active && this.#abilityQueued;
    this.#abilityQueued = false;
    const frozen = this.#isVehicle && (this.#finished || (this.#latest?.m?.startIn ?? 0) > 0);
    const axis = (plus: string, minus: string) => (k.has(plus) ? 1 : 0) - (k.has(minus) ? 1 : 0);
    const sprintBound = k.has(b.sprint) || (b.sprint === 'ShiftLeft' && k.has('ShiftRight'));
    return {
      mx: active && !frozen ? Math.max(-1, Math.min(1, axis(b.right, b.left) + t.mx)) : 0,
      mz: active && !frozen ? Math.max(-1, Math.min(1, axis(b.forward, b.back) + t.mz)) : 0,
      yaw: this.#yaw,
      pitch: this.#pitch,
      jump: active && (k.has(b.jump) || t.jump),
      sprint: active && !frozen && (sprintBound || t.sprint),
      fire: active && (this.#mouseDown || t.fire),
      interact: active && (k.has(b.interact) || t.interact),
      ability
    };
  }

  #clientTick(): void {
    const input = this.#buildInput();
    this.#seq += 1;
    const bits = (input.jump ? 1 : 0) | (input.sprint ? 2 : 0) | (input.fire ? 4 : 0) | (input.ability ? 8 : 0) | (input.interact ? 16 : 0);
    this.#socket.emit('game:input', [this.#seq, input.mx, input.mz, input.yaw, input.pitch, bits]);

    const own = this.#latest?.p[this.#info.you];
    if (this.#body && own && own[FLAGS] & F_ALIVE) {
      this.#prev = { x: this.#body.x, y: this.#body.y, z: this.#body.z };
      this.#stepBody(input);
      this.#pending.push({ seq: this.#seq, input });
      if (this.#pending.length > 90) this.#pending.shift();
    }
  }

  // A többi játékos a múltban, két snapshot között interpolálva jelenik meg
  #sample(index: number, renderAt: number): Interpolation | null {
    const list = this.#snapshots;
    const last = list[list.length - 1];
    if (!last) return null;
    let newer = last;
    let older = newer;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const entry = list[i];
      if (!entry) continue;
      if (entry.at <= renderAt) {
        older = entry;
        newer = list[i + 1] || entry;
        break;
      }
      older = entry;
      newer = entry;
    }
    const a = older.data.p[index] || newer.data.p[index];
    const b = newer.data.p[index] || a;
    if (!a || !b) return null;
    const span = newer.at - older.at;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderAt - older.at) / span)) : 0;
    // Újraéledéskor nem csúszhat végig a pályán
    if (Math.hypot(b[X] - a[X], b[Z] - a[Z]) > 8) return { t: 1, a: b, b };
    return { a, b, t };
  }

  #updateAvatars(now: number, dt: number): void {
    const renderAt = now - INTERP_DELAY_MS;
    const seconds = now / 1000;
    this.#visualOffset.multiplyScalar(Math.exp(-14 * dt));
    const snapshot = this.#latest;
    if (!snapshot) return;

    this.#avatars.forEach((avatar, i) => {
      const own = i === this.#info.you;
      const sample = this.#sample(i, renderAt);
      if (!sample) {
        avatar.group.visible = false;
        return;
      }
      const latest = snapshot.p[i];
      if (!latest) {
        avatar.group.visible = false;
        return;
      }
      const flags = latest[FLAGS];
      const alive = (flags & F_ALIVE) !== 0;
      const downed = (flags & F_DOWNED) !== 0;
      avatar.group.visible = (alive || downed) && (!own || this.#currentDistance > 1.2 || this.#isSpectating());
      avatar.group.rotation.z = downed ? Math.PI / 2 : 0;
      avatar.shield.visible = (flags & F_SHIELD) !== 0;
      avatar.aura.visible = latest[SIDE] === 'infected';
      if (avatar.tag) avatar.tag.material.opacity = flags & F_CONNECTED ? 1 : 0.4;
      if (avatar.emote && now > (avatar.emoteUntil ?? 0)) {
        avatar.group.remove(avatar.emote);
        this.#disposeObject(avatar.emote);
        avatar.emote = null;
      }

      const prev = this.#prev;
      if (own && this.#body && prev) {
        const blend = Math.min(1, this.#accumulator / this.#step);
        avatar.group.position.set(
          THREE.MathUtils.lerp(prev.x, this.#body.x, blend) + this.#visualOffset.x,
          THREE.MathUtils.lerp(prev.y, this.#body.y, blend) + this.#visualOffset.y,
          THREE.MathUtils.lerp(prev.z, this.#body.z, blend) + this.#visualOffset.z
        );
        avatar.group.rotation.y = this.#isVehicle ? this.#body.heading : this.#yaw;
      } else {
        const { a, b, t } = sample;
        avatar.group.position.set(
          THREE.MathUtils.lerp(a[X], b[X], t),
          THREE.MathUtils.lerp(a[Y], b[Y], t),
          THREE.MathUtils.lerp(a[Z], b[Z], t)
        );
        avatar.group.rotation.y = this.#isVehicle ? lerpAngle(a[HEADING], b[HEADING], t) : lerpAngle(a[YAW], b[YAW], t);
      }
      const sprinting = own && (this.#keys.has(this.#bindings.sprint) || this.touch.sprint);
      const moving = this.#isVehicle ? Math.abs(latest[SPEED]) > 0.5 : (flags & F_MOVING) !== 0;
      avatar.animate(seconds + i, moving, sprinting, (flags & F_GROUND) !== 0);
      if (avatar.trail && moving && alive && Math.random() < 0.3) {
        const p = avatar.group.position;
        this.#burst(p.x, p.y + 0.3, p.z, 1, 1, avatar.trail);
      }
    });

    for (const avatar of this.#npcAvatars.values()) {
      const { x, y, z, yaw } = avatar.target;
      const follow = 1 - Math.exp(-12 * dt);
      avatar.group.position.x += (x - avatar.group.position.x) * follow;
      avatar.group.position.y += (y - avatar.group.position.y) * follow;
      avatar.group.position.z += (z - avatar.group.position.z) * follow;
      avatar.group.rotation.y = lerpAngle(avatar.group.rotation.y, yaw, follow);
      avatar.animate(seconds);
    }
  }

  #updateCamera(dt: number): void {
    if (this.#isSpectating()) {
      if (this.#spectate < 0 || !((this.#latest?.p[this.#spectate]?.[FLAGS] ?? 0) & F_ALIVE)) this.#cycleSpectate();
    } else {
      this.#spectate = -1;
    }
    const focus = this.#avatars[this.#spectate >= 0 ? this.#spectate : this.#info.you];
    if (!focus) return;
    const p = focus.group.position;
    if (this.#isVehicle && this.#body) {
      this.#yaw = lerpAngle(this.#yaw, this.#body.heading, 1 - Math.exp(-8 * dt));
      this.#pitch = -0.2;
    }
    const cosPitch = Math.cos(this.#pitch);
    const dir: Vec3 = [-Math.sin(this.#yaw) * cosPitch, Math.sin(this.#pitch), -Math.cos(this.#yaw) * cosPitch];
    const pivot: Vec3 = [p.x, p.y + AIM_HEIGHT, p.z];

    // A kamera a célzási sugár vonalán marad, így a célkereszt pontosan oda mutat, ahova a lövés megy
    const back: Vec3 = [-dir[0], -dir[1], -dir[2]];
    let limit = this.#cameraDistance;
    for (const c of this.#info.world.colliders) {
      const t = raySlab(pivot, back, c, limit);
      if (t !== null && t < limit) limit = t;
    }
    if (back[1] < 0) limit = Math.min(limit, (pivot[1] - 0.15) / -back[1]);
    const target = Math.max(0.6, limit - 0.25);
    this.#currentDistance = target < this.#currentDistance ? target : THREE.MathUtils.damp(this.#currentDistance, target, 8, dt);

    this.#camera.position.set(pivot[0] + back[0] * this.#currentDistance, pivot[1] + back[1] * this.#currentDistance, pivot[2] + back[2] * this.#currentDistance);
    this.#camera.lookAt(pivot[0] + dir[0] * 20, pivot[1] + dir[1] * 20, pivot[2] + dir[2] * 20);
  }

  #updateEffects(now: number, dt: number): void {
    const s = this.#scratch;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = this.#particleState[i];
      if (!p || p.life <= 0) continue;
      p.life -= dt;
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.05, p.y + p.vy * dt);
      p.z += p.vz * dt;
      s.position.set(p.x, p.y, p.z);
      s.scale.setScalar(p.life > 0 ? Math.min(1, p.life * 4) : 0);
      s.updateMatrix();
      this.#particles.setMatrixAt(i, s.matrix);
    }
    this.#particles.instanceMatrix.needsUpdate = true;

    for (const mesh of this.#pickupMeshes.values()) mesh.rotation.y += dt * 1.6;

    for (const line of this.#tracers) {
      if (!line.visible) continue;
      line.userData.life -= dt;
      line.material.opacity = Math.max(0, line.userData.life / 0.09);
      if (line.userData.life <= 0) line.visible = false;
    }

    const bubbles = this.#bubbles;
    if (bubbles) {
      const height = this.#info.world.bounds.height;
      const t = now / 1000;
      this.#bubbleSeeds.forEach(([x, y, z, speed, size], i) => {
        s.position.set(x + Math.sin(t + i) * 0.5, (y + t * speed) % height, z);
        s.scale.setScalar(size);
        s.updateMatrix();
        bubbles.setMatrixAt(i, s.matrix);
      });
      bubbles.instanceMatrix.needsUpdate = true;
    }
  }

  #pushHud(force = false): void {
    const now = performance.now();
    const latest = this.#latest;
    const own = latest?.p[this.#info.you];
    if (!latest || !own || (!force && now - this.#lastHudAt < 100)) return;
    this.#lastHudAt = now;
    this.#feed = this.#feed.filter((f) => now - f.at < 6000);
    if (this.#announcement && now > this.#announcement.until) this.#announcement = null;
    this.#onHud({
      hp: own[HP],
      maxHp: this.#stats.maxHp,
      alive: (own[FLAGS] & F_ALIVE) !== 0,
      downed: (own[FLAGS] & F_DOWNED) !== 0,
      eliminated: (own[FLAGS] & F_ELIMINATED) !== 0,
      place: own[PLACE],
      armor: own[ARMOR],
      item: own[ITEM],
      lap: own[LAP],
      speed: Math.abs(own[SPEED]),
      nitro: own[NITRO],
      revive: own[REVIVE] / 10,
      side: own[SIDE],
      modeHud: latest.m || null,
      npcs: latest.n?.length || 0,
      announcement: this.#announcement?.text || null,
      spectating: this.#spectate >= 0 ? this.#info.players[this.#spectate]?.username ?? null : null,
      respawnIn: own[RESPAWN] / 10,
      shield: (own[FLAGS] & F_SHIELD) !== 0,
      score: latest.score,
      timeLeft: latest.left,
      abilityCooldown: own[COOLDOWN] / 10,
      feed: this.#feed,
      paused: this.#paused,
      locked: this.#locked,
      hitMarker: now < (this.#hitMarkerUntil || 0),
      damaged: now < (this.#damageFlashUntil || 0),
      showScoreboard: this.#showScoreboard,
      board: this.#info.players.map((p) => {
        const e = latest.p[p.i];
        return { ...p, kills: e?.[KILLS] ?? 0, deaths: e?.[DEATHS] ?? 0, connected: e ? (e[FLAGS] & F_CONNECTED) !== 0 : true };
      })
    });
  }

  #frame = (now: number): void => {
    if (this.#disposed) return;
    this.#raf = requestAnimationFrame(this.#frame);
    const dt = Math.min(0.1, (now - this.#lastFrame) / 1000);
    this.#lastFrame = now;

    this.#accumulator += dt;
    let guard = 0;
    while (this.#accumulator >= this.#step && guard < 6) {
      this.#clientTick();
      this.#accumulator -= this.#step;
      guard += 1;
    }
    if (guard === 6) this.#accumulator = 0;

    if (this.#latest) {
      this.#updateAvatars(performance.now(), dt);
      this.#updateCamera(dt);
    }
    this.#updateEffects(now, dt);
    this.#sfx.listener(this.#camera);
    this.#renderer.render(this.#scene, this.#camera);
    this.#pushHud();
  };

  /** Stops the loop, unbinds all listeners and frees GPU resources. */
  dispose(): void {
    this.#disposed = true;
    cancelAnimationFrame(this.#raf);
    this.#resizeObserver.disconnect();
    const h = this.#handlers;
    window.removeEventListener('keydown', h.keydown);
    window.removeEventListener('keyup', h.keyup);
    window.removeEventListener('blur', h.blur);
    window.removeEventListener('mouseup', h.mouseup);
    document.removeEventListener('mousemove', h.mousemove);
    document.removeEventListener('mousedown', h.mousedown);
    document.removeEventListener('pointerlockchange', h.pointerlock);
    if (document.pointerLockElement === this.#renderer.domElement) document.exitPointerLock();
    this.#sfx.dispose();

    disposeTree(this.#scene);
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    this.#renderer.domElement.remove();
  }
}
