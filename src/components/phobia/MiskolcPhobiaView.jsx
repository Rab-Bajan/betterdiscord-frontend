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

import { PhobiaEngine } from './engine/PhobiaEngine.js';
import { PhobiaController } from './engine/PhobiaController.js';
import { PhobiaAvatars } from './engine/PhobiaAvatars.js';
import { ScrapYardMap } from './map/ScrapYardMap.js';
import { TruckEnvironment } from './map/TruckEnvironment.js';
import { MapColliders } from './map/MapColliders.js';
import { ElectricalSystem } from './systems/ElectricalSystem.js';
import { PhobiaAudio } from './audio/PhobiaAudio.js';
import { ItemSystem } from './items/ItemSystem.js';
import { normalizeToolType } from './items/ToolDefinitions.js';

import PhobiaHUD from './ui/PhobiaHUD.jsx';
import JournalModal, { EVIDENCE_TYPES, GHOST_ARCHETYPES } from './ui/JournalModal.jsx';
import SpectatorView from './ui/SpectatorView.jsx';

// --- Client <-> server id mapping ---------------------------------------------------------
// Hinged doors on the map use local ids, the authoritative server uses its own door table.
const CLIENT_TO_SERVER_DOOR = {
  door_mazsahaz: 'door_mazsahaz_entry',
  door_hangar_main: 'door_hangar_main',
  main_gate_left: 'gate_depot_main',
  main_gate_right: 'gate_depot_main'
};
const SERVER_TO_CLIENT_DOORS = {
  door_mazsahaz_entry: ['door_mazsahaz'],
  door_hangar_main: ['door_hangar_main'],
  gate_depot_main: ['main_gate_left', 'main_gate_right']
};

// Server light ids that have no fixture on the ScrapYardMap: the client builds a pole lamp for each.
const EXTRA_LIGHTS = [
  { id: 'light_mazsahaz_hall', name: 'Mázsaház Folyosó Lámpa', x: 3.0, y: 2.8, z: 5.0, color: 0xffcc77, intensity: 2.0, distance: 10 },
  { id: 'light_gate_floodlight', name: 'Főkapu Reflektor', x: 0.0, y: 4.0, z: -4.0, color: 0xddeeff, intensity: 2.6, distance: 16 },
  { id: 'light_yard_floodlight1', name: 'Udvar Reflektor 1', x: 12.0, y: 6.0, z: 10.0, color: 0xddff99, intensity: 3.0, distance: 20 },
  { id: 'light_yard_floodlight2', name: 'Udvar Reflektor 2', x: 18.0, y: 6.0, z: 30.0, color: 0xddff99, intensity: 3.0, distance: 20 }
];
const YARD_SWITCH_POS = [-1.2, 1.3, -10.0];

const DEFAULT_SIDE_TASKS = [
  { id: 'freezing_temp', title: 'Mérj 0.0°C alatti fagypontot a hőmérővel', reward: 500, completed: false },
  { id: 'emf_5', title: 'Észlelj 5-ös szintű EMF paranormalitást', reward: 500, completed: false },
  { id: 'crucifix_block', title: 'Akadályozz meg egy vadászatot Mobil Jézussal', reward: 750, completed: false }
];

const EMPTY_EVIDENCE = {
  emf_5: 0,
  spirit_box: 0,
  fingerprints: 0,
  ghost_orbs: 0,
  ghost_writing: 0,
  freezing_temps: 0,
  dots: 0
};

