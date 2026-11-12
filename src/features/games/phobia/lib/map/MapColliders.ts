/**
 * MapColliders.ts
 *
 * Physics Colliders, Multi-Surface Detection, Hinged Doors, and Hiding Spots
 * for MiskolcPhobia 3D ("A MÉH Telep").
 *
 * Implements:
 * - AABB Box colliders with swept capsule collision and sliding physics.
 * - Multi-surface ground material detection: 'gravel', 'concrete', 'mud', 'metal'.
 * - Hinged 3D doors (0° to 90° smooth swing with creak/slam hooks and active collision).
 * - Hiding spots (lockers and car trunks) providing ghost LOS break when closed.
 * - Zone spatial querying (Truck safe haven, Zone 1-5, Staging, Yard).
 */

import * as THREE from 'three';

/**
 * Surface types for footstep sound selection and physics.
 */
export const SURFACE_TYPES = {
  GRAVEL: 'gravel',      // Crunchy loose stones (yard paths, outside staging)
  CONCRETE: 'concrete',  // Sharp echo (Mázsaház office, weigh pad, hangar slab)
  MUD: 'mud',            // Wet squelching splash (Zone 5, Sufni exterior, puddles)
  METAL: 'metal'         // Hollow resonant clang (hangar catwalk, scrap heaps, scale plate)
} as const;

export type SurfaceType = (typeof SURFACE_TYPES)[keyof typeof SURFACE_TYPES];

/**
 * Zone identifiers and descriptive metadata.
 */
export const ZONE_KEYS = {
  TRUCK: 'truck',
  STAGING: 'staging',
  ZONE1: 'zone1', // Mázsaház (Weighbridge Office)
  ZONE2: 'zone2', // Roncsautó Domb (Crushed Car Mountain)
  ZONE3: 'zone3', // Nagy Hangár (Main Shredder Hangar)
  ZONE4: 'zone4', // Kutyatelep & Sufni (Kennel & Wooden Sheds)
  ZONE5: 'zone5', // Ócskavas Lerakat (Raw Scrap Yard)
  YARD: 'yard'    // Open yard
} as const;

export type ZoneKey = (typeof ZONE_KEYS)[keyof typeof ZONE_KEYS];

export interface ZoneMeta {
  nameHu: string;
  isIndoor: boolean;
  isSafeZone: boolean;
  baseTemp: number;
}

export interface ZoneInfo extends ZoneMeta {
  id: ZoneKey;
}

/** Anything with x/z (a Vector3) or an [x, y, z] array. */
export interface ZonePositionLike {
  x?: number;
  z?: number;
  0?: number;
  2?: number;
}

