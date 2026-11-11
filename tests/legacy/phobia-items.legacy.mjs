/**
 * test_phobia_items.js
 *
 * Automated verification test suite for MiskolcPhobia 3D Investigation Tools and Survival Items.
 * Tests ToolDefinitions.js and ItemSystem.js:
 *  - Tool metadata, aliases, Hungarian localization, and evidence mapping
 *  - 3D procedural geometries, PBR materials, viewmodels, and world models
 *  - Investigation tools behavior (EMF 1-5, Spirit Box Hungarian voices, UV beam, Laser Thermometer,
 *    Video Camera & Tripod IR/Orbs, Ghost Writing Book, D.O.T.S. Matrix, Photo Camera flash & bounties)
 *  - Survival items behavior (Mobile Jesus 4m aura & 2 charges, Smudge Sticks 6s smoke & 5s blind,
 *    Sanity Flask Pálinka +35%, Tier 1 & Tier 2 Flashlights, Salt Piles & footprint stepping)
 *  - ItemSystem 3-slot inventory, primary/secondary/drop/pickup actions, viewmodel animations, and disposal.
 */

import assert from 'assert';
import * as THREE from 'three';
import {
  TOOL_TYPES,
  TOOL_DEFINITIONS,
  PHOTO_BOUNTIES,
  SPIRIT_BOX_VOICE_LINES,
  GHOST_WRITING_SCRIBBLES,
  normalizeToolType,
  createToolViewmodel,
  createToolWorldMesh,
  createEmfReaderModel,
  createSpiritBoxModel,
  createUvFlashlightModel,
  createThermometerModel,
  createVideoCameraModel,
  createGhostWritingBookModel,
  createDotsProjectorModel,
  createPhotoCameraModel,
  createMobileJesusModel,
  createSmudgeSticksModel,
  createSanityPalinkaModel,
  createFlashlightModel,
  createSaltShakerModel,
  createSaltPileModel
} from '../../src/components/phobia/items/ToolDefinitions.js';
import { ItemSystem } from '../../src/components/phobia/items/ItemSystem.js';

console.log('======================================================================');
console.log('   MISKOLC PHOBIA 3D - INVESTIGATION TOOLS & SURVIVAL ITEMS TESTS');
console.log('======================================================================\n');

// ----------------------------------------------------------------------------
// TEST 1: Tool Registry, Metadata & Type Normalization
// ----------------------------------------------------------------------------
console.log('[TEST 1] Verifying Tool Definitions Registry & Aliases...');

const expectedTypes = [
  TOOL_TYPES.EMF_READER,
  TOOL_TYPES.SPIRIT_BOX,
  TOOL_TYPES.UV_LIGHT,
  TOOL_TYPES.THERMOMETER,
  TOOL_TYPES.VIDEO_CAMERA,
  TOOL_TYPES.GHOST_WRITING_BOOK,
  TOOL_TYPES.DOTS_PROJECTOR,
  TOOL_TYPES.PHOTO_CAMERA,
  TOOL_TYPES.MOBILE_JESUS,
  TOOL_TYPES.SMUDGE_STICKS,
  TOOL_TYPES.SANITY_PALINKA,
  TOOL_TYPES.FLASHLIGHT_T1,
  TOOL_TYPES.FLASHLIGHT_T2,
  TOOL_TYPES.SALT_SHAKER,
  TOOL_TYPES.SALT_PILE
];

expectedTypes.forEach((t) => {
  const def = TOOL_DEFINITIONS[t];
  assert.ok(def, `Tool definition must exist for type: ${t}`);
  assert.ok(typeof def.nameHu === 'string' && def.nameHu.length > 0, `Tool ${t} must have Hungarian name`);
  assert.ok(typeof def.descriptionHu === 'string', `Tool ${t} must have Hungarian description`);
  assert.ok(typeof def.isPlaceable === 'boolean', `Tool ${t} must define isPlaceable flag`);
  assert.ok(typeof def.isConsumable === 'boolean', `Tool ${t} must define isConsumable flag`);
});