/** Builds the lamp-pole fixtures for server lights the map does not model, plus a switch for them. */
function buildExtraFixtures(map, electrical) {
  const group = new THREE.Group();
  group.name = 'ExtraYardLights';
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7, metalness: 0.6 });
  const fixtureIds = [];

  for (const def of EXTRA_LIGHTS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, def.y, 8), poleMat);
    pole.position.set(def.x, def.y / 2, def.z);
    group.add(pole);

    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: def.color, emissiveIntensity: 0.0, roughness: 0.4 })
    );
    lamp.position.set(def.x, def.y, def.z);
    group.add(lamp);

    const light = new THREE.PointLight(def.color, def.intensity, def.distance, 2.0);
    light.position.set(def.x, def.y - 0.3, def.z);
    light.visible = false;
    group.add(light);
    fixtureIds.push({ def, light, lamp });
  }

  // Free-standing switch post near the truck bound to all the extra yard lights
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.18), poleMat);
  post.position.set(YARD_SWITCH_POS[0], 0.75, YARD_SWITCH_POS[2] - 0.12);
  group.add(post);
  const switchGroup = map.buildWallSwitch(group, 'switch_yard', YARD_SWITCH_POS[0], YARD_SWITCH_POS[1], YARD_SWITCH_POS[2], 0);

  for (const { def, light, lamp } of fixtureIds) {
    electrical.registerFixture({
      id: def.id,
      name: def.name,
      light,
      fixtureMesh: lamp,
      switchMesh: switchGroup,
      isOn: false,
      intensity: def.intensity,
      position: new THREE.Vector3(def.x, def.y, def.z)
    });
  }
  map.group.add(group);
  return group;
}

/** Simple translucent humanoid used for the ghost entity (dissolves in/out with the tick). */
function buildGhostEntity(engine) {
  const material = engine.createGhostMaterial();
  const group = new THREE.Group();
  group.name = 'GhostEntity';
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 6, 14), material);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), material);
  head.position.y = 1.78;
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 14, 1, true), material);
  skirt.position.y = 0.45;
  skirt.rotation.x = Math.PI;
  group.add(body, head, skirt);
  group.visible = false;
  const glow = new THREE.PointLight(0x61a6fa, 0.0, 9, 2);
  glow.position.y = 1.2;
  group.add(glow);
  engine.ghostGroup.add(group);
  return { group, material, glow, target: new THREE.Vector3(5, 0, 8), dissolve: 1.0, wantVisible: false, yaw: 0 };
}

