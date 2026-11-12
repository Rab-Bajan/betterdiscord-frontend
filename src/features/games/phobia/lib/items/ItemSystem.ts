/**
 * ItemSystem.ts
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
import type { SocketLike } from '../../../../../shared/services/socket/SocketLike.ts';
import { isRecord, stringField } from '../../../../../shared/lib/guards.ts';
import { parseWorldItem } from '../../types.ts';
import type { ServerWorldItem } from '../../types.ts';
import { PHOTO_BOUNTIES, TOOL_DEFINITIONS, TOOL_TYPES, normalizeToolType } from './toolCatalog.ts';
import type { PhotoBounty, ToolDefinition, ToolType } from './toolCatalog.ts';
import { createToolViewmodel, createToolWorldMesh, toolData } from './ToolDefinitions.ts';
import type { PhotoRecord, PhotoTarget } from './ToolDefinitions.ts';

/** Emoji icons for the HUD inventory dock, keyed by canonical tool type. */
export const TOOL_ICONS: Readonly<Record<ToolType, string>> = {
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
/** One inventory slot's item (local items also carry HUD name / icon). */
export interface InventoryItem {
  id: string;
  type: string;
  name: string;
  icon?: string;
  charges?: number | undefined;
  empty?: boolean;
  hasWriting?: boolean;
}

export type InventorySlots = [InventoryItem | null, InventoryItem | null, InventoryItem | null];

/** Tool definition for a (normalised) type, or undefined for unknown types. */
const definitionOf = (type: string): ToolDefinition | undefined =>
  (TOOL_DEFINITIONS as Readonly<Record<string, ToolDefinition | undefined>>)[type];

const iconOf = (type: string): string | undefined => (TOOL_ICONS as Readonly<Record<string, string | undefined>>)[type];

export function makeInventoryItem(rawType: unknown, extra: { id?: string | undefined; name?: string | undefined; charges?: number | undefined } = {}): InventoryItem {
  const type = normalizeToolType(rawType);
  const def = definitionOf(type);
  return {
    id: extra.id || type,
    type,
    name: extra.name || def?.nameHu || type,
    icon: iconOf(type) || '📦',
    charges: extra.charges ?? (def && def.maxCharges > 0 ? def.maxCharges : undefined)
  };
}

/** The PhobiaEngine members the item system reads. */
export interface ItemSystemEngine {
  scene?: THREE.Scene | null;
  camera?: THREE.Camera | null;
  viewmodelGroup?: THREE.Object3D | null;
  interactivePropsGroup?: THREE.Object3D | null;
  ghostGroup?: THREE.Object3D | null;
  worldMeshGroup?: THREE.Object3D | null;
  renderer?: THREE.WebGLRenderer | null;
  composer?: { render: (deltaTime?: number) => void } | null;
}

export interface ItemSystemOptions {
  engine?: ItemSystemEngine | null;
  scene?: THREE.Scene | null;
  camera?: THREE.Camera | null;
  viewmodelGroup?: THREE.Object3D | null;
  interactivePropsGroup?: THREE.Object3D | null;
  socket?: SocketLike | null;
  roomId?: string;
  pickupTargets?: Array<THREE.Object3D | null | undefined>;
  isEnabled?: (() => boolean) | null;
  onInventoryChange?: ((inventory: InventorySlots, activeSlot: number) => void) | null;
  onPhotoSnapped?: ((photo: JournalPhoto) => void) | null;
  onSanityRestored?: ((amount: number) => void) | null;
  onPromptChange?: ((prompt: string | null) => void) | null;
}

/** A photo as the journal shows it (and, without dataUrl, as the server receives it). */
export interface JournalPhoto {
  id: string;
  timestamp: string;
  subject: string;
  stars: number;
  reward: number;
  kind: PhotoKind;
  dataUrl: string | null;
}

export type PhotoKind = 'ghost' | 'fingerprint' | 'orb' | 'other';

type ActionAnim = 'raise' | 'drink' | 'photo' | 'smudge' | 'recoil' | 'swap';

/** A server world item that may also carry remaining charges. */
type ServerItem = ServerWorldItem & { charges?: number };

function parseServerItem(value: unknown): ServerItem | null {
  const item = parseWorldItem(value);
  if (!item) return null;
  const charges = isRecord(value) ? value.charges : undefined;
  return typeof charges === 'number' ? { ...item, charges } : item;
}

export class ItemSystem {
  engine: ItemSystemEngine | null | undefined;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  viewmodelGroup: THREE.Object3D | null;
  interactivePropsGroup: THREE.Object3D | null;
  socket: SocketLike | null;
  roomId: string;
  pickupTargets: Array<THREE.Object3D | null | undefined>;
  isEnabled: (() => boolean) | null;
  onInventoryChange: ((inventory: InventorySlots, activeSlot: number) => void) | null;
  onPhotoSnapped: ((photo: JournalPhoto) => void) | null;
  onSanityRestored: ((amount: number) => void) | null;
  onPromptChange: ((prompt: string | null) => void) | null;
  /** Set by the host: called with (itemId, mesh) right before a hovered item is picked up. */
  onItemPickedUp?: (itemId: string | undefined, mesh: THREE.Object3D) => void;
  inventory: InventorySlots;
  activeSlot: number;
  readonly viewmodelHolder: THREE.Group;
  currentViewmodelMesh: THREE.Group | null;
  readonly viewmodelBasePos: THREE.Vector3;
  readonly viewmodelBaseRot: THREE.Euler;
  readonly viewmodelTargetPos: THREE.Vector3;
  readonly viewmodelTargetRot: THREE.Euler;
  bobClock: number;
  readonly swayVelocity: THREE.Vector2;
  actionAnimTimer: number;
  actionAnimType: ActionAnim | null;
  isPlacementMode: boolean;
  placementPreviewMesh: THREE.Group | null;
  placementValid: boolean;
  readonly placementPoint: THREE.Vector3;
  readonly placementNormal: THREE.Vector3;
  readonly raycaster: THREE.Raycaster;
  hoveredItem: THREE.Object3D | null;
  emfSpikeLevel: number;
  emfSpikeTimer: number;
  readonly placedItems: Map<string, THREE.Object3D>;
  /** ids of world items mirrored from the server snapshot */
  readonly serverItemIds: Set<string>;
  /** local ids of items we dropped, waiting for the server's `spawned` echo */
  pendingLocalDrops: Array<string | undefined>;
  lastSpawnedLocalId: string | undefined;
  audioCtx: AudioContext | null = null;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onWheel: ((e: WheelEvent) => void) | null = null;
  private _onMouseDown: ((e: MouseEvent) => void) | null = null;
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onContextMenu: ((e: MouseEvent) => void) | null = null;

  constructor(options: ItemSystemOptions = {}) {
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
    this.scene = scene || (engine ? engine.scene ?? null : null);
    this.camera = camera || (engine ? engine.camera ?? null : null);
    this.viewmodelGroup = viewmodelGroup || (engine ? engine.viewmodelGroup ?? null : null);
    this.interactivePropsGroup = interactivePropsGroup || (engine ? engine.interactivePropsGroup ?? null : null);
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
    this.pendingLocalDrops = []; // local ids of items we dropped, waiting for the server's `spawned` echo
    this.lastSpawnedLocalId = undefined;

    // Audio Synthesizer
    this.initAudioSynthesizer();

    // Key & Mouse Listeners setup
    this.bindInputEvents();
  }

  /* -------------------------------------------------------------------------- */
  /*                             WEB AUDIO SYNTHESIZER                          */
  /* -------------------------------------------------------------------------- */

  initAudioSynthesizer(): void {
    this.audioCtx = null;
    if (typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass();
        } catch (e) {
          // AudioContext might be blocked until user gesture
        }
      }
    }
  }

  ensureAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  playClickSound(frequency = 1200, duration = 0.04): void {
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

  playEmfClick(level = 1): void {
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

  playCameraShutter(): void {
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

  playDrinkGulp(): void {
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

  playJesusBurnSound(): void {
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

  playSaltCrunch(): void {
    this.playClickSound(340, 0.08);
  }

  /* -------------------------------------------------------------------------- */
  /*                             INPUT BINDINGS                                 */
  /* -------------------------------------------------------------------------- */

  bindInputEvents(): void {
    if (typeof window === 'undefined') return;

    const blocked = () => (this.isEnabled ? !this.isEnabled() : false);

    this._onKeyDown = (e: KeyboardEvent) => {
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

    this._onWheel = (e: WheelEvent) => {
      if (blocked()) return;
      if (e.deltaY > 0) {
        this.selectSlot((this.activeSlot + 1) % 3);
      } else if (e.deltaY < 0) {
        this.selectSlot((this.activeSlot + 2) % 3);
      }
    };

    this._onMouseDown = (e: MouseEvent) => {
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

    this._onMouseMove = (e: MouseEvent) => {
      // Mouse sway lag
      this.swayVelocity.x = Math.max(-0.06, Math.min(0.06, e.movementX * 0.0008));
      this.swayVelocity.y = Math.max(-0.06, Math.min(0.06, e.movementY * 0.0008));
    };

    this._onContextMenu = (e: MouseEvent) => {
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

  getInventory(): InventorySlots {
    return this.inventory;
  }

  getActiveItem(): InventoryItem | null | undefined {
    return this.inventory[this.activeSlot];
  }

  setInventory(items: ReadonlyArray<InventoryItem | null | undefined> = []): void {
    this.inventory = [items[0] || null, items[1] || null, items[2] || null];
    this.equipActiveViewmodel();
    if (this.onInventoryChange) this.onInventoryChange(this.inventory, this.activeSlot);
  }

  selectSlot(slotIndex: unknown): void {
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

  addItemToInventory(item: InventoryItem | null | undefined, targetSlot: number | null = null): number {
    if (!item) return -1;
    let slot: number | null | undefined = targetSlot;
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

  equipActiveViewmodel(): void {
    // 1. Dispose old viewmodel
    if (this.currentViewmodelMesh) {
      this.viewmodelHolder.remove(this.currentViewmodelMesh);
      this.currentViewmodelMesh = null;
    }

    const currentItem = this.inventory[this.activeSlot];
    if (!currentItem) return;

    const normType = normalizeToolType(currentItem.type);
    const def = definitionOf(normType) || TOOL_DEFINITIONS[TOOL_TYPES.FLASHLIGHT_T1];

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

  triggerPrimaryAction(): void {
    const item = this.getActiveItem();
    if (!item) return;

    const normType = normalizeToolType(item.type);
    const vm = toolData(this.currentViewmodelMesh);

    switch (normType) {
      case TOOL_TYPES.FLASHLIGHT_T1:
      case TOOL_TYPES.FLASHLIGHT_T2: {
        if (vm?.toggle) {
          const state = vm.toggle();
          this.playClickSound(state ? 1400 : 700, 0.05);
        }
        break;
      }

      case TOOL_TYPES.UV_LIGHT: {
        if (vm?.toggle) {
          const state = vm.toggle();
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
        if (vm?.snapPhoto) {
          const evaluatedTarget = this.evaluatePhotoTarget();
          const rawPhoto = vm.snapPhoto(evaluatedTarget);
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
        const lightAction = vm?.light;
        if (typeof lightAction === 'function') {
          const lit = lightAction();
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
        if (vm?.drink) {
          const drank = vm.drink();
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
        if (vm?.togglePower) {
          const on = vm.togglePower();
          this.playClickSound(on ? 1200 : 600, 0.04);
        }
        break;
      }

      case TOOL_TYPES.SPIRIT_BOX: {
        if (vm?.toggleScan) {
          const scanning = vm.toggleScan();
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
  normalizePhoto(raw: PhotoRecord & { subject?: string; reward?: number }): JournalPhoto {
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
  photoKindOf(raw: { target?: PhotoTarget | PhotoBounty | null } | null | undefined): PhotoKind {
    const t: (PhotoBounty & { kind?: string }) | null | undefined = raw?.target;
    if (t === PHOTO_BOUNTIES.GHOST_1_STAR || t === PHOTO_BOUNTIES.GHOST_2_STAR || t === PHOTO_BOUNTIES.GHOST_3_STAR) return 'ghost';
    if (t === PHOTO_BOUNTIES.FINGERPRINT) return 'fingerprint';
    if (t?.kind === 'orb') return 'orb';
    return 'other';
  }

  /** Renders one frame and returns a downscaled JPEG data URL (null if unavailable). */
  captureSnapshot(): string | null {
    try {
      const engine = this.engine;
      const renderer = engine?.renderer;
      const src = renderer?.domElement;
      if (!renderer || !src || !engine.scene || !engine.camera) return null;
      // The drawing buffer is only readable right after a render in the same task
      if (engine.composer) engine.composer.render(0);
      else renderer.render(engine.scene, engine.camera);
      const out = document.createElement('canvas');
      out.width = 256;
      out.height = Math.max(1, Math.round((256 * src.height) / Math.max(1, src.width)));
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('2d context unavailable');
      ctx.drawImage(src, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      return null;
    }
  }

  /** Server / local thermometer reading -> held laser thermometer LCD */
  applyTemperatureReading(temp: unknown): void {
    const ud = toolData(this.currentViewmodelMesh);
    if (ud?.type === TOOL_TYPES.THERMOMETER && typeof ud.setReading === 'function') {
      ud.setReading(temp);
    }
  }

  /** Server EMF spike (level 1-5 near x,z) -> held EMF reader, decays after a few seconds */
  applyEmfReading({ level = 1, x = null, z = null }: { level?: number; x?: number | null; z?: number | null } = {}): void {
    if (!this.camera) return;
    if (x !== null && z !== null) {
      const cp = new THREE.Vector3();
      this.camera.getWorldPosition(cp);
      if (Math.hypot(cp.x - x, cp.z - z) > 5.0) return; // out of range of the disturbance
    }
    this.emfSpikeLevel = Math.max(1, Math.min(5, level));
    this.emfSpikeTimer = 6.0;
  }

  evaluatePhotoTarget(): PhotoBounty {
    // Center raycast checking distance to ghost or props
    if (!this.camera) return PHOTO_BOUNTIES.INTERACTED_PROP;

    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    this.raycaster.set(origin, forward);

    // If ghost is in scene, test distance
    let ghostMesh: THREE.Object3D | null = null;
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

  togglePlacementMode(): void {
    const item = this.getActiveItem();
    if (!item) return;

    const normType = normalizeToolType(item.type);
    const def = definitionOf(normType);
    if (!def?.isPlaceable) return;

    if (this.isPlacementMode) {
      this.cancelPlacementMode();
    } else {
      this.startPlacementMode(normType);
    }
  }

  startPlacementMode(normType: string): void {
    this.isPlacementMode = true;
    this.cancelPlacementPreview();

    // Create holographic green placement preview
    const preview = createToolWorldMesh(normType);
    preview.name = 'ItemSystem_PlacementPreview';

    // Apply translucent green material to all meshes
    preview.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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

  cancelPlacementPreview(): void {
    if (this.placementPreviewMesh) {
      if (this.scene) this.scene.remove(this.placementPreviewMesh);
      this.placementPreviewMesh = null;
    }
  }

  cancelPlacementMode(): void {
    this.isPlacementMode = false;
    this.cancelPlacementPreview();
  }

  confirmPlacement(): void {
    if (!this.isPlacementMode || !this.placementValid || !this.placementPreviewMesh) {
      this.cancelPlacementMode();
      return;
    }

    const item = this.getActiveItem();
    if (!item) return;

    const normType = normalizeToolType(item.type);

    if (normType === TOOL_TYPES.SALT_SHAKER) {
      // Place salt pile on floor, consume 1 charge
      const vm = toolData(this.currentViewmodelMesh);
      if (vm?.placeSalt) {
        const ok = vm.placeSalt();
        if (ok) {
          this.spawnPlacedWorldItem(TOOL_TYPES.SALT_PILE, this.placementPoint);
          this.playSaltCrunch();
        }
      }
    } else {
      // Place item onto ground
      this.spawnPlacedWorldItem(normType, this.placementPoint, this.placementPreviewMesh.quaternion);
      this.trackLocalDrop();
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

  spawnPlacedWorldItem(toolType: string, position: THREE.Vector3, rotation: THREE.Quaternion | null = null): THREE.Group {
    const worldMesh = createToolWorldMesh(toolType);
    worldMesh.position.copy(position);
    if (rotation) worldMesh.quaternion.copy(rotation);

    const itemId = `${toolType}_${Date.now()}`;
    worldMesh.userData = {
      isPickup: true,
      itemId,
      type: toolType,
      nameHu: definitionOf(toolType)?.nameHu || toolType,
      promptHu: `[E] Felvétel: ${definitionOf(toolType)?.nameHu || toolType}`
    };

    if (this.interactivePropsGroup) {
      this.interactivePropsGroup.add(worldMesh);
    } else if (this.scene) {
      this.scene.add(worldMesh);
    }

    this.placedItems.set(itemId, worldMesh);
    this.lastSpawnedLocalId = itemId;
    return worldMesh;
  }

  /**
   * Replaces the mirrored server-side dropped items (late join / reconnect / new match).
   * Items are { id, type, name, x, y, z, charges? }; locally placed items are left alone.
   */
  syncServerItems(items: unknown): void {
    for (const id of this.serverItemIds) {
      const mesh = this.placedItems.get(id);
      if (mesh?.parent) mesh.parent.remove(mesh);
      this.placedItems.delete(id);
    }
    this.serverItemIds.clear();
    if (!Array.isArray(items)) return;
    for (const raw of items) {
      const it = parseServerItem(raw);
      if (!it || this.placedItems.has(it.id)) continue;
      const mesh = this.spawnPlacedWorldItem(normalizeToolType(it.type), new THREE.Vector3(it.x, it.y, it.z));
      // spawnPlacedWorldItem registers under a generated id; re-key to the server id
      this.placedItems.delete(String(mesh.userData.itemId));
      mesh.userData.itemId = it.id;
      if (it.name) {
        mesh.userData.nameHu = it.name;
        mesh.userData.promptHu = `[E] Felvétel: ${it.name}`;
      }
      if (it.charges !== undefined) mesh.userData.charges = it.charges;
      if ([it.rx, it.ry, it.rz].some((n) => Number.isFinite(n))) mesh.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      this.placedItems.set(it.id, mesh);
      this.serverItemIds.add(it.id);
    }
  }

  /**
   * Applies `phobia:world-item-updated` ({ action: 'spawned'|'moved'|'removed', item }).
   * Our own spawns are already in the world: the local mesh is re-keyed to the server id (no double
   * spawn) and its settled transform is reported back with `phobia:item-moved`.
   */
  applyWorldItem(action: unknown, raw: unknown, isSelf = false): void {
    const id = stringField(raw, 'id');
    if (!id) return;
    const type = normalizeToolType(stringField(raw, 'type'));
    const existing = this.placedItems.get(id);

    if (action === 'removed') {
      if (existing?.parent) existing.parent.remove(existing);
      this.placedItems.delete(id);
      this.serverItemIds.delete(id);
      if (this.hoveredItem === existing) this.hoveredItem = null;
      return;
    }
    const item = parseServerItem(raw);
    if (!item) return;

    if (action === 'spawned' && isSelf && !existing) {
      const idx = this.pendingLocalDrops.findIndex((id) => id !== undefined && toolData(this.placedItems.get(id))?.type === type);
      if (idx !== -1) {
        const localId = this.pendingLocalDrops.splice(idx, 1)[0];
        const mesh = localId === undefined ? undefined : this.placedItems.get(localId);
        if (localId !== undefined) this.placedItems.delete(localId);
        if (!mesh) return;
        mesh.userData.itemId = item.id;
        this.placedItems.set(item.id, mesh);
        this.serverItemIds.add(item.id);
        if (this.socket) {
          this.socket.emit('phobia:item-moved', {
            roomId: this.roomId,
            itemId: item.id,
            position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
            rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z }
          });
        }
        return;
      }
    }
    if (isSelf && action === 'moved') return;

    if (existing) {
      existing.position.set(item.x, item.y, item.z);
      if ([item.rx, item.ry, item.rz].some((n) => Number.isFinite(n))) existing.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
      return;
    }
    this.syncOneServerItem({ ...item, type });
  }

  /** Spawns one server-owned world item (shared by snapshots and incremental updates). */
  syncOneServerItem(it: ServerItem): THREE.Group {
    const mesh = this.spawnPlacedWorldItem(normalizeToolType(it.type), new THREE.Vector3(it.x, it.y, it.z));
    this.placedItems.delete(String(mesh.userData.itemId));
    mesh.userData.itemId = it.id;
    if (it.name) {
      mesh.userData.nameHu = it.name;
      mesh.userData.promptHu = `[E] Felvétel: ${it.name}`;
    }
    if (it.charges !== undefined) mesh.userData.charges = it.charges;
    if ([it.rx, it.ry, it.rz].some((n) => Number.isFinite(n))) mesh.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    this.placedItems.set(it.id, mesh);
    this.serverItemIds.add(it.id);
    return mesh;
  }

  /* -------------------------------------------------------------------------- */
  /*                             DROP ACTION ('G' KEY)                          */
  /* -------------------------------------------------------------------------- */

  dropCurrentItem(): void {
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

  dropItemAtPosition(item: InventoryItem | null | undefined): void {
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
    this.trackLocalDrop();
  }

  trackLocalDrop(): void {
    this.pendingLocalDrops.push(this.lastSpawnedLocalId);
    if (this.pendingLocalDrops.length > 10) this.pendingLocalDrops.shift();
  }

  /* -------------------------------------------------------------------------- */
  /*                             PICKUP ACTION ('E' KEY)                        */
  /* -------------------------------------------------------------------------- */

  pickupHoveredItem(): void {
    if (!this.hoveredItem) return;

    const itemData = toolData(this.hoveredItem) ?? {};
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
    if (itemData.itemId !== undefined) {
      this.placedItems.delete(itemData.itemId);
      this.serverItemIds.delete(itemData.itemId);
    }

    this.addItemToInventory(itemToEquip);
    this.hoveredItem = null;
    this.playClickSound(1200, 0.04);

    if (this.onPromptChange) this.onPromptChange(null);
  }

  /* -------------------------------------------------------------------------- */
  /*                             PER-FRAME UPDATE LOOP                          */
  /* -------------------------------------------------------------------------- */

  update(delta: number, playerSpeed = 0.0): void {
    // 1. Update active held viewmodel custom logic (timers, particles, screens)
    const updateHeld = toolData(this.currentViewmodelMesh)?.update;
    if (updateHeld) {
      let ghostPos: THREE.Vector3 | null = null;
      if (this.engine?.ghostGroup) {
        ghostPos = new THREE.Vector3();
        this.engine.ghostGroup.getWorldPosition(ghostPos);
      }
      updateHeld(delta, ghostPos);
    }

    // 1b. EMF reader: ghost proximity baseline + server spikes (decaying)
    const heldUd = toolData(this.currentViewmodelMesh);
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
      if (heldUd.getLevel?.() !== level) heldUd.setLevel(level);
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

  updatePlacementRaycast(): void {
    if (!this.camera || !this.placementPreviewMesh) return;
    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    this.raycaster.set(origin, forward);
    this.raycaster.far = 4.0;

    const targets: THREE.Object3D[] = [];
    if (this.engine?.worldMeshGroup) targets.push(this.engine.worldMeshGroup);
    if (this.interactivePropsGroup) targets.push(this.interactivePropsGroup);

    const intersects = this.raycaster.intersectObjects(targets, true);
    const hit = intersects[0];
    if (hit) {
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

  updateInteractionRaycast(): void {
    if (!this.camera) return;

    const origin = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(forward);

    this.raycaster.set(origin, forward);
    this.raycaster.far = 2.5;

    const searchTargets: THREE.Object3D[] = [];
    if (this.interactivePropsGroup) searchTargets.push(this.interactivePropsGroup);
    for (const t of this.pickupTargets) if (t) searchTargets.push(t);

    const intersects = this.raycaster.intersectObjects(searchTargets, true);
    let hitItem: THREE.Object3D | null = null;

    for (const hit of intersects) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        const data = toolData(cur);
        if (data?.isPickup || data?.isTool) {
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
        const hitData = toolData(hitItem);
        this.onPromptChange(hitData ? (hitData.promptHu || `[E] Felvétel: ${hitData.nameHu}`) : null);
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             CLEAN DISPOSAL                                 */
  /* -------------------------------------------------------------------------- */

  dispose(): void {
    if (typeof window !== 'undefined') {
      if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
      if (this._onWheel) window.removeEventListener('wheel', this._onWheel);
      if (this._onMouseDown) window.removeEventListener('mousedown', this._onMouseDown);
      if (this._onMouseMove) window.removeEventListener('mousemove', this._onMouseMove);
      if (this._onContextMenu) window.removeEventListener('contextmenu', this._onContextMenu);
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
