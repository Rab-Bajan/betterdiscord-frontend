// WebGL renderelő (spec 6/7): sRGB, ACES tónusleképezés, lágy árnyékok.
import * as THREE from 'three';

export const TONE_MAPPING_EXPOSURE = 1.15;
const MAX_PIXEL_RATIO = 2;

export class SweepersRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly #mount: HTMLElement;

  constructor(mount: HTMLElement) {
    this.#mount = mount;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    mount.appendChild(canvas);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Matches the drawing buffer and the camera to the mount size (spec 15). */
  resize(camera: THREE.PerspectiveCamera): void {
    const width = Math.max(1, this.#mount.clientWidth);
    const height = Math.max(1, this.#mount.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
