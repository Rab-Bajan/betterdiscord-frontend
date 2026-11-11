import * as THREE from 'three';

/**
 * ElectricalSystem.js
 *
 * Authoritative client-side electrical grid controller for MiskolcPhobia.
 * Implements Points 48–53 of the MiskolcPhobia 100-point specification:
 * - Master breaker knife switch logic on exterior wall of Mázsaház (Zone 1)
 * - Load capacity governor: Maximum 6 active lights across all 5 zones
 * - Overload trip on 7th light (sfx_breaker_buzz, instant blackout, spark particles)
 * - Roaming ghost sabotage probability (15% base, 40% for Bunkó Lajos)
 * - Clickable wall light switches throughout Mázsaház, Nagy Hangár, and Sufni
 * - Lightbulb shatter events during intense manifestations / Rostás "Flexes" Béla scream
 * - Full Socket.io synchronization (phobia:breaker-toggle, phobia:light-toggle)
 * - Temperature & sanity decay acceleration when unpowered
 */

export const MAX_BREAKER_LIGHTS = 6;
export const GHOST_SABOTAGE_BASE_PROB = 0.15;
export const GHOST_SABOTAGE_BUNKO_PROB = 0.40;

export const BREAKER_POSITION = Object.freeze({ x: 8.0, y: 1.4, z: 5.0 });

export const SFX_KEYS = Object.freeze({
  BREAKER_FLIP: 'sfx_breaker_flip',
  BREAKER_BUZZ: 'sfx_breaker_buzz',
  SWITCH_CLICK: 'sfx_switch_click',
  BULB_SHATTER: 'sfx_bulb_shatter'
});

export const KNIFE_SWITCH_ANGLES = Object.freeze({
  ON: Math.PI / 4,    // +45 degrees UP
  OFF: -Math.PI / 4   // -45 degrees DOWN
});

