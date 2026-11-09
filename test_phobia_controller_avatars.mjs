/**
 * test_phobia_controller_avatars.mjs
 *
 * Automated verification suite for:
 * - PhobiaController.js
 * - PhobiaAvatars.js
 */

import * as THREE from 'three';
import { PhobiaController, CONTROLLER_CONSTANTS } from './src/components/phobia/engine/PhobiaController.js';
import { PhobiaAvatars, PhobiaAvatarInstance } from './src/components/phobia/engine/PhobiaAvatars.js';
import { MapColliders, BoxCollider, SURFACE_TYPES } from './src/components/phobia/map/MapColliders.js';

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

console.log('--- STARTING PHOBIA CONTROLLER & AVATARS TESTS ---\n');

// ============================================================================
// TEST GROUP 1: PhobiaController Initialization & PointerLock Clamping
// ============================================================================
console.log('[TEST GROUP 1: Controller Initialization & PointerLock Pitch Clamping]');

const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
const scene = new THREE.Scene();
const mapColliders = new MapColliders();

const controller = new PhobiaController({
  camera,
  scene,
  mapColliders,
  initialPosition: [-4.0, 0.0, -15.0],
  initialYaw: 0.0,
  initialPitch: 0.0
});

assert(controller instanceof PhobiaController, 'PhobiaController instantiated successfully');
assert(controller.position.x === -4.0 && controller.position.z === -15.0, 'Initial position set accurately');
assert(controller.currentEyeHeight === 1.65, 'Initial standing eye height is 1.65m');

// Test vertical pitch clamping [-81°, +81°]
const maxRad = CONTROLLER_CONSTANTS.MAX_PITCH_RAD; // ~1.4137 rad
assert(Math.abs(maxRad - (81 * Math.PI / 180)) < 0.001, 'Pitch limit corresponds to exactly 81 degrees');

// Test mouse move down beyond limit
controller._onMouseMove({ movementX: 0, movementY: 5000 });
assert(controller.pitch === -maxRad, `Downward pitch clamped to -81° (got: ${controller.pitch})`);

// Test mouse move up beyond limit
controller._onMouseMove({ movementX: 0, movementY: -10000 });
assert(controller.pitch === maxRad, `Upward pitch clamped to +81° (got: ${controller.pitch})`);

// Reset pitch & yaw
controller.setLookAngles(0.0, 0.0);
assert(controller.pitch === 0.0 && controller.yaw === 0.0, 'Look angles reset cleanly');

// ============================================================================
// TEST GROUP 2: Physics-Based WASD Movement & Speed Benchmarks
// ============================================================================
console.log('\n[TEST GROUP 2: Movement Speeds & Ground Friction]');

// Walk forward (KeyW)
controller.keys.KeyW = true;
// Simulate 1.0 second of movement in small steps
for (let step = 0; step < 60; step++) {
  controller.update(1.0 / 60.0);
}
const walkSpeed = Math.abs(controller.velocity.z);
assert(walkSpeed > 2.6 && walkSpeed <= 2.85, `Walking terminal speed reaches ~2.8 m/s (got: ${walkSpeed.toFixed(2)})`);

// Release KeyW and test friction decay
controller.keys.KeyW = false;
for (let step = 0; step < 60; step++) {
  controller.update(1.0 / 60.0);
}
const stoppedSpeed = Math.abs(controller.velocity.z);
assert(stoppedSpeed < 0.05, `Velocity decelerates to stop under ground friction (got: ${stoppedSpeed.toFixed(4)})`);

// Test Sprint Speed (4.8 m/s) with Shift
controller.keys.KeyW = true;
controller.keys.ShiftLeft = true;
for (let step = 0; step < 60; step++) {
  controller.update(1.0 / 60.0);
}
const sprintSpeed = Math.abs(controller.velocity.z);
assert(sprintSpeed > 4.6 && sprintSpeed <= 4.85, `Sprint terminal speed reaches ~4.8 m/s (got: ${sprintSpeed.toFixed(2)})`);

// Test Crouch Speed (1.4 m/s) with KeyC
controller.keys.ShiftLeft = false;
controller.keys.KeyC = true;
for (let step = 0; step < 60; step++) {
  controller.update(1.0 / 60.0);
}
const crouchSpeed = Math.abs(controller.velocity.z);
assert(crouchSpeed > 1.3 && crouchSpeed <= 1.45, `Crouch terminal speed reaches ~1.4 m/s (got: ${crouchSpeed.toFixed(2)})`);
assert(controller.isCrouching === true, 'Controller state isCrouching is true');
assert(controller.currentColliderHeight === 1.0, 'Collider height drops to 1.0m when crouched');
assert(Math.abs(controller.currentEyeHeight - 0.85) < 0.05, `Eye height smoothly lerps to 0.85m (got: ${controller.currentEyeHeight.toFixed(2)})`);

