/**
 * ToolDefinitions.ts
 *
 * MiskolcPhobia 3D - Complete Investigation Tools & Survival Items Definitions.
 *
 * Implements:
 * 1. Investigation Tools (8 items):
 *    - EMF 5 Reader: LED 1-5 display bars, audio tick frequency scaling with ghost EMF emission.
 *    - Spirit Box: AM/FM radio tuner sweep, Hungarian ghost voice responses ("Itt vagyok", "Mögötted", etc.).
 *    - UV Flashlight: Deep violet beam (#4A00E0) revealing glowing neon green handprints/footprints (#39FF14).
 *    - Laser Thermometer: Red pinpoint laser dot, digital LCD display showing real-time ambient temp (<0.0°C in freezing zones).
 *    - Video Camera & Tripod: Placeable or held, night vision mode, displays floating Ghost Orbs.
 *    - Ghost Writing Book: Placeable spiral-bound kockás füzet; ghost writes Hungarian scribbles ("MEGDÖGLESZ", etc.).
 *    - D.O.T.S. Projector: Placeable matrix displaying green laser dots; reveals passing translucent ghost silhouettes.
 *    - Photo Camera: Viewfinder, 150ms screen flash, captures photo, grades bounties (Ghost 3-star=1000Ft, Fingerprint=500Ft, etc.).
 *
 * 2. Survival Items (5 items):
 *    - Mobile Jesus: Golden crucifix 3D model, 4m defensive aura blocking hunts, flame particle burn effect, breaks into ash after 2 charges.
 *    - Smudge Sticks & Lighter: Smoke particle emitter, blinds hunting ghost for 5s, delays hunts for 90s (60s for Demon).
 *    - Sanity Flask (Pálinka): Drink animation, restores +35% player sanity, empty flask state.
 *    - Tier 1 & 2 Flashlights: Tier 1 standard warm incandescent (12-18m) and Tier 2 heavy-duty tactical cold-white LED (18-32m).
 *    - Salt Piles: 3 placements, white conical pile, stepped-on disturbed footprint mesh, crunch SFX, 60s UV footprints.
 *
 * Genuine procedural Three.js 3D models (viewmodels and world models), dynamic canvas LCD textures,
 * PBR materials, particles, and behavior logic.
 */

import * as THREE from 'three';
import { DotsLaserMatrix } from '../shaders/DotsLaserMatrix.ts';
import { getPBRMaterial } from '../visual/ProceduralTextures.ts';
import { mergeParts, roundedBox } from '../visual/GeometryKit.ts';
import { P, tube } from '../visual/YardProps.ts';
import type { MergePart } from '../visual/GeometryKit.ts';
import { GHOST_WRITING_SCRIBBLES, PHOTO_BOUNTIES, SPIRIT_BOX_VOICE_LINES, TOOL_TYPES, normalizeToolType } from './toolCatalog.ts';
import type { PhotoBounty } from './toolCatalog.ts';

/** A photo subject graded by ItemSystem.evaluatePhotoTarget (a bounty, or an orb sighting). */
export type PhotoTarget = PhotoBounty & { kind?: string };

export interface PhotoRecord {
  id: string;
  timestamp: string;
  target: PhotoTarget;
  stars: number;
  rewardFt: number;
  labelHu: string;
}

/**
 * The behaviour a tool model publishes on `root.userData` (three types userData as an open record).
 * Every member is optional: each tool sets its own subset, and callers feature-test before use.
 */
export interface ToolUserData {
  type?: string;
  nameHu?: string;
  tier?: number;
  isTool?: boolean;
  isPickup?: boolean;
  isPlaceable?: boolean;
  isConsumable?: boolean;
  isTripodMounted?: boolean;
  defensiveRadius?: number;
  itemId?: string;
  promptHu?: string;
  charges?: number;
  /** A SpotLight on the flashlights / UV light, the lighter action on the smudge sticks. */
  light?: THREE.SpotLight | (() => boolean);
  matrix?: DotsLaserMatrix;
  update?: (delta: number, ghostPos?: THREE.Vector3 | null) => void;
  toggle?: () => boolean;
  isOn?: () => boolean;
  flicker?: (intensity: number) => void;
  getLevel?: () => number;
  setLevel?: (level: number) => void;
  togglePower?: () => boolean;
  isPowered?: () => boolean;
  getClickFrequency?: () => number;
  isScanning?: () => boolean;
  toggleScan?: () => boolean;
  triggerGhostVoice?: (line?: string) => string | undefined;
  checkHandprintVisibility?: (itemPos: THREE.Vector3, itemNormal?: THREE.Vector3) => boolean;
  getTemperature?: () => number;
  isFreezing?: () => boolean;
  setReading?: (temp: unknown) => void;
  isNightVision?: () => boolean;
  toggleNightVision?: () => boolean;
  hasWriting?: () => boolean;
  getWritingText?: () => string | null | undefined;
  triggerWriting?: (customText?: string) => string | undefined;
  getPhotosLeft?: () => number;
  getAlbum?: () => PhotoRecord[];
  snapPhoto?: (evaluatedTarget?: PhotoTarget | null) => PhotoRecord | null;
  getCharges?: () => number;
  isCharred?: () => boolean;
  isBroken?: () => boolean;
  burnCharge?: () => { blocked: boolean; chargesRemaining: number };
  isLit?: () => boolean;
  isEmpty?: () => boolean;
  drink?: () => boolean;
  placeSalt?: () => boolean;
  isSteppedOn?: () => boolean;
  stepOn?: () => boolean;
}

/** Typed view of an object's userData as tool behaviour (userData is `Record<string, any>` in three). */
export function toolData(object: THREE.Object3D | null | undefined): ToolUserData | undefined {
  const data: ToolUserData | undefined = object?.userData;
  return data;
}

export interface ToolModelOptions {
  hasWriting?: boolean;
  charges?: number;
  isSteppedOn?: boolean;
}

/** The parts of a canvas 2D context the tool LCDs draw with (the headless stand-in implements the same). */
export interface ToolCanvasContext
  extends Pick<
    CanvasRenderingContext2D,
    | 'arc'
    | 'beginPath'
    | 'clearRect'
    | 'fill'
    | 'fillRect'
    | 'fillText'
    | 'lineTo'
    | 'moveTo'
    | 'restore'
    | 'rotate'
    | 'save'
    | 'scale'
    | 'stroke'
    | 'strokeRect'
    | 'translate'
    | 'fillStyle'
    | 'font'
    | 'lineWidth'
    | 'strokeStyle'
  > {
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Pick<CanvasGradient, 'addColorStop'>;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Pick<CanvasGradient, 'addColorStop'>;
  measureText(text: string): { width: number };
}

/** A real canvas, or the headless stand-in (an EventTarget, like three's OffscreenCanvas shim). */
export interface ToolCanvas extends EventTarget {
  width: number;
  height: number;
  getContext(contextId: '2d'): ToolCanvasContext | null;
}

// ============================================================================
// SHARED PBR PROCEDURAL MATERIALS
// ============================================================================

const lazyToolMaterials = {
  yellowPlastic: () => getPBRMaterial('plastic', { color: 0xdd9911, tile: 1, normalScale: 0.5 }),
  darkRubber: () => getPBRMaterial('plastic', { color: 0x222226, tile: 1, normalScale: 0.8, roughnessScale: 1.5 }),
  blackMetal: () => getPBRMaterial('anodized', { color: 0x1f2126, tile: 1, normalScale: 0.4 }),
  oliveMetal: () => getPBRMaterial('anodized', { color: 0x4a5240, tile: 1, normalScale: 0.4 })
};
type LazyToolMaterialKey = keyof typeof lazyToolMaterials;
const lazyToolMaterialCache: Partial<Record<LazyToolMaterialKey, THREE.MeshStandardMaterial>> = {};
const lazyToolMaterial = (key: LazyToolMaterialKey): THREE.MeshStandardMaterial =>
  (lazyToolMaterialCache[key] ||= lazyToolMaterials[key]());

const sharedMaterials = {
  chromeMetal: new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.15,
    metalness: 0.95
  }),
  pureGold: new THREE.MeshStandardMaterial({
    color: 0xffd23f,
    roughness: 0.22,
    metalness: 0.9
  }),
  charredJesus: new THREE.MeshStandardMaterial({
    color: 0x1c1716,
    roughness: 0.9,
    metalness: 0.1,
    emissive: 0xee3300,
    emissiveIntensity: 0.45
  }),
  ashMound: new THREE.MeshStandardMaterial({
    color: 0x2b2b2b,
    roughness: 0.98,
    metalness: 0.02
  }),
  glassClear: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    roughness: 0.08,
    transmission: 0.85,
    thickness: 0.4
  }),
  palinkaAmberLiquid: new THREE.MeshStandardMaterial({
    color: 0xda8318,
    transparent: true,
    opacity: 0.82,
    roughness: 0.2
  }),
  sageHerbs: new THREE.MeshStandardMaterial({
    color: 0x5a634e,
    roughness: 0.9,
    metalness: 0.05
  }),
  twineRope: new THREE.MeshStandardMaterial({
    color: 0x9e8867,
    roughness: 0.85,
    metalness: 0.05
  }),
  redPlastic: new THREE.MeshStandardMaterial({
    color: 0xcc2222,
    roughness: 0.35,
    metalness: 0.1
  }),
  saltWhiteGrains: new THREE.MeshStandardMaterial({
    color: 0xf6f8fc,
    roughness: 0.75,
    metalness: 0.08
  }),
  saltDisturbedFootprint: new THREE.MeshStandardMaterial({
    color: 0xdde0e6,
    roughness: 0.9,
    metalness: 0.05
  }),
  // Textured tool materials are created lazily (after the engine chose the texture quality) and cached.
  get yellowPlastic(): THREE.MeshStandardMaterial {
    return lazyToolMaterial('yellowPlastic');
  },
  get darkRubber(): THREE.MeshStandardMaterial {
    return lazyToolMaterial('darkRubber');
  },
  get blackMetal(): THREE.MeshStandardMaterial {
    return lazyToolMaterial('blackMetal');
  },
  get oliveMetal(): THREE.MeshStandardMaterial {
    return lazyToolMaterial('oliveMetal');
  }
};

