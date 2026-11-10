/**
 * ItemSystem.js
 *
 * MiskolcPhobia 3D - Inventory & Investigation/Survival Item Management System.
 *
 * Manages:
 * - 3-Slot Inventory Management (slots 0, 1, 2) via '1', '2', '3' keys and mouse scroll wheel.
 * - First-Person Viewmodel System:
 *   * Holds active item in front of camera with organic walking/sprinting bobbing and mouse look sway.
 *   * Smooth raise/lower animations on item swap.
 *   * Procedural action animations (camera viewfinder lift, drinking tilt, lighter spark, trigger pull).
 * - Primary Action (Left Click):
 *   * Flashlight / UV: Toggle light beam on/off with realistic click SFX.
 *   * Photo Camera: 150ms screen flash, raycasts/detects bounties, calculates stars and Ft payout.
 *   * Laser Thermometer: Red pinpoint laser dot, temperature reading, LCD display update.
 *   * Smudge Sticks: Clicks lighter, emits 6s smoke particles, blinds hunting ghost within 6m.
 *   * Sanity Flask (Pálinka): Drinking animation, restores +35% sanity, empty flask state.
 *   * EMF Reader & Spirit Box: Toggle power/scan, audio tick/voice synthesis.
 * - Secondary Action (Right Click) - Placement Preview & Ground Placement:
 *   * Raycasts to floor (up to 3.5m) to project holographic green placement preview.
 *   * Places Video Camera (on Tripod), D.O.T.S. Projector, Ghost Writing Book, Salt Piles, or Mobile Jesus.
 * - Drop Action ('G' Key):
 *   * Tosses held item forward into world, spawns dropped 3D mesh with colliders and pickup prompts.
 * - Pickup Interaction ('E' Key):
 *   * Center-screen raycasting detects dropped or shelf items and equips into inventory.
 * - Integrated Web Audio API Synthesizer:
 *   * Authentic programmatic sound effects for all tools (clicks, static, shutter, fire, gulp, crunch).
 */

import * as THREE from 'three';
import {
  TOOL_TYPES,
  TOOL_DEFINITIONS,
  PHOTO_BOUNTIES,
  normalizeToolType,
  createToolViewmodel,
  createToolWorldMesh,
  createSaltPileModel
} from './ToolDefinitions.js';

/** Emoji icons for the HUD inventory dock, keyed by canonical tool type. */
export const TOOL_ICONS = {
  [TOOL_TYPES.EMF_READER]: '📟',
  [TOOL_TYPES.SPIRIT_BOX]: '📻',
  [TOOL_TYPES.UV_LIGHT]: '🟣',
  [TOOL_TYPES.THERMOMETER]: '🌡️',
  [TOOL_TYPES.VIDEO_CAMERA]: '🎥',
  [TOOL_TYPES.GHOST_WRITING_BOOK]: '📓',
  [TOOL_TYPES.DOTS_PROJECTOR]: '🟢',
  [TOOL_TYPES.PHOTO_CAMERA]: '📷',
  [TOOL_TYPES.MOBILE_JESUS]: '✝️',
  [TOOL_TYPES.SMUDGE_STICKS]: '🌿',
  [TOOL_TYPES.SANITY_PALINKA]: '🍶',
  [TOOL_TYPES.FLASHLIGHT_T1]: '🔦',
  [TOOL_TYPES.FLASHLIGHT_T2]: '🔦',
  [TOOL_TYPES.SALT_SHAKER]: '🧂',
  [TOOL_TYPES.SALT_PILE]: '🧂'
};

/** Builds an inventory item with HUD-friendly name/icon from a raw pickup type. */
export function makeInventoryItem(rawType, extra = {}) {
  const type = normalizeToolType(rawType);
  const def = TOOL_DEFINITIONS[type];
  return {
    id: extra.id || type,
    type,
    name: extra.name || def?.nameHu || type,
    icon: TOOL_ICONS[type] || '📦',
    charges: extra.charges ?? (def?.maxCharges > 0 ? def.maxCharges : undefined)
  };
}

