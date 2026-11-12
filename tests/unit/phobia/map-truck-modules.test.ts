/**
 * Port of tests/legacy/map-truck-modules.legacy.mjs (45 legacy checks, all preserved).
 * The canvas used for CanvasTextures is stubbed with vi.stubGlobal('document') in beforeAll and restored in afterAll.
 * Each legacy check keeps its message as the expect() message. The legacy scripts were one
 * stateful sequence, so each legacy group is one it() and the groups must run in this order.
 *
 * legacy group -> it()  (legacy checks)
 *   GROUP 1 MapColliders base  (3)
 *   GROUP 2 Multi-surface detection  (4)
 *   GROUP 3 Zones and safe haven  (8)
 *   GROUP 4 Hinged doors and hiding spots  (5)
 *   GROUP 5 TruckEnvironment  (13)
 *   GROUP 6 ScrapYardMap  (12)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';
import {
  MapColliders,
  BoxCollider,
  HingedDoor,
  HidingSpot,
  SurfaceZone,
  SURFACE_TYPES,
  ZONE_KEYS
} from '../../../src/features/games/phobia/lib/map/MapColliders.ts';
import { TruckEnvironment } from '../../../src/features/games/phobia/lib/map/TruckEnvironment.ts';
import { ScrapYardMap } from '../../../src/features/games/phobia/lib/map/ScrapYardMap.ts';

describe('M6 MapColliders, TruckEnvironment and ScrapYardMap', () => {
  let colliders: MapColliders;

  // Minimal canvas mock: TruckEnvironment / ScrapYardMap paint CanvasTextures at construction.
  beforeAll(() => {
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 512,
            height: 512,
            getContext: () => ({
              fillRect: () => {},
              strokeRect: () => {},
              fillText: () => {},
              beginPath: () => {},
              closePath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              arc: () => {},
              fill: () => {},
              stroke: () => {},
              clearRect: () => {},
              save: () => {},
              restore: () => {},
              translate: () => {},
              rotate: () => {},
              scale: () => {},
              measureText: () => ({ width: 40 }),
              createRadialGradient: () => ({ addColorStop: () => {} }),
              createLinearGradient: () => ({ addColorStop: () => {} }),
              fillStyle: '#000000',
              strokeStyle: '#000000',
              lineWidth: 1,
              font: '16px sans-serif'
            })
          };
        }
        return {};
      }
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });


  // TEST 1: MapColliders - AABB & Player Capsule Resolution

  it('MapColliders Base Functionality', () => {
    colliders = new MapColliders();

    const testWall = new BoxCollider({
      id: 'test_wall_1',
      tag: 'wall',
      surface: SURFACE_TYPES.CONCRETE,
      min: new THREE.Vector3(0, 0, 0),
      max: new THREE.Vector3(1, 3, 5)
    });
    colliders.addCollider(testWall);

    expect(colliders.colliders.length, 'Collider added to MapColliders').toBeGreaterThanOrEqual(1);

    // Test collision resolution
    const currentPos = new THREE.Vector3(-0.5, 0, 2.5);
    const vel = new THREE.Vector3(2.0, 0, 0); // Moving towards wall at x = 0
    const res = colliders.resolvePlayerMovement(currentPos, vel, 0.5, 0.35, 1.8);
    expect(res.collided, 'Player collision detected against wall').toBe(true);
    expect(res.position.x, 'Player prevented from penetrating through wall').toBeLessThan(0.0);

    // TEST 2: Multi-Surface Querying
  });

  it('Multi-Surface Detection', () => {
    const surfYard = colliders.getSurfaceTypeAt(0, 5, 0); // Gravel yard
    expect(surfYard, `Yard surface detected as gravel (got: ${surfYard})`).toBe(SURFACE_TYPES.GRAVEL);

    const surfOffice = colliders.getSurfaceTypeAt(13, 7, 1); // Zone 1 Mázsaház office
    expect(surfOffice, `Zone 1 office detected as concrete (got: ${surfOffice})`).toBe(SURFACE_TYPES.CONCRETE);

    const surfMud = colliders.getSurfaceTypeAt(25, 20, 0); // Zone 5 mud
    expect(surfMud, `Zone 5 detected as mud (got: ${surfMud})`).toBe(SURFACE_TYPES.MUD);

    const surfWeighPlate = colliders.getSurfaceTypeAt(7.0, 6.0, 0.1); // Weigh scale platform
    expect(surfWeighPlate, `Weighbridge platform detected as metal (got: ${surfWeighPlate})`).toBe(SURFACE_TYPES.METAL);

    // TEST 3: Zone Identification & Truck Safe Zone
  });

  it('Zone Identification & Safe Haven', () => {
    const truckZone = colliders.getZoneAt(-4.0, -15.0);
    expect(truckZone.id, `Truck position correctly identified as truck zone (got: ${truckZone.id})`).toBe(ZONE_KEYS.TRUCK);
    expect(truckZone.isSafeZone, 'Truck zone marked as safe haven').toBe(true);
    expect(colliders.isInsideSafeZone(new THREE.Vector3(-4.0, 1.0, -15.0)), 'isInsideSafeZone returns true for truck interior').toBe(true);

    const zone1 = colliders.getZoneAt(13.0, 7.0);
    expect(zone1.id, `Coordinates (13, 7) identified as zone1 (got: ${zone1.id})`).toBe(ZONE_KEYS.ZONE1);

    const zone2 = colliders.getZoneAt(-16.0, 15.0);
    expect(zone2.id, `Coordinates (-16, 15) identified as zone2 (got: ${zone2.id})`).toBe(ZONE_KEYS.ZONE2);

    const zone3 = colliders.getZoneAt(8.0, 30.0);
    expect(zone3.id, `Coordinates (8, 30) identified as zone3 (got: ${zone3.id})`).toBe(ZONE_KEYS.ZONE3);

    const zone4 = colliders.getZoneAt(-20.0, 35.0);
    expect(zone4.id, `Coordinates (-20, 35) identified as zone4 (got: ${zone4.id})`).toBe(ZONE_KEYS.ZONE4);

    const zone5 = colliders.getZoneAt(25.0, 20.0);
    expect(zone5.id, `Coordinates (25, 20) identified as zone5 (got: ${zone5.id})`).toBe(ZONE_KEYS.ZONE5);

    // TEST 4: Hinged Doors & Hiding Spots
  });

  it('Hinged Doors & Hiding Spots', () => {
    const testDoorGroup = new THREE.Group();
    const door = new HingedDoor({
      id: 'test_door',
      doorMesh: testDoorGroup,
      pivot: new THREE.Vector3(10, 0, 10),
      closedAngle: 0,
      openAngle: Math.PI / 2,
      width: 1.0,
      height: 2.0
    });
    colliders.addDoor(door);

    expect(door.isOpen, 'Door initially closed').toBe(false);
    door.toggle();
    expect(door.isOpen, 'Door toggled open').toBe(true);
    door.update(0.5);
    expect(door.currentAngle, 'Door animated open over time').toBeGreaterThan(0);

    const lockerSpot = new HidingSpot({
      id: 'test_locker',
      type: 'locker',
      zone: ZONE_KEYS.ZONE1,
      bounds: new THREE.Box3(new THREE.Vector3(14, 0, 14), new THREE.Vector3(15, 2, 15)),
      door
    });
    colliders.addHidingSpot(lockerSpot);

    const playerPosInside = new THREE.Vector3(14.5, 0.5, 14.5);
    expect(lockerSpot.isPlayerInside(playerPosInside), 'Player recognized inside locker').toBe(true);
    door.close();
    door.update(2.0); // complete close
    expect(lockerSpot.breaksGhostLOS(playerPosInside), 'Closed locker breaks ghost Line of Sight').toBe(true);

    // TEST 5: TruckEnvironment Verification
  });

  it('TruckEnvironment Instantiation & Interfaces', () => {
    const truck = new TruckEnvironment();
    expect(truck.group, 'Truck group instantiated').toBeInstanceOf(THREE.Group);
    expect(truck.group.position.x === -4.0 && truck.group.position.z === -15.0, 'Truck positioned at (-4, 0, -15)').toBeTruthy();
    expect(truck.isPlayerInSafeZone(new THREE.Vector3(-4.0, 1.0, -15.0)), 'Safe haven covers truck interior').toBe(true);

    // Test Camera Cycling
    const initialCam = truck.currentCameraIndex;
    truck.cycleCamera(1);
    expect(truck.currentCameraIndex, 'CRT monitor cycles cameras').toBe((initialCam + 1) % truck.cameras.length);

    // Test Sanity Update
    const sanityInitVer = truck.sanityTex.version;
    truck.updateSanity([
      { name: 'Kovács', sanity: 85 },
      { name: 'Nagy', sanity: 40 },
      { name: 'Tóth', sanity: 15 }
    ]);
    expect(truck.sanityTex.version, 'Sanity canvas texture marked for update (version incremented)').toBeGreaterThan(sanityInitVer);

    // Test Activity Graph
    const actInitVer = truck.activityTex.version;
    truck.updateActivity(8);
    expect(truck.currentActivity, 'Activity level updated to 8').toBe(8);
    expect(truck.activityTex.version, 'Activity canvas texture updated (version incremented)').toBeGreaterThan(actInitVer);

    // Test Whiteboard
    const wbInitVer = truck.whiteboardTex.version;
    truck.updateWhiteboard({
      ghostName: 'Kolompár Kálmán',
      ghostResponse: 'Csak egyedül lévőnek',
      primaryCompleted: false,
      sideObjectives: [{ desc: 'EMF 5 mérése', bounty: 500, completed: true }]
    });
    expect(truck.whiteboardTex.version, 'Whiteboard canvas updated with Hungarian objectives').toBeGreaterThan(wbInitVer);

    // Contract shape: { primary: { textHu, done }, objectives: [{ id, textHu, done, rewardFt }] }
    const wbShapeVer = truck.whiteboardTex.version;
    truck.updateWhiteboard({
      primary: { textHu: 'Határozd meg a szellem fajtáját', done: true },
      objectives: [
        { id: 'obj_emf5', textHu: 'Mérj EMF 5 jelzést', done: false, rewardFt: 600 },
        { id: 'obj_photo', textHu: 'Fotózd le a szellemet', done: true, rewardFt: 1000 },
        { id: 'obj_cold', textHu: 'Mérj fagypont alatti hőmérsékletet', done: false, rewardFt: 500 }
      ]
    });
    expect(truck.whiteboardTex.version, 'Whiteboard accepts { primary, objectives } contract shape').toBeGreaterThan(wbShapeVer);
    truck.updateWhiteboard({ primary: null, objectives: [] });
    truck.updateWhiteboard();

    // Test Gate Button
    let gateOpenedViaButton = false;
    truck.onGateOpenCallback = () => { gateOpenedViaButton = true; };
    truck.pressGateButton();
    expect(truck.isGateUnlocked, 'Gate button unlocked status').toBe(true);
    expect(gateOpenedViaButton, 'Gate open callback fired').toBe(true);

    // Test Equipment Shelving Tools
    expect(truck.rackItemMeshes.size, `Equipment rack contains 12+ items (got: ${truck.rackItemMeshes.size})`).toBeGreaterThanOrEqual(12);
    truck.setItemPickedUp('flashlight_1', true);
    expect(truck.rackItemMeshes.get('flashlight_1')?.visible, 'Picked up item hidden on rack').toBe(false);

    // TEST 6: ScrapYardMap Verification
  });

  it('ScrapYardMap Instantiation & Electrical Grid', () => {
    const map = new ScrapYardMap({ mapColliders: colliders });
    expect(map.group, 'ScrapYardMap group created').toBeInstanceOf(THREE.Group);
    expect(map.lightFixtures.size, `Scrap yard light fixtures registered (got: ${map.lightFixtures.size})`).toBeGreaterThanOrEqual(5);

    // Test Circuit Breaker Toggle & Overload
    expect(map.isBreakerOn, 'Circuit breaker initially ON').toBe(true);
    map.setBreakerState(false, 'TEST');
    expect(map.isBreakerOn, 'Circuit breaker flipped OFF').toBe(false);

    map.setBreakerState(true, 'TEST');
    expect(map.isBreakerOn, 'Circuit breaker flipped ON').toBe(true);

    // Test Gate toggle
    expect(map.leftGateDoor !== undefined && map.rightGateDoor !== undefined, 'Entrance gates present').toBeTruthy();
    map.toggleGate(true);
    expect(map.leftGateDoor.isOpen, 'Entrance gates open').toBe(true);

    // Test Car Alarm Trigger
    const alarmRes = map.triggerCarAlarm(10);
    expect(map.isCarAlarmActive, 'Car alarm active').toBe(true);
    expect(alarmRes.duration, 'Car alarm duration 10 seconds').toBe(10);

    // Test MapColliders integration
    expect(colliders.colliders.length, `World colliders registered in manager (got: ${colliders.colliders.length})`).toBeGreaterThan(15);
    expect(colliders.doors.size, `Hinged doors registered in manager (got: ${colliders.doors.size})`).toBeGreaterThanOrEqual(4);
    expect(colliders.hidingSpots.size, `Hiding spots (lockers + car trunks) registered (got: ${colliders.hidingSpots.size})`).toBeGreaterThanOrEqual(7);
  });
});
