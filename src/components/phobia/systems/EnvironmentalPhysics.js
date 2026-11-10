import * as THREE from 'three';

/**
 * EnvironmentalPhysics.js
 *
 * Environmental physics and dynamic prop interaction system for MiskolcPhobia.
 * Implements Points 29, 54, 55, and 56 of the MiskolcPhobia 100-point specification:
 * - Throwable scrap prop physics (radiators, lead pipes, car batteries, scrap chunks)
 * - Player 'G' key throw impulse (5 m/s forward + gravity arc + restitution bounce 0.35)
 * - Impact audio feedback (sfx_scrap_drop) and EMF signature generation
 * - Poltergeist multi-prop impulse vectors (Lakatos Ármándó event: 3–5 items, 9–15 m/s, EMF 5)
 * - Car alarm logic in Zone 2 Roncsdomb (10s blinking headlights, horn honking, noise spike)
 * - Puddle specular reflections and dynamic mud/rain surface dampness
 * - Full Socket.io synchronization (phobia:item-thrown)
 */

export const PROP_TYPES = Object.freeze({
  RADIATOR: 'radiator',
  PIPE: 'pipe',
  BATTERY: 'battery',
  SCRAP_CHUNK: 'scrap_chunk',
  BEER_CAN: 'beer_can',
  MUFFLER: 'muffler'
});

export const SFX_KEYS = Object.freeze({
  SCRAP_DROP: 'sfx_scrap_drop',
  CAR_ALARM: 'sfx_car_alarm'
});

export const DEFAULT_GRAVITY = -9.81;
export const DEFAULT_RESTITUTION = 0.35;
export const DEFAULT_PLAYER_THROW_SPEED = 5.0; // m/s
export const CAR_ALARM_DURATION = 10.0;        // seconds

export class EnvironmentalPhysics {
  /**
   * @param {Object} options
   * @param {THREE.Scene} [options.scene]
   * @param {Object} [options.mapColliders] - MapColliders instance if available
   * @param {Function} [options.onPlaySound] - Audio callback (sfxKey, position)
   * @param {Function} [options.onNoiseSpike] - Activity callback (noiseLevel, source)
   * @param {Object} [options.socket] - Socket.io instance
   * @param {string} [options.roomId] - Active room id
   */
  constructor(options = {}) {
    this.scene = options.scene || null;
    this.mapColliders = options.mapColliders || null;
    this.onPlaySound = options.onPlaySound || ((_sfx, _pos) => {});
    this.onNoiseSpike = options.onNoiseSpike || ((_level, _src) => {});
    this.socket = options.socket || null;
    this.roomId = options.roomId || null;

    // Active scrap physics entities: id -> PropEntity
    this.props = new Map();

    // Car alarm state in Zone 2 Roncsdomb
    this.carAlarm = {
      active: false,
      timer: 0.0,
      carId: 'lada_wreck_alarm',
      position: new THREE.Vector3(-16.0, 1.2, 14.0),
      headlights: [],
      headlightMeshes: [],
      strobeTimer: 0.0,
      strobeState: false,
      strobeFreq: 0.2, // 5 Hz blink (0.2s alternating strobe)
      noiseIntensity: 0.0,
      bumpRadius: 2.2
    };

    // Puddle and surface dampness system
    this.puddles = [];
    this.dampnessFactor = 0.5; // 0.0 (dry) to 1.0 (waterlogged mud)
    this.rippleTime = 0.0;

    // Group for procedural physics meshes in scene
    this.physicsGroup = new THREE.Group();
    this.physicsGroup.name = 'EnvironmentalPhysics_Group';
    if (this.scene) {
      this.scene.add(this.physicsGroup);
    }

    if (this.socket) {
      this.attachSocket(this.socket, this.roomId);
    }

    // Initialize default scrap props across the MÉH yard
    this._initDefaultScrapProps();
    this._initCarAlarmComponents();
    this._initPuddleMaterials();
  }

  /* -------------------------------------------------------------------------- */
  /*                       THROWABLE SCRAP PROPS (Point 54)                     */
  /* -------------------------------------------------------------------------- */

