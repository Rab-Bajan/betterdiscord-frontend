// Types for movement.js. The file stays JavaScript because the backend test suite imports it
// by path (betterdiscord/test/support/frontendModule.cjs) to prove client/server parity.

export declare const BODY_RADIUS: number;
export declare const BODY_HEIGHT: number;

/** Axis-aligned box: [x, y, z] corners. */
export interface Collider {
  min: [number, number, number];
  max: [number, number, number];
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TrackRoute {
  points: Array<[number, number]>;
  width: number;
  open?: boolean;
}

export interface Track {
  routes: TrackRoute[];
}

export interface MovementWorld {
  colliders: Collider[];
  bounds: WorldBounds;
  track?: Track | null;
}

/** A walking body; mutated in place. */
export interface Body {
  x: number;
  y: number;
  z: number;
  vy: number;
  kx: number;
  kz: number;
  onGround: boolean;
  dashTime: number;
  dashX: number;
  dashZ: number;
}

/** A vehicle body; mutated in place. */
export interface VehicleBody extends Body {
  speed: number;
  heading: number;
  nitro: number;
  boostTime: number;
  stunTime: number;
}

export interface MovementInput {
  mx: number;
  mz: number;
  yaw: number;
  jump: boolean;
  sprint: boolean;
}

export declare const VEHICLE: {
  maxSpeed: number;
  accel: number;
  brake: number;
  drag: number;
  steer: number;
  offroad: number;
  nitroMult: number;
  boostMult: number;
  nitroBurn: number;
  nitroRegen: number;
  reverse: number;
  stunDrag: number;
};

export declare function stepMovement(b: Body, input: MovementInput, speed: number, world: MovementWorld, dt: number): void;
export declare function onTrack(track: Track | null | undefined, x: number, z: number): boolean;
export declare function stepVehicle(b: VehicleBody, input: MovementInput, world: MovementWorld, dt: number): void;
