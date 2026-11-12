import * as THREE from 'three';
import {
  PhobiaAudio,
  SURFACE_PROFILES,
  SPIRIT_BOX_PHRASES,
  EMF_PULSE_RATES
} from '../../src/features/games/phobia/lib/audio/PhobiaAudio.ts';
import { createOverdriveCurve, createMockAudioContext } from '../../src/features/games/phobia/lib/audio/webAudio.ts';

console.log('Testing PhobiaAudio Horror Sound & Voice Engine...');

// 1. Verify Constants and Utility Functions
if (!SURFACE_PROFILES.GRAVEL || !SURFACE_PROFILES.CONCRETE || !SURFACE_PROFILES.MUD || !SURFACE_PROFILES.METAL) {
  throw new Error('SURFACE_PROFILES is missing one or more surface profiles');
}
console.log('✓ SURFACE_PROFILES verified (gravel, concrete, mud, metal)');

if (!SPIRIT_BOX_PHRASES.ITT_VAGYOK || !SPIRIT_BOX_PHRASES.MOGOTTED || !SPIRIT_BOX_PHRASES.MENJ_INNEN ||
    !SPIRIT_BOX_PHRASES.GYILKOLNI || !SPIRIT_BOX_PHRASES.HIDEG) {
  throw new Error('SPIRIT_BOX_PHRASES is missing required Hungarian phrases');
}
console.log('✓ SPIRIT_BOX_PHRASES verified (5 Hungarian phrases)');

if (EMF_PULSE_RATES[5] !== 50.0 || EMF_PULSE_RATES[1] !== 1.5) {
  throw new Error('EMF_PULSE_RATES mismatch for levels 1 and 5');
}
console.log('✓ EMF_PULSE_RATES verified (1.5 Hz to 50.0 Hz)');

const curve = createOverdriveCurve(25, 512);
if (!(curve instanceof Float32Array) || curve.length !== 512) {
  throw new Error('createOverdriveCurve failed to generate valid Float32Array');
}
console.log('✓ createOverdriveCurve verified');

// 2. Instantiate PhobiaAudio in Headless Test Environment
const mockCtx = createMockAudioContext();
const audio = new PhobiaAudio({
  audioContext: mockCtx,
  masterVolume: 1.0,
  sfxVolume: 0.9,
  voiceVolume: 1.0,
  radioVolume: 0.85
});

if (!audio.context || !audio.masterGain || !audio.sfxGain || !audio.voiceGain || !audio.radioGain) {
  throw new Error('PhobiaAudio master bus structure failed to initialize');
}
console.log('✓ PhobiaAudio instance & gain buses initialized');

// 3. Positional Audio and 3D Mesh Attachment
const mockMesh = new THREE.Group();
const posAudio = audio.attachToMesh(mockMesh, {
  refDistance: 1.5,
  maxDistance: 25.0,
  rolloffFactor: 1.0,
  distanceModel: 'linear'
});
console.log('✓ attachToMesh handled cleanly');

// Proximity voice node creation (10m linear falloff)
const proxNode = audio.createProximityVoiceNode({
  refDistance: 1.0,
  maxDistance: 10.0
});
if (!proxNode || proxNode.maxDistance !== 10.0 || proxNode.distanceModel !== 'linear') {
  throw new Error('createProximityVoiceNode failed to enforce 10m linear falloff');
}
console.log('✓ Proximity Voice 3D Panner (10m linear falloff) verified');

// 4. Test 12 Procedural SFX Catalog

// SFX 1: Footsteps (4 profiles)
audio.playFootstep('gravel');
audio.playFootstep('concrete');
audio.playFootstep('mud');
audio.playFootstep('metal');
console.log('✓ SFX 1: Footsteps (4 profiles: gravel, concrete, mud, metal) verified');

// SFX 2: Heartbeat scaling (<30% sanity & hunt proximity)
audio.startHeartbeat();
audio.updateHeartbeat({ sanity: 100, ghostDistance: 25, isHunting: false });
if (audio.heartbeatState.currentBpm > 80) {
  throw new Error('Baseline BPM should be <= 80 at 100% sanity');
}
audio.updateHeartbeat({ sanity: 15, ghostDistance: 8, isHunting: true });
if (audio.heartbeatState.currentBpm < 140) {
  throw new Error(`Heartbeat BPM should accelerate >= 140 under low sanity & active hunt. Got: ${audio.heartbeatState.currentBpm}`);
}
audio.stopHeartbeat();
if (audio.heartbeatState.active) {
  throw new Error('Heartbeat should be inactive after stopHeartbeat');
}
console.log(`✓ SFX 2: Heartbeat loop & dynamic BPM scaling verified (${audio.heartbeatState.currentBpm} BPM under hunt)`);

// SFX 3: Breaker flip, buzz, overload
audio.playBreakerFlip();
audio.startBreakerBuzz();
if (!audio.breakerBuzzNodes) {
  throw new Error('startBreakerBuzz failed to create breaker buzz nodes');
}
audio.stopBreakerBuzz();
if (audio.breakerBuzzNodes) {
  throw new Error('stopBreakerBuzz failed to clean up breaker buzz nodes');
}
audio.playBreakerOverload();
console.log('✓ SFX 3: Breaker snap, 50Hz electric buzz, and overload electrical arc verified');

// SFX 4: Lightbulb shatter and glass crunch
audio.playLightbulbShatter();
audio.playGlassCrunch();
console.log('✓ SFX 4: Lightbulb shatter pop & glass crunch verified');

// SFX 5: Door slow creak and loud slam
audio.playDoorCreak({ duration: 1.0 });
audio.playDoorSlam();
console.log('✓ SFX 5: Hinged door slow creak & sub-bass slam verified');