export interface BoxLike {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface BoxColliderOptions {
  id?: string;
  /** 'wall', 'fence', 'prop', 'vehicle', 'door', 'safe_zone', ... */
  tag?: string;
  surface?: SurfaceType;
  isTrigger?: boolean;
  isSafeZone?: boolean;
  enabled?: boolean;
  min?: THREE.Vector3;
  max?: THREE.Vector3;
  box?: BoxLike;
  center?: THREE.Vector3;
  size?: THREE.Vector3;
  userData?: Record<string, unknown>;
}

export interface CapsuleHit {
  collided: true;
  normal: THREE.Vector3;
  penetration: number;
  surface: SurfaceType;
  colliderId: string;
  tag: string;
}

export interface ColliderRayHit {
  hit: true;
  distance: number;
  point: THREE.Vector3;
  collider: BoxCollider;
}

export type ToggleResult = { success: false; reason: 'locked' } | { success: true; isOpen: boolean };

export interface HingedDoorOptions {
  id?: string;
  name?: string;
  zone?: ZoneKey;
  doorMesh?: THREE.Object3D | null;
  pivot?: THREE.Vector3;
  axis?: THREE.Vector3;
  closedAngle?: number;
  openAngle?: number;
  isOpen?: boolean;
  isLocked?: boolean;
  speed?: number;
  width?: number;
  height?: number;
  thickness?: number;
  direction?: number;
  surface?: SurfaceType;
  onStateChange?: ((isOpen: boolean, angle: number) => void) | null;
}

export type HidingSpotType = 'locker' | 'car_trunk';

export interface HidingSpotOptions {
  id?: string;
  type?: HidingSpotType;
  name?: string;
  zone?: ZoneKey;
  bounds?: THREE.Box3;
  center?: THREE.Vector3;
  size?: THREE.Vector3;
  door?: HingedDoor | null;
  isOpen?: boolean;
  cameraInsidePos?: THREE.Vector3;
  mesh?: THREE.Object3D | null;
}

export interface SurfaceZoneOptions {
  id?: string;
  surfaceType?: SurfaceType;
  priority?: number;
  bounds?: THREE.Box3;
  min?: THREE.Vector3;
  max?: THREE.Vector3;
}

export interface MovementResult {
  position: THREE.Vector3;
  collided: boolean;
  surface: SurfaceType;
}

export type OcclusionResult =
  | { occluded: true; hitPoint: THREE.Vector3; collider: BoxCollider }
  | { occluded: false };

export type StealthResult =
  | { isHidden: true; spotId: string; spotType: HidingSpotType }
  | { isHidden: false; spotId: null };

export const ZONE_METADATA: Record<ZoneKey, ZoneMeta> = {
  [ZONE_KEYS.TRUCK]: {
    nameHu: 'Furgon (Fehér Ford Tranzit)',
    isIndoor: true,
    isSafeZone: true,
    baseTemp: 18.0
  },
  [ZONE_KEYS.STAGING]: {
    nameHu: 'Kapun kívüli terület',
    isIndoor: false,
    isSafeZone: true,
    baseTemp: 8.0
  },
  [ZONE_KEYS.ZONE1]: {
    nameHu: '1. Zóna: Mázsaház (Iroda & Mérleg)',
    isIndoor: true,
    isSafeZone: false,
    baseTemp: 14.0
  },
  [ZONE_KEYS.ZONE2]: {
    nameHu: '2. Zóna: Roncsautó Domb',
    isIndoor: false,
    isSafeZone: false,
    baseTemp: 7.0
  },
  [ZONE_KEYS.ZONE3]: {
    nameHu: '3. Zóna: Nagy Hangár (Roncsdaráló)',
    isIndoor: true,
    isSafeZone: false,
    baseTemp: 9.0
  },
  [ZONE_KEYS.ZONE4]: {
    nameHu: '4. Zóna: Kutyatelep & Sufni',
    isIndoor: false,
    isSafeZone: false,
    baseTemp: 7.5
  },
  [ZONE_KEYS.ZONE5]: {
    nameHu: '5. Zóna: Ócskavas Lerakat',
    isIndoor: false,
    isSafeZone: false,
    baseTemp: 6.5
  },
  [ZONE_KEYS.YARD]: {
    nameHu: 'Központi Telep Udvar',
    isIndoor: false,
    isSafeZone: false,
    baseTemp: 7.0
  }
};

/**
 * Axis-Aligned Bounding Box Collider
 */
export class BoxCollider {
  id: string;
  tag: string;
  surface: SurfaceType;
  isTrigger: boolean;
  isSafeZone: boolean;
  enabled: boolean;
  readonly min: THREE.Vector3;
  readonly max: THREE.Vector3;
  userData: Record<string, unknown>;

  constructor(options: BoxColliderOptions = {}) {
    this.id = options.id || `col_${Math.random().toString(36).substr(2, 9)}`;
    this.tag = options.tag || 'wall'; // 'wall', 'fence', 'prop', 'vehicle', 'door', 'safe_zone'
    this.surface = options.surface || SURFACE_TYPES.GRAVEL;
    this.isTrigger = Boolean(options.isTrigger);
    this.isSafeZone = Boolean(options.isSafeZone);
    this.enabled = options.enabled !== undefined ? options.enabled : true;

    this.min = new THREE.Vector3();
    this.max = new THREE.Vector3();

    if (options.min && options.max) {
      this.min.copy(options.min);
      this.max.copy(options.max);
    } else if (options.box) {
      this.min.copy(options.box.min);
      this.max.copy(options.box.max);
    } else if (options.center && options.size) {
      const halfX = options.size.x / 2;
      const halfY = options.size.y / 2;
      const halfZ = options.size.z / 2;
      this.min.set(options.center.x - halfX, options.center.y - halfY, options.center.z - halfZ);
      this.max.set(options.center.x + halfX, options.center.y + halfY, options.center.z + halfZ);
    } else {
      this.min.set(-0.5, -0.5, -0.5);
      this.max.set(0.5, 0.5, 0.5);
    }

    this.userData = options.userData || {};
  }

  setFromCenterAndSize(center: THREE.Vector3, size: THREE.Vector3): void {
    const halfX = size.x / 2;
    const halfY = size.y / 2;
    const halfZ = size.z / 2;
    this.min.set(center.x - halfX, center.y - halfY, center.z - halfZ);
    this.max.set(center.x + halfX, center.y + halfY, center.z + halfZ);
  }