// Release crouch and return to standing
controller.keys.KeyC = false;
controller.keys.KeyW = false;
for (let step = 0; step < 60; step++) {
  controller.update(1.0 / 60.0);
}
assert(controller.currentColliderHeight === 1.8, 'Collider height returns to 1.8m when standing');
assert(Math.abs(controller.currentEyeHeight - 1.65) < 0.05, `Eye height smoothly lerps to 1.65m (got: ${controller.currentEyeHeight.toFixed(2)})`);

// ============================================================================
// TEST GROUP 3: Stamina Drain, Exhaustion & Regeneration Engine
// ============================================================================
console.log('\n[TEST GROUP 3: Stamina Engine (4.5s drain, 3.0s cooldown, 3.0s regen)]');

// Reset stamina
controller.stamina = 100.0;
controller.staminaCooldown = 0.0;
controller.isExhausted = false;

// Sprint for 2.25s (half of 4.5s drain)
controller.keys.KeyW = true;
controller.keys.ShiftLeft = true;
const dt = 1.0 / 60.0;
for (let i = 0; i < Math.round(2.25 * 60); i++) {
  controller.update(dt);
}
assert(Math.abs(controller.stamina - 50.0) < 2.0, `Stamina drains ~50% in 2.25s of sprint (got: ${controller.stamina.toFixed(1)}%)`);

// Continue sprinting until empty (2.5s more)
for (let i = 0; i < Math.round(2.5 * 60); i++) {
  controller.update(dt);
}
assert(controller.stamina === 0.0, 'Stamina completely drained to 0%');
assert(controller.isExhausted === true, 'Player marked as exhausted when stamina reaches 0%');
assert(controller.isSprinting === false, 'Sprinting disabled upon exhaustion');

// Stop moving, verify cooldown (3s) before regen starts
controller.keys.KeyW = false;
controller.keys.ShiftLeft = false;

// After 1.5s of rest, cooldown is still active, stamina remains 0
for (let i = 0; i < Math.round(1.5 * 60); i++) {
  controller.update(dt);
}
assert(controller.stamina === 0.0, 'Stamina does not regenerate during 3.0s rest cooldown');

// After 2.0s more (3.5s total rest), regen has started
for (let i = 0; i < Math.round(2.0 * 60); i++) {
  controller.update(dt);
}
assert(controller.stamina > 0.0, `Stamina starts regenerating after cooldown (got: ${controller.stamina.toFixed(1)}%)`);

// Advance until fully regenerated
for (let i = 0; i < Math.round(3.0 * 60); i++) {
  controller.update(dt);
}
assert(controller.stamina === 100.0, 'Stamina completely regenerated to 100%');
assert(controller.isExhausted === false, 'Exhaustion cleared after recovery above threshold');

// ============================================================================
// TEST GROUP 4: AABB Wall Collision Resolution & Sliding
// ============================================================================
console.log('\n[TEST GROUP 4: AABB Collision & Sliding Physics]');

// Place a solid wall at x = [0, 1], z = [-20, 20]
const solidWall = new BoxCollider({
  id: 'test_yard_fence',
  tag: 'wall',
  surface: SURFACE_TYPES.CONCRETE,
  min: new THREE.Vector3(0.0, 0.0, -20.0),
  max: new THREE.Vector3(1.0, 3.0, 20.0)
});
mapColliders.addCollider(solidWall);

// Position player at x = -0.6, z = 0, moving right (+x) towards wall
controller.position.set(-0.6, 0.0, 0.0);
controller.velocity.set(5.0, 0.0, 0.0); // Moving towards wall

for (let i = 0; i < 30; i++) {
  controller.update(1.0 / 60.0);
}

// Collider radius is 0.35m, wall min.x is 0.0 -> player x must not exceed 0.0 - 0.35 = -0.35
assert(controller.position.x <= -0.34, `Player blocked from penetrating wall (x: ${controller.position.x.toFixed(3)})`);

// ============================================================================
// TEST GROUP 5: Viewmodel & Walking Sine Wave Bobbing
// ============================================================================
console.log('\n[TEST GROUP 5: Viewmodel & Bobbing Motion]');

assert(controller.viewmodelGroup !== null, 'Viewmodel group exists');
assert(controller.viewmodelGroup.position.x === 0.24, 'Base viewmodel position X is 0.24');
assert(controller.viewmodelGroup.position.y === -0.22, 'Base viewmodel position Y is -0.22');