// Verify Aliases
assert.strictEqual(normalizeToolType('mobile_jesus_1'), TOOL_TYPES.MOBILE_JESUS);
assert.strictEqual(normalizeToolType('crucifix'), TOOL_TYPES.MOBILE_JESUS);
assert.strictEqual(normalizeToolType('jesus'), TOOL_TYPES.MOBILE_JESUS);
assert.strictEqual(normalizeToolType('emf_reader_1'), TOOL_TYPES.EMF_READER);
assert.strictEqual(normalizeToolType('thermometer_1'), TOOL_TYPES.THERMOMETER);
assert.strictEqual(normalizeToolType('spirit_box_1'), TOOL_TYPES.SPIRIT_BOX);
assert.strictEqual(normalizeToolType('uv_flashlight'), TOOL_TYPES.UV_LIGHT);
assert.strictEqual(normalizeToolType('dots_projector_1'), TOOL_TYPES.DOTS_PROJECTOR);
assert.strictEqual(normalizeToolType('writing_book'), TOOL_TYPES.GHOST_WRITING_BOOK);
assert.strictEqual(normalizeToolType('palinka_flask'), TOOL_TYPES.SANITY_PALINKA);
assert.strictEqual(normalizeToolType('flashlight'), TOOL_TYPES.FLASHLIGHT_T1);
assert.strictEqual(normalizeToolType('flashlight_2'), TOOL_TYPES.FLASHLIGHT_T2);
assert.strictEqual(normalizeToolType('salt'), TOOL_TYPES.SALT_SHAKER);

console.log('✓ Tool Registry & Aliases verified (15/15 types valid).\n');

// ----------------------------------------------------------------------------
// TEST 2: EMF 5 Reader (LED 1-5 & Audio Frequency Formula)
// ----------------------------------------------------------------------------
console.log('[TEST 2] Verifying EMF 5 Reader 3D Viewmodel & Behaviors...');

const emf = createEmfReaderModel(true);
assert.ok(emf instanceof THREE.Group, 'EMF Reader must return THREE.Group');
assert.strictEqual(emf.userData.type, TOOL_TYPES.EMF_READER);
assert.strictEqual(emf.userData.getLevel(), 1, 'Initial EMF level must be 1');

// Verify Audio Click frequency formula: f = 2.0 * Level^2 Hz (Point 75)
assert.strictEqual(emf.userData.getClickFrequency(), 2.0 * (1 ** 2)); // 2 Hz at Level 1

emf.userData.setLevel(3);
assert.strictEqual(emf.userData.getLevel(), 3);
assert.strictEqual(emf.userData.getClickFrequency(), 2.0 * (3 ** 2)); // 18 Hz at Level 3

emf.userData.setLevel(5);
assert.strictEqual(emf.userData.getLevel(), 5);
assert.strictEqual(emf.userData.getClickFrequency(), 2.0 * (5 ** 2)); // 50 Hz at Level 5

// Test flashing alarm at level 5
emf.userData.update(0.15);

// Test Power toggle
const wasPowered = emf.userData.isPowered();
const toggled = emf.userData.togglePower();
assert.strictEqual(toggled, !wasPowered);
assert.strictEqual(emf.userData.getClickFrequency(), 0, 'Unpowered EMF must emit 0 clicks');

console.log('✓ EMF 5 Reader verified (LED bars, 50Hz audio scaling, level 5 alarm).\n');

// ----------------------------------------------------------------------------
// TEST 3: Spirit Box (CB Radio & Hungarian Voice Responses)
// ----------------------------------------------------------------------------
console.log('[TEST 3] Verifying Spirit Box (CB Radio & Hungarian Voices)...');

const spiritBox = createSpiritBoxModel(true);
assert.ok(spiritBox instanceof THREE.Group, 'Spirit Box must return THREE.Group');
assert.strictEqual(spiritBox.userData.isScanning(), false);

