/**
 * ScrapYardMap.ts
 *
 * Authentic 3D Hungarian Scrap Yard Map ("A MÉH Telep") for MiskolcPhobia 3D.
 *
 * Implements:
 * - High corrugated metal perimeter fence (70m x 50m x 3.8m) with barbed wire and entrance gates.
 * - Multi-surface ground terrains (gravel pathways, concrete slabs, muddy fields, rusted metal).
 * - 5 Distinct Zones:
 *   * Zone 1: Mázsaház (brick office, weighbridge scale platform, safe, terminal desk, exterior breaker box).
 *   * Zone 2: Roncsautó Domb (4m tall crushed socialist car stacks, narrow alleys, openable hiding trunks, car alarm).
 *   * Zone 3: Nagy Hangár (industrial steel hall, giant shredder compactor, gantry crane, catwalks, rafter floodlights).
 *   * Zone 4: Kutyatelep & Sufni (wooden sheds, chain-link kennels, smoldering burn barrels with ember particles).
 *   * Zone 5: Ócskavas Lerakat (copper wire spools, cast-iron radiators, engine blocks, bicycle piles, throwable scrap).
 * - Full integration with MapColliders, HingedDoors, HidingSpots, and electrical breaker grid.
 */

import * as THREE from 'three';
import {
  MapColliders,
  BoxCollider,
  HingedDoor,
  HidingSpot,
  SurfaceZone,
  SURFACE_TYPES,
  ZONE_KEYS
} from './MapColliders.ts';
import { getPBRMaterial, getChainLinkMaterial } from '../visual/ProceduralTextures.ts';
import { applyWorldUVs, createContactShadows, mergeParts, corrugatedPanel } from '../visual/GeometryKit.ts';
import {
  P,
  tube,
  createCarGeometries,
  createCarInstances,
  createCarGroup,
  createTrunkRearGeometries,
  createTrunkLidGeometries,
  createLockerGeometries,
  createDrumGeometry,
  createFenceHardware,
  createGateWingGeometries,
  createSteelBeam
} from '../visual/YardProps.ts';
import type { ContactShadowItem, MergePart, Vec3Tuple } from '../visual/GeometryKit.ts';
import type { CarGeometries, CarMaterials, CarPlacement, FenceRun } from '../visual/YardProps.ts';
import type { ZoneKey } from './MapColliders.ts';

export interface ScrapYardMapOptions {
  mapColliders?: MapColliders;
}

/** A light the map can switch: point lamps and hangar floodlights. */
export type YardLight = THREE.PointLight | THREE.SpotLight;

export interface LightFixture {
  light: YardLight;
  isOn: boolean;
  shattered: boolean;
  switchMesh: THREE.Object3D | null;
}

export type ToggleLightResult =
  | { success: false; reason: 'shattered' }
  | { success: true; lightOn: false; breakerOff: true }
  | { success: true; tripped: true; lightOn: false }
  | { success: true; lightOn: boolean };

type LockerKit = ReturnType<typeof createLockerGeometries>;
type LatheProfile = ReadonlyArray<readonly [number, number]>;

const ORIGIN: Vec3Tuple = [0, 0, 0];

/** The 2D context of a freshly created canvas (throws where the old code would have dereferenced null). */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ScrapYardMap: 2D canvas context unavailable');
  return ctx;
}

export class ScrapYardMap {
  readonly mapColliders: MapColliders;
  readonly group: THREE.Group;
  isBreakerOn: boolean;
  breakerTripped: boolean;
  readonly activeLights: Set<string>;
  readonly shatteredLights: Set<string>;
  maxBreakerLights: number;
  readonly lightFixtures: Map<string, LightFixture>;
  readonly interactiveProps: THREE.Object3D[];
  isCarAlarmActive: boolean;
  carAlarmTimer: number;
  readonly carAlarmHeadlights: THREE.Mesh[];
  readonly burnBarrelLights: THREE.PointLight[];
  readonly burnFlames: THREE.Mesh[];
  _contact: ContactShadowItem[] | null;
  _carKit: Partial<Record<'sedan' | 'wagon', CarGeometries>> | null;
  _lockerKit?: LockerKit;
  _drumGeo?: THREE.BufferGeometry;
  contactShadowMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  knifeSwitchPivot?: THREE.Group;
  leftGateDoor!: HingedDoor;
  rightGateDoor!: HingedDoor;
  doorMazsahaz!: HingedDoor;
  doorHangarMain!: HingedDoor;
  matFence!: THREE.MeshStandardMaterial;
  matRustyMetal!: THREE.MeshStandardMaterial;
  matGalvanized!: THREE.MeshStandardMaterial;
  matRedBrick!: THREE.MeshStandardMaterial;
  matConcrete!: THREE.MeshStandardMaterial;
  matGravel!: THREE.MeshStandardMaterial;
  matAsphalt!: THREE.MeshStandardMaterial;
  matMud!: THREE.MeshStandardMaterial;
  matRottenWood!: THREE.MeshStandardMaterial;
  matWoodDesk!: THREE.MeshStandardMaterial;
  matHangarSteel!: THREE.MeshStandardMaterial;
  matHangarWall!: THREE.MeshStandardMaterial;
  matCopper!: THREE.MeshStandardMaterial;
  matYellowHazard!: THREE.MeshStandardMaterial;
  matCarPaint!: THREE.MeshStandardMaterial;
  matCarGlass!: THREE.MeshStandardMaterial;
  matLockerPaint!: THREE.MeshStandardMaterial;
  matDrumPaint!: THREE.MeshStandardMaterial;
  matShredderPaint!: THREE.MeshStandardMaterial;
  matChrome!: THREE.MeshStandardMaterial;
  matRubber!: THREE.MeshStandardMaterial;
  matTyre!: THREE.MeshStandardMaterial;
  matLamp!: THREE.MeshStandardMaterial;
  matDarkSteel!: THREE.MeshStandardMaterial;
  matChainLink!: THREE.MeshStandardMaterial;
  yardMats!: CarMaterials;

  constructor(options: ScrapYardMapOptions = {}) {
    this.mapColliders = options.mapColliders || new MapColliders();
    this.group = new THREE.Group();
    this.group.name = 'ScrapYardMap_Group';

    // Electrical grid state
    this.isBreakerOn = true;
    this.breakerTripped = false;
    this.activeLights = new Set();
    this.shatteredLights = new Set();
    this.maxBreakerLights = 6;

    // Light fixtures registry: id -> { light, fixtureMesh, isOn, switchMesh }
    this.lightFixtures = new Map();

    // Interactive props registry for player raycaster
    this.interactiveProps = [];

    // Car alarm state
    this.isCarAlarmActive = false;
    this.carAlarmTimer = 0;
    this.carAlarmHeadlights = [];

    // Burn barrel embers
    this.burnBarrelLights = [];
    this.burnFlames = [];

    // Contact-shadow footprints collected while building ({ x, z, w, d, rot })
    this._contact = [];
    this._carKit = null;

    // Build complete environment
    this.initMapMaterials();
    this.buildPerimeterFence();
    this.buildGroundTerrains();
    this.buildZone1Mazsahaz();
    this.buildZone2RoncsautoDomb();
    this.buildZone3NagyHangar();
    this.buildZone4KutyatelepSufni();
    this.buildZone5OcskavasLerakat();
    this.setupCircuitBreaker();
    this._finishVisuals();
  }

  /** Tile shared PBR textures in metres and add one merged contact-shadow mesh for all footprints. */
  _finishVisuals(): void {
    applyWorldUVs(this.group);
    const shadows = createContactShadows(this._contact ?? []);
    if (shadows) {
      this.contactShadowMesh = shadows;
      this.group.add(shadows);
    }
    this._contact = null;
  }

  /** Register a footprint for the fake ambient-occlusion blobs. */
  _addContact(x: number, z: number, w: number, d: number, rot = 0): void {
    if (this._contact) this._contact.push({ x, z, w: w * 1.45, d: d * 1.45, rot });
  }

  /** Free geometry and materials owned by the map (the shared texture library is freed separately). */
  dispose(): void {
    this.group.traverse((o) => {
      const { geometry, material } = o as { geometry?: unknown; material?: unknown };
      if (geometry instanceof THREE.BufferGeometry) geometry.dispose();
      const mats = Array.isArray(material) ? material : material ? [material] : [];
      mats.forEach((m) => { if (m instanceof THREE.Material) m.dispose(); });
    });
  }

