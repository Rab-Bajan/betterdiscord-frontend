/**
 * PhobiaController.js
 *
 * First-Person 3D Player Controller for MiskolcPhobia ("A MÉH Telep").
 *
 * Implements:
 * - PointerLock mouse capture with clamped vertical pitch [-81°, +81°].
 * - Physics-based WASD movement with velocity accumulation and ground friction:
 *   * Walking speed: 2.8 m/s
 *   * Sprint speed: 4.8 m/s with 4.5s stamina drain, 3.0s rest regeneration after 3s cooldown.
 *   * Crouch speed: 1.4 m/s smoothly lerping eye height between standing (1.65m) and crouching (0.85m).
 * - Dual AABB and raycast collision detection against walls, fences, and props from MapColliders.js.
 * - Viewmodel holder with walking bobbing motion (sine wave translation).
 * - 3-slot inventory system (1, 2, 3 keys and mouse scroll wheel) managing active item slot.
 * - 2.4m center crosshair raycasting interaction detection with Hungarian prompts:
 *   * Door closed: [E] Kinyitás
 *   * Door open: [E] Becsukás
 *   * Item on ground/shelf: [E] Felvétel: {Tárgynév}
 *   * Light switch: [E] Villanykapcsoló
 *   * Breaker knife switch: [E] Főkapcsoló fel / le
 *   * Locker / Trunk: [E] Bújás / Nyitás
 * - Item throwing/dropping on G key: launches held item with 5 m/s forward impulse + gravity.
 * - 12 Hz multiplayer position sync via Socket.IO.
 */

import * as THREE from 'three';
import { SURFACE_TYPES } from '../map/MapColliders.js';

// Physical Movement Constants
export const CONTROLLER_CONSTANTS = {
  WALK_SPEED: 2.8,       // m/s
  SPRINT_SPEED: 4.8,     // m/s
  CROUCH_SPEED: 1.4,     // m/s
  ACCELERATION: 25.0,    // m/s^2
  FRICTION: 12.0,        // ground friction damping
  EYE_HEIGHT_STAND: 1.65, // meters
  EYE_HEIGHT_CROUCH: 0.85, // meters
  COLLIDER_HEIGHT_STAND: 1.8,
  COLLIDER_HEIGHT_CROUCH: 1.0,
  COLLIDER_RADIUS: 0.35,
  MAX_PITCH_DEG: 81.0,   // clamped pitch limit [-81°, +81°]
  MAX_PITCH_RAD: (81.0 * Math.PI) / 180.0, // ~1.4137 rad
  INTERACTION_RANGE: 2.4, // meters
  THROW_FORWARD_IMPULSE: 5.0, // m/s
  THROW_UPWARD_IMPULSE: 1.8,  // m/s
  GRAVITY: -9.81,        // m/s^2
  RESTITUTION: 0.35,     // item bounce elasticity
  STAMINA_DRAIN_SEC: 4.5, // 100% drained in 4.5s
  STAMINA_REGEN_SEC: 3.0, // 100% regenerated in 3.0s
  STAMINA_COOLDOWN_SEC: 3.0, // cooldown before stamina begins recovering
  STAMINA_EXHAUSTION_THRESHOLD: 25.0 // % stamina required to resume sprinting after exhaustion
};

