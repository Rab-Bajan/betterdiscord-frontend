/**
 * Port of tests/legacy/phobia-engine.legacy.mjs (6 sections, all throw-on-mismatch checks).
 *
 * legacy section                                  -> test
 * 1 GhostDissolveMaterial (get/set progress)      -> GhostDissolveMaterial
 * 2 DotsLaserMatrix (144 pts, enable flag)        -> DotsLaserMatrix
 * 3 RainParticles (streak buffer size)            -> RainParticles
 * 4 FreezingBreathParticles (freezing threshold)  -> FreezingBreathParticles
 * 5 VhsHuntGlitchShader (name, uniform)           -> VhsHuntGlitchShader
 * 6 PhobiaEngine prototype (24 methods)           -> PhobiaEngine prototype interface (one expect per method)
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VhsHuntGlitchShader } from '../../../src/features/games/phobia/lib/shaders/VhsHuntGlitchShader.ts';
import { GhostDissolveMaterial } from '../../../src/features/games/phobia/lib/shaders/GhostDissolveMaterial.ts';
import { DotsLaserMatrix } from '../../../src/features/games/phobia/lib/shaders/DotsLaserMatrix.ts';
import { RainParticles } from '../../../src/features/games/phobia/lib/shaders/RainParticles.ts';
import { FreezingBreathParticles } from '../../../src/features/games/phobia/lib/shaders/FreezingBreathParticles.ts';
import { PhobiaEngine } from '../../../src/features/games/phobia/lib/engine/PhobiaEngine.ts';

describe('Phobia shaders, particles and engine interface', () => {
  it('GhostDissolveMaterial', () => {
    const ghostMat = new GhostDissolveMaterial({ dissolveProgress: 0.25, rimColor: 0x5599ff });
    expect(ghostMat.getDissolveProgress(), 'getDissolveProgress mismatch').toBe(0.25);
    ghostMat.setDissolveProgress(0.75);
    expect(ghostMat.getDissolveProgress(), 'setDissolveProgress failed').toBe(0.75);
    expect(() => ghostMat.update(0.016)).not.toThrow();
  });

  it('DotsLaserMatrix', () => {
    const dots = new DotsLaserMatrix({ pointCountX: 12, pointCountY: 12, range: 7.0 });
    expect(dots.totalPoints, 'totalPoints expected 144').toBe(144);
    expect(() => dots.update(0.016, new THREE.Vector3(0, 0.5, -3.0))).not.toThrow();
    dots.setEnabled(false);
    expect(dots.enabled, 'setEnabled failed').toBe(false);
    expect(() => dots.dispose()).not.toThrow();
  });

  it('RainParticles', () => {
    const rain = new RainParticles({ rainCount: 3000, mistCount: 100 });
    expect(rain.rainPositions.length, 'streak count mismatch').toBe(3000 * 6);
    expect(() => rain.update(0.016, new THREE.Vector3(0, 1.65, 0))).not.toThrow();
    expect(() => rain.dispose()).not.toThrow();
  });

  it('FreezingBreathParticles', () => {
    const breath = new FreezingBreathParticles();
    breath.setTemperature(-2.5);
    expect(breath.isFreezing, 'isFreezing should be true for -2.5C').toBeTruthy();
    breath.setTemperature(5.0);
    expect(breath.isFreezing, 'isFreezing should be false for 5.0C').toBeFalsy();
    breath.setTemperature(-1.0);
    const mockCamera = new THREE.PerspectiveCamera();
    expect(() => breath.emitPuff(mockCamera)).not.toThrow();
    expect(() => breath.update(0.016, mockCamera)).not.toThrow();
    expect(() => breath.dispose()).not.toThrow();
  });

  it('VhsHuntGlitchShader', () => {
    expect(VhsHuntGlitchShader.name, 'name mismatch').toBe('VhsHuntGlitchShader');
    expect(VhsHuntGlitchShader.uniforms.uHuntIntensity, 'uHuntIntensity uniform missing').toBeTruthy();
  });

  it('PhobiaEngine prototype interface', () => {
    expect(typeof PhobiaEngine, 'PhobiaEngine must be a class/function').toBe('function');
    const prototypeMethods = [
      'start', 'pause', 'resume', 'stop', 'render', 'handleResize',
      'toggleFlashlight', 'isFlashlightOn', 'setFlashlightIntensity', 'setFlashlightFlicker',
      'setHuntIntensity', 'getHuntIntensity', 'setAmbientTemperature', 'getAmbientTemperature',
      'setRainEnabled', 'createGhostMaterial', 'createDotsProjector', 'removeDotsProjector',
      'createRoomLight', 'setRoomLightState', 'setBreakerState', 'addUpdateHook', 'removeUpdateHook', 'dispose'
    ];
    expect(prototypeMethods).toHaveLength(24);
    const proto: object = PhobiaEngine.prototype;
    for (const method of prototypeMethods) {
      expect(typeof Reflect.get(proto, method), `missing required prototype method: ${method}`).toBe('function');
    }
  });
});