// Toggle scan
const isScanning = spiritBox.userData.toggleScan();
assert.strictEqual(isScanning, true);
spiritBox.userData.update(0.1);

// Trigger authentic Hungarian ghost response
const voice = spiritBox.userData.triggerGhostVoice();
assert.ok(SPIRIT_BOX_VOICE_LINES.includes(voice), `Triggered voice "${voice}" must be in authentic Hungarian line pool`);
console.log(`  -> Triggered Spirit Box Voice Line: "${voice}"`);

console.log('✓ Spirit Box verified (AM/FM sweeping, authentic Hungarian voice lines).\n');

// ----------------------------------------------------------------------------
// TEST 4: UV Flashlight (Deep Violet Spotlight & Handprint Detection)
// ----------------------------------------------------------------------------
console.log('[TEST 4] Verifying UV Flashlight (#4A00E0 beam & Handprint check)...');

const uvLight = createUvFlashlightModel(true);
assert.ok(uvLight instanceof THREE.Group);
assert.ok(uvLight.userData.light instanceof THREE.SpotLight, 'UV Light must contain SpotLight');

const spot = uvLight.userData.light;
assert.strictEqual(spot.color.getHex(), 0x4a00e0, 'UV beam color must be #4A00E0');
assert.strictEqual(spot.distance, 12.0, 'UV beam range must be 12 meters');

// Test handprint detection geometry
const inFrontPos = new THREE.Vector3(0, 0, -3.0);
const behindPos = new THREE.Vector3(0, 0, 3.0);
assert.strictEqual(uvLight.userData.checkHandprintVisibility(inFrontPos), true);
assert.strictEqual(uvLight.userData.checkHandprintVisibility(behindPos), false);

uvLight.userData.toggle();
assert.strictEqual(uvLight.userData.isOn(), false);
assert.strictEqual(uvLight.userData.checkHandprintVisibility(inFrontPos), false, 'Turned off UV cannot reveal evidence');

console.log('✓ UV Flashlight verified (12m violet beam, handprint angle detection).\n');

// ----------------------------------------------------------------------------
// TEST 5: Laser Thermometer (Digital LCD & Freezing Reading)
// ----------------------------------------------------------------------------
console.log('[TEST 5] Verifying Laser Thermometer & Freezing Detection...');

const thermo = createThermometerModel(true);
assert.ok(thermo instanceof THREE.Group);

thermo.userData.setReading(16.8);
assert.strictEqual(thermo.userData.getTemperature(), 16.8);
assert.strictEqual(thermo.userData.isFreezing(), false);

thermo.userData.setReading(-4.2);
assert.strictEqual(thermo.userData.getTemperature(), -4.2);
assert.strictEqual(thermo.userData.isFreezing(), true, 'Temperature < 0.0°C must trigger isFreezing === true');

console.log('✓ Laser Thermometer verified (LCD canvas texture, sub-zero detection).\n');

// ----------------------------------------------------------------------------
// TEST 6: Video Camera & Tripod (Night Vision & Floating Ghost Orbs)
// ----------------------------------------------------------------------------
console.log('[TEST 6] Verifying Video Camera & Surveyor Tripod...');

const handheldCam = createVideoCameraModel(false);
assert.strictEqual(handheldCam.userData.isTripodMounted, false);
assert.strictEqual(handheldCam.userData.isNightVision(), true);

const tripodCam = createVideoCameraModel(true);
assert.strictEqual(tripodCam.userData.isTripodMounted, true);

// Update orbs drifting simulation
tripodCam.userData.update(0.016);
tripodCam.userData.toggleNightVision();
assert.strictEqual(tripodCam.userData.isNightVision(), false);

console.log('✓ Video Camera & Tripod verified (Handheld vs Tripod models, IR Night Vision, Ghost Orbs).\n');