export class PhobiaController {
  constructor(options = {}) {
    this.camera = options.camera || new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    this.domElement = options.domElement || null;
    this.scene = options.scene || null;
    this.mapColliders = options.mapColliders || null;
    this.socket = options.socket || null;
    this.roomId = options.roomId || 'default_phobia_room';
    this.groundMeshes = options.groundMeshes || [];
    this.interactiveProps = options.interactiveProps || [];

    // Controller active state
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.isLocked = false;
    this.sensitivity = options.sensitivity || 0.0022;

    // Orientation (Euler order YXZ)
    this.yaw = options.initialYaw || 0.0;
    this.pitch = options.initialPitch || 0.0;
    this._clampPitch();

    // Player Physical Position & Velocity
    // position is at ground level (feet)
    const initPos = options.initialPosition || [-4.0, 0.0, -15.0];
    this.position = new THREE.Vector3(initPos[0], initPos[1], initPos[2]);
    this.velocity = new THREE.Vector3(0, 0, 0);

    // Movement States
    this.isSprinting = false;
    this.isCrouching = false;
    this.isExhausted = false;
    this.isMoving = false;

    // Stamina Engine (Point 23)
    this.stamina = 100.0; // 0.0 to 100.0%
    this.staminaCooldown = 0.0; // seconds remaining before regen begins

    // Eye Height & Collision Lerp (Point 24)
    this.currentEyeHeight = CONTROLLER_CONSTANTS.EYE_HEIGHT_STAND;
    this.targetEyeHeight = CONTROLLER_CONSTANTS.EYE_HEIGHT_STAND;
    this.currentColliderHeight = CONTROLLER_CONSTANTS.COLLIDER_HEIGHT_STAND;

    // Footstep Sound Tracking (Point 40)
    this.currentSurface = SURFACE_TYPES.GRAVEL;
    this.footstepTimer = 0.0;
    this.footstepInterval = 0.52; // seconds

    // Viewmodel Holder & Bobbing (Point 26)
    this.viewmodelGroup = options.viewmodelGroup || new THREE.Group();
    this.viewmodelGroup.name = 'PhobiaViewmodelHolder';
    if (!this.viewmodelGroup.parent && this.camera) {
      this.camera.add(this.viewmodelGroup);
    }
    this.viewmodelBasePos = new THREE.Vector3(0.24, -0.22, -0.45);
    this.viewmodelGroup.position.copy(this.viewmodelBasePos);
    this.bobTimer = 0.0;

    // 3-Slot Inventory System (Point 27)
    this.inventory = [null, null, null];
    this.activeSlot = 0; // 0, 1, 2

    // Crosshair Raycaster Interaction (Point 28)
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CONTROLLER_CONSTANTS.INTERACTION_RANGE;
    this.currentInteractable = null;
    this.currentPrompt = null;

    // Thrown Items Physics List (Point 29)
    this.thrownItems = [];

    // Networking Sync Loop (12 Hz)
    this.syncTimer = 0.0;
    this.syncInterval = 1.0 / 12.0; // ~0.0833s

    // Input Keys Tracking
    this.keys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      ArrowUp: false,
      ArrowLeft: false,
      ArrowDown: false,
      ArrowRight: false,
      ShiftLeft: false,
      ShiftRight: false,
      KeyC: false,
      ControlLeft: false,
      KeyE: false,
      KeyG: false,
      KeyF: false,
      Digit1: false,
      Digit2: false,
      Digit3: false
    };

    // Event Callbacks
    this.onInteractionPrompt = options.onInteractionPrompt || null; // (promptText, target)
    this.onInteract = options.onInteract || null; // (target)
    this.onItemThrown = options.onItemThrown || null; // ({ item, position, velocity })
    this.onInventoryChange = options.onInventoryChange || null; // (inventory, activeSlot)
    this.onStaminaChange = options.onStaminaChange || null; // (stamina, isExhausted)
    this.onFootstep = options.onFootstep || null; // (surfaceType)
    this.onFlashlightToggle = options.onFlashlightToggle || null;

    // Initial item loadout if passed
    if (Array.isArray(options.initialItems)) {
      for (let i = 0; i < Math.min(options.initialItems.length, 3); i++) {
        this.inventory[i] = options.initialItems[i];
      }
    }

    // Bind event listeners if running in a browser environment
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._boundPointerLockChange = this._onPointerLockChange.bind(this);
    this._boundDomClick = this._onDomClick.bind(this);