  containsPoint(point: THREE.Vector3): boolean {
    return (
      point.x >= this.min.x && point.x <= this.max.x &&
      point.y >= this.min.y && point.y <= this.max.y &&
      point.z >= this.min.z && point.z <= this.max.z
    );
  }

  intersectsSphere(center: THREE.Vector3, radius: number): boolean {
    const closestX = Math.max(this.min.x, Math.min(center.x, this.max.x));
    const closestY = Math.max(this.min.y, Math.min(center.y, this.max.y));
    const closestZ = Math.max(this.min.z, Math.min(center.z, this.max.z));

    const dx = center.x - closestX;
    const dy = center.y - closestY;
    const dz = center.z - closestZ;

    return (dx * dx + dy * dy + dz * dz) <= (radius * radius);
  }

  /**
   * Tests and resolves collision against a player cylinder/capsule.
   * Player base is at playerPos.y, height is playerHeight.
   */
  resolvePlayerCapsule(playerPos: THREE.Vector3, radius: number, height: number): CapsuleHit | null {
    if (!this.enabled || this.isTrigger) return null;

    // Check vertical overlap
    const playerMinY = playerPos.y;
    const playerMaxY = playerPos.y + height;

    if (playerMaxY < this.min.y || playerMinY > this.max.y) {
      return null;
    }

    // Closest point in XZ plane
    const closestX = Math.max(this.min.x, Math.min(playerPos.x, this.max.x));
    const closestZ = Math.max(this.min.z, Math.min(playerPos.z, this.max.z));

    const dx = playerPos.x - closestX;
    const dz = playerPos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radius * radius) {
      return null; // No collision
    }

    const dist = Math.sqrt(distSq);
    let normalX = 0;
    let normalZ = 0;
    let penetration = 0;

    if (dist > 0.0001) {
      normalX = dx / dist;
      normalZ = dz / dist;
      penetration = radius - dist;
    } else {
      // Player center is inside AABB XZ footprint: push towards closest edge
      const distToMinX = Math.abs(playerPos.x - this.min.x);
      const distToMaxX = Math.abs(this.max.x - playerPos.x);
      const distToMinZ = Math.abs(playerPos.z - this.min.z);
      const distToMaxZ = Math.abs(this.max.z - playerPos.z);

      const minEdgeDist = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);
      if (minEdgeDist === distToMinX) {
        normalX = -1;
        penetration = radius + distToMinX;
      } else if (minEdgeDist === distToMaxX) {
        normalX = 1;
        penetration = radius + distToMaxX;
      } else if (minEdgeDist === distToMinZ) {
        normalZ = -1;
        penetration = radius + distToMinZ;
      } else {
        normalZ = 1;
        penetration = radius + distToMaxZ;
      }
    }

    return {
      collided: true,
      normal: new THREE.Vector3(normalX, 0, normalZ),
      penetration,
      surface: this.surface,
      colliderId: this.id,
      tag: this.tag
    };
  }

  raycast(ray: THREE.Ray): ColliderRayHit | null {
    if (!this.enabled) return null;
    const box = new THREE.Box3(this.min, this.max);
    const target = new THREE.Vector3();
    const hitPoint = ray.intersectBox(box, target);
    if (!hitPoint) return null;

    const distance = ray.origin.distanceTo(hitPoint);
    return {
      hit: true,
      distance,
      point: hitPoint.clone(),
      collider: this
    };
  }
}

/**
 * Hinged 3D Door with physics rotation, sound hooks, and dynamic collider.
 */
export class HingedDoor {
  id: string;
  name: string;
  zone: ZoneKey;
  doorMesh: THREE.Object3D | null;
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  closedAngle: number;
  openAngle: number;
  currentAngle: number;
  targetAngle: number;
  isOpen: boolean;
  isLocked: boolean;
  speed: number;
  isMoving: boolean;
  width: number;
  height: number;
  thickness: number;
  direction: number;
  readonly collider: BoxCollider;
  onStateChange: ((isOpen: boolean, angle: number) => void) | null;

