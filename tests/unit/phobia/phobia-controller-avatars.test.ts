// @ts-nocheck -- game libs are untyped JS; remove once they are converted to TS.
/**
 * Port of tests/legacy/phobia-controller-avatars.legacy.mjs (83 legacy checks, all preserved).
 * Each legacy check keeps its message as the expect() message. The legacy scripts were one
 * stateful sequence, so each legacy group is one it() and the groups must run in this order.
 *
 * legacy group -> it()  (legacy checks)
 *   GROUP 1 init + pitch clamp  (7)
 *   GROUP 2 movement speeds  (9)
 *   GROUP 3 stamina  (8)
 *   GROUP 4 AABB collision  (1)
 *   GROUP 5 viewmodel bobbing  (4)
 *   GROUP 6 3-slot inventory  (9)
 *   GROUP 7 interaction raycast + Hungarian prompts  (5)
 *   GROUP 8 item throwing  (7)
 *   GROUP 9 avatar model  (7)
 *   GROUP 10 12 Hz tick + lerp  (10)
 *   Hiding spots enter/exit  (14)
 *   Cleanup and disposal  (2)
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhobiaController, CONTROLLER_CONSTANTS } from '../../../src/features/games/phobia/lib/engine/PhobiaController.js';
import { PhobiaAvatars, PhobiaAvatarInstance } from '../../../src/features/games/phobia/lib/engine/PhobiaAvatars.js';
import { MapColliders, BoxCollider, SURFACE_TYPES, HidingSpot } from '../../../src/features/games/phobia/lib/map/MapColliders.js';
import { HingedDoor } from '../../../src/features/games/phobia/lib/map/MapColliders.js';

describe('PhobiaController and PhobiaAvatars', () => {
  let camera: any;
  let scene: any;
  let mapColliders: any;
  let controller: any;
  let dt: any;
  let avatars: any;
  let peer1: any;

  // TEST GROUP 1: PhobiaController Initialization & PointerLock Clamping

  it('Controller Initialization & PointerLock Pitch Clamping', () => {
    camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    scene = new THREE.Scene();
    mapColliders = new MapColliders();

    controller = new PhobiaController({
      camera,
      scene,
      mapColliders,
      initialPosition: [-4.0, 0.0, -15.0],
      initialYaw: 0.0,
      initialPitch: 0.0
    });

    expect(controller, 'PhobiaController instantiated successfully').toBeInstanceOf(PhobiaController);
    expect(controller.position.x === -4.0 && controller.position.z === -15.0, 'Initial position set accurately').toBeTruthy();
    expect(controller.currentEyeHeight, 'Initial standing eye height is 1.65m').toBe(1.65);

    // Test vertical pitch clamping [-81°, +81°]
    const maxRad = CONTROLLER_CONSTANTS.MAX_PITCH_RAD; // ~1.4137 rad
    expect(Math.abs(maxRad - (81 * Math.PI / 180)), 'Pitch limit corresponds to exactly 81 degrees').toBeLessThan(0.001);

    // Test mouse move down beyond limit
    controller._onMouseMove({ movementX: 0, movementY: 5000 });
    expect(controller.pitch, `Downward pitch clamped to -81° (got: ${controller.pitch})`).toBe(-maxRad);

    // Test mouse move up beyond limit
    controller._onMouseMove({ movementX: 0, movementY: -10000 });
    expect(controller.pitch, `Upward pitch clamped to +81° (got: ${controller.pitch})`).toBe(maxRad);

    // Reset pitch & yaw
    controller.setLookAngles(0.0, 0.0);
    expect(controller.pitch === 0.0 && controller.yaw === 0.0, 'Look angles reset cleanly').toBeTruthy();

    // TEST GROUP 2: Physics-Based WASD Movement & Speed Benchmarks
  });

  it('Movement Speeds & Ground Friction', () => {
    // Walk forward (KeyW)
    controller.keys.KeyW = true;
    // Simulate 1.0 second of movement in small steps
    for (let step = 0; step < 60; step++) {
      controller.update(1.0 / 60.0);
    }
    const walkSpeed = Math.abs(controller.velocity.z);
    expect(walkSpeed > 2.6 && walkSpeed <= 2.85, `Walking terminal speed reaches ~2.8 m/s (got: ${walkSpeed.toFixed(2)})`).toBeTruthy();

    // Release KeyW and test friction decay
    controller.keys.KeyW = false;
    for (let step = 0; step < 60; step++) {
      controller.update(1.0 / 60.0);
    }
    const stoppedSpeed = Math.abs(controller.velocity.z);
    expect(stoppedSpeed, `Velocity decelerates to stop under ground friction (got: ${stoppedSpeed.toFixed(4)})`).toBeLessThan(0.05);

    // Test Sprint Speed (4.8 m/s) with Shift
    controller.keys.KeyW = true;
    controller.keys.ShiftLeft = true;
    for (let step = 0; step < 60; step++) {
      controller.update(1.0 / 60.0);
    }
    const sprintSpeed = Math.abs(controller.velocity.z);
    expect(sprintSpeed > 4.6 && sprintSpeed <= 4.85, `Sprint terminal speed reaches ~4.8 m/s (got: ${sprintSpeed.toFixed(2)})`).toBeTruthy();

    // Test Crouch Speed (1.4 m/s) with KeyC
    controller.keys.ShiftLeft = false;
    controller.keys.KeyC = true;
    for (let step = 0; step < 60; step++) {
      controller.update(1.0 / 60.0);
    }
    const crouchSpeed = Math.abs(controller.velocity.z);
    expect(crouchSpeed > 1.3 && crouchSpeed <= 1.45, `Crouch terminal speed reaches ~1.4 m/s (got: ${crouchSpeed.toFixed(2)})`).toBeTruthy();
    expect(controller.isCrouching, 'Controller state isCrouching is true').toBe(true);
    expect(controller.currentColliderHeight, 'Collider height drops to 1.0m when crouched').toBe(1.0);
    expect(Math.abs(controller.currentEyeHeight - 0.85), `Eye height smoothly lerps to 0.85m (got: ${controller.currentEyeHeight.toFixed(2)})`).toBeLessThan(0.05);

    // Release crouch and return to standing
    controller.keys.KeyC = false;
    controller.keys.KeyW = false;
    for (let step = 0; step < 60; step++) {
      controller.update(1.0 / 60.0);
    }
    expect(controller.currentColliderHeight, 'Collider height returns to 1.8m when standing').toBe(1.8);
    expect(Math.abs(controller.currentEyeHeight - 1.65), `Eye height smoothly lerps to 1.65m (got: ${controller.currentEyeHeight.toFixed(2)})`).toBeLessThan(0.05);

    // TEST GROUP 3: Stamina Drain, Exhaustion & Regeneration Engine
  });

  it('Stamina Engine (4.5s drain, 3.0s cooldown, 3.0s regen)', () => {
    // Reset stamina
    controller.stamina = 100.0;
    controller.staminaCooldown = 0.0;
    controller.isExhausted = false;

    // Sprint for 2.25s (half of 4.5s drain)
    controller.keys.KeyW = true;
    controller.keys.ShiftLeft = true;
    dt = 1.0 / 60.0;
    for (let i = 0; i < Math.round(2.25 * 60); i++) {
      controller.update(dt);
    }
    expect(Math.abs(controller.stamina - 50.0), `Stamina drains ~50% in 2.25s of sprint (got: ${controller.stamina.toFixed(1)}%)`).toBeLessThan(2.0);

    // Continue sprinting until empty (2.5s more)
    for (let i = 0; i < Math.round(2.5 * 60); i++) {
      controller.update(dt);
    }
    expect(controller.stamina, 'Stamina completely drained to 0%').toBe(0.0);
    expect(controller.isExhausted, 'Player marked as exhausted when stamina reaches 0%').toBe(true);
    expect(controller.isSprinting, 'Sprinting disabled upon exhaustion').toBe(false);

    // Stop moving, verify cooldown (3s) before regen starts
    controller.keys.KeyW = false;
    controller.keys.ShiftLeft = false;

    // After 1.5s of rest, cooldown is still active, stamina remains 0
    for (let i = 0; i < Math.round(1.5 * 60); i++) {
      controller.update(dt);
    }
    expect(controller.stamina, 'Stamina does not regenerate during 3.0s rest cooldown').toBe(0.0);

    // After 2.0s more (3.5s total rest), regen has started
    for (let i = 0; i < Math.round(2.0 * 60); i++) {
      controller.update(dt);
    }
    expect(controller.stamina, `Stamina starts regenerating after cooldown (got: ${controller.stamina.toFixed(1)}%)`).toBeGreaterThan(0.0);

    // Advance until fully regenerated
    for (let i = 0; i < Math.round(3.0 * 60); i++) {
      controller.update(dt);
    }
    expect(controller.stamina, 'Stamina completely regenerated to 100%').toBe(100.0);
    expect(controller.isExhausted, 'Exhaustion cleared after recovery above threshold').toBe(false);

    // TEST GROUP 4: AABB Wall Collision Resolution & Sliding
  });

  it('AABB Collision & Sliding Physics', () => {
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
    expect(controller.position.x, `Player blocked from penetrating wall (x: ${controller.position.x.toFixed(3)})`).toBeLessThanOrEqual(-0.34);

    // TEST GROUP 5: Viewmodel & Walking Sine Wave Bobbing
  });

  it('Viewmodel & Bobbing Motion', () => {
    expect(controller.viewmodelGroup, 'Viewmodel group exists').not.toBe(null);
    expect(controller.viewmodelGroup.position.x, 'Base viewmodel position X is 0.24').toBe(0.24);
    expect(controller.viewmodelGroup.position.y, 'Base viewmodel position Y is -0.22').toBe(-0.22);

    // Walk to trigger bobbing
    controller.keys.KeyW = true;
    const initialBobY = controller.viewmodelGroup.position.y;
    for (let i = 0; i < 20; i++) {
      controller.update(1.0 / 60.0);
    }
    const movedBobY = controller.viewmodelGroup.position.y;
    expect(movedBobY, `Viewmodel bobbing sine oscillation active (diff: ${Math.abs(movedBobY - initialBobY).toFixed(4)})`).not.toBe(initialBobY);
    controller.keys.KeyW = false;

    // TEST GROUP 6: 3-Slot Inventory System & Slot Switching
  });

  it('3-Slot Inventory System', () => {
    expect(controller.inventory.length, 'Inventory has exactly 3 slots').toBe(3);
    expect(controller.getActiveSlot(), 'Active slot defaults to 0').toBe(0);

    const item1 = { id: 'jesus_1', type: 'mobile_jesus', name: 'Mobil Jézus' };
    const item2 = { id: 'emf_1', type: 'emf_reader', name: 'EMF 5 Mérő' };
    const item3 = { id: 'flash_1', type: 'flashlight', name: 'Nagyfényű Zseblámpa' };

    const slot1 = controller.addItem(item1);
    expect(slot1, 'First item added to slot 0').toBe(0);
    expect(controller.getActiveItem().id, 'Active item in slot 0 is Mobil Jézus').toBe('jesus_1');

    // Select slot 1 with Key 2
    controller._onKeyDown({ code: 'Digit2' });
    expect(controller.getActiveSlot(), 'Digit2 selected slot 1').toBe(1);

    const slot2 = controller.addItem(item2);
    expect(slot2, 'Second item added to slot 1').toBe(1);

    // Select slot 2 with Key 3
    controller._onKeyDown({ code: 'Digit3' });
    expect(controller.getActiveSlot(), 'Digit3 selected slot 2').toBe(2);
    controller.addItem(item3);

    // Scroll wheel test
    controller._onWheel({ deltaY: 100 }); // scroll down -> wrap to slot 0
    expect(controller.getActiveSlot(), 'Mouse wheel down cycled back to slot 0').toBe(0);

    controller._onWheel({ deltaY: -100 }); // scroll up -> wrap to slot 2
    expect(controller.getActiveSlot(), 'Mouse wheel up cycled back to slot 2').toBe(2);

    // TEST GROUP 7: 2.4m Crosshair Interaction Raycasting with Hungarian Prompts
  });

  it('2.4m Interaction Raycasting & Hungarian Prompts', () => {
    // Add a test hinged door into mapColliders
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

    expect(controller.currentInteractable, 'Interactable target detected within 2.4m range').not.toBe(null);
    expect(controller.currentPrompt, `Door closed prompt in Hungarian: '[E] Kinyitás' (got: ${controller.currentPrompt})`).toBe('[E] Kinyitás');

    // Interact with door
    const interacted = controller.interact();
    expect(interacted, 'interact() returned true').toBe(true);
    expect(testDoor.isOpen, 'Door state toggled to open').toBe(true);

    // Update to re-evaluate prompt
    controller.update(0.016);
    expect(controller.currentPrompt, `Door open prompt in Hungarian: '[E] Becsukás' (got: ${controller.currentPrompt})`).toBe('[E] Becsukás');

    // TEST GROUP 8: Item Throwing & Physics on G Key
  });

  it('Item Throwing & Dropping Physics (KeyG)', () => {
    // Switch to slot 0 containing Mobile Jesus
    controller.setActiveSlot(0);
    expect(controller.getActiveItem(), 'Held item ready for throw').not.toBe(null);

    // Throw item
    const thrown = controller.throwCurrentItem();
    expect(thrown, 'Item thrown successfully').not.toBe(null);
    expect(controller.getActiveItem(), 'Active slot emptied after throwing').toBe(null);
    expect(controller.thrownItems.length, 'Item registered in thrownItems array').toBe(1);

    // Check initial throw velocity: forward impulse ~5.0 m/s, vertical ~1.8 m/s
    expect(Math.abs(thrown.velocity.y - CONTROLLER_CONSTANTS.THROW_UPWARD_IMPULSE), `Initial upward impulse is 1.8 m/s (got: ${thrown.velocity.y})`).toBeLessThan(0.1);

    // Step physics for 1.6s to test gravity, bounce restitution and floor settling
    for (let i = 0; i < 100; i++) {
      controller.update(1.0 / 60.0);
    }
    expect(thrown.isGrounded, 'Thrown item settled on ground after bounce restitution').toBe(true);
    expect(thrown.position.y, `Thrown item rests on ground level (got: ${thrown.position.y})`).toBe(thrown.groundY);

    // TEST GROUP 9: PhobiaAvatars Multiplayer 3D Character Model
  });

  it('PhobiaAvatars Procedural Model & Reflective Vest', () => {
    avatars = new PhobiaAvatars({ scene, localPlayerId: 'player_local_me' });
    expect(avatars, 'PhobiaAvatars manager instantiated').toBeInstanceOf(PhobiaAvatars);

    peer1 = avatars.addAvatar('peer_player_1', {
      userId: 'user_123',
      username: 'Kolompár Béla',
      x: 5.0,
      y: 0.0,
      z: 10.0,
      yaw: 1.57,
      pitch: 0.2,
      flashlightOn: true
    });

    expect(peer1, 'Avatar instance created').toBeInstanceOf(PhobiaAvatarInstance);
    expect(peer1.rootGroup.name, 'Avatar group named properly').toBe('Avatar_peer_player_1');
    expect(peer1.torsoGroup, 'Torso group exists').not.toBe(null);
    expect(peer1.flashlight, 'Flashlight spotlight attached to avatar').not.toBe(null);
    expect(peer1.flashlight.visible, 'Flashlight beam visible when toggled on').toBe(true);

    // Verify reflective hazard vest components
    let hasVest = false;
    peer1.torsoGroup.traverse((child) => {
      if (child.isMesh && child.material && child.material.metalness > 0.8) {
        hasVest = true; // Silver reflective stripe found
      }
    });
    expect(hasVest, 'Reflective silver stripes found on hazard vest').toBe(true);

    // TEST GROUP 10: 12 Hz Tick Packet Synchronization & 15.0 * dt Lerp
  });

  it('12 Hz Tick Synchronization & Lerp Interpolation', () => {
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

    expect(avatars.hasAvatar('player_local_me'), 'Local player not added as remote avatar').toBe(false);
    expect(avatars.hasAvatar('peer_player_1'), 'Peer 1 updated in avatar manager').toBe(true);
    expect(avatars.hasAvatar('peer_player_2'), 'Peer 2 automatically created from tick packet').toBe(true);

    // Peer 1 target position is (8.0, 0.0, 14.0); before update current position is (5.0, 0.0, 10.0)
    const initX = peer1.currentPosition.x;
    expect(initX, 'Peer 1 initial position at 5.0').toBe(5.0);
    expect(peer1.targetPosition.x, 'Peer 1 target position at 8.0').toBe(8.0);

    // Step 0.05s: position should smoothly interpolate towards target
    avatars.update(0.05);
    expect(peer1.currentPosition.x > 5.0 && peer1.currentPosition.x < 8.0, `Position smoothly lerps with 15.0*dt (current X: ${peer1.currentPosition.x.toFixed(2)})`).toBeTruthy();

    // Advance time until fully interpolated
    for (let i = 0; i < 30; i++) {
      avatars.update(0.05);
    }
    expect(Math.abs(peer1.currentPosition.x - 8.0), `Peer 1 smoothly reached target position X = 8.0 (got: ${peer1.currentPosition.x.toFixed(2)})`).toBeLessThan(0.02);
    expect(peer1.flashlight.visible, 'Peer 1 flashlight synchronized to off').toBe(false);
    expect(peer1.crouched, 'Peer 1 crouched state synchronized').toBe(true);

    // Disconnect Peer 2 in next tick
    const nextTick = [
      { id: 'peer_player_1', x: 8.0, y: 0.0, z: 14.0 }
    ];
    avatars.handleTick(nextTick);
    expect(avatars.hasAvatar('peer_player_2'), 'Disconnected Peer 2 cleanly removed').toBe(false);

    // Hiding spots: enter / exit flow
  });

  it('Hiding spots', () => {
    {
      const sent = [];
      const hideColliders = new MapColliders();
      const door = new HingedDoor({ id: 'door_t', pivot: new THREE.Vector3(9.65, 0, 5.3), closedAngle: 0, openAngle: 1.4, isOpen: true });
      door.currentAngle = door.openAngle;
      const spot = new HidingSpot({
        id: 'test_locker',
        bounds: new THREE.Box3(new THREE.Vector3(9.65, 0, 4.7), new THREE.Vector3(10.35, 2.1, 5.3)),
        door,
        isOpen: true
      });
      hideColliders.addHidingSpot(spot);
      const hc = new PhobiaController({
        camera: new THREE.PerspectiveCamera(),
        scene: new THREE.Scene(),
        mapColliders: hideColliders,
        socket: { id: 'me', emit: (ev, p) => sent.push([ev, p]) },
        roomId: 'r1',
        initialPosition: [10.0, 0, 6.2]
      });
      const changes = [];
      hc.onHideChange = (c) => changes.push(c.hidden);
      hc.setLookAngles(0, 0); // looking towards -z, at the locker

      hc.update(0.016);
      expect(hc.currentInteractable && hc.currentInteractable.type === 'hiding_spot', 'Looking at a locker offers the hiding prompt').toBeTruthy();
      expect(hideColliders.doors.has('door_t') && hc.currentInteractable.type !== 'door', 'Cabinet door is not a plain door target').toBeTruthy();

      hc.interact();
      expect(hc.isHiding, 'E inside range enters the hiding spot').toBe(true);
      expect(sent.some(([ev, p]) => ev === 'phobia:hide' && p.spotId === 'test_locker' && p.hidden === true), 'phobia:hide hidden=true sent').toBeTruthy();
      expect(spot.isOccupied && door.isOpen === false, 'Spot occupied and door closed while hidden').toBeTruthy();
      expect(Math.abs(hc.position.x - 10.0) < 0.01 && Math.abs(hc.position.z - 5.0) < 0.01, 'Player placed inside the cabinet').toBeTruthy();

      hc.keys.KeyW = true;
      const pz = hc.position.z;
      for (let i = 0; i < 20; i++) hc.update(0.05);
      expect(Math.abs(hc.position.z - pz), 'Movement is locked while hidden').toBeLessThan(1e-6);
      hc._onMouseMove({ movementX: -100000, movementY: 0 });
      expect(Math.abs(hc.yaw - hc.hiding.outYaw), 'Look range limited to the slit').toBeLessThanOrEqual(CONTROLLER_CONSTANTS.HIDE_YAW_LIMIT + 1e-6);
      for (let i = 0; i < 60; i++) { hideColliders.update(0.05); }
      expect(hideColliders.isPlayerStealthHidden(hc.position).isHidden, 'Closed door + inside volume breaks line of sight').toBe(true);
      expect(sent.filter(([ev]) => ev === 'phobia:player-move').some(([, p]) => p.hidden === true && p.hidingSpotId === 'test_locker'), 'Move packets carry the hidden state').toBeTruthy();

      hc.keys.KeyW = false;
      hc.hideCooldown = 0;
      hc.interact();
      expect(hc.isHiding, 'E again leaves the hiding spot').toBe(false);
      expect(Math.abs(hc.position.z - 6.2) < 1e-6 && Math.abs(hc.position.x - 10.0) < 1e-6, 'Exit restores the previous position').toBeTruthy();
      expect(sent.some(([ev, p]) => ev === 'phobia:hide' && p.hidden === false), 'phobia:hide hidden=false sent').toBeTruthy();
      expect(!spot.isOccupied && changes.join() === 'true,false', 'Spot freed and callbacks fired').toBeTruthy();
      hc.dispose();
    }
  });

  it('Cleanup and disposal', () => {
    avatars.dispose();
    expect(avatars.avatars.size, 'Avatars manager disposed cleanly').toBe(0);

    controller.dispose();
    expect(controller.thrownItems.length, 'Controller disposed cleanly').toBe(0);
  });
});