export class ItemSystem {
  constructor(options = {}) {
    const {
      engine,
      scene,
      camera,
      viewmodelGroup,
      interactivePropsGroup,
      socket,
      onInventoryChange,
      onPhotoSnapped,
      onSanityRestored,
      onPromptChange
    } = options;

    this.engine = engine;
    this.scene = scene || (engine ? engine.scene : null);
    this.camera = camera || (engine ? engine.camera : null);
    this.viewmodelGroup = viewmodelGroup || (engine ? engine.viewmodelGroup : null);
    this.interactivePropsGroup = interactivePropsGroup || (engine ? engine.interactivePropsGroup : null);
    this.socket = socket || null;
    this.roomId = options.roomId || 'miskolc_e2e_test';

    // Extra roots (e.g. the truck's equipment rack) whose meshes may be picked up with [E]
    this.pickupTargets = options.pickupTargets || [];
    // Host gate: when it returns false (journal open, mouse not captured) input is ignored
    this.isEnabled = options.isEnabled || null;

    // Callbacks for UI updates
    this.onInventoryChange = onInventoryChange || null;
    this.onPhotoSnapped = onPhotoSnapped || null;
    this.onSanityRestored = onSanityRestored || null;
    this.onPromptChange = onPromptChange || null;

    // 3-Slot Inventory: [slot0, slot1, slot2]
    this.inventory = [null, null, null];
    this.activeSlot = 0;

    // Viewmodel container child of viewmodelGroup
    this.viewmodelHolder = new THREE.Group();
    this.viewmodelHolder.name = 'ItemSystem_ViewmodelHolder';
    if (this.viewmodelGroup) {
      this.viewmodelGroup.add(this.viewmodelHolder);
    }

    // Viewmodel state & transforms
    this.currentViewmodelMesh = null;
    this.viewmodelBasePos = new THREE.Vector3(0.26, -0.22, -0.42);
    this.viewmodelBaseRot = new THREE.Euler(0.1, -0.15, 0.05);
    this.viewmodelTargetPos = new THREE.Vector3().copy(this.viewmodelBasePos);
    this.viewmodelTargetRot = new THREE.Euler().copy(this.viewmodelBaseRot);

    // Procedural animation clocks
    this.bobClock = 0.0;
    this.swayVelocity = new THREE.Vector2(0, 0);
    this.actionAnimTimer = 0.0;
    this.actionAnimType = null; // 'drink' | 'photo' | 'smudge' | 'swap'

    // Placement preview state
    this.isPlacementMode = false;
    this.placementPreviewMesh = null;
    this.placementValid = false;
    this.placementPoint = new THREE.Vector3();
    this.placementNormal = new THREE.Vector3();

    // Raycasting for interactions and photo capture
    this.raycaster = new THREE.Raycaster();
    this.hoveredItem = null;
    this.emfSpikeLevel = 1;
    this.emfSpikeTimer = 0;

    // Placed world items registry
    this.placedItems = new Map();
    this.serverItemIds = new Set(); // ids of world items mirrored from the server snapshot

    // Audio Synthesizer
    this.initAudioSynthesizer();

    // Key & Mouse Listeners setup
    this.bindInputEvents();
  }

  /* -------------------------------------------------------------------------- */
  /*                             WEB AUDIO SYNTHESIZER                          */
  /* -------------------------------------------------------------------------- */