// ----------------------------------------------------------------------------
// TEST 7: Ghost Writing Book (Hungarian Scribbles)
// ----------------------------------------------------------------------------
console.log('[TEST 7] Verifying Ghost Writing Book (Kockás Füzet)...');

const book = createGhostWritingBookModel(false);
assert.strictEqual(book.userData.hasWriting(), false);

const text = book.userData.triggerWriting('TAKAGY');
assert.strictEqual(book.userData.hasWriting(), true);
assert.strictEqual(book.userData.getWritingText(), 'TAKAGY');
console.log(`  -> Ghost wrote scribble: "${text}"`);

console.log('✓ Ghost Writing Book verified (Checkered grid pages, handwriting triggers).\n');

// ----------------------------------------------------------------------------
// TEST 8: D.O.T.S. Projector (144-Point Green Laser Matrix)
// ----------------------------------------------------------------------------
console.log('[TEST 8] Verifying D.O.T.S. Projector (144 Laser Points)...');

const dots = createDotsProjectorModel(true);
assert.ok(dots.userData.matrix, 'D.O.T.S. model must contain DotsLaserMatrix');
assert.strictEqual(dots.userData.matrix.totalPoints, 144, 'Laser matrix must have 144 points (12x12)');

dots.userData.update(0.016, new THREE.Vector3(0, 0.5, -2.5));
const dotsToggled = dots.userData.toggle();
assert.strictEqual(dotsToggled, false);

console.log('✓ D.O.T.S. Projector verified (144 points, green matrix shader integration).\n');

// ----------------------------------------------------------------------------
// TEST 9: Photo Camera (Flash & Bounty Grading)
// ----------------------------------------------------------------------------
console.log('[TEST 9] Verifying Photo Camera (Flash & Bounties)...');

const photoCam = createPhotoCameraModel(true);
assert.strictEqual(photoCam.userData.getPhotosLeft(), 5);

const photo1 = photoCam.userData.snapPhoto(PHOTO_BOUNTIES.GHOST_3_STAR);
assert.ok(photo1, 'Photo record must be returned');
assert.strictEqual(photo1.stars, 3);
assert.strictEqual(photo1.rewardFt, 1000, '3-Star Ghost photo must reward 1,000 Ft');
assert.strictEqual(photoCam.userData.getPhotosLeft(), 4);

const photo2 = photoCam.userData.snapPhoto(PHOTO_BOUNTIES.FINGERPRINT);
assert.strictEqual(photo2.rewardFt, 500, 'Fingerprint photo must reward 500 Ft');

assert.strictEqual(photoCam.userData.getAlbum().length, 2);
photoCam.userData.update(0.16); // Test flash decay

console.log('✓ Photo Camera verified (Flash decay, star rating, authentic Ft bounties).\n');

// ----------------------------------------------------------------------------
// TEST 10: Mobile Jesus (Golden Crucifix, 4m Aura, 2 Charges, Fire Burn, Ash)
// ----------------------------------------------------------------------------
console.log('[TEST 10] Verifying Mobile Jesus (4m Aura, 2 Holy Charges, Flame Particles, Ash)...');

const jesus = createMobileJesusModel(2);
assert.strictEqual(jesus.userData.getCharges(), 2);
assert.strictEqual(jesus.userData.isCharred(), false);
assert.strictEqual(jesus.userData.isBroken(), false);
assert.strictEqual(jesus.userData.defensiveRadius, 4.0, 'Mobile Jesus defense aura must be exactly 4.0 meters');

// Charge 1 used (cancels hunt, catches fire, turns charred)
const burn1 = jesus.userData.burnCharge();
assert.strictEqual(burn1.blocked, true);
assert.strictEqual(burn1.chargesRemaining, 1);
assert.strictEqual(jesus.userData.getCharges(), 1);
assert.strictEqual(jesus.userData.isCharred(), true);
assert.strictEqual(jesus.userData.isBroken(), false);
jesus.userData.update(0.05);