  constructor(options: HingedDoorOptions = {}) {
    this.id = options.id || `door_${Math.random().toString(36).substr(2, 9)}`;
    this.name = options.name || 'Ajtó';
    this.zone = options.zone || ZONE_KEYS.ZONE1;
    this.doorMesh = options.doorMesh || null; // Three.js mesh/group
    this.pivot = options.pivot ? options.pivot.clone() : new THREE.Vector3();
    this.axis = options.axis ? options.axis.clone().normalize() : new THREE.Vector3(0, 1, 0);

    // Angular limits in radians
    this.closedAngle = options.closedAngle !== undefined ? options.closedAngle : 0;
    this.openAngle = options.openAngle !== undefined ? options.openAngle : Math.PI / 2; // 90 degrees
    this.currentAngle = this.closedAngle;
    this.targetAngle = this.closedAngle;
    this.isOpen = Boolean(options.isOpen);
    if (this.isOpen) {
      this.currentAngle = this.openAngle;
      this.targetAngle = this.openAngle;
    }
    this.isLocked = Boolean(options.isLocked);
    this.speed = options.speed || 3.8; // rad/sec
    this.isMoving = false;

    // Door physical dimensions for collider
    this.width = options.width || 1.1;
    this.height = options.height || 2.2;
    this.thickness = options.thickness || 0.12;
    this.direction = options.direction || 1; // 1 for +angle, -1 for -angle

    // Create dynamic box collider for the door
    this.collider = new BoxCollider({
      id: `col_door_${this.id}`,
      tag: 'door',
      surface: options.surface || SURFACE_TYPES.METAL,
      min: new THREE.Vector3(),
      max: new THREE.Vector3()
    });

    this.onStateChange = options.onStateChange || null; // callback(isOpen, angle)
    this.updateCollider();
  }

  toggle(): ToggleResult {
    if (this.isLocked) {
      return { success: false, reason: 'locked' };
    }
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
    return { success: true, isOpen: this.isOpen };
  }

  open(): boolean {
    if (this.isLocked) return false;
    this.isOpen = true;
    this.targetAngle = this.openAngle;
    this.isMoving = true;
    if (this.onStateChange) this.onStateChange(true, this.targetAngle);
    return true;
  }

  close(): boolean {
    this.isOpen = false;
    this.targetAngle = this.closedAngle;
    this.isMoving = true;
    if (this.onStateChange) this.onStateChange(false, this.targetAngle);
    return true;
  }

  setLocked(locked: boolean): void {
    this.isLocked = Boolean(locked);
    if (this.isLocked && this.isOpen) {
      this.close();
    }
  }

  update(delta: number): void {
    if (!this.isMoving) return;

    const angleDiff = this.targetAngle - this.currentAngle;
    const step = this.speed * delta;

    if (Math.abs(angleDiff) <= step) {
      this.currentAngle = this.targetAngle;
      this.isMoving = false;
    } else {
      this.currentAngle += Math.sign(angleDiff) * step;
    }

    // Apply rotation to door mesh around the hinge axis (trunk lids swing about X, doors about Y)
    if (this.doorMesh) {
      const ax = Math.abs(this.axis.x);
      const ay = Math.abs(this.axis.y);
      const az = Math.abs(this.axis.z);
      if (ax > ay && ax > az) this.doorMesh.rotation.x = this.currentAngle;
      else if (az > ay && az > ax) this.doorMesh.rotation.z = this.currentAngle;
      else this.doorMesh.rotation.y = this.currentAngle;
    }

    this.updateCollider();
  }

  updateCollider(): void {
    // When door is open past 60 degrees, disable or minimize collision to allow smooth passage
    const openProgress = Math.abs(this.currentAngle - this.closedAngle) / Math.abs(this.openAngle - this.closedAngle || 1);
    if (openProgress > 0.65) {
      this.collider.enabled = false;
      return;
    }

    this.collider.enabled = true;
    // Calculate AABB around rotated door
    const halfH = this.height / 2;
    const pX = this.pivot.x;
    const pY = this.pivot.y;
    const pZ = this.pivot.z;

    const cosA = Math.cos(this.currentAngle);
    const sinA = Math.sin(this.currentAngle);

    const corner1X = pX;
    const corner1Z = pZ;
    const corner2X = pX + cosA * this.width;
    const corner2Z = pZ + sinA * this.width;

    const minX = Math.min(corner1X, corner2X) - this.thickness;
    const maxX = Math.max(corner1X, corner2X) + this.thickness;
    const minZ = Math.min(corner1Z, corner2Z) - this.thickness;
    const maxZ = Math.max(corner1Z, corner2Z) + this.thickness;

    this.collider.min.set(minX, pY, minZ);
    this.collider.max.set(maxX, pY + this.height, maxZ);
  }
}