    this._setupEventListeners();
    this._updateCameraTransform();
    this._updateViewmodelItem();
  }

  /* -------------------------------------------------------------------------- */
  /*                          EVENT LISTENERS SETUP                             */
  /* -------------------------------------------------------------------------- */

  _setupEventListeners() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return; // Headless / Node testing environment
    }

    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
    document.addEventListener('mousemove', this._boundMouseMove);
    window.addEventListener('wheel', this._boundWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._boundPointerLockChange);

    if (this.domElement && typeof this.domElement.addEventListener === 'function') {
      this.domElement.addEventListener('click', this._boundDomClick);
    }
  }

  unlock() {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.isLocked = false;
  }

  lock() {
    if (this.domElement && typeof this.domElement.requestPointerLock === 'function') {
      this.domElement.requestPointerLock();
    }
  }

  dispose() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.removeEventListener('keydown', this._boundKeyDown);
      window.removeEventListener('keyup', this._boundKeyUp);
      document.removeEventListener('mousemove', this._boundMouseMove);
      window.removeEventListener('wheel', this._boundWheel);
      document.removeEventListener('pointerlockchange', this._boundPointerLockChange);

      if (this.domElement && typeof this.domElement.removeEventListener === 'function') {
        this.domElement.removeEventListener('click', this._boundDomClick);
      }
    }

    // Clean up thrown items
    for (const thrown of this.thrownItems) {
      if (thrown.mesh && thrown.mesh.parent) {
        thrown.mesh.parent.remove(thrown.mesh);
      }
    }
    this.thrownItems = [];

    // Clear viewmodel children
    while (this.viewmodelGroup.children.length > 0) {
      const child = this.viewmodelGroup.children[0];
      this.viewmodelGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          POINTER LOCK CONTROLS                             */
  /* -------------------------------------------------------------------------- */

  _onDomClick() {
    if (!this.enabled) return;
    this.requestPointerLock();
  }

  requestPointerLock() {
    if (typeof document === 'undefined') return;
    const target = this.domElement || document.body;
    if (target && target.requestPointerLock) {
      target.requestPointerLock();
    }
  }

  exitPointerLock() {
    if (typeof document === 'undefined') return;
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  _onPointerLockChange() {
    if (typeof document === 'undefined') return;
    const lockElement = document.pointerLockElement;
    this.isLocked = Boolean(lockElement && (lockElement === this.domElement || lockElement === document.body));
  }

  _onMouseMove(event) {
    if (!this.enabled) return;
    // Process mouse movement if pointer is locked or in tests
    if (!this.isLocked && typeof document !== 'undefined' && document.pointerLockElement !== this.domElement) {
      return;
    }

    const movementX = event.movementX || event.mozMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || 0;

    this.yaw -= movementX * this.sensitivity;
    this.pitch -= movementY * this.sensitivity;

    this._clampPitch();
    this._updateCameraTransform();
  }

  _clampPitch() {
    const limit = CONTROLLER_CONSTANTS.MAX_PITCH_RAD;
    if (this.pitch > limit) this.pitch = limit;
    if (this.pitch < -limit) this.pitch = -limit;
  }

  setLookAngles(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this._clampPitch();
    this._updateCameraTransform();
  }

  getLookAngles() {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  _updateCameraTransform() {
    if (!this.camera) return;

    // Apply rotation order YXZ: Yaw (Y) then Pitch (X)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Camera sits at feet position + eye height
    this.camera.position.set(
      this.position.x,
      this.position.y + this.currentEyeHeight,
      this.position.z
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                            KEYBOARD & WHEEL                                */
  /* -------------------------------------------------------------------------- */

  _onKeyDown(event) {
    if (!this.enabled) return;
    const code = event.code;

    if (code in this.keys) {
      this.keys[code] = true;
    }

    // Slot switching with 1, 2, 3
    if (code === 'Digit1') {
      this.setActiveSlot(0);
    } else if (code === 'Digit2') {
      this.setActiveSlot(1);
    } else if (code === 'Digit3') {
      this.setActiveSlot(2);
    }

    // Interaction trigger on E
    if (code === 'KeyE') {
      this.interact();
    }

    // Item dropping / throwing on G
    if (code === 'KeyG') {
      this.throwCurrentItem();
    }

    // Flashlight toggle on F
    if (code === 'KeyF') {
      this.toggleFlashlight();
    }
  }

  _onKeyUp(event) {
    const code = event.code;
    if (code in this.keys) {
      this.keys[code] = false;
    }
  }

  _onWheel(event) {
    if (!this.enabled) return;
    if (event.deltaY > 0) {
      // Scroll down -> next slot
      this.setActiveSlot((this.activeSlot + 1) % 3);
    } else if (event.deltaY < 0) {
      // Scroll up -> previous slot
      this.setActiveSlot((this.activeSlot + 2) % 3);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                       INVENTORY SYSTEM (3 SLOTS)                           */
  /* -------------------------------------------------------------------------- */

  setActiveSlot(slotIndex) {
    const nextSlot = Math.max(0, Math.min(2, Math.floor(slotIndex)));
    if (this.activeSlot !== nextSlot) {
      this.activeSlot = nextSlot;
      this._updateViewmodelItem();
      if (this.onInventoryChange) {
        this.onInventoryChange(this.getInventory(), this.activeSlot);
      }
    }
  }

  getActiveSlot() {
    return this.activeSlot;
  }

  getActiveItem() {
    return this.inventory[this.activeSlot] || null;
  }

  getInventory() {
    return [...this.inventory];
  }

  addItem(item, slot = null) {
    if (!item) return -1;

    let targetSlot = slot;
    if (targetSlot === null || targetSlot < 0 || targetSlot > 2) {
      // Prefer active slot if empty
      if (!this.inventory[this.activeSlot]) {
        targetSlot = this.activeSlot;
      } else {
        // Find first empty slot
        const emptyIdx = this.inventory.findIndex(s => s === null);
        targetSlot = emptyIdx !== -1 ? emptyIdx : this.activeSlot; // Replace active if full
      }
    }

    this.inventory[targetSlot] = item;
    this._updateViewmodelItem();

    if (this.onInventoryChange) {
      this.onInventoryChange(this.getInventory(), this.activeSlot);
    }

    // Notify backend if socket available
    if (this.socket && this.socket.emit) {
      this.socket.emit('phobia:pickup-item', {
        roomId: this.roomId,
        itemId: item.id || item.type,
        slot: targetSlot
      });
    }

    return targetSlot;
  }

  removeItem(slot = null) {
    const targetSlot = slot !== null ? slot : this.activeSlot;
    if (targetSlot < 0 || targetSlot > 2) return null;

    const removed = this.inventory[targetSlot];
    this.inventory[targetSlot] = null;
    this._updateViewmodelItem();

    if (this.onInventoryChange) {
      this.onInventoryChange(this.getInventory(), this.activeSlot);
    }

    return removed;
  }

  /* -------------------------------------------------------------------------- */
  /*                       ITEM THROWING & DROPPING (G)                         */
  /* -------------------------------------------------------------------------- */

  throwCurrentItem() {
    const item = this.removeItem(this.activeSlot);
    if (!item) return null;

    // Camera world position and forward look vector
    const camPos = new THREE.Vector3();
    const camForward = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camForward);

    // Initial velocity: 5.0 m/s forward + 1.8 m/s vertical
    const throwVel = camForward.clone().multiplyScalar(CONTROLLER_CONSTANTS.THROW_FORWARD_IMPULSE);
    throwVel.y += CONTROLLER_CONSTANTS.THROW_UPWARD_IMPULSE;

    // Create thrown entity representation
    const thrownEntity = {
      id: item.id || `item_${Math.random().toString(36).substr(2, 9)}`,
      item,
      position: camPos.clone().addScaledVector(camForward, 0.4),
      velocity: throwVel.clone(),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        (Math.random() - 0.5) * 8.0,
        (Math.random() - 0.5) * 8.0
      ),
      isGrounded: false,
      groundY: 0.1,
      mesh: this._createThrownMesh(item)
    };

    if (this.scene && thrownEntity.mesh) {
      thrownEntity.mesh.position.copy(thrownEntity.position);
      this.scene.add(thrownEntity.mesh);
    }

    this.thrownItems.push(thrownEntity);

    // Notify backend
    if (this.socket && this.socket.emit) {
      this.socket.emit('phobia:drop-item', {
        roomId: this.roomId,
        slot: this.activeSlot,
        x: thrownEntity.position.x,
        y: thrownEntity.position.y,
        z: thrownEntity.position.z,
        impulse: [throwVel.x, throwVel.y, throwVel.z]
      });
    }

    if (this.onItemThrown) {
      this.onItemThrown({
        item,
        position: thrownEntity.position.clone(),
        velocity: throwVel.clone()
      });
    }

    return thrownEntity;
  }

  _createThrownMesh(item) {
    // Lightweight procedural item mesh
    const group = new THREE.Group();
    group.name = `Thrown_${item.type || 'prop'}`;

    let geom;
    let mat;

    const itemType = item.type || '';
    if (itemType === 'mobile_jesus') {
      // Golden crucifix
      geom = new THREE.BoxGeometry(0.12, 0.24, 0.04);
      mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.85, roughness: 0.2 });
    } else if (itemType === 'emf_reader') {
      // Dark handheld sensor with LED strip
      geom = new THREE.BoxGeometry(0.08, 0.18, 0.05);
      mat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.4 });
    } else if (itemType === 'flashlight') {
      // Heavy metal flashlight cylinder
      geom = new THREE.CylinderGeometry(0.035, 0.04, 0.22, 12);
      mat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
    } else {
      geom = new THREE.BoxGeometry(0.14, 0.14, 0.14);
      mat = new THREE.MeshStandardMaterial({ color: 0x7655f5, roughness: 0.5 });
    }

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    group.add(mesh);
    return group;
  }

  _updateThrownPhysics(delta) {
    for (let i = this.thrownItems.length - 1; i >= 0; i--) {
      const entity = this.thrownItems[i];
      if (entity.isGrounded) continue;

      // Apply gravity
      entity.velocity.y += CONTROLLER_CONSTANTS.GRAVITY * delta;

      // Step position
      entity.position.addScaledVector(entity.velocity, delta);

      // Floor impact resolution
      if (entity.position.y <= entity.groundY) {
        entity.position.y = entity.groundY;

        if (Math.abs(entity.velocity.y) > 0.5) {
          // Bounce with restitution
          entity.velocity.y = -entity.velocity.y * CONTROLLER_CONSTANTS.RESTITUTION;
          // Friction on XZ
          entity.velocity.x *= 0.65;
          entity.velocity.z *= 0.65;
          entity.spin.multiplyScalar(0.7);
        } else {
          // Settled on ground
          entity.velocity.set(0, 0, 0);
          entity.spin.set(0, 0, 0);
          entity.isGrounded = true;
        }
      }

      // Update 3D mesh transform if present
      if (entity.mesh) {
        entity.mesh.position.copy(entity.position);
        entity.mesh.rotation.x += entity.spin.x * delta;
        entity.mesh.rotation.y += entity.spin.y * delta;
        entity.mesh.rotation.z += entity.spin.z * delta;
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                         VIEWMODEL & BOBBING (Point 26)                     */
  /* -------------------------------------------------------------------------- */

  _updateViewmodelItem() {
    if (!this.viewmodelGroup) return;

    // Clear previous viewmodel mesh
    while (this.viewmodelGroup.children.length > 0) {
      const child = this.viewmodelGroup.children[0];
      this.viewmodelGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }

    const activeItem = this.getActiveItem();
    if (!activeItem) return; // Hands empty

    // Construct lightweight 3D viewmodel item representation
    const itemType = activeItem.type || '';
    const itemGroup = new THREE.Group();

    if (itemType === 'mobile_jesus') {
      // Golden crucifix
      const crossVert = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.22, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.15 })
      );
      const crossHoriz = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.035, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.15 })
      );
      crossHoriz.position.y = 0.04;
      itemGroup.add(crossVert);
      itemGroup.add(crossHoriz);
      itemGroup.rotation.set(-0.2, 0.3, 0);
    } else if (itemType === 'emf_reader') {
      // EMF reader with 5 LEDs
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.18, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.3 })
      );
      itemGroup.add(body);
      itemGroup.rotation.set(-0.15, 0.25, -0.05);
    } else if (itemType === 'flashlight') {
      // Flashlight barrel
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.035, 0.22, 16),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 })
      );
      body.rotation.x = Math.PI / 2;
      itemGroup.add(body);
    } else {
      // Generic equipment prop
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.15, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x7655f5, roughness: 0.4 })
      );
      itemGroup.add(box);
    }

    this.viewmodelGroup.add(itemGroup);
  }

  _updateViewmodelBobbing(delta) {
    if (!this.viewmodelGroup) return;

    const speedXZ = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const moving = speedXZ > 0.15 ? 1.0 : 0.0;

    const bobFreq = this.isSprinting ? 14.0 : 9.0;
    this.bobTimer += delta * bobFreq * moving;

    // Point 26 Sine wave bobbing translation
    const bobX = Math.cos(this.bobTimer) * 0.012 * moving;
    const bobY = Math.sin(this.bobTimer * 2.0) * 0.015 * moving;

    this.viewmodelGroup.position.set(
      this.viewmodelBasePos.x + bobX,
      this.viewmodelBasePos.y + bobY,
      this.viewmodelBasePos.z
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                   2.4m RAYCAST INTERACTION & PROMPTS                       */
  /* -------------------------------------------------------------------------- */

  _updateInteractionRaycast() {
    if (!this.camera) return;

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);

    this.raycaster.set(camPos, camDir);
    this.raycaster.far = CONTROLLER_CONSTANTS.INTERACTION_RANGE;

    let closestTarget = null;
    let closestDist = CONTROLLER_CONSTANTS.INTERACTION_RANGE;
    let promptText = null;

    // 1. Check Hinged Doors in MapColliders
    if (this.mapColliders && this.mapColliders.doors) {
      for (const door of this.mapColliders.doors.values()) {
        let isHit = false;
        let testDist = Infinity;

        // Test raycast against door box collider
        if (door.collider) {
          const rayHit = door.collider.raycast(this.raycaster.ray);
          if (rayHit && rayHit.distance <= CONTROLLER_CONSTANTS.INTERACTION_RANGE) {
            isHit = true;
            testDist = rayHit.distance;
          }
        }

        // Test proximity to door center (pivot + half height)
        const doorCenter = new THREE.Vector3(
          door.pivot.x,
          door.pivot.y + (door.height || 2.2) / 2,
          door.pivot.z
        );
        const centerDist = camPos.distanceTo(doorCenter);
        if (centerDist <= CONTROLLER_CONSTANTS.INTERACTION_RANGE && centerDist < testDist) {
          isHit = true;
          testDist = centerDist;
        }

        if (isHit && testDist < closestDist) {
          closestDist = testDist;
          closestTarget = { type: 'door', door };
          promptText = door.isOpen ? '[E] Becsukás' : '[E] Kinyitás';
        }
      }
    }

    // 2. Check Hiding Spots (Lockers / Car trunks)
    if (this.mapColliders && this.mapColliders.hidingSpots) {
      for (const spot of this.mapColliders.hidingSpots.values()) {
        const spotCenter = spot.bounds.getCenter(new THREE.Vector3());
        const spotDist = camPos.distanceTo(spotCenter);
        if (spotDist <= CONTROLLER_CONSTANTS.INTERACTION_RANGE && spotDist < closestDist) {
          closestDist = spotDist;
          closestTarget = { type: 'hiding_spot', spot };
          promptText = '[E] Bújás / Nyitás';
        }
      }
    }

    // 3. Check Interactive Props / Shelves / Breakers / Switches
    const candidateMeshes = [];
    if (this.interactiveProps && this.interactiveProps.length > 0) {
      candidateMeshes.push(...this.interactiveProps);
    }
    if (this.scene) {
      const propGroup = this.scene.getObjectByName('InteractivePropsGroup');
      if (propGroup) candidateMeshes.push(...propGroup.children);
    }

    if (candidateMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(candidateMeshes, true);
      if (hits.length > 0 && hits[0].distance < closestDist) {
        const hit = hits[0];
        let obj = hit.object;
        while (obj && !obj.userData?.interactable && obj.parent) {
          obj = obj.parent;
        }

        const uData = obj?.userData || hit.object?.userData || {};
        if (uData.interactable || uData.type) {
          closestDist = hit.distance;
          closestTarget = { type: uData.type || 'prop', object: obj || hit.object, userData: uData };

          if (uData.type === 'breaker') {
            promptText = '[E] Főkapcsoló fel / le';
          } else if (uData.type === 'light_switch' || uData.type === 'switch') {
            promptText = '[E] Villanykapcsoló';
          } else if (uData.type === 'item' || uData.item) {
            const itemName = uData.item?.name || uData.name || 'Tárgy';
            promptText = `[E] Felvétel: ${itemName}`;
          } else if (uData.type === 'gate_button') {
            promptText = '[E] Kapunyitó gomb';
          } else {
            promptText = uData.prompt || '[E] Használat';
          }
        }
      }
    }

    this.currentInteractable = closestTarget;
    if (this.currentPrompt !== promptText) {
      this.currentPrompt = promptText;
      if (this.onInteractionPrompt) {
        this.onInteractionPrompt(promptText, closestTarget);
      }
    }
  }

  interact() {
    if (!this.currentInteractable) return false;

    const target = this.currentInteractable;

    // 1. Door toggle
    if (target.type === 'door' && target.door) {
      const door = target.door;
      door.toggle();
      if (this.socket && this.socket.emit) {
        this.socket.emit('phobia:door-toggle', {
          roomId: this.roomId,
          doorId: door.id
        });
      }
      if (this.onInteract) this.onInteract(target);
      return true;
    }

    // 2. Hiding spot
    if (target.type === 'hiding_spot' && target.spot) {
      target.spot.toggle();
      if (this.onInteract) this.onInteract(target);
      return true;
    }

    // 3. Breaker knife switch
    if (target.type === 'breaker' || target.userData?.type === 'breaker') {
      if (this.socket && this.socket.emit) {
        this.socket.emit('phobia:breaker-toggle', { roomId: this.roomId });
      }
      if (this.onInteract) this.onInteract(target);
      return true;
    }

    // 4. Light switch
    if (target.type === 'light_switch' || target.userData?.type === 'light_switch') {
      const lightId = target.userData?.lightId || 'light_mazsahaz_office';
      if (this.socket && this.socket.emit) {
        this.socket.emit('phobia:light-toggle', { roomId: this.roomId, lightId });
      }
      if (this.onInteract) this.onInteract(target);
      return true;
    }

    // 5. Pickup item
    if (target.type === 'item' || target.userData?.item) {
      const item = target.userData.item || { id: target.userData.id, type: target.userData.type, name: target.userData.name };
      this.addItem(item);
      if (target.object && target.object.parent) {
        target.object.parent.remove(target.object);
      }
      if (this.onInteract) this.onInteract(target);
      return true;
    }

    if (this.onInteract) {
      this.onInteract(target);
      return true;
    }

    return false;
  }

  toggleFlashlight() {
    if (this.onFlashlightToggle) {
      this.onFlashlightToggle();
    }
    if (this.socket && this.socket.emit) {
      this.socket.emit('phobia:flashlight-toggle', { roomId: this.roomId });
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                         PHYSICS & MOVEMENT STEP                            */
  /* -------------------------------------------------------------------------- */

  update(delta) {
    if (!delta || delta <= 0) return;
    // Cap maximum delta to prevent tunneling through colliders during frame drops
    const dt = Math.min(delta, 0.1);

    // 1. Process Crouch Toggle/Hold
    const crouchKey = this.keys.KeyC || this.keys.ControlLeft;
    this.isCrouching = Boolean(crouchKey);
    this.targetEyeHeight = this.isCrouching
      ? CONTROLLER_CONSTANTS.EYE_HEIGHT_CROUCH
      : CONTROLLER_CONSTANTS.EYE_HEIGHT_STAND;
    this.currentColliderHeight = this.isCrouching
      ? CONTROLLER_CONSTANTS.COLLIDER_HEIGHT_CROUCH
      : CONTROLLER_CONSTANTS.COLLIDER_HEIGHT_STAND;

    // Smoothly lerp eye height
    this.currentEyeHeight = THREE.MathUtils.lerp(
      this.currentEyeHeight,
      this.targetEyeHeight,
      Math.min(1.0, 10.0 * dt)
    );

    // 2. Build normalized input vector from WASD
    const inputVec = new THREE.Vector3(0, 0, 0);
    if (this.keys.KeyW || this.keys.ArrowUp) inputVec.z -= 1.0;
    if (this.keys.KeyS || this.keys.ArrowDown) inputVec.z += 1.0;
    if (this.keys.KeyA || this.keys.ArrowLeft) inputVec.x -= 1.0;
    if (this.keys.KeyD || this.keys.ArrowRight) inputVec.x += 1.0;

    const isInputActive = inputVec.lengthSq() > 0.0001;
    if (isInputActive) {
      inputVec.normalize();
      // Rotate input vector by horizontal yaw
      inputVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    }

    // 3. Process Stamina & Sprinting (Point 23)
    const wantsSprint = (this.keys.ShiftLeft || this.keys.ShiftRight) && !this.isCrouching && isInputActive;

    if (this.isExhausted) {
      // Must recover to threshold before sprinting again
      if (this.stamina >= CONTROLLER_CONSTANTS.STAMINA_EXHAUSTION_THRESHOLD) {
        this.isExhausted = false;
      }
    }

    this.isSprinting = wantsSprint && !this.isExhausted && this.stamina > 0.0;

    if (this.isSprinting) {
      // Deplete stamina: 100% in 4.5s -> 22.22% / sec
      const drain = (100.0 / CONTROLLER_CONSTANTS.STAMINA_DRAIN_SEC) * dt;
      this.stamina = Math.max(0.0, this.stamina - drain);
      this.staminaCooldown = CONTROLLER_CONSTANTS.STAMINA_COOLDOWN_SEC;

      if (this.stamina <= 0.0) {
        this.isExhausted = true;
        this.isSprinting = false;
      }
    } else {
      // Stamina regeneration after 3s cooldown
      if (this.staminaCooldown > 0) {
        this.staminaCooldown = Math.max(0.0, this.staminaCooldown - dt);
      } else if (this.stamina < 100.0) {
        // Regenerate stamina: 100% in 3.0s -> 33.33% / sec
        const regen = (100.0 / CONTROLLER_CONSTANTS.STAMINA_REGEN_SEC) * dt;
        this.stamina = Math.min(100.0, this.stamina + regen);
      }
    }

    if (this.onStaminaChange) {
      this.onStaminaChange(this.stamina, this.isExhausted);
    }

    // 4. Target Speed & Acceleration
    const targetSpeed = this.isSprinting
      ? CONTROLLER_CONSTANTS.SPRINT_SPEED
      : (this.isCrouching ? CONTROLLER_CONSTANTS.CROUCH_SPEED : CONTROLLER_CONSTANTS.WALK_SPEED);

    const friction = CONTROLLER_CONSTANTS.FRICTION;

    if (isInputActive) {
      // Physics-based velocity accumulation towards target speed
      const targetVelX = inputVec.x * targetSpeed;
      const targetVelZ = inputVec.z * targetSpeed;
      const accelFactor = Math.min(1.0, (CONTROLLER_CONSTANTS.ACCELERATION / Math.max(0.1, targetSpeed)) * dt);
      this.velocity.x += (targetVelX - this.velocity.x) * accelFactor;
      this.velocity.z += (targetVelZ - this.velocity.z) * accelFactor;
    } else {
      // Apply ground friction deceleration
      this.velocity.x -= this.velocity.x * friction * dt;
      this.velocity.z -= this.velocity.z * friction * dt;
      if (Math.abs(this.velocity.x) < 0.001) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.001) this.velocity.z = 0;
    }

    // 5. Collision Detection & Sliding Physics (Point 25)
    if (this.mapColliders) {
      const colRes = this.mapColliders.resolvePlayerMovement(
        this.position,
        this.velocity,
        dt,
        CONTROLLER_CONSTANTS.COLLIDER_RADIUS,
        this.currentColliderHeight
      );
      this.position.copy(colRes.position);
    } else {
      // Direct integration if no map colliders
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
    }

    // 6. Vertical Ground Snapping (Point 25)
    let groundY = 0.0;
    if (this.groundMeshes.length > 0) {
      const downRay = new THREE.Raycaster(
        new THREE.Vector3(this.position.x, this.position.y + 1.2, this.position.z),
        new THREE.Vector3(0, -1, 0),
        0.0,
        5.0
      );
      const hits = downRay.intersectObjects(this.groundMeshes, true);
      if (hits.length > 0) {
        groundY = hits[0].point.y;
      }
    }
    this.position.y = groundY;

    // 7. Update Surface Query for Footsteps
    if (this.mapColliders) {
      this.currentSurface = this.mapColliders.getSurfaceTypeAt(this.position.x, this.position.z, this.position.y);
    }

    // 8. Footstep Audio Rhythm (Point 40)
    const horizSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    this.isMoving = horizSpeed > 0.2;

    if (this.isMoving) {
      const stepInterval = this.isSprinting ? 0.33 : (this.isCrouching ? 0.72 : 0.52);
      this.footstepTimer += dt;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0.0;
        if (this.onFootstep) {
          this.onFootstep(this.currentSurface);
        }
      }
    } else {
      this.footstepTimer = 0.0;
    }

    // 9. Update Camera Transform & Viewmodel
    this._updateCameraTransform();
    this._updateViewmodelBobbing(dt);
    this._updateThrownPhysics(dt);
    this._updateInteractionRaycast();

    // 10. 12 Hz Multiplayer Network Sync Emit
    if (this.socket && this.socket.emit) {
      this.syncTimer += dt;
      if (this.syncTimer >= this.syncInterval) {
        this.syncTimer = 0.0;
        const isSafe = this.mapColliders ? this.mapColliders.isInsideSafeZone(this.position) : false;
        const currentZone = this.mapColliders ? this.mapColliders.getZoneAt(this.position.x, this.position.z).id : 'yard';

        this.socket.emit('phobia:player-move', {
          roomId: this.roomId,
          position: [this.position.x, this.position.y, this.position.z],
          rotation: [this.pitch, this.yaw],
          crouched: this.isCrouching,
          sprinting: this.isSprinting,
          isInsideTruck: isSafe,
          currentZone
        });
      }
    }
  }
}
