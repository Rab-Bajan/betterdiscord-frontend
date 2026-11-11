/**
 * TruckEnvironment.js
 *
 * 3D Surveillance Truck ("A Fehér Ford Tranzit") for MiskolcPhobia 3D.
 *
 * Implements:
 * - Positioned outside depot gates at (-4, 0, -15).
 * - Safe haven volume: [-6.0, -1.5] x [0.0, 3.0] x [-18.0, -12.0] (no ghost hunts/kills).
 * - Procedural Ford Transit 3D geometry with open sliding cargo door.
 * - Interactive CRT surveillance monitor desk cycling camera feeds with scanline/NV effect.
 * - Team sanity wall display with color-coded bars (Green >50%, Orange 25-50%, Red <25%).
 * - Paranormal activity graph (0-10 intensity line graph / oscilloscope).
 * - Mission whiteboard with Hungarian objectives and bounties.
 * - Equipment shelving rack holding 3D tool models.
 * - Green gate button to unlock depot entrance with buzzer hook.
 * - Digital preparation countdown timer display (LED 7-segment style).
 */

import * as THREE from 'three';
import { BoxCollider, SURFACE_TYPES } from './MapColliders.js';
import { getPBRMaterial } from '../visual/ProceduralTextures.js';
import { applyWorldUVs, mergeParts, lathe, createContactShadows } from '../visual/GeometryKit.js';
import { P, tube } from '../visual/YardProps.js';
import { createToolViewmodel } from '../items/ToolDefinitions.js';

export class TruckEnvironment {
  constructor(options = {}) {
    this.rootPosition = options.position || new THREE.Vector3(-4.0, 0.0, -15.0);
    this.group = new THREE.Group();
    this.group.name = 'TruckEnvironment_Group';
    this.group.position.copy(this.rootPosition);

    this.onGateOpenCallback = options.onGateOpen || null;
    this.onCameraCycleCallback = options.onCameraCycle || null;

    // State tracking
    this.cameras = [
      { id: 0, name: '0. KAMERA - Furgon Hátsó (Kijárat)', zone: 'Furgon' },
      { id: 1, name: '1. KAMERA - Háromlábú 1 (Telep Udvar)', zone: 'Udvar' },
      { id: 2, name: '2. KAMERA - Háromlábú 2 (Roncsautó Domb)', zone: 'Zone 2' },
      { id: 3, name: '3. KAMERA - Mázsaház (Belső Iroda)', zone: 'Zone 1' }
    ];
    this.currentCameraIndex = 0;
    this.activityHistory = new Array(32).fill(0);
    this.currentActivity = 0;
    this.remainingCountdownSeconds = 180;
    this.isGateUnlocked = false;

    // Interactive objects registry for raycasting
    this.interactiveObjects = [];
    this.colliders = [];

    // Equipment rack item meshes dictionary
    this.rackItemMeshes = new Map();

    // Safe zone bounds in world coordinates
    this.safeZoneBounds = new THREE.Box3(
      new THREE.Vector3(-6.0, 0.0, -18.0),
      new THREE.Vector3(-1.5, 3.0, -12.0)
    );

    // Build the truck and furnishings
    this.initTruckMaterials();
    this.buildTruckBody();
    this.buildTruckInterior();
    this.buildSurveillanceDesk();
    this.buildSanityWallDisplay();
    this.buildActivityGraphDisplay();
    this.buildMissionWhiteboard();
    this.buildEquipmentRack();
    this.buildGateButton();
    this.buildCountdownTimer();
    this.buildColliders();
    this.buildTruckDetailing();
    applyWorldUVs(this.group);
  }

