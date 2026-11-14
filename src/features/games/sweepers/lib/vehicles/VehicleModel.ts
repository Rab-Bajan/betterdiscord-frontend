// Kliensoldali vezetés (97): kinematikus biciklimodell képkockánként. Gáz / fék / tolatás W/S-ről, kormány
// A/D-ről simítva, menetellenállás; a tömegtényező osztja a gyorsulást és szorozza a fékutat; teli platónál
// a hátsó tapadás elfogy (a haladási irány késve követi az orrot → csúszás); a futómű-állítás és a defekt
// állandó húzást ad. A felfüggesztés csak látvány: rugó-csillapító a test bólintására / dőlésére. Tiszta kód.
import { VEHICLE, topMps, type VehicleType } from './tables';

export interface VehicleInput {
  /** +1 W (gas), −1 S (brake, then reverse). */
  readonly throttle: number;
  /** +1 A (left), −1 D (right). */
  readonly steer: number;
}

export interface VehicleBody {
  x: number;
  z: number;
  rotY: number;
  /** Signed forward speed, m/s (negative: reversing). */
  v: number;
  /** Smoothed steering angle, rad. */
  steer: number;
  /** Direction of travel (lags rotY while drifting). */
  course: number;
  /** Visual body pitch / roll (rad) and their rates. */
  pitch: number;
  roll: number;
  pitchV: number;
  rollV: number;
  /** Metres rolled (wheel spin / bob). */
  odo: number;
  drifting: boolean;
}

export interface VehicleLoad {
  readonly bedKg: number;
  readonly align: number;
  readonly punct: boolean;
}

/** Where the model may go: `resolve` slides the body circle, `blocked` tests the end circles. */
export interface VehicleWorld {
  resolve(fromX: number, fromZ: number, toX: number, toZ: number, r: number): { x: number; z: number };
  blocked(x: number, z: number, rotY: number): boolean;
}

const MAX_STEER = 0.55;
const STEER_RATE = 4;
const REVERSE_SHARE = 0.3;
/** Drift: the course follows the nose at this rate (1/s) with a full bed, instantly otherwise. */
const DRIFT_GRIP = 2.5;
const PITCH_K = 0.012;
const ROLL_K = 0.01;
const SPRING = 60;
const DAMP = 9;

export const newVehicleBody = (x: number, z: number, rotY: number): VehicleBody =>
  ({ x, z, rotY, v: 0, steer: 0, course: rotY, pitch: 0, roll: 0, pitchV: 0, rollV: 0, odo: 0, drifting: false });

/** Mass factor m = (tare + bedKg) / tare (F.7). */
export const massFactor = (t: VehicleType, bedKg: number): number => (t.tareKg + Math.max(0, bedKg)) / t.tareKg;
/** Top speed, × 0.6 when punctured (F.2). */
export const vehicleTop = (t: VehicleType, punct: boolean): number => topMps(t) * (punct ? VEHICLE.punctFactor : 1);
/** Constant steering pull from damage (rad): align 0..4 and a puncture. */
export const steerPull = (align: number, punct: boolean): number => -(0.025 * align + (punct ? 0.06 : 0));

const accelOf = (t: VehicleType): number => (t.manual ? 3 : 2.2 + 30 / t.topKmh);
const brakeOf = (t: VehicleType): number => (t.manual ? 6 : 7);
const dragOf = (t: VehicleType): number => (t.manual ? 4 : 1.2);

/** One frame; `stalled` keeps the throttle dead. Returns the metres actually moved. */
export function stepVehicle(b: VehicleBody, t: VehicleType, load: VehicleLoad, input: VehicleInput, dt: number, world: VehicleWorld | null, stalled = false): number {
  const m = massFactor(t, load.bedKg);
  const top = vehicleTop(t, load.punct);
  const gas = stalled ? 0 : Math.max(-1, Math.min(1, input.throttle));
  const v0 = b.v;
  let a: number;
  if (gas > 0) a = b.v < 0 ? brakeOf(t) / m : accelOf(t) / m;
  else if (gas < 0) a = b.v > 0 ? -brakeOf(t) / m : -accelOf(t) / m;
  else a = -Math.sign(b.v) * Math.min(Math.abs(b.v) / Math.max(dt, 1e-6), dragOf(t) / m);
  b.v = Math.max(-top * REVERSE_SHARE, Math.min(top, b.v + a * dt));

  const target = Math.max(-1, Math.min(1, input.steer)) * MAX_STEER + steerPull(load.align, load.punct);
  b.steer += (target - b.steer) * Math.min(1, STEER_RATE * dt);
  const wheelbase = Math.max(0.6, t.l * 0.6);
  const yawRate = (b.v * Math.tan(b.steer)) / wheelbase;
  b.rotY += yawRate * dt;
  // rear grip at 100 % bed: the course lags the nose
  const full = load.bedKg >= t.capKg;
  const lag = Math.atan2(Math.sin(b.rotY - b.course), Math.cos(b.rotY - b.course));
  b.course = full ? b.course + lag * Math.min(1, DRIFT_GRIP * dt) : b.rotY;
  b.drifting = full && Math.abs(lag) > 0.05 && Math.abs(b.v) > 1;

  const step = b.v * dt;
  const toX = b.x - Math.sin(b.course) * step;
  const toZ = b.z - Math.cos(b.course) * step;
  let next = { x: toX, z: toZ };
  if (world) {
    next = world.resolve(b.x, b.z, toX, toZ, t.r);
    if (world.blocked(next.x, next.z, b.rotY)) next = { x: b.x, z: b.z };
  }
  const moved = Math.hypot(next.x - b.x, next.z - b.z);
  if (Math.abs(step) > 1e-6 && moved < Math.abs(step) * 0.5) b.v *= moved / Math.abs(step); // a wall eats the speed
  b.x = next.x;
  b.z = next.z;
  b.odo += moved;

  // visual suspension: spring-damper towards the load of the acceleration / cornering
  const accel = (b.v - v0) / Math.max(dt, 1e-6);
  const pitchT = -accel * PITCH_K;
  const rollT = -yawRate * b.v * ROLL_K;
  b.pitchV += ((pitchT - b.pitch) * SPRING - b.pitchV * DAMP) * dt;
  b.rollV += ((rollT - b.roll) * SPRING - b.rollV * DAMP) * dt;
  b.pitch = Math.max(-0.12, Math.min(0.12, b.pitch + b.pitchV * dt));
  b.roll = Math.max(-0.12, Math.min(0.12, b.roll + b.rollV * dt));
  return moved;
}
