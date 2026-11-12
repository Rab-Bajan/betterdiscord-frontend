/**
 * PhobiaAvatars.ts
 *
 * Multiplayer 3D Avatars Synchronization for MiskolcPhobia.
 *
 * Implements:
 * - Procedural 3D humanoid character model wearing reflective orange/yellow hazard vest
 *   ('Láthatósági mellény') and forehead white LED headlamp.
 * - Position and rotation interpolation (lerp/slerp) matching 12 Hz tick packets
 *   with 15.0 * dt damping factor.
 * - Synchronized flashlight beam (on/off state, directional tracking with head pitch).
 * - Dynamic leg/arm walk and sprint swing animations.
 * - Floating billboard overhead nameplate displaying username and sanity status.
 * - Full lifecycle management: add, remove, update from 12 Hz phobia:tick packets, disposal.
 */

import * as THREE from 'three';
import { createHumanFigure, createPlayerMaterials, FIGURE } from '../visual/HumanFigure.ts';
import type { HumanFigureRig } from '../visual/HumanFigure.ts';

/**
 * One peer's state as carried by a `phobia:tick` player entry (or a join / session-init player):
 * flat x/y/z + yaw/pitch, or the legacy position/rotation arrays.
 */
export interface AvatarPlayerData {
  id?: string;
  socketId?: string;
  userId?: string;
  username?: string;
  avatarColor?: string;
  x?: number;
  y?: number;
  z?: number;
  position?: readonly number[];
  yaw?: number;
  pitch?: number;
  rotation?: readonly number[];
  crouched?: boolean;
  sprinting?: boolean;
  alive?: boolean;
  sanity?: number;
  flashlightOn?: boolean;
}

export interface PhobiaAvatarsOptions {
  scene?: THREE.Object3D | null;
  localPlayerId?: string | null;
}

/**
 * Creates a canvas texture for the overhead player nameplate billboard.
 */
