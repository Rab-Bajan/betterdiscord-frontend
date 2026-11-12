/**
 * Port of tests/legacy/electrical-environmental.legacy.mjs (108 legacy checks, all preserved).
 * Each legacy check keeps its message as the expect() message. The legacy scripts were one
 * stateful sequence, so each legacy group is one it() and the groups must run in this order.
 *
 * legacy group -> it()  (legacy checks)
 *   [1] ElectricalSystem initialization and state  (7)
 *   [2] Registering fixtures  (1)
 *   [3] Lights 1-6 within capacity  (6x5 = 30)
 *   [4] 7th light trips breaker  (10)
 *   [5] Switch while breaker OFF  (2)
 *   [6] Resetting breaker  (3)
 *   [7] Ghost sabotage probabilities  (4)
 *   [8] Lightbulb shatter  (8)
 *   [9] Ghost scream shatter  (2)
 *   [10] Socket.io sync  (4)
 *   [11] Default scrap props  (1)
 *   [12] Player G throw impulse  (4)
 *   [13] Gravity arc and bounce  (4)
 *   [14] Poltergeist multi-prop throw  (6 + 2 per thrown prop)
 *   [15] Car alarm  (8)
 *   [16] Proximity bump on car  (3)
 *   [17] Puddles and dampness  (4)
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ElectricalSystem,
  MAX_BREAKER_LIGHTS,
  GHOST_SABOTAGE_BASE_PROB,
  GHOST_SABOTAGE_BUNKO_PROB,
  BREAKER_POSITION,
  SFX_KEYS as ELECTRICAL_SFX,
  KNIFE_SWITCH_ANGLES
} from '../../../src/features/games/phobia/lib/systems/ElectricalSystem.ts';
import {
  EnvironmentalPhysics,
  PROP_TYPES,
  SFX_KEYS as PHYSICS_SFX,
  DEFAULT_GRAVITY,
  DEFAULT_RESTITUTION,
  DEFAULT_PLAYER_THROW_SPEED,
  CAR_ALARM_DURATION
} from '../../../src/features/games/phobia/lib/systems/EnvironmentalPhysics.ts';
import { isRecord } from '../../../src/shared/lib/guards.ts';
import type { PositionLike } from '../../../src/features/games/phobia/lib/systems/ElectricalSystem.ts';
import type { PropEntity } from '../../../src/features/games/phobia/lib/systems/EnvironmentalPhysics.ts';

/** `value`, or a thrown error naming what was missing (narrows lookups shared across tests). */
/** A field of an emitted socket payload (undefined when the event or field is missing). */
function payloadField(sent: { payload: unknown } | undefined, key: string): unknown {
  const payload = sent?.payload;
  return isRecord(payload) ? payload[key] : undefined;
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

describe('M7 ElectricalSystem and EnvironmentalPhysics', () => {
  let playedSounds: Array<{ sfx: string; pos: PositionLike }> = [];
  let elec: ElectricalSystem;
  let fixtures: Array<{ id: string; zone: string; name: string }> = [];
  let physicsSounds: Array<{ sfx: string; pos: THREE.Vector3 }> = [];
  let noiseSpikes: Array<{ level: number; src: string }> = [];
  let env: EnvironmentalPhysics;
  let pipeProp: PropEntity;

  it('Testing ElectricalSystem initialization and state', () => {
    playedSounds = [];
    const soundCallback = (sfx: string, pos: PositionLike) => {
      playedSounds.push({ sfx, pos });
    };

    elec = new ElectricalSystem({
      onPlaySound: soundCallback,
      maxCapacity: MAX_BREAKER_LIGHTS
    });

    expect(elec.isOn, 'Master breaker initially ON').toBe(true);
    expect(elec.tripped, 'Master breaker initially not tripped').toBe(false);
    expect(elec.activeLights.size, 'No active lights initially').toBe(0);
    expect(elec.maxCapacity, 'Breaker capacity is exactly 6 active lights').toBe(6);

    // Test 3D Breaker Mesh generation
    const breakerMesh = elec.buildBreakerBoxMesh();
    expect(breakerMesh, 'buildBreakerBoxMesh returns THREE.Group').toBeInstanceOf(THREE.Group);
    expect(elec.knifeSwitchPivot, 'knifeSwitchPivot successfully instantiated').not.toBe(null);
    expect(Math.abs(must(elec.knifeSwitchPivot, 'knifeSwitchPivot').rotation.x - KNIFE_SWITCH_ANGLES.ON), 'Knife switch initial angle is UP (+45°)').toBeLessThan(0.001);

    // Register 8 light fixtures across 5 zones
  });

  it('Registering fixtures across 5 scrap yard zones', () => {
    fixtures = [
      { id: 'light_mazsahaz_office', zone: 'zone1_mazsahaz', name: 'Mázsaház Iroda' },
      { id: 'light_mazsahaz_hall', zone: 'zone1_mazsahaz', name: 'Mázsaház Folyosó' },
      { id: 'light_yard_flood1', zone: 'zone2_roncsdomb', name: 'Roncsdomb Reflektor' },
      { id: 'light_hangar_flood1', zone: 'zone3_hangar', name: 'Hangár Reflektor 1' },
      { id: 'light_hangar_flood2', zone: 'zone3_hangar', name: 'Hangár Reflektor 2' },
      { id: 'light_hangar_catwalk', zone: 'zone3_hangar', name: 'Hangár Járórács Lámpa' },
      { id: 'light_sufni_1', zone: 'zone4_kutyatelep', name: 'Sufni Lámpa 1' },
      { id: 'light_yard_flood2', zone: 'zone5_ocskavas', name: 'Ócskavas Reflektor' }
    ];

    fixtures.forEach((f) => {
      const pLight = new THREE.PointLight(0xffcc77, 2.0, 10.0);
      elec.registerFixture({
        id: f.id,
        zone: f.zone,
        name: f.name,
        light: pLight,
        isOn: false
      });
    });

    expect(elec.fixtures.size, '8 light fixtures successfully registered').toBe(8);

    // Test turning ON lights 1 through 6
  });

  it('Turning ON lights 1 through 6 (within capacity)', () => {
    for (let i = 0; i < 6; i++) {
      const fixId = must(fixtures[i], `fixture ${i}`).id;
      const res = elec.toggleLight(fixId);
      expect(res.success, `Successfully toggled light ${i + 1} (${fixId})`).toBe(true);
      expect(res.lightOn, `Light ${i + 1} is ON`).toBe(true);
      expect(res.tripped, `Breaker not tripped at ${i + 1} lights`).toBe(false);
      expect(elec.activeLights.size, `Active light count is ${i + 1}`).toBe(i + 1);
      expect(elec.isOn, `Breaker is still ON with ${i + 1} lights`).toBe(true);
    }

    expect(elec.activeLights.size, 'Breaker is now at maximum safe capacity (6 lights)').toBe(6);

    // Test CRUCIAL Point 50 Overload Rule: Turning on 7th light TRIPS BREAKER
  });

  it('Overload Test: Turning on 7th light MUST trip breaker to OFF', () => {
    playedSounds.length = 0; // Clear sound tracker

    const overloadResult = elec.toggleLight(must(fixtures[6], 'fixture 6').id);
    expect(overloadResult.success, 'Toggle call handled cleanly').toBe(true);
    expect(overloadResult.tripped, 'Breaker tripped flag set to TRUE').toBe(true);
    expect(overloadResult.lightOn, '7th light denied power (remains OFF)').toBe(false);
    expect(overloadResult.reason, 'Overload reason confirmed').toBe('OVERLOAD');
    expect(elec.isOn, 'Master breaker state immediately flipped to OFF').toBe(false);
    expect(elec.tripped, 'Breaker marked as tripped').toBe(true);
    expect(elec.activeLights.size, 'All room lights shut down (activeLights cleared to 0)').toBe(0);
    expect(Math.abs(must(elec.knifeSwitchPivot, 'knifeSwitchPivot').rotation.x - KNIFE_SWITCH_ANGLES.OFF), 'Knife switch lever flipped DOWN (-45°)').toBeLessThan(0.001);

    // Verify SFX played on overload
    const hasBuzz = playedSounds.some((s) => s.sfx === ELECTRICAL_SFX.BREAKER_BUZZ);
    const hasFlip = playedSounds.some((s) => s.sfx === ELECTRICAL_SFX.BREAKER_FLIP);
    expect(hasBuzz, 'sfx_breaker_buzz played on overload trip').toBeTruthy();
    expect(hasFlip, 'sfx_breaker_flip played on overload trip').toBeTruthy();

    // Test mechanical click when breaker is OFF
  });

  it('Testing switch action while breaker is OFF', () => {
    const offClickResult = elec.toggleLight(must(fixtures[0], 'fixture 0').id);
    expect(offClickResult.breakerOff, 'Switch toggles mechanically but reports breakerOff: true').toBe(true);
    expect(offClickResult.lightOn, 'Light remains dark when breaker is OFF').toBe(false);

    // Test Resetting Breaker
  });

  it('Resetting breaker knife switch', () => {
    const resetResult = elec.setBreakerState(true, 'USER');
    expect(elec.isOn, 'Breaker turned back ON').toBe(true);
    expect(elec.tripped, 'Breaker tripped flag cleared').toBe(false);
    expect(Math.abs(must(elec.knifeSwitchPivot, 'knifeSwitchPivot').rotation.x - KNIFE_SWITCH_ANGLES.ON), 'Knife switch lever returned to UP (+45°)').toBeLessThan(0.001);

    // Test Ghost Sabotage Probabilities
  });

  it('Testing Ghost Sabotage Probabilities (Point 51)', () => {
    expect(GHOST_SABOTAGE_BASE_PROB, 'Base roaming ghost sabotage probability is 15%').toBe(0.15);
    expect(GHOST_SABOTAGE_BUNKO_PROB, 'Bunkó Lajos sabotage probability is 40%').toBe(0.40);

    // Test direct sabotage
    elec.sabotageBreaker('bunko_lajos');
    expect(elec.isOn, 'Breaker flipped to OFF by ghost sabotage').toBe(false);
    expect(elec.trippedReason, 'Breaker trippedReason is GHOST_SABOTAGE').toBe('GHOST_SABOTAGE');

    // Restore breaker for next tests
    elec.setBreakerState(true);

    // Test Lightbulb Shatter Events (Point 53)
  });

  it('Testing Lightbulb Shatter Events (Point 53)', () => {
    playedSounds.length = 0;

    const shatterTargetId = must(fixtures[0], 'fixture 0').id;
    const shatterRes = elec.shatterLight(shatterTargetId);

    expect(shatterRes.success, 'shatterLight returned success').toBe(true);
    expect(shatterRes.shatteredId, 'Correct light shattered').toBe(shatterTargetId);

    const shatteredFixture = must(elec.fixtures.get(shatterTargetId), 'shattered fixture');
    expect(shatteredFixture.shattered, 'Fixture marked shattered: true').toBe(true);
    expect(shatteredFixture.isOn, 'Shattered fixture is OFF').toBe(false);
    expect(elec.shatteredLights.has(shatterTargetId), 'shatteredLights set contains fixture').toBeTruthy();

    const hasShatterSfx = playedSounds.some((s) => s.sfx === ELECTRICAL_SFX.BULB_SHATTER);
    expect(hasShatterSfx, 'sfx_bulb_shatter sound played').toBeTruthy();

    // Shattered fixture permanently disabled
    const tryTurnOnShattered = elec.toggleLight(shatterTargetId);
    expect(tryTurnOnShattered.success, 'Cannot toggle shattered light').toBe(false);
    expect(tryTurnOnShattered.reason, 'Toggle rejected with reason: shattered').toBe('shattered');

    // Test Rostás Béla scream nearest light shatter
  });

  it('Testing Ghost Scream Shatter (Rostás Flexes Béla)', () => {
    const screamPos = new THREE.Vector3(0, 0, 0);
    const screamRes = elec.triggerGhostScreamShatter(screamPos, 50.0, 'rostas_bela');
    expect(screamRes.success, 'Scream successfully shattered nearest light fixture').toBe(true);
    expect(elec.shatteredLights.size, 'At least 2 lights are now permanently shattered').toBeGreaterThanOrEqual(2);

    // Test Socket Synchronization
  });

  it('Testing Socket.io Event Synchronization', () => {
    const emittedEvents: Array<{ event: string; payload: unknown }> = [];
    const mockSocket = {
      emit: (event: string, payload: unknown) => {
        emittedEvents.push({ event, payload });
      },
      on: (_event: string, _handler: unknown) => {},
      off: (_event: string, _handler?: unknown) => {}
    };

    elec.attachSocket(mockSocket, 'test_room_123');
    elec.toggleBreaker('MANUAL', true);

    const breakerEmitted = emittedEvents.find((e) => e.event === 'phobia:breaker-toggle');
    expect(breakerEmitted, 'Emitted phobia:breaker-toggle event').not.toBe(undefined);
    expect(payloadField(breakerEmitted, 'roomId'), 'Socket packet contains correct roomId').toBe('test_room_123');

    elec.setBreakerState(true);
    emittedEvents.length = 0;

    elec.toggleLight(must(fixtures[2], 'fixture 2').id, true);
    const lightEmitted = emittedEvents.find((e) => e.event === 'phobia:light-toggle');
    expect(lightEmitted, 'Emitted phobia:light-toggle event').not.toBe(undefined);
    expect(payloadField(lightEmitted, 'lightId'), 'Socket packet contains correct lightId').toBe(must(fixtures[2], 'fixture 2').id);

    elec.detachSocket();
  });

  it('Testing EnvironmentalPhysics scrap prop physics calculations', () => {
    physicsSounds = [];
    noiseSpikes = [];

    env = new EnvironmentalPhysics({
      onPlaySound: (sfx, pos) => physicsSounds.push({ sfx, pos }),
      onNoiseSpike: (level, src) => noiseSpikes.push({ level, src })
    });

    expect(env.props.size, 'Default scrap props registered (radiators, pipes, batteries, cans)').toBeGreaterThanOrEqual(5);

    // Test Player 'G' Throw Impulse (Point 29 / 54)
  });

  it('Testing Player G throw impulse (5 m/s)', () => {
    const throwOrigin = new THREE.Vector3(0, 1.65, 0); // Eye height
    const throwDir = new THREE.Vector3(0, 0, -1);      // Forward vector

    const throwRes = env.throwScrap('scrap_pipe_zone5_1', throwOrigin, throwDir, DEFAULT_PLAYER_THROW_SPEED);
    expect(throwRes.success, 'throwScrap returned success').toBe(true);

    pipeProp = must(env.props.get('scrap_pipe_zone5_1'), 'scrap_pipe_zone5_1');
    expect(pipeProp.isResting, 'Prop is in flight (isResting: false)').toBe(false);
    expect(Math.abs(pipeProp.velocity.z - (-5.0)), 'Forward velocity is -5.0 m/s along forward vector').toBeLessThan(0.001);
    expect(Math.abs(pipeProp.velocity.y - 1.8), 'Upward kick is +1.8 m/s').toBeLessThan(0.001);

    // Test Physics Step Simulation & Gravity Arc
  });

  it('Testing Gravity arc and restitution bounce', () => {
    const dt = 0.05; // 50ms step
    const initialPosY = pipeProp.position.y;
    const initialVelY = pipeProp.velocity.y;

    env.update(dt);

    // v_y should have decreased by 9.81 * 0.05 = 0.4905
    const expectedVelY = initialVelY + DEFAULT_GRAVITY * dt;
    expect(Math.abs(pipeProp.velocity.y - expectedVelY), `Gravity acceleration applied correctly (${pipeProp.velocity.y} m/s)`).toBeLessThan(0.001);
    expect(pipeProp.position.z, 'Prop translated forward along Z axis').toBeLessThan(0);

    // Step simulation until floor bounce
    let stepped = 0;
    while (!pipeProp.isResting && stepped < 150) {
      env.update(0.04);
      stepped++;
    }

    expect(pipeProp.position.y, 'Prop stayed above ground level').toBeGreaterThanOrEqual(pipeProp.groundY);
    const hasScrapDropSfx = physicsSounds.some((s) => s.sfx === PHYSICS_SFX.SCRAP_DROP);
    expect(hasScrapDropSfx, 'sfx_scrap_drop played on floor impact collision').toBeTruthy();

    // Test Poltergeist Multi-Prop Throw (Lakatos Ármándó, Point 54 / 70)
  });

  it('Testing Lakatos Ármándó Poltergeist Multi-Prop Throw', () => {
    physicsSounds.length = 0;
    noiseSpikes.length = 0;

    const poltergeistRes = env.triggerPoltergeistThrow({
      origin: new THREE.Vector3(25.0, 0.5, 20.0),
      radius: 12.0,
      itemCount: 4
    });

    expect(poltergeistRes.success, 'Poltergeist throw executed successfully').toBe(true);
    expect(poltergeistRes.ghostArchetype, 'Attributed to Lakatos Ármándó').toBe('lakatos_armando');
    expect(poltergeistRes.thrownCount, `Threw ${poltergeistRes.thrownCount} props simultaneously (between 3 and 5)`).toBeGreaterThanOrEqual(3);

    poltergeistRes.props.forEach((tp) => {
      expect(tp.impulseForce >= 9.0 && tp.impulseForce <= 15.0, `Impulse force ${tp.impulseForce.toFixed(2)} m/s is within [9.0, 15.0] m/s`).toBeTruthy();
      const propEntity = must(env.props.get(tp.id), tp.id);
      expect(propEntity.emfSignature, 'Poltergeist thrown item registers EMF 5 signature').toBe(5);
    });

    expect(noiseSpikes.some((n) => n.src === 'poltergeist_event'), 'Van activity noise spike recorded for poltergeist event').toBeTruthy();

    // Test Car Alarm in Zone 2 Roncsdomb (Point 55)
  });

  it('Testing Zone 2 Car Alarm Sabotage (Point 55)', () => {
    physicsSounds.length = 0;
    noiseSpikes.length = 0;

    const alarmRes = env.triggerCarAlarm(CAR_ALARM_DURATION, 'player_bump');
    expect(alarmRes.active, 'Car alarm is active').toBe(true);
    expect(alarmRes.duration, 'Alarm duration is 10.0 seconds').toBe(10.0);
    expect(env.carAlarm.active, 'env.carAlarm.active is true').toBe(true);

    const hasCarAlarmSfx = physicsSounds.some((s) => s.sfx === PHYSICS_SFX.CAR_ALARM);
    expect(hasCarAlarmSfx, 'sfx_car_alarm audio triggered').toBeTruthy();

    const alarmNoiseSpike = noiseSpikes.find((n) => n.src === 'car_alarm');
    expect(alarmNoiseSpike !== undefined && alarmNoiseSpike.level >= 7.0, 'Car alarm noise spike recorded (> 7.0)').toBeTruthy();

    // Test Car Alarm strobe alternation over time
    env.update(0.25);
    expect(env.carAlarm.strobeState, 'Headlight strobe switched state after 0.25s').toBe(false);
    env.update(0.25);
    expect(env.carAlarm.strobeState, 'Headlight strobe toggled back').toBe(true);

    // Step past 10 seconds to verify auto-cutoff
    env.update(10.0);
    expect(env.carAlarm.active, 'Car alarm stopped automatically after 10 seconds').toBe(false);

    // Test Player Bumping into Car
  });

  it('Testing Player Proximity Bump on Car', () => {
    const playerNearCar = new THREE.Vector3(-16.0, 1.0, 14.5);
    const bumpTriggered = env.checkCarBump(playerNearCar);
    expect(bumpTriggered, 'Bumping car in Zone 2 successfully triggered alarm').toBe(true);
    expect(env.carAlarm.active, 'Alarm active after bump').toBe(true);
    env.stopCarAlarm();
    expect(env.carAlarm.active, 'Alarm stopped cleanly').toBe(false);

    // Test Puddles and Surface Dampness (Point 56)
  });

  it('Testing Puddles and Surface Dampness (Point 56)', () => {
    expect(env.puddles.length, 'At least 4 outdoor rain puddles initialized').toBeGreaterThanOrEqual(4);
    const samplePuddle = must(env.puddles[0], 'puddle');
    expect(samplePuddle.material.roughness, 'Puddle has specular low roughness (<= 0.05)').toBeLessThanOrEqual(0.051);

    const dampnessRes = env.setSurfaceDampness(0.9);
    expect(dampnessRes.dampnessFactor, 'Dampness factor updated to 0.9').toBe(0.9);
    expect(dampnessRes.dynamicMudRoughness, 'Mud roughness lowered to simulate wet mud').toBeLessThan(0.5);

    // Cleanup
    elec.dispose();
    env.dispose();
  });
});