  /**
   * Registers a throwable physics scrap prop in the simulation.
   * @param {Object} config
   */
  registerProp(config) {
    if (!config || !config.id) {
      throw new Error('EnvironmentalPhysics: registerProp requires config.id');
    }

    const pos = config.position instanceof THREE.Vector3
      ? config.position.clone()
      : new THREE.Vector3(config.position?.x || 0, config.position?.y || 0.1, config.position?.z || 0);

    const prop = {
      id: config.id,
      type: config.type || PROP_TYPES.SCRAP_CHUNK,
      name: config.name || config.id,
      mass: config.mass || this._getDefaultMass(config.type),
      restitution: typeof config.restitution === 'number' ? config.restitution : DEFAULT_RESTITUTION,
      position: pos,
      velocity: new THREE.Vector3(0, 0, 0),
      angularVelocity: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      isResting: true,
      mesh: config.mesh || null,
      groundY: typeof config.groundY === 'number' ? config.groundY : 0.08,
      emfSignature: config.emfSignature || 0, // EMF level emitted on impact (0, 2, 3, 5)
      lastImpactSpeed: 0
    };

    if (prop.mesh) {
      prop.mesh.position.copy(prop.position);
      prop.mesh.userData = {
        ...(prop.mesh.userData || {}),
        isInteractive: true,
        action: 'pickup_scrap',
        propId: prop.id,
        promptHu: `[E] ${config.nameHu || 'Vasdarab'} felvétele`
      };
      if (!prop.mesh.parent && this.physicsGroup) {
        this.physicsGroup.add(prop.mesh);
      }
    }

    this.props.set(config.id, prop);
    return prop;
  }

  /**
   * Applies player 'G' key throw impulse to a scrap prop.
   * Speed: 5.0 m/s forward impulse along camera vector + upward arc (Point 29).
   *
   * @param {string} propId
   * @param {THREE.Vector3|Object} origin - Camera eye position
   * @param {THREE.Vector3|Object} lookDirection - Camera forward unit vector
   * @param {number} [speed=5.0] - Forward throw velocity
   * @param {boolean} [emitSocket=true]
   */
  throwScrap(propId, origin, lookDirection, speed = DEFAULT_PLAYER_THROW_SPEED, emitSocket = true) {
    let prop = this.props.get(propId);
    if (!prop) {
      // Create dynamically if not found
      prop = this.registerProp({
        id: propId,
        type: PROP_TYPES.SCRAP_CHUNK,
        position: origin
      });
    }

    const origVec = origin instanceof THREE.Vector3
      ? origin.clone()
      : new THREE.Vector3(origin.x || 0, origin.y || 1.6, origin.z || 0);

    const dirVec = lookDirection instanceof THREE.Vector3
      ? lookDirection.clone().normalize()
      : new THREE.Vector3(lookDirection.x || 0, lookDirection.y || 0, lookDirection.z || -1).normalize();

    // Set starting position at player eye height
    prop.position.copy(origVec);

    // Initial impulse: 5.0 m/s forward + upward kick (0, 1.8, 0)
    prop.velocity.set(
      dirVec.x * speed,
      dirVec.y * speed + 1.8,
      dirVec.z * speed
    );

    // Tumbling angular spin
    prop.angularVelocity.set(
      (Math.random() - 0.5) * 8.0,
      (Math.random() - 0.5) * 6.0,
      (Math.random() - 0.5) * 8.0
    );

    prop.isResting = false;
    prop.emfSignature = 0; // Standard player throw doesn't inherently emit paranormal EMF

    if (prop.mesh) {
      prop.mesh.position.copy(prop.position);
    }

    if (emitSocket && this.socket && this.roomId) {
      this.socket.emit('phobia:item-thrown', {
        roomId: this.roomId,
        itemId: propId,
        position: { x: prop.position.x, y: prop.position.y, z: prop.position.z },
        velocity: { x: prop.velocity.x, y: prop.velocity.y, z: prop.velocity.z }
      });
    }

    return {
      success: true,
      propId,
      initialVelocity: prop.velocity.clone()
    };
  }