function createNameplateTexture(username: string, sanity = 100): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') {
    // In headless testing environment, return null
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  ctx.fillStyle = 'rgba(15, 17, 26, 0.75)';
  ctx.roundRect ? ctx.roundRect(4, 4, 248, 56, 8) : ctx.fillRect(4, 4, 248, 56);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#7655F5';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Username
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(username || 'Kutató', 128, 22);

  // Sanity bar background
  ctx.fillStyle = '#222530';
  ctx.fillRect(28, 40, 200, 10);

  // Sanity bar fill
  const clampedSanity = Math.max(0, Math.min(100, sanity));
  let barColor = '#28C997'; // Green > 50%
  if (clampedSanity <= 25) {
    barColor = '#E94B64'; // Red <= 25%
  } else if (clampedSanity <= 50) {
    barColor = '#F59E0B'; // Orange <= 50%
  }
  ctx.fillStyle = barColor;
  ctx.fillRect(28, 40, (200 * clampedSanity) / 100, 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Single peer player 3D avatar instance.
 */
export class PhobiaAvatarInstance {
  readonly id: string;
  userId: string;
  username: string;
  avatarColor: string;
  readonly currentPosition: THREE.Vector3;
  readonly targetPosition: THREE.Vector3;
  currentYaw: number;
  targetYaw: number;
  currentPitch: number;
  targetPitch: number;
  crouched: boolean;
  sprinting: boolean;
  alive: boolean;
  sanity: number;
  flashlightOn: boolean;
  swingTimer: number;
  isMoving: boolean;
  _lastPos: THREE.Vector3;
  readonly rootGroup: THREE.Group;
  figure!: HumanFigureRig;
  legsGroup!: THREE.Group;
  torsoGroup!: THREE.Group;
  leftLeg!: THREE.Group;
  rightLeg!: THREE.Group;
  leftArm!: THREE.Group;
  rightArm!: THREE.Group;
  headPivot!: THREE.Group;
  flashlight!: THREE.SpotLight;
  flashlightTarget!: THREE.Object3D;
  nameplateTexture: THREE.CanvasTexture | null = null;
  nameplateSprite?: THREE.Sprite;

  constructor(id: string, data: AvatarPlayerData = {}) {
    this.id = id;
    this.userId = data.userId || id;
    this.username = data.username || `Kutató_${id.toString().slice(0, 4)}`;
    this.avatarColor = data.avatarColor || '#ff6a00'; // Default safety orange

    // Spatial State
    const initX = data.x !== undefined ? data.x : (data.position?.[0] || -4.0);
    const initY = data.y !== undefined ? data.y : (data.position?.[1] || 0.0);
    const initZ = data.z !== undefined ? data.z : (data.position?.[2] || -15.0);

    this.currentPosition = new THREE.Vector3(initX, initY, initZ);
    this.targetPosition = new THREE.Vector3(initX, initY, initZ);

    this.currentYaw = data.yaw !== undefined ? data.yaw : (data.rotation?.[1] || 0.0);
    this.targetYaw = this.currentYaw;

    this.currentPitch = data.pitch !== undefined ? data.pitch : (data.rotation?.[0] || 0.0);
    this.targetPitch = this.currentPitch;

    this.crouched = Boolean(data.crouched);
    this.sprinting = Boolean(data.sprinting);
    this.alive = data.alive !== undefined ? Boolean(data.alive) : true;
    this.sanity = data.sanity !== undefined ? data.sanity : 100;

    // Flashlight synchronization
    this.flashlightOn = data.flashlightOn !== undefined ? Boolean(data.flashlightOn) : true;

    // Animation & Bobbing
    this.swingTimer = 0.0;
    this.isMoving = false;
    this._lastPos = this.currentPosition.clone();

    // Build 3D Model Hierarchy
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = `Avatar_${this.id}`;
    this.rootGroup.position.copy(this.currentPosition);
    this.rootGroup.rotation.y = this.currentYaw;

    this._buildProceduralModel();
  }

  _buildProceduralModel(): void {
    // Articulated human figure (see visual/HumanFigure.ts): hips + legs (thigh, knee, foot), torso with
    // shoulders / elbows / hands, neck and head. The hi-vis vest takes the player's avatar colour.
    let vest = 0xff6600;
    try {
      vest = new THREE.Color(this.avatarColor).getHex();
    } catch {
      // keep the default vest colour
    }
    this.figure = createHumanFigure(createPlayerMaterials(vest));
    this.rootGroup.add(this.figure.root);

    // Keep the legacy handles other modules / tests rely on
    this.legsGroup = this.figure.hips;
    this.torsoGroup = this.figure.torso;
    this.leftLeg = this.figure.leftLeg;
    this.rightLeg = this.figure.rightLeg;
    this.leftArm = this.figure.leftArm;
    this.rightArm = this.figure.rightArm;
    this.headPivot = this.figure.headPivot;

    // Synchronized 3D Flashlight Spotlight (mounted on the headlamp)
    this.flashlight = new THREE.SpotLight(0xfffaee, 2.5);
    this.flashlight.angle = Math.PI / 6; // 30 degrees cone
    this.flashlight.penumbra = 0.35;
    this.flashlight.distance = 18.0;
    this.flashlight.decay = 2.0;
    this.flashlight.castShadow = false; // Keep shadow casting budgeted for local player & floodlights
    this.flashlight.position.set(0, 0.17, 0.13);

    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0.17, 5.0);
    this.headPivot.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.headPivot.add(this.flashlight);

    this.flashlight.visible = this.flashlightOn;

    // 5. Overhead Floating Nameplate Billboard
    this.nameplateTexture = createNameplateTexture(this.username, this.sanity);
    if (this.nameplateTexture) {
      const spriteMat = new THREE.SpriteMaterial({
        map: this.nameplateTexture,
        depthTest: false,
        depthWrite: false
      });
      this.nameplateSprite = new THREE.Sprite(spriteMat);
      this.nameplateSprite.scale.set(1.4, 0.35, 1.0);
      this.nameplateSprite.position.set(0, 2.05, 0);
      this.rootGroup.add(this.nameplateSprite);
    }
  }

  updateData(data: AvatarPlayerData = {}): void {
    if (data.userId) this.userId = data.userId;
    if (data.username && data.username !== this.username) {
      this.username = data.username;
      this.updateNameplate(this.username, this.sanity);
    }

    if (data.x !== undefined && data.y !== undefined && data.z !== undefined) {
      this.targetPosition.set(data.x, data.y, data.z);
    } else if (Array.isArray(data.position)) {
      const [px, py, pz] = data.position as Array<number | undefined>;
      this.targetPosition.set(px as number, py as number, pz as number);
    }

    if (data.yaw !== undefined) {
      this.targetYaw = data.yaw;
    } else if (Array.isArray(data.rotation)) {
      this.targetYaw = data.rotation[1] as number;
    }

    if (data.pitch !== undefined) {
      this.targetPitch = data.pitch;
    } else if (Array.isArray(data.rotation)) {
      this.targetPitch = data.rotation[0] as number;
    }

    if (data.crouched !== undefined) this.crouched = Boolean(data.crouched);
    if (data.sprinting !== undefined) this.sprinting = Boolean(data.sprinting);
    if (data.alive !== undefined) this.alive = Boolean(data.alive);

    if (data.sanity !== undefined && Math.abs(this.sanity - data.sanity) >= 1) {
      this.sanity = data.sanity;
      this.updateNameplate(this.username, this.sanity);
    }

    if (data.flashlightOn !== undefined) {
      this.setFlashlight(data.flashlightOn);
    }
  }

  setFlashlight(state: unknown): void {
    this.flashlightOn = Boolean(state);
    if (this.flashlight) {
      this.flashlight.visible = this.flashlightOn && this.alive;
    }
  }

  updateNameplate(username: string, sanity: number): void {
    if (!this.nameplateSprite || typeof document === 'undefined') return;

    if (this.nameplateTexture) {
      this.nameplateTexture.dispose();
    }
    this.nameplateTexture = createNameplateTexture(username, sanity);
    if (this.nameplateTexture) {
      this.nameplateSprite.material.map = this.nameplateTexture;
      this.nameplateSprite.material.needsUpdate = true;
    }
  }

  update(delta: number): void {
    if (!delta || delta <= 0) return;
    const dt = Math.min(delta, 0.1);

    // Point 30 Interpolation: Damping factor 15.0 * dt
    const factor = Math.min(1.0, 15.0 * dt);

    // 1. Position Lerp
    this.currentPosition.lerp(this.targetPosition, factor);
    this.rootGroup.position.copy(this.currentPosition);

    // 2. Yaw Interpolation (handling 2π angular wrapping)
    let yawDiff = this.targetYaw - this.currentYaw;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    this.currentYaw += yawDiff * factor;
    this.rootGroup.rotation.y = this.currentYaw;

    // 3. Head Pitch Lerp
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, factor);
    if (this.headPivot) {
      this.headPivot.rotation.x = this.currentPitch;
    }

    // 4./5. Crouch, walk / sprint cycle, bob and flashlight arm are all driven by the figure rig
    const distMoved = this.currentPosition.distanceTo(this.targetPosition);
    const speed = dt > 0 ? this.currentPosition.distanceTo(this._lastPos) / dt : 0;
    this._lastPos.copy(this.currentPosition);
    this.isMoving = distMoved > 0.02 || speed > 0.4;
    this.swingTimer += this.isMoving ? dt : 0;
    this.figure.animate(dt, {
      moving: this.isMoving && this.alive,
      sprinting: this.sprinting,
      crouched: this.crouched,
      holdLight: this.flashlightOn && this.alive && !this.sprinting
    });
    if (this.headPivot) this.headPivot.rotation.x = this.currentPitch;

    // 6. Alive / Dead Appearance
    if (!this.alive) {
      // Fallen dead pose
      this.rootGroup.rotation.z = THREE.MathUtils.lerp(this.rootGroup.rotation.z, Math.PI / 2, factor);
      if (this.flashlight) this.flashlight.visible = false;
      if (this.nameplateSprite) this.nameplateSprite.visible = false;
    } else {
      this.rootGroup.rotation.z = THREE.MathUtils.lerp(this.rootGroup.rotation.z, 0, factor);
      if (this.flashlight) this.flashlight.visible = this.flashlightOn;
      if (this.nameplateSprite) this.nameplateSprite.visible = true;
    }
  }

  dispose(): void {
    if (this.nameplateTexture) {
      this.nameplateTexture.dispose();
      this.nameplateTexture = null;
    }

    this.figure?.dispose();

    // Traverse and dispose all geometries & materials
    this.rootGroup.traverse((obj) => {
      const { geometry, material } = obj as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      if (geometry) {
        geometry.dispose();
      }
      if (material) {
        if (Array.isArray(material)) {
          material.forEach(m => m.dispose());
        } else {
          material.dispose();
        }
      }
    });

    if (this.rootGroup.parent) {
      this.rootGroup.parent.remove(this.rootGroup);
    }
  }
}