/** Merge detail parts per material and attach them to a tool root (small decorative meshes: no shadows). */
function addDetail(root: THREE.Object3D, groups: ReadonlyArray<readonly [THREE.Material, MergePart[]]>): void {
  for (const [mat, parts] of groups) {
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.name = 'Detail';
    root.add(mesh);
  }
}

const ringsAlong = (axis: 'y' | 'z', r: number, tubeR: number, positions: readonly number[]): MergePart[] =>
  positions.map((p) => (axis === 'z' ? P.torus(r, tubeR, 5, 14, 0, 0, p) : P.torus(r, tubeR, 5, 14, 0, p, 0, Math.PI / 2, 0, 0)));

// ============================================================================
// PROCEDURAL CANVAS TEXTURE HELPERS (Dynamic LCDs & Handwriting)
// ============================================================================

function createDynamicCanvas(width: number, height: number): ToolCanvas {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  // Headless Node mock
  const mockGradient = {
    addColorStop: () => {}
  };
  const headlessContext: ToolCanvasContext = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '10px sans-serif',
    lineWidth: 1,
    fillRect: () => {},
    clearRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    stroke: () => {},
    fill: () => {},
    fillText: () => {},
    arc: () => {},
    moveTo: () => {},
    lineTo: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    createRadialGradient: () => mockGradient,
    createLinearGradient: () => mockGradient,
    measureText: () => ({ width: 40 })
  };
  return Object.assign(new EventTarget(), {
    width,
    height,
    getContext: (_contextId: '2d'): ToolCanvasContext | null => headlessContext
  });
}

// ============================================================================
// 1. EMF 5 READER VIEWMODEL & WORLD MESH
// ============================================================================