// Walk to trigger bobbing
controller.keys.KeyW = true;
const initialBobY = controller.viewmodelGroup.position.y;
for (let i = 0; i < 20; i++) {
  controller.update(1.0 / 60.0);
}
const movedBobY = controller.viewmodelGroup.position.y;
assert(movedBobY !== initialBobY, `Viewmodel bobbing sine oscillation active (diff: ${Math.abs(movedBobY - initialBobY).toFixed(4)})`);
controller.keys.KeyW = false;

// ============================================================================
// TEST GROUP 6: 3-Slot Inventory System & Slot Switching
// ============================================================================
console.log('\n[TEST GROUP 6: 3-Slot Inventory System]');

assert(controller.inventory.length === 3, 'Inventory has exactly 3 slots');
assert(controller.getActiveSlot() === 0, 'Active slot defaults to 0');

const item1 = { id: 'jesus_1', type: 'mobile_jesus', name: 'Mobil Jézus' };
const item2 = { id: 'emf_1', type: 'emf_reader', name: 'EMF 5 Mérő' };
const item3 = { id: 'flash_1', type: 'flashlight', name: 'Nagyfényű Zseblámpa' };

const slot1 = controller.addItem(item1);
assert(slot1 === 0, 'First item added to slot 0');
assert(controller.getActiveItem().id === 'jesus_1', 'Active item in slot 0 is Mobil Jézus');

// Select slot 1 with Key 2
controller._onKeyDown({ code: 'Digit2' });
assert(controller.getActiveSlot() === 1, 'Digit2 selected slot 1');

const slot2 = controller.addItem(item2);
assert(slot2 === 1, 'Second item added to slot 1');

// Select slot 2 with Key 3
controller._onKeyDown({ code: 'Digit3' });
assert(controller.getActiveSlot() === 2, 'Digit3 selected slot 2');
controller.addItem(item3);

// Scroll wheel test
controller._onWheel({ deltaY: 100 }); // scroll down -> wrap to slot 0
assert(controller.getActiveSlot() === 0, 'Mouse wheel down cycled back to slot 0');

controller._onWheel({ deltaY: -100 }); // scroll up -> wrap to slot 2
assert(controller.getActiveSlot() === 2, 'Mouse wheel up cycled back to slot 2');

// ============================================================================
// TEST GROUP 7: 2.4m Crosshair Interaction Raycasting with Hungarian Prompts
// ============================================================================
console.log('\n[TEST GROUP 7: 2.4m Interaction Raycasting & Hungarian Prompts]');

// Add a test hinged door into mapColliders
import { HingedDoor } from './src/components/phobia/map/MapColliders.js';
const testDoor = new HingedDoor({
  id: 'door_mazsahaz_test',
  name: 'Mázsaház Ajtó',
  pivot: new THREE.Vector3(0.0, 0.0, 0.0),
  width: 1.1,
  isOpen: false
});
mapColliders.addDoor(testDoor);

// Position camera within 1.5m facing door at (0, 0, 0)
controller.position.set(0.0, 0.0, 1.5);
controller.setLookAngles(0.0, 0.0); // Facing -Z towards (0, 0, 0)
controller.update(0.016);

assert(controller.currentInteractable !== null, 'Interactable target detected within 2.4m range');
assert(controller.currentPrompt === '[E] Kinyitás', `Door closed prompt in Hungarian: '[E] Kinyitás' (got: ${controller.currentPrompt})`);

// Interact with door
const interacted = controller.interact();
assert(interacted === true, 'interact() returned true');
assert(testDoor.isOpen === true, 'Door state toggled to open');

// Update to re-evaluate prompt
controller.update(0.016);
assert(controller.currentPrompt === '[E] Becsukás', `Door open prompt in Hungarian: '[E] Becsukás' (got: ${controller.currentPrompt})`);

// ============================================================================
// TEST GROUP 8: Item Throwing & Physics on G Key
// ============================================================================
console.log('\n[TEST GROUP 8: Item Throwing & Dropping Physics (KeyG)]');

// Switch to slot 0 containing Mobile Jesus
controller.setActiveSlot(0);
assert(controller.getActiveItem() !== null, 'Held item ready for throw');

// Throw item
const thrown = controller.throwCurrentItem();
assert(thrown !== null, 'Item thrown successfully');
assert(controller.getActiveItem() === null, 'Active slot emptied after throwing');
assert(controller.thrownItems.length === 1, 'Item registered in thrownItems array');

// Check initial throw velocity: forward impulse ~5.0 m/s, vertical ~1.8 m/s
assert(Math.abs(thrown.velocity.y - CONTROLLER_CONSTANTS.THROW_UPWARD_IMPULSE) < 0.1, `Initial upward impulse is 1.8 m/s (got: ${thrown.velocity.y})`);

