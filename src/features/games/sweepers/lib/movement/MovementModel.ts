// Saját játékos kinematikája (kliensoldali előrejelzés): séta, sprint, ugrás, gravitáció, terep,
// ütközés és felület-súrlódás (spec 26/27).
import { ABOVE_GROUND_LIMIT, SKIN, SURFACE_RESPONSE, type MovementWorld } from './WorldCollision';

export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 7.2;
export const JUMP_VELOCITY = 4.8;
export const GRAVITY = -14;
export const WORLD_BOUND = 300;
export const MAX_Y = 50;
export const GROUND_Y = 0;

export interface MoveIntent {
  /** -1 back .. 1 forward */
  readonly forward: number;
  /** -1 left .. 1 right */
  readonly strafe: number;
  readonly sprint: boolean;
  readonly jump: boolean;
  /** Facing yaw, radians (three.js: 0 looks down -Z). */
  readonly yaw: number;
  /** Sprint speed multiplier (Kofola: 1.15, as the server's budget); absent = 1. */
  readonly sprintMul?: number;
}

export interface BodyState {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
  /** Horizontal velocity, m/s; only kept on low-friction surfaces (absent = 0). */
  vx?: number;
  vz?: number;
}

export type MoveMode = 'IDLE' | 'WALK' | 'SPRINT';

/** Velocity approach rate on a surface of friction μ is SLIDE_RATE·μ² (1/s); dry ground is instant. */
export const SLIDE_RATE = 18;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Advances `body` by `dt` seconds; returns the resulting locomotion mode. With a `world` the feet
 * follow its support height, colliders / locked hexes block, and the surface sets speed and grip.
 */
export function stepBody(body: BodyState, intent: MoveIntent, dt: number, world?: MovementWorld): MoveMode {
  let f = intent.forward;
  let s = intent.strafe;
  const len = Math.hypot(f, s);
  if (len > 1) {
    f /= len;
    s /= len;
  }
  const moving = len > 0.001;
  const sprinting = moving && intent.sprint && f > 0;
  const surface = SURFACE_RESPONSE[world?.surfaceAt(body.x, body.z) ?? 'dry'];
  const speed = (sprinting ? SPRINT_SPEED * (intent.sprintMul ?? 1) : WALK_SPEED) * surface.speed;
  // three.js camera forward at yaw θ is (-sinθ, 0, -cosθ); right is (cosθ, 0, -sinθ)
  const sin = Math.sin(intent.yaw);
  const cos = Math.cos(intent.yaw);
  const tvx = (-sin * f + cos * s) * speed;
  const tvz = (-cos * f - sin * s) * speed;
  let vx = tvx;
  let vz = tvz;
  if (surface.mu < 1) {
    const k = 1 - Math.exp(-SLIDE_RATE * surface.mu * surface.mu * dt);
    vx = (body.vx ?? 0) + (tvx - (body.vx ?? 0)) * k;
    vz = (body.vz ?? 0) + (tvz - (body.vz ?? 0)) * k;
  }
  const fromX = body.x;
  const fromZ = body.z;
  let x = clamp(fromX + vx * dt, -WORLD_BOUND, WORLD_BOUND);
  let z = clamp(fromZ + vz * dt, -WORLD_BOUND, WORLD_BOUND);
  if (world) {
    const resolved = world.resolve(fromX, fromZ, x, z);
    x = resolved.x;
    z = resolved.z;
    if (dt > 0 && surface.mu < 1) {
      // a wall eats the slide: keep only the velocity that actually happened
      vx = (x - fromX) / dt;
      vz = (z - fromZ) / dt;
    }
  }
  body.x = x;
  body.z = z;
  if (surface.mu < 1) {
    body.vx = vx;
    body.vz = vz;
  } else if (body.vx !== undefined || body.vz !== undefined) {
    body.vx = 0;
    body.vz = 0;
  }

  const ground = world ? clamp(world.support(x, z), GROUND_Y, MAX_Y) : GROUND_Y;
  if (intent.jump && body.grounded) {
    body.vy = JUMP_VELOCITY;
    body.grounded = false;
  }
  if (body.grounded) {
    body.y = ground; // walk along the terrain (server: ground − 0.05 ≤ y ≤ ground + 1.2)
    body.vy = 0;
  } else {
    body.vy += GRAVITY * dt;
    body.y += body.vy * dt;
    if (body.y <= ground) {
      body.y = ground;
      body.vy = 0;
      body.grounded = true;
    } else if (world) {
      // the server clamps y to terrain + 1.2 at the new x/z (a jump off a downhill slope would exceed it)
      const ceiling = world.terrain(x, z) + ABOVE_GROUND_LIMIT - SKIN;
      if (body.y > ceiling) {
        body.y = Math.max(ground, ceiling);
        body.vy = Math.min(body.vy, 0);
      }
    }
  }
  body.y = clamp(body.y, GROUND_Y, MAX_Y);
  if (!moving) return 'IDLE';
  return sprinting ? 'SPRINT' : 'WALK';
}