export default function MiskolcPhobiaView({
  socket,
  channelId,
  currentUser,
  session,
  onClose
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null); // mount <div>: the engine owns the actual <canvas> inside it

  // References to core 3D systems
  const engineRef = useRef(null);
  const controllerRef = useRef(null);
  const mapCollidersRef = useRef(null);
  const truckRef = useRef(null);
  const mapRef = useRef(null);
  const electricalRef = useRef(null);
  const avatarsRef = useRef(null);
  const audioRef = useRef(null);
  const itemSystemRef = useRef(null);
  const ghostRef = useRef(null);
  const switchLightsRef = useRef(new Map()); // switchId -> lightId[]

  // Mutable mirrors of React state, read from the 60 fps update hook / socket handlers (no stale closures)
  const huntRef = useRef(false);
  const sanityRef = useRef(100);
  const aliveRef = useRef(true);
  const journalRef = useRef(false);
  const playersRef = useRef([]);
  const spectatorIdxRef = useRef(0);
  const heartbeatOnRef = useRef(false);

  // Game UI State
  const [initError, setInitError] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [sessionRefusal, setSessionRefusal] = useState(null); // 'session_full' | 'session_limit' | other server refusal code
  const [verdictNotice, setVerdictNotice] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [isAlive, setIsAlive] = useState(true);

  // Stats & HUD
  const [stamina, setStamina] = useState(100);
  const [sanity, setSanity] = useState(100);
  const [inventory, setInventory] = useState([null, null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [controllerPrompt, setControllerPrompt] = useState(null);
  const [itemPrompt, setItemPrompt] = useState(null);
  const [huntActive, setHuntActive] = useState(false);
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [ambientTemp, setAmbientTemp] = useState(15.0);
  const [breakerOn, setBreakerOn] = useState(true);
  const [activeLightsCount, setActiveLightsCount] = useState(0);

  // Evidence, Photos & Verdict
  const [evidenceState, setEvidenceState] = useState(EMPTY_EVIDENCE);
  const [photos, setPhotos] = useState([]);
  const [selectedGhost, setSelectedGhost] = useState('');
  const [matchResult, setMatchResult] = useState(null);
  const resetRef = useRef(null);
  const [aliveTeammates, setAliveTeammates] = useState([]);
  const [spectatorIdx, setSpectatorIdx] = useState(0);
  const [teammates, setTeammates] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sideTasks, setSideTasks] = useState(DEFAULT_SIDE_TASKS);

  const setHunt = useCallback((v) => {
    huntRef.current = v;
    setHuntActive(v);
  }, []);
  const setSanityBoth = useCallback((v) => {
    sanityRef.current = v;
    setSanity(v);
  }, []);
  const completeTask = useCallback((id) => {
    setSideTasks((prev) => (prev.some((t) => t.id === id && !t.completed)
      ? prev.map((t) => (t.id === id ? { ...t, completed: true } : t))
      : prev));
  }, []);

  const crosshairPrompt = itemPrompt || controllerPrompt;

  // 1. INITIALIZE THREE.JS ENGINE & GAME WORLD
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    setInitError(null);
    setIsReady(false);

    let engine = null;
    let itemSys = null;
    let controller = null;
    let avatars = null;
    let electrical = null;
    let audio = null;

    try {
      // 1. Core WebGL Engine (creates and owns its <canvas> inside the mount div)
      engine = new PhobiaEngine({ mount: canvasRef.current, container: containerRef.current });
      engineRef.current = engine;

      // 2. Map Collision System
      const mapColliders = new MapColliders();
      mapCollidersRef.current = mapColliders;

      // 3. Audio Spatializer
      try {
        audio = new PhobiaAudio({ camera: engine.camera, scene: engine.scene });
        audioRef.current = audio;
      } catch (err) {
        console.warn('PhobiaAudio init error:', err);
      }

      // 4. Scrap Yard Map (its group must be part of the scene graph!)
      const map = new ScrapYardMap({ scene: engine.scene, mapColliders, renderer: engine.renderer });
      mapRef.current = map;
      engine.worldMeshGroup.add(map.group);

      // 5. Surveillance Truck Environment
      const truck = new TruckEnvironment({
        scene: engine.scene,
        mapColliders,
        onGateOpen: () => {
          if (socket && channelId) socket.emit('phobia:gate-toggle', { roomId: channelId, channelId });
        },
        onCameraCycle: () => {}
      });
      truckRef.current = truck;
      engine.worldMeshGroup.add(truck.group);
      for (const col of truck.colliders) mapColliders.addCollider(col);

      // 6. Master Electrical System (+ extra pole lamps for server lights the map lacks)
      electrical = new ElectricalSystem({
        scene: engine.scene,
        map,
        socket,
        roomId: channelId,
        onPlaySound: (sfxKey, pos) => {
          if (audio && typeof audio.playSpatialSFX === 'function') audio.playSpatialSFX(sfxKey, pos);
        }
      });
      electricalRef.current = electrical;
      buildExtraFixtures(map, electrical);
      // Server starts with every lamp off and the breaker on
      electrical.syncFromServer({ breakerOn: true, activeLights: [] });

      // switchId -> every light id bound to that physical wall switch
      const switchLights = new Map();
      electrical.fixtures.forEach((fix, id) => {
        fix.switchMesh?.traverse((o) => {
          const sid = o.userData?.switchId;
          if (sid) {
            if (!switchLights.has(sid)) switchLights.set(sid, []);
            if (!switchLights.get(sid).includes(id)) switchLights.get(sid).push(id);
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
      controller = new PhobiaController({
        camera: engine.camera,
        domElement: engine.canvas,
        scene: engine.scene,
        mapColliders,
        socket,
        roomId: channelId,
        initialPosition: [-4.0, 0.0, -15.0],
        initialYaw: Math.PI, // face the yard gate from the truck
        manageInventory: false, // ItemSystem owns the inventory
        requireLock: true,
        interactiveProps,
        doorIdMap: CLIENT_TO_SERVER_DOOR,
        resolveSwitchLights: (u) => switchLights.get(u?.switchId) || [],
        onInteractionPrompt: (prompt, target) => {
          if (!prompt) {
            setControllerPrompt(null);
          } else {
            const text = (typeof prompt === 'string' ? prompt : prompt.action || 'Használat').replace(/^\[E\]\s*/, '');
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
          if (audio) audio.playFootstep(surface, controller.isSprinting);
        },
        onFlashlightToggle: () => {
          engine.toggleFlashlight();
          if (audio) audio.playFlashlightClick();
        }
      });
      controllerRef.current = controller;

      // 8. Item System (single owner of the 3-slot inventory)
      try {
        itemSys = new ItemSystem({
          engine,
          scene: engine.scene,
          camera: engine.camera,
          viewmodelGroup: engine.viewmodelGroup,
          interactivePropsGroup: engine.interactivePropsGroup,
          pickupTargets: [truck.group],
          socket,
          roomId: channelId,
          isEnabled: () => !!controllerRef.current?.isLocked && !journalRef.current && aliveRef.current,
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
      avatars = new PhobiaAvatars({ scene: engine.scene, localPlayerId: socket?.id || null });
      avatarsRef.current = avatars;

      // 10. Ghost entity
      const ghost = buildGhostEntity(engine);
      ghostRef.current = ghost;

      // 11. Frame Update Hook
      const updateFn = (delta, elapsed) => {
        controller.update(delta);
        truck.update(delta, elapsed);
        map.update(delta, elapsed);
        electrical.update(delta);
        avatars.update(delta);
        if (itemSys) {
          itemSys.update(delta, controller.isSprinting ? 5.0 : (controller.isMoving ? 3.0 : 0));
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
          g.group.position.x += dx * Math.min(1, 8 * delta);
          g.group.position.z += dz * Math.min(1, 8 * delta);
          g.group.position.y = 0.05 + Math.sin(elapsed * 2.0) * 0.08;
          g.group.rotation.y = g.yaw;
        }

        // Electrical HUD state (setState only on change)
        setBreakerOn((prev) => (prev !== electrical.isOn ? electrical.isOn : prev));
        const lightsCount = electrical.activeLights?.size || 0;
        setActiveLightsCount((prev) => (prev !== lightsCount ? lightsCount : prev));

        // Spectator camera: follow a living teammate after death
        if (!aliveRef.current) {
          const alive = playersRef.current.filter((p) => p.alive && p.id !== socket?.id);
          const target = alive[spectatorIdxRef.current % Math.max(1, alive.length)];
          if (target) {
            controller.position.set(target.x, target.y || 0, target.z);
            controller.setLookAngles(target.yaw || 0, target.pitch || 0);
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
      engine.registerUpdateHook(updateFn);

      if (import.meta.env?.DEV) {
        window.__phobia = { engine, controller, map, truck, electrical, avatars, itemSys, audio, ghost, THREE };
      }

      engine.start();
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize MiskolcPhobia 3D engine:', error);
      setInitError(error.message || 'Nem sikerült elindítani a 3D motort.');
    }

    return () => {
      // Dispose gameplay systems first, the engine (scene + renderer) last
      const safe = (fn) => { try { fn(); } catch (err) { console.warn('Error during Phobia cleanup:', err); } };
      safe(() => itemSys?.dispose?.());
      safe(() => controller?.dispose?.());
      safe(() => avatars?.dispose?.());
      safe(() => electrical?.dispose?.());
      safe(() => audio?.dispose?.());
      safe(() => engine?.destroy?.());
      engineRef.current = null;
      controllerRef.current = null;
      itemSystemRef.current = null;
      avatarsRef.current = null;
      electricalRef.current = null;
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
  const applyServerDoor = useCallback((serverDoorId, open) => {
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

  const initPayload = useCallback((extra = {}) => ({
    roomId: channelId,
    channelId,
    userId: currentUser?.id,
    username: currentUser?.username || 'Nyomozó',
    user: { id: currentUser?.id, username: currentUser?.username || 'Nyomozó' },
    ...extra
  }), [channelId, currentUser?.id, currentUser?.username]);

  // Mirrors the server equipment shelf on the truck rack: tools nobody holds are shown, taken ones hidden
  const applyEquipmentShelf = useCallback((shelf) => {
    const rack = truckRef.current?.rackItemMeshes;
    if (!Array.isArray(shelf) || !rack) return;
    const available = new Set(shelf.map((i) => normalizeToolType(i?.type)));
    for (const mesh of rack.values()) {
      mesh.visible = available.has(normalizeToolType(mesh.userData?.type));
    }
  }, []);

  // Applies a full server session snapshot (join, reconnect, new match)
  const applySessionSnapshot = useCallback((snap) => {
    if (!snap) return;
    electricalRef.current?.syncFromServer({ breakerOn: snap.breakerOn, activeLights: snap.activeLights });
    if (snap.doors) {
      for (const [id, d] of Object.entries(snap.doors)) applyServerDoor(id, d.open);
    }
    if (typeof snap.graceTimer === 'number') setGracePeriodSeconds(snap.graceTimer);
    if (typeof snap.gateOpen === 'boolean') setGateOpen(snap.gateOpen);
    applyEquipmentShelf(snap.equipmentShelf);
    if (Array.isArray(snap.droppedItems)) itemSystemRef.current?.syncServerItems(snap.droppedItems);
    if (Array.isArray(snap.sideTasks)) {
      setSideTasks(snap.sideTasks.map((t) => ({
        id: t.id,
        title: t.title || t.desc,
        reward: t.reward,
        completed: !!t.completed
      })));
    }
  }, [applyServerDoor, applyEquipmentShelf]);

  // 2. SOCKET.IO MULTIPLAYER SYNCHRONIZATION (12 Hz Authoritative Loop)
  useEffect(() => {
    if (!socket || !channelId) return undefined;

    socket.emit('phobia:init-session', initPayload());

    const handleConnect = () => socket.emit('phobia:init-session', initPayload());

    const handleSessionInit = (data) => applySessionSnapshot(data?.session);

    const handleShelfUpdated = (d) => applyEquipmentShelf(d?.shelf);

    // Server refused the join (session_full / session_limit): stop syncing movement and offer to leave
    const handleServerError = (d) => {
      setSessionRefusal(d?.reason || 'unknown');
      if (controllerRef.current) controllerRef.current.networkSuspended = true;
      controllerRef.current?.unlock();
    };

    const handleVerdictRejected = (d) => {
      setVerdictNotice(d?.reason || 'unknown');
    };

    const handleTick = (tickData) => {
      if (!tickData) return;
      const selfId = socket.id;

      if (typeof tickData.graceTimer === 'number') setGracePeriodSeconds(tickData.graceTimer);
      if (typeof tickData.gateOpen === 'boolean') setGateOpen(tickData.gateOpen);

      // Hunt state
      const g = tickData.ghost;
      const isHunting = !!(g?.huntActive || g?.state === 'ACTIVE_HUNT_CHASE' || g?.state === 'HUNT_INITIATION');
      if (isHunting !== huntRef.current) {
        setHunt(isHunting);
        engineRef.current?.setHuntIntensity(isHunting ? 1.0 : 0.0);
        engineRef.current?.setFlashlightFlicker(isHunting, 0.9);
      }

      // Ghost entity
      if (g && ghostRef.current) {
        ghostRef.current.wantVisible = !!g.visible;
        if (Array.isArray(g.position)) ghostRef.current.target.set(g.position[0], 0, g.position[2]);
      }

      // Breaker state is handled by ElectricalSystem via its own socket events; tick keeps HUD honest
      const tickBreaker = tickData.breaker?.isOn ?? tickData.breakerOn;
      if (typeof tickBreaker === 'boolean' && electricalRef.current && electricalRef.current.isOn !== tickBreaker) {
        electricalRef.current.syncFromServer({ breakerOn: tickBreaker, activeLights: tickData.activeLights });
      }

      // Remote avatars (local player excluded by socket id)
      if (Array.isArray(tickData.players)) {
        playersRef.current = tickData.players;
        avatarsRef.current?.updateFromTick(tickData.players, selfId);

        const mates = tickData.players
          .filter((p) => p.id !== selfId)
          .map((p) => ({ id: p.id, username: p.username || 'Kutató', sanity: p.sanity, alive: p.alive, isSpeaking: !!p.isSpeaking }));
        setTeammates(mates);
        const meSpeaking = !!tickData.players.find((p) => p.id === selfId)?.isSpeaking;
        setIsSpeaking((prev) => (prev === meSpeaking ? prev : meSpeaking));
        const living = tickData.players.filter((p) => p.alive && p.id !== selfId);
        setAliveTeammates((prev) => (prev.length === living.length && prev.every((p, i) => p.id === living[i].id) ? prev : living));

        const me = tickData.players.find((p) => p.id === selfId);
        if (me) {
          if (typeof me.sanity === 'number' && me.sanity !== sanityRef.current) setSanityBoth(me.sanity);
          if (me.alive === false && aliveRef.current) {
            aliveRef.current = false;
            setIsAlive(false);
            controllerRef.current?.unlock();
          }
        }
      }
    };

    const handleHuntStarted = () => {
      setHunt(true);
      engineRef.current?.setHuntIntensity(1.0);
      audioRef.current?.playHuntSiren?.();
    };

    const handleHuntOver = () => {
      setHunt(false);
      engineRef.current?.setHuntIntensity(0.0);
      engineRef.current?.setFlashlightFlicker(false, 0.0);
    };

    const handleHuntCancelled = () => {
      handleHuntOver();
      completeTask('crucifix_block');
    };

    const handleJesusBurned = (data) => {
      const itemSys = itemSystemRef.current;
      if (!itemSys) return;
      const inv = itemSys.getInventory().map((it) => (it && it.type === 'mobile_jesus'
        ? { ...it, charges: data?.chargesRemaining ?? it.charges }
        : it));
      itemSys.setInventory(inv);
    };

    // Server consumed an item (smudge, pálinka...): clear slots the server reports empty,
    // keep local item objects (they carry HUD name/icon) for the rest.
    const handleInventoryUpdated = (d) => {
      const itemSys = itemSystemRef.current;
      if (!itemSys || !Array.isArray(d?.inventory)) return;
      const local = itemSys.getInventory();
      const next = local.map((it, i) => (it && !d.inventory[i] ? null : it));
      if (next.some((it, i) => it !== local[i])) itemSys.setInventory(next);
    };

    const handlePlayerKilled = (data) => {
      const victim = data?.playerId || data?.victimId;
      if (victim === socket.id && aliveRef.current) {
        aliveRef.current = false;
        setIsAlive(false);
        controllerRef.current?.unlock();
        audioRef.current?.playJumpscare?.();
      }
    };

    const handleDoor = (d) => d?.doorId && applyServerDoor(d.doorId, d.open);
    const handleGate = (d) => {
      if (!d) return;
      applyServerDoor('gate_depot_main', !!d.open);
      setGateOpen(true);
      if (typeof d.graceRemaining === 'number') setGracePeriodSeconds(d.graceRemaining);
    };

    const handleSanity = (d) => {
      if (d && d.socketId === socket.id && typeof d.sanity === 'number') setSanityBoth(d.sanity);
    };

    const handleTemperature = (d) => {
      if (!d || typeof d.temperature !== 'number') return;
      setAmbientTemp(d.temperature);
      itemSystemRef.current?.applyTemperatureReading(d.temperature);
      engineRef.current?.setAmbientTemperature(d.temperature);
      if (d.isFreezing) completeTask('freezing_temp');
    };

    const handleEmf = (d) => {
      itemSystemRef.current?.applyEmfReading(d || {});
      if (d?.level >= 5) completeTask('emf_5');
    };

    const handleSfx = (d) => {
      if (d?.sound) audioRef.current?.playSpatialSFX?.(d.sound, new THREE.Vector3(8, 1.4, 5));
    };

    const handlePhotoTaken = (p) => setPhotos((prev) => [...prev.slice(-9), p]);
    const handleVerdict = (r) => {
      setMatchResult(r);
      controllerRef.current?.unlock();
    };

    // Match ended without a verdict (e.g. every investigator died): show it to everyone
    const handleConcluded = (r) => {
      if (!r) return;
      setMatchResult((prev) => prev || (typeof r.correct === 'boolean'
        ? r
        : { correct: false, concluded: true, reason: r.reason || 'concluded', ...r }));
      controllerRef.current?.unlock();
    };

    // Another player started a new match: follow into the fresh session
    const handleSessionReset = () => {
      resetRef.current?.();
      socket.emit('phobia:init-session', initPayload());
    };

    const handlers = {
      'phobia:match-concluded': handleConcluded,
      'phobia:session-reset': handleSessionReset,
      connect: handleConnect,
      'phobia:session-init': handleSessionInit,
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
  }, [socket, channelId, initPayload, applySessionSnapshot, applyEquipmentShelf, applyServerDoor, setHunt, setSanityBoth, completeTask]);

  // 3. KEYBOARD EVENT LISTENERS (J journal, T flashlight, V walkie-talkie, pointer lock tracking)
  const toggleJournal = useCallback((force) => {
    const next = typeof force === 'boolean' ? force : !journalRef.current;
    journalRef.current = next;
    setJournalOpen(next);
    if (next && document.pointerLockElement) document.exitPointerLock();
  }, []);

  useEffect(() => {
    const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;

    const handleKeyDown = (e) => {
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
    const handleKeyUp = (e) => {
      if (e.code === 'KeyV') {
        audioRef.current?.setWalkieTalkieActive?.(false);
        audioRef.current?.playRadioSquelch?.('end');
      }
    };

    const handlePointerLockChange = () => {
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
  const handleToggleEvidence = useCallback((evidenceId, nextState) => {
    setEvidenceState((prev) => ({ ...prev, [evidenceId]: nextState }));
  }, []);

  // Submit Final Verdict
  const handleSubmitVerdict = useCallback(
    (ghostName) => {
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
    setSideTasks(DEFAULT_SIDE_TASKS);
    setHunt(false);
    setSanityBoth(100);
    setGateOpen(false);
    aliveRef.current = true;
    setIsAlive(true);
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
  }, [setHunt, setSanityBoth, toggleJournal]);

  const handleNewMatch = useCallback(() => {
    if (!socket || !channelId) return;
    socket.emit('phobia:init-session', initPayload({ newMatch: true }));
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

  const handleRetry = useCallback(() => {
    setInitError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  const showPause = isReady && isAlive && !isLocked && !journalOpen && !matchResult;
  const spectatorTarget = aliveTeammates.length ? aliveTeammates[spectatorIdx % aliveTeammates.length] : null;

  if (sessionRefusal) {
    const refusalText = {
      session_full: 'A munkamenet megtelt, nem tudsz csatlakozni. Próbáld újra később, vagy indíts másik szobát.',
      session_limit: 'Elérted a párhuzamos munkamenetek korlátját a szerveren. Várj, amíg egy másik nyomozás véget ér.'
    }[sessionRefusal] || 'A szerver elutasította a csatlakozást.';
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

      {/* 4. Alive Player HUD / Spectator overlay */}
      {isAlive ? (
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
      {isAlive && isReady && !gateOpen && !matchResult && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-4 py-2 rounded-xl bg-black/70 border border-purple-500/40 text-[11px] text-purple-200 backdrop-blur-md">
          Szerelj fel a teherautó polcáról, majd nyomd meg a <strong>kapunyitó gombot</strong> – a türelmi idő ekkor indul.
        </div>
      )}

      {/* Spectator cycle (HUD is pointer-events-none, so offer a real button) */}
      {!isAlive && !matchResult && aliveTeammates.length > 1 && (
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
        isAlive={isAlive}
        onNewMatch={handleNewMatch}
      />
    </div>
  );
}