  /* -------------------------------------------------------------------------- */
  /*             POLTERGEIST ITEM THROWING (Lakatos Ármándó, Point 54)          */
  /* -------------------------------------------------------------------------- */

  /**
   * Triggers Lakatos Ármándó poltergeist multi-prop violent impulse throwing.
   * Selects 3 to 5 nearby props, applies explosive double impulse (9.0 to 15.0 m/s),
   * assigns EMF 5 signatures, and generates a massive site activity spike.
   *
   * @param {Object} options
   * @param {THREE.Vector3|Object} [options.origin] - Ghost epicenter coordinates
   * @param {number} [options.radius=8.0] - Selection search radius
   * @param {THREE.Vector3|Object} [options.targetPlayerPos] - Optional player vector to fling toward
   * @param {number} [options.itemCount] - Explicit count of items (3–5)
   */
  triggerPoltergeistThrow(options = {}) {
    const origin = options.origin instanceof THREE.Vector3
      ? options.origin.clone()
      : new THREE.Vector3(options.origin?.x || 25.0, options.origin?.y || 0.5, options.origin?.z || 20.0);

    const radius = options.radius || 8.0;
    const targetPlayer = options.targetPlayerPos
      ? (options.targetPlayerPos instanceof THREE.Vector3
        ? options.targetPlayerPos
        : new THREE.Vector3(options.targetPlayerPos.x, options.targetPlayerPos.y, options.targetPlayerPos.z))
      : null;

    // Collect props within radius
    const candidates = [];
    this.props.forEach((prop) => {
      const dist = prop.position.distanceTo(origin);
      if (dist <= radius) {
        candidates.push({ prop, dist });
      }
    });

    candidates.sort((a, b) => a.dist - b.dist);

    // Number of props to throw: 3 to 5
    const countToThrow = options.itemCount || Math.min(candidates.length, Math.floor(Math.random() * 3) + 3);
    const thrownProps = [];

    for (let i = 0; i < countToThrow; i++) {
      let targetProp = null;
      if (i < candidates.length) {
        targetProp = candidates[i].prop;
      } else {
        // Spawn an extra scrap chunk if not enough exist nearby
        const newId = `poltergeist_scrap_${Date.now()}_${i}`;
        targetProp = this.registerProp({
          id: newId,
          type: PROP_TYPES.SCRAP_CHUNK,
          position: new THREE.Vector3(
            origin.x + (Math.random() - 0.5) * 3.0,
            origin.y + 0.2,
            origin.z + (Math.random() - 0.5) * 3.0
          )
        });
      }

      // Impulse magnitude: 9.0 to 15.0 m/s (Point 54 / Point 70)
      const impulseForce = 9.0 + Math.random() * 6.0;

      // Direction: toward player with spread, or random explosive outward vector
      let flingDir = new THREE.Vector3();
      if (targetPlayer) {
        flingDir.subVectors(targetPlayer, targetProp.position).normalize();
        flingDir.x += (Math.random() - 0.5) * 0.45;
        flingDir.z += (Math.random() - 0.5) * 0.45;
        flingDir.normalize();
      } else {
        flingDir.set(
          (Math.random() - 0.5) * 2.0,
          Math.random() * 0.3,
          (Math.random() - 0.5) * 2.0
        ).normalize();
      }

      // Upward loft: (0, 2.5, 0)
      targetProp.velocity.set(
        flingDir.x * impulseForce,
        flingDir.y * impulseForce + 2.5,
        flingDir.z * impulseForce
      );

      // Wild spin
      targetProp.angularVelocity.set(
        (Math.random() - 0.5) * 16.0,
        (Math.random() - 0.5) * 16.0,
        (Math.random() - 0.5) * 16.0
      );

      targetProp.isResting = false;
      targetProp.emfSignature = 5; // Lakatos Ármándó poltergeist throw registers EMF 5!

      thrownProps.push({
        id: targetProp.id,
        impulseForce,
        velocity: targetProp.velocity.clone()
      });
    }

    // Van site activity monitor spike: +4 to +6 violence jump (Point 34)
    this.onNoiseSpike(5.5, 'poltergeist_event');

    return {
      success: true,
      ghostArchetype: 'lakatos_armando',
      thrownCount: thrownProps.length,
      props: thrownProps
    };
  }

