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
  BookOpen
} from 'lucide-react';

import { PhobiaEngine } from './engine/PhobiaEngine.js';
import { PhobiaController } from './engine/PhobiaController.js';
import { PhobiaAvatars } from './engine/PhobiaAvatars.js';
import { ScrapYardMap } from './map/ScrapYardMap.js';
import { TruckEnvironment } from './map/TruckEnvironment.js';
import { MapColliders } from './map/MapColliders.js';
import { ElectricalSystem } from './systems/ElectricalSystem.js';
import { PhobiaAudio } from './audio/PhobiaAudio.js';

import PhobiaHUD from './ui/PhobiaHUD.jsx';
import JournalModal, { EVIDENCE_TYPES, GHOST_ARCHETYPES } from './ui/JournalModal.jsx';
import SpectatorView from './ui/SpectatorView.jsx';

export default function MiskolcPhobiaView({
  socket,
  channelId,
  currentUser,
  session,
  onClose
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

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

  // Game UI State
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
  const [crosshairPrompt, setCrosshairPrompt] = useState(null);
  const [huntActive, setHuntActive] = useState(false);
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(session?.graceTimer || 0);
  const [ambientTemp, setAmbientTemp] = useState(15.0);
  const [breakerOn, setBreakerOn] = useState(true);
  const [activeLightsCount, setActiveLightsCount] = useState(0);

  // Evidence, Photos & Verdict
  const [evidenceState, setEvidenceState] = useState({
    emf5: 0,
    spirit_box: 0,
    fingerprints: 0,
    ghost_orbs: 0,
    ghost_writing: 0,
    freezing: 0,
    dots: 0
  });
  const [photos, setPhotos] = useState([]);
  const [selectedGhost, setSelectedGhost] = useState('');
  const [matchResult, setMatchResult] = useState(null);
  const [aliveTeammates, setAliveTeammates] = useState([]);
  const [sideTasks, setSideTasks] = useState([
    { id: 1, title: 'Fotózd le a szellemet a kamerával', reward: 500, completed: false },
    { id: 2, title: 'Mérj 0.0°C alatti fagypontot a hőmérővel', reward: 500, completed: false },
    { id: 3, title: 'Akadályozz meg egy vadászatot Mobil Jézussal', reward: 500, completed: false }
  ]);

  // Load ItemSystem dynamically if available
  useEffect(() => {
    let mounted = true;
    import(/* @vite-ignore */ './items/ItemSystem.js')
      .then((mod) => {
        if (!mounted) return;
        const ItemSys = mod.ItemSystem || mod.default;
        if (ItemSys && engineRef.current && controllerRef.current) {
          const itemSys = new ItemSys({
            scene: engineRef.current.scene,
            camera: engineRef.current.camera,
            controller: controllerRef.current,
            socket,
            roomId: channelId
          });
          itemSystemRef.current = itemSys;
        }
      })
      .catch(() => {
        // Fallback default starter inventory
        setInventory([
          { id: 'flashlight', name: 'Zseblámpa', icon: '🔦' },
          { id: 'mobile_jesus', name: 'Mobil Jézus', icon: '✝️', charges: 2 },
          { id: 'spirit_box', name: 'Spirit Box', icon: '📻' }
        ]);
      });

    return () => {
      mounted = false;
    };
  }, [socket, channelId]);

  // 1. INITIALIZE THREE.JS ENGINE & GAME WORLD
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    try {
      // 1. Core WebGL Engine
      const engine = new PhobiaEngine({
        canvas: canvasRef.current,
        container: containerRef.current
      });
      engineRef.current = engine;

      // 2. Map Collision System
      const mapColliders = new MapColliders();
      mapCollidersRef.current = mapColliders;

      // 3. Audio Spatializer
      let audio = null;
      try {
        audio = new PhobiaAudio({
          camera: engine.camera,
          scene: engine.scene
        });
        audioRef.current = audio;
      } catch (err) {
        console.warn('PhobiaAudio init error:', err);
      }

      // 4. Scrap Yard Map
      const map = new ScrapYardMap({
        scene: engine.scene,
        mapColliders,
        renderer: engine.renderer
      });
      mapRef.current = map;

      // 5. Surveillance Truck Environment outside the yard
      const truck = new TruckEnvironment({
        scene: engine.scene,
        mapColliders,
        onGateButtonPressed: () => {
          if (socket && channelId) {
            socket.emit('phobia:gate-toggle', { roomId: channelId, channelId });
          }
        }
      });
      truckRef.current = truck;

      // 6. Master Electrical System
      const electrical = new ElectricalSystem({
        scene: engine.scene,
        map,
        socket,
        roomId: channelId,
        onPlaySound: (sfxKey, pos) => {
          if (audio) audio.playSpatialSFX(sfxKey, pos);
        }
      });
      electricalRef.current = electrical;

      // 7. Player 3D Controller
      const controller = new PhobiaController({
        camera: engine.camera,
        domElement: canvasRef.current,
        scene: engine.scene,
        mapColliders,
        socket,
        roomId: channelId,
        initialPosition: [-4.0, 0.0, -15.0], // Spawns outside truck
        onInteractionPrompt: (prompt, target) => {
          if (!prompt) {
            setCrosshairPrompt(null);
          } else {
            setCrosshairPrompt({
              action: typeof prompt === 'string' ? prompt : prompt.action || 'Használat',
              key: prompt.key || 'E',
              subText: target?.name || prompt.subText || ''
            });
          }
        },
        onInventoryChange: (newInv, slot) => {
          setInventory([...newInv]);
          setActiveSlot(slot);
        },
        onStaminaChange: (newStamina) => {
          setStamina(newStamina);
        },
        onFootstep: (surface) => {
          if (audio) audio.playFootstep(surface, controller.isSprinting);
        },
        onFlashlightToggle: (isOn) => {
          engine.setFlashlight(isOn);
          if (audio) audio.playFlashlightClick();
        }
      });
      controllerRef.current = controller;

      // 8. Multiplayer Avatars
      const avatars = new PhobiaAvatars({
        scene: engine.scene,
        localUserId: currentUser?.id,
        camera: engine.camera
      });
      avatarsRef.current = avatars;

      // 9. Frame Update Hook
      engine.registerUpdateHook((delta, elapsed) => {
        controller.update(delta);
        truck.update(delta, elapsed);
        map.update(delta, elapsed);
        electrical.update(delta);
        avatars.update(delta);

        // Update electrical HUD state
        setBreakerOn(electrical.isOn);
        setActiveLightsCount(electrical.activeLights.size);

        // Calculate ambient temperature based on player zone
        const playerPos = controller.position;
        const currentZone = mapColliders.detectZone(playerPos);
        if (currentZone === 'truck') {
          setAmbientTemp(18.5);
        } else if (huntActive) {
          setAmbientTemp(-3.2); // Freezing during hunts
        } else {
          setAmbientTemp(12.0);
        }

        // Low sanity audio sync
        if (audio && sanity < 30) {
          audio.updateHeartbeat(sanity, huntActive);
        }
      });

      // Start engine loop
      engine.start();
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize MiskolcPhobia 3D engine:', error);
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
      if (controllerRef.current) {
        controllerRef.current.dispose();
      }
      if (audioRef.current) {
        audioRef.current.dispose();
      }
    };
  }, [channelId, currentUser?.id, socket]);

  // 2. SOCKET.IO MULTIPLAYER SYNCHRONIZATION (12 Hz Authoritative Loop)
  useEffect(() => {
    if (!socket || !channelId) return;

    // Join Phobia room session
    socket.emit('phobia:init-session', {
      roomId: channelId,
      channelId,
      user: {
        id: currentUser?.id,
        username: currentUser?.username || 'Nyomozó'
      }
    });

    const handleTick = (tickData) => {
      if (!tickData) return;

      // Update grace preparation timer
      if (typeof tickData.graceTimer === 'number') {
        setGracePeriodSeconds(tickData.graceTimer);
      }

      // Update hunt state
      const isHunting = tickData.ghost?.state === 'ACTIVE_HUNT_CHASE' || tickData.ghost?.state === 'HUNT_INITIATION';
      setHuntActive(isHunting);
      if (engineRef.current) {
        engineRef.current.setHuntIntensity(isHunting ? 1.0 : 0.0);
        engineRef.current.setFlashlightFlicker(isHunting, 0.9);
      }

      // Update breaker state
      if (tickData.breaker && electricalRef.current) {
        electricalRef.current.setBreakerState(tickData.breaker.isOn);
      }

      // Update remote player avatars
      if (Array.isArray(tickData.players) && avatarsRef.current) {
        avatarsRef.current.updateFromTick(tickData.players);

        // Filter alive teammates
        const living = tickData.players.filter(p => p.alive && p.id !== currentUser?.id);
        setAliveTeammates(living);

        // Find self in tick
        const me = tickData.players.find(p => p.id === currentUser?.id);
        if (me) {
          if (typeof me.sanity === 'number') setSanity(me.sanity);
          if (me.alive === false && isAlive) {
            setIsAlive(false);
            if (controllerRef.current) {
              controllerRef.current.unlock();
            }
          }
        }
      }
    };

    const handleHuntStarted = () => {
      setHuntActive(true);
      if (audioRef.current) {
        audioRef.current.playHuntSiren();
      }
    };

    const handleHuntEnded = () => {
      setHuntActive(false);
      if (engineRef.current) {
        engineRef.current.setHuntIntensity(0.0);
        engineRef.current.setFlashlightFlicker(false, 0.0);
      }
    };

    const handlePlayerKilled = (data) => {
      if (data?.playerId === currentUser?.id) {
        setIsAlive(false);
        if (controllerRef.current) controllerRef.current.unlock();
        if (audioRef.current) audioRef.current?.playJumpscare();
      }
    };

    const handlePhotoTaken = (newPhoto) => {
      setPhotos(prev => [...prev.slice(-9), newPhoto]);
    };

    const handleVerdictResult = (result) => {
      setMatchResult(result);
    };

    socket.on('phobia:tick', handleTick);
    socket.on('phobia:hunt-started', handleHuntStarted);
    socket.on('phobia:hunt-ended', handleHuntEnded);
    socket.on('phobia:player-killed', handlePlayerKilled);
    socket.on('phobia:photo-taken', handlePhotoTaken);
    socket.on('phobia:verdict-result', handleVerdictResult);

    return () => {
      socket.off('phobia:tick', handleTick);
      socket.off('phobia:hunt-started', handleHuntStarted);
      socket.off('phobia:hunt-ended', handleHuntEnded);
      socket.off('phobia:player-killed', handlePlayerKilled);
      socket.off('phobia:photo-taken', handlePhotoTaken);
      socket.off('phobia:verdict-result', handleVerdictResult);
    };
  }, [socket, channelId, currentUser?.id, isAlive]);

  // 3. KEYBOARD EVENT LISTENERS ('J' for Journal, PointerLock toggle)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle Journal on 'J'
      if (e.code === 'KeyJ') {
        e.preventDefault();
        setJournalOpen((prev) => {
          const next = !prev;
          if (next && document.pointerLockElement) {
            document.exitPointerLock();
          }
          return next;
        });
      }

      // Close journal on Escape
      if (e.code === 'Escape' && journalOpen) {
        setJournalOpen(false);
      }
    };

    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === canvasRef.current;
      setIsLocked(locked);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [journalOpen]);

  // Handle clicking canvas to lock mouse
  const handleCanvasClick = useCallback(() => {
    if (!journalOpen && canvasRef.current && !isLocked) {
      canvasRef.current.requestPointerLock?.();
      setHasStarted(true);
    }
  }, [journalOpen, isLocked]);

  // Toggle Evidence in Journal
  const handleToggleEvidence = useCallback((evidenceId, nextState) => {
    setEvidenceState((prev) => ({
      ...prev,
      [evidenceId]: nextState
    }));
  }, []);

  // Submit Final Verdict
  const handleSubmitVerdict = useCallback((ghostName) => {
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
      // Offline fallback simulation
      setMatchResult({
        correct: true,
        actualGhost: ghostName,
        payoutFt: isAlive ? 4200 : 2100
      });
    }
  }, [socket, channelId, photos.length, isAlive]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full min-h-0 bg-[#06070e] select-none overflow-hidden"
    >
      {/* 1. 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-full block cursor-crosshair focus:outline-none"
        tabIndex={0}
      />

      {/* 2. Top-bar Return & Controls */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/90 text-gray-300 hover:text-white border border-gray-700/60 text-xs font-bold transition flex items-center gap-1.5 backdrop-blur-md shadow-lg"
          title="Vissza a szobába"
        >
          <X className="w-3.5 h-3.5" />
          <span>Kilépés</span>
        </button>

        <button
          onClick={() => setJournalOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/50 text-xs font-bold transition flex items-center gap-1.5 backdrop-blur-md shadow-lg"
        >
          <BookOpen className="w-3.5 h-3.5 text-purple-400" />
          <span>Jegyzőkönyv [J]</span>
        </button>
      </div>

      {/* 3. In-Game 2D HUD */}
      {hasStarted && isAlive && !journalOpen && (
        <PhobiaHUD
          stamina={stamina}
          sanity={sanity}
          inventory={inventory}
          activeSlot={activeSlot}
          crosshairPrompt={crosshairPrompt}
          huntActive={huntActive}
          gracePeriodSeconds={gracePeriodSeconds}
          ambientTemp={ambientTemp}
          breakerOn={breakerOn}
          activeLightsCount={activeLightsCount}
          onOpenJournal={() => setJournalOpen(true)}
        />
      )}

      {/* 4. Spectator View overlay when dead */}
      {!isAlive && (
        <SpectatorView aliveTeammates={aliveTeammates} />
      )}

      {/* 5. Start Click Prompt Overlay */}
      {isReady && !hasStarted && (
        <div
          onClick={handleCanvasClick}
          className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer transition-opacity"
        >
          <div className="p-8 rounded-3xl bg-[#101329]/95 border-2 border-purple-500/40 shadow-2xl max-w-md text-center space-y-4">
            <div className="text-4xl animate-bounce">🔦</div>
            <h2 className="text-2xl font-black text-white tracking-wide">
              A MÉH TELEP KÉSZEN ÁLL
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
              Kattints ide az egér befogásához és a nyomozás megkezdéséhez.
              Használd a <strong>[WASD]</strong> gombokat a mozgáshoz, <strong>[E]</strong> az interakcióhoz, és <strong>[J]</strong> a nyomozói naplóhoz!
            </p>
            <button
              onClick={handleCanvasClick}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm uppercase tracking-wider hover:opacity-95 shadow-lg flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Belépés a Telepre</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. Interactive Journal Modal [J] */}
      <JournalModal
        isOpen={journalOpen}
        onClose={() => setJournalOpen(false)}
        evidenceState={evidenceState}
        onToggleEvidence={handleToggleEvidence}
        photos={photos}
        selectedGhost={selectedGhost}
        onSelectGhost={setSelectedGhost}
        onSubmitVerdict={handleSubmitVerdict}
        matchResult={matchResult}
        isAlive={isAlive}
        sideTasks={sideTasks}
      />
    </div>
  );
}
