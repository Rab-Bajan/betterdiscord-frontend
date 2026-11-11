/**
 * test_map_truck_modules.mjs
 *
 * Verification suite for M6 Map & Truck components:
 * - MapColliders.js
 * - TruckEnvironment.js
 * - ScrapYardMap.js
 */

import * as THREE from 'three';

// Provide minimal mock for document.createElement('canvas') if running in Node
if (typeof document === 'undefined') {
  global.document = {
    createElement: (tag) => {
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
  };
}

// Import components
import {
  MapColliders,
  BoxCollider,
  HingedDoor,
  HidingSpot,
  SurfaceZone,
  SURFACE_TYPES,
  ZONE_KEYS
} from '../../src/components/phobia/map/MapColliders.js';

import { TruckEnvironment } from '../../src/components/phobia/map/TruckEnvironment.js';
import { ScrapYardMap } from '../../src/components/phobia/map/ScrapYardMap.js';

console.log('--- STARTING M6 MAP & TRUCK VERIFICATION ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
  passedTests++;
}

// TEST 1: MapColliders - AABB & Player Capsule Resolution
console.log('\n[TEST GROUP 1: MapColliders Base Functionality]');
const colliders = new MapColliders();

const testWall = new BoxCollider({
  id: 'test_wall_1',
  tag: 'wall',
  surface: SURFACE_TYPES.CONCRETE,
  min: new THREE.Vector3(0, 0, 0),
  max: new THREE.Vector3(1, 3, 5)
});
colliders.addCollider(testWall);

assert(colliders.colliders.length >= 1, 'Collider added to MapColliders');

// Test collision resolution
const currentPos = new THREE.Vector3(-0.5, 0, 2.5);
const vel = new THREE.Vector3(2.0, 0, 0); // Moving towards wall at x = 0
const res = colliders.resolvePlayerMovement(currentPos, vel, 0.5, 0.35, 1.8);
assert(res.collided === true, 'Player collision detected against wall');
assert(res.position.x < 0.0, 'Player prevented from penetrating through wall');

// TEST 2: Multi-Surface Querying
console.log('\n[TEST GROUP 2: Multi-Surface Detection]');
const surfYard = colliders.getSurfaceTypeAt(0, 5, 0); // Gravel yard
assert(surfYard === SURFACE_TYPES.GRAVEL, `Yard surface detected as gravel (got: ${surfYard})`);

const surfOffice = colliders.getSurfaceTypeAt(13, 7, 1); // Zone 1 Mázsaház office
assert(surfOffice === SURFACE_TYPES.CONCRETE, `Zone 1 office detected as concrete (got: ${surfOffice})`);

const surfMud = colliders.getSurfaceTypeAt(25, 20, 0); // Zone 5 mud
assert(surfMud === SURFACE_TYPES.MUD, `Zone 5 detected as mud (got: ${surfMud})`);

const surfWeighPlate = colliders.getSurfaceTypeAt(7.0, 6.0, 0.1); // Weigh scale platform
assert(surfWeighPlate === SURFACE_TYPES.METAL, `Weighbridge platform detected as metal (got: ${surfWeighPlate})`);

// TEST 3: Zone Identification & Truck Safe Zone
console.log('\n[TEST GROUP 3: Zone Identification & Safe Haven]');
const truckZone = colliders.getZoneAt(-4.0, -15.0);
assert(truckZone.id === ZONE_KEYS.TRUCK, `Truck position correctly identified as truck zone (got: ${truckZone.id})`);
assert(truckZone.isSafeZone === true, 'Truck zone marked as safe haven');
assert(colliders.isInsideSafeZone(new THREE.Vector3(-4.0, 1.0, -15.0)) === true, 'isInsideSafeZone returns true for truck interior');

const zone1 = colliders.getZoneAt(13.0, 7.0);
assert(zone1.id === ZONE_KEYS.ZONE1, `Coordinates (13, 7) identified as zone1 (got: ${zone1.id})`);

const zone2 = colliders.getZoneAt(-16.0, 15.0);
assert(zone2.id === ZONE_KEYS.ZONE2, `Coordinates (-16, 15) identified as zone2 (got: ${zone2.id})`);

const zone3 = colliders.getZoneAt(8.0, 30.0);
assert(zone3.id === ZONE_KEYS.ZONE3, `Coordinates (8, 30) identified as zone3 (got: ${zone3.id})`);

const zone4 = colliders.getZoneAt(-20.0, 35.0);
assert(zone4.id === ZONE_KEYS.ZONE4, `Coordinates (-20, 35) identified as zone4 (got: ${zone4.id})`);

const zone5 = colliders.getZoneAt(25.0, 20.0);
assert(zone5.id === ZONE_KEYS.ZONE5, `Coordinates (25, 20) identified as zone5 (got: ${zone5.id})`);

// TEST 4: Hinged Doors & Hiding Spots
console.log('\n[TEST GROUP 4: Hinged Doors & Hiding Spots]');
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

assert(door.isOpen === false, 'Door initially closed');
door.toggle();
assert(door.isOpen === true, 'Door toggled open');
door.update(0.5);
assert(door.currentAngle > 0, 'Door animated open over time');

const lockerSpot = new HidingSpot({
  id: 'test_locker',
  type: 'locker',
  zone: ZONE_KEYS.ZONE1,
  bounds: new THREE.Box3(new THREE.Vector3(14, 0, 14), new THREE.Vector3(15, 2, 15)),
  door
});
colliders.addHidingSpot(lockerSpot);

const playerPosInside = new THREE.Vector3(14.5, 0.5, 14.5);
assert(lockerSpot.isPlayerInside(playerPosInside) === true, 'Player recognized inside locker');
door.close();
door.update(2.0); // complete close
assert(lockerSpot.breaksGhostLOS(playerPosInside) === true, 'Closed locker breaks ghost Line of Sight');

// TEST 5: TruckEnvironment Verification
console.log('\n[TEST GROUP 5: TruckEnvironment Instantiation & Interfaces]');
const truck = new TruckEnvironment();
assert(truck.group instanceof THREE.Group, 'Truck group instantiated');
assert(truck.group.position.x === -4.0 && truck.group.position.z === -15.0, 'Truck positioned at (-4, 0, -15)');
assert(truck.isPlayerInSafeZone(new THREE.Vector3(-4.0, 1.0, -15.0)) === true, 'Safe haven covers truck interior');

// Test Camera Cycling
const initialCam = truck.currentCameraIndex;
truck.cycleCamera(1);
assert(truck.currentCameraIndex === (initialCam + 1) % truck.cameras.length, 'CRT monitor cycles cameras');

// Test Sanity Update
const sanityInitVer = truck.sanityTex.version;
truck.updateSanity([
  { name: 'Kovács', sanity: 85 },
  { name: 'Nagy', sanity: 40 },
  { name: 'Tóth', sanity: 15 }
]);
assert(truck.sanityTex.version > sanityInitVer, 'Sanity canvas texture marked for update (version incremented)');

// Test Activity Graph
const actInitVer = truck.activityTex.version;
truck.updateActivity(8);
assert(truck.currentActivity === 8, 'Activity level updated to 8');
assert(truck.activityTex.version > actInitVer, 'Activity canvas texture updated (version incremented)');

// Test Whiteboard
const wbInitVer = truck.whiteboardTex.version;
truck.updateWhiteboard({
  ghostName: 'Kolompár Kálmán',
  ghostResponse: 'Csak egyedül lévőnek',
  primaryCompleted: false,
  sideObjectives: [{ desc: 'EMF 5 mérése', bounty: 500, completed: true }]
});
assert(truck.whiteboardTex.version > wbInitVer, 'Whiteboard canvas updated with Hungarian objectives');

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
assert(truck.whiteboardTex.version > wbShapeVer, 'Whiteboard accepts { primary, objectives } contract shape');
truck.updateWhiteboard({ primary: null, objectives: [] });
truck.updateWhiteboard();

// Test Gate Button
let gateOpenedViaButton = false;
truck.onGateOpenCallback = () => { gateOpenedViaButton = true; };
truck.pressGateButton();
assert(truck.isGateUnlocked === true, 'Gate button unlocked status');
assert(gateOpenedViaButton === true, 'Gate open callback fired');

// Test Equipment Shelving Tools
assert(truck.rackItemMeshes.size >= 12, `Equipment rack contains 12+ items (got: ${truck.rackItemMeshes.size})`);
truck.setItemPickedUp('flashlight_1', true);
assert(truck.rackItemMeshes.get('flashlight_1').visible === false, 'Picked up item hidden on rack');

// TEST 6: ScrapYardMap Verification
console.log('\n[TEST GROUP 6: ScrapYardMap Instantiation & Electrical Grid]');
const map = new ScrapYardMap({ mapColliders: colliders });
assert(map.group instanceof THREE.Group, 'ScrapYardMap group created');
assert(map.lightFixtures.size >= 5, `Scrap yard light fixtures registered (got: ${map.lightFixtures.size})`);

// Test Circuit Breaker Toggle & Overload
assert(map.isBreakerOn === true, 'Circuit breaker initially ON');
map.setBreakerState(false, 'TEST');
assert(map.isBreakerOn === false, 'Circuit breaker flipped OFF');

map.setBreakerState(true, 'TEST');
assert(map.isBreakerOn === true, 'Circuit breaker flipped ON');

// Test Gate toggle
assert(map.leftGateDoor !== undefined && map.rightGateDoor !== undefined, 'Entrance gates present');
map.toggleGate(true);
assert(map.leftGateDoor.isOpen === true, 'Entrance gates open');

// Test Car Alarm Trigger
const alarmRes = map.triggerCarAlarm(10);
assert(map.isCarAlarmActive === true, 'Car alarm active');
assert(alarmRes.duration === 10, 'Car alarm duration 10 seconds');

// Test MapColliders integration
assert(colliders.colliders.length > 15, `World colliders registered in manager (got: ${colliders.colliders.length})`);
assert(colliders.doors.size >= 4, `Hinged doors registered in manager (got: ${colliders.doors.size})`);
assert(colliders.hidingSpots.size >= 7, `Hiding spots (lockers + car trunks) registered (got: ${colliders.hidingSpots.size})`);

console.log(`\n===========================================`);
console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log(`===========================================\n`);