  /** Free canvas textures and geometry owned by the truck (shared library textures are freed elsewhere). */
  dispose() {
    for (const t of [this.surveillanceTex, this.sanityTex, this.activityTex, this.whiteboardTex, this.timerTex]) t?.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        if (m.map && m.map.isCanvasTexture) m.map.dispose();
        m.dispose();
      });
    });
  }

  /* -------------------------------------------------------------
   * MATERIALS & TEXTURES
   * ----------------------------------------------------------- */
  initTruckMaterials() {
    // Shared procedural PBR materials (cached in the texture library)
    this.matWhitePaint = getPBRMaterial('paint', { color: 0xe6e6e0, tile: 1.2, normalScale: 0.6 });
    this.matDarkMetal = getPBRMaterial('metalPlate', { color: 0x2c2f36, tile: 0.9 });
    this.matCheckerFloor = getPBRMaterial('metalPlate', { color: 0x3a3d44, tile: 0.6, normalScale: 1.6 });
    this.matRubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.9, metalness: 0.05 });
    this.matChrome = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.15, metalness: 1.0 });
    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0x111622,
      roughness: 0.08,
      metalness: 0.9,
      transparent: true,
      opacity: 0.65
    });
    this.matWoodDesk = getPBRMaterial('wood', { color: 0x4a3728, tile: 1.0 });
    this.matCork = new THREE.MeshStandardMaterial({
      color: 0x8a6d48,
      roughness: 0.9,
      metalness: 0.0
    });
    this.matLampEmit = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d0, emissiveIntensity: 1.2, roughness: 0.3 });
    this.matTailLamp = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0x330404, emissiveIntensity: 0.6, roughness: 0.3 });
  }

  /* -------------------------------------------------------------
   * 3D PROCEDURAL TRUCK GEOMETRY
   * ----------------------------------------------------------- */
  buildTruckBody() {
    const truckBody = new THREE.Group();
    truckBody.name = 'Truck_Exterior_Body';

    // 1. Cargo Box Shell (Main interior / rear volume)
    // Width: 2.3m, Height: 2.2m, Length: 3.6m
    const wallThickness = 0.08;
    const cargoW = 2.3;
    const cargoH = 2.2;
    const cargoL = 3.6;
    const cargoZ = -0.4; // offset from truck center

    // Cargo Floor (Dark ribbed metal)
    const floorGeo = new THREE.BoxGeometry(cargoW, wallThickness, cargoL);
    const floorMesh = new THREE.Mesh(floorGeo, this.matCheckerFloor);
    floorMesh.position.set(0, 0.3, cargoZ);
    floorMesh.receiveShadow = true;
    truckBody.add(floorMesh);

    // Cargo Roof
    const roofGeo = new THREE.BoxGeometry(cargoW, wallThickness, cargoL);
    const roofMesh = new THREE.Mesh(roofGeo, this.matWhitePaint);
    roofMesh.position.set(0, 0.3 + cargoH, cargoZ);
    truckBody.add(roofMesh);

    // Cargo Port Side Wall (-X wall, full solid)
    const portWallGeo = new THREE.BoxGeometry(wallThickness, cargoH, cargoL);
    const portWall = new THREE.Mesh(portWallGeo, this.matWhitePaint);
    portWall.position.set(-cargoW / 2, 0.3 + cargoH / 2, cargoZ);
    portWall.castShadow = true;
    truckBody.add(portWall);

    // Cargo Starboard Side Wall (+X wall, has opening for sliding door)
    // Front section of right wall
    const starFrontGeo = new THREE.BoxGeometry(wallThickness, cargoH, 1.2);
    const starFront = new THREE.Mesh(starFrontGeo, this.matWhitePaint);
    starFront.position.set(cargoW / 2, 0.3 + cargoH / 2, cargoZ + 1.2);
    truckBody.add(starFront);

    // Rear section of right wall
    const starRearGeo = new THREE.BoxGeometry(wallThickness, cargoH, 1.2);
    const starRear = new THREE.Mesh(starRearGeo, this.matWhitePaint);
    starRear.position.set(cargoW / 2, 0.3 + cargoH / 2, cargoZ - 1.2);
    truckBody.add(starRear);

    // Top header over open sliding door
    const doorHeaderGeo = new THREE.BoxGeometry(wallThickness, 0.4, 1.2);
    const doorHeader = new THREE.Mesh(doorHeaderGeo, this.matWhitePaint);
    doorHeader.position.set(cargoW / 2, 0.3 + cargoH - 0.2, cargoZ);
    truckBody.add(doorHeader);

    // Open sliding door mesh (partially slid back)
    const slidingDoorGeo = new THREE.BoxGeometry(0.06, cargoH - 0.35, 1.15);
    const slidingDoor = new THREE.Mesh(slidingDoorGeo, this.matWhitePaint);
    slidingDoor.position.set(cargoW / 2 + 0.08, 0.3 + (cargoH - 0.35) / 2, cargoZ - 1.1);
    truckBody.add(slidingDoor);

    // Cargo Rear Wall / Doors (At -Z end: cargoZ - cargoL/2)
    // Left rear door
    const rearDoorLGeo = new THREE.BoxGeometry(cargoW / 2 - 0.02, cargoH, wallThickness);
    const rearDoorL = new THREE.Mesh(rearDoorLGeo, this.matWhitePaint);
    rearDoorL.position.set(-cargoW / 4, 0.3 + cargoH / 2, cargoZ - cargoL / 2);
    truckBody.add(rearDoorL);

    // Right rear door
    const rearDoorRGeo = new THREE.BoxGeometry(cargoW / 2 - 0.02, cargoH, wallThickness);
    const rearDoorR = new THREE.Mesh(rearDoorRGeo, this.matWhitePaint);
    rearDoorR.position.set(cargoW / 4, 0.3 + cargoH / 2, cargoZ - cargoL / 2);
    truckBody.add(rearDoorR);

    // Interior Bulkhead Partition separating cargo from front cab
    const bulkheadGeo = new THREE.BoxGeometry(cargoW, cargoH, wallThickness);
    const bulkheadMat = new THREE.MeshStandardMaterial({ color: 0x333740, roughness: 0.8 });
    const bulkhead = new THREE.Mesh(bulkheadGeo, bulkheadMat);
    bulkhead.position.set(0, 0.3 + cargoH / 2, cargoZ + cargoL / 2);
    truckBody.add(bulkhead);

    // 2. Front Driver Cab (Slanted aerodynamic nose)
    const cabLength = 1.6;
    const cabZ = cargoZ + cargoL / 2 + cabLength / 2;
    const cabGeo = new THREE.BoxGeometry(cargoW, 1.8, cabLength);
    const cabMesh = new THREE.Mesh(cabGeo, this.matWhitePaint);
    cabMesh.position.set(0, 0.3 + 1.8 / 2, cabZ);
    truckBody.add(cabMesh);

    // Slanted Windshield
    const windshieldGeo = new THREE.PlaneGeometry(cargoW - 0.3, 1.1);
    const windshield = new THREE.Mesh(windshieldGeo, this.matGlass);
    windshield.position.set(0, 1.45, cabZ + cabLength / 2 + 0.01);
    windshield.rotation.x = -0.35;
    truckBody.add(windshield);

    // Front Grill and Bumper
    const bumperGeo = new THREE.BoxGeometry(cargoW + 0.1, 0.4, 0.25);
    const bumper = new THREE.Mesh(bumperGeo, this.matDarkMetal);
    bumper.position.set(0, 0.35, cabZ + cabLength / 2 + 0.12);
    truckBody.add(bumper);

    // Hungarian License Plate: "MISKOLC-01"
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 256;
    plateCanvas.height = 64;
    const pctx = plateCanvas.getContext('2d');
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = '#003399';
    pctx.fillRect(0, 0, 36, 64); // EU blue strip
    pctx.fillStyle = '#ffff00';
    pctx.font = '16px bold sans-serif';
    pctx.fillText('H', 12, 40);
    pctx.strokeStyle = '#000000';
    pctx.lineWidth = 4;
    pctx.strokeRect(2, 2, 252, 60);
    pctx.fillStyle = '#111111';
    pctx.font = '32px monospace';
    pctx.fillText('MISKOLC-01', 52, 44);

    const plateTex = new THREE.CanvasTexture(plateCanvas);
    const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
    const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), plateMat);
    plateMesh.position.set(0, 0.35, cabZ + cabLength / 2 + 0.26);
    truckBody.add(plateMesh);

    // Headlights
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffeeaa,
      emissiveIntensity: 0.6,
      roughness: 0.1
    });
    const headlightL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.1), headlightMat);
    headlightL.position.set(-0.85, 0.7, cabZ + cabLength / 2 + 0.05);
    const headlightR = headlightL.clone();
    headlightR.position.x = 0.85;
    truckBody.add(headlightL);
    truckBody.add(headlightR);

    // 3. Wheels & Undercarriage
    // Tyre with shoulder, tread blocks and sidewall lettering ridge (lathe), steel wheel with lug nuts
    const tyreProfile = [[0.2, -0.12], [0.33, -0.12], [0.37, -0.1], [0.38, -0.06], [0.38, 0.06], [0.37, 0.1], [0.33, 0.12], [0.2, 0.12], [0.2, 0.09], [0.31, 0.09], [0.31, -0.09], [0.2, -0.09]];
    const wheelGeo = mergeParts([
      { geometry: lathe(tyreProfile, 20), position: [0, 0, 0], rotation: [0, 0, Math.PI / 2] },
      ...Array.from({ length: 20 }, (_, i) => P.box(0.2, 0.018, 0.06, 0, 0.385 * Math.cos((i / 20) * Math.PI * 2), 0.385 * Math.sin((i / 20) * Math.PI * 2), (i / 20) * Math.PI * 2, 0, 0)) // tread blocks
    ], { tile: 0.8 });
    const hubGeo = mergeParts([
      P.cyl(0.21, 0.21, 0.04, 14, 0, 0, 0, 0, 0, Math.PI / 2), P.cyl(0.07, 0.07, 0.07, 10, 0, 0, 0, 0, 0, Math.PI / 2),
      ...Array.from({ length: 5 }, (_, i) => P.cyl(0.018, 0.018, 0.06, 6, 0.02, 0.12 * Math.cos((i / 5) * Math.PI * 2), 0.12 * Math.sin((i / 5) * Math.PI * 2), 0, 0, Math.PI / 2))
    ], { tile: 0.6 });

    const wheelPositions = [
      [-1.15, 0.38, cargoZ - 1.2],
      [1.15, 0.38, cargoZ - 1.2],
      [-1.15, 0.38, cabZ + 0.2],
      [1.15, 0.38, cabZ + 0.2]
    ];

    wheelPositions.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, this.matRubber);
      wheel.position.set(wx, wy, wz);
      wheel.castShadow = true;
      truckBody.add(wheel);

      const hub = new THREE.Mesh(hubGeo, this.matChrome);
      hub.position.set(wx + Math.sign(wx) * 0.06, wy, wz);
      truckBody.add(hub);
    });

    // Step-up metal plate at open sliding door
    const stepGeo = new THREE.BoxGeometry(0.3, 0.08, 1.1);
    const stepMesh = new THREE.Mesh(stepGeo, this.matDarkMetal);
    stepMesh.position.set(cargoW / 2 + 0.15, 0.18, cargoZ);
    truckBody.add(stepMesh);

    this.group.add(truckBody);
  }

  /* -------------------------------------------------------------
   * INTERIOR LIGHTING & ATMOSPHERE
   * ----------------------------------------------------------- */
  buildTruckInterior() {
    // Warm fluorescent tube light inside cargo area
    const tubeLight = new THREE.PointLight(0xfffae0, 4.0, 7.0, 1.8);
    tubeLight.position.set(0, 2.3, -0.4);
    tubeLight.castShadow = false; // keep lightweight inside truck
    this.group.add(tubeLight);

    // Physical fixture mesh for the tube
    const tubeGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);
    tubeGeo.rotateZ(Math.PI / 2);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfffae0,
      emissiveIntensity: 1.0,
      roughness: 0.2
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.position.set(0, 2.45, -0.4);
    this.group.add(tubeMesh);
  }

  /* -------------------------------------------------------------
   * CRT SURVEILLANCE DESK
   * ----------------------------------------------------------- */
  buildSurveillanceDesk() {
    const deskGroup = new THREE.Group();
    deskGroup.name = 'Surveillance_Desk';
    deskGroup.position.set(-0.75, 0.3, -1.2); // Positioned inside van along left wall

    // Metal & wood workstation desk table
    const tableTopGeo = new THREE.BoxGeometry(0.7, 0.05, 1.3);
    const tableTop = new THREE.Mesh(tableTopGeo, this.matWoodDesk);
    tableTop.position.set(0, 0.72, 0);
    tableTop.castShadow = true;
    deskGroup.add(tableTop);

    // Desk legs
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8);
    const legPositions = [
      [-0.3, 0.36, -0.58],
      [0.3, 0.36, -0.58],
      [-0.3, 0.36, 0.58],
      [0.3, 0.36, 0.58]
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, this.matDarkMetal);
      leg.position.set(lx, ly, lz);
      deskGroup.add(leg);
    });

    // Dual CRT Monitor Housings
    // 1. Primary Surveillance Monitor (Left)
    const monitorBoxGeo = new THREE.BoxGeometry(0.42, 0.38, 0.36);
    const monitorHousing = new THREE.Mesh(monitorBoxGeo, this.matDarkMetal);
    monitorHousing.position.set(0.05, 0.95, -0.28);
    monitorHousing.rotation.y = 0.15;
    deskGroup.add(monitorHousing);

    // Screen Canvas Texture setup
    this.surveillanceCanvas = document.createElement('canvas');
    this.surveillanceCanvas.width = 512;
    this.surveillanceCanvas.height = 384;
    this.surveillanceTex = new THREE.CanvasTexture(this.surveillanceCanvas);
    this.surveillanceTex.minFilter = THREE.LinearFilter;

    const screenMat = new THREE.MeshBasicMaterial({ map: this.surveillanceTex });
    const screenGeo = new THREE.PlaneGeometry(0.36, 0.28);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0.05, 0.95, -0.095);
    screenMesh.rotation.y = 0.15;
    screenMesh.name = 'surveillance_screen';
    deskGroup.add(screenMesh);

    // Interactive button on monitor
    const cycleBtnGeo = new THREE.BoxGeometry(0.04, 0.04, 0.03);
    const cycleBtnMat = new THREE.MeshStandardMaterial({
      color: 0x2288ee,
      emissive: 0x114488,
      emissiveIntensity: 0.5
    });
    const cycleBtn = new THREE.Mesh(cycleBtnGeo, cycleBtnMat);
    cycleBtn.position.set(0.18, 0.78, -0.09);
    cycleBtn.userData = {
      isInteractive: true,
      action: 'cycle_camera',
      promptHu: '[E] Kamera váltása'
    };
    deskGroup.add(cycleBtn);
    this.interactiveObjects.push(cycleBtn);
    this.interactiveObjects.push(screenMesh);

    // Keyboard & Coffee Mug props
    const kbGeo = new THREE.BoxGeometry(0.16, 0.015, 0.38);
    const kbMesh = new THREE.Mesh(kbGeo, this.matDarkMetal);
    kbMesh.position.set(0.2, 0.75, -0.25);
    deskGroup.add(kbMesh);

    const mugGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.08, 12);
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.3 });
    const mugMesh = new THREE.Mesh(mugGeo, mugMat);
    mugMesh.position.set(0.2, 0.78, 0.45);
    deskGroup.add(mugMesh);

    this.group.add(deskGroup);
    this.renderSurveillanceFeed();
  }

  /* -------------------------------------------------------------
   * TEAM SANITY WALL DISPLAY
   * ----------------------------------------------------------- */
  buildSanityWallDisplay() {
    const sanityGroup = new THREE.Group();
    sanityGroup.name = 'Sanity_Wall_Display';
    // Mounted on bulkhead partition wall facing into cargo area
    sanityGroup.position.set(-0.45, 1.6, 1.35);
    sanityGroup.rotation.y = Math.PI; // Face rear

    // Frame
    const frameGeo = new THREE.BoxGeometry(0.9, 0.55, 0.04);
    const frameMesh = new THREE.Mesh(frameGeo, this.matDarkMetal);
    sanityGroup.add(frameMesh);

    // Canvas Texture
    this.sanityCanvas = document.createElement('canvas');
    this.sanityCanvas.width = 512;
    this.sanityCanvas.height = 320;
    this.sanityTex = new THREE.CanvasTexture(this.sanityCanvas);
    this.sanityTex.minFilter = THREE.LinearFilter;

    const displayMat = new THREE.MeshBasicMaterial({ map: this.sanityTex });
    const displayGeo = new THREE.PlaneGeometry(0.84, 0.49);
    const displayMesh = new THREE.Mesh(displayGeo, displayMat);
    displayMesh.position.set(0, 0, 0.022);
    sanityGroup.add(displayMesh);

    this.group.add(sanityGroup);

    // Initial mock players
    this.updateSanity([
      { name: '1. Játékos', sanity: 100, color: '#7655F5' },
      { name: '2. Játékos', sanity: 100, color: '#536CFF' },
      { name: '3. Játékos', sanity: 100, color: '#28C997' },
      { name: '4. Játékos', sanity: 100, color: '#F59E0B' }
    ]);
  }

  /* -------------------------------------------------------------
   * SITE PARANORMAL ACTIVITY GRAPH DISPLAY
   * ----------------------------------------------------------- */
  buildActivityGraphDisplay() {
    const activityGroup = new THREE.Group();
    activityGroup.name = 'Site_Activity_Display';
    // Positioned next to the primary monitor on the desk
    activityGroup.position.set(-0.7, 1.25, -0.85);
    activityGroup.rotation.y = 0.2;

    const boxGeo = new THREE.BoxGeometry(0.38, 0.32, 0.28);
    const boxMesh = new THREE.Mesh(boxGeo, this.matDarkMetal);
    activityGroup.add(boxMesh);

    this.activityCanvas = document.createElement('canvas');
    this.activityCanvas.width = 384;
    this.activityCanvas.height = 280;
    this.activityTex = new THREE.CanvasTexture(this.activityCanvas);
    this.activityTex.minFilter = THREE.LinearFilter;

    const screenMat = new THREE.MeshBasicMaterial({ map: this.activityTex });
    const screenGeo = new THREE.PlaneGeometry(0.34, 0.26);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0, 0.142);
    activityGroup.add(screenMesh);

    this.group.add(activityGroup);
    this.renderActivityGraph();
  }

  /* -------------------------------------------------------------
   * MISSION WHITEBOARD
   * ----------------------------------------------------------- */
  buildMissionWhiteboard() {
    const boardGroup = new THREE.Group();
    boardGroup.name = 'Mission_Whiteboard';
    // Mounted on right side of bulkhead wall
    boardGroup.position.set(0.55, 1.55, 1.35);
    boardGroup.rotation.y = Math.PI;

    // Aluminum frame
    const frameGeo = new THREE.BoxGeometry(0.95, 0.75, 0.03);
    const frameMesh = new THREE.Mesh(frameGeo, this.matChrome);
    boardGroup.add(frameMesh);

    // Whiteboard surface
    this.whiteboardCanvas = document.createElement('canvas');
    this.whiteboardCanvas.width = 640;
    this.whiteboardCanvas.height = 512;
    this.whiteboardTex = new THREE.CanvasTexture(this.whiteboardCanvas);
    this.whiteboardTex.minFilter = THREE.LinearFilter;

    const boardMat = new THREE.MeshBasicMaterial({ map: this.whiteboardTex });
    const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), boardMat);
    boardMesh.position.set(0, 0, 0.018);
    boardGroup.add(boardMesh);

    // Marker pen ledge
    const ledgeGeo = new THREE.BoxGeometry(0.4, 0.02, 0.06);
    const ledge = new THREE.Mesh(ledgeGeo, this.matDarkMetal);
    ledge.position.set(0, -0.36, 0.04);
    boardGroup.add(ledge);

    this.group.add(boardGroup);

    this.updateWhiteboard({
      primaryCompleted: false,
      sideObjectives: [
        { desc: 'Fotózd le a szellemet', bounty: 1000, completed: false },
        { desc: 'Mérj 0.0°C alatti hőmérsékletet', bounty: 500, completed: false },
        { desc: 'Akadályozz meg vadászatot Mobile Jesus-szal', bounty: 800, completed: false }
      ]
    });
  }

  /* -------------------------------------------------------------
   * EQUIPMENT SHELVING RACK & 3D TOOL PROPS
   * ----------------------------------------------------------- */
  buildEquipmentRack() {
    const rackGroup = new THREE.Group();
    rackGroup.name = 'Equipment_Rack';
    rackGroup.position.set(-0.95, 0.3, 0.3); // Left interior wall towards front

    const rackW = 0.45;
    const rackH = 1.6;
    const rackL = 1.1;

    // Upright steel corner posts
    const postGeo = new THREE.BoxGeometry(0.03, rackH, 0.03);
    const postPositions = [
      [-rackW / 2, rackH / 2, -rackL / 2],
      [rackW / 2, rackH / 2, -rackL / 2],
      [-rackW / 2, rackH / 2, rackL / 2],
      [rackW / 2, rackH / 2, rackL / 2]
    ];
    postPositions.forEach(([px, py, pz]) => {
      const post = new THREE.Mesh(postGeo, this.matDarkMetal);
      post.position.set(px, py, pz);
      rackGroup.add(post);
    });

    // 4 Wire/Sheet metal shelves
    const shelfGeo = new THREE.BoxGeometry(rackW, 0.02, rackL);
    const shelfHeights = [0.15, 0.55, 0.95, 1.35];
    shelfHeights.forEach(sy => {
      const shelf = new THREE.Mesh(shelfGeo, this.matDarkMetal);
      shelf.position.set(0, sy, 0);
      shelf.receiveShadow = true;
      rackGroup.add(shelf);
    });

    // Populate initial loadout 3D items onto the shelves
    this.populateRackTools(rackGroup);

    this.group.add(rackGroup);
  }

  populateRackTools(rackGroup) {
    const toolDefs = [
      // Shelf 1 (sy: 1.35)
      { id: 'flashlight_1', nameHu: 'Erős Zseblámpa', type: 'flashlight', pos: [-0.05, 1.38, -0.38] },
      { id: 'flashlight_2', nameHu: 'Tartalék Zseblámpa', type: 'flashlight', pos: [-0.05, 1.38, -0.2] },
      { id: 'uv_flashlight', nameHu: 'UV Pénzvizsgáló', type: 'uv_light', pos: [-0.05, 1.38, 0.05] },
      { id: 'thermometer', nameHu: 'Lézeres Hőmérő', type: 'thermometer', pos: [-0.05, 1.38, 0.32] },

      // Shelf 2 (sy: 0.95)
      { id: 'emf_reader', nameHu: 'EMF 5 Mérőműszer', type: 'emf_reader', pos: [-0.05, 0.98, -0.38] },
      { id: 'spirit_box', nameHu: 'CB Rádió (Spirit Box)', type: 'spirit_box', pos: [-0.05, 0.98, -0.15] },
      { id: 'photo_camera', nameHu: 'Fényképezőgép', type: 'camera', pos: [-0.05, 0.98, 0.12] },
      { id: 'dots_projector', nameHu: 'D.O.T.S. Projektor', type: 'dots', pos: [-0.05, 0.98, 0.35] },

      // Shelf 3 (sy: 0.55)
      { id: 'writing_book', nameHu: 'Nyomozó Füzet', type: 'book', pos: [-0.05, 0.58, -0.35] },
      { id: 'video_camera', nameHu: 'Videókamera Állvánnyal', type: 'video_cam', pos: [-0.05, 0.58, -0.05] },
      { id: 'mobile_jesus', nameHu: 'Műszerfal Jézuska', type: 'crucifix', pos: [-0.05, 0.58, 0.22] },
      { id: 'smudge_sticks', nameHu: 'Füstölő Csomag', type: 'smudge', pos: [-0.05, 0.58, 0.42] },

      // Shelf 4 (sy: 0.15)
      { id: 'palinka_flask', nameHu: 'Házi Pálinkás Laposüveg', type: 'palinka', pos: [-0.05, 0.18, 0.0] }
    ];

    const modelFor = {
      flashlight: 'flashlight_t1', uv_light: 'uv_light', thermometer: 'thermometer', emf_reader: 'emf_reader', spirit_box: 'spirit_box',
      camera: 'photo_camera', book: 'ghost_writing_book', video_cam: 'video_camera', crucifix: 'mobile_jesus', smudge: 'smudge_sticks', palinka: 'sanity_palinka'
    };
    const shelfTops = [1.36, 0.96, 0.56, 0.16];
    toolDefs.forEach(tool => {
      let mesh;
      if (modelFor[tool.type]) {
        // Real tool model resting on its shelf; lights inside the models are removed (static display only)
        mesh = createToolViewmodel(modelFor[tool.type]);
        const lights = [];
        mesh.traverse((o) => { if (o.isLight) lights.push(o); });
        lights.forEach((l) => l.parent && l.parent.remove(l));
        const horizontal = tool.type === 'flashlight' || tool.type === 'uv_light';
        mesh.rotation.y = horizontal ? Math.PI / 2 : Math.PI / 2 + (tool.pos[2] > 0 ? -0.2 : 0.2);
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const top = shelfTops.reduce((a, b) => (Math.abs(b - tool.pos[1]) < Math.abs(a - tool.pos[1]) ? b : a));
        mesh.position.set(tool.pos[0], top + 0.012 - box.min.y, tool.pos[2]);
        mesh.userData = {};
      } else {
        mesh = this.createToolMesh(tool.type, tool.nameHu);
        mesh.position.set(tool.pos[0], tool.pos[1], tool.pos[2]);
        if (tool.type === 'dots') mesh.add(this._projectorProp());
      }
      mesh.userData = {
        isPickup: true,
        itemId: tool.id,
        nameHu: tool.nameHu,
        type: tool.type,
        action: 'pickup_item',
        promptHu: `[E] Felvétel: ${tool.nameHu}`
      };
      rackGroup.add(mesh);
      this.interactiveObjects.push(mesh);
      this.rackItemMeshes.set(tool.id, mesh);
    });
  }

  /** Compact D.O.T.S. projector prop for the shelf (the real model is a 7 m laser matrix). */
  _projectorProp() {
    const g = new THREE.Mesh(
      mergeParts([P.rbox(0.12, 0.06, 0.1, 0.01, 0, 0.03, 0), P.cyl(0.022, 0.022, 0.03, 12, 0, 0.035, -0.06, Math.PI / 2, 0, 0), P.cyl(0.008, 0.008, 0.02, 8, 0.04, 0.07, 0.01)]),
      this.matDarkMetal
    );
    return g;
  }

  createToolMesh(type, label) {
    const group = new THREE.Group();
    group.name = `ToolMesh_${type}`;

    switch (type) {
      case 'flashlight': {
        const bodyGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.18, 12);
        bodyGeo.rotateZ(Math.PI / 2);
        const body = new THREE.Mesh(bodyGeo, this.matDarkMetal);
        const headGeo = new THREE.CylinderGeometry(0.035, 0.025, 0.06, 12);
        headGeo.rotateZ(Math.PI / 2);
        const head = new THREE.Mesh(headGeo, this.matChrome);
        head.position.x = 0.1;
        group.add(body);
        group.add(head);
        break;
      }
      case 'uv_flashlight': {
        const bodyGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.16, 12);
        bodyGeo.rotateZ(Math.PI / 2);
        const purpleMat = new THREE.MeshStandardMaterial({ color: 0x6622aa, roughness: 0.4 });
        const body = new THREE.Mesh(bodyGeo, purpleMat);
        group.add(body);
        break;
      }
      case 'emf_reader': {
        const caseGeo = new THREE.BoxGeometry(0.08, 0.03, 0.15);
        const caseMesh = new THREE.Mesh(caseGeo, this.matDarkMetal);
        group.add(caseMesh);
        // 5 small LED dots (green, green, yellow, orange, red)
        const ledColors = [0x22ee44, 0x22ee44, 0xeeee22, 0xee8822, 0xee2222];
        ledColors.forEach((col, idx) => {
          const ledMat = new THREE.MeshBasicMaterial({ color: col });
          const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.012), ledMat);
          ledMesh.position.set(-0.025 + idx * 0.012, 0.018, -0.05);
          group.add(ledMesh);
        });
        break;
      }
      case 'spirit_box': {
        const radioGeo = new THREE.BoxGeometry(0.09, 0.04, 0.16);
        const radioMat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.5 });
        const radio = new THREE.Mesh(radioGeo, radioMat);
        group.add(radio);
        // Antenna
        const antGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.15, 6);
        const ant = new THREE.Mesh(antGeo, this.matChrome);
        ant.position.set(0.035, 0.08, -0.06);
        group.add(ant);
        break;
      }
      case 'crucifix': {
        // Mobile Jesus on gold pedestal
        const baseGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.025, 12);
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xddaa22, metalness: 0.8, roughness: 0.2 });
        const base = new THREE.Mesh(baseGeo, goldMat);
        const figureGeo = new THREE.BoxGeometry(0.04, 0.11, 0.02);
        const figure = new THREE.Mesh(figureGeo, goldMat);
        figure.position.y = 0.065;
        const armsGeo = new THREE.BoxGeometry(0.09, 0.018, 0.018);
        const arms = new THREE.Mesh(armsGeo, goldMat);
        arms.position.y = 0.09;
        group.add(base);
        group.add(figure);
        group.add(arms);
        break;
      }
      case 'palinka': {
        // Flat hip flask
        const flaskGeo = new THREE.BoxGeometry(0.07, 0.12, 0.03);
        const flaskMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.85, roughness: 0.2 });
        const flask = new THREE.Mesh(flaskGeo, flaskMat);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10), this.matChrome);
        cap.position.y = 0.07;
        group.add(flask);
        group.add(cap);
        break;
      }
      default: {
        // Generic compact tool box
        const defaultBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.05, 0.12),
          this.matDarkMetal
        );
        group.add(defaultBox);
        break;
      }
    }

    return group;
  }

  /* -------------------------------------------------------------
   * GREEN GATE RELEASE BUTTON
   * ----------------------------------------------------------- */
  buildGateButton() {
    const btnGroup = new THREE.Group();
    btnGroup.name = 'Gate_Release_Button';
    // Positioned beside the sliding door on starboard interior wall
    btnGroup.position.set(1.1, 1.25, 0.6);
    btnGroup.rotation.y = -Math.PI / 2;

    // Yellow hazard backplate
    const plateGeo = new THREE.BoxGeometry(0.18, 0.22, 0.03);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xddaa11,
      roughness: 0.4
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    btnGroup.add(plate);

    // Green round button
    const btnGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16);
    btnGeo.rotateX(Math.PI / 2);
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0x22cc44,
      emissive: 0x117722,
      emissiveIntensity: 0.7,
      roughness: 0.3
    });
    this.gateButtonMesh = new THREE.Mesh(btnGeo, btnMat);
    this.gateButtonMesh.position.set(0, 0, 0.025);
    this.gateButtonMesh.userData = {
      isInteractive: true,
      action: 'gate_button',
      promptHu: '[E] Telep Kapu Kinyitása'
    };
    btnGroup.add(this.gateButtonMesh);

    // Label: "KAPU NYITÁS"
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 128;
    textCanvas.height = 32;
    const tctx = textCanvas.getContext('2d');
    tctx.fillStyle = '#000000';
    tctx.fillRect(0, 0, 128, 32);
    tctx.fillStyle = '#ffffff';
    tctx.font = '14px bold sans-serif';
    tctx.fillText('KAPU NYITÁS', 14, 22);

    const textTex = new THREE.CanvasTexture(textCanvas);
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.04),
      new THREE.MeshBasicMaterial({ map: textTex })
    );
    labelMesh.position.set(0, -0.075, 0.02);
    btnGroup.add(labelMesh);

    this.interactiveObjects.push(this.gateButtonMesh);
    this.group.add(btnGroup);
  }

  /* -------------------------------------------------------------
   * DIGITAL COUNTDOWN TIMER DISPLAY
   * ----------------------------------------------------------- */
  buildCountdownTimer() {
    const timerGroup = new THREE.Group();
    timerGroup.name = 'Countdown_Timer';
    // Mounted above bulkhead door/partition
    timerGroup.position.set(0, 2.1, 1.34);
    timerGroup.rotation.y = Math.PI;

    const frameGeo = new THREE.BoxGeometry(0.48, 0.18, 0.04);
    const frame = new THREE.Mesh(frameGeo, this.matDarkMetal);
    timerGroup.add(frame);

    this.timerCanvas = document.createElement('canvas');
    this.timerCanvas.width = 256;
    this.timerCanvas.height = 96;
    this.timerTex = new THREE.CanvasTexture(this.timerCanvas);
    this.timerTex.minFilter = THREE.LinearFilter;

    const screenMat = new THREE.MeshBasicMaterial({ map: this.timerTex });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.14), screenMat);
    screen.position.set(0, 0, 0.022);
    timerGroup.add(screen);

    this.group.add(timerGroup);
    this.updateCountdown(this.remainingCountdownSeconds);
  }

  /* -------------------------------------------------------------
   * DETAILING (merged per material: a handful of draw calls)
   * Truck local frame: cargo floor y = 0.3, cargo z -2.2 .. 1.4, cab to z = 3.0, walls at x = +/-1.15
   * ----------------------------------------------------------- */
  buildTruckDetailing() {
    const g = new THREE.Group();
    g.name = 'Truck_Detailing';
    const add = (parts, mat, shadow = false) => {
      const m = new THREE.Mesh(mergeParts(parts, { tile: 1.2 }), mat);
      m.castShadow = shadow;
      g.add(m);
      return m;
    };
    const cargoZ = -0.4;
    const cabZ = 2.2;

    // ---- exterior bodywork (white paint)
    const paint = [];
    for (let i = 0; i < 6; i++) { // stamped vertical ribs on the port wall, outside face
      paint.push(P.rbox(0.03, 1.8, 0.1, 0.01, -1.18, 1.4, -2.0 + i * 0.6));
    }
    for (const z of [-1.8, -1.4]) paint.push(P.rbox(0.03, 1.8, 0.1, 0.01, 1.18, 1.4, z));
    for (const z of [0.6, 1.0]) paint.push(P.rbox(0.03, 1.8, 0.1, 0.01, 1.18, 1.4, z));
    for (let i = 0; i < 5; i++) paint.push(P.rbox(2.3, 0.04, 0.08, 0.01, 0, 2.56, -2.0 + i * 0.8)); // roof ribs
    for (const [wx, wz] of [[-1.15, cargoZ - 1.2], [1.15, cargoZ - 1.2], [-1.15, cabZ + 0.2], [1.15, cabZ + 0.2]]) {
      paint.push({ geometry: new THREE.TorusGeometry(0.47, 0.035, 5, 14, Math.PI), position: [wx + Math.sign(wx) * 0.02, 0.38, wz], rotation: [0, Math.PI / 2, 0] }); // wheel-arch flares
    }
    paint.push(P.rbox(2.3, 0.18, 0.18, 0.03, 0, 0.55, 3.0), P.rbox(2.0, 0.32, 0.06, 0.02, 0, 0.95, 3.02)); // cab nose + bonnet front
    paint.push(P.box(0.05, 0.9, 0.05, 1.18, 1.5, cabZ + 0.7), P.box(0.05, 0.9, 0.05, -1.18, 1.5, cabZ + 0.7)); // A-pillars hint
    add(paint, this.matWhitePaint, true);

    // ---- dark trim: bumpers, skid plate, roof rack, mirrors, handles, rails, wipers, exhaust
    const dark = [
      P.rbox(2.4, 0.28, 0.22, 0.05, 0, 0.36, 3.08), P.rbox(2.4, 0.2, 0.18, 0.04, 0, 0.3, -2.3), P.box(2.0, 0.08, 3.2, 0, 0.22, -0.4), // bumpers + underbody
      tube([-1.0, 2.7, -2.0], [-1.0, 2.7, 0.9], 0.02), tube([1.0, 2.7, -2.0], [1.0, 2.7, 0.9], 0.02), // roof rack rails
      P.box(2.0, 0.03, 0.04, 0, 2.7, -1.9), P.box(2.0, 0.03, 0.04, 0, 2.7, -1.0), P.box(2.0, 0.03, 0.04, 0, 2.7, -0.1), P.box(2.0, 0.03, 0.04, 0, 2.7, 0.8),
      P.cyl(0.015, 0.015, 0.1, 6, -1.0, 2.64, -2.0), P.cyl(0.015, 0.015, 0.1, 6, 1.0, 2.64, -2.0), P.cyl(0.015, 0.015, 0.1, 6, -1.0, 2.64, 0.9), P.cyl(0.015, 0.015, 0.1, 6, 1.0, 2.64, 0.9),
      P.rbox(0.06, 0.24, 0.16, 0.02, -1.3, 1.55, cabZ + 0.55), P.rbox(0.06, 0.24, 0.16, 0.02, 1.3, 1.55, cabZ + 0.55), // mirrors
      tube([-1.15, 1.5, cabZ + 0.5], [-1.28, 1.55, cabZ + 0.55], 0.012), tube([1.15, 1.5, cabZ + 0.5], [1.28, 1.55, cabZ + 0.55], 0.012),
      tube([1.2, 0.5, cargoZ - 0.6], [1.2, 0.5, cargoZ + 0.6], 0.025), tube([1.2, 2.3, cargoZ - 0.6], [1.2, 2.3, cargoZ + 0.6], 0.02), // sliding door rails
      tube([-0.45, 1.55, cabZ + 0.83], [0.05, 1.3, cabZ + 0.95], 0.008), tube([0.45, 1.55, cabZ + 0.83], [0.95, 1.3, cabZ + 0.95], 0.008), // wipers
      P.cyl(0.04, 0.04, 0.7, 8, -0.7, 0.28, -2.0, Math.PI / 2, 0, 0), // exhaust
      P.box(1.4, 0.05, 0.02, 0, 0.7, 3.2), P.box(1.4, 0.05, 0.02, 0, 0.8, 3.2), P.box(1.4, 0.05, 0.02, 0, 0.9, 3.2), // grille slats
      P.box(0.5, 0.07, 0.02, 0.5, 1.2, -2.31), // rear door gap
      P.rbox(0.8, 0.5, 0.6, 0.04, 0.4, 2.85, -1.2), P.cyl(0.18, 0.18, 0.06, 14, 0.4, 3.12, -1.2) // roof AC unit
    ];
    add(dark, this.matDarkMetal, true);

    // ---- satellite dish and antennas on the roof
    const dish = new THREE.Mesh(
      mergeParts([{ geometry: lathe([[0.0001, 0.0], [0.08, 0.01], [0.17, 0.045], [0.26, 0.1], [0.255, 0.1], [0.165, 0.04], [0.0001, 0.0]], 16), position: [0, 0.18, 0], rotation: [0.9, 0, 0] }]),
      this.matWhitePaint
    );
    dish.material = this.matWhitePaint;
    dish.position.set(-0.6, 2.7, -1.5);
    g.add(dish);
    add([P.cyl(0.02, 0.03, 0.2, 8, -0.6, 2.62, -1.5), tube([-0.6, 2.72, -1.5], [-0.6, 2.95, -1.35], 0.012), P.cyl(0.02, 0.02, 0.05, 6, -0.6, 2.97, -1.34),
      tube([0.8, 2.6, 0.6], [0.8, 3.7, 0.6], 0.01), tube([-0.8, 2.6, 0.3], [-0.8, 3.3, 0.3], 0.008), P.sphere(0.03, 1, 1, 1, 0.8, 3.7, 0.6, 6)], this.matDarkMetal);

    // ---- chrome: door handles, hub rings, grille emblem, fuel flap
    add([
      P.rbox(0.03, 0.05, 0.18, 0.01, 1.22, 1.3, cargoZ + 0.7), P.rbox(0.03, 0.05, 0.18, 0.01, 1.22, 1.3, cargoZ - 0.7), // sliding-door handles
      P.rbox(0.18, 0.05, 0.03, 0.01, -0.25, 1.3, -2.32), P.rbox(0.18, 0.05, 0.03, 0.01, 0.25, 1.3, -2.32), // rear door handles
      P.rbox(0.3, 0.1, 0.02, 0.02, 0, 0.82, 3.21), P.rbox(0.03, 0.05, 0.14, 0.01, -1.19, 1.35, cabZ + 0.1), P.rbox(0.03, 0.05, 0.14, 0.01, 1.19, 1.35, cabZ + 0.1),
      P.cyl(0.05, 0.05, 0.02, 10, -1.19, 0.9, -1.6, 0, 0, Math.PI / 2) // fuel cap
    ], this.matChrome);

    // ---- glass: cab side windows, rear door windows, headlight lenses
    add([
      P.box(0.03, 0.6, 1.0, 1.18, 1.5, cabZ + 0.1), P.box(0.03, 0.6, 1.0, -1.18, 1.5, cabZ + 0.1),
      P.box(0.4, 0.5, 0.03, -0.55, 1.5, -2.31), P.box(0.4, 0.5, 0.03, 0.55, 1.5, -2.31)
    ], this.matGlass);

    // ---- lamps: tail lights, headlight reflector rings, interior tube housing
    add([P.rbox(0.12, 0.36, 0.05, 0.02, -1.08, 0.9, -2.3), P.rbox(0.12, 0.36, 0.05, 0.02, 1.08, 0.9, -2.3), P.rbox(0.06, 0.1, 0.05, 0.02, -0.85, 0.25, 3.12), P.rbox(0.06, 0.1, 0.05, 0.02, 0.85, 0.25, 3.12)], this.matTailLamp);

    // ---- interior: ceiling fixture and conduits, wall cable trays, fire extinguisher, first aid box, floor mat, wall ribs
    const interior = [
      P.rbox(1.5, 0.06, 0.16, 0.02, 0, 2.5, -0.4), tube([-0.9, 2.46, -2.15], [-0.9, 2.46, 1.3], 0.02), tube([0.9, 2.46, -2.15], [0.9, 2.46, 1.3], 0.02),
      tube([-1.08, 2.0, -2.1], [-1.08, 2.0, -0.2], 0.018), tube([-1.08, 2.0, 0.6], [-1.08, 2.0, 1.3], 0.018), P.box(0.04, 0.12, 0.3, 1.08, 1.9, 1.0), // cable runs + junction box
      P.cyl(0.07, 0.07, 0.4, 12, 0.95, 1.0, 1.3), P.cyl(0.03, 0.04, 0.06, 8, 0.95, 1.23, 1.3), tube([0.95, 1.26, 1.3], [0.78, 1.0, 1.3], 0.012), // extinguisher
      P.rbox(0.3, 0.22, 0.09, 0.015, 0.3, 1.0, 1.31)
    ];
    for (let i = 0; i < 5; i++) interior.push(P.rbox(0.04, 1.7, 0.12, 0.01, 1.1, 1.15, -2.0 + i * 0.4 - (i > 2 ? 0 : 0))); // inner wall ribs (starboard rear)
    for (let i = 0; i < 6; i++) interior.push(P.rbox(0.04, 1.7, 0.12, 0.01, -1.09, 1.15, -2.0 + i * 0.6)); // port wall ribs
    add(interior, this.matDarkMetal);
    add([P.box(0.18, 0.1, 0.02, 0.3, 1.0, 1.35), P.rbox(0.24, 0.15, 0.04, 0.01, 0.3, 1.0, 1.325)], new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 })); // first-aid cross box
    add([P.cyl(0.07, 0.07, 0.4, 12, 0.95, 1.0, 1.3)], new THREE.MeshStandardMaterial({ color: 0xbb1111, roughness: 0.4, metalness: 0.5 }));
    add([P.box(0.9, 0.012, 3.2, 0.1, 0.35, -0.4)], this.matRubber); // rubber floor runner
    add([P.rbox(1.4, 0.07, 0.2, 0.03, 0, 2.47, -0.4)], this.matLampEmit);

    // ---- desk detailing (desk group is at (-0.75, 0.3, -1.2)): bezel, stand, vents, radio, lamp, papers, mug handle
    const desk = [
      P.rbox(0.46, 0.42, 0.03, 0.01, 0.05, 0.95, -0.108), P.box(0.1, 0.12, 0.12, 0.05, 0.78, -0.28), P.rbox(0.2, 0.03, 0.2, 0.01, 0.05, 0.74, -0.28),
      P.rbox(0.5, 0.5, 0.45, 0.02, 0.0, 0.47, 0.2), // drawer pedestal under the desk
      P.rbox(0.28, 0.08, 0.2, 0.01, 0.05, 0.79, 0.15), P.cyl(0.015, 0.015, 0.04, 8, 0.1, 0.84, 0.15), P.cyl(0.015, 0.015, 0.04, 8, 0.0, 0.84, 0.15), // CB radio on the desk
      tube([-0.3, 0.76, 0.5], [-0.3, 1.05, 0.55], 0.008), tube([-0.3, 1.05, 0.55], [-0.15, 1.15, 0.4], 0.008), P.cyl(0.05, 0.08, 0.06, 10, -0.12, 1.15, 0.38, 0.5, 0, 0), // desk lamp
      P.box(0.002, 0.2, 0.002, 0.2, 0.8, 0.1)
    ];
    for (let i = 0; i < 8; i++) desk.push(P.box(0.3, 0.012, 0.006, 0.05, 0.99 - i * 0.025, -0.45)); // vent slots on monitor rear
    for (let i = 0; i < 3; i++) desk.push(P.box(0.42, 0.14, 0.01, 0, 0.5 - i * 0.16 + 0.1, 0.43)); // drawer fronts
    const deskMesh = add(desk, this.matDarkMetal, true);
    deskMesh.position.set(-0.75, 0.3, -1.2);
    add([P.rbox(0.3, 0.003, 0.22, 0.001, 0.2, 0.755, 0.12, 0, 0.2, 0), P.rbox(0.22, 0.003, 0.3, 0.001, 0.0, 0.757, 0.3, 0, -0.1, 0)], new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.9 })).position.set(-0.75, 0.3, -1.2);
    add([P.torus(0.025, 0.006, 5, 10, 0.245, 0.78, 0.45, 0, 0, 0)], new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.3 })).position.set(-0.75, 0.3, -1.2);

    // ---- display frames: bolts, brackets and a marker tray
    const bolts = [];
    for (const [cx, cy, cz, hw, hh] of [[-0.45, 1.6, 1.35, 0.45, 0.275], [0.55, 1.55, 1.35, 0.475, 0.375], [0, 2.1, 1.34, 0.24, 0.09]]) {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const lx = sx * (hw - 0.02);
        const ly = sy * (hh - 0.02);
        bolts.push(P.cyl(0.008, 0.008, 0.012, 6, cx + lx, cy + ly, cz - 0.03, Math.PI / 2, 0, 0));
      }
    }
    add(bolts, this.matChrome);

    // ---- gate button guard cage
    const guard = [tube([1.095, 1.34, 0.5], [1.095, 1.34, 0.7], 0.008), tube([1.095, 1.16, 0.5], [1.095, 1.16, 0.7], 0.008), tube([1.07, 1.34, 0.5], [1.07, 1.16, 0.5], 0.008), tube([1.07, 1.34, 0.7], [1.07, 1.16, 0.7], 0.008)];
    add(guard, this.matDarkMetal);

    this.group.add(g);
  }

  /* -------------------------------------------------------------
   * COLLIDERS
   * ----------------------------------------------------------- */
  buildColliders() {
    const p = this.rootPosition;

    // Van exterior collision boxes (blocks walking through van outer walls)
    // Left port wall: X: -5.2 to -5.0
    this.colliders.push(new BoxCollider({
      id: 'truck_port_wall',
      tag: 'vehicle',
      surface: SURFACE_TYPES.METAL,
      min: new THREE.Vector3(p.x - 1.25, p.y, p.z - 2.5),
      max: new THREE.Vector3(p.x - 1.05, p.y + 2.5, p.z + 2.0)
    }));

    // Front cab block
    this.colliders.push(new BoxCollider({
      id: 'truck_cab_block',
      tag: 'vehicle',
      surface: SURFACE_TYPES.METAL,
      min: new THREE.Vector3(p.x - 1.25, p.y, p.z + 1.4),
      max: new THREE.Vector3(p.x + 1.25, p.y + 2.5, p.z + 2.8)
    }));

    // Rear double door wall
    this.colliders.push(new BoxCollider({
      id: 'truck_rear_wall',
      tag: 'vehicle',
      surface: SURFACE_TYPES.METAL,
      min: new THREE.Vector3(p.x - 1.25, p.y, p.z - 2.3),
      max: new THREE.Vector3(p.x + 1.25, p.y + 2.5, p.z - 2.1)
    }));

    // Right starboard wall front section (door opening local z: -1.0 to +0.2, matching the visible sliding-door gap)
    this.colliders.push(new BoxCollider({
      id: 'truck_starboard_front',
      tag: 'vehicle',
      surface: SURFACE_TYPES.METAL,
      min: new THREE.Vector3(p.x + 1.05, p.y, p.z + 0.2),
      max: new THREE.Vector3(p.x + 1.25, p.y + 2.5, p.z + 1.4)
    }));

    // Right starboard wall rear section
    this.colliders.push(new BoxCollider({
      id: 'truck_starboard_rear',
      tag: 'vehicle',
      surface: SURFACE_TYPES.METAL,
      min: new THREE.Vector3(p.x + 1.05, p.y, p.z - 2.2),
      max: new THREE.Vector3(p.x + 1.25, p.y + 2.5, p.z - 1.0)
    }));

    // Interior desk collider
    this.colliders.push(new BoxCollider({
      id: 'truck_interior_desk',
      tag: 'prop',
      surface: SURFACE_TYPES.CONCRETE,
      min: new THREE.Vector3(p.x - 1.15, p.y, p.z - 1.8),
      max: new THREE.Vector3(p.x - 0.45, p.y + 1.1, p.z - 0.5)
    }));

    // Safe Haven trigger volume (strictly covers truck and immediate entry)
    this.colliders.push(new BoxCollider({
      id: 'truck_safe_haven_volume',
      tag: 'safe_zone',
      isTrigger: true,
      isSafeZone: true,
      min: this.safeZoneBounds.min,
      max: this.safeZoneBounds.max
    }));
  }

  /* -------------------------------------------------------------
   * DYNAMIC DISPLAY UPDATES (CANVAS RENDERING)
   * ----------------------------------------------------------- */

  /**
   * Cycles CRT surveillance monitor to next or previous camera.
   */
  cycleCamera(direction = 1) {
    this.currentCameraIndex = (this.currentCameraIndex + direction + this.cameras.length) % this.cameras.length;
    this.renderSurveillanceFeed();
    if (this.onCameraCycleCallback) {
      this.onCameraCycleCallback(this.currentCameraIndex, this.cameras[this.currentCameraIndex]);
    }
  }

  renderSurveillanceFeed() {
    const ctx = this.surveillanceCanvas.getContext('2d');
    const w = this.surveillanceCanvas.width;
    const h = this.surveillanceCanvas.height;

    // Background: dark night-vision green
    ctx.fillStyle = '#06180b';
    ctx.fillRect(0, 0, w, h);

    // Procedural night vision wireframe / silhouettes based on selected camera
    ctx.strokeStyle = '#1de855';
    ctx.lineWidth = 2;

    const cam = this.cameras[this.currentCameraIndex];

    if (cam.id === 0) {
      // Rear gate view
      ctx.strokeRect(80, 100, 350, 180);
      ctx.beginPath();
      ctx.moveTo(80, 280);
      ctx.lineTo(255, 140);
      ctx.lineTo(430, 280);
      ctx.stroke();
      // Draw iron gate bars
      for (let x = 120; x <= 390; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 150);
        ctx.lineTo(x, 280);
        ctx.stroke();
      }
    } else if (cam.id === 1) {
      // Yard view with fence
      ctx.strokeRect(60, 80, 390, 200);
      ctx.beginPath();
      ctx.arc(250, 160, 40, 0, Math.PI * 2);
      ctx.stroke();
    } else if (cam.id === 2) {
      // Zone 2 Car Stacks
      for (let i = 0; i < 4; i++) {
        ctx.strokeRect(100 + i * 60, 120 + i * 20, 100, 50);
      }
    } else {
      // Zone 1 Mázsaház interior
      ctx.strokeRect(100, 80, 310, 200);
      ctx.strokeRect(140, 160, 120, 70); // Desk
    }

    // CRT Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 2);
    }

    // Noise specks
    ctx.fillStyle = 'rgba(40, 220, 90, 0.15)';
    for (let i = 0; i < 150; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }

    // Header Overlay: Camera name & Night Vision info
    ctx.fillStyle = '#22ee66';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(cam.name, 18, 32);

    ctx.font = '16px monospace';
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    ctx.fillText(`ÉJJELLÁTÓ [ON]  •  ${timeStr}`, 18, 60);

    // REC Indicator
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(w - 70, 28, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('REC', w - 55, 34);

    this.surveillanceTex.needsUpdate = true;
  }

  /**
   * Updates Team Sanity Wall Display with player list and sanity values.
   */
  updateSanity(players = []) {
    const ctx = this.sanityCanvas.getContext('2d');
    const w = this.sanityCanvas.width;
    const h = this.sanityCanvas.height;

    // Dark Navy background adhering to SharkVoic tokens
    ctx.fillStyle = '#090a18';
    ctx.fillRect(0, 0, w, h);

    // Card frame
    ctx.strokeStyle = '#1b2040';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Title
    ctx.fillStyle = '#7655f5';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('CSAPAT ELMEÁLLAPOT (SANITY)', 24, 40);

    // Draw up to 4 player sanity rows
    const startY = 80;
    const rowH = 50;
    let totalSanity = 0;

    players.forEach((p, idx) => {
      const y = startY + idx * rowH;
      const sVal = Math.max(0, Math.min(100, Math.round(p.sanity)));
      totalSanity += sVal;

      // Color coding rule (Point 33):
      // > 50%: #28C997 (Green)
      // 25 - 50%: #F59E0B (Orange)
      // < 25%: #E94B64 (Red)
      let barColor = '#28c997';
      if (sVal < 25) barColor = '#e94b64';
      else if (sVal <= 50) barColor = '#f59e0b';

      // Player name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${idx + 1}. ${p.name || 'Játékos'}`, 24, y);

      // Percentage
      ctx.fillStyle = barColor;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`${sVal}%`, 180, y);

      // Progress bar background
      ctx.fillStyle = '#151832';
      ctx.fillRect(250, y - 16, 230, 20);

      // Progress bar fill
      ctx.fillStyle = barColor;
      const fillW = (sVal / 100) * 230;
      ctx.fillRect(250, y - 16, fillW, 20);

      ctx.strokeStyle = '#272d56';
      ctx.lineWidth = 1;
      ctx.strokeRect(250, y - 16, 230, 20);
    });

    // Team average footer
    const avg = players.length > 0 ? Math.round(totalSanity / players.length) : 100;
    ctx.fillStyle = '#999bbe';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Csapat átlag: ${avg}%`, 24, h - 20);

    this.sanityTex.needsUpdate = true;
  }

  /**
   * Updates Paranormal Activity Graph Display (0-10 scale).
   */
  updateActivity(level = 0) {
    this.currentActivity = Math.max(0, Math.min(10, Math.round(level)));
    this.activityHistory.shift();
    this.activityHistory.push(this.currentActivity);
    this.renderActivityGraph();
  }

  renderActivityGraph() {
    const ctx = this.activityCanvas.getContext('2d');
    const w = this.activityCanvas.width;
    const h = this.activityCanvas.height;

    // Dark background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = '#28c997';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('PARANORMÁLIS AKTIVITÁS (EMF)', 16, 26);

    // Current intensity readout
    const isHigh = this.currentActivity >= 8;
    ctx.fillStyle = isHigh ? '#e94b64' : '#28c997';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`${this.currentActivity}`, w - 45, 30);

    // Grid lines (0 to 10)
    const graphX = 35;
    const graphY = 45;
    const graphW = w - 50;
    const graphH = h - 65;

    ctx.strokeStyle = '#182420';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 10; i += 2) {
      const lineY = graphY + graphH - (i / 10) * graphH;
      ctx.beginPath();
      ctx.moveTo(graphX, lineY);
      ctx.lineTo(graphX + graphW, lineY);
      ctx.stroke();

      ctx.fillStyle = '#486850';
      ctx.font = '10px monospace';
      ctx.fillText(`${i}`, 14, lineY + 4);
    }

    // Draw activity line graph
    ctx.strokeStyle = isHigh ? '#e94b64' : '#28c997';
    ctx.lineWidth = 3;
    ctx.beginPath();

    const stepX = graphW / (this.activityHistory.length - 1);
    this.activityHistory.forEach((val, idx) => {
      const ptX = graphX + idx * stepX;
      const ptY = graphY + graphH - (val / 10) * graphH;
      if (idx === 0) ctx.moveTo(ptX, ptY);
      else ctx.lineTo(ptX, ptY);
    });
    ctx.stroke();

    this.activityTex.needsUpdate = true;
  }

  /**
   * Updates Mission Whiteboard with objectives and ghost status.
   */
  updateWhiteboard(data = {}) {
    const ctx = this.whiteboardCanvas.getContext('2d');
    const w = this.whiteboardCanvas.width;
    const h = this.whiteboardCanvas.height;

    // Accept both shapes: { primary: { textHu, done }, objectives: [{ id, textHu, done, rewardFt }] }
    // and the legacy { primaryCompleted, sideObjectives: [{ desc, bounty, completed }] }
    const primary = data.primary && typeof data.primary === 'object' ? data.primary : null;
    const primaryDone = primary ? !!primary.done : !!data.primaryCompleted;
    const primaryText = (primary && primary.textHu) || 'Határozd meg a szellem fajtáját';
    const side = Array.isArray(data.objectives)
      ? data.objectives.filter(Boolean).map((o) => ({ text: o.textHu || o.desc || '', reward: o.rewardFt ?? o.bounty ?? 0, done: !!(o.done ?? o.completed) }))
      : (data.sideObjectives || [
        { desc: 'Fotózd le a szellemet', bounty: 1000, completed: false },
        { desc: 'Mérj 0.0°C alatti hőmérsékletet', bounty: 500, completed: false },
        { desc: 'Akadályozz meg vadászatot Mobile Jesus-szal', bounty: 800, completed: false }
      ]).map((o) => ({ text: o.desc || o.textHu || '', reward: o.bounty ?? o.rewardFt ?? 0, done: !!(o.completed ?? o.done) }));

    // Dry-erase surface with faint ghosting of old marker strokes
    ctx.fillStyle = '#f4f5f8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120, 130, 150, 0.06)';
    for (let i = 0; i < 9; i++) ctx.fillRect(20 + ((i * 97) % 500), 70 + ((i * 53) % 380), 90 + ((i * 31) % 120), 6);

    // Header
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('MISKOLCI PARANORMÁLIS FELADATOK', 30, 48);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 60);
    ctx.lineTo(w - 30, 60);
    ctx.stroke();

    // Known ghost info section (only shown if provided)
    let y = 95;
    if (data.ghostName) {
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`Szellem neve: ${data.ghostName}`, 30, y);
      y += 27;
      if (data.ghostResponse) {
        ctx.font = '16px sans-serif';
        ctx.fillText(`Viselkedés: ${data.ghostResponse}`, 30, y);
        y += 27;
      }
    }

    // Simple word wrap
    const wrap = (text, x, startY, maxW, lineH, maxLines = 2) => {
      const words = String(text).split(' ');
      let line = '';
      let yy = startY;
      let lines = 0;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, x, yy);
          line = word;
          yy += lineH;
          if (++lines >= maxLines) break;
        } else {
          line = test;
        }
      }
      if (lines < maxLines) ctx.fillText(line, x, yy);
      return yy + lineH;
    };
    const checkbox = (x, yy, done, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, yy - 17, 20, 20);
      if (done) {
        ctx.beginPath();
        ctx.moveTo(x + 3, yy - 7);
        ctx.lineTo(x + 9, yy);
        ctx.lineTo(x + 24, yy - 20);
        ctx.stroke();
      }
    };

    // Primary objective
    y = Math.max(y + 18, 150);
    ctx.fillStyle = primaryDone ? '#15803d' : '#0f766e';
    ctx.font = 'bold 19px sans-serif';
    checkbox(30, y, primaryDone, ctx.fillStyle);
    y = wrap(`Fő feladat: ${primaryText} (+2,000 Ft)`, 64, y, w - 100, 24, 2);

    // Secondary objectives
    y += 18;
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Mellékfeladatok:', 30, y);
    y += 16;

    ctx.font = '16px sans-serif';
    side.slice(0, 5).forEach((t, i) => {
      y += 26;
      const col = t.done ? '#15803d' : '#1e293b';
      ctx.fillStyle = col;
      checkbox(45, y, t.done, col);
      y = wrap(`${i + 1}. ${t.text}${t.reward ? ` (+${t.reward} Ft)` : ''}`, 78, y, w - 120, 21, 2);
    });

    // Warning note in Hungarian
    ctx.fillStyle = '#b91c1c';
    ctx.font = 'italic 15px sans-serif';
    ctx.fillText('FIGYELEM: A furgon elhagyása után a szellem agresszívvé válhat!', 30, h - 35);

    this.whiteboardTex.needsUpdate = true;
  }

  /**
   * Updates countdown timer display.
   */
  updateCountdown(secondsRemaining = 0) {
    this.remainingCountdownSeconds = Math.max(0, Math.round(secondsRemaining));
    const mins = Math.floor(this.remainingCountdownSeconds / 60);
    const secs = this.remainingCountdownSeconds % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const ctx = this.timerCanvas.getContext('2d');
    const w = this.timerCanvas.width;
    const h = this.timerCanvas.height;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Digital red 7-segment clock readout
    ctx.fillStyle = this.remainingCountdownSeconds <= 30 ? '#ff1111' : '#ee3333';
    ctx.font = 'bold 54px monospace';
    ctx.fillText(timeStr, 45, 68);

    this.timerTex.needsUpdate = true;
  }

  /**
   * Presses the green gate release button.
   */
  pressGateButton() {
    this.isGateUnlocked = true;
    if (this.gateButtonMesh) {
      // Temporary press depression animation
      this.gateButtonMesh.position.z = 0.01;
      setTimeout(() => {
        if (this.gateButtonMesh) this.gateButtonMesh.position.z = 0.025;
      }, 250);
    }
    if (this.onGateOpenCallback) {
      this.onGateOpenCallback();
    }
    return { success: true, gateUnlocked: true };
  }

  /**
   * Marks a tool item on the rack as picked up or returned.
   */
  setItemPickedUp(itemId, pickedUp = true) {
    const mesh = this.rackItemMeshes.get(itemId);
    if (mesh) {
      mesh.visible = !pickedUp;
    }
  }

  /**
   * Safe zone test against player position.
   */
  isPlayerInSafeZone(position) {
    return this.safeZoneBounds.containsPoint(position);
  }

  /**
   * Update lifecycle hook (e.g. animated screen scanlines or activity pulse).
   */
  update(delta) {
    // Can periodically refresh display or animate button pulses if needed
  }
}
