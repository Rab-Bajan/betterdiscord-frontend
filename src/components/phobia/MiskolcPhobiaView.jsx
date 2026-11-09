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
import { ItemSystem } from './items/ItemSystem.js';

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
  const [initError, setInitError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [isAlive, setIsAlive] = useState(true);

  // Stats & HUD
  const [stamina, setStamina] = useState(100);
  const [sanity, setSanity] = useState(100);
  const [inventory, setInventory] = useState([
    { id: 'flashlight', name: 'Zseblámpa', icon: '🔦' },
    { id: 'mobile_jesus', name: 'Mobil Jézus', icon: '✝️', charges: 2 },
    { id: 'spirit_box', name: 'Spirit Box', icon: '📻' }
  ]);
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
      if (engine.canvas) {
        canvasRef.current = engine.canvas;
      }

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
          if (audio && typeof audio.playSpatialSFX === 'function') {
            audio.playSpatialSFX(sfxKey, pos);
          }
        }
      });
      electricalRef.current = electrical;

      // 7. Player 3D Controller
      const controller = new PhobiaController({
        camera: engine.camera,
        domElement: engine.canvas || canvasRef.current,
        scene: engine.scene,
        mapColliders,
        socket,
        roomId: channelId,
        initialPosition: [-4.0, 0.0, -15.0], // Spawns outside truck
        initialItems: [
          { id: 'flashlight', name: 'Zseblámpa', icon: '🔦' },
          { id: 'mobile_jesus', name: 'Mobil Jézus', icon: '✝️', charges: 2 },
          { id: 'spirit_box', name: 'Spirit Box', icon: '📻' }
        ],
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
          if (typeof engine.setFlashlight === 'function') {
            engine.setFlashlight(isOn);
          } else if (typeof engine.toggleFlashlight === 'function') {
            engine.toggleFlashlight(isOn);
          }
          if (audio) audio.playFlashlightClick();
        }
      });
      controllerRef.current = controller;

      // 8. Item System (Investigation Tools & Survival Items)
      try {
        const itemSys = new ItemSystem({
          engine,
          scene: engine.scene,
          camera: engine.camera,
          viewmodelGroup: engine.viewmodelGroup,
          interactivePropsGroup: engine.interactivePropsGroup,
          socket,
          roomId: channelId,
          onInventoryChange: (newInv, slot) => {
            setInventory([...newInv]);
            setActiveSlot(slot);
          },
          onPhotoSnapped: (photo) => {
            setPhotos((prev) => [...prev.slice(-9), photo]);
          },
          onSanityRestored: (newSanity) => {
            setSanity(newSanity);
          }
        });
        itemSystemRef.current = itemSys;
      } catch (itemErr) {
        console.warn('ItemSystem init error:', itemErr);
      }

      // 9. Multiplayer Avatars
      const avatars = new PhobiaAvatars({
        scene: engine.scene,
        localUserId: currentUser?.id,
        camera: engine.camera
      });
      avatarsRef.current = avatars;

      // 10. Frame Update Hook
      const updateFn = (delta, elapsed) => {
        if (controllerRef.current) controllerRef.current.update(delta);
        if (truckRef.current) truckRef.current.update(delta, elapsed);
        if (mapRef.current) mapRef.current.update(delta, elapsed);
        if (electricalRef.current) electricalRef.current.update(delta);
        if (avatarsRef.current) avatarsRef.current.update(delta);
        if (itemSystemRef.current) {
          const speed = controllerRef.current ? (controllerRef.current.isSprinting ? 5.0 : 3.0) : 0;
          itemSystemRef.current.update(delta, speed);
        }

        // Update electrical HUD state only on state changes
        if (electricalRef.current) {
          const breakerState = electricalRef.current.isOn;
          setBreakerOn((prev) => (prev !== breakerState ? breakerState : prev));
          const lightsCount = electricalRef.current.activeLights?.size || 0;
          setActiveLightsCount((prev) => (prev !== lightsCount ? lightsCount : prev));
        }

        // Calculate ambient temperature based on player zone
        if (controllerRef.current && mapCollidersRef.current) {
          const playerPos = controllerRef.current.position;
          const currentZone = mapCollidersRef.current.detectZone(playerPos);
          let targetTemp = 12.0;
          if (currentZone === 'truck') {
            targetTemp = 18.5;
          } else if (huntActive) {
            targetTemp = -3.2; // Freezing during hunts
          }
          setAmbientTemp((prev) => (prev !== targetTemp ? targetTemp : prev));
        }

        // Low sanity audio sync
        if (audioRef.current && sanity < 30) {
          audioRef.current.updateHeartbeat(sanity, huntActive);
        }
      };

      if (typeof engine.registerUpdateHook === 'function') {
        engine.registerUpdateHook(updateFn);
      } else if (typeof engine.addUpdateHook === 'function') {
        engine.addUpdateHook(updateFn);
      }

      // Start engine loop
      engine.start();
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize MiskolcPhobia 3D engine:', error);
      setInitError(error.message || 'Nem sikerült elindítani a 3D motort.');
    }

    return () => {
      try {
        if (engineRef.current) {
          if (typeof engineRef.current.destroy === 'function') {
            engineRef.current.destroy();
          } else if (typeof engineRef.current.dispose === 'function') {
            engineRef.current.dispose();
          }
          engineRef.current = null;
        }
        if (controllerRef.current) {
          if (typeof controllerRef.current.dispose === 'function') {
            controllerRef.current.dispose();
          }
          controllerRef.current = null;
        }
        if (audioRef.current) {
          if (typeof audioRef.current.dispose === 'function') {
            audioRef.current.dispose();
          }
          audioRef.current = null;
        }
        if (electricalRef.current) {
          if (typeof electricalRef.current.dispose === 'function') {
            electricalRef.current.dispose();
          }
          electricalRef.current = null;
        }
        if (avatarsRef.current) {
          if (typeof avatarsRef.current.dispose === 'function') {
            avatarsRef.current.dispose();
          }
          avatarsRef.current = null;
        }
        if (itemSystemRef.current) {
          if (typeof itemSystemRef.current.dispose === 'function') {
            itemSystemRef.current.dispose();
          }
          itemSystemRef.current = null;
        }
      } catch (err) {
        console.warn('Error during Phobia cleanup:', err);
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
        const living = tickData.players.filter((p) => p.alive && p.id !== currentUser?.id);
        setAliveTeammates(living);

        // Find self in tick
        const me = tickData.players.find((p) => p.id === currentUser?.id);
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
      setPhotos((prev) => [...prev.slice(-9), newPhoto]);
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
    const targetCanvas = engineRef.current?.canvas || canvasRef.current;
    if (!journalOpen && targetCanvas && !isLocked) {
      targetCanvas.requestPointerLock?.();
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
        // Offline fallback simulation
        setMatchResult({
          correct: true,
          actualGhost: ghostName,
          payoutFt: isAlive ? 4200 : 2100
        });
      }
    },
    [socket, channelId, photos.length, isAlive]
  );

  if (initError) {
    return (
      <div className="relative flex-1 w-full h-full flex flex-col items-center justify-center bg-[#06070e] text-white p-6 select-none">
        <div className="max-w-md p-6 rounded-2xl bg-gray-900/90 border border-red-500/40 shadow-2xl backdrop-blur-md flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-100 mb-2">Nem sikerült elindítani a 3D motort</h2>
          <p className="text-xs text-gray-400 mb-5 leading-relaxed">{initError}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setInitError(null);
                setIsReady(false);
              }}
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
          <BookOpen className="w-3.5 h-3.5" />
          <span>Napló (J)</span>
        </button>
      </div>

      {/* 3. Click to Start Overlay */}
      {!hasStarted && isReady && isAlive && (
        <div
          onClick={handleCanvasClick}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm cursor-pointer select-none transition-all"
        >
          <div className="text-center p-8 rounded-3xl bg-gray-950/90 border border-purple-500/30 shadow-2xl max-w-lg transform hover:scale-[1.02] transition">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-purple-400 to-indigo-400 mb-2 tracking-wider">
              MISKOLCPHOBIA 3D
            </h1>
            <p className="text-gray-400 text-xs mb-6 tracking-wide">
              MÉH Telep Paranormális Helyszínelés
            </p>

            <div className="grid grid-cols-2 gap-3 text-left mb-6 text-xs text-gray-300 bg-black/50 p-4 rounded-xl border border-gray-800">
              <div>
                <span className="text-purple-400 font-bold">W, A, S, D:</span> Mozgás
              </div>
              <div>
                <span className="text-purple-400 font-bold">Shift:</span> Futás (Stamina)
              </div>
              <div>
                <span className="text-purple-400 font-bold">E / Bal klikk:</span> Használat
              </div>
              <div>
                <span className="text-purple-400 font-bold">G:</span> Tárgy eldobása
              </div>
              <div>
                <span className="text-purple-400 font-bold">1, 2, 3 / Görgő:</span> Tárhely
              </div>
              <div>
                <span className="text-purple-400 font-bold">J:</span> Nyomozói Napló
              </div>
              <div>
                <span className="text-purple-400 font-bold">F:</span> Zseblámpa ki/be
              </div>
              <div>
                <span className="text-purple-400 font-bold">V:</span> Walkie-Talkie
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-bold text-sm shadow-lg hover:from-purple-600 hover:to-indigo-600 transition">
              <Play className="w-4 h-4 fill-current" />
              <span>Kattints a kezdéshez (Egér zárolása)</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Alive Player HUD */}
      {isAlive ? (
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
          maxLightsCount={6}
          onOpenJournal={() => setJournalOpen(true)}
        />
      ) : (
        /* 5. Dead Spectator Overlay */
        <SpectatorView
          aliveTeammates={aliveTeammates}
          spectatorTarget={aliveTeammates[0] || null}
          onCycleTarget={() => {}}
        />
      )}

      {/* 6. Journal & Deduction Modal ('J' key) */}
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
        sideTasks={sideTasks}
      />
    </div>
  );
}
