/**
 * test_electrical_environmental.mjs
 *
 * Automated verification test suite for MiskolcPhobia M7:
 * - ElectricalSystem.js
 * - EnvironmentalPhysics.js
 */

import * as THREE from 'three';
import {
  ElectricalSystem,
  MAX_BREAKER_LIGHTS,
  GHOST_SABOTAGE_BASE_PROB,
  GHOST_SABOTAGE_BUNKO_PROB,
  BREAKER_POSITION,
  SFX_KEYS as ELECTRICAL_SFX,
  KNIFE_SWITCH_ANGLES
} from './src/components/phobia/systems/ElectricalSystem.js';

import {
  EnvironmentalPhysics,
  PROP_TYPES,
  SFX_KEYS as PHYSICS_SFX,
  DEFAULT_GRAVITY,
  DEFAULT_RESTITUTION,
  DEFAULT_PLAYER_THROW_SPEED,
  CAR_ALARM_DURATION
} from './src/components/phobia/systems/EnvironmentalPhysics.js';

console.log('--- STARTING M7 ELECTRICAL & ENVIRONMENTAL PHYSICS VERIFICATION ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
  passedTests++;
}

// ============================================================================
// PART 1: ELECTRICAL SYSTEM TESTS
// ============================================================================
console.log('\n[1] Testing ElectricalSystem initialization and state');

const playedSounds = [];
const soundCallback = (sfx, pos) => {
  playedSounds.push({ sfx, pos });
};

const elec = new ElectricalSystem({
  onPlaySound: soundCallback,
  maxCapacity: MAX_BREAKER_LIGHTS
});

assert(elec.isOn === true, 'Master breaker initially ON');
assert(elec.tripped === false, 'Master breaker initially not tripped');
assert(elec.activeLights.size === 0, 'No active lights initially');
assert(elec.maxCapacity === 6, 'Breaker capacity is exactly 6 active lights');

// Test 3D Breaker Mesh generation
const breakerMesh = elec.buildBreakerBoxMesh();
assert(breakerMesh instanceof THREE.Group, 'buildBreakerBoxMesh returns THREE.Group');
assert(elec.knifeSwitchPivot !== null, 'knifeSwitchPivot successfully instantiated');
assert(Math.abs(elec.knifeSwitchPivot.rotation.x - KNIFE_SWITCH_ANGLES.ON) < 0.001, 'Knife switch initial angle is UP (+45°)');