// Step physics for 1.6s to test gravity, bounce restitution and floor settling
for (let i = 0; i < 100; i++) {
  controller.update(1.0 / 60.0);
}
assert(thrown.isGrounded === true, 'Thrown item settled on ground after bounce restitution');
assert(thrown.position.y === thrown.groundY, `Thrown item rests on ground level (got: ${thrown.position.y})`);

// ============================================================================
// TEST GROUP 9: PhobiaAvatars Multiplayer 3D Character Model
// ============================================================================
console.log('\n[TEST GROUP 9: PhobiaAvatars Procedural Model & Reflective Vest]');

const avatars = new PhobiaAvatars({ scene, localPlayerId: 'player_local_me' });
assert(avatars instanceof PhobiaAvatars, 'PhobiaAvatars manager instantiated');

const peer1 = avatars.addAvatar('peer_player_1', {
  userId: 'user_123',
  username: 'Kolompár Béla',
  x: 5.0,
  y: 0.0,
  z: 10.0,
  yaw: 1.57,
  pitch: 0.2,
  flashlightOn: true
});

assert(peer1 instanceof PhobiaAvatarInstance, 'Avatar instance created');
assert(peer1.rootGroup.name === 'Avatar_peer_player_1', 'Avatar group named properly');
assert(peer1.torsoGroup !== null, 'Torso group exists');
assert(peer1.flashlight !== null, 'Flashlight spotlight attached to avatar');
assert(peer1.flashlight.visible === true, 'Flashlight beam visible when toggled on');

// Verify reflective hazard vest components
let hasVest = false;
peer1.torsoGroup.traverse((child) => {
  if (child.isMesh && child.material && child.material.metalness > 0.8) {
    hasVest = true; // Silver reflective stripe found
  }
});
assert(hasVest === true, 'Reflective silver stripes found on hazard vest');

// ============================================================================
// TEST GROUP 10: 12 Hz Tick Packet Synchronization & 15.0 * dt Lerp
// ============================================================================
console.log('\n[TEST GROUP 10: 12 Hz Tick Synchronization & Lerp Interpolation]');

// Update peer target position via 12 Hz tick packet
const tickPacket = [
  {
    id: 'player_local_me', // Should be ignored
    x: 0, y: 0, z: 0
  },
  {
    id: 'peer_player_1',
    x: 8.0,
    y: 0.0,
    z: 14.0,
    yaw: 3.14,
    pitch: -0.4,
    crouched: true,
    sprinting: true,
    alive: true,
    flashlightOn: false
  },
  {
    id: 'peer_player_2', // New peer joining
    username: 'Raffael Géza',
    x: -2.0,
    y: 0.0,
    z: 3.0,
    yaw: 0.0,
    pitch: 0.0,
    alive: true
  }
];

avatars.handleTick(tickPacket);

assert(avatars.hasAvatar('player_local_me') === false, 'Local player not added as remote avatar');
assert(avatars.hasAvatar('peer_player_1') === true, 'Peer 1 updated in avatar manager');
assert(avatars.hasAvatar('peer_player_2') === true, 'Peer 2 automatically created from tick packet');

// Peer 1 target position is (8.0, 0.0, 14.0); before update current position is (5.0, 0.0, 10.0)
const initX = peer1.currentPosition.x;
assert(initX === 5.0, 'Peer 1 initial position at 5.0');
assert(peer1.targetPosition.x === 8.0, 'Peer 1 target position at 8.0');

// Step 0.05s: position should smoothly interpolate towards target
avatars.update(0.05);
assert(peer1.currentPosition.x > 5.0 && peer1.currentPosition.x < 8.0, `Position smoothly lerps with 15.0*dt (current X: ${peer1.currentPosition.x.toFixed(2)})`);

// Advance time until fully interpolated
for (let i = 0; i < 30; i++) {
  avatars.update(0.05);
}
assert(Math.abs(peer1.currentPosition.x - 8.0) < 0.02, `Peer 1 smoothly reached target position X = 8.0 (got: ${peer1.currentPosition.x.toFixed(2)})`);
assert(peer1.flashlight.visible === false, 'Peer 1 flashlight synchronized to off');
assert(peer1.crouched === true, 'Peer 1 crouched state synchronized');

// Disconnect Peer 2 in next tick
const nextTick = [
  { id: 'peer_player_1', x: 8.0, y: 0.0, z: 14.0 }
];
avatars.handleTick(nextTick);
assert(avatars.hasAvatar('peer_player_2') === false, 'Disconnected Peer 2 cleanly removed');

// Cleanup and disposal
avatars.dispose();
assert(avatars.avatars.size === 0, 'Avatars manager disposed cleanly');

controller.dispose();
assert(controller.thrownItems.length === 0, 'Controller disposed cleanly');

console.log(`\n========================================================`);
console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log(`========================================================`);