export function createEmfReaderModel(_isViewmodel = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_EmfReader';

  // Body casing: yellow industrial wire-finder
  const bodyGeo = roundedBox(0.085, 0.16, 0.038, 0.009);
  const bodyMesh = new THREE.Mesh(bodyGeo, sharedMaterials.yellowPlastic);
  bodyMesh.position.set(0, 0, 0);
  root.add(bodyMesh);

  // Black rubber side grips
  const gripGeo = new THREE.BoxGeometry(0.09, 0.11, 0.039);
  const gripMesh = new THREE.Mesh(gripGeo, sharedMaterials.darkRubber);
  gripMesh.position.set(0, -0.015, 0);
  root.add(gripMesh);

  // Antenna sensor probe at top
  const antGeo = new THREE.CylinderGeometry(0.005, 0.007, 0.05, 8);
  const antMesh = new THREE.Mesh(antGeo, sharedMaterials.blackMetal);
  antMesh.position.set(0, 0.105, 0);
  root.add(antMesh);

  // Recessed dark faceplate for meter
  const faceGeo = new THREE.PlaneGeometry(0.068, 0.085);
  const faceMat = new THREE.MeshBasicMaterial({ color: 0x121418 });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.position.set(0, 0.02, 0.0195);
  root.add(faceMesh);

  // 5 LED indicator diodes: Green, Green, Yellow, Orange, Red
  const ledConfigs = [
    { col: 0x22ff44, off: 0x0a3311, label: '1' },
    { col: 0x22ff44, off: 0x0a3311, label: '2' },
    { col: 0xffee22, off: 0x333008, label: '3' },
    { col: 0xff8811, off: 0x331c05, label: '4' },
    { col: 0xff1122, off: 0x380508, label: '5' }
  ];

  const ledMeshes: Array<{ mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>; config: { col: number; off: number; label: string } }> = [];
  const ledSpacing = 0.012;
  const startX = -((ledConfigs.length - 1) * ledSpacing) / 2;

  ledConfigs.forEach((cfg, idx) => {
    const ledGeo = new THREE.BoxGeometry(0.008, 0.012, 0.005);
    const ledMat = new THREE.MeshStandardMaterial({
      color: cfg.off,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      roughness: 0.3
    });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(startX + idx * ledSpacing, 0.045, 0.021);
    root.add(ledMesh);
    ledMeshes.push({ mesh: ledMesh, config: cfg });
  });

  // Power button
  const btnGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.005, 8);
  btnGeo.rotateX(Math.PI / 2);
  const btnMesh = new THREE.Mesh(btnGeo, sharedMaterials.darkRubber);
  btnMesh.position.set(0, -0.045, 0.02);
  root.add(btnMesh);

  // Moulded detail: face screws, speaker slots, antenna collar and tip, scale ticks, strap loop, belt clip, battery cover
  const emfScrews = [];
  for (const sx of [-0.034, 0.034]) for (const sy of [0.066, -0.06]) emfScrews.push(P.cyl(0.0035, 0.0035, 0.003, 6, sx, sy, 0.0205, Math.PI / 2, 0, 0));
  const emfDark = [P.cyl(0.011, 0.011, 0.012, 10, 0, 0.083, 0), P.sphere(0.006, 1, 1, 1, 0, 0.133, 0, 8), P.box(0.07, 0.003, 0.003, 0, 0.065, 0.021)];
  for (let i = 0; i < 6; i++) emfDark.push(P.box(0.044, 0.0025, 0.002, 0, -0.058 - i * 0.0055 + 0.012, 0.0205));
  for (let i = 0; i < 5; i++) emfDark.push(P.box(0.0015, 0.007 + i * 0.002, 0.002, -0.024 + i * 0.012, 0.0595, 0.0212));
  emfDark.push(P.box(0.05, 0.02, 0.004, 0, -0.07, -0.0195), P.torus(0.012, 0.0025, 4, 10, 0.034, 0.07, -0.002, 0, Math.PI / 2, 0));
  addDetail(root, [[sharedMaterials.chromeMetal, emfScrews], [sharedMaterials.blackMetal, emfDark]]);

  // State Controller Interface
  let currentLevel = 1;
  let isPoweredOn = true;
  let flashTimer = 0.0;
  let flashState = false;

  function updateLeds() {
    ledMeshes.forEach((item, index) => {
      const active = isPoweredOn && (index + 1 <= currentLevel);
      if (active) {
        if (currentLevel === 5 && index === 4 && !flashState) {
          // Flashing level 5 alarm
          item.mesh.material.color.setHex(item.config.off);
          item.mesh.material.emissive.setHex(0x000000);
          item.mesh.material.emissiveIntensity = 0.0;
        } else {
          item.mesh.material.color.setHex(item.config.col);
          item.mesh.material.emissive.setHex(item.config.col);
          item.mesh.material.emissiveIntensity = 2.4;
        }
      } else {
        item.mesh.material.color.setHex(item.config.off);
        item.mesh.material.emissive.setHex(0x000000);
        item.mesh.material.emissiveIntensity = 0.0;
      }
    });
  }

  updateLeds();

  root.userData = {
    type: TOOL_TYPES.EMF_READER,
    nameHu: 'EMF 5 Mérőműszer',
    isTool: true,
    getLevel: () => currentLevel,
    setLevel: (lvl) => {
      currentLevel = Math.max(1, Math.min(5, Math.round(lvl || 1)));
      updateLeds();
    },
    togglePower: () => {
      isPoweredOn = !isPoweredOn;
      updateLeds();
      return isPoweredOn;
    },
    isPowered: () => isPoweredOn,
    getClickFrequency: () => {
      if (!isPoweredOn) return 0;
      // Formula: f = 2.0 * Level^2 Hz (Point 75)
      return 2.0 * Math.pow(currentLevel, 2);
    },
    update: (delta) => {
      if (currentLevel === 5 && isPoweredOn) {
        flashTimer += delta;
        if (flashTimer >= 0.12) {
          flashTimer = 0;
          flashState = !flashState;
          updateLeds();
        }
      }
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 2. SPIRIT BOX VIEWMODEL & WORLD MESH
// ============================================================================

export function createSpiritBoxModel(_isViewmodel = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_SpiritBox';

  // Heavy radio casing: scratched olive drab / dark grey
  const boxGeo = roundedBox(0.11, 0.15, 0.05, 0.011);
  const boxMesh = new THREE.Mesh(boxGeo, sharedMaterials.oliveMetal);
  root.add(boxMesh);

  // Chrome extending telescopic antenna
  const antGeo = new THREE.CylinderGeometry(0.003, 0.004, 0.22, 8);
  const antMesh = new THREE.Mesh(antGeo, sharedMaterials.chromeMetal);
  antMesh.position.set(0.045, 0.17, -0.015);
  root.add(antMesh);

  // Perforated speaker grille (circular slots)
  const grilleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.004, 16);
  grilleGeo.rotateX(Math.PI / 2);
  const grilleMesh = new THREE.Mesh(grilleGeo, sharedMaterials.darkRubber);
  grilleMesh.position.set(0, -0.025, 0.026);
  root.add(grilleMesh);

  // Rotary tuning dial
  const dialGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12);
  dialGeo.rotateX(Math.PI / 2);
  const dialMesh = new THREE.Mesh(dialGeo, sharedMaterials.blackMetal);
  dialMesh.position.set(0.035, -0.045, 0.027);
  root.add(dialMesh);

  // Backlit LCD Display for frequency sweeping
  const canvas = createDynamicCanvas(256, 128);
  const ctx = canvas.getContext('2d');
  let texture: THREE.CanvasTexture | null = null;
  if (typeof THREE.CanvasTexture !== 'undefined') {
    texture = new THREE.CanvasTexture(canvas);
  }

  const screenGeo = new THREE.PlaneGeometry(0.07, 0.035);
  const screenMat = new THREE.MeshBasicMaterial({ map: texture, color: 0x88ffaa });
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.set(0, 0.042, 0.026);
  root.add(screenMesh);

  // Radio detail: grille rings, ridged knobs, push buttons, antenna collar and bead, carry handle, screws
  const sbChrome = [P.torus(0.012, 0.0016, 4, 14, 0, -0.025, 0.028), P.torus(0.022, 0.0016, 4, 18, 0, -0.025, 0.028), P.torus(0.032, 0.0018, 4, 20, 0, -0.025, 0.028),
    P.cyl(0.006, 0.006, 0.012, 8, 0.045, 0.078, -0.015), P.sphere(0.0045, 1, 1, 1, 0.045, 0.283, -0.015, 8)];
  for (const sx of [-0.047, 0.047]) for (const sy of [0.066, -0.066]) sbChrome.push(P.cyl(0.0035, 0.0035, 0.003, 6, sx, sy, 0.0255, Math.PI / 2, 0, 0));
  const sbDark = [P.cyl(0.011, 0.011, 0.01, 12, -0.035, -0.045, 0.028, Math.PI / 2, 0, 0), P.box(0.003, 0.012, 0.004, -0.035, -0.045, 0.034),
    P.torus(0.03, 0.004, 5, 10, -0.02, 0.078, 0, 0, 0, 0)];
  for (let i = 0; i < 4; i++) sbDark.push(P.rbox(0.014, 0.008, 0.006, 0.002, -0.036 + i * 0.024, 0.0, 0.027));
  for (let i = 0; i < 10; i++) sbDark.push(P.box(0.002, 0.004, 0.003, 0.035 + Math.cos(i / 10 * Math.PI * 2) * 0.0125, -0.045 + Math.sin(i / 10 * Math.PI * 2) * 0.0125, 0.033, 0, 0, i / 10 * Math.PI * 2));
  for (let i = 0; i < 5; i++) sbDark.push(P.box(0.0025, 0.004, 0.0015, -0.045 + i * 0.0035, 0.07, 0.0262)); // signal bars
  addDetail(root, [[sharedMaterials.chromeMetal, sbChrome], [sharedMaterials.darkRubber, sbDark]]);

  let isScanning = false;
  let frequency = 104.2;
  let sweepTimer = 0.0;
  let lastVoiceLine: string | null | undefined = null;
  let voiceDisplayTimer = 0.0;

  function renderScreen() {
    if (!ctx) return;
    ctx.fillStyle = '#06180c';
    ctx.fillRect(0, 0, 256, 128);

    ctx.fillStyle = isScanning ? '#22ff66' : '#55aa66';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`${frequency.toFixed(1)} FM`, 16, 52);

    ctx.font = '18px monospace';
    ctx.fillText(isScanning ? '[SCANNING...]' : '[READY]', 16, 85);

    if (lastVoiceLine && voiceDisplayTimer > 0) {
      ctx.fillStyle = '#ff3344';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`"${lastVoiceLine}"`, 16, 114);
    }

    if (texture) texture.needsUpdate = true;
  }

  renderScreen();

  root.userData = {
    type: TOOL_TYPES.SPIRIT_BOX,
    nameHu: 'Szellem Rádió',
    isTool: true,
    isScanning: () => isScanning,
    toggleScan: () => {
      isScanning = !isScanning;
      renderScreen();
      return isScanning;
    },
    triggerGhostVoice: (line) => {
      const selected = line || SPIRIT_BOX_VOICE_LINES[Math.floor(Math.random() * SPIRIT_BOX_VOICE_LINES.length)];
      lastVoiceLine = selected;
      voiceDisplayTimer = 3.5;
      renderScreen();
      return selected;
    },
    update: (delta) => {
      if (isScanning) {
        sweepTimer += delta;
        if (sweepTimer >= 0.08) {
          sweepTimer = 0;
          frequency += 0.3;
          if (frequency > 108.0) frequency = 88.0;
          renderScreen();
        }
      }
      if (voiceDisplayTimer > 0) {
        voiceDisplayTimer -= delta;
        if (voiceDisplayTimer <= 0) {
          lastVoiceLine = null;
          renderScreen();
        }
      }
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 3. UV FLASHLIGHT VIEWMODEL & WORLD MESH
// ============================================================================

export function createUvFlashlightModel(_isViewmodel = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_UvFlashlight';

  // Black knurled metal torch handle
  const handleGeo = new THREE.CylinderGeometry(0.019, 0.021, 0.17, 16);
  handleGeo.rotateX(Math.PI / 2);
  const handleMesh = new THREE.Mesh(handleGeo, sharedMaterials.blackMetal);
  root.add(handleMesh);

  // Purple anodized bezel ring (#5C138E)
  const bezelGeo = new THREE.CylinderGeometry(0.028, 0.022, 0.038, 16);
  bezelGeo.rotateX(Math.PI / 2);
  const purpleMat = new THREE.MeshStandardMaterial({
    color: 0x5c138e,
    roughness: 0.35,
    metalness: 0.75
  });
  const bezelMesh = new THREE.Mesh(bezelGeo, purpleMat);
  bezelMesh.position.set(0, 0, -0.09);
  root.add(bezelMesh);

  // Violet quartz front glass lens
  const lensGeo = new THREE.CircleGeometry(0.024, 16);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x8822ff });
  const lensMesh = new THREE.Mesh(lensGeo, lensMat);
  lensMesh.position.set(0, 0, -0.11);
  root.add(lensMesh);

  // Attached Ultraviolet SpotLight (#4A00E0, 28 deg, penumbra 0.4, 12m)
  const uvSpot = new THREE.SpotLight(0x4a00e0, 2.4, 12.0, THREE.MathUtils.degToRad(28), 0.4, 2.0);
  uvSpot.position.set(0, 0, -0.115);
  uvSpot.castShadow = false;

  // Knurled grip rings, tail-cap switch, lanyard loop and a ring of LEDs behind the lens
  const uvDark = ringsAlong('z', 0.0215, 0.0018, [-0.06, -0.045, -0.03, -0.015, 0, 0.015, 0.03, 0.045, 0.06]);
  uvDark.push(P.cyl(0.021, 0.021, 0.015, 14, 0, 0, 0.09, Math.PI / 2, 0, 0), P.cyl(0.009, 0.009, 0.01, 8, 0, 0, 0.1, Math.PI / 2, 0, 0), P.torus(0.01, 0.0022, 4, 10, 0.012, 0.012, 0.1, 0, 0, 0));
  const uvLeds = [];
  for (let i = 0; i < 6; i++) uvLeds.push(P.cyl(0.0034, 0.0034, 0.003, 6, Math.cos(i / 6 * Math.PI * 2) * 0.016, Math.sin(i / 6 * Math.PI * 2) * 0.016, -0.1105, Math.PI / 2, 0, 0));
  addDetail(root, [[sharedMaterials.darkRubber, uvDark], [new THREE.MeshBasicMaterial({ color: 0xb066ff }), uvLeds]]);

  const targetObj = new THREE.Object3D();
  targetObj.position.set(0, 0, -5.0);
  root.add(targetObj);
  uvSpot.target = targetObj;
  root.add(uvSpot);

  // Soft purple lens glow point light
  const glowLight = new THREE.PointLight(0x7700ff, 0.6, 0.8);
  glowLight.position.set(0, 0, -0.12);
  root.add(glowLight);

  let isActive = true;

  function setLightState(state: boolean): void {
    isActive = state;
    uvSpot.visible = isActive;
    glowLight.visible = isActive;
    lensMat.color.setHex(isActive ? 0x8822ff : 0x220544);
  }

  setLightState(true);

  root.userData = {
    type: TOOL_TYPES.UV_LIGHT,
    nameHu: 'UV Zseblámpa',
    isTool: true,
    light: uvSpot,
    toggle: () => {
      setLightState(!isActive);
      return isActive;
    },
    isOn: () => isActive,
    checkHandprintVisibility: (itemPos, itemNormal) => {
      if (!isActive) return false;
      const worldPos = new THREE.Vector3();
      root.getWorldPosition(worldPos);
      const dist = worldPos.distanceTo(itemPos);
      if (dist > 12.0) return false;
      // Check beam cone forward vector
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
      const toItem = itemPos.clone().sub(worldPos).normalize();
      const dot = forward.dot(toItem);
      return dot >= Math.cos(THREE.MathUtils.degToRad(14)); // Half angle
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 4. LASER THERMOMETER VIEWMODEL & WORLD MESH
// ============================================================================

export function createThermometerModel(_isViewmodel = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_Thermometer';

  // Yellow pistol grip body
  const bodyGeo = roundedBox(0.045, 0.12, 0.08, 0.011);
  const bodyMesh = new THREE.Mesh(bodyGeo, sharedMaterials.yellowPlastic);
  bodyMesh.position.set(0, 0, 0);
  root.add(bodyMesh);

  // Black rubber handle grip angled backwards
  const gripGeo = new THREE.BoxGeometry(0.038, 0.10, 0.045);
  const gripMesh = new THREE.Mesh(gripGeo, sharedMaterials.darkRubber);
  gripMesh.position.set(0, -0.08, 0.02);
  gripMesh.rotation.x = -0.15;
  root.add(gripMesh);

  // Infrared sensor barrel
  const barrelGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.045, 12);
  barrelGeo.rotateX(Math.PI / 2);
  const barrelMesh = new THREE.Mesh(barrelGeo, sharedMaterials.blackMetal);
  barrelMesh.position.set(0, 0.035, -0.055);
  root.add(barrelMesh);

  // Red pinpoint laser diode emitter
  const laserDiode = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.01, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0022 })
  );
  laserDiode.rotation.x = Math.PI / 2;
  laserDiode.position.set(0, 0.015, -0.065);
  root.add(laserDiode);

  // Trigger with guard, barrel ribs, reticle ring, buttons, hand strap loop
  addDetail(root, [
    [sharedMaterials.darkRubber, [P.rbox(0.012, 0.032, 0.014, 0.003, 0, -0.036, -0.022, 0.2, 0, 0), P.torus(0.016, 0.0025, 4, 12, 0, -0.04, -0.012, 0, Math.PI / 2, 0),
      P.rbox(0.012, 0.008, 0.01, 0.002, -0.01, -0.0, 0.042), P.rbox(0.012, 0.008, 0.01, 0.002, 0.01, 0.0, 0.042), P.torus(0.014, 0.003, 4, 10, 0, -0.132, 0.03, Math.PI / 2, 0, 0)]],
    [sharedMaterials.chromeMetal, [P.torus(0.017, 0.0016, 4, 14, 0, 0.035, -0.045), P.torus(0.017, 0.0016, 4, 14, 0, 0.035, -0.058), P.torus(0.012, 0.0016, 4, 12, 0, 0.035, -0.078), P.cyl(0.0035, 0.0035, 0.003, 6, 0.016, 0.05, 0.041, Math.PI / 2, 0, 0)]]
  ]);

  // Rear angled digital LCD screen
  const canvas = createDynamicCanvas(256, 128);
  const ctx = canvas.getContext('2d');
  let texture: THREE.CanvasTexture | null = null;
  if (typeof THREE.CanvasTexture !== 'undefined') {
    texture = new THREE.CanvasTexture(canvas);
  }

  const screenGeo = new THREE.PlaneGeometry(0.038, 0.035);
  const screenMat = new THREE.MeshBasicMaterial({ map: texture });
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.set(0, 0.03, 0.041);
  root.add(screenMesh);

  let currentTemp = 16.5;
  let isFreezing = false;

  function renderLcd() {
    if (!ctx) return;
    ctx.fillStyle = '#0a1a24';
    ctx.fillRect(0, 0, 256, 128);

    const tempStr = `${currentTemp > 0 ? '+' : ''}${currentTemp.toFixed(1)}°C`;
    ctx.fillStyle = isFreezing ? '#44ddff' : '#66ff88';
    ctx.font = 'bold 50px monospace';
    ctx.fillText(tempStr, 12, 65);

    ctx.font = '22px monospace';
    if (isFreezing) {
      ctx.fillStyle = '#00e1ff';
      ctx.fillText('[FAGYPONT ALATT]', 12, 105);
    } else {
      ctx.fillStyle = '#88aa99';
      ctx.fillText('AMB. TEMP', 12, 105);
    }

    if (texture) texture.needsUpdate = true;
  }

  renderLcd();

  root.userData = {
    type: TOOL_TYPES.THERMOMETER,
    nameHu: 'Lézeres Hőmérő',
    isTool: true,
    getTemperature: () => currentTemp,
    isFreezing: () => isFreezing,
    setReading: (temp) => {
      currentTemp = Number(Number(temp || 0).toFixed(1));
      isFreezing = currentTemp < 0.0;
      renderLcd();
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 5. VIDEO CAMERA & SURVEYOR TRIPOD VIEWMODEL & WORLD MESH
// ============================================================================

export function createVideoCameraModel(isTripodMounted = false): THREE.Group {
  const root = new THREE.Group();
  root.name = isTripodMounted ? 'Tool_VideoCamera_Tripod' : 'Tool_VideoCamera_Handheld';

  const cameraGroup = new THREE.Group();

  // Camcorder main body
  const bodyGeo = roundedBox(0.065, 0.075, 0.14, 0.01);
  const bodyMesh = new THREE.Mesh(bodyGeo, sharedMaterials.blackMetal);
  cameraGroup.add(bodyMesh);

  // Optical front lens
  const lensGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.035, 16);
  lensGeo.rotateX(Math.PI / 2);
  const lensMesh = new THREE.Mesh(lensGeo, sharedMaterials.chromeMetal);
  lensMesh.position.set(0, 0, -0.085);
  cameraGroup.add(lensMesh);

  // Red recording tally LED
  const recLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.004, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff1111 })
  );
  recLed.position.set(-0.022, 0.028, -0.072);
  cameraGroup.add(recLed);

  // Camcorder detail: lens hood and glass, focus rings, top handle, mic windscreen, eyecup, battery, strap
  addDetail(cameraGroup, [
    [sharedMaterials.blackMetal, [
      P.cyl(0.032, 0.03, 0.03, 16, 0, 0, -0.112, Math.PI / 2, 0, 0), P.torus(0.027, 0.003, 5, 16, 0, 0, -0.07), P.torus(0.028, 0.003, 5, 16, 0, 0, -0.06),
      P.cyl(0.004, 0.004, 0.14, 6, -0.018, 0.058, 0.0, Math.PI / 2, 0, 0), P.cyl(0.004, 0.004, 0.14, 6, 0.018, 0.058, 0.0, Math.PI / 2, 0, 0),
      P.rbox(0.05, 0.03, 0.05, 0.008, 0, 0.012, 0.095), P.cyl(0.018, 0.02, 0.025, 12, 0, 0.012, 0.125, Math.PI / 2, 0, 0)
    ]],
    [sharedMaterials.darkRubber, [P.cyl(0.011, 0.011, 0.07, 10, 0, 0.052, -0.035, Math.PI / 2, 0, 0), P.rbox(0.012, 0.05, 0.06, 0.004, 0.034, -0.002, 0.01), P.torus(0.014, 0.0025, 4, 10, 0.036, 0.0, 0.03, 0, Math.PI / 2, 0)]],
    [new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.05, metalness: 0.2 }), [P.cyl(0.021, 0.021, 0.004, 16, 0, 0, -0.1285, Math.PI / 2, 0, 0)]]
  ]);

  // Flip-out side LCD monitor (rotated 85 degrees outward)
  const lcdArm = new THREE.Group();
  lcdArm.position.set(-0.033, 0, -0.01);
  lcdArm.rotation.y = THREE.MathUtils.degToRad(-85);

  const lcdFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.055, 0.008),
    sharedMaterials.darkRubber
  );
  lcdFrame.position.set(-0.04, 0, 0);
  lcdArm.add(lcdFrame);

  // Dynamic LCD night vision display
  const canvas = createDynamicCanvas(256, 180);
  const ctx = canvas.getContext('2d');
  let texture: THREE.CanvasTexture | null = null;
  if (typeof THREE.CanvasTexture !== 'undefined') {
    texture = new THREE.CanvasTexture(canvas);
  }

  const lcdScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.074, 0.048),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  lcdScreen.position.set(-0.04, 0, 0.0045);
  lcdArm.add(lcdScreen);
  cameraGroup.add(lcdArm);

  let nightVision = true;
  const orbParticles: Array<{ x: number; y: number; vx: number; vy: number; size: number }> = [];

  function renderLcd() {
    if (!ctx) return;
    // Green IR night vision phosphor background
    ctx.fillStyle = nightVision ? '#0d2613' : '#141416';
    ctx.fillRect(0, 0, 256, 180);

    // Scanlines
    ctx.fillStyle = nightVision ? 'rgba(0, 255, 60, 0.08)' : 'rgba(255, 255, 255, 0.05)';
    for (let y = 0; y < 180; y += 4) {
      ctx.fillRect(0, y, 256, 1.5);
    }

    // Camcorder HUD OSD
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(20, 22, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.fillText('REC [00:14:52]', 34, 26);
    ctx.fillText(nightVision ? 'IR NIGHT VISION [ON]' : 'COLOR [STANDBY]', 20, 160);

    // If ghost orbs active, draw glowing drifting circles
    if (nightVision && orbParticles.length > 0) {
      orbParticles.forEach((orb) => {
        const rad = orb.size || 8;
        const grad = ctx.createRadialGradient(orb.x, orb.y, 1, orb.x, orb.y, rad);
        grad.addColorStop(0, 'rgba(220, 255, 230, 0.95)');
        grad.addColorStop(0.5, 'rgba(120, 255, 160, 0.5)');
        grad.addColorStop(1, 'rgba(0, 255, 100, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, rad, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (texture) texture.needsUpdate = true;
  }

  // Initialize 4 lazy drifting ghost orbs for demonstration
  for (let i = 0; i < 4; i++) {
    orbParticles.push({
      x: 60 + Math.random() * 140,
      y: 50 + Math.random() * 80,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 10,
      size: 7 + Math.random() * 6
    });
  }

  renderLcd();

  root.add(cameraGroup);

  // If tripod mounted, add yellow surveyor tripod legs
  if (isTripodMounted) {
    cameraGroup.position.set(0, 0.92, 0);

    const tripodMount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.04, 12),
      sharedMaterials.blackMetal
    );
    tripodMount.position.set(0, 0.88, 0);
    root.add(tripodMount);

    // 3 Telescopic yellow metal legs (#E5A912) with clamp rings, rubber feet, spreader and pan handle
    const legGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.92, 8);
    const tripodParts = [P.cyl(0.02, 0.02, 0.05, 10, 0, 0.84, 0), P.cyl(0.006, 0.006, 0.22, 6, 0.1, 0.9, 0.04, 0, 0, Math.PI / 2 - 0.4)];
    const feet = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(legGeo, sharedMaterials.yellowPlastic);
      leg.position.set(Math.sin(angle) * 0.16, 0.44, Math.cos(angle) * 0.16);
      leg.rotation.z = Math.sin(angle) * 0.22;
      leg.rotation.x = -Math.cos(angle) * 0.22;
      root.add(leg);
      tripodParts.push(P.cyl(0.016, 0.016, 0.04, 8, Math.sin(angle) * 0.19, 0.55, Math.cos(angle) * 0.19, -Math.cos(angle) * 0.22, 0, Math.sin(angle) * 0.22));
      tripodParts.push(tube([Math.sin(angle) * 0.17, 0.48, Math.cos(angle) * 0.17], [0, 0.4, 0], 0.004));
      feet.push(P.cyl(0.014, 0.011, 0.03, 8, Math.sin(angle) * 0.215, 0.015, Math.cos(angle) * 0.215));
    }
    addDetail(root, [[sharedMaterials.blackMetal, tripodParts], [sharedMaterials.darkRubber, feet]]);
  }

  root.userData = {
    type: TOOL_TYPES.VIDEO_CAMERA,
    nameHu: 'Éjjellátó Videókamera',
    isTool: true,
    isTripodMounted,
    isNightVision: () => nightVision,
    toggleNightVision: () => {
      nightVision = !nightVision;
      renderLcd();
      return nightVision;
    },
    update: (delta) => {
      if (nightVision && orbParticles.length > 0) {
        orbParticles.forEach((orb) => {
          orb.x += orb.vx * delta;
          orb.y += orb.vy * delta;
          if (orb.x < 30 || orb.x > 226) orb.vx *= -1;
          if (orb.y < 30 || orb.y > 150) orb.vy *= -1;
        });
        renderLcd();
      }
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 6. GHOST WRITING BOOK VIEWMODEL & WORLD MESH
// ============================================================================

export function createGhostWritingBookModel(hasWritingInitial = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_GhostWritingBook';

  // Spiral-bound notebook open flat
  const coverGeo = new THREE.BoxGeometry(0.22, 0.006, 0.16);
  const coverMesh = new THREE.Mesh(coverGeo, sharedMaterials.blackMetal);
  root.add(coverMesh);

  // Checkered grid paper texture (kockás füzet)
  const canvas = createDynamicCanvas(512, 384);
  const ctx = canvas.getContext('2d');
  let texture: THREE.CanvasTexture | null = null;
  if (typeof THREE.CanvasTexture !== 'undefined') {
    texture = new THREE.CanvasTexture(canvas);
  }

  let hasWriting = hasWritingInitial;
  let writtenText: string | null | undefined = hasWriting ? 'MEGDÖGLESZ' : null;

  function renderPages() {
    if (!ctx) return;
    // Cream paper base
    ctx.fillStyle = '#f8f6ee';
    ctx.fillRect(0, 0, 512, 384);

    // Hungarian blue square grid (kockás mintázat)
    ctx.strokeStyle = '#b8d0e8';
    ctx.lineWidth = 1;
    for (let x = 0; x < 512; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 384);
      ctx.stroke();
    }
    for (let y = 0; y < 384; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Spine margin lines
    ctx.strokeStyle = '#ff9999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 384);
    ctx.stroke();

    // Handwritten graffiti if ghost wrote
    if (hasWriting && writtenText) {
      ctx.fillStyle = '#8b0000'; // Dark crimson blood/ink
      ctx.font = 'bold 38px "Comic Sans MS", cursive, sans-serif';
      ctx.save();
      ctx.translate(280, 180);
      ctx.rotate(-0.12);
      ctx.fillText(writtenText, 0, 0);
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('TAKAGY INNEN!', 10, 45);
      ctx.restore();
    }

    if (texture) texture.needsUpdate = true;
  }

  renderPages();

  const paperGeo = new THREE.PlaneGeometry(0.21, 0.15);
  paperGeo.rotateX(-Math.PI / 2);
  const paperMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
    metalness: 0.05
  });
  const paperMesh = new THREE.Mesh(paperGeo, paperMat);
  paperMesh.position.set(0, 0.0035, 0);
  root.add(paperMesh);

  // Metal spiral wire coil down center
  const coilGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.155, 8);
  const coilMesh = new THREE.Mesh(coilGeo, sharedMaterials.chromeMetal);
  coilMesh.position.set(0, 0.007, 0);
  root.add(coilMesh);

  // Pencil resting alongside notebook
  const pencilGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.14, 6);
  pencilGeo.rotateX(Math.PI / 2);
  const pencilMesh = new THREE.Mesh(pencilGeo, sharedMaterials.yellowPlastic);
  pencilMesh.position.set(0.12, 0.006, 0);
  root.add(pencilMesh);

  root.userData = {
    type: TOOL_TYPES.GHOST_WRITING_BOOK,
    nameHu: 'Kockás Nyomozó Füzet',
    isTool: true,
    isPlaceable: true,
    hasWriting: () => hasWriting,
    getWritingText: () => writtenText,
    triggerWriting: (customText) => {
      hasWriting = true;
      writtenText = customText || GHOST_WRITING_SCRIBBLES[Math.floor(Math.random() * GHOST_WRITING_SCRIBBLES.length)];
      renderPages();
      return writtenText;
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 7. D.O.T.S. PROJECTOR VIEWMODEL & WORLD MESH
// ============================================================================

export function createDotsProjectorModel(_isViewmodel = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_DotsProjector';

  // Instantiate complete high-fidelity DotsLaserMatrix shader system
  const dotsMatrix = new DotsLaserMatrix({
    pointCountX: 12,
    pointCountY: 12,
    range: 7.0,
    color: 0x00ff44,
    enabled: true
  });
  root.add(dotsMatrix.group);

  root.userData = {
    type: TOOL_TYPES.DOTS_PROJECTOR,
    nameHu: 'D.O.T.S. Projektor',
    isTool: true,
    isPlaceable: true,
    matrix: dotsMatrix,
    toggle: () => {
      const next = !dotsMatrix.enabled;
      dotsMatrix.setEnabled(next);
      return next;
    },
    update: (delta, ghostPos) => {
      dotsMatrix.update(delta, ghostPos);
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 8. PHOTO CAMERA VIEWMODEL & WORLD MESH
// ============================================================================

export function createPhotoCameraModel(_isViewmodel = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_PhotoCamera';

  // Vintage 35mm rangefinder camera body: chrome top and textured black body
  const bodyGeo = roundedBox(0.12, 0.075, 0.04, 0.006);
  const bodyMesh = new THREE.Mesh(bodyGeo, sharedMaterials.darkRubber);
  root.add(bodyMesh);

  // Chrome top plate
  const topGeo = roundedBox(0.122, 0.02, 0.042, 0.005);
  const topMesh = new THREE.Mesh(topGeo, sharedMaterials.chromeMetal);
  topMesh.position.set(0, 0.045, 0);
  root.add(topMesh);

  // Front cylindrical shutter lens barrel with glass reflections
  const lensGeo = new THREE.CylinderGeometry(0.028, 0.03, 0.035, 16);
  lensGeo.rotateX(Math.PI / 2);
  const lensMesh = new THREE.Mesh(lensGeo, sharedMaterials.blackMetal);
  lensMesh.position.set(0, 0.005, -0.035);
  root.add(lensMesh);

  const glassGeo = new THREE.CircleGeometry(0.025, 16);
  const glassMesh = new THREE.Mesh(glassGeo, sharedMaterials.glassClear);
  glassMesh.position.set(0, 0.005, -0.053);
  root.add(glassMesh);

  // Flash cube / bulb with silver parabolic reflector
  const flashGeo = new THREE.CylinderGeometry(0.016, 0.012, 0.018, 12);
  flashGeo.rotateX(Math.PI / 2);
  const flashMesh = new THREE.Mesh(flashGeo, sharedMaterials.chromeMetal);
  flashMesh.position.set(-0.038, 0.035, -0.025);
  root.add(flashMesh);

  // Shutter release button
  const btnGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.008, 8);
  const btnMesh = new THREE.Mesh(btnGeo, sharedMaterials.chromeMetal);
  btnMesh.position.set(0.038, 0.06, 0);
  root.add(btnMesh);

  // Rangefinder windows, lens rings, film wind lever, rewind knob, shutter dial, strap lugs, leatherette
  addDetail(root, [
    [sharedMaterials.chromeMetal, [
      P.torus(0.029, 0.0022, 4, 18, 0, 0.005, -0.046), P.torus(0.031, 0.002, 4, 18, 0, 0.005, -0.03), P.cyl(0.011, 0.011, 0.012, 12, -0.048, 0.062, 0.0), P.cyl(0.013, 0.013, 0.008, 12, 0.038, 0.058, 0.0),
      P.box(0.032, 0.003, 0.003, 0.05, 0.062, 0.012, 0, 0.4, 0), P.sphere(0.004, 1, 1, 1, 0.066, 0.062, 0.02, 6), P.torus(0.006, 0.0014, 4, 8, -0.064, 0.02, 0.0, 0, Math.PI / 2, 0), P.torus(0.006, 0.0014, 4, 8, 0.064, 0.02, 0.0, 0, Math.PI / 2, 0)
    ]],
    [sharedMaterials.blackMetal, [P.rbox(0.014, 0.012, 0.004, 0.002, 0.02, 0.032, -0.021), P.rbox(0.014, 0.012, 0.004, 0.002, 0.04, 0.032, -0.021), P.cyl(0.014, 0.014, 0.004, 10, 0.0, -0.039, 0.0)]]
  ]);

  // White point light for momentary flash illumination
  const flashLight = new THREE.PointLight(0xffffff, 0, 15.0);
  flashLight.position.set(-0.038, 0.035, -0.15);
  root.add(flashLight);

  let photosLeft = 5;
  const album: PhotoRecord[] = [];
  let flashFadeTimer = 0.0;

  root.userData = {
    type: TOOL_TYPES.PHOTO_CAMERA,
    nameHu: 'Fényképezőgép',
    isTool: true,
    getPhotosLeft: () => photosLeft,
    getAlbum: () => album,
    snapPhoto: (evaluatedTarget) => {
      if (photosLeft <= 0) return null;
      photosLeft--;

      // Trigger intense white flash
      flashLight.intensity = 8.0;
      flashFadeTimer = 0.15; // 150ms full flash fade

      const photoRecord: PhotoRecord = {
        id: `photo_${Date.now()}_${album.length + 1}`,
        timestamp: new Date().toLocaleTimeString('hu-HU'),
        target: evaluatedTarget || PHOTO_BOUNTIES.GHOST_3_STAR,
        stars: evaluatedTarget?.stars || 3,
        rewardFt: evaluatedTarget?.rewardFt || 1000,
        labelHu: evaluatedTarget?.labelHu || 'Szellem Fénykép (3 Csillag)'
      };

      album.push(photoRecord);
      return photoRecord;
    },
    update: (delta) => {
      if (flashFadeTimer > 0) {
        flashFadeTimer -= delta;
        if (flashFadeTimer <= 0) {
          flashLight.intensity = 0;
        } else {
          flashLight.intensity = (flashFadeTimer / 0.15) * 8.0;
        }
      }
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 9. MOBILE JESUS (SURVIVAL ITEM - Point 83-84)
// ============================================================================

export function createMobileJesusModel(chargesRemaining = 2): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_MobileJesus';

  let charges = Math.max(0, Math.min(2, chargesRemaining));
  let isCharred = charges <= 1;
  let isBroken = charges <= 0;

  // 1. Suction cup pedestal base
  const cupGeo = new THREE.CylinderGeometry(0.038, 0.045, 0.02, 16);
  const cupMesh = new THREE.Mesh(cupGeo, isCharred ? sharedMaterials.charredJesus : sharedMaterials.pureGold);
  cupMesh.position.set(0, 0.01, 0);
  root.add(cupMesh);

  // Crucifix container
  const crossGroup = new THREE.Group();
  crossGroup.name = 'Jesus_Cross_Body';

  if (!isBroken) {
    // Upright cross vertical beam
    const vertGeo = new THREE.BoxGeometry(0.024, 0.22, 0.015);
    const vertMesh = new THREE.Mesh(vertGeo, isCharred ? sharedMaterials.charredJesus : sharedMaterials.pureGold);
    vertMesh.position.set(0, 0.12, 0);
    crossGroup.add(vertMesh);

    // Horizontal cross beam
    const horizGeo = new THREE.BoxGeometry(0.14, 0.022, 0.015);
    const horizMesh = new THREE.Mesh(horizGeo, isCharred ? sharedMaterials.charredJesus : sharedMaterials.pureGold);
    horizMesh.position.set(0, 0.165, 0);
    crossGroup.add(horizMesh);

    // Detailed Jesus figure with outstretched arms and halo
    const torsoGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.08, 8);
    const jesusMat = isCharred ? sharedMaterials.charredJesus : sharedMaterials.pureGold;
    const torso = new THREE.Mesh(torsoGeo, jesusMat);
    torso.position.set(0, 0.15, 0.012);
    crossGroup.add(torso);

    const headGeo = new THREE.SphereGeometry(0.011, 8, 8);
    const head = new THREE.Mesh(headGeo, jesusMat);
    head.position.set(0, 0.198, 0.014);
    crossGroup.add(head);

    // Arms outstretched
    const armsGeo = new THREE.BoxGeometry(0.12, 0.009, 0.009);
    const arms = new THREE.Mesh(armsGeo, jesusMat);
    arms.position.set(0, 0.178, 0.012);
    crossGroup.add(arms);

    // Suction cup rosary beads
    const ringGeo = new THREE.TorusGeometry(0.018, 0.003, 6, 16);
    const ring = new THREE.Mesh(ringGeo, jesusMat);
    ring.position.set(0, 0.205, 0.012);
    crossGroup.add(ring);

    // Figure detail: shoulders, hands, legs, loincloth, nimbus, finials, INRI plaque, cup rim
    const figure = mergeParts([
      P.sphere(0.011, 1.4, 0.8, 0.8, 0, 0.18, 0.013, 8), P.sphere(0.005, 1, 1, 1, -0.057, 0.178, 0.012, 6), P.sphere(0.005, 1, 1, 1, 0.057, 0.178, 0.012, 6),
      P.cyl(0.004, 0.003, 0.05, 6, -0.004, 0.092, 0.012), P.cyl(0.004, 0.003, 0.05, 6, 0.004, 0.092, 0.012),
      P.cyl(0.006, 0.014, 0.025, 8, 0, 0.115, 0.012), P.box(0.014, 0.004, 0.006, 0, 0.234, 0.0), P.cyl(0.011, 0.011, 0.002, 10, 0, 0.198, 0.011, Math.PI / 2, 0, 0),
      P.box(0.01, 0.01, 0.017, 0, 0.234 - 0.002, 0.0), P.box(0.01, 0.01, 0.017, -0.07, 0.165, 0.0), P.box(0.01, 0.01, 0.017, 0.07, 0.165, 0.0), P.box(0.014, 0.012, 0.017, 0, 0.012, 0.0),
      P.torus(0.04, 0.004, 5, 18, 0, 0.022, 0, Math.PI / 2, 0, 0)
    ]);
    crossGroup.add(new THREE.Mesh(figure, jesusMat));
  } else {
    // Snapped broken ash pile model
    const ashGeo = new THREE.ConeGeometry(0.06, 0.025, 12);
    const ashMesh = new THREE.Mesh(ashGeo, sharedMaterials.ashMound);
    ashMesh.position.set(0, 0.012, 0);
    crossGroup.add(ashMesh);

    const brokenStick = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.08, 0.012),
      sharedMaterials.ashMound
    );
    brokenStick.rotation.set(Math.PI / 2.2, 0.3, 0.4);
    brokenStick.position.set(0.02, 0.015, 0);
    crossGroup.add(brokenStick);
  }

  root.add(crossGroup);

  // Animated Holy Flame Particle Emitter (for charge consumption / burn effect)
  const flameCount = 45;
  const flameGeo = new THREE.BufferGeometry();
  const flamePositions = new Float32Array(flameCount * 3);
  for (let i = 0; i < flameCount * 3; i += 3) {
    flamePositions[i] = (Math.random() - 0.5) * 0.06;
    flamePositions[i + 1] = 0.08 + Math.random() * 0.16;
    flamePositions[i + 2] = (Math.random() - 0.5) * 0.06;
  }
  flameGeo.setAttribute('position', new THREE.BufferAttribute(flamePositions, 3));

  const flameMat = new THREE.PointsMaterial({
    color: 0xff6600,
    size: 0.03,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending
  });
  const flamePoints = new THREE.Points(flameGeo, flameMat);
  root.add(flamePoints);

  let burnEffectTimer = 0.0;

  function updateVisualState() {
    isCharred = charges <= 1;
    isBroken = charges <= 0;
  }

  root.userData = {
    type: TOOL_TYPES.MOBILE_JESUS,
    nameHu: 'Mobil Jézus',
    isTool: true,
    isPlaceable: true,
    defensiveRadius: 4.0, // 4.0 meters defense aura (Point 83-84)
    getCharges: () => charges,
    isCharred: () => isCharred,
    isBroken: () => isBroken,
    burnCharge: () => {
      if (charges <= 0) return { blocked: false, chargesRemaining: 0 };
      charges--;
      updateVisualState();
      burnEffectTimer = 2.0; // 2.0s violent flame burst
      flameMat.opacity = 1.0;
      return { blocked: true, chargesRemaining: charges };
    },
    update: (delta) => {
      if (burnEffectTimer > 0) {
        burnEffectTimer -= delta;
        flameMat.opacity = Math.max(0, burnEffectTimer / 2.0);
        // Animate flame jitter
        const flameAttr = flameGeo.getAttribute('position');
        const pos = flameAttr.array;
        for (let i = 0; i < flameCount * 3; i += 3) {
          pos[i + 1] = (pos[i + 1] ?? 0) + delta * 0.25;
          if ((pos[i + 1] ?? 0) > 0.3) pos[i + 1] = 0.08;
        }
        flameAttr.needsUpdate = true;
      }
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 10. SMUDGE STICKS & LIGHTER (SURVIVAL ITEM - Point 85)
// ============================================================================

export function createSmudgeSticksModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_SmudgeSticks';

  // Herb sticks bundle tied with criss-cross twine rope
  const sageGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.18, 10);
  sageGeo.rotateX(Math.PI / 2);
  const sageMesh = new THREE.Mesh(sageGeo, sharedMaterials.sageHerbs);
  root.add(sageMesh);

  // Twine rope bands (3 wraps)
  for (let i = -1; i <= 1; i++) {
    const bandGeo = new THREE.TorusGeometry(0.024, 0.003, 6, 12);
    const bandMesh = new THREE.Mesh(bandGeo, sharedMaterials.twineRope);
    bandMesh.position.set(0, 0, i * 0.05);
    root.add(bandMesh);
  }

  // Smoldering ember tip
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x330000,
    emissive: 0xff3300,
    emissiveIntensity: 1.2
  });
  const emberMesh = new THREE.Mesh(new THREE.CircleGeometry(0.021, 10), emberMat);
  emberMesh.position.set(0, 0, -0.091);
  root.add(emberMesh);

  // Red disposable lighter held alongside
  const lighterGroup = new THREE.Group();
  lighterGroup.position.set(0.038, -0.015, 0.02);
  const lighterBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.055, 0.025),
    sharedMaterials.redPlastic
  );
  lighterGroup.add(lighterBody);

  const flintWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.01, 8),
    sharedMaterials.chromeMetal
  );
  flintWheel.position.set(0, 0.032, 0);
  lighterGroup.add(flintWheel);
  root.add(lighterGroup);

  // Volumetric Smoke Particle Emitter (6.0 seconds duration)
  const smokeCount = 75;
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(smokeCount * 3);
  for (let i = 0; i < smokeCount * 3; i += 3) {
    smokePos[i] = (Math.random() - 0.5) * 0.1;
    smokePos[i + 1] = Math.random() * 0.3;
    smokePos[i + 2] = -0.09 - Math.random() * 0.2;
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));

  const smokeMat = new THREE.PointsMaterial({
    color: 0xeeeeee,
    size: 0.065,
    transparent: true,
    opacity: 0.0
  });
  const smokePoints = new THREE.Points(smokeGeo, smokeMat);
  root.add(smokePoints);

  let isLit = false;
  let burnTimer = 0.0; // 6.0 seconds

  root.userData = {
    type: TOOL_TYPES.SMUDGE_STICKS,
    nameHu: 'Füstölő Csomag',
    isTool: true,
    isLit: () => isLit,
    light: () => {
      if (isLit) return false;
      isLit = true;
      burnTimer = 6.0; // 6s duration
      smokeMat.opacity = 0.65;
      emberMat.emissiveIntensity = 3.5;
      return true;
    },
    update: (delta) => {
      if (isLit) {
        burnTimer -= delta;
        if (burnTimer <= 0) {
          isLit = false;
          smokeMat.opacity = 0.0;
          emberMat.emissiveIntensity = 0.2;
        } else {
          // Billow smoke upwards
          const smokeAttr = smokeGeo.getAttribute('position');
          const pos = smokeAttr.array;
          for (let i = 0; i < smokeCount * 3; i += 3) {
            pos[i + 1] = (pos[i + 1] ?? 0) + delta * 0.35;
            pos[i] = (pos[i] ?? 0) + (Math.random() - 0.5) * delta * 0.1;
            if ((pos[i + 1] ?? 0) > 0.7) {
              pos[i + 1] = 0.0;
              pos[i] = (Math.random() - 0.5) * 0.08;
              pos[i + 2] = -0.09;
            }
          }
          smokeAttr.needsUpdate = true;
        }
      }
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 11. SANITY FLASK (PÁLINKA - Point 86)
// ============================================================================

export function createSanityPalinkaModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_SanityPalinka';

  // Curved glass hip flask
  const flaskGeo = roundedBox(0.085, 0.13, 0.034, 0.014);
  const flaskMesh = new THREE.Mesh(flaskGeo, sharedMaterials.glassClear);
  root.add(flaskMesh);

  // Amber plum brandy liquid inside
  const liquidGeo = roundedBox(0.078, 0.09, 0.028, 0.012);
  const liquidMesh = new THREE.Mesh(liquidGeo, sharedMaterials.palinkaAmberLiquid);
  liquidMesh.position.set(0, -0.015, 0);
  root.add(liquidMesh);

  // Silver screw cap
  const capGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.018, 12);
  const capMesh = new THREE.Mesh(capGeo, sharedMaterials.chromeMetal);
  capMesh.position.set(0, 0.074, 0);
  root.add(capMesh);

  // Neck, knurled cap, retaining chain loop
  addDetail(root, [[sharedMaterials.chromeMetal, [P.cyl(0.011, 0.014, 0.012, 12, 0, 0.066, 0), P.torus(0.013, 0.0016, 4, 12, 0, 0.083, 0, Math.PI / 2, 0, 0), P.torus(0.013, 0.0016, 4, 12, 0, 0.065, 0, Math.PI / 2, 0, 0),
    P.torus(0.016, 0.0015, 4, 10, 0.012, 0.07, 0.0, 0, 0.8, 0)]]]);

  // Authentic Hungarian vintage paper label: "BORSODI HÁZI SZILVAPÁLINKA 52%"
  const canvas = createDynamicCanvas(256, 128);
  const ctx = canvas.getContext('2d');
  let texture: THREE.CanvasTexture | null = null;
  if (typeof THREE.CanvasTexture !== 'undefined') {
    texture = new THREE.CanvasTexture(canvas);
  }

  if (ctx) {
    ctx.fillStyle = '#f4e9cf';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#6b3e18';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 244, 116);

    ctx.fillStyle = '#6b3e18';
    ctx.font = 'bold 22px serif';
    ctx.fillText('BORSODI HÁZI', 45, 42);
    ctx.font = 'bold 24px serif';
    ctx.fillText('SZILVAPÁLINKA', 32, 74);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#aa2211';
    ctx.fillText('52% VOL.', 85, 105);
    if (texture) texture.needsUpdate = true;
  }

  const labelGeo = new THREE.PlaneGeometry(0.065, 0.065);
  const labelMat = new THREE.MeshBasicMaterial({ map: texture });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.set(0, -0.01, 0.0175);
  root.add(labelMesh);

  let isEmpty = false;

  root.userData = {
    type: TOOL_TYPES.SANITY_PALINKA,
    nameHu: 'Borsodi Szilvapálinka',
    isTool: true,
    isConsumable: true,
    isEmpty: () => isEmpty,
    drink: () => {
      if (isEmpty) return false;
      isEmpty = true;
      liquidMesh.visible = false;
      return true; // Restores +35% sanity
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 12. TIER 1 & TIER 2 FLASHLIGHTS (Point 87)
// ============================================================================

export function createFlashlightModel(tier = 1): THREE.Group {
  const root = new THREE.Group();
  root.name = `Tool_Flashlight_T${tier}`;

  let spotLight: THREE.SpotLight;
  let bulbGlow: THREE.PointLight;

  if (tier === 1) {
    // Tier 1: Standard industrial rubberized yellow/black torch (18m, 30 deg, 1.8 intensity)
    const bodyGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.18, 12);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, sharedMaterials.yellowPlastic);
    root.add(bodyMesh);

    const headGeo = new THREE.CylinderGeometry(0.038, 0.024, 0.05, 12);
    headGeo.rotateX(Math.PI / 2);
    const headMesh = new THREE.Mesh(headGeo, sharedMaterials.darkRubber);
    headMesh.position.set(0, 0, -0.10);
    root.add(headMesh);

    addDetail(root, [
      [sharedMaterials.darkRubber, [...ringsAlong('z', 0.0245, 0.0025, [-0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06]), P.cyl(0.024, 0.024, 0.012, 12, 0, 0, 0.096, Math.PI / 2, 0, 0), P.torus(0.012, 0.0025, 4, 10, 0.016, 0.012, 0.098, 0, 0, 0)]],
      [sharedMaterials.chromeMetal, [P.torus(0.037, 0.002, 4, 16, 0, 0, -0.128), P.cyl(0.007, 0.007, 0.01, 8, 0, 0.026, 0.02, 0, 0, 0)]],
      [sharedMaterials.glassClear, [P.cyl(0.033, 0.033, 0.003, 16, 0, 0, -0.127, Math.PI / 2, 0, 0)]]
    ]);

    spotLight = new THREE.SpotLight(0xffeaa7, 1.8, 18.0, THREE.MathUtils.degToRad(30), 0.35, 2.0);
    spotLight.position.set(0, 0, -0.125);

    bulbGlow = new THREE.PointLight(0xffeaa7, 0.8, 1.2);
    bulbGlow.position.set(0, 0, -0.125);
  } else {
    // Tier 2: High-lumen tactical LED cold-white torch (32m, 45 deg, 3.5 intensity)
    const bodyGeo = new THREE.CylinderGeometry(0.02, 0.022, 0.22, 16);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, sharedMaterials.blackMetal);
    root.add(bodyMesh);

    const headGeo = new THREE.CylinderGeometry(0.042, 0.025, 0.065, 16);
    headGeo.rotateX(Math.PI / 2);
    const headMesh = new THREE.Mesh(headGeo, sharedMaterials.chromeMetal);
    headMesh.position.set(0, 0, -0.12);
    root.add(headMesh);

    const tacDark = ringsAlong('z', 0.0215, 0.0016, [-0.08, -0.065, -0.05, -0.035, -0.02, -0.005, 0.01, 0.025, 0.04, 0.055, 0.07, 0.085]);
    tacDark.push(P.cyl(0.0215, 0.0215, 0.012, 12, 0, 0, 0.115, Math.PI / 2, 0, 0), P.cyl(0.008, 0.008, 0.01, 8, 0, 0.0, 0.124, Math.PI / 2, 0, 0), P.rbox(0.014, 0.01, 0.024, 0.002, 0, 0.024, -0.03));
    for (let i = 0; i < 8; i++) tacDark.push(P.box(0.01, 0.014, 0.012, Math.cos(i / 8 * Math.PI * 2) * 0.042, Math.sin(i / 8 * Math.PI * 2) * 0.042, -0.15, 0, 0, i / 8 * Math.PI * 2));
    const tacChrome = [P.cyl(0.04, 0.04, 0.004, 16, 0, 0, -0.152, Math.PI / 2, 0, 0)];
    for (let i = 0; i < 5; i++) tacChrome.push(P.torus(0.04, 0.0025, 4, 16, 0, 0, -0.1 + i * 0.007));
    addDetail(root, [[sharedMaterials.blackMetal, tacDark], [sharedMaterials.chromeMetal, tacChrome], [sharedMaterials.glassClear, [P.cyl(0.036, 0.036, 0.003, 16, 0, 0, -0.154, Math.PI / 2, 0, 0)]]]);

    spotLight = new THREE.SpotLight(0xe8f4fd, 3.5, 32.0, THREE.MathUtils.degToRad(45), 0.2, 2.0);
    spotLight.position.set(0, 0, -0.15);

    bulbGlow = new THREE.PointLight(0xe8f4fd, 1.2, 1.8);
    bulbGlow.position.set(0, 0, -0.15);
  }

  const targetObj = new THREE.Object3D();
  targetObj.position.set(0, 0, -10.0);
  root.add(targetObj);
  spotLight.target = targetObj;

  root.add(spotLight);
  root.add(bulbGlow);

  let isOn = true;

  function setFlashlightState(active: boolean): void {
    isOn = active;
    spotLight.visible = isOn;
    bulbGlow.visible = isOn;
  }

  setFlashlightState(true);

  root.userData = {
    type: tier === 1 ? TOOL_TYPES.FLASHLIGHT_T1 : TOOL_TYPES.FLASHLIGHT_T2,
    tier,
    nameHu: tier === 1 ? 'Normál Zseblámpa' : 'Nagyfényű Taktikai LED',
    isTool: true,
    light: spotLight,
    isOn: () => isOn,
    toggle: () => {
      setFlashlightState(!isOn);
      return isOn;
    },
    flicker: (intensity) => {
      if (!isOn) return;
      spotLight.intensity = (tier === 1 ? 1.8 : 3.5) * (1.0 - intensity * (Math.random() > 0.5 ? 1.0 : 0.2));
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// 13. SALT SHAKER & SALT PILES (SURVIVAL ITEM - Point 88)
// ============================================================================

export function createSaltShakerModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Tool_SaltShaker';

  // Glass salt shaker cylinder
  const jarGeo = new THREE.CylinderGeometry(0.026, 0.028, 0.085, 12);
  const jarMesh = new THREE.Mesh(jarGeo, sharedMaterials.glassClear);
  root.add(jarMesh);

  // White salt grains inside jar
  const saltContent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.023, 0.025, 0.07, 12),
    sharedMaterials.saltWhiteGrains
  );
  saltContent.position.set(0, -0.005, 0);
  root.add(saltContent);

  // Chrome perforated lid
  const capGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.016, 12);
  const capMesh = new THREE.Mesh(capGeo, sharedMaterials.chromeMetal);
  capMesh.position.set(0, 0.05, 0);
  root.add(capMesh);

  let charges = 3;

  root.userData = {
    type: TOOL_TYPES.SALT_SHAKER,
    nameHu: 'Sószóró',
    isTool: true,
    isPlaceable: true,
    getCharges: () => charges,
    placeSalt: () => {
      if (charges <= 0) return false;
      charges--;
      return true;
    }
  } satisfies ToolUserData;

  return root;
}