  /* -------------------------------------------------------------
   * MATERIALS
   * ----------------------------------------------------------- */
  _makeNoiseTexture(base = '#808080', spread = 40, repeat = 24, size = 128): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * size * 0.6; i++) {
      const v = 128 + (Math.random() - 0.5) * spread * 2;
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 4;
    return tex;
  }

  initMapMaterials(): void {
    // Shared procedural PBR materials (cached in the texture library; tile = metres per texture repeat)
    this.matFence = getPBRMaterial('corrugated', { color: 0x7d776a, tile: 1.6, normalScale: 0.5, side: THREE.DoubleSide });
    this.matRustyMetal = getPBRMaterial('rust', { tile: 1.5 });
    this.matGalvanized = getPBRMaterial('metalPlate', { color: 0x8a9096, tile: 1.2 });
    this.matRedBrick = getPBRMaterial('brick', { tile: 1.8 });
    this.matConcrete = getPBRMaterial('concrete', { tile: 2.5 });
    this.matGravel = getPBRMaterial('gravel', { tile: 3 });
    this.matAsphalt = getPBRMaterial('asphalt', { tile: 4 });
    this.matMud = getPBRMaterial('mud', { tile: 3 });
    this.matRottenWood = getPBRMaterial('wood', { tile: 1.5 });
    this.matWoodDesk = getPBRMaterial('wood', { color: 0x4a3a2a, tile: 1.2 });
    this.matHangarSteel = getPBRMaterial('metalPlate', { tile: 1.2 });
    this.matHangarWall = getPBRMaterial('corrugated', { color: 0x666e7a, tile: 1.6, normalScale: 0.5, side: THREE.DoubleSide });
    this.matCopper = getPBRMaterial('rust', { color: 0xb8683a, tile: 1.0, normalStrength: 1.2 });
    this.matYellowHazard = getPBRMaterial('hazard', { tile: 1.0 });
    this.matCarPaint = getPBRMaterial('paint', { color: 0xdedede, tile: 1.5 });
    this.matCarGlass = getPBRMaterial('glass', { tile: 1.0, tint: 0x8a9499 });
    this.matLockerPaint = getPBRMaterial('paint', { color: 0x6f8574, tile: 1.0 });
    this.matDrumPaint = getPBRMaterial('paint', { color: 0xdedede, tile: 1.0 });
    this.matShredderPaint = getPBRMaterial('paint', { color: 0x1f5c35, tile: 1.2 });
    this.matChrome = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.18, metalness: 1.0 });
    this.matRubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.92, metalness: 0.0 });
    this.matTyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, metalness: 0.0 });
    this.matLamp = new THREE.MeshStandardMaterial({ color: 0xe8e2c0, roughness: 0.25, metalness: 0.2, emissive: 0x332f18, emissiveIntensity: 0.4 });
    this.matDarkSteel = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.7 });
    this.matChainLink = getChainLinkMaterial();
    // name used by YardProps builders
    this.yardMats = {
      carPaint: this.matCarPaint,
      carGlass: this.matCarGlass,
      rust: this.matRustyMetal,
      tyre: this.matTyre,
      lamp: this.matLamp
    };
  }

  /* -------------------------------------------------------------
   * PERIMETER FENCE & ENTRANCE GATES (Point 39)
   * Width 70m: X: -34 to +36, Depth 50m: Z: -2 to +48, Height 3.8m
   * ----------------------------------------------------------- */
  buildPerimeterFence(): void {
    const fenceGroup = new THREE.Group();
    fenceGroup.name = 'Perimeter_Fence_Group';

    const fenceH = 3.8;
    const runs: FenceRun[] = [];

    // Corrugated sheet-metal wall (real ridges), one mesh per run; posts, rails and barbed wire are merged below
    const createFenceWall = (startX: number, startZ: number, endX: number, endZ: number, id: string): void => {
      const length = Math.hypot(endX - startX, endZ - startZ);
      const angle = Math.atan2(endZ - startZ, endX - startX);

      const panel = new THREE.Mesh(corrugatedPanel(length, fenceH, 0.2, 0.035), this.matFence);
      panel.position.set((startX + endX) / 2, 0, (startZ + endZ) / 2);
      panel.rotation.y = -angle;
      panel.castShadow = true;
      panel.receiveShadow = true;
      fenceGroup.add(panel);
      runs.push({ sx: startX, sz: startZ, ex: endX, ez: endZ });

      // Add to physics colliders
      const halfThick = 0.3;
      const minX = Math.min(startX, endX) - halfThick;
      const maxX = Math.max(startX, endX) + halfThick;
      const minZ = Math.min(startZ, endZ) - halfThick;
      const maxZ = Math.max(startZ, endZ) + halfThick;

      this.mapColliders.addCollider(new BoxCollider({
        id: `fence_${id}`,
        tag: 'fence',
        surface: SURFACE_TYPES.METAL,
        min: new THREE.Vector3(minX, 0, minZ),
        max: new THREE.Vector3(maxX, fenceH, maxZ)
      }));
    };

    // 1. North Wall (Back): Z = 48, X: -34 to +36
    createFenceWall(-34, 48, 36, 48, 'north');

    // 2. West Wall (Left): X = -34, Z: 0 to 48
    createFenceWall(-34, 0, -34, 48, 'west');

    // 3. East Wall (Right): X = 36, Z: 0 to 48
    createFenceWall(36, 0, 36, 48, 'east');

    // 4. South Wall (Front): Z = 0, leaves entrance opening from X = -3.0 to +3.0
    createFenceWall(-34, 0, -3.0, 0, 'south_left');
    createFenceWall(3.0, 0, 36, 0, 'south_right');

    const hw = createFenceHardware(runs, fenceH);
    const steel = new THREE.Mesh(hw.steel, this.matGalvanized);
    steel.castShadow = true;
    const wire = new THREE.Mesh(hw.wire, this.matHangarSteel);
    fenceGroup.add(steel, wire);

    // 5. Heavy Wrought Iron Double Entrance Gates (at Z = 0, X: -3.0 to +3.0)
    this.buildEntranceGates(fenceGroup);

    this.group.add(fenceGroup);
  }

  buildEntranceGates(fenceGroup: THREE.Object3D): void {
    const gateH = 3.6;
    const wingW = 3.0;

    // Left gate wing: merged frame, spear-tipped bars, brace and latch
    const leftGateGroup = new THREE.Group();
    leftGateGroup.position.set(-3.0, 0, 0); // hinge at left post
    const leftWing = new THREE.Mesh(createGateWingGeometries(wingW, gateH, 1), this.matRustyMetal);
    leftWing.castShadow = true;
    leftGateGroup.add(leftWing);
    fenceGroup.add(leftGateGroup);

    // Right gate wing mesh
    const rightGateGroup = new THREE.Group();
    rightGateGroup.position.set(3.0, 0, 0); // hinge at right post
    const rightWing = new THREE.Mesh(createGateWingGeometries(wingW, gateH, -1), this.matRustyMetal);
    rightWing.castShadow = true;
    rightGateGroup.add(rightWing);
    fenceGroup.add(rightGateGroup);

    // Gate post pillars
    const pillarGeo = mergeParts([
      P.rbox(0.4, gateH + 0.5, 0.4, 0.03, 0, (gateH + 0.5) / 2, 0),
      P.box(0.5, 0.12, 0.5, 0, gateH + 0.55, 0), // capstone
      P.box(0.46, 0.2, 0.46, 0, 0.1, 0) // plinth
    ], { tile: 1.0 });
    const postMat = this.matConcrete;
    const pLeft = new THREE.Mesh(pillarGeo, postMat);
    pLeft.position.set(-3.1, (gateH + 0.5) / 2, 0);
    const pRight = new THREE.Mesh(pillarGeo, postMat);
    pRight.position.set(3.1, (gateH + 0.5) / 2, 0);
    fenceGroup.add(pLeft);
    fenceGroup.add(pRight);

    // Register left & right gate doors
    this.leftGateDoor = new HingedDoor({
      id: 'main_gate_left',
      name: 'Főbejárati Kapu (Bal)',
      zone: ZONE_KEYS.YARD,
      doorMesh: leftGateGroup,
      pivot: new THREE.Vector3(-3.0, 0, 0),
      closedAngle: 0,
      openAngle: -Math.PI / 2.1,
      width: wingW,
      height: gateH,
      thickness: 0.15,
      surface: SURFACE_TYPES.METAL
    });

    this.rightGateDoor = new HingedDoor({
      id: 'main_gate_right',
      name: 'Főbejárati Kapu (Jobb)',
      zone: ZONE_KEYS.YARD,
      doorMesh: rightGateGroup,
      pivot: new THREE.Vector3(3.0, 0, 0),
      closedAngle: 0,
      openAngle: Math.PI / 2.1,
      width: wingW,
      height: gateH,
      thickness: 0.15,
      surface: SURFACE_TYPES.METAL
    });

    this.mapColliders.addDoor(this.leftGateDoor);
    this.mapColliders.addDoor(this.rightGateDoor);
  }

  /* -------------------------------------------------------------
   * GROUND TERRAINS & MULTI-SURFACES
   * ----------------------------------------------------------- */
  buildGroundTerrains(): void {
    const groundGroup = new THREE.Group();
    groundGroup.name = 'Ground_Terrains_Group';

    // 1. Outside Staging Gravel & Asphalt (Z: -25 to 0)
    const stagingGeo = new THREE.PlaneGeometry(80, 26);
    stagingGeo.rotateX(-Math.PI / 2);
    const stagingMesh = new THREE.Mesh(stagingGeo, this.matAsphalt);
    stagingMesh.position.set(0, 0, -13);
    stagingMesh.receiveShadow = true;
    groundGroup.add(stagingMesh);

    // 2. Main Inside Yard Base Gravel (X: -36 to +38, Z: 0 to 50)
    const yardGeo = new THREE.PlaneGeometry(74, 50);
    yardGeo.rotateX(-Math.PI / 2);
    const yardMesh = new THREE.Mesh(yardGeo, this.matGravel);
    yardMesh.position.set(1, 0, 25);
    yardMesh.receiveShadow = true;
    groundGroup.add(yardMesh);

    // 3. Zone 5 Mud Terrain Overlay with wet specular highlights
    const mudGeo = new THREE.PlaneGeometry(18, 32);
    mudGeo.rotateX(-Math.PI / 2);
    const mudMesh = new THREE.Mesh(mudGeo, this.matMud);
    mudMesh.position.set(27.5, 0.02, 23);
    mudMesh.receiveShadow = true;
    groundGroup.add(mudMesh);

    // 4. Zone 4 Kennel Dirt/Mud Patch
    const kennelDirtGeo = new THREE.PlaneGeometry(18, 20);
    kennelDirtGeo.rotateX(-Math.PI / 2);
    const kennelDirt = new THREE.Mesh(kennelDirtGeo, this.matMud);
    kennelDirt.position.set(-20, 0.02, 37);
    kennelDirt.receiveShadow = true;
    groundGroup.add(kennelDirt);

    this.group.add(groundGroup);
  }

  /* -------------------------------------------------------------
   * ZONE 1: MÁZSAHÁZ (WEIGHBRIDGE OFFICE) (Points 40 & 48)
   * Bounds: X: 8.0 to 18.0, Z: 2.0 to 12.0, Height 3.2m
   * Breaker Box: X: 8.0, Y: 1.4, Z: 5.0
   * ----------------------------------------------------------- */
  buildZone1Mazsahaz(): void {
    const z1Group = new THREE.Group();
    z1Group.name = 'Zone1_Mazsahaz';

    const bX = 13.0;
    const bZ = 7.0;
    const bW = 10.0;
    const bL = 10.0;
    const bH = 3.2;
    const wallThick = 0.25;

    // Concrete floor foundation
    const floorGeo = new THREE.BoxGeometry(bW, 0.2, bL);
    const floor = new THREE.Mesh(floorGeo, this.matConcrete);
    floor.position.set(bX, 0.1, bZ);
    floor.receiveShadow = true;
    z1Group.add(floor);

    // Concrete roof ceiling
    const roofGeo = new THREE.BoxGeometry(bW + 0.6, 0.2, bL + 0.6);
    const roof = new THREE.Mesh(roofGeo, this.matConcrete);
    roof.position.set(bX, bH + 0.1, bZ);
    z1Group.add(roof);

    // Exterior Walls (Brick)
    // North wall (Z = 12.0)
    const nWallGeo = new THREE.BoxGeometry(bW, bH, wallThick);
    const nWall = new THREE.Mesh(nWallGeo, this.matRedBrick);
    nWall.position.set(bX, bH / 2, bZ + bL / 2);
    nWall.castShadow = true;
    z1Group.add(nWall);

    // East wall (X = 18.0)
    const eWallGeo = new THREE.BoxGeometry(wallThick, bH, bL);
    const eWall = new THREE.Mesh(eWallGeo, this.matRedBrick);
    eWall.position.set(bX + bW / 2, bH / 2, bZ);
    eWall.castShadow = true;
    z1Group.add(eWall);

    // South wall (Z = 2.0) with door opening
    // Door opening from X = 9.5 to 10.8
    const sWallLeft = new THREE.Mesh(new THREE.BoxGeometry(1.5, bH, wallThick), this.matRedBrick);
    sWallLeft.position.set(8.75, bH / 2, 2.0);
    z1Group.add(sWallLeft);

    const sWallRight = new THREE.Mesh(new THREE.BoxGeometry(7.2, bH, wallThick), this.matRedBrick);
    sWallRight.position.set(14.4, bH / 2, 2.0);
    z1Group.add(sWallRight);

    const sWallHeader = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, wallThick), this.matRedBrick);
    sWallHeader.position.set(10.15, 2.7, 2.0);
    z1Group.add(sWallHeader);

    // West wall (X = 8.0) with dispatch window
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, bH, bL), this.matRedBrick);
    wWall.position.set(8.0, bH / 2, bZ);
    wWall.castShadow = true;
    z1Group.add(wWall);

    // Sliding Glass dispatch window on West wall facing weigh platform
    const winGeo = new THREE.PlaneGeometry(1.8, 1.1);
    const winMat = getPBRMaterial('glass', { tile: 1.0, transparent: true, opacity: 0.55, tint: 0xb8cdd6 });
    const dispatchWin = new THREE.Mesh(winGeo, winMat);
    dispatchWin.position.set(7.85, 1.5, 7.0);
    dispatchWin.rotation.y = Math.PI / 2;
    z1Group.add(dispatchWin);

    // Window frame, sill and sliding-sash rail (merged), roof parapet, gutter and vent stacks
    const frameParts = [
      P.box(0.06, 0.08, 2.0, 0, 0.6, 0), P.box(0.06, 0.08, 2.0, 0, -0.6, 0),
      P.box(0.06, 1.2, 0.08, 0, 0, 0.96), P.box(0.06, 1.2, 0.08, 0, 0, -0.96), P.box(0.05, 1.1, 0.04, 0, 0, 0),
      P.box(0.18, 0.05, 2.2, -0.04, -0.66, 0) // concrete sill
    ];
    const winFrame = new THREE.Mesh(mergeParts(frameParts, { tile: 1 }), this.matGalvanized);
    winFrame.position.set(7.84, 1.5, 7.0);
    z1Group.add(winFrame);
    const roofParts = [
      P.box(bW + 0.6, 0.18, 0.12, 0, 0, bL / 2 + 0.3), P.box(bW + 0.6, 0.18, 0.12, 0, 0, -bL / 2 - 0.3),
      P.box(0.12, 0.18, bL + 0.6, bW / 2 + 0.3, 0, 0), P.box(0.12, 0.18, bL + 0.6, -bW / 2 - 0.3, 0, 0),
      tube([-bW / 2 - 0.35, -0.2, -bL / 2], [-bW / 2 - 0.35, -0.2, bL / 2], 0.05, 8), // gutter
      tube([-bW / 2 - 0.35, -0.2, bL / 2 - 0.4], [-bW / 2 - 0.35, -bH + 0.1, bL / 2 - 0.4], 0.035, 8), // downpipe
      P.cyl(0.14, 0.14, 0.7, 10, 2.4, 0.45, -2.0), P.cyl(0.2, 0.14, 0.12, 10, 2.4, 0.85, -2.0),
      P.box(0.9, 0.5, 0.9, -2.0, 0.34, 1.5)
    ];
    const roofDetail = new THREE.Mesh(mergeParts(roofParts, { tile: 1.5 }), this.matConcrete);
    roofDetail.position.set(bX, bH + 0.29, bZ);
    roofDetail.castShadow = true;
    z1Group.add(roofDetail);
    this._addContact(bX, bZ, bW + 0.4, bL + 0.4);

    // Weighbridge Platform outside West wall (X: 5.8 to 8.0, Z: 3.0 to 11.0)
    const scalePlatformGeo = new THREE.BoxGeometry(2.2, 0.12, 8.0);
    const scaleMat = getPBRMaterial('metalPlate', { color: 0x484848, tile: 1.0 });
    const scalePlatform = new THREE.Mesh(scalePlatformGeo, scaleMat);
    scalePlatform.position.set(6.8, 0.06, 7.0);
    scalePlatform.receiveShadow = true;
    z1Group.add(scalePlatform);

    // Yellow hazard warning curb around weighbridge
    const curbGeo = new THREE.BoxGeometry(0.15, 0.15, 8.2);
    const curbL = new THREE.Mesh(curbGeo, this.matYellowHazard);
    curbL.position.set(5.6, 0.08, 7.0);
    const curbR = new THREE.Mesh(curbGeo, this.matYellowHazard);
    curbR.position.set(8.0, 0.08, 7.0);
    z1Group.add(curbL);
    z1Group.add(curbR);

    // Hinged Entry Door at (9.5, 0, 2.0)
    const doorGroup = new THREE.Group();
    doorGroup.position.set(9.5, 0, 2.0); // Hinge pivot at X = 9.5
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.08), this.matRottenWood);
    doorMesh.position.set(0.6, 1.1, 0);
    doorGroup.add(doorMesh);
    const doorDetail = new THREE.Mesh(mergeParts([
      P.box(0.9, 0.7, 0.03, 0.6, 1.55, 0.05), P.box(0.9, 0.7, 0.03, 0.6, 0.65, 0.05), // raised panels
      P.box(0.9, 0.7, 0.03, 0.6, 1.55, -0.05), P.box(0.9, 0.7, 0.03, 0.6, 0.65, -0.05),
      P.box(0.05, 0.16, 0.05, 1.05, 1.05, 0.07), P.cyl(0.018, 0.018, 0.14, 8, 1.05, 1.05, 0.1, Math.PI / 2, 0, 0), // handle
      P.cyl(0.02, 0.02, 0.18, 6, 0.0, 0.3, 0.0), P.cyl(0.02, 0.02, 0.18, 6, 0.0, 1.0, 0.0), P.cyl(0.02, 0.02, 0.18, 6, 0.0, 1.8, 0.0) // hinges
    ], { tile: 1.2 }), this.matChrome);
    doorGroup.add(doorDetail);
    z1Group.add(doorGroup);
    // door frame (fixed)
    const doorFrame = new THREE.Mesh(mergeParts([
      P.box(0.1, 2.3, 0.34, -0.05, 1.15, 0), P.box(0.1, 2.3, 0.34, 1.35, 1.15, 0), P.box(1.5, 0.1, 0.34, 0.65, 2.3, 0),
      P.box(1.6, 0.06, 0.5, 0.65, 0.03, 0.1) // step
    ], { tile: 1.5 }), this.matConcrete);
    doorFrame.position.set(9.5, 0, 2.0);
    z1Group.add(doorFrame);

    this.doorMazsahaz = new HingedDoor({
      id: 'door_mazsahaz',
      name: 'Mázsaház Iroda Ajtó',
      zone: ZONE_KEYS.ZONE1,
      doorMesh: doorGroup,
      pivot: new THREE.Vector3(9.5, 0, 2.0),
      closedAngle: 0,
      openAngle: Math.PI / 2.0,
      width: 1.2,
      height: 2.2,
      thickness: 0.1,
      surface: SURFACE_TYPES.CONCRETE
    });
    this.mapColliders.addDoor(this.doorMazsahaz);

    // Interior Furnishings
    // 1. Weighbridge scale computer terminal desk
    const deskGeo = new THREE.BoxGeometry(1.6, 0.75, 0.8);
    const deskGeoM = mergeParts([
      P.rbox(1.6, 0.05, 0.8, 0.012, 0, 0.35, 0), // top
      P.box(0.05, 0.7, 0.75, -0.75, 0, 0), P.box(0.05, 0.7, 0.75, 0.75, 0, 0), // sides
      P.box(1.5, 0.55, 0.03, 0, -0.05, -0.36), // modesty panel
      P.box(0.45, 0.6, 0.7, 0.52, -0.02, 0), // drawer pedestal
      P.box(0.4, 0.14, 0.02, 0.52, 0.18, 0.36), P.box(0.4, 0.14, 0.02, 0.52, 0.0, 0.36), P.box(0.4, 0.14, 0.02, 0.52, -0.18, 0.36),
      P.box(0.14, 0.02, 0.025, 0.52, 0.18, 0.375), P.box(0.14, 0.02, 0.025, 0.52, 0.0, 0.375), P.box(0.14, 0.02, 0.025, 0.52, -0.18, 0.375),
      P.rbox(0.36, 0.04, 0.26, 0.01, -0.3, 0.39, 0.1), // keyboard
      P.rbox(0.34, 0.3, 0.32, 0.03, -0.3, 0.55, -0.2), // CRT body
      P.box(0.14, 0.12, 0.14, -0.3, 0.42, -0.2) // CRT neck
    ], { tile: 1.2 });
    const desk = new THREE.Mesh(deskGeoM, this.matWoodDesk);
    desk.position.set(9.2, 0.38, 7.0);
    desk.castShadow = true;
    z1Group.add(desk);
    this._addContact(9.2, 7.0, 1.7, 0.9);

    // CRT Screen with glowing phosphor scale display ("MÉRLEG: 0.00 kg")
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 256;
    scaleCanvas.height = 128;
    const sctx = context2d(scaleCanvas);
    sctx.fillStyle = '#051208';
    sctx.fillRect(0, 0, 256, 128);
    sctx.fillStyle = '#22ee55';
    sctx.font = 'bold 20px monospace';
    sctx.fillText('MÉH TELEP MÉRLEG', 18, 35);
    sctx.font = 'bold 32px monospace';
    sctx.fillText('0.00 kg', 50, 85);
    const scaleTex = new THREE.CanvasTexture(scaleCanvas);
    const scaleScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.28),
      new THREE.MeshBasicMaterial({ map: scaleTex })
    );
    scaleScreen.position.set(9.2, 0.95, 6.95);
    scaleScreen.rotation.y = Math.PI / 2;
    z1Group.add(scaleScreen);

    // 2. Broken swivel desk chair
    const chairGeo = new THREE.BoxGeometry(0.5, 0.8, 0.5);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.9, metalness: 0.1 });
    const chairParts = [
      P.rbox(0.46, 0.07, 0.46, 0.03, 0, 0.0, 0), // seat
      P.rbox(0.44, 0.5, 0.06, 0.03, 0, 0.3, -0.22, -0.12), // back
      P.cyl(0.03, 0.03, 0.3, 8, 0, -0.18, 0), // gas lift
      tube([0, -0.34, 0], [0.26, -0.4, 0.0], 0.02), tube([0, -0.34, 0], [-0.26, -0.4, 0.0], 0.02), // star base
      tube([0, -0.34, 0], [0.0, -0.4, 0.26], 0.02), tube([0, -0.34, 0], [0.0, -0.4, -0.26], 0.02), tube([0, -0.34, 0], [0.18, -0.4, -0.18], 0.02),
      P.sphere(0.035, 1, 1, 1, 0.26, -0.43, 0, 6), P.sphere(0.035, 1, 1, 1, -0.26, -0.43, 0, 6), P.sphere(0.035, 1, 1, 1, 0, -0.43, 0.26, 6), P.sphere(0.035, 1, 1, 1, 0, -0.43, -0.26, 6), P.sphere(0.035, 1, 1, 1, 0.18, -0.43, -0.18, 6)
    ];
    const chair = new THREE.Mesh(mergeParts(chairParts, { tile: 0.8 }), chairMat);
    chair.position.set(10.2, 0.45, 7.0);
    chair.rotation.y = -0.4;
    z1Group.add(chair);

    // 3. Gray steel floor safe
    const safeGeo = new THREE.BoxGeometry(0.7, 0.85, 0.7);
    const safeMat = getPBRMaterial('metalPlate', { color: 0x3d434a, tile: 0.8 });
    const safeParts = mergeParts([
      P.rbox(0.7, 0.85, 0.7, 0.03, 0, 0, 0), P.rbox(0.6, 0.75, 0.04, 0.02, 0, 0, -0.36), // door plate (front is -Z)
      P.cyl(0.03, 0.03, 0.05, 8, 0.22, 0.05, -0.38, Math.PI / 2, 0, 0), P.box(0.05, 0.3, 0.04, -0.24, 0.0, -0.38), // handle + hinge
      P.box(0.06, 0.06, 0.06, -0.3, -0.45, -0.3), P.box(0.06, 0.06, 0.06, 0.3, -0.45, -0.3), P.box(0.06, 0.06, 0.06, -0.3, -0.45, 0.3), P.box(0.06, 0.06, 0.06, 0.3, -0.45, 0.3)
    ], { tile: 1.0 });
    const safe = new THREE.Mesh(safeParts, safeMat);
    safe.position.set(16.8, 0.43, 10.8);
    safe.castShadow = true;
    z1Group.add(safe);

    // Safe combination dial
    const dialGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16);
    dialGeo.rotateX(Math.PI / 2);
    const dial = new THREE.Mesh(dialGeo, this.matChrome);
    dial.position.set(16.8, 0.6, 10.43);
    z1Group.add(dial);

    // 4. Scrap price corkboard
    const corkCanvas = document.createElement('canvas');
    corkCanvas.width = 512;
    corkCanvas.height = 384;
    const cctx = context2d(corkCanvas);
    cctx.fillStyle = '#b08c5d'; // cork
    cctx.fillRect(0, 0, 512, 384);
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(20, 20, 472, 344); // white sheet
    cctx.fillStyle = '#111111';
    cctx.font = 'bold 24px sans-serif';
    cctx.fillText('MISKOLC MÉH ÁRLISTA 2026', 40, 60);
    cctx.font = '18px sans-serif';
    cctx.fillText('• Vörösréz (millberry): 2.800 Ft/kg', 45, 110);
    cctx.fillText('• Sárgaréz: 1.750 Ft/kg', 45, 150);
    cctx.fillText('• Tiszta Alumínium: 650 Ft/kg', 45, 190);
    cctx.fillText('• Ólom akkumulátor: 240 Ft/kg', 45, 230);
    cctx.fillText('• Lemez vas: 95 Ft/kg', 45, 270);
    cctx.fillStyle = '#b91c1c';
    cctx.font = 'italic 16px sans-serif';
    cctx.fillText('Színesfém átvétel csak személyi igazolvánnyal!', 45, 330);

    const corkTex = new THREE.CanvasTexture(corkCanvas);
    const corkMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.9),
      new THREE.MeshStandardMaterial({ map: corkTex, roughness: 0.9 })
    );
    corkMesh.position.set(14.0, 1.8, 11.85);
    corkMesh.rotation.y = Math.PI;
    z1Group.add(corkMesh);

    // 5. Metal Lockers (Hiding Spots, Point 47)
    this.buildLocker(z1Group, 'mazsahaz_locker_1', 16.5, 3.5, ZONE_KEYS.ZONE1);
    this.buildLocker(z1Group, 'mazsahaz_locker_2', 16.5, 5.0, ZONE_KEYS.ZONE1);

    // 6. Lighting & Light Switch
    const officeLight = new THREE.PointLight(0xffcc77, 26, 12.0, 2.0);
    officeLight.position.set(13.0, 2.9, 7.0);
    z1Group.add(officeLight);

    const switchMesh = this.buildWallSwitch(z1Group, 'switch_mazsahaz', 8.2, 1.3, 3.2, 0);
    this.registerLightFixture('light_mazsahaz_office', officeLight, switchMesh);

    // Wall colliders for Mázsaház
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_mazsahaz_n_wall',
      min: new THREE.Vector3(8.0, 0, 11.8),
      max: new THREE.Vector3(18.0, bH, 12.2),
      surface: SURFACE_TYPES.CONCRETE
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_mazsahaz_e_wall',
      min: new THREE.Vector3(17.8, 0, 2.0),
      max: new THREE.Vector3(18.2, bH, 12.0),
      surface: SURFACE_TYPES.CONCRETE
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_mazsahaz_w_wall',
      min: new THREE.Vector3(7.8, 0, 2.0),
      max: new THREE.Vector3(8.2, bH, 12.0),
      surface: SURFACE_TYPES.CONCRETE
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_mazsahaz_s_wall_right',
      min: new THREE.Vector3(10.8, 0, 1.8),
      max: new THREE.Vector3(18.0, bH, 2.2),
      surface: SURFACE_TYPES.CONCRETE
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_mazsahaz_desk',
      min: new THREE.Vector3(8.3, 0, 6.5),
      max: new THREE.Vector3(10.1, 1.0, 7.5),
      surface: SURFACE_TYPES.CONCRETE
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_mazsahaz_safe',
      min: new THREE.Vector3(16.3, 0, 10.3),
      max: new THREE.Vector3(17.3, 1.0, 11.3),
      surface: SURFACE_TYPES.METAL
    }));

    this.group.add(z1Group);
  }

  /* -------------------------------------------------------------
   * CIRCUIT BREAKER BOX (Points 48–51)
   * Located at exterior north/west brick wall of Mázsaház at (8.0, 1.4, 5.0)
   * ----------------------------------------------------------- */
  setupCircuitBreaker(): void {
    const breakerGroup = new THREE.Group();
    breakerGroup.name = 'Circuit_Breaker_Box';
    breakerGroup.position.set(7.9, 1.4, 5.0);
    breakerGroup.rotation.y = -Math.PI / 2; // Facing west toward yard

    // Gray industrial steel enclosure
    const boxGeo = new THREE.BoxGeometry(0.35, 0.48, 0.16);
    const boxMesh = new THREE.Mesh(boxGeo, this.matGalvanized);
    breakerGroup.add(boxMesh);

    // Red high-voltage danger triangle sign: "VIGYÁZAT! NAGYFESZÜLTSÉG!"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 128;
    signCanvas.height = 128;
    const sctx = context2d(signCanvas);
    sctx.fillStyle = '#ffcc00';
    sctx.beginPath();
    sctx.moveTo(64, 15);
    sctx.lineTo(115, 110);
    sctx.lineTo(13, 110);
    sctx.closePath();
    sctx.fill();
    sctx.strokeStyle = '#000000';
    sctx.lineWidth = 6;
    sctx.stroke();

    // Lightning bolt icon
    sctx.fillStyle = '#000000';
    sctx.beginPath();
    sctx.moveTo(68, 35);
    sctx.lineTo(52, 65);
    sctx.lineTo(65, 65);
    sctx.lineTo(58, 95);
    sctx.lineTo(76, 60);
    sctx.lineTo(64, 60);
    sctx.closePath();
    sctx.fill();

    const signTex = new THREE.CanvasTexture(signCanvas);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    sign.position.set(0, 0.1, 0.082);
    breakerGroup.add(sign);

    // Heavy Knife Switch Lever
    this.knifeSwitchPivot = new THREE.Group();
    this.knifeSwitchPivot.position.set(0, -0.08, 0.082);

    const leverHandleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8);
    const leverMat = new THREE.MeshStandardMaterial({ color: 0x992222, metalness: 0.6, roughness: 0.3 });
    const leverHandle = new THREE.Mesh(leverHandleGeo, leverMat);
    leverHandle.position.y = 0.09;
    this.knifeSwitchPivot.add(leverHandle);

    const gripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 10);
    const grip = new THREE.Mesh(gripGeo, this.matRubber);
    grip.position.y = 0.17;
    this.knifeSwitchPivot.add(grip);

    // Initial position: UP (+45°) = ON
    this.knifeSwitchPivot.rotation.x = Math.PI / 4;
    breakerGroup.add(this.knifeSwitchPivot);

    // Interactive target for raycasting
    boxMesh.userData = {
      isInteractive: true,
      action: 'toggle_breaker',
      promptHu: '[E] Főkapcsoló fel / le'
    };
    this.interactiveProps.push(boxMesh);

    this.group.add(breakerGroup);
  }

  /* -------------------------------------------------------------
   * ZONE 2: RONCSAUTÓ DOMB (CRUSHED CAR MOUNTAIN) (Point 41, 47, 55)
   * Bounds: X: -25.0 to -8.0, Z: 5.0 to 25.0, 4m Tall stacks
   * ----------------------------------------------------------- */
  buildZone2RoncsautoDomb(): void {
    const z2Group = new THREE.Group();
    z2Group.name = 'Zone2_Roncsauto_Domb';

    // Vintage socialist car colors
    const carColors = [
      0x4a7c9b, // Trabant light sky blue
      0xb8a98a, // Trabant pastel beige
      0xc44e21, // Lada 2101 orange
      0x8b2522, // Skoda 120L deep maroon
      0x55603f  // Wartburg 353 olive green
    ];

    // Build stacks of crushed cars
    const stackPositions = [
      { x: -21.0, z: 8.0, rot: 0.2, height: 3 },
      { x: -16.0, z: 7.0, rot: -0.1, height: 2 },
      { x: -10.5, z: 9.0, rot: 0.4, height: 3 },
      { x: -22.5, z: 14.0, rot: -0.3, height: 3 },
      { x: -16.5, z: 15.0, rot: 0.0, height: 2 }, // Corridors around this
      { x: -10.0, z: 16.5, rot: 0.5, height: 3 },
      { x: -21.5, z: 21.0, rot: 0.15, height: 3 },
      { x: -15.5, z: 22.5, rot: -0.25, height: 3 },
      { x: -9.5, z: 22.0, rot: 0.3, height: 2 }
    ];

    // All stacked cars: two body variants, one InstancedMesh per material (paint colour per instance)
    const carKitSedan = this._getCarKit('sedan');
    const carKitWagon = this._getCarKit('wagon');
    const sedans: CarPlacement[] = [];
    const wagons: CarPlacement[] = [];
    stackPositions.forEach((stack, sIdx) => {
      for (let level = 0; level < stack.height; level++) {
        const color = carColors[(sIdx + level) % carColors.length] ?? 0x4a7c9b;
        const j = (sIdx * 7 + level * 3) % 5;
        const placement = {
          x: stack.x + (j - 2) * 0.03,
          y: 0.45 + level * 0.95,
          z: stack.z,
          ry: stack.rot + level * 0.12,
          rz: ((j % 3) - 1) * 0.03 * level,
          sy: level === 0 ? 1 : 0.88 + (j % 3) * 0.03, // upper cars are squashed by the weight above
          color
        };
        ((sIdx + level) % 3 === 2 ? wagons : sedans).push(placement);
      }
      this._addContact(stack.x, stack.z, 2.4, 3.8, -stack.rot);

      // Add solid box collider for each stack
      this.mapColliders.addCollider(new BoxCollider({
        id: `col_car_stack_${sIdx}`,
        tag: 'vehicle',
        surface: SURFACE_TYPES.METAL,
        center: new THREE.Vector3(stack.x, (stack.height * 0.95) / 2, stack.z),
        size: new THREE.Vector3(2.4, stack.height * 0.95, 3.8)
      }));
    });
    z2Group.add(createCarInstances(carKitSedan, this.yardMats, sedans, 'Cars_Sedan'));
    z2Group.add(createCarInstances(carKitWagon, this.yardMats, wagons, 'Cars_Wagon'));

    // 3 Openable Car Trunks (Point 47 Hiding Spots)
    this.buildCarTrunkHidingSpot(z2Group, 'car_trunk_1', -18.0, 8.5);
    this.buildCarTrunkHidingSpot(z2Group, 'car_trunk_2', -14.0, 15.5);
    this.buildCarTrunkHidingSpot(z2Group, 'car_trunk_3', -21.0, 21.0);

    // Car Alarm Sabotage Prop (Point 55)
    this.buildCarAlarmProp(z2Group, -16.0, 12.0);

    this.group.add(z2Group);
  }

  /** Lazily built, per-map car geometry kit ('sedan' | 'wagon'). */
  _getCarKit(variant: 'sedan' | 'wagon' = 'sedan'): CarGeometries {
    this._carKit = this._carKit || {};
    if (!this._carKit[variant]) this._carKit[variant] = createCarGeometries(variant, variant === 'wagon' ? 7 : 3);
    return this._carKit[variant];
  }

  createCrushedCarMesh(colorHex: number): THREE.Group {
    return createCarGroup(this._getCarKit('sedan'), this.yardMats, colorHex);
  }

  buildCarTrunkHidingSpot(parentGroup: THREE.Object3D, id: string, x: number, z: number): void {
    const trunkGroup = new THREE.Group();
    trunkGroup.position.set(x, 0.35, z);

    // Car rear section (bodywork, bumper, tail lights, glass, wheels) with the interactive body mesh
    const rear = createTrunkRearGeometries();
    const paintMat = this.matCarPaint.clone();
    paintMat.color.setHex([0x4a7c9b, 0xb8a98a, 0x8b2522, 0x55603f][Math.abs(Math.round(x * 3 + z)) % 4] ?? 0x4a7c9b);
    const frame = new THREE.Mesh(rear.paint, paintMat);
    frame.castShadow = true;
    frame.receiveShadow = true;
    trunkGroup.add(frame);
    trunkGroup.add(new THREE.Mesh(rear.trim, this.matRustyMetal));
    trunkGroup.add(new THREE.Mesh(rear.glass, this.matCarGlass));
    trunkGroup.add(new THREE.Mesh(rear.tyre, this.matTyre));
    this._addContact(x, z, 1.9, 1.5);

    // Hinged Trunk Lid
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.35, -0.5); // Hinge at front of trunk opening

    const lid = createTrunkLidGeometries();
    const lidMesh = new THREE.Mesh(lid.paint, paintMat);
    lidMesh.castShadow = true;
    lidPivot.add(lidMesh);
    lidPivot.add(new THREE.Mesh(lid.trim, this.matRustyMetal));
    trunkGroup.add(lidPivot);

    parentGroup.add(trunkGroup);

    // Register hinged trunk door and hiding spot volume
    const trunkDoor = new HingedDoor({
      id: `door_${id}`,
      name: 'Roncsautó Csomagtartó',
      zone: ZONE_KEYS.ZONE2,
      doorMesh: lidPivot,
      pivot: new THREE.Vector3(x, 0.7, z - 0.5),
      axis: new THREE.Vector3(1, 0, 0),
      closedAngle: 0,
      openAngle: -Math.PI / 2.3, // Swings up
      width: 1.5,
      height: 0.9,
      thickness: 0.08,
      surface: SURFACE_TYPES.METAL
    });

    const hidingSpot = new HidingSpot({
      id,
      type: 'car_trunk',
      name: 'Roncsautó Csomagtartó',
      zone: ZONE_KEYS.ZONE2,
      bounds: new THREE.Box3(
        new THREE.Vector3(x - 0.7, 0, z - 0.5),
        new THREE.Vector3(x + 0.7, 1.1, z + 0.5)
      ),
      door: trunkDoor,
      mesh: trunkGroup
    });

    this.mapColliders.addHidingSpot(hidingSpot);

    // Interactive prompt for raycasting
    frame.userData = {
      isInteractive: true,
      action: 'toggle_hiding',
      targetId: id,
      promptHu: '[E] Csomagtartó nyitás / bújás'
    };
    this.interactiveProps.push(frame);
  }

  buildCarAlarmProp(parentGroup: THREE.Object3D, x: number, z: number): void {
    const alarmCar = this.createCrushedCarMesh(0xc44e21); // Orange Lada
    alarmCar.position.set(x, 0.45, z);
    parentGroup.add(alarmCar);

    // Headlight meshes that will blink during sabotage
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const hlL = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), hlMat);
    hlL.position.set(-0.65, 0.65, z + 1.86);
    hlL.visible = false;

    const hlR = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), hlMat);
    hlR.position.set(0.65, 0.65, z + 1.86);
    hlR.visible = false;

    parentGroup.add(hlL);
    parentGroup.add(hlR);
    this.carAlarmHeadlights.push(hlL, hlR);

    // Collider
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_alarm_car',
      tag: 'vehicle',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.7, z),
      size: new THREE.Vector3(2.4, 1.4, 3.8)
    }));
  }

  /* -------------------------------------------------------------
   * ZONE 3: NAGY HANGÁR (MAIN SHREDDER HANGAR) (Point 42, 47)
   * Bounds: X: -5.0 to 22.0, Z: 22.0 to 45.0, Vaulted Height 7.5m
   * ----------------------------------------------------------- */
  buildZone3NagyHangar(): void {
    const z3Group = new THREE.Group();
    z3Group.name = 'Zone3_Nagy_Hangar';

    const hX = 8.5;
    const hZ = 33.5;
    const hW = 27.0; // from -5 to 22
    const hL = 23.0; // from 22 to 45
    const hH = 7.5;
    const wallThick = 0.3;

    // Heavy industrial concrete floor
    const floorGeo = new THREE.BoxGeometry(hW, 0.25, hL);
    const floor = new THREE.Mesh(floorGeo, this.matConcrete);
    floor.position.set(hX, 0.125, hZ);
    floor.receiveShadow = true;
    z3Group.add(floor);

    // Vaulted steel corrugated roof
    const roofGeo = new THREE.BoxGeometry(hW + 0.8, 0.2, hL + 0.8);
    const roof = new THREE.Mesh(roofGeo, this.matHangarWall);
    roof.position.set(hX, hH, hZ);
    z3Group.add(roof);

    // North wall (Z = 45.0)
    const nWall = new THREE.Mesh(new THREE.BoxGeometry(hW, hH, wallThick), this.matHangarWall);
    nWall.position.set(hX, hH / 2, 45.0);
    nWall.castShadow = true;
    z3Group.add(nWall);

    // East wall (X = 22.0)
    const eWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, hH, hL), this.matHangarWall);
    eWall.position.set(22.0, hH / 2, hZ);
    eWall.castShadow = true;
    z3Group.add(eWall);

    // West wall (X = -5.0)
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, hH, hL), this.matHangarWall);
    wWall.position.set(-5.0, hH / 2, hZ);
    wWall.castShadow = true;
    z3Group.add(wWall);

    // South wall (Z = 22.0) with large sliding hangar door opening (X: 3.0 to 9.0)
    const sWallLeft = new THREE.Mesh(new THREE.BoxGeometry(8.0, hH, wallThick), this.matHangarWall);
    sWallLeft.position.set(-1.0, hH / 2, 22.0);
    z3Group.add(sWallLeft);

    const sWallRight = new THREE.Mesh(new THREE.BoxGeometry(13.0, hH, wallThick), this.matHangarWall);
    sWallRight.position.set(15.5, hH / 2, 22.0);
    z3Group.add(sWallRight);

    const sWallHeader = new THREE.Mesh(new THREE.BoxGeometry(6.0, 3.5, wallThick), this.matHangarWall);
    sWallHeader.position.set(6.0, 5.75, 22.0);
    z3Group.add(sWallHeader);

    // Large sliding hangar door at (6.0, 0, 22.0)
    const hDoorGroup = new THREE.Group();
    hDoorGroup.position.set(3.0, 0, 22.0); // Hinge on left side
    const hDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.0, 0.15), this.matRustyMetal);
    hDoorMesh.position.set(2.9, 2.0, 0);
    hDoorGroup.add(hDoorMesh);
    const hDoorRibs = [];
    for (let i = 0; i < 5; i++) hDoorRibs.push(P.box(0.14, 3.9, 0.06, 0.5 + i * 1.2, 2.0, 0.1));
    hDoorRibs.push(P.box(5.8, 0.14, 0.06, 2.9, 0.4, 0.1), P.box(5.8, 0.14, 0.06, 2.9, 2.0, 0.1), P.box(5.8, 0.14, 0.06, 2.9, 3.7, 0.1));
    hDoorRibs.push(P.box(0.08, 0.5, 0.12, 5.5, 1.1, 0.16), P.cyl(0.03, 0.03, 0.14, 6, 5.5, 1.1, 0.2, Math.PI / 2, 0, 0));
    hDoorGroup.add(new THREE.Mesh(mergeParts(hDoorRibs, { tile: 1.5 }), this.matHangarSteel));
    z3Group.add(hDoorGroup);

    // Steel portal frame: columns along both long walls, rafters, purlins and bracing (merged, one draw call)
    const frameParts: MergePart[] = [];
    for (let fz = 0; fz <= 4; fz++) {
      const z = 22.8 + fz * ((hL - 1.6) / 4);
      for (const xs of [-4.75, 21.75]) {
        frameParts.push(...createSteelBeam(hH - 0.2, 0.35, 0.22).map((q): MergePart => {
          const [qx, qy, qz] = q.position ?? ORIGIN;
          return { ...q, rotation: [Math.PI / 2, 0, 0], position: [xs + qx, hH / 2 + qz * 0, z + qy] };
        }));
      }
      frameParts.push(P.box(hW - 0.6, 0.3, 0.14, hX, hH - 0.35, z), P.box(0.12, 1.3, 0.1, hX - 6.5, hH - 1.0, z, 0, 0, 0.75), P.box(0.12, 1.3, 0.1, hX + 6.5, hH - 1.0, z, 0, 0, -0.75));
    }
    for (let i = 0; i < 6; i++) frameParts.push(P.box(0.1, 0.1, hL - 1.0, -4.5 + i * 5.2, hH - 0.5, hZ));
    z3Group.add(new THREE.Mesh(mergeParts(frameParts, { tile: 1.5 }), this.matHangarSteel));
    this._addContact(hX, hZ, hW - 0.5, hL - 0.5);

    this.doorHangarMain = new HingedDoor({
      id: 'door_hangar_main',
      name: 'Nagy Hangár Tolókapu',
      zone: ZONE_KEYS.ZONE3,
      doorMesh: hDoorGroup,
      pivot: new THREE.Vector3(3.0, 0, 22.0),
      closedAngle: 0,
      openAngle: Math.PI / 2.2,
      width: 5.8,
      height: 4.0,
      thickness: 0.2,
      surface: SURFACE_TYPES.METAL
    });
    this.mapColliders.addDoor(this.doorHangarMain);

    // 1. Giant Green Scrap Shredder / Compactor ("Fémprés / Roncsdaráló")
    this.buildShredderCompactor(z3Group, 5.0, 36.0);

    // 2. Overhead Gantry Crane Rails & Hoist Hook
    this.buildGantryCrane(z3Group, hX, hZ, hW, hL, hH);

    // 3. Elevated Catwalk & Steel Stairs
    this.buildCatwalkAndStairs(z3Group);

    // 4. Pyramids of 200L Oil Drums (MOL & ÁFOR vintage barrels)
    this.buildOilDrums(z3Group, 17.0, 25.0);
    this.buildOilDrums(z3Group, -2.0, 41.0);

    // 5. Metal Lockers (Hiding Spots, Point 47)
    this.buildLocker(z3Group, 'hangar_locker_1', -3.5, 24.5, ZONE_KEYS.ZONE3);
    this.buildLocker(z3Group, 'hangar_locker_2', -3.5, 26.0, ZONE_KEYS.ZONE3);

    // 6. High-Intensity Rafter Floodlights (Point 13 & 14)
    // Floodlight 1
    const flood1 = new THREE.SpotLight(0xddff88, 45.0, 26.0, Math.PI / 3.5, 0.4, 2.0);
    flood1.position.set(4.0, 7.0, 28.0);
    flood1.target.position.set(4.0, 0, 28.0);
    flood1.castShadow = true;
    flood1.shadow.mapSize.width = 1024;
    flood1.shadow.mapSize.height = 1024;
    flood1.shadow.camera.near = 0.5;
    flood1.shadow.camera.far = 26.0;
    z3Group.add(flood1);
    z3Group.add(flood1.target);

    // Floodlight 2
    const flood2 = new THREE.SpotLight(0xddff88, 45.0, 26.0, Math.PI / 3.5, 0.4, 2.0);
    flood2.position.set(14.0, 7.0, 38.0);
    flood2.target.position.set(14.0, 0, 38.0);
    flood2.castShadow = true;
    flood2.shadow.mapSize.width = 1024;
    flood2.shadow.mapSize.height = 1024;
    flood2.shadow.camera.near = 0.5;
    flood2.shadow.camera.far = 26.0;
    z3Group.add(flood2);
    z3Group.add(flood2.target);

    // Catwalk PointLight
    const catLight = new THREE.PointLight(0xffeeaa, 16, 12.0, 2.0);
    catLight.position.set(18.0, 4.5, 33.0);
    z3Group.add(catLight);

    const switchMesh = this.buildWallSwitch(z3Group, 'switch_hangar_main', -4.5, 1.3, 23.5, Math.PI / 2);
    this.registerLightFixture('light_hangar_flood_1', flood1, switchMesh);
    this.registerLightFixture('light_hangar_flood_2', flood2, switchMesh);
    this.registerLightFixture('light_hangar_catwalk', catLight, switchMesh);

    // Physics Colliders for Hangar
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_hangar_n_wall',
      min: new THREE.Vector3(-5.0, 0, 44.8),
      max: new THREE.Vector3(22.0, hH, 45.2),
      surface: SURFACE_TYPES.METAL
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_hangar_e_wall',
      min: new THREE.Vector3(21.8, 0, 22.0),
      max: new THREE.Vector3(22.2, hH, 45.0),
      surface: SURFACE_TYPES.METAL
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_hangar_w_wall',
      min: new THREE.Vector3(-5.2, 0, 22.0),
      max: new THREE.Vector3(-4.8, hH, 45.0),
      surface: SURFACE_TYPES.METAL
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_hangar_s_left',
      min: new THREE.Vector3(-5.0, 0, 21.8),
      max: new THREE.Vector3(3.0, hH, 22.2),
      surface: SURFACE_TYPES.METAL
    }));
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_hangar_s_right',
      min: new THREE.Vector3(9.0, 0, 21.8),
      max: new THREE.Vector3(22.0, hH, 22.2),
      surface: SURFACE_TYPES.METAL
    }));

    this.group.add(z3Group);
  }

  buildShredderCompactor(parentGroup: THREE.Object3D, x: number, z: number): void {
    const compGroup = new THREE.Group();
    compGroup.position.set(x, 0, z);

    // Green industrial housing (merged): chamfered body, plinth, access hatches, bolted flanges
    const body = [
      P.rbox(4.5, 2.2, 5.5, 0.08, 0, 1.3, 0, 0, 0, 0, 3),
      P.box(4.7, 0.2, 5.7, 0, 0.1, 0), // plinth
      P.box(4.2, 0.12, 5.2, 0, 2.46, 0), // top deck
      P.box(1.4, 1.2, 0.08, 1.0, 1.3, 2.78), P.box(1.4, 1.2, 0.08, -1.0, 1.3, 2.78), // hatches
      P.box(0.08, 1.0, 1.6, 2.28, 1.3, -1.2), P.box(0.08, 1.0, 1.6, 2.28, 1.3, 1.2)
    ];
    for (let i = 0; i < 10; i++) { // bolt heads along the plinth
      body.push(P.cyl(0.05, 0.05, 0.04, 6, -2.0 + i * 0.45, 0.22, 2.86, Math.PI / 2, 0, 0));
    }
    const shell = new THREE.Mesh(mergeParts(body, { tile: 1.2 }), this.matShredderPaint);
    shell.castShadow = true;
    shell.receiveShadow = true;
    compGroup.add(shell);

    // Hopper funnel (double-sided, tapered) with throat rim
    const hopper = new THREE.Mesh(
      mergeParts([
        { geometry: new THREE.CylinderGeometry(2.2, 1.2, 1.8, 12, 1, true), position: [0, 3.35, 0], rotation: [0, Math.PI / 12, 0] },
        P.torus(2.2, 0.07, 6, 20, 0, 4.25, 0, Math.PI / 2, 0, 0)
      ], { tile: 1.5 }),
      this.matShredderPaint
    );
    hopper.material = this.matShredderPaint.clone();
    hopper.material.side = THREE.DoubleSide;
    compGroup.add(hopper);

    // Cutter rollers with teeth visible through the hopper throat
    const rollerParts = [];
    for (const rx of [-0.5, 0.5]) {
      rollerParts.push(P.cyl(0.35, 0.35, 2.4, 14, rx, 2.7, 0, Math.PI / 2, 0, 0));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        for (let k = -2; k <= 2; k++) {
          rollerParts.push(P.box(0.18, 0.12, 0.14, rx + Math.cos(a) * 0.38, 2.7 + Math.sin(a) * 0.38, k * 0.42, 0, 0, a));
        }
      }
    }
    compGroup.add(new THREE.Mesh(mergeParts(rollerParts, { tile: 1.0 }), this.matDarkSteel));

    // Hazard band around the housing (yellow / black warning stripes)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 5.6), this.matYellowHazard);
    stripe.position.y = 0.45;
    compGroup.add(stripe);

    // Control terminal: cabinet with screen, buttons, mushroom e-stop and pipework
    const panelParts = mergeParts([
      P.rbox(0.6, 1.1, 0.4, 0.03, 0, 0, 0), P.box(0.5, 0.25, 0.02, 0, 0.3, 0.21, -0.3, 0, 0),
      P.cyl(0.05, 0.05, 0.05, 10, -0.15, 0.0, 0.23, Math.PI / 2, 0, 0), P.cyl(0.03, 0.03, 0.04, 8, 0.05, 0.0, 0.22, Math.PI / 2, 0, 0), P.cyl(0.03, 0.03, 0.04, 8, 0.15, 0.0, 0.22, Math.PI / 2, 0, 0),
      P.box(0.2, 0.08, 0.2, 0, -0.59, 0)
    ], { tile: 1.0 });
    const panel = new THREE.Mesh(panelParts, this.matHangarSteel);
    panel.position.set(2.6, 0.8, 0);
    panel.rotation.y = Math.PI / 2;
    compGroup.add(panel);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.18), new THREE.MeshBasicMaterial({ color: 0x1d6b3a }));
    screen.position.set(2.82, 1.1, 0.0);
    screen.rotation.y = Math.PI / 2;
    screen.rotation.x = -0.3;
    compGroup.add(screen);

    parentGroup.add(compGroup);
    this._addContact(x, z, 4.9, 6.0);

    // Physics collider
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_shredder_compactor',
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 1.8, z),
      size: new THREE.Vector3(4.8, 3.6, 5.8)
    }));
  }

  buildGantryCrane(parentGroup: THREE.Object3D, hX: number, hZ: number, hW: number, hL: number, hH: number): void {
    const craneGroup = new THREE.Group();

    // Dual yellow I-beam runway girders with end trucks and rail clips (merged)
    const beams: MergePart[] = [];
    for (const dx of [-6.0, 6.0]) {
      createSteelBeam(hL - 1.0, 0.5, 0.3).forEach((q) => {
        const [qx, qy, qz] = q.position ?? ORIGIN;
        beams.push({ ...q, position: [dx + qx, hH - 0.5 + qy, qz] });
      });
    }
    beams.push(P.box(12.6, 0.12, 0.3, 0, hH - 0.9, -hL / 2 + 1.5), P.box(12.6, 0.12, 0.3, 0, hH - 0.9, hL / 2 - 1.5));
    craneGroup.add(new THREE.Mesh(mergeParts(beams, { tile: 1.0 }), this.matYellowHazard));
    craneGroup.position.set(hX, 0, hZ);

    // Traveling hoist bridge (I-beam), trolley block, drum, chain and hook
    const bridge = createSteelBeam(12.3, 0.4, 0.25, 0.03, 0.04).map((q): MergePart => {
      const [qx, qy, qz] = q.position ?? ORIGIN;
      return { ...q, rotation: [0, Math.PI / 2, 0], position: [qz, hH - 0.8 + qy, -2.0 + qx] };
    });
    craneGroup.add(new THREE.Mesh(mergeParts(bridge, { tile: 1.0 }), this.matYellowHazard));

    const hoist = [
      P.rbox(0.7, 0.5, 0.6, 0.05, 0, hH - 1.25, -2.0), P.cyl(0.18, 0.18, 0.6, 12, 0, hH - 1.55, -2.0, Math.PI / 2, 0, 0)
    ];
    for (let i = 0; i < 9; i++) { // chain links alternate orientation
      hoist.push(P.torus(0.045, 0.012, 5, 8, 0, hH - 1.95 - i * 0.22, -2.0, 0, i % 2 ? Math.PI / 2 : 0, 0));
    }
    hoist.push(P.rbox(0.18, 0.28, 0.12, 0.02, 0, hH - 4.1, -2.0), { geometry: new THREE.TorusGeometry(0.22, 0.05, 8, 14, Math.PI * 1.5), position: [0, hH - 4.4, -2.0], rotation: [0, 0, Math.PI / 2] });
    const hoistMesh = new THREE.Mesh(mergeParts(hoist, { tile: 1.0 }), this.matDarkSteel);
    hoistMesh.castShadow = true;
    craneGroup.add(hoistMesh);
    // positions above were given in hangar-local (hX, hZ) frame offsets; shift group to hangar centre
    parentGroup.add(craneGroup);
  }

  buildCatwalkAndStairs(parentGroup: THREE.Object3D): void {
    const catGroup = new THREE.Group();

    // Catwalk grating deck (elevated at Y = 2.8m, along East wall) with stringers, posts, rails, toe boards
    const deck = [
      P.box(2.5, 0.06, 16.0, 19.5, 2.8, 33.0),
      P.box(0.1, 0.22, 16.0, 18.3, 2.68, 33.0), P.box(0.1, 0.22, 16.0, 20.7, 2.68, 33.0),
      P.box(0.05, 0.12, 16.0, 18.26, 2.9, 33.0), P.box(0.05, 0.12, 16.0, 20.74, 2.9, 33.0) // toe boards
    ];
    for (let i = 0; i <= 8; i++) { // cross members + support legs
      const z = 25.0 + i * 2.0;
      deck.push(P.box(2.4, 0.1, 0.08, 19.5, 2.7, z));
      deck.push(P.box(0.12, 2.7, 0.12, 18.4, 1.35, z), P.box(0.12, 2.7, 0.12, 20.6, 1.35, z));
      deck.push(P.cyl(0.025, 0.025, 1.0, 6, 18.3, 3.3, z), P.cyl(0.025, 0.025, 1.0, 6, 20.7, 3.3, z)); // railing posts
    }
    // top and mid rails on both sides
    for (const rx of [18.3, 20.7]) {
      deck.push(tube([rx, 3.8, 25.0], [rx, 3.8, 41.0], 0.03), tube([rx, 3.3, 25.0], [rx, 3.3, 41.0], 0.02));
    }
    const walkway = new THREE.Mesh(mergeParts(deck, { tile: 1.0 }), this.matGalvanized);
    walkway.castShadow = true;
    walkway.receiveShadow = true;
    catGroup.add(walkway);

    // Steel stairs ascending to catwalk (14 treads, same positions as the collision-free original)
    const stepCount = 14;
    const stairs = [];
    for (let i = 0; i < stepCount; i++) {
      const sy = (i + 1) * 0.2;
      const sz = 24.5 - i * 0.32;
      stairs.push(P.box(1.6, 0.06, 0.35, 19.5, sy, sz), P.box(1.6, 0.02, 0.04, 19.5, sy - 0.1, sz + 0.17)); // tread + riser lip
    }
    stairs.push(tube([18.65, 0.1, 24.7], [18.65, 2.7, 20.2], 0.04), tube([20.35, 0.1, 24.7], [20.35, 2.7, 20.2], 0.04)); // stringers
    stairs.push(tube([18.65, 1.0, 24.7], [18.65, 3.6, 20.2], 0.025), tube([20.35, 1.0, 24.7], [20.35, 3.6, 20.2], 0.025)); // handrails
    const stairMesh = new THREE.Mesh(mergeParts(stairs, { tile: 1.0 }), this.matGalvanized);
    stairMesh.castShadow = true;
    catGroup.add(stairMesh);

    parentGroup.add(catGroup);

    // Collider for catwalk
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_catwalk_walkway',
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      min: new THREE.Vector3(18.2, 0, 25.0),
      max: new THREE.Vector3(20.8, 2.9, 41.0)
    }));
  }

  buildOilDrums(parentGroup: THREE.Object3D, x: number, z: number): void {
    const drumColors = [0x992222, 0x1f4488, 0x226633];

    const offsets: Vec3Tuple[] = [
      [0, 0.45, 0],
      [0.65, 0.45, 0.1],
      [-0.65, 0.45, -0.1],
      [0.32, 0.45, 0.55],
      [-0.32, 0.45, 0.55],
      // Upper tier
      [0.32, 1.35, 0.1],
      [-0.32, 1.35, 0.1]
    ];

    // One InstancedMesh for the whole pile (shared drum geometry, per-instance paint colour)
    this._drumGeo = this._drumGeo || createDrumGeometry();
    const drums = new THREE.InstancedMesh(this._drumGeo, this.matDrumPaint, offsets.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    offsets.forEach(([dx, dy, dz], i) => {
      e.set(0, i * 1.3, i === 4 ? 0.04 : 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x + dx, dy, z + dz), q, new THREE.Vector3(1, 1, 1));
      drums.setMatrixAt(i, m);
      drums.setColorAt(i, c.setHex(drumColors[i % drumColors.length] ?? 0));
    });
    drums.castShadow = true;
    drums.receiveShadow = true;
    parentGroup.add(drums);
    this._addContact(x, z, 2.1, 2.0);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_oil_drums_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.9, z),
      size: new THREE.Vector3(2.0, 1.8, 2.0)
    }));
  }

  /* -------------------------------------------------------------
   * ZONE 4: KUTYATELEP & SUFNI (KENNEL & WOODEN SHEDS) (Point 43)
   * Bounds: X: -28.0 to -12.0, Z: 28.0 to 46.0
   * ----------------------------------------------------------- */
  buildZone4KutyatelepSufni(): void {
    const z4Group = new THREE.Group();
    z4Group.name = 'Zone4_Kutyatelep_Sufni';

    // 1. Dilapidated Wooden Storage Shed 1 (X: -20, Z: 33)
    this.buildWoodenShed(z4Group, 'sufni_1', -20.0, 33.0, 4.5, 4.0, 2.6);

    // 2. Dilapidated Wooden Storage Shed 2 (X: -20, Z: 41)
    this.buildWoodenShed(z4Group, 'sufni_2', -20.0, 41.0, 4.5, 4.0, 2.6);

    // 3. Chain-link Dog Pens / Kennels (X: -14.0, Z: 36.0)
    this.buildDogKennels(z4Group, -14.0, 36.0);

    // 4. Glowing Burn Barrels with Embers (Point 43)
    this.buildBurnBarrel(z4Group, -16.0, 29.5);
    this.buildBurnBarrel(z4Group, -24.0, 37.0);

    // 5. Lighting
    const shedLight1 = new THREE.PointLight(0xffaa55, 14, 8.0, 2.0);
    shedLight1.position.set(-20.0, 2.4, 33.0);
    z4Group.add(shedLight1);

    const shedLight2 = new THREE.PointLight(0xffaa55, 14, 8.0, 2.0);
    shedLight2.position.set(-20.0, 2.4, 41.0);
    z4Group.add(shedLight2);

    const switchMesh = this.buildWallSwitch(z4Group, 'switch_sufni', -17.8, 1.3, 32.5, 0);
    this.registerLightFixture('light_sufni_1', shedLight1, switchMesh);
    this.registerLightFixture('light_sufni_2', shedLight2, switchMesh);

    this.group.add(z4Group);
  }

  buildWoodenShed(parentGroup: THREE.Object3D, id: string, x: number, z: number, w: number, l: number, h: number): void {
    const shedGroup = new THREE.Group();
    shedGroup.position.set(x, 0, z);

    // Weathered rotten pine walls
    const wallThick = 0.15;

    // North wall
    const nWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallThick), this.matRottenWood);
    nWall.position.set(0, h / 2, l / 2);
    shedGroup.add(nWall);

    // West wall
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, l), this.matRottenWood);
    wWall.position.set(-w / 2, h / 2, 0);
    shedGroup.add(wWall);

    // East wall (Facing yard, with doorway)
    const eWallTop = new THREE.Mesh(new THREE.BoxGeometry(wallThick, 0.7, 1.2), this.matRottenWood);
    eWallTop.position.set(w / 2, h - 0.35, 0);
    const eWallS = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, (l - 1.2) / 2), this.matRottenWood);
    eWallS.position.set(w / 2, h / 2, -(l + 1.2) / 4);
    const eWallN = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, (l - 1.2) / 2), this.matRottenWood);
    eWallN.position.set(w / 2, h / 2, (l + 1.2) / 4);
    shedGroup.add(eWallTop);
    shedGroup.add(eWallS);
    shedGroup.add(eWallN);

    // South wall
    const sWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallThick), this.matRottenWood);
    sWall.position.set(0, h / 2, -l / 2);
    shedGroup.add(sWall);

    // Sloped corrugated zinc roof (real ridges), battens, corner posts and window frame
    const roofGeo = corrugatedPanel(w + 0.4, l + 0.4, 0.14, 0.03);
    roofGeo.rotateX(-Math.PI / 2);
    roofGeo.translate(0, 0, (l + 0.4) / 2);
    const roofMat = this.matFence;
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, h + 0.1, 0);
    roof.rotation.z = -0.12;
    roof.castShadow = true;
    shedGroup.add(roof);
    const shedDetail = [];
    for (const [cx, cz] of [[-w / 2, -l / 2], [w / 2, -l / 2], [-w / 2, l / 2], [w / 2, l / 2]]) shedDetail.push(P.box(0.2, h, 0.2, cx, h / 2, cz));
    shedDetail.push(P.box(w + 0.2, 0.12, 0.2, 0, h - 0.05, l / 2), P.box(w + 0.2, 0.12, 0.2, 0, h - 0.05, -l / 2));
    for (let i = 0; i < 4; i++) shedDetail.push(P.box(w, 0.06, 0.04, 0, 0.5 + i * 0.6, l / 2 + 0.1)); // horizontal battens (back)
    shedDetail.push(P.box(0.6, 0.06, 0.04, -w / 2 - 0.1, 1.5, 0.0), P.box(0.06, 0.6, 0.04, -w / 2 - 0.1, 1.5, 0.0)); // boarded cross
    const shedFrame = new THREE.Mesh(mergeParts(shedDetail, { tile: 1.2 }), this.matRottenWood);
    shedFrame.castShadow = true;
    shedGroup.add(shedFrame);
    this._addContact(x, z, w, l);

    // Hinged wooden door at doorway (x + w/2, 0, z - 0.6)
    const doorPivot = new THREE.Group();
    doorPivot.position.set(w / 2, 0, -0.6);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 1.2), this.matRottenWood);
    doorMesh.position.set(0, 0.95, 0.6);
    doorPivot.add(doorMesh);
    const doorBraces = new THREE.Mesh(mergeParts([
      P.box(0.04, 0.12, 1.2, 0.06, 0.3, 0.6), P.box(0.04, 0.12, 1.2, 0.06, 1.6, 0.6), tube([0.07, 0.3, 0.1], [0.07, 1.6, 1.1], 0.05, 4),
      P.box(0.05, 0.16, 0.05, 0.08, 0.95, 1.05), P.cyl(0.015, 0.015, 0.12, 6, 0.1, 0.95, 1.05, Math.PI / 2, 0, 0),
      P.cyl(0.02, 0.02, 0.18, 6, 0, 0.3, 0.0), P.cyl(0.02, 0.02, 0.18, 6, 0, 1.6, 0.0)
    ], { tile: 1.2 }), this.matRottenWood);
    doorPivot.add(doorBraces);
    shedGroup.add(doorPivot);

    parentGroup.add(shedGroup);

    // Register door
    const hingedDoor = new HingedDoor({
      id: `door_${id}`,
      name: `Sufni Ajtó (${id})`,
      zone: ZONE_KEYS.ZONE4,
      doorMesh: doorPivot,
      pivot: new THREE.Vector3(x + w / 2, 0, z - 0.6),
      closedAngle: 0,
      openAngle: -Math.PI / 2.1,
      width: 1.2,
      height: 1.9,
      thickness: 0.1,
      surface: SURFACE_TYPES.MUD
    });
    this.mapColliders.addDoor(hingedDoor);

    // Colliders
    this.mapColliders.addCollider(new BoxCollider({
      id: `col_${id}_walls`,
      tag: 'wall',
      surface: SURFACE_TYPES.MUD,
      center: new THREE.Vector3(x, h / 2, z),
      size: new THREE.Vector3(w, h, l)
    }));
  }

  buildDogKennels(parentGroup: THREE.Object3D, x: number, z: number): void {
    const penGroup = new THREE.Group();
    penGroup.position.set(x, 0, z);

    // Rusted pipe frame & chain-link wire pens
    const penW = 3.5;
    const penL = 6.0;
    const penH = 2.0;

    // Pipe frame (posts, top and bottom rails, mid rail, gate frame), merged
    const frame = [];
    for (const [px, pz] of [[-penW / 2, -penL / 2], [penW / 2, -penL / 2], [-penW / 2, penL / 2], [penW / 2, penL / 2], [-penW / 2, 0], [penW / 2, 0]]) {
      frame.push(P.cyl(0.04, 0.04, penH, 8, px, penH / 2, pz));
    }
    for (const px of [-penW / 2, penW / 2]) {
      frame.push(tube([px, penH, -penL / 2], [px, penH, penL / 2], 0.03), tube([px, 0.1, -penL / 2], [px, 0.1, penL / 2], 0.03), tube([px, 1.0, -penL / 2], [px, 1.0, penL / 2], 0.02));
    }
    for (const pz of [-penL / 2, penL / 2]) {
      frame.push(tube([-penW / 2, penH, pz], [penW / 2, penH, pz], 0.03), tube([-penW / 2, 0.1, pz], [penW / 2, 0.1, pz], 0.03));
    }
    // two dog houses
    frame.push(P.box(1.1, 0.8, 1.0, -0.9, 0.4, -1.8), P.box(1.2, 0.08, 1.1, -0.9, 0.84, -1.8, 0, 0, 0.1));
    frame.push(P.box(1.1, 0.8, 1.0, 0.9, 0.4, 1.9), P.box(1.2, 0.08, 1.1, 0.9, 0.84, 1.9, 0, 0, -0.1));
    const frameMesh = new THREE.Mesh(mergeParts(frame, { tile: 1.5 }), this.matRustyMetal);
    frameMesh.castShadow = true;
    penGroup.add(frameMesh);

    // Chain-link panels (alpha tested diamond mesh) on all four sides
    const linkMat = this.matChainLink;
    const sideGeo = new THREE.PlaneGeometry(penL, penH - 0.1);
    const endGeo = new THREE.PlaneGeometry(penW, penH - 0.1);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(sideGeo, linkMat);
      side.position.set(sx * penW / 2, penH / 2, 0);
      side.rotation.y = Math.PI / 2;
      penGroup.add(side);
    }
    for (const sz of [-1, 1]) {
      const end = new THREE.Mesh(endGeo, linkMat);
      end.position.set(0, penH / 2, sz * penL / 2);
      penGroup.add(end);
    }

    // Stainless steel dog bowls, chain and bone props
    const bowlProfile: LatheProfile = [[0.0001, 0.0], [0.09, 0.0], [0.15, 0.06], [0.18, 0.08], [0.17, 0.08], [0.0001, 0.02]];
    const bowlGeo = mergeParts([
      P.lathe(bowlProfile, 12, 0.4, 0.0, 1.0), P.lathe(bowlProfile, 12, -0.5, 0.0, -1.2, 0, 0, 0.1),
      P.torus(0.02, 0.006, 4, 6, 0.9, 0.01, -1.2, Math.PI / 2, 0, 0)
    ], { tile: 1.0 });
    const bowls = new THREE.Mesh(bowlGeo, this.matChrome);
    penGroup.add(bowls);

    parentGroup.add(penGroup);
    this._addContact(x, z, penW, penL);

    // Pen collider
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_dog_kennels',
      tag: 'fence',
      surface: SURFACE_TYPES.MUD,
      center: new THREE.Vector3(x, penH / 2, z),
      size: new THREE.Vector3(penW, penH, penL)
    }));
  }

  buildBurnBarrel(parentGroup: THREE.Object3D, x: number, z: number): void {
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(x, 0, z);

    // Cut-open steel drum: outer and inner wall, rolling hoops, rim, air holes, charred sticks
    const outer: LatheProfile = [[0.0001, 0.0], [0.3, 0.0], [0.322, 0.03], [0.32, 0.4], [0.335, 0.43], [0.335, 0.47], [0.32, 0.5], [0.322, 0.83], [0.34, 0.85]];
    const inner: LatheProfile = [[0.34, 0.85], [0.31, 0.83], [0.31, 0.04], [0.0001, 0.04]];
    const drum = new THREE.Mesh(
      mergeParts([
        P.lathe(outer, 16), P.lathe(inner, 16),
        P.box(0.12, 0.05, 0.02, 0.32, 0.2, 0.0, 0, 0, 0), P.box(0.12, 0.05, 0.02, -0.32, 0.2, 0.0), P.box(0.02, 0.05, 0.12, 0.0, 0.2, 0.32), // air holes
        P.box(0.5, 0.05, 0.06, 0.0, 0.62, 0.0, 0, 0.5, 0.35), P.box(0.5, 0.05, 0.06, 0.0, 0.58, 0.0, 0, -0.7, -0.3), P.box(0.45, 0.05, 0.06, 0.0, 0.55, 0.0, 0.3, 0.2, 0.0) // charred sticks
      ], { tile: 1.0 }),
      this.matRustyMetal
    );
    drum.castShadow = true;
    barrelGroup.add(drum);

    // Glowing ember bed inside barrel
    const embers = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
    embers.rotation.x = -Math.PI / 2;
    embers.position.y = 0.55;
    barrelGroup.add(embers);

    // Flames: three crossed additive cones, animated in update()
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff8a1f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const flameGeo = new THREE.ConeGeometry(0.2, 0.7, 7, 1, true);
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(Math.cos(i * 2.1) * 0.08, 0.95, Math.sin(i * 2.1) * 0.08);
      flame.userData.phase = i * 2.1;
      flame.userData.baseY = 0.95;
      barrelGroup.add(flame);
      this.burnFlames.push(flame);
    }

    // Flickering warm fire point light
    const fireLight = new THREE.PointLight(0xff5511, 10, 7.0, 2.0);
    fireLight.position.set(0, 0.6, 0);
    barrelGroup.add(fireLight);
    this.burnBarrelLights.push(fireLight);

    parentGroup.add(barrelGroup);
    this._addContact(x, z, 0.8, 0.8);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_burn_barrel_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.45, z),
      size: new THREE.Vector3(0.7, 0.9, 0.7)
    }));
  }

  /* -------------------------------------------------------------
   * ZONE 5: ÓCSKAVAS LERAKAT (RAW SCRAP YARD) (Point 44, 54)
   * Bounds: X: 20.0 to 35.0, Z: 8.0 to 38.0
   * ----------------------------------------------------------- */
  buildZone5OcskavasLerakat(): void {
    const z5Group = new THREE.Group();
    z5Group.name = 'Zone5_Ocskavas_Lerakat';

    // 1. Spools of thick stripped red copper cable ("Vörösréz tekercsek")
    this.buildCopperWireSpool(z5Group, 24.0, 14.0);
    this.buildCopperWireSpool(z5Group, 29.0, 18.0);

    // 2. Cast-Iron Heating Radiators piled 2m high
    this.buildRadiatorPiles(z5Group, 24.0, 27.0);

    // 3. Rusted Engine Blocks on wooden pallets with oil spills
    this.buildEngineBlocks(z5Group, 30.0, 31.0);

    // 4. Tangled Bicycle Frames (Csepel camping biciklik)
    this.buildBicycleScrap(z5Group, 28.0, 36.0);

    // 5. Physics Throwable Scrap Props (Point 54)
    this.buildThrowableScrapProps(z5Group);

    this.group.add(z5Group);
  }

  buildCopperWireSpool(parentGroup: THREE.Object3D, x: number, z: number): void {
    const spoolGroup = new THREE.Group();
    spoolGroup.position.set(x, 0, z);

    // Wooden spool: two planked flanges with bolt heads, axle drum
    const flangeProfile: LatheProfile = [[0.0001, -0.05], [0.9, -0.05], [0.9, 0.05], [0.0001, 0.05]];
    const wood = [];
    for (const sx of [-0.6, 0.6]) {
      wood.push(P.lathe(flangeProfile, 16, sx, 0.9, 0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        wood.push(P.cyl(0.03, 0.03, 0.03, 6, sx + Math.sign(sx) * 0.05, 0.9 + Math.sin(a) * 0.78, Math.cos(a) * 0.78, 0, 0, Math.PI / 2));
      }
    }
    wood.push(P.cyl(0.25, 0.25, 1.2, 12, 0, 0.9, 0, 0, 0, Math.PI / 2));
    const spoolWood = new THREE.Mesh(mergeParts(wood, { tile: 1.5 }), this.matRottenWood);
    spoolWood.castShadow = true;
    spoolGroup.add(spoolWood);

    // Wrapped copper cable layers (ribbed by stacked tori) and a loose end
    const coil = [P.cyl(0.75, 0.75, 1.1, 20, 0, 0.9, 0, 0, 0, Math.PI / 2)];
    for (let i = 0; i < 9; i++) coil.push(P.torus(0.75, 0.035, 5, 20, -0.48 + i * 0.12, 0.9, 0, 0, Math.PI / 2, 0));
    coil.push(tube([0.55, 0.55, 0.6], [0.55, 0.05, 1.0], 0.03), tube([0.55, 0.05, 1.0], [0.1, 0.03, 1.4], 0.03));
    const wire = new THREE.Mesh(mergeParts(coil, { tile: 1.0 }), this.matCopper);
    wire.castShadow = true;
    spoolGroup.add(wire);

    parentGroup.add(spoolGroup);
    this._addContact(x, z, 1.4, 1.8);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_copper_spool_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.9, z),
      size: new THREE.Vector3(1.4, 1.8, 1.8)
    }));
  }

  buildRadiatorPiles(parentGroup: THREE.Object3D, x: number, z: number): void {
    const pileGroup = new THREE.Group();
    pileGroup.position.set(x, 0, z);

    // Cast-iron column radiators: 11 ribbed sections joined by top and bottom manifolds
    const radParts = [P.cyl(0.04, 0.04, 1.6, 8, 0, 0.3, 0, 0, 0, Math.PI / 2), P.cyl(0.04, 0.04, 1.6, 8, 0, -0.3, 0, 0, 0, Math.PI / 2)];
    for (let i = 0; i < 11; i++) {
      const rx = -0.7 + i * 0.14;
      radParts.push(P.rbox(0.11, 0.72, 0.2, 0.04, rx, 0, 0, 0, 0, 0, 1));
      radParts.push(P.cyl(0.035, 0.035, 0.03, 6, rx, 0.32, 0, 0, 0, Math.PI / 2));
    }
    radParts.push(P.box(0.06, 0.12, 0.1, -0.78, -0.4, 0), P.box(0.06, 0.12, 0.1, 0.78, -0.4, 0)); // feet
    const radGeo = mergeParts(radParts, { tile: 1.0 });
    const radMat = getPBRMaterial('rust', { color: 0x55585d, tile: 0.8 });
    const placements: MergePart[] = [];
    for (let r = 0; r < 6; r++) {
      placements.push({ geometry: radGeo, position: [0, 0.4 + r * 0.28, r % 2 === 0 ? 0.05 : -0.05], rotation: [0, (r % 2) * 0.1, 0] });
    }
    const pile = new THREE.Mesh(mergeParts(placements, { tile: 1.0 }), radMat);
    pile.castShadow = true;
    pile.receiveShadow = true;
    pileGroup.add(pile);

    parentGroup.add(pileGroup);
    this._addContact(x, z, 1.8, 1.4);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_radiator_pile_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 1.0, z),
      size: new THREE.Vector3(1.8, 2.0, 1.4)
    }));
  }

  buildEngineBlocks(parentGroup: THREE.Object3D, x: number, z: number): void {
    const engineGroup = new THREE.Group();
    engineGroup.position.set(x, 0, z);

    // Weathered wooden pallet: deck boards on three stringers
    const pallet = [];
    for (let i = 0; i < 5; i++) pallet.push(P.box(1.4, 0.03, 0.2, 0, 0.145, -0.6 + i * 0.3));
    for (let i = 0; i < 3; i++) pallet.push(P.box(0.12, 0.1, 1.4, -0.6 + i * 0.6, 0.065, 0));
    const palletMesh = new THREE.Mesh(mergeParts(pallet, { tile: 1.2 }), this.matRottenWood);
    palletMesh.receiveShadow = true;
    engineGroup.add(palletMesh);

    // Cast-iron V6 engine block: crankcase, two cylinder banks with heads and valve covers, sump, bell housing
    const blk = [
      P.rbox(0.8, 0.36, 0.9, 0.03, 0, 0.4, 0, 0, 0, 0, 2),
      P.rbox(0.7, 0.12, 0.8, 0.03, 0, 0.18, 0, 0, 0, 0), // oil pan
      P.cyl(0.14, 0.14, 0.3, 10, 0, 0.45, -0.58, Math.PI / 2, 0, 0), // bell housing
      P.cyl(0.1, 0.1, 0.05, 10, 0, 0.45, 0.47, Math.PI / 2, 0, 0) // crank pulley
    ];
    for (const side of [-1, 1]) {
      blk.push(P.rbox(0.28, 0.14, 0.82, 0.02, side * 0.26, 0.68, 0, 0, 0, side * -0.4)); // head
      blk.push(P.rbox(0.2, 0.08, 0.76, 0.02, side * 0.31, 0.77, 0, 0, 0, side * -0.4)); // valve cover
      for (let i = 0; i < 3; i++) blk.push(P.cyl(0.07, 0.07, 0.14, 8, side * 0.2, 0.6, -0.28 + i * 0.28, 0, 0, side * -0.4)); // cylinder pots
    }
    blk.push(tube([-0.15, 0.85, -0.3], [-0.3, 0.55, 0.45], 0.03), tube([0.15, 0.85, 0.3], [0.3, 0.55, -0.4], 0.03)); // manifolds
    const blockMat = getPBRMaterial('rust', { color: 0x3a332d, tile: 0.8 });
    const block = new THREE.Mesh(mergeParts(blk, { tile: 0.8 }), blockMat);
    block.position.y = 0.0;
    block.castShadow = true;
    engineGroup.add(block);

    // Oil spill on the pallet and ground
    const oil = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.85 })
    );
    oil.rotation.x = -Math.PI / 2;
    oil.position.set(0.5, 0.03, 0.6);
    oil.scale.set(1.2, 1.0, 0.8);
    engineGroup.add(oil);

    parentGroup.add(engineGroup);
    this._addContact(x, z, 1.5, 1.5);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_engine_block_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.45, z),
      size: new THREE.Vector3(1.5, 0.9, 1.5)
    }));
  }

  buildBicycleScrap(parentGroup: THREE.Object3D, x: number, z: number): void {
    const bikeGroup = new THREE.Group();
    bikeGroup.position.set(x, 0, z);

    // Tangled bicycles: spoked wheels, diamond frames, bars and saddles (merged). Deterministic scatter.
    const makeBike = () => {
      const bike = [];
      for (const wz of [-0.55, 0.55]) {
        bike.push(P.torus(0.33, 0.013, 5, 18, 0, 0.35, wz, 0, Math.PI / 2, 0));
        bike.push(P.torus(0.31, 0.02, 4, 18, 0, 0.35, wz, 0, Math.PI / 2, 0));
        for (let k = 0; k < 6; k++) bike.push(P.cyl(0.003, 0.003, 0.64, 3, 0, 0.35, wz, (k / 6) * Math.PI, Math.PI / 2 * 0, 0));
        bike.push(P.cyl(0.02, 0.02, 0.1, 6, 0, 0.35, wz, 0, 0, Math.PI / 2));
      }
      bike.push(tube([0, 0.35, -0.55], [0, 0.35, 0.0], 0.014), tube([0, 0.35, 0.0], [0, 0.72, -0.2], 0.014), tube([0, 0.72, -0.2], [0, 0.35, -0.55], 0.014),
        tube([0, 0.72, -0.2], [0, 0.75, 0.35], 0.014), tube([0, 0.75, 0.35], [0, 0.35, 0.55], 0.014), tube([0, 0.75, 0.35], [0, 0.35, 0.0], 0.014),
        tube([-0.2, 0.9, 0.35], [0.2, 0.9, 0.35], 0.011), P.rbox(0.1, 0.04, 0.22, 0.015, 0, 0.78, -0.25));
      return mergeParts(bike, { tile: 1.0 });
    };
    const bikeGeo = makeBike();
    const bikes: Array<{ p: Vec3Tuple; r: Vec3Tuple }> = [
      { p: [0, 0.35, 0], r: [0.1, 0.3, 1.2] }, { p: [0.3, 0.55, 0.2], r: [-0.4, 1.4, 0.8] }, { p: [-0.35, 0.3, -0.25], r: [0.2, 2.4, 1.45] },
      { p: [0.15, 0.2, -0.45], r: [1.2, 0.5, 0.1] }, { p: [-0.1, 0.65, 0.35], r: [0.6, 3.6, -0.7] }
    ];
    const bikeMesh = new THREE.Mesh(mergeParts(bikes.map((b) => ({ geometry: bikeGeo, position: b.p, rotation: b.r })), { tile: 1.0 }), this.matRustyMetal);
    bikeMesh.castShadow = true;
    bikeGroup.add(bikeMesh);

    parentGroup.add(bikeGroup);
    this._addContact(x, z, 1.8, 1.8);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_bicycle_scrap_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.5, z),
      size: new THREE.Vector3(1.8, 1.0, 1.8)
    }));
  }

  buildThrowableScrapProps(parentGroup: THREE.Object3D): void {
    // Small physics scrap objects for ghost and player throwing (Point 54)
    const scrapDefs: Array<{ id: string; type: 'pipe' | 'can' | 'muffler'; pos: Vec3Tuple }> = [
      { id: 'scrap_pipe_1', type: 'pipe', pos: [22.5, 0.1, 10.5] },
      { id: 'scrap_pipe_2', type: 'pipe', pos: [26.0, 0.1, 22.0] },
      { id: 'scrap_can_1', type: 'can', pos: [25.0, 0.06, 15.0] },
      { id: 'scrap_can_2', type: 'can', pos: [31.0, 0.06, 28.0] },
      { id: 'scrap_muffler_1', type: 'muffler', pos: [28.5, 0.15, 33.0] }
    ];

    scrapDefs.forEach(s => {
      let mesh;
      if (s.type === 'pipe') {
        // Steel pipe with weld flange and a dented end
        const pGeo = mergeParts([
          P.cyl(0.04, 0.04, 0.8, 10, 0, 0, 0, 0, 0, Math.PI / 2), P.cyl(0.07, 0.07, 0.03, 10, 0.34, 0, 0, 0, 0, Math.PI / 2),
          P.cyl(0.05, 0.05, 0.05, 10, -0.38, 0, 0, 0, 0, Math.PI / 2), P.sphere(0.03, 1, 1, 1, 0.18, 0.03, 0.02, 6)
        ], { tile: 0.5 });
        mesh = new THREE.Mesh(pGeo, this.matRustyMetal);
      } else if (s.type === 'can') {
        // Crushed drinks can: lathe with rolled rim and tab
        const cGeo = mergeParts([
          P.lathe([[0.0001, -0.06], [0.034, -0.06], [0.04, -0.04], [0.04, 0.045], [0.033, 0.058], [0.03, 0.06], [0.0001, 0.058]], 12),
          P.box(0.02, 0.003, 0.014, 0, 0.062, 0)
        ], { tile: 0.3 });
        mesh = new THREE.Mesh(cGeo, this.matGalvanized);
      } else {
        // Exhaust muffler: oval shell with end caps and inlet / outlet pipes
        const mGeo = mergeParts([
          P.cyl(0.1, 0.1, 0.4, 12, 0, 0, 0, Math.PI / 2, 0, 0), P.cyl(0.1, 0.1, 0.4, 12, 0, 0, 0, Math.PI / 2, 0, 0),
          P.cyl(0.03, 0.03, 0.3, 8, 0, 0.02, 0.35, Math.PI / 2, 0, 0), P.cyl(0.03, 0.03, 0.2, 8, 0.03, -0.02, -0.3, Math.PI / 2, 0, 0.1),
          P.torus(0.1, 0.012, 4, 12, 0, 0, 0.2, 0, 0, 0), P.torus(0.1, 0.012, 4, 12, 0, 0, -0.2, 0, 0, 0)
        ], { tile: 0.5 });
        mGeo.scale(1.0, 0.75, 1.0);
        mesh = new THREE.Mesh(mGeo, this.matRustyMetal);
      }
      mesh.castShadow = true;
      mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
      mesh.userData = {
        isThrowableScrap: true,
        scrapId: s.id,
        action: 'pickup_scrap',
        promptHu: '[E] Vasdarab felvétele'
      };
      parentGroup.add(mesh);
      this.interactiveProps.push(mesh);
    });
  }

  /* -------------------------------------------------------------
   * UTILITIES: LOCKERS, WALL SWITCHES, LIGHT FIXTURES
   * ----------------------------------------------------------- */
  buildLocker(parentGroup: THREE.Object3D, id: string, x: number, z: number, zoneKey: ZoneKey): void {
    const lockerGroup = new THREE.Group();
    lockerGroup.position.set(x, 0, z);

    const lW = 0.7;
    const lH = 2.1;
    const lL = 0.65;

    // Metal cabinet body (plinth feet, cap) and door with louvres, handle, number plate, hinge knuckles
    this._lockerKit = this._lockerKit || createLockerGeometries(lW, lH, lL);
    const body = new THREE.Mesh(this._lockerKit.body, this.matLockerPaint);
    body.castShadow = true;
    body.receiveShadow = true;
    lockerGroup.add(body);

    // Hinged locker door
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-lW / 2, 0, lL / 2);
    const doorMesh = new THREE.Mesh(this._lockerKit.doorPaint, this.matLockerPaint);
    doorMesh.castShadow = true;
    doorPivot.add(doorMesh);
    doorPivot.add(new THREE.Mesh(this._lockerKit.doorTrim, this.matChrome));
    lockerGroup.add(doorPivot);

    parentGroup.add(lockerGroup);
    this._addContact(x, z, lW + 0.1, lL + 0.1);

    const hingedDoor = new HingedDoor({
      id: `door_${id}`,
      name: 'Fémszekrény Ajtó',
      zone: zoneKey,
      doorMesh: doorPivot,
      pivot: new THREE.Vector3(x - lW / 2, 0, z + lL / 2),
      closedAngle: 0,
      openAngle: Math.PI / 2.2,
      width: lW,
      height: lH,
      thickness: 0.06,
      surface: SURFACE_TYPES.METAL
    });

    const hidingSpot = new HidingSpot({
      id,
      type: 'locker',
      name: 'Fémszekrény',
      zone: zoneKey,
      bounds: new THREE.Box3(
        new THREE.Vector3(x - lW / 2, 0, z - lL / 2),
        new THREE.Vector3(x + lW / 2, lH, z + lL / 2)
      ),
      door: hingedDoor,
      mesh: lockerGroup
    });

    this.mapColliders.addHidingSpot(hidingSpot);

    body.userData = {
      isInteractive: true,
      action: 'toggle_hiding',
      targetId: id,
      promptHu: '[E] Szekrény kinyitása / bújás'
    };
    this.interactiveProps.push(body);
  }

  buildWallSwitch(parentGroup: THREE.Object3D, id: string, x: number, y: number, z: number, rotY = 0): THREE.Group {
    const swGroup = new THREE.Group();
    swGroup.position.set(x, y, z);
    swGroup.rotation.y = rotY;

    const baseGeo = new THREE.BoxGeometry(0.16, 0.24, 0.03);
    const base = new THREE.Mesh(baseGeo, this.matGalvanized);
    swGroup.add(base);
    // cover plate, screws, conduit and a "bakelite" rocker housing
    swGroup.add(new THREE.Mesh(mergeParts([
      P.rbox(0.12, 0.2, 0.012, 0.01, 0, 0, 0.02), P.cyl(0.008, 0.008, 0.008, 6, 0, 0.085, 0.028, Math.PI / 2, 0, 0), P.cyl(0.008, 0.008, 0.008, 6, 0, -0.085, 0.028, Math.PI / 2, 0, 0),
      P.rbox(0.05, 0.09, 0.02, 0.01, 0, 0, 0.032), tube([0, 0.12, 0], [0, 0.5, 0], 0.012, 6)
    ], { tile: 0.5 }), this.matRubber));

    const toggleGeo = new THREE.BoxGeometry(0.02, 0.05, 0.03);
    const toggle = new THREE.Mesh(
      toggleGeo,
      new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xaa7711, emissiveIntensity: 0.9, roughness: 0.4 })
    );
    toggle.position.set(0, 0, 0.05);
    swGroup.add(toggle);

    base.userData = {
      isInteractive: true,
      action: 'toggle_switch',
      switchId: id,
      promptHu: '[E] Villanykapcsoló'
    };
    this.interactiveProps.push(base);

    parentGroup.add(swGroup);
    return swGroup;
  }

  registerLightFixture(id: string, lightInstance: YardLight, switchMesh: THREE.Object3D | null = null): void {
    // Visible lamp: dark housing stays, glowing bulb is a child of the light so it hides with it
    if (lightInstance.parent && !lightInstance.userData.lampMesh) {
      const housing = new THREE.Mesh(
        mergeParts([
          P.lathe([[0.0001, 0.12], [0.1, 0.1], [0.24, -0.02], [0.27, -0.06], [0.25, -0.06], [0.22, -0.02], [0.0001, 0.08]], 14, 0, 0, 0), // enamel shade
          P.cyl(0.02, 0.02, 0.25, 6, 0, 0.22, 0), P.cyl(0.05, 0.05, 0.04, 8, 0, 0.0, 0)
        ], { tile: 0.5 }),
        this.matDarkSteel
      );
      housing.castShadow = false;
      housing.position.copy(lightInstance.position).add(new THREE.Vector3(0, 0.1, 0));
      lightInstance.parent.add(housing);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        new THREE.MeshBasicMaterial({ color: lightInstance.color })
      );
      lightInstance.add(bulb);
      lightInstance.userData.lampMesh = bulb;
    }
    this.lightFixtures.set(id, {
      light: lightInstance,
      isOn: true,
      shattered: false,
      switchMesh
    });
    this.activeLights.add(id);
  }

  /* -------------------------------------------------------------
   * ELECTRICAL GRID ACTIONS (Points 48–53)
   * ----------------------------------------------------------- */

  /**
   * Sets master circuit breaker state.
   */
  setBreakerState(isOn: unknown, triggeredBy = 'USER'): { breakerOn: boolean; triggeredBy: string } {
    this.isBreakerOn = Boolean(isOn);
    if (!this.isBreakerOn) {
      this.breakerTripped = true;
      if (this.knifeSwitchPivot) this.knifeSwitchPivot.rotation.x = -Math.PI / 4; // DOWN
      // Turn off all yard light fixtures
      this.lightFixtures.forEach(fix => {
        fix.light.visible = false;
      });
    } else {
      this.breakerTripped = false;
      if (this.knifeSwitchPivot) this.knifeSwitchPivot.rotation.x = Math.PI / 4; // UP
      // Restore active lights
      this.lightFixtures.forEach((fix, id) => {
        if (this.activeLights.has(id) && !fix.shattered) {
          fix.light.visible = true;
        }
      });
    }

    return { breakerOn: this.isBreakerOn, triggeredBy };
  }

  /**
   * Toggles an individual light fixture (with Overload check, Point 50).
   */
  toggleLight(lightId: string): ToggleLightResult {
    const fixture = this.lightFixtures.get(lightId);
    if (!fixture || fixture.shattered) return { success: false, reason: 'shattered' };

    if (!this.isBreakerOn) {
      // Switch mechanically clicks, but stays dark
      fixture.isOn = !fixture.isOn;
      return { success: true, lightOn: false, breakerOff: true };
    }

    if (fixture.isOn) {
      fixture.isOn = false;
      fixture.light.visible = false;
      this.activeLights.delete(lightId);
      return { success: true, lightOn: false };
    }

    // Attempting to turn ON
    if (this.activeLights.size >= this.maxBreakerLights) {
      // Overload! Trip the breaker! (Point 50)
      this.setBreakerState(false, 'OVERLOAD');
      return { success: true, tripped: true, lightOn: false };
    }

    fixture.isOn = true;
    fixture.light.visible = true;
    this.activeLights.add(lightId);
    return { success: true, lightOn: true };
  }

  /**
   * Lightbulb shatter event during intense ghost manifestations (Point 53).
   */
  shatterLight(lightId: string): boolean {
    const fixture = this.lightFixtures.get(lightId);
    if (!fixture) return false;

    fixture.shattered = true;
    fixture.isOn = false;
    fixture.light.visible = false;
    this.activeLights.delete(lightId);
    this.shatteredLights.add(lightId);
    return true;
  }

  /**
   * Triggers Zone 2 Car Alarm Sabotage (Point 55).
   */
  triggerCarAlarm(duration = 10): { success: true; duration: number } {
    this.isCarAlarmActive = true;
    this.carAlarmTimer = duration;
    return { success: true, duration };
  }

  /**
   * Opens or closes entrance gate.
   */
  toggleGate(open: boolean | null = null): { isOpen: boolean } {
    if (open === null) {
      open = !this.leftGateDoor.isOpen;
    }
    if (open) {
      this.leftGateDoor.open();
      this.rightGateDoor.open();
    } else {
      this.leftGateDoor.close();
      this.rightGateDoor.close();
    }
    return { isOpen: open };
  }

  /* -------------------------------------------------------------
   * FRAME UPDATE LOOP
   * ----------------------------------------------------------- */
  update(delta: number): void {
    // 1. Update map colliders & hinged doors
    this.mapColliders.update(delta);

    // 2. Flickering embers in burn barrels
    this.burnBarrelLights.forEach((bLight, i) => {
      bLight.intensity = 9 + Math.sin(Date.now() * 0.008 + i) * 2 + (Math.random() - 0.5) * 1;
    });

    // 2b. Burn barrel flames
    if (this.burnFlames.length) {
      const t = Date.now() * 0.001;
      for (const f of this.burnFlames) {
        const ph = f.userData.phase;
        const k = 0.8 + Math.sin(t * 9 + ph) * 0.18 + Math.sin(t * 17 + ph * 2) * 0.08;
        f.scale.set(1 + Math.sin(t * 7 + ph) * 0.12, k, 1 + Math.cos(t * 8 + ph) * 0.12);
        f.position.y = f.userData.baseY + (k - 0.8) * 0.2;
        f.rotation.y += 0.05;
      }
    }

    // 3. Car alarm headlights blinking
    if (this.isCarAlarmActive) {
      this.carAlarmTimer -= delta;
      const blinkOn = Math.floor(Date.now() / 250) % 2 === 0;
      this.carAlarmHeadlights.forEach(hl => {
        hl.visible = blinkOn;
      });

      if (this.carAlarmTimer <= 0) {
        this.isCarAlarmActive = false;
        this.carAlarmHeadlights.forEach(hl => {
          hl.visible = false;
        });
      }
    }
  }
}