// Register 8 light fixtures across 5 zones
console.log('\n[2] Registering fixtures across 5 scrap yard zones');
const fixtures = [
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

assert(elec.fixtures.size === 8, '8 light fixtures successfully registered');

// Test turning ON lights 1 through 6
console.log('\n[3] Turning ON lights 1 through 6 (within capacity)');
for (let i = 0; i < 6; i++) {
  const fixId = fixtures[i].id;
  const res = elec.toggleLight(fixId);
  assert(res.success === true, `Successfully toggled light ${i + 1} (${fixId})`);
  assert(res.lightOn === true, `Light ${i + 1} is ON`);
  assert(res.tripped === false, `Breaker not tripped at ${i + 1} lights`);
  assert(elec.activeLights.size === i + 1, `Active light count is ${i + 1}`);
  assert(elec.isOn === true, `Breaker is still ON with ${i + 1} lights`);
}

assert(elec.activeLights.size === 6, 'Breaker is now at maximum safe capacity (6 lights)');

// Test CRUCIAL Point 50 Overload Rule: Turning on 7th light TRIPS BREAKER
console.log('\n[4] Overload Test: Turning on 7th light MUST trip breaker to OFF');
playedSounds.length = 0; // Clear sound tracker

const overloadResult = elec.toggleLight(fixtures[6].id);
assert(overloadResult.success === true, 'Toggle call handled cleanly');
assert(overloadResult.tripped === true, 'Breaker tripped flag set to TRUE');
assert(overloadResult.lightOn === false, '7th light denied power (remains OFF)');
assert(overloadResult.reason === 'OVERLOAD', 'Overload reason confirmed');
assert(elec.isOn === false, 'Master breaker state immediately flipped to OFF');
assert(elec.tripped === true, 'Breaker marked as tripped');
assert(elec.activeLights.size === 0, 'All room lights shut down (activeLights cleared to 0)');
assert(Math.abs(elec.knifeSwitchPivot.rotation.x - KNIFE_SWITCH_ANGLES.OFF) < 0.001, 'Knife switch lever flipped DOWN (-45°)');

// Verify SFX played on overload
const hasBuzz = playedSounds.some((s) => s.sfx === ELECTRICAL_SFX.BREAKER_BUZZ);
const hasFlip = playedSounds.some((s) => s.sfx === ELECTRICAL_SFX.BREAKER_FLIP);
assert(hasBuzz, 'sfx_breaker_buzz played on overload trip');
assert(hasFlip, 'sfx_breaker_flip played on overload trip');

// Test mechanical click when breaker is OFF
console.log('\n[5] Testing switch action while breaker is OFF');
const offClickResult = elec.toggleLight(fixtures[0].id);
assert(offClickResult.breakerOff === true, 'Switch toggles mechanically but reports breakerOff: true');
assert(offClickResult.lightOn === false, 'Light remains dark when breaker is OFF');

// Test Resetting Breaker
console.log('\n[6] Resetting breaker knife switch');
const resetResult = elec.setBreakerState(true, 'USER');
assert(elec.isOn === true, 'Breaker turned back ON');
assert(elec.tripped === false, 'Breaker tripped flag cleared');
assert(Math.abs(elec.knifeSwitchPivot.rotation.x - KNIFE_SWITCH_ANGLES.ON) < 0.001, 'Knife switch lever returned to UP (+45°)');

// Test Ghost Sabotage Probabilities
console.log('\n[7] Testing Ghost Sabotage Probabilities (Point 51)');
assert(GHOST_SABOTAGE_BASE_PROB === 0.15, 'Base roaming ghost sabotage probability is 15%');
assert(GHOST_SABOTAGE_BUNKO_PROB === 0.40, 'Bunkó Lajos sabotage probability is 40%');

// Test direct sabotage
elec.sabotageBreaker('bunko_lajos');
assert(elec.isOn === false, 'Breaker flipped to OFF by ghost sabotage');
assert(elec.trippedReason === 'GHOST_SABOTAGE', 'Breaker trippedReason is GHOST_SABOTAGE');

// Restore breaker for next tests
elec.setBreakerState(true);

// Test Lightbulb Shatter Events (Point 53)
console.log('\n[8] Testing Lightbulb Shatter Events (Point 53)');
playedSounds.length = 0;

const shatterTargetId = fixtures[0].id;
const shatterRes = elec.shatterLight(shatterTargetId);

assert(shatterRes.success === true, 'shatterLight returned success');
assert(shatterRes.shatteredId === shatterTargetId, 'Correct light shattered');

const shatteredFixture = elec.fixtures.get(shatterTargetId);
assert(shatteredFixture.shattered === true, 'Fixture marked shattered: true');
assert(shatteredFixture.isOn === false, 'Shattered fixture is OFF');
assert(elec.shatteredLights.has(shatterTargetId), 'shatteredLights set contains fixture');

const hasShatterSfx = playedSounds.some((s) => s.sfx === ELECTRICAL_SFX.BULB_SHATTER);
assert(hasShatterSfx, 'sfx_bulb_shatter sound played');

// Shattered fixture permanently disabled
const tryTurnOnShattered = elec.toggleLight(shatterTargetId);
assert(tryTurnOnShattered.success === false, 'Cannot toggle shattered light');
assert(tryTurnOnShattered.reason === 'shattered', 'Toggle rejected with reason: shattered');

// Test Rostás Béla scream nearest light shatter
console.log('\n[9] Testing Ghost Scream Shatter (Rostás Flexes Béla)');
const screamPos = new THREE.Vector3(0, 0, 0);
const screamRes = elec.triggerGhostScreamShatter(screamPos, 50.0, 'rostas_bela');
assert(screamRes.success === true, 'Scream successfully shattered nearest light fixture');
assert(elec.shatteredLights.size >= 2, 'At least 2 lights are now permanently shattered');

// Test Socket Synchronization
console.log('\n[10] Testing Socket.io Event Synchronization');
const emittedEvents = [];
const mockSocket = {
  emit: (event, payload) => {
    emittedEvents.push({ event, payload });
  },
  on: (_event, _handler) => {},
  off: (_event, _handler) => {}
};

elec.attachSocket(mockSocket, 'test_room_123');
elec.toggleBreaker('MANUAL', true);

const breakerEmitted = emittedEvents.find((e) => e.event === 'phobia:breaker-toggle');
assert(breakerEmitted !== undefined, 'Emitted phobia:breaker-toggle event');
assert(breakerEmitted.payload.roomId === 'test_room_123', 'Socket packet contains correct roomId');

elec.setBreakerState(true);
emittedEvents.length = 0;

elec.toggleLight(fixtures[2].id, true);
const lightEmitted = emittedEvents.find((e) => e.event === 'phobia:light-toggle');
assert(lightEmitted !== undefined, 'Emitted phobia:light-toggle event');
assert(lightEmitted.payload.lightId === fixtures[2].id, 'Socket packet contains correct lightId');

elec.detachSocket();

// ============================================================================
// PART 2: ENVIRONMENTAL PHYSICS TESTS
// ============================================================================
console.log('\n[11] Testing EnvironmentalPhysics scrap prop physics calculations');

const physicsSounds = [];
const noiseSpikes = [];

const env = new EnvironmentalPhysics({
  onPlaySound: (sfx, pos) => physicsSounds.push({ sfx, pos }),
  onNoiseSpike: (level, src) => noiseSpikes.push({ level, src })
});

assert(env.props.size >= 5, 'Default scrap props registered (radiators, pipes, batteries, cans)');

// Test Player 'G' Throw Impulse (Point 29 / 54)
console.log('\n[12] Testing Player G throw impulse (5 m/s)');
const throwOrigin = new THREE.Vector3(0, 1.65, 0); // Eye height
const throwDir = new THREE.Vector3(0, 0, -1);      // Forward vector

const throwRes = env.throwScrap('scrap_pipe_zone5_1', throwOrigin, throwDir, DEFAULT_PLAYER_THROW_SPEED);
assert(throwRes.success === true, 'throwScrap returned success');

const pipeProp = env.props.get('scrap_pipe_zone5_1');
assert(pipeProp.isResting === false, 'Prop is in flight (isResting: false)');
assert(Math.abs(pipeProp.velocity.z - (-5.0)) < 0.001, 'Forward velocity is -5.0 m/s along forward vector');
assert(Math.abs(pipeProp.velocity.y - 1.8) < 0.001, 'Upward kick is +1.8 m/s');

// Test Physics Step Simulation & Gravity Arc
console.log('\n[13] Testing Gravity arc and restitution bounce');
const dt = 0.05; // 50ms step
const initialPosY = pipeProp.position.y;
const initialVelY = pipeProp.velocity.y;

env.update(dt);

// v_y should have decreased by 9.81 * 0.05 = 0.4905
const expectedVelY = initialVelY + DEFAULT_GRAVITY * dt;
assert(Math.abs(pipeProp.velocity.y - expectedVelY) < 0.001, `Gravity acceleration applied correctly (${pipeProp.velocity.y} m/s)`);
assert(pipeProp.position.z < 0, 'Prop translated forward along Z axis');

// Step simulation until floor bounce
let stepped = 0;
while (!pipeProp.isResting && stepped < 150) {
  env.update(0.04);
  stepped++;
}

assert(pipeProp.position.y >= pipeProp.groundY, 'Prop stayed above ground level');
const hasScrapDropSfx = physicsSounds.some((s) => s.sfx === PHYSICS_SFX.SCRAP_DROP);
assert(hasScrapDropSfx, 'sfx_scrap_drop played on floor impact collision');

// Test Poltergeist Multi-Prop Throw (Lakatos Ármándó, Point 54 / 70)
console.log('\n[14] Testing Lakatos Ármándó Poltergeist Multi-Prop Throw');
physicsSounds.length = 0;
noiseSpikes.length = 0;

const poltergeistRes = env.triggerPoltergeistThrow({
  origin: new THREE.Vector3(25.0, 0.5, 20.0),
  radius: 12.0,
  itemCount: 4
});

assert(poltergeistRes.success === true, 'Poltergeist throw executed successfully');
assert(poltergeistRes.ghostArchetype === 'lakatos_armando', 'Attributed to Lakatos Ármándó');
assert(poltergeistRes.thrownCount >= 3, `Threw ${poltergeistRes.thrownCount} props simultaneously (between 3 and 5)`);

poltergeistRes.props.forEach((tp) => {
  assert(tp.impulseForce >= 9.0 && tp.impulseForce <= 15.0, `Impulse force ${tp.impulseForce.toFixed(2)} m/s is within [9.0, 15.0] m/s`);
  const propEntity = env.props.get(tp.id);
  assert(propEntity.emfSignature === 5, 'Poltergeist thrown item registers EMF 5 signature');
});

assert(noiseSpikes.some((n) => n.src === 'poltergeist_event'), 'Van activity noise spike recorded for poltergeist event');

// Test Car Alarm in Zone 2 Roncsdomb (Point 55)
console.log('\n[15] Testing Zone 2 Car Alarm Sabotage (Point 55)');
physicsSounds.length = 0;
noiseSpikes.length = 0;

const alarmRes = env.triggerCarAlarm(CAR_ALARM_DURATION, 'player_bump');
assert(alarmRes.active === true, 'Car alarm is active');
assert(alarmRes.duration === 10.0, 'Alarm duration is 10.0 seconds');
assert(env.carAlarm.active === true, 'env.carAlarm.active is true');

const hasCarAlarmSfx = physicsSounds.some((s) => s.sfx === PHYSICS_SFX.CAR_ALARM);
assert(hasCarAlarmSfx, 'sfx_car_alarm audio triggered');

const alarmNoiseSpike = noiseSpikes.find((n) => n.src === 'car_alarm');
assert(alarmNoiseSpike !== undefined && alarmNoiseSpike.level >= 7.0, 'Car alarm noise spike recorded (> 7.0)');

// Test Car Alarm strobe alternation over time
env.update(0.25);
assert(env.carAlarm.strobeState === false, 'Headlight strobe switched state after 0.25s');
env.update(0.25);
assert(env.carAlarm.strobeState === true, 'Headlight strobe toggled back');

// Step past 10 seconds to verify auto-cutoff
env.update(10.0);
assert(env.carAlarm.active === false, 'Car alarm stopped automatically after 10 seconds');

// Test Player Bumping into Car
console.log('\n[16] Testing Player Proximity Bump on Car');
const playerNearCar = new THREE.Vector3(-16.0, 1.0, 14.5);
const bumpTriggered = env.checkCarBump(playerNearCar);
assert(bumpTriggered === true, 'Bumping car in Zone 2 successfully triggered alarm');
assert(env.carAlarm.active === true, 'Alarm active after bump');
env.stopCarAlarm();
assert(env.carAlarm.active === false, 'Alarm stopped cleanly');

// Test Puddles and Surface Dampness (Point 56)
console.log('\n[17] Testing Puddles and Surface Dampness (Point 56)');
assert(env.puddles.length >= 4, 'At least 4 outdoor rain puddles initialized');
const samplePuddle = env.puddles[0];
assert(samplePuddle.material.roughness <= 0.051, 'Puddle has specular low roughness (<= 0.05)');

const dampnessRes = env.setSurfaceDampness(0.9);
assert(dampnessRes.dampnessFactor === 0.9, 'Dampness factor updated to 0.9');
assert(dampnessRes.dynamicMudRoughness < 0.5, 'Mud roughness lowered to simulate wet mud');

// Cleanup
elec.dispose();
env.dispose();

console.log('\n=============================================================');
console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log('=============================================================');