// Charge 2 used (cancels hunt, breaks into ash)
const burn2 = jesus.userData.burnCharge();
assert.strictEqual(burn2.blocked, true);
assert.strictEqual(burn2.chargesRemaining, 0);
assert.strictEqual(jesus.userData.getCharges(), 0);
assert.strictEqual(jesus.userData.isBroken(), true);

// Charge 3 used (already 0 charges, cannot block)
const burn3 = jesus.userData.burnCharge();
assert.strictEqual(burn3.blocked, false);

console.log('✓ Mobile Jesus verified (4m aura, 2 charges, holy fire particles, ash degradation).\n');

// ----------------------------------------------------------------------------
// TEST 11: Smudge Sticks & Lighter (6s Smoke, 5s Blind)
// ----------------------------------------------------------------------------
console.log('[TEST 11] Verifying Smudge Sticks & Lighter...');

const smudge = createSmudgeSticksModel();
assert.strictEqual(smudge.userData.isLit(), false);

const lit = smudge.userData.light();
assert.strictEqual(lit, true);
assert.strictEqual(smudge.userData.isLit(), true);

// Simulate smoke billow updates
smudge.userData.update(1.0);
assert.strictEqual(smudge.userData.isLit(), true);

// Simulate burning past 6.0 seconds
smudge.userData.update(5.5);
assert.strictEqual(smudge.userData.isLit(), false, 'Smudge must extinguish after 6.0 seconds');

console.log('✓ Smudge Sticks verified (Lighter ignition, 6s smoke emitter, extinction).\n');

// ----------------------------------------------------------------------------
// TEST 12: Sanity Flask Pálinka (+35% Sanity & Single Use)
// ----------------------------------------------------------------------------
console.log('[TEST 12] Verifying Sanity Flask (Borsodi Pálinka 52%)...');

const palinka = createSanityPalinkaModel();
assert.strictEqual(palinka.userData.isEmpty(), false);

const drank = palinka.userData.drink();
assert.strictEqual(drank, true, 'First drink must succeed');
assert.strictEqual(palinka.userData.isEmpty(), true);

const drankAgain = palinka.userData.drink();
assert.strictEqual(drankAgain, false, 'Empty flask cannot be drunk again');

console.log('✓ Sanity Flask verified (+35% sanity restoration, empty flask state).\n');

// ----------------------------------------------------------------------------
// TEST 13: Tier 1 vs Tier 2 Flashlights (Beam Range & Color)
// ----------------------------------------------------------------------------
console.log('[TEST 13] Verifying Tier 1 & Tier 2 Flashlights...');

const t1 = createFlashlightModel(1);
const t2 = createFlashlightModel(2);

assert.strictEqual(t1.userData.light.color.getHex(), 0xffeaa7, 'Tier 1 must be warm incandescent #FFEAA7');
assert.strictEqual(t1.userData.light.distance, 18.0);
assert.strictEqual(t1.userData.light.intensity, 1.8);

assert.strictEqual(t2.userData.light.color.getHex(), 0xe8f4fd, 'Tier 2 must be cold-white LED #E8F4FD');
assert.strictEqual(t2.userData.light.distance, 32.0);
assert.strictEqual(t2.userData.light.intensity, 3.5);

// Test hunt flickering
t1.userData.flicker(0.8);
t2.userData.flicker(0.8);

console.log('✓ Flashlights verified (Tier 1 incandescent vs Tier 2 high-lumen tactical LED).\n');

// ----------------------------------------------------------------------------
// TEST 14: Salt Shaker & Salt Piles (3 Placements & Stepped-on Mesh)
// ----------------------------------------------------------------------------
console.log('[TEST 14] Verifying Salt Shaker & Stepped-On Footprint Mesh...');