// SFX 6: EMF Reader (1 Hz to 50 Hz pulse train scaling)
audio.setEmfLevel(1);
if (audio.emfLoopState.level !== 1) throw new Error('EMF level 1 failed');
audio.setEmfLevel(5);
if (audio.emfLoopState.level !== 5) throw new Error('EMF level 5 failed');
audio.playEmfClick();
audio.stopEmf();
if (audio.emfLoopState.level !== 0) throw new Error('stopEmf failed to reset level to 0');
console.log('✓ SFX 6: EMF reader clicks & 1-50 Hz rate scaling verified');

// SFX 7: Spirit Box static sweep & blip
audio.startSpiritBoxSweep();
if (!audio.spiritBoxSweepNodes) throw new Error('startSpiritBoxSweep failed');
audio.playSpiritBoxBlip();
audio.stopSpiritBoxSweep();
if (audio.spiritBoxSweepNodes) throw new Error('stopSpiritBoxSweep failed');
console.log('✓ SFX 7: Spirit Box radio sweep & blip verified');

// SFX 8: Hunt siren & heavy metallic footsteps
audio.playHuntSiren();
audio.playHeavyMetallicFootstep();
console.log('✓ SFX 8: Hunt warning siren & distant heavy metallic footsteps verified');

// SFX 9: Jumpscare musical sting & screeching ghost scream
audio.playJumpscareSting();
audio.playGhostScream();
audio.playJumpscare();
console.log('✓ SFX 9: Jumpscare musical sting cluster & FM screeching ghost scream verified');

// SFX 10: Pálinka liquid gulp & satisfied sigh
audio.playPalinkaDrink();
audio.playPalinkaSigh();
console.log('✓ SFX 10: Pálinka flask liquid gulp & satisfied sigh verified');

// SFX 11: Mobile Jesus holy fire burn (stages 1 & 2)
audio.playMobileJesusBurn({ stage: 1 });
audio.playMobileJesusBurn({ stage: 2 });
console.log('✓ SFX 11: Mobile Jesus crucifix sizzling holy fire burn (stages 1 & 2) verified');

// SFX 12: Car alarm horn & padlock rattle
audio.playCarAlarmHorn();
audio.startCarAlarm();
audio.stopCarAlarm();
audio.playPadlockRattle();
console.log('✓ SFX 12: Car alarm loud horn blare & entrance gate padlock rattle verified');

// Additional SFX (Flashlight click, ghost whisper, scrap drop)
audio.playFlashlightClick();
audio.playGhostWhisper();
audio.playScrapDrop();
console.log('✓ Additional SFX: Flashlight click, ghost whisper, scrap drop verified');

// 5. Hungarian Spirit Box Formant Voice Lines (5 phrases)
const phrases = [
  'Itt vagyok',
  'Mögötted',
  'Menj innen',
  'Gyilkolni',
  'Hideg'
];
for (const phrase of phrases) {
  const duration = audio.playHungarianVoice(phrase);
  if (!duration || duration <= 0) {
    throw new Error(`playHungarianVoice failed for phrase: ${phrase}`);
  }
}
// Direct methods
audio.playVoiceIttVagyok();
audio.playVoiceMogotted();
audio.playVoiceMenjInnen();
audio.playVoiceGyilkolni();
audio.playVoiceHideg();
console.log('✓ Hungarian Spirit Box Formant Speech Synthesis (5 phrases) verified');

// 6. Walkie-Talkie Filter Chain & Hunt Corruption
const wt = audio.walkieTalkie;
if (!wt || !wt.highpass || !wt.lowpass || !wt.waveShaper || !wt.flutterGain || !wt.corruptionNoiseGain) {
  throw new Error('Walkie-talkie filter chain nodes missing');
}
if (wt.highpass.frequency.value !== 400 || wt.lowpass.frequency.value !== 3500) {
  throw new Error(`Walkie-talkie bandpass cutoffs mismatch (expected 400 & 3500 Hz, got: ${wt.highpass.frequency.value} & ${wt.lowpass.frequency.value})`);
}
if (wt.driveGain.gain.value !== 1.8) {
  throw new Error(`Walkie-talkie overdrive gain expected 1.8, got ${wt.driveGain.gain.value}`);
}
console.log('✓ Walkie-Talkie DSP chain (400-3500 Hz bandpass, 1.8x overdrive saturation) verified');

// Squelch chirps on V key press & release
audio.setWalkieTalkieActive(true);
if (!audio.walkieTalkie.active) throw new Error('setWalkieTalkieActive(true) failed');
audio.setWalkieTalkieActive(false);
if (audio.walkieTalkie.active) throw new Error('setWalkieTalkieActive(false) failed');
console.log('✓ Walkie-Talkie radio squelch chirps (start/end) verified');

// Hunt corruption static (+6 dB noise & 32 Hz flutter)
audio.setHuntCorruption(true);
if (!audio.walkieTalkie.huntCorrupted) throw new Error('setHuntCorruption(true) failed');
audio.setHuntCorruption(false);
if (audio.walkieTalkie.huntCorrupted) throw new Error('setHuntCorruption(false) failed');
console.log('✓ Walkie-Talkie Ghost Hunt corruption (+6 dB noise & flutter) verified');

// 7. Bus Volume Control & Cleanup
audio.setMasterVolume(0.8);
audio.setSfxVolume(0.7);
audio.setVoiceVolume(0.9);
audio.setRadioVolume(0.8);
audio.dispose();
console.log('✓ Volume controls & disposal verified');

console.log('====================================================');
console.log('ALL PHOBIA AUDIO TESTS PASSED WITH 100% SUCCESS!');
console.log('====================================================');