export function createSaltPileModel(isSteppedOnInitial = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Placed_SaltPile';

  // Conical fresh salt mound
  const freshMoundGeo = new THREE.ConeGeometry(0.12, 0.035, 14);
  const freshMesh = new THREE.Mesh(freshMoundGeo, sharedMaterials.saltWhiteGrains);
  freshMesh.position.set(0, 0.0175, 0);
  root.add(freshMesh);

  // Disturbed flat footprint mesh (stepped on)
  const steppedGeo = new THREE.CylinderGeometry(0.14, 0.15, 0.008, 14);
  const steppedMesh = new THREE.Mesh(steppedGeo, sharedMaterials.saltDisturbedFootprint);
  steppedMesh.position.set(0, 0.004, 0);
  steppedMesh.visible = isSteppedOnInitial;
  root.add(steppedMesh);

  let isSteppedOn = isSteppedOnInitial;
  if (isSteppedOn) freshMesh.visible = false;

  root.userData = {
    type: TOOL_TYPES.SALT_PILE,
    nameHu: 'Sókupac',
    isSteppedOn: () => isSteppedOn,
    stepOn: () => {
      if (isSteppedOn) return false;
      isSteppedOn = true;
      freshMesh.visible = false;
      steppedMesh.visible = true;
      return true;
    }
  } satisfies ToolUserData;

  return root;
}

