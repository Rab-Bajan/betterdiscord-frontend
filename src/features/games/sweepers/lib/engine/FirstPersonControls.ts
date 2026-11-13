// Belső nézetes irányítás (spec 8): PointerLockControls, 1,75 m szemmagasság, sprintkor 75° -> 65° FOV.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const EYE_HEIGHT = 1.75;
export const BASE_FOV = 75;
export const SPRINT_FOV = 65;
/** FOV approach rate (1/s): reaches ~95 % in 0.4 s. */
const FOV_RATE = 7.5;

export class FirstPersonControls {
  readonly camera: THREE.PerspectiveCamera;
  readonly #controls: PointerLockControls;
  readonly #canvas: HTMLElement;
  readonly #euler = new THREE.Euler(0, 0, 0, 'YXZ');
  readonly #onLock: () => void;
  readonly #onUnlock: () => void;

  constructor(canvas: HTMLElement, onLockChange: (locked: boolean) => void) {
    this.#canvas = canvas;
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 900);
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.#controls = new PointerLockControls(this.camera, canvas);
    this.#onLock = () => onLockChange(true);
    this.#onUnlock = () => onLockChange(false);
    this.#controls.addEventListener('lock', this.#onLock);
    this.#controls.addEventListener('unlock', this.#onUnlock);
  }

  get isLocked(): boolean {
    return this.#controls.isLocked;
  }

  lock(): void {
    // requestPointerLock returns a promise in modern browsers and rejects without a user gesture
    Promise.resolve(this.#canvas.requestPointerLock()).catch(() => {});
  }

  unlock(): void {
    if (this.#controls.isLocked) this.#controls.unlock();
  }

  /** Camera yaw in radians (0 looks down -Z). */
  get yaw(): number {
    return this.#euler.setFromQuaternion(this.camera.quaternion, 'YXZ').y;
  }

  setYaw(yaw: number): void {
    this.#euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.#euler.y = yaw;
    this.camera.quaternion.setFromEuler(this.#euler);
  }

  /** Places the eye above the feet position, eases the FOV and sets the camera roll (beer wobble), radians. */
  update(feet: { x: number; y: number; z: number }, sprinting: boolean, dt: number, roll = 0): void {
    this.camera.position.set(feet.x, feet.y + EYE_HEIGHT, feet.z);
    this.#euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    if (this.#euler.z !== roll) {
      this.#euler.z = roll;
      this.camera.quaternion.setFromEuler(this.#euler);
    }
    const target = sprinting ? SPRINT_FOV : BASE_FOV;
    const next = this.camera.fov + (target - this.camera.fov) * (1 - Math.exp(-FOV_RATE * dt));
    if (Math.abs(next - this.camera.fov) > 0.01) {
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.unlock();
    this.#controls.removeEventListener('lock', this.#onLock);
    this.#controls.removeEventListener('unlock', this.#onUnlock);
    this.#controls.dispose();
  }
}
