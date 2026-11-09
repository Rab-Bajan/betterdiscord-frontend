import * as THREE from 'three';
import {
  GhostDissolveMaterial,
  DotsLaserMatrix,
  RainParticles,
  FreezingBreathParticles,
  VhsHuntGlitchShader
} from './src/components/phobia/shaders/index.js';

console.log('Testing Phobia Shaders & Particles...');

// 1. GhostDissolveMaterial
const ghostMat = new GhostDissolveMaterial({
  dissolveProgress: 0.25,
  rimColor: 0x5599ff
});
if (ghostMat.getDissolveProgress() !== 0.25) {
  throw new Error('GhostDissolveMaterial getDissolveProgress mismatch');
}
ghostMat.setDissolveProgress(0.75);
if (ghostMat.getDissolveProgress() !== 0.75) {
  throw new Error('GhostDissolveMaterial setDissolveProgress failed');
}
ghostMat.update(0.016);
console.log('✓ GhostDissolveMaterial passed');

// 2. DotsLaserMatrix
const dots = new DotsLaserMatrix({
  pointCountX: 12,
  pointCountY: 12,
  range: 7.0
});
if (dots.totalPoints !== 144) {
  throw new Error('DotsLaserMatrix totalPoints expected 144');
}
dots.update(0.016, new THREE.Vector3(0, 0.5, -3.0));
dots.setEnabled(false);
if (dots.enabled !== false) {
  throw new Error('DotsLaserMatrix setEnabled failed');
}
dots.dispose();
console.log('✓ DotsLaserMatrix passed');

// 3. RainParticles
const rain = new RainParticles({ rainCount: 3000, mistCount: 100 });
if (rain.rainPositions.length !== 3000 * 6) {
  throw new Error('RainParticles streak count mismatch');
}
rain.update(0.016, new THREE.Vector3(0, 1.65, 0));
rain.dispose();
console.log('✓ RainParticles passed');

// 4. FreezingBreathParticles
const breath = new FreezingBreathParticles();
breath.setTemperature(-2.5);
if (!breath.isFreezing) {
  throw new Error('FreezingBreathParticles isFreezing should be true for -2.5C');
}
breath.setTemperature(5.0);
if (breath.isFreezing) {
  throw new Error('FreezingBreathParticles isFreezing should be false for 5.0C');
}
breath.setTemperature(-1.0);
// Mock camera
const mockCamera = new THREE.PerspectiveCamera();
breath.emitPuff(mockCamera);
breath.update(0.016, mockCamera);
breath.dispose();
console.log('✓ FreezingBreathParticles passed');

// 5. VhsHuntGlitchShader
if (VhsHuntGlitchShader.name !== 'VhsHuntGlitchShader') {
  throw new Error('VhsHuntGlitchShader name mismatch');
}
if (!VhsHuntGlitchShader.uniforms.uHuntIntensity) {
  throw new Error('VhsHuntGlitchShader uHuntIntensity uniform missing');
}
console.log('✓ VhsHuntGlitchShader passed');

// 6. PhobiaEngine Class exports and prototype verification
import { PhobiaEngine } from './src/components/phobia/engine/PhobiaEngine.js';
if (typeof PhobiaEngine !== 'function') {
  throw new Error('PhobiaEngine must be a class/function');
}
const prototypeMethods = [
  'start',
  'pause',
  'resume',
  'stop',
  'render',
  'handleResize',
  'toggleFlashlight',
  'isFlashlightOn',
  'setFlashlightIntensity',
  'setFlashlightFlicker',
  'setHuntIntensity',
  'getHuntIntensity',
  'setAmbientTemperature',
  'getAmbientTemperature',
  'setRainEnabled',
  'createGhostMaterial',
  'createDotsProjector',
  'removeDotsProjector',
  'createRoomLight',
  'setRoomLightState',
  'setBreakerState',
  'addUpdateHook',
  'removeUpdateHook',
  'dispose'
];
for (const method of prototypeMethods) {
  if (typeof PhobiaEngine.prototype[method] !== 'function') {
    throw new Error(`PhobiaEngine is missing required prototype method: ${method}`);
  }
}
console.log('✓ PhobiaEngine prototype interface passed (24/24 methods verified)');

console.log('ALL PHOBIA SHADER, PARTICLE, AND ENGINE TESTS PASSED SUCCESSFULLY!');

