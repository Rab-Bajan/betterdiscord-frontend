import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Compass,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  Maximize2,
  AlertTriangle,
  Radio,
  BookOpen,
  Trophy
} from 'lucide-react';

import { PhobiaEngine } from '../lib/engine/PhobiaEngine.ts';
import { PhobiaController } from '../lib/engine/PhobiaController.ts';
import type { InteractiveUserData } from '../lib/engine/PhobiaController.ts';
import { PhobiaAvatars } from '../lib/engine/PhobiaAvatars.ts';
import { ScrapYardMap } from '../lib/map/ScrapYardMap.ts';
import { TruckEnvironment } from '../lib/map/TruckEnvironment.ts';
import { MapColliders } from '../lib/map/MapColliders.ts';
import { ElectricalSystem } from '../lib/systems/ElectricalSystem.ts';
import { EnvironmentalPhysics } from '../lib/systems/EnvironmentalPhysics.ts';
import { usePhobiaVoice } from '../hooks/usePhobiaVoice.ts';
import type { SetPeerSpatial, VoicePeer } from '../hooks/usePhobiaVoice.ts';
import { PhobiaAudio } from '../lib/audio/PhobiaAudio.ts';
import { ItemSystem } from '../lib/items/ItemSystem.ts';
import type { InventoryItem } from '../lib/items/ItemSystem.ts';
import { normalizeToolType } from '../lib/items/toolCatalog.ts';
import {
  CLIENT_TO_SERVER_DOOR,
  SERVER_TO_CLIENT_DOORS,
  buildExtraFixtures,
  buildGhostEntity
} from '../lib/yardExtras.ts';
import type { GhostEntity } from '../lib/yardExtras.ts';
import { isRecord, isString, optionalString } from '../../../../shared/lib/guards.ts';
import type { SocketLike } from '../../../../shared/services/socket/SocketLike.ts';
import {
  parseMatchResult,
  parseObjective,
  parsePhoto,
  parsePlayer,
  parsePlayers,
  parseSettings,
  toTask
} from '../types.ts';
import type {
  EvidenceMark,
  HudObjective,
  HudSideTask,
  HudTeammate,
  JournalPhotoEntry,
  PhobiaMatchResult,
  PhobiaPlayer,
  PhobiaSettings
} from '../types.ts';

import PhobiaHUD from './PhobiaHUD.tsx';
import type { CrosshairPrompt } from './PhobiaHUD.tsx';
import JournalModal from './JournalModal.tsx';
import { EVIDENCE_TYPES, GHOST_ARCHETYPES } from '../lib/ghostCatalog.ts';
import SpectatorView from './SpectatorView.tsx';
import LobbyScreen from './LobbyScreen.tsx';
import HideOverlay from './HideOverlay.tsx';

/** Dev-only handles for poking at the running game from the console. */
interface PhobiaDebugHandles {
  engine: PhobiaEngine;
  controller: PhobiaController;
  map: ScrapYardMap;
  truck: TruckEnvironment;
  electrical: ElectricalSystem;
  physics: EnvironmentalPhysics;
  avatars: PhobiaAvatars;
  itemSys: ItemSystem | null;
  audio: PhobiaAudio | null;
  ghost: GhostEntity;
  THREE: typeof THREE;
}

declare global {
  interface Window {
    __phobia?: PhobiaDebugHandles;
  }
}

const DEFAULT_SETTINGS: PhobiaSettings = { evidenceCount: 3, startingSanity: 100 };

const EMPTY_EVIDENCE: Readonly<Record<string, EvidenceMark>> = {
  emf_5: 0,
  spirit_box: 0,
  fingerprints: 0,
  ghost_orbs: 0,
  ghost_writing: 0,
  freezing_temps: 0,
  dots: 0
};

type InventoryState = ReadonlyArray<InventoryItem | null>;

/** The logged-in user as the view needs it. */
interface PhobiaUser {
  id?: string;
  username?: string;
}

interface MiskolcPhobiaViewProps {
  socket?: SocketLike | null;
  channelId?: string | null;
  currentUser?: PhobiaUser | null;
  /** Room activity summary (unused by the view; the server snapshot drives it). */
  session?: unknown;
  setPeerSpatial?: SetPeerSpatial | null;
  onClose?: () => void;
}

/** A finite number, or undefined. */
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