/**
 * PhobiaAvatars Manager
 * Coordinates all peer avatars in the session.
 */
export class PhobiaAvatars {
  scene: THREE.Object3D | null;
  readonly group: THREE.Group;
  localPlayerId: string | null;
  readonly avatars: Map<string, PhobiaAvatarInstance>;

  constructor(options: PhobiaAvatarsOptions = {}) {
    this.scene = options.scene || null;
    this.group = new THREE.Group();
    this.group.name = 'PhobiaAvatarsGroup';

    if (this.scene) {
      this.scene.add(this.group);
    }

    this.localPlayerId = options.localPlayerId || null;
    this.avatars = new Map(); // peerId -> PhobiaAvatarInstance
  }

  setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
    if (this.avatars.has(id)) {
      this.removeAvatar(id);
    }
  }

  addAvatar(id: string, data: AvatarPlayerData = {}): PhobiaAvatarInstance {
    const existing = this.avatars.get(id);
    if (existing) {
      this.updateAvatar(id, data);
      return existing;
    }

    const avatar = new PhobiaAvatarInstance(id, data);
    this.avatars.set(id, avatar);
    this.group.add(avatar.rootGroup);
    return avatar;
  }

  removeAvatar(id: string): boolean {
    const avatar = this.avatars.get(id);
    if (!avatar) return false;

    this.group.remove(avatar.rootGroup);
    avatar.dispose();
    this.avatars.delete(id);
    return true;
  }

  getAvatar(id: string): PhobiaAvatarInstance | null {
    return this.avatars.get(id) || null;
  }

  hasAvatar(id: string): boolean {
    return this.avatars.has(id);
  }

  updateAvatar(id: string, data: AvatarPlayerData = {}): void {
    const avatar = this.avatars.get(id);
    if (avatar) {
      avatar.updateData(data);
    } else {
      this.addAvatar(id, data);
    }
  }

  /**
   * Synchronizes avatars with authoritative 12 Hz phobia:tick payload.
   * @param players - Array of player states from tick packet
   * @param localPlayerId - Optional local player identifier to omit
   */
  handleTick(players: readonly AvatarPlayerData[] = [], localPlayerId: string | null = null): void {
    const myId = localPlayerId || this.localPlayerId;
    const activeIds = new Set<string>();

    if (Array.isArray(players)) {
      for (const p of players) {
        const pId = p.id || p.socketId || p.userId;
        if (!pId || (myId && pId === myId)) continue;

        activeIds.add(pId);
        const avatar = this.avatars.get(pId);
        if (avatar) {
          avatar.updateData(p);
        } else {
          this.addAvatar(pId, p);
        }
      }
    }

    // Remove avatars that disconnected or left
    for (const id of this.avatars.keys()) {
      if (!activeIds.has(id)) {
        this.removeAvatar(id);
      }
    }
  }

  updateFromTick(players: readonly AvatarPlayerData[] = [], localPlayerId: string | null = null): void {
    return this.handleTick(players, localPlayerId);
  }

  update(delta: number): void {
    for (const avatar of this.avatars.values()) {
      avatar.update(delta);
    }
  }

  clear(): void {
    for (const avatar of this.avatars.values()) {
      avatar.dispose();
    }
    this.avatars.clear();
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0] as THREE.Object3D);
    }
  }

  dispose(): void {
    this.clear();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