  initAudioSynthesizer() {
    this.audioCtx = null;
    if (typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass();
        } catch (e) {
          // AudioContext might be blocked until user gesture
        }
      }
    }
  }

  ensureAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass();
        } catch (e) {}
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  playClickSound(frequency = 1200, duration = 0.04) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  playEmfClick(level = 1) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const freq = 600 + level * 350;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.025);
    } catch (e) {}
  }

  playCameraShutter() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      // 1. Shutter clack
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);

      // 2. Film rewind motor buzz
      const motorOsc = ctx.createOscillator();
      const motorGain = ctx.createGain();
      motorOsc.type = 'sawtooth';
      motorOsc.frequency.setValueAtTime(120, ctx.currentTime + 0.1);
      motorOsc.frequency.linearRampToValueAtTime(240, ctx.currentTime + 0.45);

      motorGain.gain.setValueAtTime(0.12, ctx.currentTime + 0.1);
      motorGain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.45);

      motorOsc.connect(motorGain);
      motorGain.connect(ctx.destination);
      motorOsc.start(ctx.currentTime + 0.1);
      motorOsc.stop(ctx.currentTime + 0.45);
    } catch (e) {}
  }

  playDrinkGulp() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      // Three rhythmic drinking gulps
      for (let i = 0; i < 3; i++) {
        const time = ctx.currentTime + i * 0.28;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, time);
        osc.frequency.exponentialRampToValueAtTime(140, time + 0.18);

        gain.gain.setValueAtTime(0.28, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.18);
      }
    } catch (e) {}
  }

  playJesusBurnSound() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      // Violent flame hiss and sizzling holy crackle
      const bufferSize = ctx.sampleRate * 1.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.8));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.45, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 1.5);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch (e) {}
  }

  playSaltCrunch() {
    this.playClickSound(340, 0.08);
  }

  /* -------------------------------------------------------------------------- */
  /*                             INPUT BINDINGS                                 */
  /* -------------------------------------------------------------------------- */

  bindInputEvents() {
    if (typeof window === 'undefined') return;

    const blocked = () => (this.isEnabled ? !this.isEnabled() : false);

    this._onKeyDown = (e) => {
      if (blocked()) return;
      // Slot selection via 1, 2, 3 keys
      if (e.code === 'Digit1') this.selectSlot(0);
      if (e.code === 'Digit2') this.selectSlot(1);
      if (e.code === 'Digit3') this.selectSlot(2);

      // Drop item ('G' key)
      if (e.code === 'KeyG') {
        this.dropCurrentItem();
      }

      // Pickup item ('E' key)
      if (e.code === 'KeyE') {
        this.pickupHoveredItem();
      }
    };

    this._onWheel = (e) => {
      if (blocked()) return;
      if (e.deltaY > 0) {
        this.selectSlot((this.activeSlot + 1) % 3);
      } else if (e.deltaY < 0) {
        this.selectSlot((this.activeSlot + 2) % 3);
      }
    };

    this._onMouseDown = (e) => {
      if (blocked()) return;
      if (e.button === 0) {
        // Left-Click: Primary Action or Confirm Placement
        if (this.isPlacementMode) {
          this.confirmPlacement();
        } else {
          this.triggerPrimaryAction();
        }
      } else if (e.button === 2) {
        // Right-Click: Toggle Placement Preview
        e.preventDefault();
        this.togglePlacementMode();
      }
    };

    this._onMouseMove = (e) => {
      // Mouse sway lag
      this.swayVelocity.x = Math.max(-0.06, Math.min(0.06, e.movementX * 0.0008));
      this.swayVelocity.y = Math.max(-0.06, Math.min(0.06, e.movementY * 0.0008));
    };

    this._onContextMenu = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('wheel', this._onWheel);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  /* -------------------------------------------------------------------------- */
  /*                             INVENTORY MANAGEMENT                           */
  /* -------------------------------------------------------------------------- */

  getInventory() {
    return this.inventory;
  }

  getActiveItem() {
    return this.inventory[this.activeSlot];
  }

  setInventory(items = []) {
    this.inventory = [items[0] || null, items[1] || null, items[2] || null];
    this.equipActiveViewmodel();
    if (this.onInventoryChange) this.onInventoryChange(this.inventory, this.activeSlot);
  }

  selectSlot(slotIndex) {
    const nextSlot = Math.max(0, Math.min(2, Number(slotIndex) || 0));
    if (this.activeSlot === nextSlot && this.currentViewmodelMesh) return;

    this.activeSlot = nextSlot;
    // Cancel placement preview if switching item
    this.cancelPlacementMode();
    // Swap viewmodel
    this.equipActiveViewmodel();
    this.playClickSound(950, 0.03);

    if (this.onInventoryChange) {
      this.onInventoryChange(this.inventory, this.activeSlot);
    }
  }

  addItemToInventory(item, targetSlot = null) {
    if (!item) return -1;
    let slot = targetSlot;
    if (slot === null || slot === undefined) {
      if (!this.inventory[this.activeSlot]) {
        slot = this.activeSlot;
      } else {
        slot = this.inventory.findIndex((s) => s === null);
      }
    }
    if (slot === -1) slot = this.activeSlot; // Replace current if full

    // If slot occupied, drop previous item
    const existing = this.inventory[slot];
    if (existing) {
      this.dropItemAtPosition(existing);
    }

    this.inventory[slot] = item;
    if (slot === this.activeSlot) {
      this.equipActiveViewmodel();
    }

    if (this.socket) {
      this.socket.emit('phobia:item-pickup', {
        roomId: this.roomId,
        itemId: item.id || item.type,
        slot
      });
    }

    if (this.onInventoryChange) {
      this.onInventoryChange(this.inventory, this.activeSlot);
    }

    return slot;
  }

  /* -------------------------------------------------------------------------- */
  /*                             VIEWMODEL CONTROLLER                           */
  /* -------------------------------------------------------------------------- */

  equipActiveViewmodel() {
    // 1. Dispose old viewmodel
    if (this.currentViewmodelMesh) {
      this.viewmodelHolder.remove(this.currentViewmodelMesh);
      this.currentViewmodelMesh = null;
    }

    const currentItem = this.inventory[this.activeSlot];
    if (!currentItem) return;

    const normType = normalizeToolType(currentItem.type);
    const def = TOOL_DEFINITIONS[normType] || TOOL_DEFINITIONS[TOOL_TYPES.FLASHLIGHT_T1];

    // 2. Generate procedural 3D model
    const vm = createToolViewmodel(normType, {
      charges: currentItem.charges,
      hasWriting: currentItem.hasWriting
    });

    if (def.viewmodelOffset) {
      const { position, rotation, scale } = def.viewmodelOffset;
      this.viewmodelBasePos.set(position[0], position[1], position[2]);
      this.viewmodelBaseRot.set(rotation[0], rotation[1], rotation[2]);
      if (scale) vm.scale.set(scale[0], scale[1], scale[2]);
    }

    vm.position.copy(this.viewmodelBasePos);
    vm.position.y -= 0.15; // Start lowered for smooth raise animation
    vm.rotation.copy(this.viewmodelBaseRot);

    this.viewmodelHolder.add(vm);
    this.currentViewmodelMesh = vm;

    // Trigger raise animation
    this.actionAnimTimer = 0.22;
    this.actionAnimType = 'raise';
  }

  /* -------------------------------------------------------------------------- */
  /*                             PRIMARY ACTIONS                                */
  /* -------------------------------------------------------------------------- */

  triggerPrimaryAction() {
    const item = this.getActiveItem();
    if (!item) return;

    const normType = normalizeToolType(item.type);
    const vm = this.currentViewmodelMesh;

    switch (normType) {
      case TOOL_TYPES.FLASHLIGHT_T1:
      case TOOL_TYPES.FLASHLIGHT_T2: {
        if (vm?.userData?.toggle) {
          const state = vm.userData.toggle();
          this.playClickSound(state ? 1400 : 700, 0.05);
        }
        break;
      }

      case TOOL_TYPES.UV_LIGHT: {
        if (vm?.userData?.toggle) {
          const state = vm.userData.toggle();
          this.playClickSound(state ? 1600 : 800, 0.05);
        }
        break;
      }

      case TOOL_TYPES.THERMOMETER: {
        this.playClickSound(2200, 0.06);
        this.actionAnimTimer = 0.15;
        this.actionAnimType = 'recoil';

        // Raycast to target surface and request reading
        const worldPos = new THREE.Vector3();
        if (this.camera) this.camera.getWorldPosition(worldPos);

        if (this.socket) {
          this.socket.emit('phobia:get-temperature', {
            roomId: this.roomId,
            position: [worldPos.x, worldPos.y, worldPos.z]
          });
        }
        break;
      }

      case TOOL_TYPES.PHOTO_CAMERA: {
        if (vm?.userData?.snapPhoto) {
          const evaluatedTarget = this.evaluatePhotoTarget();
          const rawPhoto = vm.userData.snapPhoto(evaluatedTarget);
          const photo = rawPhoto ? this.normalizePhoto(rawPhoto) : null;
          if (photo) {
            this.playCameraShutter();
            this.actionAnimTimer = 0.25;
            this.actionAnimType = 'photo';

            if (this.onPhotoSnapped) this.onPhotoSnapped(photo);
            if (this.socket) {
              const { dataUrl, ...photoMeta } = photo; // keep the (large) image local
              this.socket.emit('phobia:photo-captured', {
                roomId: this.roomId,
                photo: photoMeta
              });
            }
          }
        }
        break;
      }

      case TOOL_TYPES.SMUDGE_STICKS: {
        if (vm?.userData?.light) {
          const lit = vm.userData.light();
          if (lit) {
            this.playClickSound(1800, 0.08); // lighter flint
            this.actionAnimTimer = 0.35;
            this.actionAnimType = 'smudge';

            if (this.socket) {
              this.socket.emit('phobia:use-smudge', {
                roomId: this.roomId,
                slot: this.activeSlot
              });
            }
          }
        }
        break;
      }

      case TOOL_TYPES.SANITY_PALINKA: {
        if (vm?.userData?.drink) {
          const drank = vm.userData.drink();
          if (drank) {
            this.playDrinkGulp();
            this.actionAnimTimer = 0.7;
            this.actionAnimType = 'drink';

            // Empty item in inventory
            item.empty = true;

            if (this.onSanityRestored) this.onSanityRestored(35.0);
            if (this.socket) {
              this.socket.emit('phobia:use-sanity-palinka', {
                roomId: this.roomId,
                slot: this.activeSlot
              });
            }
          }
        }
        break;
      }

      case TOOL_TYPES.EMF_READER: {
        if (vm?.userData?.togglePower) {
          const on = vm.userData.togglePower();
          this.playClickSound(on ? 1200 : 600, 0.04);
        }
        break;
      }

      case TOOL_TYPES.SPIRIT_BOX: {
        if (vm?.userData?.toggleScan) {
          const scanning = vm.userData.toggleScan();
          this.playClickSound(scanning ? 1100 : 550, 0.04);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Converts a camera album record into the shape the Journal expects
   * ({ id, subject, stars, reward, dataUrl }) and attaches a small snapshot of the current frame.
   */
  normalizePhoto(raw) {
    return {
      id: raw.id,
      timestamp: raw.timestamp,
      subject: raw.labelHu || raw.subject || 'Bizonyíték',
      stars: raw.stars || 1,
      reward: raw.rewardFt ?? raw.reward ?? 0,
      kind: this.photoKindOf(raw),
      dataUrl: this.captureSnapshot()
    };
  }

  /** Explicit photo kind for the server: 'ghost' | 'fingerprint' | 'orb' | 'other' (server still verifies). */
  photoKindOf(raw) {
    const t = raw?.target;
    if (t === PHOTO_BOUNTIES.GHOST_1_STAR || t === PHOTO_BOUNTIES.GHOST_2_STAR || t === PHOTO_BOUNTIES.GHOST_3_STAR) return 'ghost';
    if (t === PHOTO_BOUNTIES.FINGERPRINT) return 'fingerprint';
    if (t?.kind === 'orb') return 'orb';
    return 'other';
  }

  /** Renders one frame and returns a downscaled JPEG data URL (null if unavailable). */
  captureSnapshot() {
    try {
      const engine = this.engine;
      const src = engine?.renderer?.domElement;
      if (!src || !engine.scene || !engine.camera) return null;
      // The drawing buffer is only readable right after a render in the same task
      if (engine.composer) engine.composer.render(0);
      else engine.renderer.render(engine.scene, engine.camera);
      const out = document.createElement('canvas');
      out.width = 256;
      out.height = Math.max(1, Math.round((256 * src.height) / Math.max(1, src.width)));
      const ctx = out.getContext('2d');
      ctx.drawImage(src, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      return null;
    }
  }

  /** Server / local thermometer reading -> held laser thermometer LCD */
  applyTemperatureReading(temp) {
    const ud = this.currentViewmodelMesh?.userData;
    if (ud?.type === TOOL_TYPES.THERMOMETER && typeof ud.setReading === 'function') {
      ud.setReading(temp);
    }
  }

  /** Server EMF spike (level 1-5 near x,z) -> held EMF reader, decays after a few seconds */
  applyEmfReading({ level = 1, x = null, z = null } = {}) {
    if (!this.camera) return;
    if (x !== null && z !== null) {
      const cp = new THREE.Vector3();
      this.camera.getWorldPosition(cp);
      if (Math.hypot(cp.x - x, cp.z - z) > 5.0) return; // out of range of the disturbance
    }
    this.emfSpikeLevel = Math.max(1, Math.min(5, level));
    this.emfSpikeTimer = 6.0;
  }

  evaluatePhotoTarget() {
    // Center raycast checking distance to ghost or props
    if (!this.camera) return PHOTO_BOUNTIES.INTERACTED_PROP;

    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    this.raycaster.set(origin, forward);

    // If ghost is in scene, test distance
    let ghostMesh = null;
    if (this.engine?.ghostGroup) {
      ghostMesh = this.engine.ghostGroup;
    }

    if (ghostMesh) {
      const gPos = new THREE.Vector3();
      ghostMesh.getWorldPosition(gPos);
      const dist = origin.distanceTo(gPos);
      const toGhost = gPos.clone().sub(origin).normalize();
      const dot = forward.dot(toGhost);

      if (dot > 0.75) {
        if (dist <= 4.0) return PHOTO_BOUNTIES.GHOST_3_STAR;
        if (dist <= 8.0) return PHOTO_BOUNTIES.GHOST_2_STAR;
        return PHOTO_BOUNTIES.GHOST_1_STAR;
      }
    }

    return PHOTO_BOUNTIES.INTERACTED_PROP;
  }

  /* -------------------------------------------------------------------------- */
  /*                             SECONDARY ACTIONS (PLACEMENT)                  */
  /* -------------------------------------------------------------------------- */

  togglePlacementMode() {
    const item = this.getActiveItem();
    if (!item) return;

    const normType = normalizeToolType(item.type);
    const def = TOOL_DEFINITIONS[normType];
    if (!def?.isPlaceable) return;

    if (this.isPlacementMode) {
      this.cancelPlacementMode();
    } else {
      this.startPlacementMode(normType);
    }
  }

  startPlacementMode(normType) {
    this.isPlacementMode = true;
    this.cancelPlacementPreview();

    // Create holographic green placement preview
    const preview = createToolWorldMesh(normType);
    preview.name = 'ItemSystem_PlacementPreview';

    // Apply translucent green material to all meshes
    preview.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: 0x33ff66,
          wireframe: true,
          transparent: true,
          opacity: 0.75
        });
      }
    });

    if (this.scene) this.scene.add(preview);
    this.placementPreviewMesh = preview;
  }

  cancelPlacementPreview() {
    if (this.placementPreviewMesh) {
      if (this.scene) this.scene.remove(this.placementPreviewMesh);
      this.placementPreviewMesh = null;
    }
  }

  cancelPlacementMode() {
    this.isPlacementMode = false;
    this.cancelPlacementPreview();
  }

  confirmPlacement() {
    if (!this.isPlacementMode || !this.placementValid || !this.placementPreviewMesh) {
      this.cancelPlacementMode();
      return;
    }

    const item = this.getActiveItem();
    if (!item) return;

    const normType = normalizeToolType(item.type);

    if (normType === TOOL_TYPES.SALT_SHAKER) {
      // Place salt pile on floor, consume 1 charge
      const vm = this.currentViewmodelMesh;
      if (vm?.userData?.placeSalt) {
        const ok = vm.userData.placeSalt();
        if (ok) {
          this.spawnPlacedWorldItem(TOOL_TYPES.SALT_PILE, this.placementPoint);
          this.playSaltCrunch();
        }
      }
    } else {
      // Place item onto ground
      this.spawnPlacedWorldItem(normType, this.placementPoint, this.placementPreviewMesh.quaternion);
      // Remove placed item from inventory
      this.inventory[this.activeSlot] = null;
      this.equipActiveViewmodel();
      this.playClickSound(800, 0.05);

      if (this.socket) {
        this.socket.emit('phobia:item-drop', {
          roomId: this.roomId,
          slot: this.activeSlot,
          x: this.placementPoint.x,
          y: this.placementPoint.y,
          z: this.placementPoint.z
        });
      }

      if (this.onInventoryChange) {
        this.onInventoryChange(this.inventory, this.activeSlot);
      }
    }

    this.cancelPlacementMode();
  }

  spawnPlacedWorldItem(toolType, position, rotation = null) {
    const worldMesh = createToolWorldMesh(toolType);
    worldMesh.position.copy(position);
    if (rotation) worldMesh.quaternion.copy(rotation);

    worldMesh.userData = {
      isPickup: true,
      itemId: `${toolType}_${Date.now()}`,
      type: toolType,
      nameHu: TOOL_DEFINITIONS[toolType]?.nameHu || toolType,
      promptHu: `[E] Felvétel: ${TOOL_DEFINITIONS[toolType]?.nameHu || toolType}`
    };

    if (this.interactivePropsGroup) {
      this.interactivePropsGroup.add(worldMesh);
    } else if (this.scene) {
      this.scene.add(worldMesh);
    }

    this.placedItems.set(worldMesh.userData.itemId, worldMesh);
    return worldMesh;
  }

  /**
   * Replaces the mirrored server-side dropped items (late join / reconnect / new match).
   * Items are { id, type, name, x, y, z, charges? }; locally placed items are left alone.
   */
  syncServerItems(items) {
    for (const id of this.serverItemIds) {
      const mesh = this.placedItems.get(id);
      if (mesh?.parent) mesh.parent.remove(mesh);
      this.placedItems.delete(id);
    }
    this.serverItemIds.clear();
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!it || !it.id || this.placedItems.has(it.id)) continue;
      if (![it.x, it.y, it.z].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
      const mesh = this.spawnPlacedWorldItem(normalizeToolType(it.type), new THREE.Vector3(it.x, it.y, it.z));
      // spawnPlacedWorldItem registers under a generated id; re-key to the server id
      this.placedItems.delete(mesh.userData.itemId);
      mesh.userData.itemId = it.id;
      if (it.name) {
        mesh.userData.nameHu = it.name;
        mesh.userData.promptHu = `[E] Felvétel: ${it.name}`;
      }
      if (it.charges !== undefined) mesh.userData.charges = it.charges;
      this.placedItems.set(it.id, mesh);
      this.serverItemIds.add(it.id);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             DROP ACTION ('G' KEY)                          */
  /* -------------------------------------------------------------------------- */

  dropCurrentItem() {
    const item = this.getActiveItem();
    if (!item) return;

    this.dropItemAtPosition(item);
    this.inventory[this.activeSlot] = null;
    this.equipActiveViewmodel();
    this.playClickSound(500, 0.08);

    if (this.socket) {
      this.socket.emit('phobia:item-drop', {
        roomId: this.roomId,
        slot: this.activeSlot
      });
    }

    if (this.onInventoryChange) {
      this.onInventoryChange(this.inventory, this.activeSlot);
    }
  }

  dropItemAtPosition(item) {
    if (!item) return;
    const dropPos = new THREE.Vector3();
    if (this.camera) {
      const fwd = new THREE.Vector3();
      this.camera.getWorldPosition(dropPos);
      this.camera.getWorldDirection(fwd);
      dropPos.add(fwd.multiplyScalar(0.75));
      dropPos.y = Math.max(0.08, dropPos.y - 0.7); // Ground level
    }

    const normType = normalizeToolType(item.type);
    this.spawnPlacedWorldItem(normType, dropPos);
  }

  /* -------------------------------------------------------------------------- */
  /*                             PICKUP ACTION ('E' KEY)                        */
  /* -------------------------------------------------------------------------- */

  pickupHoveredItem() {
    if (!this.hoveredItem) return;

    const itemData = this.hoveredItem.userData;
    const itemToEquip = makeInventoryItem(itemData.type, {
      id: itemData.itemId || itemData.type,
      name: itemData.nameHu,
      charges: itemData.charges
    });

    // Remove world mesh from scene
    if (typeof this.onItemPickedUp === 'function') this.onItemPickedUp(itemData.itemId, this.hoveredItem);
    if (this.hoveredItem.parent) {
      this.hoveredItem.parent.remove(this.hoveredItem);
    }
    this.placedItems.delete(itemData.itemId);
    this.serverItemIds.delete(itemData.itemId);

    this.addItemToInventory(itemToEquip);
    this.hoveredItem = null;
    this.playClickSound(1200, 0.04);

    if (this.onPromptChange) this.onPromptChange(null);
  }

  /* -------------------------------------------------------------------------- */
  /*                             PER-FRAME UPDATE LOOP                          */
  /* -------------------------------------------------------------------------- */

  update(delta, playerSpeed = 0.0) {
    // 1. Update active held viewmodel custom logic (timers, particles, screens)
    if (this.currentViewmodelMesh?.userData?.update) {
      let ghostPos = null;
      if (this.engine?.ghostGroup) {
        ghostPos = new THREE.Vector3();
        this.engine.ghostGroup.getWorldPosition(ghostPos);
      }
      this.currentViewmodelMesh.userData.update(delta, ghostPos);
    }

    // 1b. EMF reader: ghost proximity baseline + server spikes (decaying)
    const heldUd = this.currentViewmodelMesh?.userData;
    if (heldUd?.type === TOOL_TYPES.EMF_READER && heldUd.setLevel) {
      let level = 1;
      if (this.emfSpikeTimer > 0) {
        this.emfSpikeTimer -= delta;
        level = this.emfSpikeLevel || 1;
      } else if (this.engine?.ghostGroup && this.camera) {
        const gp = new THREE.Vector3();
        const cp = new THREE.Vector3();
        this.engine.ghostGroup.getWorldPosition(gp);
        this.camera.getWorldPosition(cp);
        const d = Math.hypot(gp.x - cp.x, gp.z - cp.z);
        level = d < 3 ? 3 : d < 6 ? 2 : 1;
      }
      if (heldUd.getLevel() !== level) heldUd.setLevel(level);
    }

    // 2. Procedural Walking & Sprinting Bobbing
    const isMoving = playerSpeed > 0.1;
    if (isMoving) {
      const freq = playerSpeed > 3.0 ? 12.0 : 7.5; // Faster bobbing for sprint
      this.bobClock += delta * freq;
      const bobX = Math.cos(this.bobClock * 0.5) * 0.012;
      const bobY = Math.sin(this.bobClock) * 0.015;
      this.viewmodelTargetPos.set(
        this.viewmodelBasePos.x + bobX + this.swayVelocity.x,
        this.viewmodelBasePos.y + bobY + this.swayVelocity.y,
        this.viewmodelBasePos.z
      );
    } else {
      // Gentle breathing wave
      this.bobClock += delta * 1.8;
      const breath = Math.sin(this.bobClock) * 0.003;
      this.viewmodelTargetPos.set(
        this.viewmodelBasePos.x + this.swayVelocity.x,
        this.viewmodelBasePos.y + breath + this.swayVelocity.y,
        this.viewmodelBasePos.z
      );
    }

    // Decay mouse sway velocity
    this.swayVelocity.lerp(new THREE.Vector2(0, 0), delta * 10.0);

    // 3. Action Animations (photo, drink, raise, etc.)
    if (this.actionAnimTimer > 0) {
      this.actionAnimTimer -= delta;
      if (this.actionAnimType === 'raise') {
        this.viewmodelTargetPos.y = this.viewmodelBasePos.y;
      } else if (this.actionAnimType === 'drink') {
        // Tilt flask up towards camera
        this.viewmodelTargetPos.y = this.viewmodelBasePos.y + 0.08;
        this.viewmodelTargetPos.z = this.viewmodelBasePos.z + 0.12;
        this.viewmodelTargetRot.x = this.viewmodelBaseRot.x + 0.55;
      } else if (this.actionAnimType === 'photo') {
        // Raise camera to eye level
        this.viewmodelTargetPos.x = 0.0;
        this.viewmodelTargetPos.y = 0.0;
        this.viewmodelTargetPos.z = -0.25;
      } else if (this.actionAnimType === 'recoil') {
        // Slight recoil kick
        this.viewmodelTargetPos.z = this.viewmodelBasePos.z + 0.04;
      }
    } else {
      this.actionAnimType = null;
      this.viewmodelTargetRot.copy(this.viewmodelBaseRot);
    }

    // Smooth lerp viewmodel position & rotation
    if (this.currentViewmodelMesh) {
      this.currentViewmodelMesh.position.lerp(this.viewmodelTargetPos, delta * 12.0);
      this.currentViewmodelMesh.rotation.x = THREE.MathUtils.lerp(this.currentViewmodelMesh.rotation.x, this.viewmodelTargetRot.x, delta * 12.0);
      this.currentViewmodelMesh.rotation.y = THREE.MathUtils.lerp(this.currentViewmodelMesh.rotation.y, this.viewmodelTargetRot.y, delta * 12.0);
      this.currentViewmodelMesh.rotation.z = THREE.MathUtils.lerp(this.currentViewmodelMesh.rotation.z, this.viewmodelTargetRot.z, delta * 12.0);
    }

    // 4. Update Placement Preview Position
    if (this.isPlacementMode && this.placementPreviewMesh && this.camera) {
      this.updatePlacementRaycast();
    }

    // 5. Update Center Interaction Raycast ([E] Pickup prompt)
    this.updateInteractionRaycast();
  }

  updatePlacementRaycast() {
    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    this.raycaster.set(origin, forward);
    this.raycaster.far = 4.0;

    let targets = [];
    if (this.engine?.worldMeshGroup) targets.push(this.engine.worldMeshGroup);
    if (this.interactivePropsGroup) targets.push(this.interactivePropsGroup);

    const intersects = this.raycaster.intersectObjects(targets, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      // Require surface pointing upwards (floor/table)
      if (hit.face && hit.face.normal.y > 0.6) {
        this.placementValid = true;
        this.placementPoint.copy(hit.point);
        this.placementNormal.copy(hit.face.normal);

        this.placementPreviewMesh.visible = true;
        this.placementPreviewMesh.position.copy(hit.point);

        // Align yaw to player camera look
        const yaw = Math.atan2(forward.x, forward.z);
        this.placementPreviewMesh.rotation.set(0, yaw + Math.PI, 0);
        return;
      }
    }

    this.placementValid = false;
    this.placementPreviewMesh.visible = false;
  }

  updateInteractionRaycast() {
    if (!this.camera) return;

    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    this.raycaster.set(origin, forward);
    this.raycaster.far = 2.5;

    const searchTargets = [];
    if (this.interactivePropsGroup) searchTargets.push(this.interactivePropsGroup);
    for (const t of this.pickupTargets) if (t) searchTargets.push(t);

    const intersects = this.raycaster.intersectObjects(searchTargets, true);
    let hitItem = null;

    for (const hit of intersects) {
      let cur = hit.object;
      while (cur) {
        if (cur.userData?.isPickup || cur.userData?.isTool) {
          hitItem = cur;
          break;
        }
        cur = cur.parent;
      }
      if (hitItem) break;
    }

    if (hitItem !== this.hoveredItem) {
      this.hoveredItem = hitItem;
      if (this.onPromptChange) {
        this.onPromptChange(hitItem ? (hitItem.userData.promptHu || `[E] Felvétel: ${hitItem.userData.nameHu}`) : null);
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             CLEAN DISPOSAL                                 */
  /* -------------------------------------------------------------------------- */

  dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('wheel', this._onWheel);
      window.removeEventListener('mousedown', this._onMouseDown);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('contextmenu', this._onContextMenu);
    }

    if (this.viewmodelHolder && this.viewmodelGroup) {
      this.viewmodelGroup.remove(this.viewmodelHolder);
    }

    this.cancelPlacementPreview();

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (e) {}
    }
  }
}