export default function MiskolcPhobiaView({
  socket,
  channelId,
  currentUser,
  session,
  setPeerSpatial,
  onClose
}: MiskolcPhobiaViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null); // mount <div>: the engine owns the actual <canvas> inside it

  // References to core 3D systems
  const engineRef = useRef<PhobiaEngine | null>(null);
  const controllerRef = useRef<PhobiaController | null>(null);
  const mapCollidersRef = useRef<MapColliders | null>(null);
  const truckRef = useRef<TruckEnvironment | null>(null);
  const mapRef = useRef<ScrapYardMap | null>(null);
  const electricalRef = useRef<ElectricalSystem | null>(null);
  const avatarsRef = useRef<PhobiaAvatars | null>(null);
  const audioRef = useRef<PhobiaAudio | null>(null);
  const itemSystemRef = useRef<ItemSystem | null>(null);
  const ghostRef = useRef<GhostEntity | null>(null);
  const switchLightsRef = useRef(new Map<string, string[]>()); // switchId -> lightId[]
  const physicsRef = useRef<EnvironmentalPhysics | null>(null);
  const hiddenPeersRef = useRef(new Set<string>()); // socket ids currently hidden in a locker / trunk

  // Mutable mirrors of React state, read from the 60 fps update hook / socket handlers (no stale closures)
  const huntRef = useRef(false);
  const sanityRef = useRef(100);
  const aliveRef = useRef(true);
  const journalRef = useRef(false);
  const playersRef = useRef<PhobiaPlayer[]>([]);
  const spectatorIdxRef = useRef(0);
  const heartbeatOnRef = useRef(false);

  // Game UI State
  const [initError, setInitError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [sessionRefusal, setSessionRefusal] = useState<string | null>(null); // 'session_full' | 'session_limit' | other server refusal code
  const [verdictNotice, setVerdictNotice] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [isAlive, setIsAlive] = useState(true);

  // Stats & HUD
  const [stamina, setStamina] = useState(100);
  const [sanity, setSanity] = useState(100);
  const [inventory, setInventory] = useState<InventoryState>([null, null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [controllerPrompt, setControllerPrompt] = useState<CrosshairPrompt | null>(null);
  const [itemPrompt, setItemPrompt] = useState<CrosshairPrompt | null>(null);
  const [huntActive, setHuntActive] = useState(false);
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [ambientTemp, setAmbientTemp] = useState(15.0);
  const [breakerOn, setBreakerOn] = useState(true);
  const [activeLightsCount, setActiveLightsCount] = useState(0);

  // Evidence, Photos & Verdict
  const [evidenceState, setEvidenceState] = useState<Readonly<Record<string, EvidenceMark>>>(EMPTY_EVIDENCE);
  const [photos, setPhotos] = useState<JournalPhotoEntry[]>([]);
  const [selectedGhost, setSelectedGhost] = useState('');
  const [matchResult, setMatchResult] = useState<PhobiaMatchResult | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [aliveTeammates, setAliveTeammates] = useState<PhobiaPlayer[]>([]);
  const [spectatorIdx, setSpectatorIdx] = useState(0);
  const [teammates, setTeammates] = useState<HudTeammate[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sideTasks, setSideTasks] = useState<HudSideTask[]>([]);
  const [primaryObjective, setPrimaryObjective] = useState<HudObjective | null>(null);

  // Lobby / session meta (null status = no session snapshot received yet)
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<PhobiaSettings>(DEFAULT_SETTINGS);
  const [hostSocketId, setHostSocketId] = useState<string | null>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<PhobiaPlayer[]>([]);
  const [selfId, setSelfId] = useState<string | null>(socket?.id || null);

  // Hiding
  const [hiddenSpotName, setHiddenSpotName] = useState<string | null>(null); // non-null while we are inside a locker / trunk

  const setHunt = useCallback((v: boolean) => {
    huntRef.current = v;
    setHuntActive(v);
  }, []);
  const setSanityBoth = useCallback((v: number) => {
    sanityRef.current = v;
    setSanity(v);
  }, []);

  const crosshairPrompt = itemPrompt || controllerPrompt;

  // 1. INITIALIZE THREE.JS ENGINE & GAME WORLD
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    setInitError(null);
    setIsReady(false);

    let engine: PhobiaEngine | null = null;
    let itemSys: ItemSystem | null = null;
    let controller: PhobiaController | null = null;
    let avatars: PhobiaAvatars | null = null;
    let electrical: ElectricalSystem | null = null;
    let audio: PhobiaAudio | null = null;
    let physics: EnvironmentalPhysics | null = null;

    try {
      // 1. Core WebGL Engine (creates and owns its <canvas> inside the mount div)
      const eng = new PhobiaEngine({ mount: canvasRef.current, container: containerRef.current });
      engine = eng;
      engineRef.current = eng;
      // The engine builds its scene in the constructor; it is only null after dispose
      const scene = eng.scene;
      if (!scene) throw new Error('PhobiaEngine has no scene');

      // 2. Map Collision System
      const mapColliders = new MapColliders();
      mapCollidersRef.current = mapColliders;

      // 3. Audio Spatializer
      try {
        audio = new PhobiaAudio({ camera: eng.camera });
        audioRef.current = audio;
      } catch (err) {
        console.warn('PhobiaAudio init error:', err);
      }

      // 4. Scrap Yard Map (its group must be part of the scene graph!)
      const map = new ScrapYardMap({ mapColliders });
      mapRef.current = map;
      eng.worldMeshGroup.add(map.group);

      // 5. Surveillance Truck Environment
      const truck = new TruckEnvironment({
        onGateOpen: () => {
          if (socket && channelId) socket.emit('phobia:gate-toggle', { roomId: channelId, channelId });
        },
        onCameraCycle: () => {}
      });
      truckRef.current = truck;
      eng.worldMeshGroup.add(truck.group);
      for (const col of truck.colliders) mapColliders.addCollider(col);

      // Sound hook shared by the physics and electrical systems (audio may have failed to start)
      const playSfx = (sfxKey: string, pos: { x: number; y: number; z: number }): void => {
        if (audio && typeof audio.playSpatialSFX === 'function') audio.playSpatialSFX(sfxKey, pos);
      };

      // 5b. Throwable scrap props (server snapshot is the only source, no local defaults)
      const phys = new EnvironmentalPhysics({
        scene,
        mapColliders,
        socket,
        roomId: channelId,
        seedDefaults: false,
        onPlaySound: playSfx
      });
      physics = phys;
      physicsRef.current = phys;

      // 6. Master Electrical System (+ extra pole lamps for server lights the map lacks)
      const elec = new ElectricalSystem({
        scene,
        map,
        socket,
        roomId: channelId,
        onPlaySound: playSfx
      });
      electrical = elec;
      electricalRef.current = elec;
      buildExtraFixtures(map, elec);
      // Server starts with every lamp off and the breaker on
      elec.syncFromServer({ breakerOn: true, activeLights: [] });

      // switchId -> every light id bound to that physical wall switch
      const switchLights = new Map<string, string[]>();
      elec.fixtures.forEach((fix, id) => {
        fix.switchMesh?.traverse((o) => {
          const sid = optionalString(o.userData?.switchId);
          if (sid) {
            let ids = switchLights.get(sid);
            if (!ids) {
              ids = [];
              switchLights.set(sid, ids);
            }
            if (!ids.includes(id)) ids.push(id);
          }
        });
      });
      switchLightsRef.current = switchLights;

      // Interactables the controller may raycast (rack pickups are handled by the ItemSystem)
      const interactiveProps = [
        ...map.interactiveProps.filter((m) => m.userData?.action !== 'pickup_scrap'),
        ...truck.interactiveObjects.filter((m) => !m.userData?.isPickup)
      ];

      // 7. Player 3D Controller
      const ctrl: PhobiaController = new PhobiaController({
        camera: eng.camera,
        domElement: eng.canvas,
        scene,
        mapColliders,
        socket,
        roomId: channelId ?? undefined,
        initialPosition: [-4.0, 0.0, -15.0],
        initialYaw: Math.PI, // face the yard gate from the truck
        manageInventory: false, // ItemSystem owns the inventory
        requireLock: true,
        interactiveProps,
        doorIdMap: CLIENT_TO_SERVER_DOOR,
        getSelfId: () => socket?.id || null,
        onHideChange: ({ hidden, spot }) => {
          setHiddenSpotName(hidden ? (spot?.name || 'Rejtekhely') : null);
          if (hidden) itemSystemRef.current?.cancelPlacementMode?.();
        },
        resolveSwitchLights: (u: InteractiveUserData | undefined) => (u?.switchId === undefined ? undefined : switchLights.get(u.switchId)) || [],
        onInteractionPrompt: (prompt, target) => {
          if (!prompt) {
            setControllerPrompt(null);
          } else {
            const text = prompt.replace(/^\[E\]\s*/, '');
            setControllerPrompt({
              action: text,
              key: 'E',
              subText: target?.door?.name || target?.spot?.name || ''
            });
          }
        },
        onInteract: (target) => {
          if (target?.type === 'gate_button') truck.pressGateButton();
          else if (target?.type === 'cycle_camera') truck.cycleCamera(1);
        },
        onStaminaChange: (v) => setStamina(v),
        onFootstep: (surface) => {
          if (audio) audio.playFootstep(surface, ctrl.isSprinting);
        },
        onFlashlightToggle: () => {
          eng.toggleFlashlight();
          if (audio) audio.playFlashlightClick();
        }
      });
      controller = ctrl;
      controllerRef.current = ctrl;

      // 8. Item System (single owner of the 3-slot inventory)
      try {
        itemSys = new ItemSystem({
          engine: eng,
          scene,
          camera: eng.camera,
          viewmodelGroup: eng.viewmodelGroup,
          interactivePropsGroup: eng.interactivePropsGroup,
          pickupTargets: [truck.group],
          socket,
          roomId: channelId ?? undefined,
          isEnabled: () => !!controllerRef.current?.isLocked && !controllerRef.current?.isHiding && !journalRef.current && aliveRef.current,
          onInventoryChange: (newInv, slot) => {
            setInventory([...newInv]);
            setActiveSlot(slot);
          },
          onPhotoSnapped: (photo) => setPhotos((prev) => [...prev.slice(-9), photo]),
          onSanityRestored: (amount) => setSanityBoth(Math.min(100, sanityRef.current + amount)), // amount restored, not the new total
          onPromptChange: (p) => {
            setItemPrompt(p ? { action: String(p).replace(/^\[E\]\s*/, ''), key: 'E', subText: '' } : null);
          }
        });
        itemSystemRef.current = itemSys;
      } catch (itemErr) {
        console.warn('ItemSystem init error:', itemErr);
      }

      // 9. Multiplayer Avatars (local player is filtered out per tick by socket id)
      const avs = new PhobiaAvatars({ scene, localPlayerId: socket?.id || null });
      avatars = avs;
      avatarsRef.current = avs;

      // 10. Ghost entity
      const ghost = buildGhostEntity(eng);
      ghostRef.current = ghost;

      // 11. Frame Update Hook
      const updateFn = (delta: number, elapsed: number): void => {
        ctrl.update(delta);
        truck.update(delta, elapsed);
        map.update(delta);
        elec.update(delta);
        phys.update(delta);
        avs.update(delta);
        if (itemSys) {
          itemSys.update(delta, ctrl.isSprinting ? 5.0 : (ctrl.isMoving ? 3.0 : 0));
        }

        // Ghost dissolve / follow
        const g = ghostRef.current;
        if (g) {
          g.dissolve += ((g.wantVisible ? 0 : 1) - g.dissolve) * Math.min(1, 4 * delta);
          g.material.setDissolveProgress(g.dissolve);
          g.material.update(delta);
          g.group.visible = g.dissolve < 0.97;
          g.glow.intensity = g.wantVisible ? 1.4 : 0;
          const dx = g.target.x - g.group.position.x;
          const dz = g.target.z - g.group.position.z;
          if (dx * dx + dz * dz > 0.0004) g.yaw = Math.atan2(dx, dz);
          g.fig?.update(delta, { moving: dx * dx + dz * dz > 0.0004, hunting: huntRef.current });
          g.group.position.x += dx * Math.min(1, 8 * delta);
          g.group.position.z += dz * Math.min(1, 8 * delta);
          g.group.position.y = 0.05 + Math.sin(elapsed * 2.0) * 0.08;
          g.group.rotation.y = g.yaw;
        }

        // Electrical HUD state (setState only on change)
        setBreakerOn((prev) => (prev !== elec.isOn ? elec.isOn : prev));
        const lightsCount = elec.activeLights?.size || 0;
        setActiveLightsCount((prev) => (prev !== lightsCount ? lightsCount : prev));

        // Spectator camera: follow a living teammate after death
        if (!aliveRef.current) {
          const alive = playersRef.current.filter((p) => p.alive && p.id !== socket?.id);
          const target = alive[spectatorIdxRef.current % Math.max(1, alive.length)];
          if (target) {
            ctrl.position.set(target.x ?? 0, target.y || 0, target.z ?? 0);
            ctrl.setLookAngles(target.yaw || 0, target.pitch || 0);
          }
        }

        // Low sanity heartbeat
        if (audio) {
          if (sanityRef.current < 30 || huntRef.current) {
            audio.updateHeartbeat(sanityRef.current, huntRef.current);
            heartbeatOnRef.current = true;
          } else if (heartbeatOnRef.current) {
            audio.stopHeartbeat?.();
            heartbeatOnRef.current = false;
          }
        }
      };
      eng.registerUpdateHook(updateFn);

      if (import.meta.env?.DEV) {
        window.__phobia = { engine: eng, controller: ctrl, map, truck, electrical: elec, physics: phys, avatars: avs, itemSys, audio, ghost, THREE };
      }

      eng.start();
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize MiskolcPhobia 3D engine:', error);
      setInitError((error instanceof Error && error.message) || 'Nem sikerült elindítani a 3D motort.');
    }

    return () => {
      // Dispose gameplay systems first, the engine (scene + renderer) last
      const safe = (fn: () => void): void => { try { fn(); } catch (err) { console.warn('Error during Phobia cleanup:', err); } };
      safe(() => ghostRef.current?.fig?.dispose?.());
      safe(() => itemSys?.dispose?.());
      safe(() => controller?.dispose?.());
      safe(() => avatars?.dispose?.());
      safe(() => electrical?.dispose?.());
      safe(() => physics?.dispose?.());
      safe(() => audio?.dispose?.());
      safe(() => engine?.destroy?.());
      engineRef.current = null;
      controllerRef.current = null;
      itemSystemRef.current = null;
      avatarsRef.current = null;
      electricalRef.current = null;
      physicsRef.current = null;
      audioRef.current = null;
      mapRef.current = null;
      truckRef.current = null;
      ghostRef.current = null;
      mapCollidersRef.current = null;
      if (import.meta.env?.DEV) delete window.__phobia;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, socket, retryNonce]);

  // Applies authoritative server door states to the local hinged doors
  const applyServerDoor = useCallback((serverDoorId: string, open: unknown) => {
    const map = mapRef.current;
    const colliders = mapCollidersRef.current;
    if (serverDoorId === 'gate_depot_main' && map) {
      map.toggleGate(!!open);
      return;
    }
    for (const id of SERVER_TO_CLIENT_DOORS[serverDoorId] || []) {
      const door = colliders?.getDoor?.(id);
      if (door && door.isOpen !== !!open) (open ? door.open() : door.close());
    }
  }, []);

  const initPayload = useCallback((extra: Record<string, unknown> = {}) => ({
    roomId: channelId,
    channelId,
    userId: currentUser?.id,
    username: currentUser?.username || 'Nyomozó',
    user: { id: currentUser?.id, username: currentUser?.username || 'Nyomozó' },
    ...extra
  }), [channelId, currentUser?.id, currentUser?.username]);

  // Mirrors the server equipment shelf on the truck rack: tools nobody holds are shown, taken ones hidden
  const applyEquipmentShelf = useCallback((shelf: unknown) => {
    const rack = truckRef.current?.rackItemMeshes;
    if (!Array.isArray(shelf) || !rack) return;
    const available = new Set(shelf.map((i: unknown) => normalizeToolType(isRecord(i) ? i.type : undefined)));
    for (const mesh of rack.values()) {
      mesh.visible = available.has(normalizeToolType(mesh.userData?.type));
    }
  }, []);

  // Objectives: HUD panel + truck whiteboard (same data)
  const applyObjectives = useCallback((primary: unknown, objectives: unknown) => {
    const list: unknown[] = Array.isArray(objectives) ? objectives : [];
    const tasks = list.filter(Boolean).map(toTask);
    setSideTasks(tasks);
    const prim = isRecord(primary) ? primary : null;
    setPrimaryObjective(parseObjective(prim));
    truckRef.current?.updateWhiteboard?.({
      primary: prim,
      objectives: list,
      primaryCompleted: !!prim?.done,
      sideObjectives: tasks.map((t) => ({ desc: t.title, bounty: t.reward, completed: t.completed }))
    });
  }, []);

  // Lobby / match meta shared by session-init and session-updated summaries
  const applySessionMeta = useCallback((snap: unknown) => {
    if (!isRecord(snap)) return;
    setSessionStatus((prev) => (isString(snap.status) ? snap.status : (prev || 'active')));
    const snapSettings = parseSettings(snap.settings);
    if (snapSettings) setSettings({ ...DEFAULT_SETTINGS, ...snapSettings });
    if (snap.hostSocketId !== undefined) setHostSocketId(optionalString(snap.hostSocketId) || null);
    if (Array.isArray(snap.players)) {
      setLobbyPlayers(parsePlayers(snap.players).map((p) => ({
        id: p.id || p.socketId,
        username: p.username,
        avatarColor: p.avatarColor
      })));
    }
  }, []);

  // Applies a full server session snapshot (join, reconnect, new match)
  const applySessionSnapshot = useCallback((snap: unknown) => {
    if (!isRecord(snap)) return;
    applySessionMeta(snap);
    electricalRef.current?.syncFromServer({
      breakerOn: typeof snap.breakerOn === 'boolean' ? snap.breakerOn : undefined,
      activeLights: Array.isArray(snap.activeLights) ? snap.activeLights.filter(isString) : undefined
    });
    if (isRecord(snap.doors)) {
      for (const [id, d] of Object.entries(snap.doors)) applyServerDoor(id, isRecord(d) ? d.open : undefined);
    }
    if (typeof snap.graceTimer === 'number') setGracePeriodSeconds(snap.graceTimer);
    if (typeof snap.gateOpen === 'boolean') setGateOpen(snap.gateOpen);
    applyEquipmentShelf(snap.equipmentShelf);
    if (Array.isArray(snap.droppedItems)) itemSystemRef.current?.syncServerItems(snap.droppedItems);
    if (Array.isArray(snap.scrapProps)) physicsRef.current?.syncFromServer(snap.scrapProps);
    if (Array.isArray(snap.objectives) || snap.primaryObjective) {
      applyObjectives(snap.primaryObjective, snap.objectives);
    } else if (Array.isArray(snap.sideTasks)) {
      applyObjectives(null, snap.sideTasks.map((raw: unknown) => {
        const t = isRecord(raw) ? raw : {};
        return { id: t.id, textHu: t.title || t.desc, rewardFt: t.reward, done: !!t.completed };
      }));
    }
  }, [applyServerDoor, applyEquipmentShelf, applySessionMeta, applyObjectives]);

  // 2. SOCKET.IO MULTIPLAYER SYNCHRONIZATION (12 Hz Authoritative Loop)
  useEffect(() => {
    if (!socket || !channelId) return undefined;

    socket.emit('phobia:init-session', initPayload({ lobby: true }));
    setSelfId(socket.id || null);

    const handleConnect = (): void => {
      setSelfId(socket.id || null);
      socket.emit('phobia:init-session', initPayload({ lobby: true }));
    };

    const handleSessionInit = (data: unknown): void => {
      setSelfId(socket.id || null);
      applySessionSnapshot(isRecord(data) ? data.session : undefined);
    };

    // Lobby: roster, settings and host changes
    const handleSessionUpdated = (d: unknown): void => applySessionMeta(isRecord(d) ? d.state : undefined);
    const handleSettingsUpdated = (d: unknown): void => {
      if (!isRecord(d)) return;
      const next = parseSettings(d.settings);
      if (next) setSettings({ ...DEFAULT_SETTINGS, ...next });
      if (d.hostSocketId !== undefined) setHostSocketId(optionalString(d.hostSocketId) || null);
    };
    const handlePlayerJoined = (d: unknown): void => {
      const p = parsePlayer(isRecord(d) ? d.player : undefined);
      const id = p?.id || p?.socketId;
      if (!p || !id) return;
      setLobbyPlayers((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, { id, username: p.username, avatarColor: p.avatarColor }]));
    };
    const handlePlayerLeft = (d: unknown): void => {
      const leftId = isRecord(d) ? optionalString(d.socketId) : undefined;
      if (leftId) setLobbyPlayers((prev) => prev.filter((x) => x.id !== leftId));
    };

    const handleObjectives = (d: unknown): void => {
      const r = isRecord(d) ? d : undefined;
      applyObjectives(r?.primary, r?.objectives);
    };

    // Hiding: other players' lockers / trunks are occupied while they are inside
    const handlePlayerHide = (d: unknown): void => {
      if (!isRecord(d)) return;
      const peerId = optionalString(d.socketId);
      if (!peerId) return;
      const spotId = optionalString(d.spotId);
      const spot = spotId ? mapCollidersRef.current?.getHidingSpot?.(spotId) : null;
      if (d.hidden) {
        hiddenPeersRef.current.add(peerId);
        if (spot && peerId !== socket.id) { spot.enter(peerId); spot.close(); }
      } else {
        hiddenPeersRef.current.delete(peerId);
        if (spot && peerId !== socket.id) { spot.exit(); spot.open(); }
      }
      // The server ended our own hiding (we moved away): leave the cabinet locally too
      if (peerId === socket.id && !d.hidden) controllerRef.current?.exitHidingSpot?.();
    };

    // World items: everybody sees the same items / props. Own actions are already applied locally.
    const handleWorldItem = (d: unknown): void => {
      if (!isRecord(d)) return;
      const item = d.item;
      if (!isRecord(item) || !item.id) return;
      const isSelf = !!d.actorSocketId && d.actorSocketId === socket.id;
      const isScrap = String(item.type || '').startsWith('scrap_') || (isString(item.id) && physicsRef.current?.props?.has(item.id));
      if (isScrap) {
        // Ghost throws fly through the item-thrown event; only settled transforms are applied here
        if (isSelf || d.impulse) return;
        physicsRef.current?.applyWorldItem(d.action, item);
        return;
      }
      itemSystemRef.current?.applyWorldItem(d.action, item, isSelf);
    };

    const handleShelfUpdated = (d: unknown): void => applyEquipmentShelf(isRecord(d) ? d.shelf : undefined);

    // Server refused the join (session_full / session_limit): stop syncing movement and offer to leave
    const handleServerError = (d: unknown): void => {
      setSessionRefusal((isRecord(d) && optionalString(d.reason)) || 'unknown');
      if (controllerRef.current) controllerRef.current.networkSuspended = true;
      controllerRef.current?.unlock();
    };

    const handleVerdictRejected = (d: unknown): void => {
      setVerdictNotice((isRecord(d) && optionalString(d.reason)) || 'unknown');
    };

    const handleTick = (tickData: unknown): void => {
      if (!isRecord(tickData)) return;
      const selfId = socket.id;

      if (typeof tickData.graceTimer === 'number') setGracePeriodSeconds(tickData.graceTimer);
      if (typeof tickData.gateOpen === 'boolean') setGateOpen(tickData.gateOpen);

      // Hunt state
      const g = isRecord(tickData.ghost) ? tickData.ghost : null;
      const isHunting = !!(g?.huntActive || g?.state === 'ACTIVE_HUNT_CHASE' || g?.state === 'HUNT_INITIATION');
      if (isHunting !== huntRef.current) {
        setHunt(isHunting);
        engineRef.current?.setHuntIntensity(isHunting ? 1.0 : 0.0);
        engineRef.current?.setFlashlightFlicker(isHunting, 0.9);
      }

      // Ghost entity
      if (g && ghostRef.current) {
        ghostRef.current.wantVisible = !!g.visible;
        if (Array.isArray(g.position)) ghostRef.current.target.set(Number(g.position[0]), 0, Number(g.position[2]));
      }

      // Breaker state is handled by ElectricalSystem via its own socket events; tick keeps HUD honest
      const tickBreaker = (isRecord(tickData.breaker) ? tickData.breaker.isOn : undefined) ?? tickData.breakerOn;
      if (typeof tickBreaker === 'boolean' && electricalRef.current && electricalRef.current.isOn !== tickBreaker) {
        electricalRef.current.syncFromServer({
          breakerOn: tickBreaker,
          activeLights: Array.isArray(tickData.activeLights) ? tickData.activeLights.filter(isString) : undefined
        });
      }

      // Remote avatars (local player excluded by socket id)
      if (Array.isArray(tickData.players)) {
        const players = parsePlayers(tickData.players);
        playersRef.current = players;
        avatarsRef.current?.updateFromTick(players, selfId ?? null);

        // Hidden players: their avatar is inside the cabinet (not visible) and the spot is taken
        const hiddenNow = new Set<string>();
        for (const p of players) {
          if (p.id === selfId) continue;
          const hidden = !!p.hidingSpotId && p.alive !== false;
          if (hidden && p.id && p.hidingSpotId) {
            hiddenNow.add(p.id);
            const spot = mapCollidersRef.current?.getHidingSpot?.(p.hidingSpotId);
            if (spot && !spot.isOccupied) { spot.enter(p.id); spot.close(); }
          }
          const av = p.id === undefined ? undefined : avatarsRef.current?.avatars?.get(p.id);
          if (av?.rootGroup) av.rootGroup.visible = !hidden;
        }
        for (const id of hiddenPeersRef.current) {
          if (id !== selfId && !hiddenNow.has(id)) {
            hiddenPeersRef.current.delete(id);
            for (const spot of mapCollidersRef.current?.hidingSpots?.values?.() || []) {
              if (spot.occupantId === id) { spot.exit(); spot.open(); }
            }
          }
        }
        hiddenNow.forEach((id) => hiddenPeersRef.current.add(id));

        const mates = players
          .filter((p) => p.id !== selfId)
          .map((p) => ({ id: p.id, username: p.username || 'Kutató', sanity: p.sanity, alive: p.alive, isSpeaking: !!p.isSpeaking, hidden: p.id !== undefined && hiddenNow.has(p.id) }));
        setTeammates(mates);
        const meSpeaking = !!players.find((p) => p.id === selfId)?.isSpeaking;
        setIsSpeaking((prev) => (prev === meSpeaking ? prev : meSpeaking));
        const living = players.filter((p) => p.alive && p.id !== selfId);
        setAliveTeammates((prev) => (prev.length === living.length && prev.every((p, i) => p.id === living[i]?.id) ? prev : living));

        const me = players.find((p) => p.id === selfId);
        if (me) {
          if (typeof me.sanity === 'number' && me.sanity !== sanityRef.current) setSanityBoth(me.sanity);
          if (me.alive === false && aliveRef.current) {
            aliveRef.current = false;
            setIsAlive(false);
            controllerRef.current?.exitHidingSpot?.();
            controllerRef.current?.unlock();
          }
        }
      }
    };

    const handleHuntStarted = (): void => {
      setHunt(true);
      engineRef.current?.setHuntIntensity(1.0);
      audioRef.current?.playHuntSiren?.();
    };

    const handleHuntOver = (): void => {
      setHunt(false);
      engineRef.current?.setHuntIntensity(0.0);
      engineRef.current?.setFlashlightFlicker(false, 0.0);
    };

    const handleHuntCancelled = (): void => handleHuntOver();

    const handleJesusBurned = (data: unknown): void => {
      const itemSys = itemSystemRef.current;
      if (!itemSys) return;
      const chargesRemaining = isRecord(data) ? data.chargesRemaining : undefined;
      const inv = itemSys.getInventory().map((it) => (it && it.type === 'mobile_jesus'
        ? { ...it, charges: num(chargesRemaining) ?? it.charges }
        : it));
      itemSys.setInventory(inv);
    };

    // Server consumed an item (smudge, pálinka...): clear slots the server reports empty,
    // keep local item objects (they carry HUD name/icon) for the rest.
    const handleInventoryUpdated = (d: unknown): void => {
      const itemSys = itemSystemRef.current;
      const serverInv = isRecord(d) ? d.inventory : undefined;
      if (!itemSys || !Array.isArray(serverInv)) return;
      const local = itemSys.getInventory();
      const next = local.map((it, i) => (it && !serverInv[i] ? null : it));
      if (next.some((it, i) => it !== local[i])) itemSys.setInventory(next);
    };

    const handlePlayerKilled = (data: unknown): void => {
      const r = isRecord(data) ? data : undefined;
      const victim = r?.playerId || r?.victimId;
      if (victim === socket.id && aliveRef.current) {
        aliveRef.current = false;
        setIsAlive(false);
        controllerRef.current?.exitHidingSpot?.();
        controllerRef.current?.unlock();
        audioRef.current?.playJumpscare?.();
      }
    };

    const handleDoor = (d: unknown): void => {
      if (!isRecord(d)) return;
      const doorId = optionalString(d.doorId);
      if (doorId) applyServerDoor(doorId, d.open);
    };
    const handleGate = (d: unknown): void => {
      if (!isRecord(d)) return;
      applyServerDoor('gate_depot_main', !!d.open);
      setGateOpen(true);
      if (typeof d.graceRemaining === 'number') setGracePeriodSeconds(d.graceRemaining);
    };

    const handleSanity = (d: unknown): void => {
      if (isRecord(d) && d.socketId === socket.id && typeof d.sanity === 'number') setSanityBoth(d.sanity);
    };

    const handleTemperature = (d: unknown): void => {
      if (!isRecord(d) || typeof d.temperature !== 'number') return;
      setAmbientTemp(d.temperature);
      itemSystemRef.current?.applyTemperatureReading(d.temperature);
      engineRef.current?.setAmbientTemperature(d.temperature);
    };

    const handleEmf = (d: unknown): void => {
      const r = isRecord(d) ? d : {};
      const reading: { level?: number; x?: number | null; z?: number | null } = {};
      const level = num(r.level);
      if (level !== undefined) reading.level = level;
      if (typeof r.x === 'number' || r.x === null) reading.x = r.x;
      if (typeof r.z === 'number' || r.z === null) reading.z = r.z;
      itemSystemRef.current?.applyEmfReading(reading);
    };

    const handleSfx = (d: unknown): void => {
      const sound = isRecord(d) ? d.sound : undefined;
      if (sound) audioRef.current?.playSpatialSFX?.(sound, new THREE.Vector3(8, 1.4, 5));
    };

    const handlePhotoTaken = (d: unknown): void => {
      const p = parsePhoto(d);
      if (p) setPhotos((prev) => [...prev.slice(-9), p]);
    };
    const handleVerdict = (d: unknown): void => {
      const r = parseMatchResult(d);
      setMatchResult(r ? { ...r, correct: Boolean(r.correct) } : null);
      controllerRef.current?.unlock();
    };

    // Match ended without a verdict (e.g. every investigator died): show it to everyone
    const handleConcluded = (d: unknown): void => {
      if (!d) return;
      const r = parseMatchResult(d) ?? {};
      const correct = r.correct;
      setMatchResult((prev) => prev || (typeof correct === 'boolean'
        ? { ...r, correct }
        : { correct: false, concluded: true, reason: r.reason || 'concluded', ...r }));
      controllerRef.current?.unlock();
    };

    // Another player started a new match: follow into the fresh session
    const handleSessionReset = (): void => {
      resetRef.current?.();
      socket.emit('phobia:init-session', initPayload({ lobby: true }));
    };

    const handlers: Record<string, (data: unknown) => void> = {
      'phobia:match-concluded': handleConcluded,
      'phobia:session-reset': handleSessionReset,
      connect: handleConnect,
      'phobia:session-init': handleSessionInit,
      'phobia:session-updated': handleSessionUpdated,
      'phobia:settings-updated': handleSettingsUpdated,
      'phobia:player-joined': handlePlayerJoined,
      'phobia:player-left': handlePlayerLeft,
      'phobia:objectives-updated': handleObjectives,
      'phobia:player-hide': handlePlayerHide,
      'phobia:world-item-updated': handleWorldItem,
      'phobia:error': handleServerError,
      'phobia:verdict-rejected': handleVerdictRejected,
      'phobia:equipment-shelf-updated': handleShelfUpdated,
      'phobia:tick': handleTick,
      'phobia:hunt-started': handleHuntStarted,
      'phobia:hunt-ended': handleHuntOver,
      'phobia:hunt-cancelled': handleHuntCancelled,
      'phobia:jesus-burned': handleJesusBurned,
      'phobia:inventory-updated': handleInventoryUpdated,
      'phobia:player-killed': handlePlayerKilled,
      'phobia:door-updated': handleDoor,
      'phobia:gate-updated': handleGate,
      'phobia:sanity-updated': handleSanity,
      'phobia:temperature-reading': handleTemperature,
      'phobia:emf-reading': handleEmf,
      'phobia:sfx': handleSfx,
      'phobia:photo-taken': handlePhotoTaken,
      'phobia:verdict-result': handleVerdict
    };
    for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);

    // Periodic authoritative temperature probe for the HUD thermometer / freezing breath
    const tempTimer = setInterval(() => {
      const c = controllerRef.current;
      if (!c || !aliveRef.current || document.hidden) return;
      socket.emit('phobia:get-temperature', {
        roomId: channelId,
        position: [c.position.x, c.position.y, c.position.z]
      });
    }, 2500);

    return () => {
      clearInterval(tempTimer);
      for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn);
      socket.emit('phobia:leave-session', { roomId: channelId, channelId });
    };
  }, [socket, channelId, initPayload, applySessionSnapshot, applySessionMeta, applyObjectives, applyEquipmentShelf, applyServerDoor, setHunt, setSanityBoth]);

  // 3. KEYBOARD EVENT LISTENERS (J journal, T flashlight, V walkie-talkie, pointer lock tracking)
  const toggleJournal = useCallback((force?: boolean) => {
    const next = typeof force === 'boolean' ? force : !journalRef.current;
    journalRef.current = next;
    setJournalOpen(next);
    if (next && document.pointerLockElement) document.exitPointerLock();
  }, []);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent): boolean => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') || Boolean(target?.isContentEditable);
    };

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isTyping(e)) return;
      if (e.code === 'KeyJ') {
        e.preventDefault();
        toggleJournal();
      } else if (e.code === 'Escape' && journalRef.current) {
        toggleJournal(false);
      } else if (e.code === 'KeyT' && controllerRef.current?.isLocked && aliveRef.current) {
        controllerRef.current.toggleFlashlight();
      } else if (e.code === 'KeyV' && !e.repeat && controllerRef.current?.isLocked && aliveRef.current) {
        audioRef.current?.setWalkieTalkieActive?.(true);
        audioRef.current?.playRadioSquelch?.('start');
      }
    };
    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'KeyV') {
        audioRef.current?.setWalkieTalkieActive?.(false);
        audioRef.current?.playRadioSquelch?.('end');
      }
    };

    const handlePointerLockChange = (): void => {
      const locked = !!document.pointerLockElement && document.pointerLockElement === engineRef.current?.canvas;
      setIsLocked(locked);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [toggleJournal]);

  // Click on the 3D view / pause overlay (re)captures the mouse
  const handleCanvasClick = useCallback(() => {
    const targetCanvas = engineRef.current?.canvas;
    if (!journalRef.current && targetCanvas && !document.pointerLockElement && aliveRef.current) {
      targetCanvas.requestPointerLock?.();
      audioRef.current?.context?.resume?.();
      setHasStarted(true);
    }
  }, []);

  // Toggle Evidence in Journal
  const handleToggleEvidence = useCallback((evidenceId: string, nextState: EvidenceMark) => {
    setEvidenceState((prev) => ({ ...prev, [evidenceId]: nextState }));
  }, []);

  // Submit Final Verdict
  const handleSubmitVerdict = useCallback(
    (ghostName: string) => {
      if (!ghostName) return;
      if (socket && channelId) {
        socket.emit('phobia:submit-verdict', {
          roomId: channelId,
          channelId,
          ghostGuess: ghostName,
          ghostName,
          photosCount: photos.length,
          isAlive
        });
      } else {
        setMatchResult({ correct: true, actualGhost: ghostName, payoutFt: isAlive ? 4200 : 2100 });
      }
    },
    [socket, channelId, photos.length, isAlive]
  );

  // Starts a brand new investigation after a concluded match
  const resetLocalMatchState = useCallback(() => {
    setMatchResult(null);
    setEvidenceState(EMPTY_EVIDENCE);
    setPhotos([]);
    setSelectedGhost('');
    applyObjectives(null, []);
    setHunt(false);
    setSanityBoth(100);
    setGateOpen(false);
    aliveRef.current = true;
    setIsAlive(true);
    controllerRef.current?.exitHidingSpot?.();
    setSessionStatus(null);
    toggleJournal(false);
    setHasStarted(false);
    engineRef.current?.setHuntIntensity(0);
    engineRef.current?.setFlashlightFlicker(false, 0);
    const c = controllerRef.current;
    if (c) {
      c.position.set(-4.0, 0.0, -15.0);
      c.setLookAngles(Math.PI, 0);
    }
    itemSystemRef.current?.setInventory([null, null, null]);
  }, [setHunt, setSanityBoth, toggleJournal, applyObjectives]);

  const handleNewMatch = useCallback(() => {
    if (!socket || !channelId) return;
    socket.emit('phobia:init-session', initPayload({ newMatch: true, lobby: true }));
    resetLocalMatchState();
  }, [socket, channelId, initPayload, resetLocalMatchState]);

  // Kept current so socket handlers (registered once) always call the latest reset
  useEffect(() => { resetRef.current = resetLocalMatchState; }, [resetLocalMatchState]);

  const handleCycleSpectator = useCallback(() => {
    spectatorIdxRef.current += 1;
    setSpectatorIdx(spectatorIdxRef.current);
  }, []);

  // Keep refs mirrored
  useEffect(() => { aliveRef.current = isAlive; }, [isAlive]);
  useEffect(() => {
    if (!verdictNotice) return undefined;
    const t = setTimeout(() => setVerdictNotice(null), 5000);
    return () => clearTimeout(t);
  }, [verdictNotice]);
  useEffect(() => { journalRef.current = journalOpen; }, [journalOpen]);

  const inLobby = sessionStatus === null || sessionStatus === 'lobby';

  // The controller ignores input while the lobby covers the world
  useEffect(() => {
    if (controllerRef.current) controllerRef.current.enabled = !inLobby;
    if (inLobby) controllerRef.current?.unlock?.();
  }, [inLobby, isReady]);

  const handleChangeSettings = useCallback((next: PhobiaSettings) => {
    if (!socket || !channelId) return;
    setSettings((prev) => ({ ...prev, ...next }));
    socket.emit('phobia:update-settings', { roomId: channelId, channelId, settings: next });
  }, [socket, channelId]);

  const handleStartMatch = useCallback(() => {
    if (!socket || !channelId) return;
    socket.emit('phobia:start-match', { roomId: channelId, channelId });
  }, [socket, channelId]);

  // Proximity voice: listener = our camera, peers = tick positions (walls muffle, dead players are not heard)
  usePhobiaVoice({
    setPeerSpatial,
    enabled: !!setPeerSpatial && !inLobby,
    getListener: () => {
      const c = controllerRef.current;
      if (!c) return null;
      return { x: c.position.x, y: c.position.y + c.currentEyeHeight, z: c.position.z, yaw: c.yaw, alive: aliveRef.current };
    },
    getPeers: () => {
      const c = controllerRef.current;
      const colliders = mapCollidersRef.current;
      if (!c) return [];
      const from = new THREE.Vector3(c.position.x, c.position.y + c.currentEyeHeight, c.position.z);
      const to = new THREE.Vector3();
      const out: VoicePeer[] = [];
      for (const p of playersRef.current) {
        if (!p || !p.id || p.id === socket?.id) continue;
        to.set(p.x || 0, (p.y || 0) + 1.5, p.z || 0);
        const hidden = !!p.hidingSpotId || hiddenPeersRef.current.has(p.id);
        let occluded = hidden || c.isHiding; // inside a cabinet (either side) is muffled
        if (!occluded && colliders?.checkRaycastOcclusion) occluded = !!colliders.checkRaycastOcclusion(from, to).occluded;
        const hasRadio = p.hasRadio === true
          || (Array.isArray(p.inventory) && p.inventory.some((it) => {
            const r = isRecord(it) ? it : undefined;
            return /walkie/i.test(optionalString(r?.type) || optionalString(r?.id) || '');
          }));
        out.push({ socketId: p.id, x: to.x, y: to.y, z: to.z, alive: p.alive !== false, hasRadio, occluded });
      }
      return out;
    }
  });

  const handleRetry = useCallback(() => {
    setInitError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  const showPause = isReady && isAlive && !isLocked && !journalOpen && !matchResult && !inLobby;
  const spectatorTarget = aliveTeammates.length ? aliveTeammates[spectatorIdx % aliveTeammates.length] : null;

  if (sessionRefusal) {
    const refusalTexts: Readonly<Record<string, string | undefined>> = {
      session_full: 'A munkamenet megtelt, nem tudsz csatlakozni. Próbáld újra később, vagy indíts másik szobát.',
      session_limit: 'Elérted a párhuzamos munkamenetek korlátját a szerveren. Várj, amíg egy másik nyomozás véget ér.'
    };
    const refusalText = refusalTexts[sessionRefusal] || 'A szerver elutasította a csatlakozást.';
    return (
      <div className="relative flex-1 w-full h-full flex flex-col items-center justify-center bg-[#06070e] text-white p-6 select-none">
        <div className="max-w-md p-6 rounded-2xl bg-gray-900/90 border border-amber-500/40 shadow-2xl backdrop-blur-md flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-100 mb-2">Nem tudsz csatlakozni a nyomozáshoz</h2>
          <p className="text-xs text-gray-400 mb-5 leading-relaxed">{refusalText}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition"
          >
            Vissza a szobába
          </button>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="relative flex-1 w-full h-full flex flex-col items-center justify-center bg-[#06070e] text-white p-6 select-none">
        <div className="max-w-md p-6 rounded-2xl bg-gray-900/90 border border-red-500/40 shadow-2xl backdrop-blur-md flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-100 mb-2">Nem sikerült elindítani a 3D motort</h2>
          <p className="text-xs text-gray-400 mb-5 leading-relaxed">{initError}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Újrapróbálás</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition"
            >
              Vissza a szobába
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full min-h-0 bg-[#06070e] select-none overflow-hidden"
    >
      {verdictNotice && (
        <div role="alert" className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] max-w-sm px-4 py-3 rounded-xl bg-gray-900/95 border border-amber-500/40 shadow-2xl text-xs text-amber-200 text-center">
          {verdictNotice === 'guess_too_short'
            ? 'A tipped túl rövid, adj meg egy érvényes szellemnevet a végső ítélethez.'
            : 'A szerver elutasította az ítéletet. Próbáld újra.'}
        </div>
      )}

      {/* 1. 3D WebGL canvas mount (the engine appends its own <canvas>) */}
      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 w-full h-full cursor-crosshair [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:block [&>canvas]:outline-none"
      />

      {/* 3. Start / Pause overlay: (re)captures the mouse */}
      {showPause && (
        <div
          onClick={handleCanvasClick}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm cursor-pointer select-none transition-all"
        >
          <div className="text-center p-8 rounded-3xl bg-gray-950/90 border border-purple-500/30 shadow-2xl max-w-lg">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-purple-400 to-indigo-400 mb-2 tracking-wider">
              {hasStarted ? 'SZÜNET' : 'MISKOLCPHOBIA 3D'}
            </h1>
            <p className="text-gray-400 text-xs mb-6 tracking-wide">
              MÉH Telep Paranormális Helyszínelés
            </p>

            <div className="grid grid-cols-2 gap-3 text-left mb-6 text-xs text-gray-300 bg-black/50 p-4 rounded-xl border border-gray-800">
              <div><span className="text-purple-400 font-bold">W, A, S, D:</span> Mozgás</div>
              <div><span className="text-purple-400 font-bold">Shift:</span> Futás (Stamina)</div>
              <div><span className="text-purple-400 font-bold">E:</span> Használat / felvétel</div>
              <div><span className="text-purple-400 font-bold">Bal klikk:</span> Tárgy használata</div>
              <div><span className="text-purple-400 font-bold">1, 2, 3 / Görgő:</span> Tárhely</div>
              <div><span className="text-purple-400 font-bold">G:</span> Tárgy eldobása</div>
              <div><span className="text-purple-400 font-bold">F / T:</span> Zseblámpa ki/be</div>
              <div><span className="text-purple-400 font-bold">V (nyomva):</span> Walkie-Talkie</div>
              <div><span className="text-purple-400 font-bold">J:</span> Nyomozói Napló</div>
              <div><span className="text-purple-400 font-bold">C:</span> Guggolás</div>
            </div>

            <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-bold text-sm shadow-lg hover:from-purple-600 hover:to-indigo-600 transition">
              <Play className="w-4 h-4 fill-current" />
              <span>{hasStarted ? 'Kattints a folytatáshoz' : 'Kattints a kezdéshez (Egér zárolása)'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Inside a locker / trunk: door slit vignette */}
      {hiddenSpotName && isAlive && !inLobby && <HideOverlay spotName={hiddenSpotName} />}

      {/* Lobby: shown until the host starts the match (or when there is no session yet) */}
      {inLobby && (
        <LobbyScreen
          players={lobbyPlayers}
          hostSocketId={hostSocketId}
          selfId={selfId}
          settings={settings}
          connecting={sessionStatus === null}
          onChangeSettings={handleChangeSettings}
          onStart={handleStartMatch}
          onClose={onClose}
        />
      )}

      {/* 4. Alive Player HUD / Spectator overlay */}
      {inLobby ? null : isAlive ? (
        <PhobiaHUD
          stamina={stamina}
          sanity={sanity}
          inventory={inventory}
          activeSlot={activeSlot}
          crosshairPrompt={crosshairPrompt}
          huntActive={huntActive}
          gracePeriodSeconds={gateOpen ? gracePeriodSeconds : 0}
          ambientTemp={ambientTemp}
          breakerOn={breakerOn}
          activeLightsCount={activeLightsCount}
          maxLightsCount={6}
          onOpenJournal={() => toggleJournal(true)}
          onExit={onClose}
          hasStarted={hasStarted}
          isLocked={isLocked}
          teammates={teammates}
          sideTasks={sideTasks}
          primaryObjective={primaryObjective}
          isSpeaking={isSpeaking}
        />
      ) : (
        <SpectatorView
          aliveTeammates={aliveTeammates}
          spectatorTarget={spectatorTarget}
          onCycleTarget={handleCycleSpectator}
        />
      )}

      {/* Pre-gate hint */}
      {isAlive && isReady && !gateOpen && !matchResult && !inLobby && !hiddenSpotName && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-4 py-2 rounded-xl bg-black/70 border border-purple-500/40 text-[11px] text-purple-200 backdrop-blur-md">
          Szerelj fel a teherautó polcáról, majd nyomd meg a <strong>kapunyitó gombot</strong> – a türelmi idő ekkor indul.
        </div>
      )}

      {/* Spectator cycle (HUD is pointer-events-none, so offer a real button) */}
      {!inLobby && !isAlive && !matchResult && aliveTeammates.length > 1 && (
        <button
          onClick={handleCycleSpectator}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-cyan-900/70 hover:bg-cyan-800 border border-cyan-500/50 text-cyan-100 text-xs font-bold backdrop-blur-md"
        >
          Következő játékos
        </button>
      )}

      {/* 5. Match finished: start a new investigation */}
      {matchResult && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/85 border border-purple-500/50 shadow-2xl backdrop-blur-md">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-gray-200">
            {matchResult.concluded && matchResult.reason === 'all_players_killed'
              ? 'Minden nyomozó elesett'
              : matchResult.correct ? 'Sikeres nyomozás' : matchResult.concluded ? 'A küldetés véget ért' : 'Hibás tipp'}
            {typeof (matchResult.rewardFt ?? matchResult.payoutFt) === 'number' ? ` – ${matchResult.rewardFt ?? matchResult.payoutFt} Ft` : ''}
          </span>
          <button
            onClick={handleNewMatch}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Új küldetés
          </button>
        </div>
      )}

      {/* 6. Journal & Deduction Modal ('J' key) */}
      <JournalModal
        isOpen={journalOpen}
        onClose={() => toggleJournal(false)}
        evidenceState={evidenceState}
        onToggleEvidence={handleToggleEvidence}
        photos={photos}
        selectedGhost={selectedGhost}
        onSelectGhost={setSelectedGhost}
        onSubmitVerdict={handleSubmitVerdict}
        matchResult={matchResult}
        sideTasks={sideTasks}
        evidenceCount={settings.evidenceCount}
        isAlive={isAlive}
        onNewMatch={handleNewMatch}
      />
    </div>
  );
}