/**
 * Interactive Hiding Spot (Lockers and Car Trunks).
 * When player is inside and door is closed, severs ghost line of sight.
 */
export class HidingSpot {
  id: string;
  type: HidingSpotType;
  name: string;
  zone: ZoneKey;
  readonly bounds: THREE.Box3;
  door: HingedDoor | null;
  isOpen: boolean;
  isOccupied: boolean;
  occupantId: string | null;
  hasCustomCameraPos: boolean;
  cameraInsidePos: THREE.Vector3;
  mesh: THREE.Object3D | null;

  constructor(options: HidingSpotOptions = {}) {
    this.id = options.id || `hiding_${Math.random().toString(36).substr(2, 9)}`;
    this.type = options.type || 'locker'; // 'locker' | 'car_trunk'
    this.name = options.name || (this.type === 'locker' ? 'Fémszekrény' : 'Csomagtartó');
    this.zone = options.zone || ZONE_KEYS.ZONE1;
    this.bounds = new THREE.Box3();
    if (options.bounds) {
      this.bounds.copy(options.bounds);
    } else if (options.center && options.size) {
      const half = options.size.clone().multiplyScalar(0.5);
      this.bounds.min.subVectors(options.center, half);
      this.bounds.max.addVectors(options.center, half);
    }

    this.door = options.door || null; // HingedDoor instance
    this.isOpen = Boolean(options.isOpen);
    this.isOccupied = false;
    this.occupantId = null;
    this.hasCustomCameraPos = Boolean(options.cameraInsidePos);
    this.cameraInsidePos = options.cameraInsidePos
      ? options.cameraInsidePos.clone()
      : this.bounds.getCenter(new THREE.Vector3());

    this.mesh = options.mesh || null;
  }

  toggle(): ToggleResult {
    if (this.door) {
      const res = this.door.toggle();
      this.isOpen = this.door.isOpen;
      return res;
    }
    this.isOpen = !this.isOpen;
    return { success: true, isOpen: this.isOpen };
  }

  open(): void {
    if (this.door) this.door.open();
    this.isOpen = true;
  }

  close(): void {
    if (this.door) this.door.close();
    this.isOpen = false;
  }

  isPlayerInside(position: THREE.Vector3): boolean {
    return this.bounds.containsPoint(position);
  }

  canEnter(position: THREE.Vector3, playerId: string | null = null): boolean {
    if (this.isOccupied && this.occupantId !== playerId) return false;
    // Must be close to the hiding spot (horizontal distance: the player's feet are on the ground)
    const center = this.bounds.getCenter(new THREE.Vector3());
    return Math.hypot(position.x - center.x, position.z - center.z) <= 2.6;
  }

  /** Feet position inside the volume (ground level, centre of the footprint). */
  getInteriorFloor(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const c = this.bounds.getCenter(target);
    c.y = this.bounds.min.y;
    return c;
  }

  /** Eye position inside the volume: lockers at head height, trunks low (the player curls up). */
  getEyePosition(target: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    if (this.hasCustomCameraPos) return target.copy(this.cameraInsidePos);
    const c = this.bounds.getCenter(target);
    c.y = Math.max(this.bounds.min.y + 0.4, Math.min(this.bounds.min.y + 1.6, this.bounds.max.y - 0.2));
    return c;
  }

  enter(playerId: string | null): void {
    this.isOccupied = true;
    this.occupantId = playerId;
  }

  exit(): void {
    this.isOccupied = false;
    this.occupantId = null;
  }

  /**
   * Evaluates whether this hiding spot breaks ghost Line-Of-Sight.
   * True only if player is inside the volume and door is closed.
   */
  breaksGhostLOS(playerPos: THREE.Vector3): boolean {
    const inside = this.isPlayerInside(playerPos);
    const doorClosed = this.door ? (!this.door.isOpen && Math.abs(this.door.currentAngle - this.door.closedAngle) < 0.15) : !this.isOpen;
    return inside && doorClosed;
  }
}

/**
 * Surface type bounding region
 */
export class SurfaceZone {
  id: string;
  surfaceType: SurfaceType;
  priority: number;
  readonly bounds: THREE.Box3;

  constructor(options: SurfaceZoneOptions = {}) {
    this.id = options.id || `surf_${Math.random().toString(36).substr(2, 9)}`;
    this.surfaceType = options.surfaceType || SURFACE_TYPES.GRAVEL;
    this.priority = options.priority || 0; // Higher number overrides lower (e.g. catwalk over concrete)
    this.bounds = new THREE.Box3();
    if (options.bounds) {
      this.bounds.copy(options.bounds);
    } else if (options.min && options.max) {
      this.bounds.min.copy(options.min);
      this.bounds.max.copy(options.max);
    }
  }