// ============================================================================
// MASTER FACTORY FUNCTIONS
// ============================================================================

export function createToolViewmodel(itemType: unknown, options: ToolModelOptions = {}): THREE.Group {
  const normalized = normalizeToolType(itemType);

  switch (normalized) {
    case TOOL_TYPES.EMF_READER:
      return createEmfReaderModel(true);
    case TOOL_TYPES.SPIRIT_BOX:
      return createSpiritBoxModel(true);
    case TOOL_TYPES.UV_LIGHT:
      return createUvFlashlightModel(true);
    case TOOL_TYPES.THERMOMETER:
      return createThermometerModel(true);
    case TOOL_TYPES.VIDEO_CAMERA:
      return createVideoCameraModel(false);
    case TOOL_TYPES.GHOST_WRITING_BOOK:
      return createGhostWritingBookModel(options.hasWriting || false);
    case TOOL_TYPES.DOTS_PROJECTOR:
      return createDotsProjectorModel(true);
    case TOOL_TYPES.PHOTO_CAMERA:
      return createPhotoCameraModel(true);
    case TOOL_TYPES.MOBILE_JESUS:
      return createMobileJesusModel(options.charges ?? 2);
    case TOOL_TYPES.SMUDGE_STICKS:
      return createSmudgeSticksModel();
    case TOOL_TYPES.SANITY_PALINKA:
      return createSanityPalinkaModel();
    case TOOL_TYPES.FLASHLIGHT_T1:
      return createFlashlightModel(1);
    case TOOL_TYPES.FLASHLIGHT_T2:
      return createFlashlightModel(2);
    case TOOL_TYPES.SALT_SHAKER:
      return createSaltShakerModel();
    case TOOL_TYPES.SALT_PILE:
      return createSaltPileModel(options.isSteppedOn || false);
    default:
      return createFlashlightModel(1);
  }
}

export function createToolWorldMesh(itemType: unknown, options: ToolModelOptions = {}): THREE.Group {
  const normalized = normalizeToolType(itemType);

  switch (normalized) {
    case TOOL_TYPES.VIDEO_CAMERA:
      return createVideoCameraModel(true); // Tripod mounted
    case TOOL_TYPES.SALT_PILE:
      return createSaltPileModel(options.isSteppedOn || false);
    case TOOL_TYPES.SALT_SHAKER:
      return createSaltShakerModel();
    case TOOL_TYPES.GHOST_WRITING_BOOK:
      return createGhostWritingBookModel(options.hasWriting || false);
    case TOOL_TYPES.MOBILE_JESUS:
      return createMobileJesusModel(options.charges ?? 2);
    default:
      return createToolViewmodel(normalized, options);
  }
}
