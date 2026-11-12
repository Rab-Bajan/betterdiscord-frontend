/**
 * Port of tests/legacy/phobia-audio.legacy.mjs (headless PhobiaAudio with the built-in mock AudioContext).
 *
 * legacy section                                   -> test
 * 1 constants + createOverdriveCurve                -> constants and utility functions
 * 2 instance, buses, attachToMesh, proximity node   -> instance, gain buses and positional audio
 * 4 SFX 1..12 + additional SFX                      -> SFX catalog (heartbeat/breaker/EMF/spirit box assert state; the rest must not throw)
 * 5 Hungarian formant voice lines                   -> Hungarian spirit box voice lines
 * 6 walkie-talkie chain / squelch / hunt corruption -> walkie-talkie DSP chain
 * 7 volume controls + dispose                       -> volume controls and disposal
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PhobiaAudio,
  SURFACE_PROFILES,
  SPIRIT_BOX_PHRASES,
  EMF_PULSE_RATES
} from '../../../src/features/games/phobia/lib/audio/PhobiaAudio.ts';
import { createOverdriveCurve, createMockAudioContext } from '../../../src/features/games/phobia/lib/audio/webAudio.ts';

describe('PhobiaAudio horror sound and voice engine', () => {
  let audio: PhobiaAudio;

  it('constants and utility functions', () => {
    expect(
      !!(SURFACE_PROFILES.GRAVEL && SURFACE_PROFILES.CONCRETE && SURFACE_PROFILES.MUD && SURFACE_PROFILES.METAL),
      'SURFACE_PROFILES is missing one or more surface profiles'
    ).toBe(true);
    expect(
      !!(SPIRIT_BOX_PHRASES.ITT_VAGYOK && SPIRIT_BOX_PHRASES.MOGOTTED && SPIRIT_BOX_PHRASES.MENJ_INNEN &&
        SPIRIT_BOX_PHRASES.GYILKOLNI && SPIRIT_BOX_PHRASES.HIDEG),
      'SPIRIT_BOX_PHRASES is missing required Hungarian phrases'
    ).toBe(true);
    expect(EMF_PULSE_RATES[5], 'EMF_PULSE_RATES level 5').toBe(50.0);
    expect(EMF_PULSE_RATES[1], 'EMF_PULSE_RATES level 1').toBe(1.5);
    const curve = createOverdriveCurve(25, 512);
    expect(curve, 'createOverdriveCurve must return Float32Array').toBeInstanceOf(Float32Array);
    expect(curve.length).toBe(512);
  });

  it('instance, gain buses and positional audio', () => {
    audio = new PhobiaAudio({
      audioContext: createMockAudioContext(),
      masterVolume: 1.0,
      sfxVolume: 0.9,
      voiceVolume: 1.0,
      radioVolume: 0.85
    });
    expect(
      !!(audio.context && audio.masterGain && audio.sfxGain && audio.voiceGain && audio.radioGain),
      'master bus structure failed to initialize'
    ).toBe(true);

    expect(() => audio.attachToMesh(new THREE.Group(), {
      refDistance: 1.5, maxDistance: 25.0, rolloffFactor: 1.0, distanceModel: 'linear'
    })).not.toThrow();

    const proxNode = audio.createProximityVoiceNode({ refDistance: 1.0, maxDistance: 10.0 });
    expect(proxNode, 'proximity node').toBeTruthy();
    expect(proxNode?.maxDistance, '10m falloff').toBe(10.0);
    expect(proxNode?.distanceModel, 'linear falloff').toBe('linear');
  });

  it('SFX catalog', () => {
    // SFX 1: footsteps (4 profiles)
    for (const surface of ['gravel', 'concrete', 'mud', 'metal']) expect(() => audio.playFootstep(surface)).not.toThrow();

    // SFX 2: heartbeat scaling
    audio.startHeartbeat();
    audio.updateHeartbeat({ sanity: 100, ghostDistance: 25, isHunting: false });
    expect(audio.heartbeatState.currentBpm, 'Baseline BPM should be <= 80 at 100% sanity').toBeLessThanOrEqual(80);
    audio.updateHeartbeat({ sanity: 15, ghostDistance: 8, isHunting: true });
    expect(audio.heartbeatState.currentBpm, 'BPM should accelerate >= 140 under low sanity & active hunt').toBeGreaterThanOrEqual(140);
    audio.stopHeartbeat();
    expect(audio.heartbeatState.active, 'Heartbeat should be inactive after stopHeartbeat').toBeFalsy();

    // SFX 3: breaker flip, buzz, overload
    expect(() => audio.playBreakerFlip()).not.toThrow();
    audio.startBreakerBuzz();
    expect(audio.breakerBuzzNodes, 'startBreakerBuzz failed to create nodes').toBeTruthy();
    audio.stopBreakerBuzz();
    expect(audio.breakerBuzzNodes, 'stopBreakerBuzz failed to clean up nodes').toBeFalsy();
    expect(() => audio.playBreakerOverload()).not.toThrow();

    // SFX 4-5: glass, doors
    expect(() => { audio.playLightbulbShatter(); audio.playGlassCrunch(); }).not.toThrow();
    expect(() => { audio.playDoorCreak({ duration: 1.0 }); audio.playDoorSlam(); }).not.toThrow();

    // SFX 6: EMF reader
    audio.setEmfLevel(1);
    expect(audio.emfLoopState.level, 'EMF level 1 failed').toBe(1);
    audio.setEmfLevel(5);
    expect(audio.emfLoopState.level, 'EMF level 5 failed').toBe(5);
    expect(() => audio.playEmfClick()).not.toThrow();
    audio.stopEmf();
    expect(audio.emfLoopState.level, 'stopEmf failed to reset level to 0').toBe(0);

    // SFX 7: spirit box
    audio.startSpiritBoxSweep();
    expect(audio.spiritBoxSweepNodes, 'startSpiritBoxSweep failed').toBeTruthy();
    expect(() => audio.playSpiritBoxBlip()).not.toThrow();
    audio.stopSpiritBoxSweep();
    expect(audio.spiritBoxSweepNodes, 'stopSpiritBoxSweep failed').toBeFalsy();

    // SFX 8-12 and additional SFX
    expect(() => { audio.playHuntSiren(); audio.playHeavyMetallicFootstep(); }).not.toThrow();
    expect(() => { audio.playJumpscareSting(); audio.playGhostScream(); audio.playJumpscare(); }).not.toThrow();
    expect(() => { audio.playPalinkaDrink(); audio.playPalinkaSigh(); }).not.toThrow();
    expect(() => { audio.playMobileJesusBurn({ stage: 1 }); audio.playMobileJesusBurn({ stage: 2 }); }).not.toThrow();
    expect(() => { audio.playCarAlarmHorn(); audio.startCarAlarm(); audio.stopCarAlarm(); audio.playPadlockRattle(); }).not.toThrow();
    expect(() => { audio.playFlashlightClick(); audio.playGhostWhisper(); audio.playScrapDrop(); }).not.toThrow();
  });

  it('Hungarian spirit box voice lines', () => {
    for (const phrase of ['Itt vagyok', 'Mögötted', 'Menj innen', 'Gyilkolni', 'Hideg']) {
      const duration = audio.playHungarianVoice(phrase);
      expect(duration, `playHungarianVoice failed for phrase: ${phrase}`).toBeGreaterThan(0);
    }
    expect(() => {
      audio.playVoiceIttVagyok();
      audio.playVoiceMogotted();
      audio.playVoiceMenjInnen();
      audio.playVoiceGyilkolni();
      audio.playVoiceHideg();
    }).not.toThrow();
  });

  it('walkie-talkie DSP chain', () => {
    const wt = audio.walkieTalkie;
    expect(
      !!(wt && wt.highpass && wt.lowpass && wt.waveShaper && wt.flutterGain && wt.corruptionNoiseGain),
      'filter chain nodes missing'
    ).toBe(true);
    expect(wt.highpass.frequency.value, 'highpass cutoff').toBe(400);
    expect(wt.lowpass.frequency.value, 'lowpass cutoff').toBe(3500);
    expect(wt.driveGain.gain.value, 'overdrive gain').toBe(1.8);

    audio.setWalkieTalkieActive(true);
    expect(audio.walkieTalkie.active, 'setWalkieTalkieActive(true) failed').toBeTruthy();
    audio.setWalkieTalkieActive(false);
    expect(audio.walkieTalkie.active, 'setWalkieTalkieActive(false) failed').toBeFalsy();

    audio.setHuntCorruption(true);
    expect(audio.walkieTalkie.huntCorrupted, 'setHuntCorruption(true) failed').toBeTruthy();
    audio.setHuntCorruption(false);
    expect(audio.walkieTalkie.huntCorrupted, 'setHuntCorruption(false) failed').toBeFalsy();
  });

  it('volume controls and disposal', () => {
    expect(() => {
      audio.setMasterVolume(0.8);
      audio.setSfxVolume(0.7);
      audio.setVoiceVolume(0.9);
      audio.setRadioVolume(0.8);
      audio.dispose();
    }).not.toThrow();
  });
});