  contains(x: number, z: number, y: number | null = null): boolean {
    const inXZ = (
      x >= this.bounds.min.x && x <= this.bounds.max.x &&
      z >= this.bounds.min.z && z <= this.bounds.max.z
    );
    if (!inXZ) return false;
    if (y !== null) {
      return y >= this.bounds.min.y && y <= this.bounds.max.y;
    }
    return true;
  }
}

/**
 * Main MapColliders manager
 */
export class MapColliders {
  readonly colliders: BoxCollider[];
  readonly doors: Map<string, HingedDoor>;
  readonly hidingSpots: Map<string, HidingSpot>;
  surfaceZones: SurfaceZone[];
  readonly safeZones: BoxCollider[];
  private readonly _ray: THREE.Ray;
  private readonly _tempVec1: THREE.Vector3;
  private readonly _tempVec2: THREE.Vector3;

  constructor() {
    this.colliders = [];
    this.doors = new Map();
    this.hidingSpots = new Map();
    this.surfaceZones = [];
    this.safeZones = [];

    // Raycaster scratch objects for zero-allocation queries
    this._ray = new THREE.Ray();
    this._tempVec1 = new THREE.Vector3();
    this._tempVec2 = new THREE.Vector3();

    this.initDefaultSurfaceZones();
  }

  /**
   * Registers a static or dynamic collider box.
   */
  addCollider(input: BoxCollider | BoxColliderOptions): BoxCollider {
    const collider = input instanceof BoxCollider ? input : new BoxCollider(input);
    this.colliders.push(collider);
    if (collider.isSafeZone) {
      this.safeZones.push(collider);
    }
    return collider;
  }

