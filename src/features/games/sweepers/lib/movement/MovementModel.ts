// Saját játékos kinematikája (kliensoldali előrejelzés): séta, sprint, ugrás, gravitáció.

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
}

export interface BodyState {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
}

export type MoveMode = 'IDLE' | 'WALK' | 'SPRINT';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Advances `body` by `dt` seconds; returns the resulting locomotion mode. */
export function stepBody(body: BodyState, intent: MoveIntent, dt: number): MoveMode {
  let f = intent.forward;
  let s = intent.strafe;
  const len = Math.hypot(f, s);
  if (len > 1) {
    f /= len;
    s /= len;
  }
  const moving = len > 0.001;
  const sprinting = moving && intent.sprint && f > 0;
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  // three.js camera forward at yaw θ is (-sinθ, 0, -cosθ); right is (cosθ, 0, -sinθ)
  const sin = Math.sin(intent.yaw);
  const cos = Math.cos(intent.yaw);
  body.x = clamp(body.x + (-sin * f + cos * s) * speed * dt, -WORLD_BOUND, WORLD_BOUND);
  body.z = clamp(body.z + (-cos * f - sin * s) * speed * dt, -WORLD_BOUND, WORLD_BOUND);

  if (intent.jump && body.grounded) {
    body.vy = JUMP_VELOCITY;
    body.grounded = false;
  }
  if (!body.grounded) {
    body.vy += GRAVITY * dt;
    body.y += body.vy * dt;
    if (body.y <= GROUND_Y) {
      body.y = GROUND_Y;
      body.vy = 0;
      body.grounded = true;
    }
  }
  body.y = clamp(body.y, GROUND_Y, MAX_Y);
  if (!moving) return 'IDLE';
  return sprinting ? 'SPRINT' : 'WALK';
}
