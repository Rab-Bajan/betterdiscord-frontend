// Távoli játékosok: narancs láthatósági mellényes kapszulafigurák névtáblával, interpolált pózzal.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { PartsBuilder } from './geometryKit';
import { litMaterial } from './materials';
import { InterpolationBuffer, type PoseSample } from '../net/interpolation';
import type { PlayerAnimState, PlayerSnapshot } from '../../types';

/** Draw calls of one figure: one merged vertex-coloured mesh + the name tag sprite (one shadow caster). */
export const FIGURE_DRAW_CALLS = 2;
export const FIGURE_SHADOW_CASTERS = 1;

export interface RadarPin {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly color: string;
}

const BODY_RADIUS = 0.32;
const BODY_LENGTH = 1.05;

function avatarHex(avatarColor: string): number {
  const color = new THREE.Color(0xff7a1a);
  try {
    color.setStyle(avatarColor);
  } catch {
    color.setHex(0xff7a1a);
  }
  return color.getHex();
}

/**
 * Body, vest, reflective stripes, head and the avatar-coloured cap merged into one vertex-coloured
 * geometry (one draw call and one shadow caster per figure), cached per cap colour.
 */
function figureGeometry(capHex: number): THREE.BufferGeometry {
  return AssetCache.get().geometry(`fig.merged.${capHex.toString(16)}`, () => {
    const b = new PartsBuilder()
      .add(new THREE.CapsuleGeometry(BODY_RADIUS, BODY_LENGTH, 6, 14), 0x22305a, { y: BODY_RADIUS + BODY_LENGTH / 2 })
      .add(new THREE.CylinderGeometry(BODY_RADIUS + 0.03, BODY_RADIUS + 0.03, 0.62, 16, 1), 0xff7a1a, { y: 1.12 });
    for (const y of [1.0, 1.24]) b.add(new THREE.CylinderGeometry(BODY_RADIUS + 0.035, BODY_RADIUS + 0.035, 0.06, 16, 1, true), 0xdfe6ee, { y });
    return b
      .add(new THREE.SphereGeometry(0.17, 16, 12), 0xe0b48f, { y: 1.66 })
      .add(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capHex, { y: 1.7 })
      .build();
  });
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
    const body = new THREE.Mesh(figureGeometry(avatarHex(snapshot.avatarColor)), litMaterial());
    body.castShadow = true; // into the sun map and both lamp maps
    this.#tag = createNameTag(snapshot.username);
    this.group.add(body, this.#tag);
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

  /** Current interpolated poses for the radar. */
  pins(): RadarPin[] {
    return [...this.#figures.values()].map((f) => ({
      id: f.snapshot.id,
      x: f.group.position.x,
      z: f.group.position.z,
      rotY: f.group.rotation.y,
      color: f.snapshot.avatarColor
    }));
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