export class ElectricalSystem {
  /**
   * @param {Object} options
   * @param {THREE.Scene} [options.scene] - Three.js scene for meshes & particles
   * @param {Object} [options.map] - ScrapYardMap instance if available
   * @param {Function} [options.onPlaySound] - Audio callback (sfxKey, position)
   * @param {number} [options.maxCapacity=6] - Max active lights before trip
   * @param {Object} [options.socket] - Socket.io client instance
   * @param {string} [options.roomId] - Room identifier for networking
   */
  constructor(options = {}) {
    this.scene = options.scene || null;
    this.map = options.map || null;
    this.onPlaySound = options.onPlaySound || ((_sfx, _pos) => {});
    this.maxCapacity = typeof options.maxCapacity === 'number' ? options.maxCapacity : MAX_BREAKER_LIGHTS;

    // Master breaker state
    this.isOn = true;
    this.tripped = false;
    this.trippedReason = null; // 'OVERLOAD' | 'GHOST_SABOTAGE' | 'MANUAL' | null

    // Track active and shattered light IDs
    this.activeLights = new Set();
    this.shatteredLights = new Set();

    // Registry of light fixtures: id -> FixtureRecord
    // FixtureRecord: { id, name, zone, light, fixtureMesh, switchMesh, switchState, isOn, shattered, intensity, color }
    this.fixtures = new Map();

    // Registry of switches: id -> SwitchRecord
    // SwitchRecord: { id, zone, fixtureIds: [], switchMesh, leverMesh, state }
    this.switches = new Map();

    // 3D physical breaker mesh components
    this.breakerGroup = null;
    this.knifeSwitchPivot = null;

    // Particle simulation for breaker sparks & shattered bulb glass
    this.particles = [];
    this.particleGroup = new THREE.Group();
    this.particleGroup.name = 'Electrical_Particles';
    if (this.scene) {
      this.scene.add(this.particleGroup);
    }

    // Thermal simulation state
    this.indoorTemp = 18.0;      // Normal heated indoor temp (°C)
    this.targetOutdoorTemp = 2.0; // Unheated / exterior ambient temp (°C)
    this.coolingRate = 0.25;     // °C per second when breaker is OFF

    // Networking
    this.socket = null;
    this.roomId = null;
    if (options.socket) {
      this.attachSocket(options.socket, options.roomId);
    }

    // Auto-hook into ScrapYardMap if provided
    if (this.map) {
      this._hookIntoScrapYardMap(this.map);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                            FIXTURE REGISTRATION                            */
  /* -------------------------------------------------------------------------- */

  /**
   * Registers a light fixture with the electrical grid.
   * @param {Object} config
   * @param {string} config.id - Unique light identifier
   * @param {string} [config.name] - Human-readable name
   * @param {string} [config.zone] - Zone id ('zone1_mazsahaz', 'zone3_hangar', etc.)
   * @param {THREE.Light} [config.light] - Three.js light object
   * @param {THREE.Object3D} [config.fixtureMesh] - Lightbulb / fixture casing mesh
   * @param {THREE.Object3D} [config.switchMesh] - Clickable wall switch mesh
   * @param {boolean} [config.isOn=false] - Initial powered state
   * @param {number} [config.intensity=2.0] - Target light intensity when ON
   * @param {THREE.Vector3|Object} [config.position] - Spatial coordinates
   */
  registerFixture(config) {
    if (!config || !config.id) {
      throw new Error('ElectricalSystem: registerFixture requires an id');
    }

    const id = config.id;
    const initialOn = Boolean(config.isOn);

    const record = {
      id,
      name: config.name || id,
      zone: config.zone || 'yard',
      light: config.light || null,
      fixtureMesh: config.fixtureMesh || null,
      switchMesh: config.switchMesh || null,
      switchState: initialOn,
      isOn: initialOn && this.isOn,
      shattered: false,
      intensity: typeof config.intensity === 'number' ? config.intensity : (config.light?.intensity || 2.0),
      color: config.light?.color?.getHex() || 0xffcc77,
      position: config.position || (config.light?.position ? config.light.position.clone() : new THREE.Vector3())
    };

    if (record.light) {
      record.light.visible = record.isOn;
      record.light.intensity = record.isOn ? record.intensity : 0;
    }

    this.fixtures.set(id, record);

    if (record.isOn) {
      this.activeLights.add(id);
    }

    return record;
  }

  /**
   * Registers a wall light switch controlling one or more fixtures.
   * @param {Object} config
   * @param {string} config.id - Switch ID
   * @param {string} [config.zone] - Zone ID
   * @param {Array<string>} [config.fixtureIds] - Controlled fixture IDs
   * @param {THREE.Object3D} [config.switchMesh] - Interactive mesh
   * @param {THREE.Object3D} [config.leverMesh] - Toggle lever mesh for rotation
   */
  registerSwitch(config) {
    if (!config || !config.id) {
      throw new Error('ElectricalSystem: registerSwitch requires an id');
    }

    const record = {
      id: config.id,
      zone: config.zone || 'yard',
      fixtureIds: Array.isArray(config.fixtureIds) ? [...config.fixtureIds] : [],
      switchMesh: config.switchMesh || null,
      leverMesh: config.leverMesh || null,
      state: false
    };

    if (record.switchMesh) {
      record.switchMesh.userData = {
        ...(record.switchMesh.userData || {}),
        isInteractive: true,
        action: 'electrical_switch',
        switchId: record.id,
        promptHu: '[E] Villanykapcsoló'
      };
    }

    this.switches.set(config.id, record);
    return record;
  }

  /* -------------------------------------------------------------------------- */
  /*                        MASTER BREAKER KNIFE SWITCH                         */
  /* -------------------------------------------------------------------------- */

  /**
   * Directly sets the master circuit breaker state.
   * @param {boolean} isOn - Desired power state
   * @param {string} [reason='USER'] - Trigger reason ('USER', 'OVERLOAD', 'GHOST_SABOTAGE', 'SERVER')
   * @param {boolean} [emitSocket=true] - Whether to emit network packet
   */
  setBreakerState(isOn, reason = 'USER', emitSocket = true) {
    const nextState = Boolean(isOn);
    if (this.isOn === nextState && !this.tripped) {
      return { breakerOn: this.isOn, changed: false };
    }

    this.isOn = nextState;

    if (!this.isOn) {
      this.tripped = true;
      this.trippedReason = reason;

      // Animate knife switch DOWN
      if (this.knifeSwitchPivot) {
        this.knifeSwitchPivot.rotation.x = KNIFE_SWITCH_ANGLES.OFF;
      }

      // Blackout: turn off all lights across all 5 zones
      this.fixtures.forEach((fix) => {
        if (fix.light) {
          fix.light.visible = false;
          fix.light.intensity = 0;
        }
        fix.isOn = false;
      });
      this.activeLights.clear();

      // Trigger SFX
      if (reason === 'OVERLOAD') {
        this.onPlaySound(SFX_KEYS.BREAKER_BUZZ, BREAKER_POSITION);
        this.onPlaySound(SFX_KEYS.BREAKER_FLIP, BREAKER_POSITION);
        this.spawnSparks(BREAKER_POSITION, 30, 0xff9922);
      } else {
        this.onPlaySound(SFX_KEYS.BREAKER_FLIP, BREAKER_POSITION);
      }
    } else {
      // Breaker flipped back ON
      this.tripped = false;
      this.trippedReason = null;

      // Animate knife switch UP
      if (this.knifeSwitchPivot) {
        this.knifeSwitchPivot.rotation.x = KNIFE_SWITCH_ANGLES.ON;
      }

      this.onPlaySound(SFX_KEYS.BREAKER_FLIP, BREAKER_POSITION);

      // Restore lights whose physical switches are still engaged (up to maxCapacity)
      let restoredCount = 0;
      this.fixtures.forEach((fix, id) => {
        if (fix.switchState && !fix.shattered && restoredCount < this.maxCapacity) {
          fix.isOn = true;
          if (fix.light) {
            fix.light.visible = true;
            fix.light.intensity = fix.intensity;
          }
          this.activeLights.add(id);
          restoredCount++;
        }
      });
    }

    // Synchronize to ScrapYardMap if hooked
    if (this.map && typeof this.map.setBreakerState === 'function') {
      if (this.map.isBreakerOn !== this.isOn) {
        this.map.setBreakerState(this.isOn, reason);
      }
    }

    // Network broadcast
    if (emitSocket && this.socket && this.roomId) {
      this.socket.emit('phobia:breaker-toggle', {
        roomId: this.roomId,
        state: this.isOn,
        reason
      });
    }

    return {
      breakerOn: this.isOn,
      tripped: this.tripped,
      reason,
      activeLightCount: this.activeLights.size
    };
  }

  /**
   * Applies the authoritative server electrical state verbatim (no sockets, no SFX).
   * @param {{breakerOn?: boolean, activeLights?: string[]}} state
   */
  syncFromServer(state = {}) {
    if (typeof state.breakerOn === 'boolean') {
      const wasOn = this.isOn;
      this.isOn = state.breakerOn;
      this.tripped = !state.breakerOn;
      if (this.knifeSwitchPivot) {
        this.knifeSwitchPivot.rotation.x = this.isOn ? KNIFE_SWITCH_ANGLES.ON : KNIFE_SWITCH_ANGLES.OFF;
      }
      if (this.map) {
        this.map.isBreakerOn = this.isOn;
        this.map.breakerTripped = !this.isOn;
        if (this.map.knifeSwitchPivot) {
          this.map.knifeSwitchPivot.rotation.x = this.isOn ? Math.PI / 4 : -Math.PI / 4;
        }
      }
      if (wasOn !== this.isOn) {
        this.onPlaySound(SFX_KEYS.BREAKER_FLIP, BREAKER_POSITION);
      }
    }

    const active = Array.isArray(state.activeLights) ? new Set(state.activeLights) : null;
    this.fixtures.forEach((fix, id) => {
      const on = this.isOn && !fix.shattered && (active ? active.has(id) : fix.isOn);
      fix.isOn = on;
      fix.switchState = active ? active.has(id) : fix.switchState;
      if (fix.light) {
        fix.light.visible = on;
        fix.light.intensity = on ? fix.intensity : 0;
      }
      if (on) this.activeLights.add(id);
      else this.activeLights.delete(id);
    });
    // Keep the ScrapYardMap mirror consistent for HUD / prompts
    if (this.map) {
      this.map.activeLights = new Set(this.activeLights);
    }
  }

  /**
   * Toggles the master breaker switch (UP/DOWN).
   */
  toggleBreaker(reason = 'USER', emitSocket = true) {
    return this.setBreakerState(!this.isOn, reason, emitSocket);
  }

  /**
   * Trips the breaker immediately due to overload or fault.
   */
  tripBreaker(reason = 'OVERLOAD', emitSocket = true) {
    return this.setBreakerState(false, reason, emitSocket);
  }

  /* -------------------------------------------------------------------------- */
  /*                          LIGHT SWITCH INTERACTIONS                         */
  /* -------------------------------------------------------------------------- */

  /**
   * Toggles an individual light fixture by lightId.
   * Enforces the Point 50 Overload Rule:
   * Maximum 6 active lights; attempting to turn on a 7th trips breaker immediately.
   *
   * @param {string} lightId
   * @param {boolean} [emitSocket=true]
   * @returns {Object} { success, lightOn, tripped, breakerOff, reason }
   */
  toggleLight(lightId, emitSocket = true) {
    const fixture = this.fixtures.get(lightId);
    if (!fixture) {
      return { success: false, reason: 'not_found' };
    }

    if (fixture.shattered) {
      return { success: false, reason: 'shattered', lightOn: false };
    }

    // Case 1: Breaker is OFF
    if (!this.isOn) {
      fixture.switchState = !fixture.switchState;
      this.onPlaySound(SFX_KEYS.SWITCH_CLICK, fixture.position);
      return { success: true, lightOn: false, breakerOff: true };
    }

    // Case 2: Light is currently ON -> Turning it OFF
    if (fixture.isOn) {
      fixture.isOn = false;
      fixture.switchState = false;
      if (fixture.light) {
        fixture.light.visible = false;
        fixture.light.intensity = 0;
      }
      this.activeLights.delete(lightId);
      this.onPlaySound(SFX_KEYS.SWITCH_CLICK, fixture.position);

      if (emitSocket && this.socket && this.roomId) {
        this.socket.emit('phobia:light-toggle', {
          roomId: this.roomId,
          lightId
        });
      }

      return { success: true, lightOn: false, activeCount: this.activeLights.size };
    }

    // Case 3: Light is currently OFF -> Attempting to turn ON
    // Point 50: Check load capacity! If already at 6, turning on 7th trips breaker!
    if (this.activeLights.size >= this.maxCapacity) {
      // OVERLOAD! Immediate blackout!
      fixture.switchState = true;
      this.tripBreaker('OVERLOAD', emitSocket);

      return {
        success: true,
        tripped: true,
        lightOn: false,
        reason: 'OVERLOAD',
        activeCount: 0
      };
    }

    // Safe to turn on
    fixture.isOn = true;
    fixture.switchState = true;
    if (fixture.light) {
      fixture.light.visible = true;
      fixture.light.intensity = fixture.intensity;
    }
    this.activeLights.add(lightId);
    this.onPlaySound(SFX_KEYS.SWITCH_CLICK, fixture.position);

    if (emitSocket && this.socket && this.roomId) {
      this.socket.emit('phobia:light-toggle', {
        roomId: this.roomId,
        lightId
      });
    }

    return {
      success: true,
      lightOn: true,
      tripped: false,
      activeCount: this.activeLights.size
    };
  }

  /**
   * Toggles a wall switch, affecting all fixtures bound to it.
   */
  toggleSwitch(switchId, emitSocket = true) {
    const sw = this.switches.get(switchId);
    if (!sw) {
      // Fallback: Check if switchId matches a fixture ID directly
      if (this.fixtures.has(switchId)) {
        return this.toggleLight(switchId, emitSocket);
      }
      return { success: false, reason: 'switch_not_found' };
    }

    sw.state = !sw.state;
    if (sw.leverMesh) {
      sw.leverMesh.rotation.x = sw.state ? 0.35 : -0.35;
    }

    let lastResult = null;
    sw.fixtureIds.forEach((fixId) => {
      lastResult = this.toggleLight(fixId, emitSocket);
    });

    return lastResult || { success: true, state: sw.state };
  }

  /* -------------------------------------------------------------------------- */
  /*                         GHOST SABOTAGE (Point 51)                          */
  /* -------------------------------------------------------------------------- */

  /**
   * Evaluates ghost sabotage roll on the circuit breaker.
   * - Standard roaming ghost: 15% probability per roaming decision
   * - Bunkó Lajos (Fagyos Rezes): 40% probability
   *
   * @param {string} [ghostType='standard'] - Ghost archetype identifier
   * @returns {boolean} Whether sabotage occurred
   */
  rollGhostSabotage(ghostType = 'standard') {
    if (!this.isOn) return false; // Already dark

    const isBunko = ghostType === 'bunko_lajos' || ghostType === 'bunko';
    const sabotageProb = isBunko ? GHOST_SABOTAGE_BUNKO_PROB : GHOST_SABOTAGE_BASE_PROB;

    const roll = Math.random();
    if (roll < sabotageProb) {
      this.sabotageBreaker(ghostType, true);
      return true;
    }

    return false;
  }

  /**
   * Forcibly trips breaker as a ghost sabotage action.
   */
  sabotageBreaker(ghostType = 'standard', emitSocket = true) {
    return this.setBreakerState(false, 'GHOST_SABOTAGE', emitSocket);
  }

  /* -------------------------------------------------------------------------- */
  /*                      LIGHTBULB SHATTER (Point 53)                          */
  /* -------------------------------------------------------------------------- */

  /**
   * Permanently shatters a light fixture.
   * Triggered during intense ghost events or when Rostás "Flexes" Béla screams.
   *
   * @param {string} lightId
   * @param {boolean} [emitSocket=true]
   */
  shatterLight(lightId, emitSocket = true) {
    const fixture = this.fixtures.get(lightId);
    if (!fixture) return { success: false, reason: 'not_found' };
    if (fixture.shattered) return { success: false, reason: 'already_shattered' };

    fixture.shattered = true;
    fixture.isOn = false;
    fixture.switchState = false;

    if (fixture.light) {
      // Blinding flash burst before extinguishing
      const origIntensity = fixture.intensity;
      fixture.light.intensity = origIntensity * 3.5;
      fixture.light.visible = true;

      setTimeout(() => {
        if (fixture.light) {
          fixture.light.visible = false;
          fixture.light.intensity = 0;
        }
      }, 120);
    }

    this.activeLights.delete(lightId);
    this.shatteredLights.add(lightId);

    // Audio crunch and pop
    this.onPlaySound(SFX_KEYS.BULB_SHATTER, fixture.position);

    // Visual glass crunch and sparks particles
    this.spawnShatterParticles(fixture.position, 35);

    // Synchronize to map if available
    if (this.map && typeof this.map.shatterLight === 'function') {
      this.map.shatterLight(lightId);
    }

    if (emitSocket && this.socket && this.roomId) {
      this.socket.emit('phobia:lightbulb-shattered', {
        roomId: this.roomId,
        lightId
      });
    }

    return {
      success: true,
      shatteredId: lightId,
      remainingActive: this.activeLights.size
    };
  }

  /**
   * Ghost scream event (e.g. Rostás Béla): shatters the nearest light fixture.
   * @param {THREE.Vector3|Object} screamOrigin
   * @param {number} [radius=15.0]
   * @param {string} [ghostType='rostas_bela']
   */
  triggerGhostScreamShatter(screamOrigin, radius = 15.0, ghostType = 'rostas_bela') {
    const originVec = screamOrigin instanceof THREE.Vector3
      ? screamOrigin
      : new THREE.Vector3(screamOrigin.x || 0, screamOrigin.y || 0, screamOrigin.z || 0);

    let closestFixture = null;
    let closestDistSq = radius * radius;

    this.fixtures.forEach((fix) => {
      if (fix.shattered) return;
      const distSq = fix.position.distanceToSquared(originVec);
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestFixture = fix;
      }
    });

    if (closestFixture) {
      return this.shatterLight(closestFixture.id, true);
    }

    return { success: false, reason: 'no_nearby_fixture' };
  }

  /* -------------------------------------------------------------------------- */
  /*                            PARTICLE SIMULATION                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Spawns electrical spark particles (e.g. on breaker overload or sabotage).
   */
  spawnSparks(position, count = 25, colorHex = 0xffaa33) {
    const pos = position instanceof THREE.Vector3
      ? position
      : new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0);

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x + (Math.random() - 0.5) * 0.1;
      positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.1;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.1;

      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 4.0,
        Math.random() * 3.5 + 0.8,
        (Math.random() - 0.5) * 4.0
      ));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.08,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.particleGroup.add(points);

    this.particles.push({
      mesh: points,
      velocities,
      lifetime: 0.65,
      age: 0,
      groundY: pos.y - 1.2
    });
  }

  /**
   * Spawns falling glass shard and spark particles when lightbulb pops.
   */
  spawnShatterParticles(position, count = 35) {
    const pos = position instanceof THREE.Vector3
      ? position
      : new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0);

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      // Burst outward and fall
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 3.2,
        Math.random() * 1.5 - 0.5,
        (Math.random() - 0.5) * 3.2
      ));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffeeaa,
      size: 0.06,
      transparent: true,
      opacity: 1.0,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.particleGroup.add(points);

    this.particles.push({
      mesh: points,
      velocities,
      lifetime: 1.2,
      age: 0,
      groundY: 0.05
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                             UPDATE / TICK LOOP                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Per-frame physics, particle, and temperature update.
   * @param {number} dt - Elapsed seconds
   */
  update(dt = 0.016) {
    // 1. Temperature Simulation
    if (!this.isOn) {
      // Decline towards outdoor ambient temperature
      if (this.indoorTemp > this.targetOutdoorTemp) {
        this.indoorTemp = Math.max(
          this.targetOutdoorTemp,
          this.indoorTemp - this.coolingRate * dt
        );
      }
    } else {
      // Recover to heated indoor temperature
      if (this.indoorTemp < 18.0) {
        this.indoorTemp = Math.min(18.0, this.indoorTemp + (this.coolingRate * 0.5) * dt);
      }
    }

    // 2. Particle Simulation
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;

      if (p.age >= p.lifetime) {
        this.particleGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      const attr = p.mesh.geometry.attributes.position;
      const posArray = attr.array;
      const count = p.velocities.length;
      const gravity = -9.81 * dt;

      for (let j = 0; j < count; j++) {
        const vel = p.velocities[j];
        vel.y += gravity;

        posArray[j * 3 + 0] += vel.x * dt;
        posArray[j * 3 + 1] += vel.y * dt;
        posArray[j * 3 + 2] += vel.z * dt;

        // Floor bounce
        if (posArray[j * 3 + 1] < p.groundY) {
          posArray[j * 3 + 1] = p.groundY;
          vel.y = -vel.y * 0.35;
          vel.x *= 0.7;
          vel.z *= 0.7;
        }
      }

      attr.needsUpdate = true;
      p.mesh.material.opacity = 1.0 - (p.age / p.lifetime);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                            NETWORKING & SOCKET                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Attaches a Socket.io client and wires up authoritative network events.
   */
  attachSocket(socket, roomId) {
    this.detachSocket();
    this.socket = socket;
    this.roomId = roomId;

    if (!this.socket) return;

    this._onBreakerUpdated = (data) => {
      if (data && typeof data.breakerOn === 'boolean') {
        // Server is authoritative: lights stay off after a breaker reset until toggled again
        this.syncFromServer({
          breakerOn: data.breakerOn,
          activeLights: Array.isArray(data.activeLights) ? data.activeLights : (data.breakerOn ? Array.from(this.activeLights) : [])
        });
      }
    };

    this._onBreakerTripped = (data) => {
      this.tripBreaker(data?.reason || 'OVERLOAD', false);
    };

    this._onLightUpdated = (data) => {
      if (!data || !data.lightId) return;
      if (Array.isArray(data.activeLights)) {
        this.syncFromServer({ activeLights: data.activeLights });
        this.onPlaySound(SFX_KEYS.SWITCH_CLICK, this.fixtures.get(data.lightId)?.position || BREAKER_POSITION);
        return;
      }
      const fixture = this.fixtures.get(data.lightId);
      if (fixture && !fixture.shattered) {
        fixture.isOn = Boolean(data.state) && this.isOn;
        if (fixture.light) {
          fixture.light.visible = fixture.isOn;
          fixture.light.intensity = fixture.isOn ? fixture.intensity : 0;
        }
        if (fixture.isOn) this.activeLights.add(data.lightId);
        else this.activeLights.delete(data.lightId);
      }
    };

    this._onLightbulbShattered = (data) => {
      if (data?.lightId) {
        this.shatterLight(data.lightId, false);
      }
    };

    this.socket.on('phobia:breaker-updated', this._onBreakerUpdated);
    this.socket.on('phobia:breaker-state', this._onBreakerUpdated);
    this.socket.on('phobia:breaker-tripped', this._onBreakerTripped);
    this.socket.on('phobia:light-updated', this._onLightUpdated);
    this.socket.on('phobia:light-toggled', this._onLightUpdated);
    this.socket.on('phobia:lightbulb-shattered', this._onLightbulbShattered);
  }

  detachSocket() {
    if (this.socket) {
      if (this._onBreakerUpdated) {
        this.socket.off('phobia:breaker-updated', this._onBreakerUpdated);
        this.socket.off('phobia:breaker-state', this._onBreakerUpdated);
      }
      if (this._onBreakerTripped) {
        this.socket.off('phobia:breaker-tripped', this._onBreakerTripped);
      }
      if (this._onLightUpdated) {
        this.socket.off('phobia:light-updated', this._onLightUpdated);
        this.socket.off('phobia:light-toggled', this._onLightUpdated);
      }
      if (this._onLightbulbShattered) {
        this.socket.off('phobia:lightbulb-shattered', this._onLightbulbShattered);
      }
    }

    this.socket = null;
    this.roomId = null;
  }

  /* -------------------------------------------------------------------------- */
  /*                          SCRAPYARD MAP INTEGRATION                         */
  /* -------------------------------------------------------------------------- */

  _hookIntoScrapYardMap(map) {
    if (!map) return;

    // Use map's knifeSwitchPivot if available
    if (map.knifeSwitchPivot) {
      this.knifeSwitchPivot = map.knifeSwitchPivot;
    }

    // Mirror map's registered fixtures
    if (map.lightFixtures && typeof map.lightFixtures.forEach === 'function') {
      map.lightFixtures.forEach((fixRecord, id) => {
        this.registerFixture({
          id,
          name: fixRecord.name || id,
          light: fixRecord.light,
          switchMesh: fixRecord.switchMesh,
          isOn: Boolean(fixRecord.isOn)
        });
      });
    }

    this.isOn = map.isBreakerOn !== undefined ? Boolean(map.isBreakerOn) : true;
    this.tripped = Boolean(map.breakerTripped);
  }

  /* -------------------------------------------------------------------------- */
  /*                            3D PROCEDURAL BUILDERS                          */
  /* -------------------------------------------------------------------------- */

  /**
   * Generates a 3D procedural Circuit Breaker knife-switch box mesh.
   * Can be placed on the Mázsaház exterior wall at (8.0, 1.4, 5.0).
   */
  buildBreakerBoxMesh(x = BREAKER_POSITION.x, y = BREAKER_POSITION.y, z = BREAKER_POSITION.z) {
    const breakerGroup = new THREE.Group();
    breakerGroup.name = 'Procedural_Circuit_Breaker_Box';
    breakerGroup.position.set(x, y, z);
    breakerGroup.rotation.y = -Math.PI / 2;

    // Gray cast-iron enclosure
    const boxGeo = new THREE.BoxGeometry(0.36, 0.50, 0.18);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x4a4e52,
      metalness: 0.7,
      roughness: 0.4
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.castShadow = true;
    breakerGroup.add(boxMesh);

    // Red high-voltage triangle warning sign
    const signGeo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0.0, 0.12, 0.091,
      -0.08, -0.06, 0.091,
      0.08, -0.06, 0.091
    ]);
    signGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    signGeo.computeVertexNormals();

    const signMat = new THREE.MeshBasicMaterial({ color: 0xee2222, side: THREE.DoubleSide });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    breakerGroup.add(signMesh);

    // Knife Switch Lever Pivot
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.08, 0.091);
    pivot.rotation.x = this.isOn ? KNIFE_SWITCH_ANGLES.ON : KNIFE_SWITCH_ANGLES.OFF;

    const handleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.20, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xaa2222, metalness: 0.5, roughness: 0.3 });
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.y = 0.10;
    pivot.add(handleMesh);

    const gripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 10);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const gripMesh = new THREE.Mesh(gripGeo, gripMat);
    gripMesh.position.y = 0.18;
    pivot.add(gripMesh);

    breakerGroup.add(pivot);
    this.knifeSwitchPivot = pivot;
    this.breakerGroup = breakerGroup;

    // Interactive metadata for raycasting
    boxMesh.userData = {
      isInteractive: true,
      action: 'electrical_breaker',
      promptHu: '[E] Főkapcsoló fel / le'
    };

    if (this.scene) {
      this.scene.add(breakerGroup);
    }

    return breakerGroup;
  }

  /**
   * Generates a 3D wall light switch mesh.
   */
  buildWallSwitchMesh(id, x, y, z, rotationY = 0) {
    const swGroup = new THREE.Group();
    swGroup.name = `Wall_Switch_${id}`;
    swGroup.position.set(x, y, z);
    swGroup.rotation.y = rotationY;

    const baseGeo = new THREE.BoxGeometry(0.09, 0.13, 0.035);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    swGroup.add(baseMesh);

    const leverGeo = new THREE.BoxGeometry(0.025, 0.045, 0.03);
    const leverMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
    const leverMesh = new THREE.Mesh(leverGeo, leverMat);
    leverMesh.position.z = 0.02;
    swGroup.add(leverMesh);

    baseMesh.userData = {
      isInteractive: true,
      action: 'electrical_switch',
      switchId: id,
      promptHu: '[E] Villanykapcsoló'
    };

    this.registerSwitch({
      id,
      switchMesh: baseMesh,
      leverMesh
    });

    if (this.scene) {
      this.scene.add(swGroup);
    }

    return swGroup;
  }

  /* -------------------------------------------------------------------------- */
  /*                                 CLEANUP                                    */
  /* -------------------------------------------------------------------------- */

  dispose() {
    this.detachSocket();

    // Clean particles
    this.particles.forEach((p) => {
      this.particleGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    this.particles = [];

    if (this.scene && this.particleGroup.parent) {
      this.scene.remove(this.particleGroup);
    }

    this.fixtures.clear();
    this.switches.clear();
    this.activeLights.clear();
    this.shatteredLights.clear();
  }
}