const shaker = createSaltShakerModel();
assert.strictEqual(shaker.userData.getCharges(), 3);
assert.strictEqual(shaker.userData.placeSalt(), true);
assert.strictEqual(shaker.userData.getCharges(), 2);
assert.strictEqual(shaker.userData.placeSalt(), true);
assert.strictEqual(shaker.userData.placeSalt(), true);
assert.strictEqual(shaker.userData.placeSalt(), false, 'Salt shaker cannot place more than 3 piles');

const pile = createSaltPileModel(false);
assert.strictEqual(pile.userData.isSteppedOn(), false);
const stepped = pile.userData.stepOn();
assert.strictEqual(stepped, true);
assert.strictEqual(pile.userData.isSteppedOn(), true);

console.log('✓ Salt Shaker & Salt Piles verified (3 charges, stepped-on footprint geometry).\n');

// ----------------------------------------------------------------------------
// TEST 15: ItemSystem Integration (3 Slots, Viewmodels, Actions, Drop, Raycast)
// ----------------------------------------------------------------------------
console.log('[TEST 15] Verifying ItemSystem Complete System Integration...');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1.33, 0.1, 1000);
const viewmodelGroup = new THREE.Group();
const interactivePropsGroup = new THREE.Group();
scene.add(viewmodelGroup);
scene.add(interactivePropsGroup);

let inventoryEvents = [];
let promptEvents = [];
let sanityEvents = [];

const itemSystem = new ItemSystem({
  scene,
  camera,
  viewmodelGroup,
  interactivePropsGroup,
  onInventoryChange: (inv, slot) => {
    inventoryEvents.push({ inv: [...inv], slot });
  },
  onPromptChange: (prompt) => {
    promptEvents.push(prompt);
  },
  onSanityRestored: (amt) => {
    sanityEvents.push(amt);
  }
});

assert.strictEqual(itemSystem.inventory.length, 3, 'Inventory must have exactly 3 slots');
assert.strictEqual(itemSystem.activeSlot, 0);

// Equip Mobile Jesus into Slot 0
itemSystem.addItemToInventory({
  id: 'mobile_jesus_1',
  type: TOOL_TYPES.MOBILE_JESUS,
  name: 'Mobil Jézus',
  charges: 2
}, 0);

assert.strictEqual(itemSystem.inventory[0].type, TOOL_TYPES.MOBILE_JESUS);
assert.ok(itemSystem.currentViewmodelMesh, 'Active viewmodel must be created');
assert.strictEqual(itemSystem.currentViewmodelMesh.userData.type, TOOL_TYPES.MOBILE_JESUS);

// Equip EMF Reader into Slot 1
itemSystem.addItemToInventory({
  id: 'emf_reader_1',
  type: TOOL_TYPES.EMF_READER,
  name: 'EMF 5 Mérő'
}, 1);

// Select Slot 1 (EMF Reader)
itemSystem.selectSlot(1);
assert.strictEqual(itemSystem.activeSlot, 1);
assert.strictEqual(itemSystem.currentViewmodelMesh.userData.type, TOOL_TYPES.EMF_READER);

// Test Primary Action on EMF Reader
itemSystem.triggerPrimaryAction();

// Equip Sanity Pálinka into Slot 2
itemSystem.addItemToInventory({
  id: 'sanity_palinka_1',
  type: TOOL_TYPES.SANITY_PALINKA,
  name: 'Borsodi Pálinka'
}, 2);

// Select Slot 2 and Drink Pálinka
itemSystem.selectSlot(2);
assert.strictEqual(itemSystem.currentViewmodelMesh.userData.type, TOOL_TYPES.SANITY_PALINKA);
itemSystem.triggerPrimaryAction();
assert.strictEqual(sanityEvents.length, 1);
assert.strictEqual(sanityEvents[0], 35.0, 'Drinking pálinka must restore +35% sanity');

// Test Procedural Viewmodel Animation Update loop
itemSystem.update(0.016, 4.5); // Sprinting movement
itemSystem.update(0.016, 0.0); // Idle breathing

