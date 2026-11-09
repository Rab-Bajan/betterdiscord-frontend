/**
 * ScrapYardMap.js
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
} from './MapColliders.js';

export class ScrapYardMap {
  constructor(options = {}) {
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
  }

  /* -------------------------------------------------------------
   * MATERIALS
   * ----------------------------------------------------------- */
  initMapMaterials() {
    this.matFence = new THREE.MeshStandardMaterial({
      color: 0x5a554a,
      roughness: 0.85,
      metalness: 0.6
    });
    this.matRustyMetal = new THREE.MeshStandardMaterial({
      color: 0x6e3d23,
      roughness: 0.9,
      metalness: 0.5
    });
    this.matGalvanized = new THREE.MeshStandardMaterial({
      color: 0x8a9096,
      roughness: 0.5,
      metalness: 0.7
    });
    this.matRedBrick = new THREE.MeshStandardMaterial({
      color: 0x7c382b,
      roughness: 0.9,
      metalness: 0.05
    });
    this.matConcrete = new THREE.MeshStandardMaterial({
      color: 0x48494c,
      roughness: 0.8,
      metalness: 0.1
    });
    this.matGravel = new THREE.MeshStandardMaterial({
      color: 0x2b2926,
      roughness: 0.95,
      metalness: 0.05
    });
    this.matMud = new THREE.MeshStandardMaterial({
      color: 0x201a14,
      roughness: 0.35, // wet sheen
      metalness: 0.2
    });
    this.matRottenWood = new THREE.MeshStandardMaterial({
      color: 0x3d3023,
      roughness: 0.9,
      metalness: 0.0
    });
    this.matHangarSteel = new THREE.MeshStandardMaterial({
      color: 0x353a42,
      roughness: 0.65,
      metalness: 0.75
    });
    this.matCopper = new THREE.MeshStandardMaterial({
      color: 0xc86432,
      roughness: 0.4,
      metalness: 0.85
    });
    this.matYellowHazard = new THREE.MeshStandardMaterial({
      color: 0xddaa11,
      roughness: 0.4,
      metalness: 0.2
    });
  }

  /* -------------------------------------------------------------
   * PERIMETER FENCE & ENTRANCE GATES (Point 39)
   * Width 70m: X: -34 to +36, Depth 50m: Z: -2 to +48, Height 3.8m
   * ----------------------------------------------------------- */
  buildPerimeterFence() {
    const fenceGroup = new THREE.Group();
    fenceGroup.name = 'Perimeter_Fence_Group';

    const fenceH = 3.8;
    const fenceThickness = 0.15;

    // Helper to generate corrugated fence segments with posts
    const createFenceWall = (startX, startZ, endX, endZ, id) => {
      const length = Math.hypot(endX - startX, endZ - startZ);
      const angle = Math.atan2(endZ - startZ, endX - startX);

      const panelGeo = new THREE.BoxGeometry(length, fenceH, fenceThickness);
      const panel = new THREE.Mesh(panelGeo, this.matFence);
      panel.position.set((startX + endX) / 2, fenceH / 2, (startZ + endZ) / 2);
      panel.rotation.y = -angle;
      panel.castShadow = true;
      panel.receiveShadow = true;
      fenceGroup.add(panel);

      // Steel posts every 3.5m
      const postCount = Math.max(2, Math.floor(length / 3.5));
      const postGeo = new THREE.CylinderGeometry(0.06, 0.06, fenceH + 0.4, 8);
      for (let i = 0; i <= postCount; i++) {
        const t = i / postCount;
        const px = startX + (endX - startX) * t;
        const pz = startZ + (endZ - startZ) * t;
        const post = new THREE.Mesh(postGeo, this.matHangarSteel);
        post.position.set(px, (fenceH + 0.4) / 2, pz);
        fenceGroup.add(post);
      }

      // Barbed Wire helical coils on top (Point 39)
      const wireCount = Math.floor(length / 0.8);
      const coilGeo = new THREE.TorusGeometry(0.22, 0.015, 6, 12);
      for (let i = 0; i < wireCount; i++) {
        const t = (i + 0.5) / wireCount;
        const cx = startX + (endX - startX) * t;
        const cz = startZ + (endZ - startZ) * t;
        const coil = new THREE.Mesh(coilGeo, this.matGalvanized);
        coil.position.set(cx, fenceH + 0.2, cz);
        coil.rotation.y = -angle;
        coil.rotation.x = Math.PI / 4;
        fenceGroup.add(coil);
      }

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

    // 5. Heavy Wrought Iron Double Entrance Gates (at Z = 0, X: -3.0 to +3.0)
    this.buildEntranceGates(fenceGroup);

    this.group.add(fenceGroup);
  }

  buildEntranceGates(fenceGroup) {
    const gateH = 3.6;
    const wingW = 3.0;

    // Left gate wing mesh
    const leftGateGroup = new THREE.Group();
    leftGateGroup.position.set(-3.0, 0, 0); // hinge at left post

    const gateFrameGeo = new THREE.BoxGeometry(wingW, gateH, 0.08);
    const gateFrame = new THREE.Mesh(gateFrameGeo, this.matRustyMetal);
    gateFrame.position.set(wingW / 2, gateH / 2, 0);
    leftGateGroup.add(gateFrame);

    // Bars inside left wing
    const barGeo = new THREE.CylinderGeometry(0.02, 0.02, gateH - 0.2, 6);
    for (let x = 0.3; x < wingW; x += 0.35) {
      const bar = new THREE.Mesh(barGeo, this.matHangarSteel);
      bar.position.set(x, gateH / 2, 0);
      leftGateGroup.add(bar);
    }

    fenceGroup.add(leftGateGroup);

    // Right gate wing mesh
    const rightGateGroup = new THREE.Group();
    rightGateGroup.position.set(3.0, 0, 0); // hinge at right post

    const rightFrame = gateFrame.clone();
    rightFrame.position.set(-wingW / 2, gateH / 2, 0);
    rightGateGroup.add(rightFrame);

    for (let x = 0.3; x < wingW; x += 0.35) {
      const bar = new THREE.Mesh(barGeo, this.matHangarSteel);
      bar.position.set(-x, gateH / 2, 0);
      rightGateGroup.add(bar);
    }

    fenceGroup.add(rightGateGroup);

    // Gate post pillars
    const pillarGeo = new THREE.BoxGeometry(0.4, gateH + 0.5, 0.4);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
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
  buildGroundTerrains() {
    const groundGroup = new THREE.Group();
    groundGroup.name = 'Ground_Terrains_Group';

    // 1. Outside Staging Gravel & Asphalt (Z: -25 to 0)
    const stagingGeo = new THREE.PlaneGeometry(80, 26);
    stagingGeo.rotateX(-Math.PI / 2);
    const stagingMesh = new THREE.Mesh(stagingGeo, this.matGravel);
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
  buildZone1Mazsahaz() {
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
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x99bbcc,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1
    });
    const dispatchWin = new THREE.Mesh(winGeo, winMat);
    dispatchWin.position.set(7.85, 1.5, 7.0);
    dispatchWin.rotation.y = Math.PI / 2;
    z1Group.add(dispatchWin);

    // Weighbridge Platform outside West wall (X: 5.8 to 8.0, Z: 3.0 to 11.0)
    const scalePlatformGeo = new THREE.BoxGeometry(2.2, 0.12, 8.0);
    const scaleMat = new THREE.MeshStandardMaterial({
      color: 0x484848,
      roughness: 0.6,
      metalness: 0.8
    });
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
    z1Group.add(doorGroup);

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
    const desk = new THREE.Mesh(deskGeo, this.matWoodDesk);
    desk.position.set(9.2, 0.38, 7.0);
    desk.castShadow = true;
    z1Group.add(desk);

    // CRT Screen with glowing phosphor scale display ("MÉRLEG: 0.00 kg")
    const scaleCanvas = document.createElement('canvas');
    scaleCanvas.width = 256;
    scaleCanvas.height = 128;
    const sctx = scaleCanvas.getContext('2d');
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
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.9 });
    const chair = new THREE.Mesh(chairGeo, chairMat);
    chair.position.set(10.2, 0.4, 7.0);
    chair.rotation.y = -0.4;
    z1Group.add(chair);

    // 3. Gray steel floor safe
    const safeGeo = new THREE.BoxGeometry(0.7, 0.85, 0.7);
    const safeMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, metalness: 0.8, roughness: 0.4 });
    const safe = new THREE.Mesh(safeGeo, safeMat);
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
    const cctx = corkCanvas.getContext('2d');
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
    const officeLight = new THREE.PointLight(0xffcc77, 2.5, 12.0, 2.0);
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
  setupCircuitBreaker() {
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
    const sctx = signCanvas.getContext('2d');
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
  buildZone2RoncsautoDomb() {
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

    stackPositions.forEach((stack, sIdx) => {
      for (let level = 0; level < stack.height; level++) {
        const color = carColors[(sIdx + level) % carColors.length];
        const carMesh = this.createCrushedCarMesh(color);
        carMesh.position.set(stack.x, 0.45 + level * 0.95, stack.z);
        carMesh.rotation.y = stack.rot + level * 0.12;
        carMesh.castShadow = true;
        carMesh.receiveShadow = true;
        z2Group.add(carMesh);
      }

      // Add solid box collider for each stack
      this.mapColliders.addCollider(new BoxCollider({
        id: `col_car_stack_${sIdx}`,
        tag: 'vehicle',
        surface: SURFACE_TYPES.METAL,
        center: new THREE.Vector3(stack.x, (stack.height * 0.95) / 2, stack.z),
        size: new THREE.Vector3(2.4, stack.height * 0.95, 3.8)
      }));
    });

    // 3 Openable Car Trunks (Point 47 Hiding Spots)
    this.buildCarTrunkHidingSpot(z2Group, 'car_trunk_1', -18.0, 8.5);
    this.buildCarTrunkHidingSpot(z2Group, 'car_trunk_2', -14.0, 15.5);
    this.buildCarTrunkHidingSpot(z2Group, 'car_trunk_3', -21.0, 21.0);

    // Car Alarm Sabotage Prop (Point 55)
    this.buildCarAlarmProp(z2Group, -16.0, 12.0);

    this.group.add(z2Group);
  }

  createCrushedCarMesh(colorHex) {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.7,
      metalness: 0.4
    });

    // Lower chassis & fenders
    const chassisGeo = new THREE.BoxGeometry(2.1, 0.45, 3.6);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = 0.22;
    car.add(chassis);

    // Crumpled cabin roof
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.4, 2.0);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 0.6, -0.2);
    cabin.rotation.z = (Math.random() - 0.5) * 0.15; // Crumpled tilt
    car.add(cabin);

    // Rusted bumpers
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.15), this.matRustyMetal);
    bumperF.position.set(0, 0.15, 1.85);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.15), this.matRustyMetal);
    bumperR.position.set(0, 0.15, -1.85);
    car.add(bumperF);
    car.add(bumperR);

    // Rusted wheels on rims
    const rimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10);
    rimGeo.rotateZ(Math.PI / 2);
    [
      [-1.08, 0.15, 1.1],
      [1.08, 0.15, 1.1],
      [-1.08, 0.15, -1.1],
      [1.08, 0.15, -1.1]
    ].forEach(([wx, wy, wz]) => {
      const rim = new THREE.Mesh(rimGeo, this.matRustyMetal);
      rim.position.set(wx, wy, wz);
      car.add(rim);
    });

    return car;
  }

  buildCarTrunkHidingSpot(parentGroup, id, x, z) {
    const trunkGroup = new THREE.Group();
    trunkGroup.position.set(x, 0.35, z);

    // Car rear frame
    const frameGeo = new THREE.BoxGeometry(1.6, 0.7, 1.2);
    const frame = new THREE.Mesh(frameGeo, this.matRustyMetal);
    trunkGroup.add(frame);

    // Hinged Trunk Lid
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.35, -0.5); // Hinge at front of trunk opening

    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.95), this.matRustyMetal);
    lidMesh.position.set(0, 0, 0.45);
    lidPivot.add(lidMesh);
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

  buildCarAlarmProp(parentGroup, x, z) {
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
  buildZone3NagyHangar() {
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
    const roof = new THREE.Mesh(roofGeo, this.matHangarSteel);
    roof.position.set(hX, hH, hZ);
    z3Group.add(roof);

    // North wall (Z = 45.0)
    const nWall = new THREE.Mesh(new THREE.BoxGeometry(hW, hH, wallThick), this.matHangarSteel);
    nWall.position.set(hX, hH / 2, 45.0);
    nWall.castShadow = true;
    z3Group.add(nWall);

    // East wall (X = 22.0)
    const eWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, hH, hL), this.matHangarSteel);
    eWall.position.set(22.0, hH / 2, hZ);
    eWall.castShadow = true;
    z3Group.add(eWall);

    // West wall (X = -5.0)
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, hH, hL), this.matHangarSteel);
    wWall.position.set(-5.0, hH / 2, hZ);
    wWall.castShadow = true;
    z3Group.add(wWall);

    // South wall (Z = 22.0) with large sliding hangar door opening (X: 3.0 to 9.0)
    const sWallLeft = new THREE.Mesh(new THREE.BoxGeometry(8.0, hH, wallThick), this.matHangarSteel);
    sWallLeft.position.set(-1.0, hH / 2, 22.0);
    z3Group.add(sWallLeft);

    const sWallRight = new THREE.Mesh(new THREE.BoxGeometry(13.0, hH, wallThick), this.matHangarSteel);
    sWallRight.position.set(15.5, hH / 2, 22.0);
    z3Group.add(sWallRight);

    const sWallHeader = new THREE.Mesh(new THREE.BoxGeometry(6.0, 3.5, wallThick), this.matHangarSteel);
    sWallHeader.position.set(6.0, 5.75, 22.0);
    z3Group.add(sWallHeader);

    // Large sliding hangar door at (6.0, 0, 22.0)
    const hDoorGroup = new THREE.Group();
    hDoorGroup.position.set(3.0, 0, 22.0); // Hinge on left side
    const hDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.0, 0.15), this.matRustyMetal);
    hDoorMesh.position.set(2.9, 2.0, 0);
    hDoorGroup.add(hDoorMesh);
    z3Group.add(hDoorGroup);

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
    const flood1 = new THREE.SpotLight(0xddff88, 4.0, 26.0, Math.PI / 3.5, 0.4, 2.0);
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
    const flood2 = new THREE.SpotLight(0xddff88, 4.0, 26.0, Math.PI / 3.5, 0.4, 2.0);
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
    const catLight = new THREE.PointLight(0xffeeaa, 1.8, 12.0, 2.0);
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

  buildShredderCompactor(parentGroup, x, z) {
    const compGroup = new THREE.Group();
    compGroup.position.set(x, 0, z);

    // Green industrial body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f5c35,
      roughness: 0.6,
      metalness: 0.7
    });
    const baseGeo = new THREE.BoxGeometry(4.5, 2.4, 5.5);
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = 1.2;
    base.castShadow = true;
    compGroup.add(base);

    // Hopper funnel
    const hopperGeo = new THREE.CylinderGeometry(2.2, 1.2, 1.8, 8, 1, true);
    const hopper = new THREE.Mesh(hopperGeo, bodyMat);
    hopper.position.y = 3.3;
    compGroup.add(hopper);

    // Warning diagonal stripes
    const stripeGeo = new THREE.BoxGeometry(4.6, 0.35, 5.6);
    const stripe = new THREE.Mesh(stripeGeo, this.matYellowHazard);
    stripe.position.y = 1.8;
    compGroup.add(stripe);

    // Control terminal
    const panelGeo = new THREE.BoxGeometry(0.6, 1.1, 0.4);
    const panel = new THREE.Mesh(panelGeo, this.matHangarSteel);
    panel.position.set(2.4, 0.8, 0);
    compGroup.add(panel);

    parentGroup.add(compGroup);

    // Physics collider
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_shredder_compactor',
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 1.8, z),
      size: new THREE.Vector3(4.8, 3.6, 5.8)
    }));
  }

  buildGantryCrane(parentGroup, hX, hZ, hW, hL, hH) {
    const craneGroup = new THREE.Group();

    // Dual Yellow I-Beams running length of hangar rafters
    const beamGeo = new THREE.BoxGeometry(0.3, 0.5, hL - 1.0);
    const beamL = new THREE.Mesh(beamGeo, this.matYellowHazard);
    beamL.position.set(hX - 6.0, hH - 0.5, hZ);
    const beamR = new THREE.Mesh(beamGeo, this.matYellowHazard);
    beamR.position.set(hX + 6.0, hH - 0.5, hZ);
    craneGroup.add(beamL);
    craneGroup.add(beamR);

    // Traveling Hoist Bridge
    const bridgeGeo = new THREE.BoxGeometry(12.3, 0.4, 0.6);
    const bridge = new THREE.Mesh(bridgeGeo, this.matYellowHazard);
    bridge.position.set(hX, hH - 0.8, hZ - 2.0);
    craneGroup.add(bridge);

    // Steel Cable & Hanging Hook
    const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 3.2, 6);
    const cable = new THREE.Mesh(cableGeo, this.matGalvanized);
    cable.position.set(hX, hH - 2.4, hZ - 2.0);
    craneGroup.add(cable);

    const hookGeo = new THREE.TorusGeometry(0.25, 0.06, 8, 12, Math.PI * 1.5);
    const hook = new THREE.Mesh(hookGeo, this.matHangarSteel);
    hook.position.set(hX, hH - 4.1, hZ - 2.0);
    hook.rotation.z = Math.PI / 2;
    craneGroup.add(hook);

    parentGroup.add(craneGroup);
  }

  buildCatwalkAndStairs(parentGroup) {
    const catGroup = new THREE.Group();

    // Catwalk metal grate floor (Elevated at Y = 2.8m, along East wall)
    const walkwayGeo = new THREE.BoxGeometry(2.5, 0.1, 16.0);
    const walkway = new THREE.Mesh(walkwayGeo, this.matGalvanized);
    walkway.position.set(19.5, 2.8, 33.0);
    catGroup.add(walkway);

    // Safety railings
    const railGeo = new THREE.CylinderGeometry(0.03, 0.03, 16.0, 6);
    railGeo.rotateX(Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, this.matGalvanized);
    rail.position.set(18.25, 3.8, 33.0);
    catGroup.add(rail);

    // Steel stairs ascending to catwalk
    const stepCount = 14;
    const stepGeo = new THREE.BoxGeometry(1.6, 0.08, 0.35);
    for (let i = 0; i < stepCount; i++) {
      const step = new THREE.Mesh(stepGeo, this.matGalvanized);
      step.position.set(19.5, (i + 1) * 0.2, 24.5 - i * 0.32);
      catGroup.add(step);
    }

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

  buildOilDrums(parentGroup, x, z) {
    const drumGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12);
    const drumColors = [0x992222, 0x1f4488, 0x226633];

    const offsets = [
      [0, 0.45, 0],
      [0.65, 0.45, 0.1],
      [-0.65, 0.45, -0.1],
      [0.32, 0.45, 0.55],
      [-0.32, 0.45, 0.55],
      // Upper tier
      [0.32, 1.35, 0.1],
      [-0.32, 1.35, 0.1]
    ];

    offsets.forEach(([dx, dy, dz], i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: drumColors[i % drumColors.length],
        metalness: 0.6,
        roughness: 0.5
      });
      const drum = new THREE.Mesh(drumGeo, mat);
      drum.position.set(x + dx, dy, z + dz);
      drum.castShadow = true;
      parentGroup.add(drum);
    });

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
  buildZone4KutyatelepSufni() {
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
    const shedLight1 = new THREE.PointLight(0xffaa55, 1.5, 8.0, 2.0);
    shedLight1.position.set(-20.0, 2.4, 33.0);
    z4Group.add(shedLight1);

    const shedLight2 = new THREE.PointLight(0xffaa55, 1.5, 8.0, 2.0);
    shedLight2.position.set(-20.0, 2.4, 41.0);
    z4Group.add(shedLight2);

    const switchMesh = this.buildWallSwitch(z4Group, 'switch_sufni', -17.8, 1.3, 32.5, 0);
    this.registerLightFixture('light_sufni_1', shedLight1, switchMesh);
    this.registerLightFixture('light_sufni_2', shedLight2, switchMesh);

    this.group.add(z4Group);
  }

  buildWoodenShed(parentGroup, id, x, z, w, l, h) {
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

    // Sloped zinc roof
    const roofGeo = new THREE.BoxGeometry(w + 0.4, 0.08, l + 0.4);
    const roof = new THREE.Mesh(roofGeo, this.matGalvanized);
    roof.position.set(0, h + 0.1, 0);
    roof.rotation.z = -0.12;
    shedGroup.add(roof);

    // Hinged wooden door at doorway (x + w/2, 0, z - 0.6)
    const doorPivot = new THREE.Group();
    doorPivot.position.set(w / 2, 0, -0.6);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 1.2), this.matRottenWood);
    doorMesh.position.set(0, 0.95, 0.6);
    doorPivot.add(doorMesh);
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

  buildDogKennels(parentGroup, x, z) {
    const penGroup = new THREE.Group();
    penGroup.position.set(x, 0, z);

    // Rusted pipe frame & chain-link wire pens
    const penW = 3.5;
    const penL = 6.0;
    const penH = 2.0;

    // Corner posts
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, penH, 8);
    [
      [-penW / 2, penH / 2, -penL / 2],
      [penW / 2, penH / 2, -penL / 2],
      [-penW / 2, penH / 2, penL / 2],
      [penW / 2, penH / 2, penL / 2]
    ].forEach(([px, py, pz]) => {
      const post = new THREE.Mesh(postGeo, this.matHangarSteel);
      post.position.set(px, py, pz);
      penGroup.add(post);
    });

    // Stainless steel dog bowls & bones props
    const bowlGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.08, 12);
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.85, roughness: 0.2 });
    const bowl1 = new THREE.Mesh(bowlGeo, bowlMat);
    bowl1.position.set(0.4, 0.04, 1.0);
    const bowl2 = new THREE.Mesh(bowlGeo, bowlMat);
    bowl2.position.set(-0.5, 0.04, -1.2);
    penGroup.add(bowl1);
    penGroup.add(bowl2);

    parentGroup.add(penGroup);

    // Pen collider
    this.mapColliders.addCollider(new BoxCollider({
      id: 'col_dog_kennels',
      tag: 'fence',
      surface: SURFACE_TYPES.MUD,
      center: new THREE.Vector3(x, penH / 2, z),
      size: new THREE.Vector3(penW, penH, penL)
    }));
  }

  buildBurnBarrel(parentGroup, x, z) {
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(x, 0, z);

    // Cut open steel drum
    const drumGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.85, 14, 1, true);
    const drum = new THREE.Mesh(drumGeo, this.matRustyMetal);
    drum.position.y = 0.425;
    barrelGroup.add(drum);

    // Glowing ember core inside barrel
    const emberGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const embers = new THREE.Mesh(emberGeo, emberMat);
    embers.position.y = 0.45;
    barrelGroup.add(embers);

    // Flickering warm fire point light
    const fireLight = new THREE.PointLight(0xff5511, 2.0, 7.0, 2.0);
    fireLight.position.set(0, 0.6, 0);
    barrelGroup.add(fireLight);
    this.burnBarrelLights.push(fireLight);

    parentGroup.add(barrelGroup);

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
  buildZone5OcskavasLerakat() {
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

  buildCopperWireSpool(parentGroup, x, z) {
    const spoolGroup = new THREE.Group();
    spoolGroup.position.set(x, 0, z);

    // Wooden spool rims
    const rimGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.1, 14);
    rimGeo.rotateZ(Math.PI / 2);
    const rimL = new THREE.Mesh(rimGeo, this.matRottenWood);
    rimL.position.x = -0.6;
    rimL.position.y = 0.9;
    const rimR = new THREE.Mesh(rimGeo, this.matRottenWood);
    rimR.position.x = 0.6;
    rimR.position.y = 0.9;
    spoolGroup.add(rimL);
    spoolGroup.add(rimR);

    // Wrapped copper wire core
    const wireGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.1, 16);
    wireGeo.rotateZ(Math.PI / 2);
    const wire = new THREE.Mesh(wireGeo, this.matCopper);
    wire.position.y = 0.9;
    wire.castShadow = true;
    spoolGroup.add(wire);

    parentGroup.add(spoolGroup);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_copper_spool_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.9, z),
      size: new THREE.Vector3(1.4, 1.8, 1.8)
    }));
  }

  buildRadiatorPiles(parentGroup, x, z) {
    const pileGroup = new THREE.Group();
    pileGroup.position.set(x, 0, z);

    // Stacked ribbed cast-iron radiator units
    const radGeo = new THREE.BoxGeometry(1.6, 0.75, 0.25);
    const radMat = new THREE.MeshStandardMaterial({ color: 0x55585d, roughness: 0.8, metalness: 0.5 });

    for (let r = 0; r < 6; r++) {
      const rad = new THREE.Mesh(radGeo, radMat);
      rad.position.set(0, 0.4 + r * 0.28, (r % 2 === 0 ? 0.05 : -0.05));
      rad.rotation.y = (r % 2) * 0.1;
      rad.castShadow = true;
      pileGroup.add(rad);
    }

    parentGroup.add(pileGroup);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_radiator_pile_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 1.0, z),
      size: new THREE.Vector3(1.8, 2.0, 1.4)
    }));
  }

  buildEngineBlocks(parentGroup, x, z) {
    const engineGroup = new THREE.Group();
    engineGroup.position.set(x, 0, z);

    // Weathered wooden pallet base
    const palletGeo = new THREE.BoxGeometry(1.4, 0.15, 1.4);
    const pallet = new THREE.Mesh(palletGeo, this.matRottenWood);
    pallet.position.y = 0.08;
    engineGroup.add(pallet);

    // Cast-iron V6 engine block
    const blockGeo = new THREE.BoxGeometry(0.8, 0.6, 0.9);
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x3a332d, roughness: 0.9, metalness: 0.6 });
    const block = new THREE.Mesh(blockGeo, blockMat);
    block.position.y = 0.45;
    block.castShadow = true;
    engineGroup.add(block);

    parentGroup.add(engineGroup);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_engine_block_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.45, z),
      size: new THREE.Vector3(1.5, 0.9, 1.5)
    }));
  }

  buildBicycleScrap(parentGroup, x, z) {
    const bikeGroup = new THREE.Group();
    bikeGroup.position.set(x, 0, z);

    // Tangled metal pipe frames & spoked rims
    const frameGeo = new THREE.TorusGeometry(0.4, 0.03, 6, 12);
    for (let i = 0; i < 5; i++) {
      const frame = new THREE.Mesh(frameGeo, this.matRustyMetal);
      frame.position.set((Math.random() - 0.5) * 1.2, 0.4 + i * 0.15, (Math.random() - 0.5) * 1.2);
      frame.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      bikeGroup.add(frame);
    }

    parentGroup.add(bikeGroup);

    this.mapColliders.addCollider(new BoxCollider({
      id: `col_bicycle_scrap_${x}_${z}`,
      tag: 'prop',
      surface: SURFACE_TYPES.METAL,
      center: new THREE.Vector3(x, 0.5, z),
      size: new THREE.Vector3(1.8, 1.0, 1.8)
    }));
  }

  buildThrowableScrapProps(parentGroup) {
    // Small physics scrap objects for ghost and player throwing (Point 54)
    const scrapDefs = [
      { id: 'scrap_pipe_1', type: 'pipe', pos: [22.5, 0.1, 10.5] },
      { id: 'scrap_pipe_2', type: 'pipe', pos: [26.0, 0.1, 22.0] },
      { id: 'scrap_can_1', type: 'can', pos: [25.0, 0.06, 15.0] },
      { id: 'scrap_can_2', type: 'can', pos: [31.0, 0.06, 28.0] },
      { id: 'scrap_muffler_1', type: 'muffler', pos: [28.5, 0.15, 33.0] }
    ];

    scrapDefs.forEach(s => {
      let mesh;
      if (s.type === 'pipe') {
        const pGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
        pGeo.rotateZ(Math.PI / 2);
        mesh = new THREE.Mesh(pGeo, this.matRustyMetal);
      } else if (s.type === 'can') {
        const cGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10);
        mesh = new THREE.Mesh(cGeo, this.matGalvanized);
      } else {
        const mGeo = new THREE.BoxGeometry(0.2, 0.15, 0.6);
        mesh = new THREE.Mesh(mGeo, this.matRustyMetal);
      }
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
  buildLocker(parentGroup, id, x, z, zoneKey) {
    const lockerGroup = new THREE.Group();
    lockerGroup.position.set(x, 0, z);

    const lW = 0.7;
    const lH = 2.1;
    const lL = 0.65;

    // Metal cabinet body
    const bodyGeo = new THREE.BoxGeometry(lW, lH, lL);
    const body = new THREE.Mesh(bodyGeo, this.matGalvanized);
    body.position.y = lH / 2;
    lockerGroup.add(body);

    // Hinged locker door
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-lW / 2, 0, lL / 2);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(lW, lH - 0.05, 0.04), this.matGalvanized);
    doorMesh.position.set(lW / 2, lH / 2, 0);
    doorPivot.add(doorMesh);
    lockerGroup.add(doorPivot);

    parentGroup.add(lockerGroup);

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

  buildWallSwitch(parentGroup, id, x, y, z, rotY = 0) {
    const swGroup = new THREE.Group();
    swGroup.position.set(x, y, z);
    swGroup.rotation.y = rotY;

    const baseGeo = new THREE.BoxGeometry(0.1, 0.14, 0.03);
    const base = new THREE.Mesh(baseGeo, this.matGalvanized);
    swGroup.add(base);

    const toggleGeo = new THREE.BoxGeometry(0.02, 0.05, 0.03);
    const toggle = new THREE.Mesh(toggleGeo, this.matHangarSteel);
    toggle.position.set(0, 0, 0.02);
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

  registerLightFixture(id, lightInstance, switchMesh = null) {
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
  setBreakerState(isOn, triggeredBy = 'USER') {
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
  toggleLight(lightId) {
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
  shatterLight(lightId) {
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
  triggerCarAlarm(duration = 10) {
    this.isCarAlarmActive = true;
    this.carAlarmTimer = duration;
    return { success: true, duration };
  }

  /**
   * Opens or closes entrance gate.
   */
  toggleGate(open = null) {
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
  update(delta) {
    // 1. Update map colliders & hinged doors
    this.mapColliders.update(delta);

    // 2. Flickering embers in burn barrels
    for (let i = 0; i < this.burnBarrelLights.length; i++) {
      const bLight = this.burnBarrelLights[i];
      bLight.intensity = 1.8 + Math.sin(Date.now() * 0.008 + i) * 0.4 + (Math.random() - 0.5) * 0.2;
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