  /* -------------------------------------------------------------------------- */
  /*                  ZONE 2 CAR ALARM SABOTAGE (Point 55)                      */
  /* -------------------------------------------------------------------------- */

  /**
   * Triggers the Zone 2 Roncsautó Domb car alarm sabotage event.
   * Crushed car headlights blink rapidly (0.2s alternating strobe) and rhythmic
   * blaring horn sounds for exactly 10 seconds, causing a major noise spike.
   *
   * @param {number} [duration=10.0]
   * @param {string} [cause='ghost_sabotage']
   */
  triggerCarAlarm(duration = CAR_ALARM_DURATION, cause = 'ghost_sabotage') {
    this.carAlarm.active = true;
    this.carAlarm.timer = duration;
    this.carAlarm.strobeTimer = 0.0;
    this.carAlarm.strobeState = true;
    this.carAlarm.noiseIntensity = 7.5;

    // Audio SFX trigger
    this.onPlaySound(SFX_KEYS.CAR_ALARM, this.carAlarm.position);

    // Activity monitor spike (attracts ghost roaming focus, masks player footsteps)
    this.onNoiseSpike(this.carAlarm.noiseIntensity, 'car_alarm');

    return {
      active: true,
      duration,
      cause,
      position: this.carAlarm.position.clone()
    };
  }

  /**
   * Stops car alarm immediately.
   */
  stopCarAlarm() {
    this.carAlarm.active = false;
    this.carAlarm.timer = 0.0;
    this.carAlarm.noiseIntensity = 0.0;
    this._setHeadlightsState(false);
  }

  /**
   * Proximity collision check for player bumping into the car in Zone 2.
   * @param {THREE.Vector3|Object} playerPos
   */
  checkCarBump(playerPos) {
    if (this.carAlarm.active) return false;

    const pVec = playerPos instanceof THREE.Vector3
      ? playerPos
      : new THREE.Vector3(playerPos.x || 0, playerPos.y || 0, playerPos.z || 0);

    const dist = pVec.distanceTo(this.carAlarm.position);
    if (dist <= this.carAlarm.bumpRadius) {
      this.triggerCarAlarm(CAR_ALARM_DURATION, 'player_bump');
      return true;
    }
    return false;
  }

  /* -------------------------------------------------------------------------- */
  /*               PUDDLE REFLECTIONS & SURFACE DAMPNESS (Point 56)             */
  /* -------------------------------------------------------------------------- */

  /**
   * Creates a specular reflective puddle mesh on muddy terrain.
   * Ultra-low roughness (0.05), catching player flashlight & floodlight cones.
   */
  createPuddleMesh(x, z, radiusX = 1.6, radiusZ = 1.2, rotationY = 0) {
    const puddleGeo = new THREE.CircleGeometry(1.0, 24);
    puddleGeo.rotateX(-Math.PI / 2);
    puddleGeo.scale(radiusX, 1.0, radiusZ);

    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x11161d,
      roughness: 0.05, // Near-mirror specular reflection
      metalness: 0.85,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(puddleGeo, puddleMat);
    mesh.position.set(x, 0.012, z); // Low profile above terrain to avoid Z-fighting
    mesh.rotation.y = rotationY;
    mesh.receiveShadow = true;

    const puddleRecord = {
      mesh,
      position: new THREE.Vector3(x, 0.012, z),
      baseColor: 0x11161d,
      material: puddleMat
    };

    this.puddles.push(puddleRecord);
    if (this.scene) {
      this.scene.add(mesh);
    }

    return mesh;
  }