  removeCollider(id: string): void {
    const idx = this.colliders.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.colliders.splice(idx, 1);
    }
    const safeIdx = this.safeZones.findIndex(c => c.id === id);
    if (safeIdx !== -1) {
      this.safeZones.splice(safeIdx, 1);
    }
  }

  /**
   * Registers a hinged door.
   */
  addDoor(input: HingedDoor | HingedDoorOptions): HingedDoor {
    const door = input instanceof HingedDoor ? input : new HingedDoor(input);
    this.doors.set(door.id, door);
    if (door.collider) {
      this.addCollider(door.collider);
    }
    return door;
  }

  getDoor(id: string): HingedDoor | undefined {
    return this.doors.get(id);
  }

  /**
   * Registers a hiding spot (locker / car trunk).
   */
  addHidingSpot(input: HidingSpot | HidingSpotOptions): HidingSpot {
    const spot = input instanceof HidingSpot ? input : new HidingSpot(input);
    this.hidingSpots.set(spot.id, spot);
    if (spot.door) {
      this.addDoor(spot.door);
    }
    return spot;
  }

  getHidingSpot(id: string): HidingSpot | undefined {
    return this.hidingSpots.get(id);
  }

  /**
   * Registers a surface zone for audio footsteps.
   */
  addSurfaceZone(input: SurfaceZone | SurfaceZoneOptions): SurfaceZone {
    const zone = input instanceof SurfaceZone ? input : new SurfaceZone(input);
    this.surfaceZones.push(zone);
    // Keep sorted by priority ascending
    this.surfaceZones.sort((a, b) => a.priority - b.priority);
    return zone;
  }

  /**
   * Setup default scrap yard surface regions according to Points 40–45.
   */
  initDefaultSurfaceZones(): void {
    // 1. Outside staging & gravel pathways (Default base)
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_base_gravel',
      surfaceType: SURFACE_TYPES.GRAVEL,
      priority: 0,
      bounds: new THREE.Box3(new THREE.Vector3(-45, -5, -35), new THREE.Vector3(45, 10, 55))
    }));

    // 2. Zone 1: Mázsaház concrete interior + exterior weigh scale platform
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_mazsahaz_office',
      surfaceType: SURFACE_TYPES.CONCRETE,
      priority: 10,
      bounds: new THREE.Box3(new THREE.Vector3(8.0, -0.5, 2.0), new THREE.Vector3(18.0, 4.0, 12.0))
    }));
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_weigh_platform_metal',
      surfaceType: SURFACE_TYPES.METAL,
      priority: 20,
      bounds: new THREE.Box3(new THREE.Vector3(5.8, -0.2, 2.8), new THREE.Vector3(8.2, 0.4, 11.2))
    }));

    // 3. Zone 3: Nagy Hangár concrete floor & metal catwalks
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_hangar_concrete',
      surfaceType: SURFACE_TYPES.CONCRETE,
      priority: 10,
      bounds: new THREE.Box3(new THREE.Vector3(-5.0, -0.5, 22.0), new THREE.Vector3(22.0, 8.0, 45.0))
    }));
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_hangar_catwalk_metal',
      surfaceType: SURFACE_TYPES.METAL,
      priority: 30,
      bounds: new THREE.Box3(new THREE.Vector3(15.0, 2.5, 24.0), new THREE.Vector3(21.0, 5.0, 43.0))
    }));

    // 4. Zone 4: Kutyatelep & Sufni (Dirt and mud)
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_zone4_mud',
      surfaceType: SURFACE_TYPES.MUD,
      priority: 10,
      bounds: new THREE.Box3(new THREE.Vector3(-28.0, -0.5, 28.0), new THREE.Vector3(-12.0, 5.0, 46.0))
    }));

    // 5. Zone 5: Ócskavas Lerakat (Wet mud with puddles & scrap heaps)
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_zone5_mud',
      surfaceType: SURFACE_TYPES.MUD,
      priority: 10,
      bounds: new THREE.Box3(new THREE.Vector3(20.0, -0.5, 8.0), new THREE.Vector3(35.0, 5.0, 38.0))
    }));
    this.addSurfaceZone(new SurfaceZone({
      id: 'surf_zone5_metal_scrap',
      surfaceType: SURFACE_TYPES.METAL,
      priority: 25,
      bounds: new THREE.Box3(new THREE.Vector3(22.0, 0.2, 12.0), new THREE.Vector3(33.0, 3.5, 25.0))
    }));
  }

  /**
   * Resolves player movement against all world colliders with sliding physics.
   * Handles crouching collider height reduction and smooth corner navigation.
   */
  resolvePlayerMovement(currentPos: THREE.Vector3, velocity: THREE.Vector3, delta: number, radius = 0.35, height = 1.8): MovementResult {
    // Step candidate position
    const candidatePos = currentPos.clone().addScaledVector(velocity, delta);
    let resolvedPos = candidatePos.clone();
    let collisionOccurred = false;
    let lastSurface: SurfaceType = SURFACE_TYPES.GRAVEL;

    // Up to 3 iterations for multi-surface / corner resolution
    for (let iter = 0; iter < 3; iter++) {
      let closestHit: CapsuleHit | null = null;
      let maxPen = 0;

      for (const col of this.colliders) {
        if (!col.enabled || col.isTrigger) continue;

        const hit = col.resolvePlayerCapsule(resolvedPos, radius, height);
        if (hit && hit.penetration > maxPen) {
          maxPen = hit.penetration;
          closestHit = hit;
        }
      }

      if (!closestHit) break; // Clean position

      collisionOccurred = true;
      lastSurface = closestHit.surface;

      // Push player out along collision normal
      resolvedPos.x += closestHit.normal.x * (closestHit.penetration + 0.002);
      resolvedPos.z += closestHit.normal.z * (closestHit.penetration + 0.002);

      // Slide remaining velocity along plane normal
      const normalDot = velocity.x * closestHit.normal.x + velocity.z * closestHit.normal.z;
      if (normalDot < 0) {
        velocity.x -= closestHit.normal.x * normalDot;
        velocity.z -= closestHit.normal.z * normalDot;
      }
    }

    return {
      position: resolvedPos,
      collided: collisionOccurred,
      surface: lastSurface
    };
  }

  /**
   * Checks if position is within the Surveillance Van Safe Haven.
   */
  isInsideSafeZone(position: THREE.Vector3): boolean {
    for (const zone of this.safeZones) {
      if (zone.containsPoint(position)) {
        return true;
      }
    }
    // Hardcoded bounding volume: [-6.0, -1.5] x [0.0, 3.0] x [-18.0, -12.0]
    return (
      position.x >= -6.0 && position.x <= -1.5 &&
      position.y >= 0.0 && position.y <= 3.0 &&
      position.z >= -18.0 && position.z <= -12.0
    );
  }

  /**
   * Determines active zone for ghost AI, temperature, and HUD.
   */
  detectZone(position: ZonePositionLike | null | undefined): ZoneKey {
    if (!position) return ZONE_KEYS.YARD;
    const x = position.x ?? position[0] ?? 0;
    const z = position.z ?? position[2] ?? 0;
    const zoneObj = this.getZoneAt(x, z);
    return zoneObj?.id || ZONE_KEYS.YARD;
  }

  getZoneAt(x: number, z: number): ZoneInfo {
    // 1. Truck safe haven
    if (x >= -6.0 && x <= -1.5 && z >= -18.0 && z <= -12.0) {
      return { id: ZONE_KEYS.TRUCK, ...ZONE_METADATA[ZONE_KEYS.TRUCK] };
    }

    // 2. Staging outside gate
    if (z < 0.0) {
      return { id: ZONE_KEYS.STAGING, ...ZONE_METADATA[ZONE_KEYS.STAGING] };
    }

    // 3. Zone 1: Mázsaház [8.0 to 18.0, 2.0 to 12.0]
    if (x >= 8.0 && x <= 18.0 && z >= 2.0 && z <= 12.0) {
      return { id: ZONE_KEYS.ZONE1, ...ZONE_METADATA[ZONE_KEYS.ZONE1] };
    }

    // 4. Zone 2: Roncsautó Domb [-25.0 to -8.0, 5.0 to 25.0]
    if (x >= -25.0 && x <= -8.0 && z >= 5.0 && z <= 25.0) {
      return { id: ZONE_KEYS.ZONE2, ...ZONE_METADATA[ZONE_KEYS.ZONE2] };
    }

    // 5. Zone 3: Nagy Hangár [-5.0 to 22.0, 22.0 to 45.0]
    if (x >= -5.0 && x <= 22.0 && z >= 22.0 && z <= 45.0) {
      return { id: ZONE_KEYS.ZONE3, ...ZONE_METADATA[ZONE_KEYS.ZONE3] };
    }

    // 6. Zone 4: Kutyatelep & Sufni [-28.0 to -12.0, 28.0 to 46.0]
    if (x >= -28.0 && x <= -12.0 && z >= 28.0 && z <= 46.0) {
      return { id: ZONE_KEYS.ZONE4, ...ZONE_METADATA[ZONE_KEYS.ZONE4] };
    }

    // 7. Zone 5: Ócskavas Lerakat [20.0 to 35.0, 8.0 to 38.0]
    if (x >= 20.0 && x <= 35.0 && z >= 8.0 && z <= 38.0) {
      return { id: ZONE_KEYS.ZONE5, ...ZONE_METADATA[ZONE_KEYS.ZONE5] };
    }

    // 8. Open yard inside fence
    return { id: ZONE_KEYS.YARD, ...ZONE_METADATA[ZONE_KEYS.YARD] };
  }

  /**
   * Surface type query for contextual footstep audio.
   */
  getSurfaceTypeAt(x: number, z: number, y: number | null = null): SurfaceType {
    let bestSurface: SurfaceType = SURFACE_TYPES.GRAVEL;
    let highestPriority = -1;

    for (const zone of this.surfaceZones) {
      if (zone.priority > highestPriority && zone.contains(x, z, y)) {
        highestPriority = zone.priority;
        bestSurface = zone.surfaceType;
      }
    }

    return bestSurface;
  }

  /**
   * Raycast occlusion test (tests if direct line between from and to is blocked by walls/doors).
   */
  checkRaycastOcclusion(from: THREE.Vector3, to: THREE.Vector3, maxDist = Infinity): OcclusionResult {
    this._ray.origin.copy(from);
    this._ray.direction.subVectors(to, from).normalize();
    const actualDist = Math.min(from.distanceTo(to), maxDist);

    for (const col of this.colliders) {
      if (!col.enabled || col.isTrigger) continue;

      const hit = col.raycast(this._ray);
      if (hit && hit.distance < actualDist - 0.05) {
        return { occluded: true, hitPoint: hit.point, collider: col };
      }
    }

    return { occluded: false };
  }

  /**
   * Checks if player is hidden inside any closed locker or car trunk.
   */
  isPlayerStealthHidden(playerPos: THREE.Vector3): StealthResult {
    for (const spot of this.hidingSpots.values()) {
      if (spot.breaksGhostLOS(playerPos)) {
        return { isHidden: true, spotId: spot.id, spotType: spot.type };
      }
    }
    return { isHidden: false, spotId: null };
  }

  /**
   * Updates all dynamic doors and animations.
   */
  update(delta: number): void {
    for (const door of this.doors.values()) {
      door.update(delta);
    }
  }
}