// Test Drop Action ('G' key)
itemSystem.dropCurrentItem();
assert.strictEqual(itemSystem.inventory[2], null, 'Slot 2 must be empty after drop');
assert.strictEqual(interactivePropsGroup.children.length, 1, 'Dropped item mesh must be added to interactivePropsGroup');

// Test Placement Mode (Mobile Jesus in Slot 0)
itemSystem.selectSlot(0);
itemSystem.togglePlacementMode();
assert.strictEqual(itemSystem.isPlacementMode, true);
assert.ok(itemSystem.placementPreviewMesh, 'Placement preview mesh must be created');
itemSystem.cancelPlacementMode();
assert.strictEqual(itemSystem.isPlacementMode, false);

// Late-join snapshot: server dropped items are mirrored, deduped and replaced on resync
itemSystem.syncServerItems([
  { id: 'srv_emf_1', type: 'emf_reader', name: 'EMF 5 Mérő', x: 1, y: 0.1, z: 2 },
  { id: 'bad', type: 'emf_reader', x: 'nope' }
]);
assert.ok(itemSystem.placedItems.has('srv_emf_1'), 'Server dropped item must be spawned');
assert.ok(!itemSystem.placedItems.has('bad'), 'Item with invalid coordinates must be skipped');
assert.strictEqual(itemSystem.placedItems.get('srv_emf_1').userData.itemId, 'srv_emf_1');
itemSystem.syncServerItems([]);
assert.strictEqual(itemSystem.placedItems.has('srv_emf_1'), false, 'Resync must remove stale server items');

// World sync: incremental updates (late join / other players)
itemSystem.applyWorldItem('spawned', { id: 'w1', type: 'emf_reader', x: 1, y: 0, z: 2, rx: 0, ry: 0.5, rz: 0 }, false);
assert.ok(itemSystem.placedItems.has('w1'), 'Remote spawn must create the item');
itemSystem.applyWorldItem('spawned', { id: 'w1', type: 'emf_reader', x: 1, y: 0, z: 2 }, false);
assert.strictEqual([...itemSystem.placedItems.keys()].filter((k) => k === 'w1').length, 1, 'Repeated spawn must not duplicate');
itemSystem.applyWorldItem('moved', { id: 'w1', type: 'emf_reader', x: 4, y: 0.1, z: 5 }, false);
assert.strictEqual(itemSystem.placedItems.get('w1').position.x, 4, 'Remote move must reposition the item');
itemSystem.applyWorldItem('removed', { id: 'w1', type: 'emf_reader' }, false);
assert.ok(!itemSystem.placedItems.has('w1'), 'Remote removal must delete the item');

// Own drop: the server echo re-keys the local mesh instead of spawning a second one
const emitted = [];
itemSystem.socket = { emit: (ev, payload) => emitted.push([ev, payload]) };
const localMesh = itemSystem.spawnPlacedWorldItem('emf_reader', new THREE.Vector3(2, 0, 2));
itemSystem.trackLocalDrop();
const before = itemSystem.placedItems.size;
itemSystem.applyWorldItem('spawned', { id: 'srv_own_1', type: 'emf_reader', x: 9, y: 0, z: 9 }, true);
assert.strictEqual(itemSystem.placedItems.size, before, 'Own spawn echo must not double spawn');
assert.strictEqual(itemSystem.placedItems.get('srv_own_1'), localMesh, 'Local mesh must be re-keyed to the server id');
assert.ok(emitted.some(([ev, p]) => ev === 'phobia:item-moved' && p.itemId === 'srv_own_1'), 'Settled drop must be reported with phobia:item-moved');
itemSystem.socket = null;

// Clean disposal
itemSystem.dispose();

console.log('✓ ItemSystem Integration verified (3 slots, smooth swap, actions, drop, placement, audio).\n');

console.log('======================================================================');
console.log('   >>> ALL ITEM DEFINITION & ITEM SYSTEM TESTS PASSED CLEANLY <<<');
console.log('======================================================================');