  /**
   * Sets the environmental surface dampness factor (0.0 = dry, 1.0 = soaked mud).
   */
  setSurfaceDampness(factor) {
    this.dampnessFactor = Math.max(0.0, Math.min(1.0, factor));
    // Mud roughness decreases as dampness increases (0.85 -> 0.35)
    const dynamicMudRoughness = 0.85 - this.dampnessFactor * 0.50;

    this.puddles.forEach((p) => {
      p.material.roughness = Math.max(0.03, 0.05 * (1.1 - this.dampnessFactor));
    });

    return { dampnessFactor: this.dampnessFactor, dynamicMudRoughness };
  }

  /* -------------------------------------------------------------------------- */
  /*                            PHYSICS UPDATE TICK                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Steps the physics simulation:
   * - Prop gravity arc, velocity integration, floor bounce, angular spin
   * - Car alarm countdown and headlight strobe alternation
   * - Puddle micro-ripple normal animation
   *
   * @param {number} dt - Time delta in seconds
   */
  update(dt = 0.016) {
    // 1. Scrap Props Physics Simulation
    this.props.forEach((prop) => {
      if (prop.isResting) return;

      // Apply downward gravitational acceleration: g = -9.81 m/s^2
      prop.velocity.y += DEFAULT_GRAVITY * dt;

      // Integrate translation
      prop.position.x += prop.velocity.x * dt;
      prop.position.y += prop.velocity.y * dt;
      prop.position.z += prop.velocity.z * dt;

      // Integrate angular rotation
      prop.rotation.x += prop.angularVelocity.x * dt;
      prop.rotation.y += prop.angularVelocity.y * dt;
      prop.rotation.z += prop.angularVelocity.z * dt;

      // Ground Collision Detection
      if (prop.position.y <= prop.groundY) {
        prop.position.y = prop.groundY;

        const impactSpeed = Math.abs(prop.velocity.y);
        prop.lastImpactSpeed = impactSpeed;

        // Sound on impact if impact speed > 0.8 m/s
        if (impactSpeed > 0.8) {
          this.onPlaySound(SFX_KEYS.SCRAP_DROP, prop.position);
        }

        // Restitution bounce: v_y = -v_y * 0.35 (Point 29 / 54)
        prop.velocity.y = -prop.velocity.y * prop.restitution;

        // Surface friction damping
        prop.velocity.x *= 0.70;
        prop.velocity.z *= 0.70;
        prop.angularVelocity.multiplyScalar(0.55);

        // Check if motion has come to rest
        const horizontalSpeedSq = prop.velocity.x * prop.velocity.x + prop.velocity.z * prop.velocity.z;
        if (impactSpeed < 0.25 && horizontalSpeedSq < 0.04) {
          prop.velocity.set(0, 0, 0);
          prop.angularVelocity.set(0, 0, 0);
          prop.isResting = true;
        }
      }

      // Update 3D mesh transformation
      if (prop.mesh) {
        prop.mesh.position.copy(prop.position);
        prop.mesh.rotation.copy(prop.rotation);
      }
    });

    // 2. Car Alarm Simulation (Zone 2)
    if (this.carAlarm.active) {
      this.carAlarm.timer -= dt;

      // Alternating headlight strobe (5 Hz / 0.2s)
      this.carAlarm.strobeTimer += dt;
      if (this.carAlarm.strobeTimer >= this.carAlarm.strobeFreq) {
        this.carAlarm.strobeTimer = 0.0;
        this.carAlarm.strobeState = !this.carAlarm.strobeState;
        this._setHeadlightsState(this.carAlarm.strobeState);
      }

      if (this.carAlarm.timer <= 0) {
        this.stopCarAlarm();
      }
    }

    // 3. Puddle Animated Micro-Ripples
    this.rippleTime += dt;
    if (this.puddles.length > 0) {
      const rippleWave = Math.sin(this.rippleTime * 6.0) * 0.01;
      this.puddles.forEach((p) => {
        p.material.opacity = 0.86 + rippleWave;
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             NETWORKING SOCKET                              */
  /* -------------------------------------------------------------------------- */

  attachSocket(socket, roomId) {
    this.detachSocket();
    this.socket = socket;
    this.roomId = roomId;

    if (!this.socket) return;

    this._onItemThrown = (raw) => {
      if (!raw) return;
      // Accepts both the client shape (itemId/position/velocity) and the server shapes
      // ({ propId, x, y, z, impulse } for ghost throws, { item, impulse } for player drops).
      const data = {
        itemId: raw.itemId || raw.propId || raw.item?.id,
        position: raw.position || (typeof (raw.x ?? raw.item?.x) === 'number'
          ? { x: raw.x ?? raw.item.x, y: raw.y ?? raw.item.y, z: raw.z ?? raw.item.z }
          : null),
        velocity: raw.velocity || (Array.isArray(raw.impulse) && raw.impulse.length === 3
          ? { x: raw.impulse[0], y: raw.impulse[1], z: raw.impulse[2] }
          : null)
      };
      if (!data.itemId) return;
      let prop = this.props.get(data.itemId);
      if (!prop) {
        prop = this.registerProp({
          id: data.itemId,
          type: PROP_TYPES.SCRAP_CHUNK,
          position: data.position
        });
      }

      if (data.position) {
        prop.position.set(data.position.x, data.position.y, data.position.z);
      }
      if (data.velocity) {
        prop.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        prop.isResting = false;
      }
    };

    this.socket.on('phobia:item-thrown', this._onItemThrown);
  }

  detachSocket() {
    if (this.socket && this._onItemThrown) {
      this.socket.off('phobia:item-thrown', this._onItemThrown);
    }
    this.socket = null;
    this.roomId = null;
  }

  /* -------------------------------------------------------------------------- */
  /*                          INTERNAL INITIALIZATION                           */
  /* -------------------------------------------------------------------------- */

  _getDefaultMass(type) {
    switch (type) {
      case PROP_TYPES.RADIATOR: return 25.0; // Cast-iron heating radiator
      case PROP_TYPES.BATTERY: return 14.0;  // Lead-acid car battery
      case PROP_TYPES.PIPE: return 5.5;      // Heavy rusted iron pipe
      case PROP_TYPES.MUFFLER: return 7.0;   // Automotive steel muffler
      case PROP_TYPES.BEER_CAN: return 0.2;  // Empty Kőbányai beer can
      default: return 3.5;                  // Generic scrap chunk
    }
  }

  _initDefaultScrapProps() {
    // Standard scrap items placed around Zone 2, 4, 5
    const defaults = [
      { id: 'scrap_pipe_zone5_1', type: PROP_TYPES.PIPE, nameHu: 'Vastölténycső', pos: [22.5, 0.12, 10.5] },
      { id: 'scrap_pipe_zone5_2', type: PROP_TYPES.PIPE, nameHu: 'Rozsdás Vízcső', pos: [26.0, 0.12, 22.0] },
      { id: 'scrap_can_zone1', type: PROP_TYPES.BEER_CAN, nameHu: 'Kőbányai Sörösdoboz', pos: [10.5, 0.08, 4.0] },
      { id: 'scrap_can_zone5', type: PROP_TYPES.BEER_CAN, nameHu: 'Üres Sörösdoboz', pos: [25.0, 0.08, 15.0] },
      { id: 'scrap_battery_zone2', type: PROP_TYPES.BATTERY, nameHu: 'Autóakkumulátor', pos: [-14.5, 0.15, 12.0] },
      { id: 'scrap_radiator_zone5', type: PROP_TYPES.RADIATOR, nameHu: 'Öntöttvas Radiátordarab', pos: [28.0, 0.22, 26.0] },
      { id: 'scrap_muffler_zone2', type: PROP_TYPES.MUFFLER, nameHu: 'Kipufogódob', pos: [-18.5, 0.15, 18.0] }
    ];

    defaults.forEach((def) => {
      const mesh = this._createProceduralPropMesh(def.type);
      this.registerProp({
        id: def.id,
        type: def.type,
        nameHu: def.nameHu,
        position: new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]),
        mesh
      });
    });
  }

  _createProceduralPropMesh(type) {
    let geo;
    let mat;

    switch (type) {
      case PROP_TYPES.RADIATOR:
        geo = new THREE.BoxGeometry(0.55, 0.40, 0.18);
        mat = new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.8, metalness: 0.6 });
        break;
      case PROP_TYPES.BATTERY:
        geo = new THREE.BoxGeometry(0.28, 0.22, 0.18);
        mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
        break;
      case PROP_TYPES.PIPE:
        geo = new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8);
        geo.rotateZ(Math.PI / 2);
        mat = new THREE.MeshStandardMaterial({ color: 0x7a4325, roughness: 0.85, metalness: 0.3 });
        break;
      case PROP_TYPES.BEER_CAN:
        geo = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10);
        mat = new THREE.MeshStandardMaterial({ color: 0xb5a045, metalness: 0.7, roughness: 0.3 });
        break;
      case PROP_TYPES.MUFFLER:
        geo = new THREE.BoxGeometry(0.22, 0.18, 0.65);
        mat = new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.9, metalness: 0.4 });
        break;
      default:
        geo = new THREE.DodecahedronGeometry(0.12);
        mat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 0.8 });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  _initCarAlarmComponents() {
    // 2x Headlights for Zone 2 orange Lada alarm prop
    const leftHeadlight = new THREE.SpotLight(0xffea88, 0, 14.0, Math.PI / 6, 0.4, 2.0);
    leftHeadlight.position.set(-15.6, 0.9, 14.8);
    leftHeadlight.target.position.set(-15.6, 0.0, 22.0);

    const rightHeadlight = new THREE.SpotLight(0xffea88, 0, 14.0, Math.PI / 6, 0.4, 2.0);
    rightHeadlight.position.set(-16.4, 0.9, 14.8);
    rightHeadlight.target.position.set(-16.4, 0.0, 22.0);

    if (this.scene) {
      this.scene.add(leftHeadlight);
      this.scene.add(leftHeadlight.target);
      this.scene.add(rightHeadlight);
      this.scene.add(rightHeadlight.target);
    }

    this.carAlarm.headlights = [leftHeadlight, rightHeadlight];
  }

  _setHeadlightsState(on) {
    const intensity = on ? 3.5 : 0.0;
    this.carAlarm.headlights.forEach((hl) => {
      hl.intensity = intensity;
      hl.visible = on;
    });
  }

  _initPuddleMaterials() {
    // Spawn realistic puddles in muddy areas (Zone 4, Zone 5, paths)
    const puddleCoords = [
      { x: 24.0, z: 14.0, rx: 1.8, rz: 1.3, rot: 0.2 },
      { x: 28.5, z: 25.0, rx: 2.2, rz: 1.6, rot: -0.4 },
      { x: -18.0, z: 34.0, rx: 1.5, rz: 1.1, rot: 0.6 },
      { x: 6.0, z: 18.0, rx: 1.7, rz: 1.4, rot: 0.1 }
    ];

    puddleCoords.forEach((c) => {
      this.createPuddleMesh(c.x, c.z, c.rx, c.rz, c.rot);
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                                 CLEANUP                                    */
  /* -------------------------------------------------------------------------- */

  dispose() {
    this.detachSocket();
    this.stopCarAlarm();

    // Clean props
    this.props.forEach((prop) => {
      if (prop.mesh) {
        if (prop.mesh.parent) prop.mesh.parent.remove(prop.mesh);
        prop.mesh.geometry?.dispose();
        prop.mesh.material?.dispose();
      }
    });
    this.props.clear();

    // Clean puddles
    this.puddles.forEach((p) => {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mesh.geometry?.dispose();
      p.mesh.material?.dispose();
    });
    this.puddles = [];

    // Clean headlights
    this.carAlarm.headlights.forEach((hl) => {
      if (hl.parent) hl.parent.remove(hl);
    });
    this.carAlarm.headlights = [];

    if (this.scene && this.physicsGroup.parent) {
      this.scene.remove(this.physicsGroup);
    }
  }
}
