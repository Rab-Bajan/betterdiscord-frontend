// Távoli játékosok: narancs láthatósági mellényes kapszulafigurák névtáblával, interpolált pózzal.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { InterpolationBuffer, type PoseSample } from '../net/interpolation';
import type { PlayerAnimState, PlayerSnapshot } from '../../types';

const BODY_RADIUS = 0.32;
const BODY_LENGTH = 1.05;

function figureParts(): { body: THREE.BufferGeometry; vest: THREE.BufferGeometry; stripe: THREE.BufferGeometry; head: THREE.BufferGeometry; cap: THREE.BufferGeometry } {
  const cache = AssetCache.get();
  return {
    body: cache.geometry('fig.body', () => new THREE.CapsuleGeometry(BODY_RADIUS, BODY_LENGTH, 6, 14).translate(0, BODY_RADIUS + BODY_LENGTH / 2, 0)),
    vest: cache.geometry('fig.vest', () => new THREE.CylinderGeometry(BODY_RADIUS + 0.03, BODY_RADIUS + 0.03, 0.62, 16, 1, true).translate(0, 1.12, 0)),
    stripe: cache.geometry('fig.stripe', () => new THREE.CylinderGeometry(BODY_RADIUS + 0.035, BODY_RADIUS + 0.035, 0.06, 16, 1, true)),
    head: cache.geometry('fig.head', () => new THREE.SphereGeometry(0.17, 16, 12).translate(0, 1.66, 0)),
    cap: cache.geometry('fig.cap', () => new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.7, 0))
  };
}

function figureMaterials(avatarColor: string): { body: THREE.Material; vest: THREE.Material; stripe: THREE.Material; skin: THREE.Material; cap: THREE.Material } {
  const cache = AssetCache.get();
  const color = new THREE.Color();
  try {
    color.setStyle(avatarColor);
  } catch {
    color.setHex(0xff7a1a);
  }
  return {
    body: cache.material('fig.body', () => new THREE.MeshStandardMaterial({ color: 0x22305a, roughness: 0.85 })),
    vest: cache.material('fig.vest', () => new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x401800 })),
    stripe: cache.material('fig.stripe', () => new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide })),
    skin: cache.material('fig.skin', () => new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.8 })),
    cap: cache.material(`fig.cap.${color.getHexString()}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
  };
}

/** Name tag sprite; the canvas texture and sprite material are owned per player. */
function createNameTag(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(9, 10, 24, 0.78)';
    g.beginPath();
    g.roundRect(4, 8, 248, 48, 14);
    g.fill();
    g.fillStyle = '#E2E8F0';
    g.font = '600 26px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name.length > 18 ? `${name.slice(0, 17)}…` : name, 128, 33, 236);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 2.2;
  return sprite;
}

class RemoteFigure {
  readonly group = new THREE.Group();
  readonly buffer = new InterpolationBuffer();
  readonly #tag: THREE.Sprite;
  state: PlayerAnimState;
  #phase = 0;

  constructor(readonly snapshot: PlayerSnapshot, serverTime: number) {
    const parts = figureParts();
    const mats = figureMaterials(snapshot.avatarColor);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, y = 0): THREE.Mesh => {
      const o = new THREE.Mesh(g, m);
      o.position.y = y;
      o.castShadow = true;
      return o;
    };
    this.#tag = createNameTag(snapshot.username);
    this.group.add(
      mesh(parts.body, mats.body),
      mesh(parts.vest, mats.vest),
      mesh(parts.stripe, mats.stripe, 1.0),
      mesh(parts.stripe, mats.stripe, 1.24),
      mesh(parts.head, mats.skin),
      mesh(parts.cap, mats.cap),
      this.#tag
    );
    this.group.name = `player-${snapshot.id}`;
    this.state = snapshot.state;
    this.push({ t: serverTime, x: snapshot.x, y: snapshot.y, z: snapshot.z, rotY: snapshot.rotY }, snapshot.state);
    this.group.position.set(snapshot.x, snapshot.y, snapshot.z);
    this.group.rotation.y = snapshot.rotY;
  }

  push(sample: PoseSample, state: PlayerAnimState): void {
    this.buffer.push(sample);
    this.state = state;
  }

  update(serverNow: number, dt: number): void {
    const pose = this.buffer.sample(serverNow);
    if (!pose) return;
    const moving = this.state === 'WALK' || this.state === 'SPRINT';
    this.#phase = moving ? this.#phase + dt * (this.state === 'SPRINT' ? 13 : 9) : 0;
    this.group.position.set(pose.x, pose.y + (moving ? Math.abs(Math.sin(this.#phase)) * 0.05 : 0), pose.z);
    this.group.rotation.y = pose.rotY;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.#tag.material.map?.dispose();
    this.#tag.material.dispose();
  }
}

export class RemotePlayers {
  readonly root = new THREE.Group();
  readonly #figures = new Map<number, RemoteFigure>();

  constructor(scene: THREE.Scene) {
    this.root.name = 'remote-players';
    scene.add(this.root);
  }

  /** Replaces everyone (init_state rebuild). */
  reset(players: readonly PlayerSnapshot[], serverTime: number): void {
    this.clear();
    for (const p of players) this.add(p, serverTime);
  }

  add(player: PlayerSnapshot, serverTime: number): void {
    this.remove(player.id);
    const figure = new RemoteFigure(player, serverTime);
    this.#figures.set(player.id, figure);
    this.root.add(figure.group);
  }

  remove(id: number): void {
    const figure = this.#figures.get(id);
    if (!figure) return;
    figure.dispose();
    this.#figures.delete(id);
  }

  /** Feeds one tick sample; unknown ids are ignored until player_joined / init_state. */
  push(id: number, sample: PoseSample, state: PlayerAnimState): void {
    this.#figures.get(id)?.push(sample, state);
  }

  update(serverNow: number, dt: number): void {
    for (const figure of this.#figures.values()) figure.update(serverNow, dt);
  }

  get count(): number {
    return this.#figures.size;
  }

  clear(): void {
    for (const figure of this.#figures.values()) figure.dispose();
    this.#figures.clear();
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }
}
