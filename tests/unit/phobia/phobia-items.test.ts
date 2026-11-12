/**
 * Port of tests/legacy/phobia-items.legacy.mjs (196 legacy checks, all preserved).
 * (legacy used node:assert; strictEqual/ok map to toBe/toBeTruthy.)
 * Each legacy check keeps its message as the expect() message. The legacy scripts were one
 * stateful sequence, so each legacy group is one it() and the groups must run in this order.
 *
 * legacy group -> it()  (legacy checks)
 *   TEST 1 registry + aliases  (18 static (75 at runtime incl. loop over 15 types x5))
 *   TEST 2 EMF 5  (10)
 *   TEST 3 Spirit Box  (4)
 *   TEST 4 UV flashlight  (8)
 *   TEST 5 Thermometer  (5)
 *   TEST 6 Video camera  (4)
 *   TEST 7 Ghost writing book  (3)
 *   TEST 8 D.O.T.S.  (3)
 *   TEST 9 Photo camera  (7)
 *   TEST 10 Mobile Jesus  (14)
 *   TEST 11 Smudge sticks  (5)
 *   TEST 12 Pálinka flask  (4)
 *   TEST 13 Flashlights  (6)
 *   TEST 14 Salt  (9)
 *   TEST 15 ItemSystem  (26)
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  TOOL_TYPES,
  TOOL_DEFINITIONS,
  PHOTO_BOUNTIES,
  SPIRIT_BOX_VOICE_LINES,
  GHOST_WRITING_SCRIBBLES,
  normalizeToolType
} from '../../../src/features/games/phobia/lib/items/toolCatalog.ts';
import {
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
} from '../../../src/features/games/phobia/lib/items/ToolDefinitions.ts';
import { ItemSystem } from '../../../src/features/games/phobia/lib/items/ItemSystem.ts';
import { isRecord } from '../../../src/shared/lib/guards.ts';

describe('Phobia investigation tools and survival items', () => {

  // ----------------------------------------------------------------------------
  // TEST 1: Tool Registry, Metadata & Type Normalization
  // ----------------------------------------------------------------------------

  it('Verifying Tool Definitions Registry & Aliases', () => {
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
      expect(def, `Tool definition must exist for type: ${t}`).toBeTruthy();
      expect(typeof def.nameHu === 'string' && def.nameHu.length > 0, `Tool ${t} must have Hungarian name`).toBeTruthy();
      expect(typeof def.descriptionHu, `Tool ${t} must have Hungarian description`).toBe('string');
      expect(typeof def.isPlaceable, `Tool ${t} must define isPlaceable flag`).toBe('boolean');
      expect(typeof def.isConsumable, `Tool ${t} must define isConsumable flag`).toBe('boolean');
    });

    // Verify Aliases
    expect(normalizeToolType('mobile_jesus_1')).toBe(TOOL_TYPES.MOBILE_JESUS);
    expect(normalizeToolType('crucifix')).toBe(TOOL_TYPES.MOBILE_JESUS);
    expect(normalizeToolType('jesus')).toBe(TOOL_TYPES.MOBILE_JESUS);
    expect(normalizeToolType('emf_reader_1')).toBe(TOOL_TYPES.EMF_READER);
    expect(normalizeToolType('thermometer_1')).toBe(TOOL_TYPES.THERMOMETER);
    expect(normalizeToolType('spirit_box_1')).toBe(TOOL_TYPES.SPIRIT_BOX);
    expect(normalizeToolType('uv_flashlight')).toBe(TOOL_TYPES.UV_LIGHT);
    expect(normalizeToolType('dots_projector_1')).toBe(TOOL_TYPES.DOTS_PROJECTOR);
    expect(normalizeToolType('writing_book')).toBe(TOOL_TYPES.GHOST_WRITING_BOOK);
    expect(normalizeToolType('palinka_flask')).toBe(TOOL_TYPES.SANITY_PALINKA);
    expect(normalizeToolType('flashlight')).toBe(TOOL_TYPES.FLASHLIGHT_T1);
    expect(normalizeToolType('flashlight_2')).toBe(TOOL_TYPES.FLASHLIGHT_T2);
    expect(normalizeToolType('salt')).toBe(TOOL_TYPES.SALT_SHAKER);

    // ----------------------------------------------------------------------------
    // TEST 2: EMF 5 Reader (LED 1-5 & Audio Frequency Formula)
    // ----------------------------------------------------------------------------
  });

  it('Verifying EMF 5 Reader 3D Viewmodel & Behaviors', () => {
    const emf = createEmfReaderModel(true);
    expect(emf, 'EMF Reader must return THREE.Group').toBeInstanceOf(THREE.Group);
    expect(emf.userData.type).toBe(TOOL_TYPES.EMF_READER);
    expect(emf.userData.getLevel(), 'Initial EMF level must be 1').toBe(1);

    // Verify Audio Click frequency formula: f = 2.0 * Level^2 Hz (Point 75)
    expect(emf.userData.getClickFrequency()).toBe(2.0 * (1 ** 2)); // 2 Hz at Level 1

    emf.userData.setLevel(3);
    expect(emf.userData.getLevel()).toBe(3);
    expect(emf.userData.getClickFrequency()).toBe(2.0 * (3 ** 2)); // 18 Hz at Level 3

    emf.userData.setLevel(5);
    expect(emf.userData.getLevel()).toBe(5);
    expect(emf.userData.getClickFrequency()).toBe(2.0 * (5 ** 2)); // 50 Hz at Level 5

    // Test flashing alarm at level 5
    emf.userData.update(0.15);

    // Test Power toggle
    const wasPowered = emf.userData.isPowered();
    const toggled = emf.userData.togglePower();
    expect(toggled).toBe(!wasPowered);
    expect(emf.userData.getClickFrequency(), 'Unpowered EMF must emit 0 clicks').toBe(0);

    // ----------------------------------------------------------------------------
    // TEST 3: Spirit Box (CB Radio & Hungarian Voice Responses)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Spirit Box (CB Radio & Hungarian Voices)', () => {
    const spiritBox = createSpiritBoxModel(true);
    expect(spiritBox, 'Spirit Box must return THREE.Group').toBeInstanceOf(THREE.Group);
    expect(spiritBox.userData.isScanning()).toBe(false);

    // Toggle scan
    const isScanning = spiritBox.userData.toggleScan();
    expect(isScanning).toBe(true);
    spiritBox.userData.update(0.1);

    // Trigger authentic Hungarian ghost response
    const voice = spiritBox.userData.triggerGhostVoice();
    expect(SPIRIT_BOX_VOICE_LINES.includes(voice), `Triggered voice "${voice}" must be in authentic Hungarian line pool`).toBeTruthy();

    // ----------------------------------------------------------------------------
    // TEST 4: UV Flashlight (Deep Violet Spotlight & Handprint Detection)
    // ----------------------------------------------------------------------------
  });

  it('Verifying UV Flashlight (#4A00E0 beam & Handprint check)', () => {
    const uvLight = createUvFlashlightModel(true);
    expect(uvLight).toBeInstanceOf(THREE.Group);
    expect(uvLight.userData.light, 'UV Light must contain SpotLight').toBeInstanceOf(THREE.SpotLight);

    const spot = uvLight.userData.light;
    expect(spot.color.getHex(), 'UV beam color must be #4A00E0').toBe(0x4a00e0);
    expect(spot.distance, 'UV beam range must be 12 meters').toBe(12.0);

    // Test handprint detection geometry
    const inFrontPos = new THREE.Vector3(0, 0, -3.0);
    const behindPos = new THREE.Vector3(0, 0, 3.0);
    expect(uvLight.userData.checkHandprintVisibility(inFrontPos)).toBe(true);
    expect(uvLight.userData.checkHandprintVisibility(behindPos)).toBe(false);

    uvLight.userData.toggle();
    expect(uvLight.userData.isOn()).toBe(false);
    expect(uvLight.userData.checkHandprintVisibility(inFrontPos), 'Turned off UV cannot reveal evidence').toBe(false);

    // ----------------------------------------------------------------------------
    // TEST 5: Laser Thermometer (Digital LCD & Freezing Reading)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Laser Thermometer & Freezing Detection', () => {
    const thermo = createThermometerModel(true);
    expect(thermo).toBeInstanceOf(THREE.Group);

    thermo.userData.setReading(16.8);
    expect(thermo.userData.getTemperature()).toBe(16.8);
    expect(thermo.userData.isFreezing()).toBe(false);

    thermo.userData.setReading(-4.2);
    expect(thermo.userData.getTemperature()).toBe(-4.2);
    expect(thermo.userData.isFreezing(), 'Temperature < 0.0°C must trigger isFreezing === true').toBe(true);

    // ----------------------------------------------------------------------------
    // TEST 6: Video Camera & Tripod (Night Vision & Floating Ghost Orbs)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Video Camera & Surveyor Tripod', () => {
    const handheldCam = createVideoCameraModel(false);
    expect(handheldCam.userData.isTripodMounted).toBe(false);
    expect(handheldCam.userData.isNightVision()).toBe(true);

    const tripodCam = createVideoCameraModel(true);
    expect(tripodCam.userData.isTripodMounted).toBe(true);

    // Update orbs drifting simulation
    tripodCam.userData.update(0.016);
    tripodCam.userData.toggleNightVision();
    expect(tripodCam.userData.isNightVision()).toBe(false);

    // ----------------------------------------------------------------------------
    // TEST 7: Ghost Writing Book (Hungarian Scribbles)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Ghost Writing Book (Kockás Füzet)', () => {
    const book = createGhostWritingBookModel(false);
    expect(book.userData.hasWriting()).toBe(false);

    const text = book.userData.triggerWriting('TAKAGY');
    expect(book.userData.hasWriting()).toBe(true);
    expect(book.userData.getWritingText()).toBe('TAKAGY');

    // ----------------------------------------------------------------------------
    // TEST 8: D.O.T.S. Projector (144-Point Green Laser Matrix)
    // ----------------------------------------------------------------------------
  });

  it('Verifying D.O.T.S. Projector (144 Laser Points)', () => {
    const dots = createDotsProjectorModel(true);
    expect(dots.userData.matrix, 'D.O.T.S. model must contain DotsLaserMatrix').toBeTruthy();
    expect(dots.userData.matrix.totalPoints, 'Laser matrix must have 144 points (12x12)').toBe(144);

    dots.userData.update(0.016, new THREE.Vector3(0, 0.5, -2.5));
    const dotsToggled = dots.userData.toggle();
    expect(dotsToggled).toBe(false);

    // ----------------------------------------------------------------------------
    // TEST 9: Photo Camera (Flash & Bounty Grading)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Photo Camera (Flash & Bounties)', () => {
    const photoCam = createPhotoCameraModel(true);
    expect(photoCam.userData.getPhotosLeft()).toBe(5);

    const photo1 = photoCam.userData.snapPhoto(PHOTO_BOUNTIES.GHOST_3_STAR);
    expect(photo1, 'Photo record must be returned').toBeTruthy();
    expect(photo1.stars).toBe(3);
    expect(photo1.rewardFt, '3-Star Ghost photo must reward 1,000 Ft').toBe(1000);
    expect(photoCam.userData.getPhotosLeft()).toBe(4);

    const photo2 = photoCam.userData.snapPhoto(PHOTO_BOUNTIES.FINGERPRINT);
    expect(photo2.rewardFt, 'Fingerprint photo must reward 500 Ft').toBe(500);

    expect(photoCam.userData.getAlbum().length).toBe(2);
    photoCam.userData.update(0.16); // Test flash decay

    // ----------------------------------------------------------------------------
    // TEST 10: Mobile Jesus (Golden Crucifix, 4m Aura, 2 Charges, Fire Burn, Ash)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Mobile Jesus (4m Aura, 2 Holy Charges, Flame Particles, Ash)', () => {
    const jesus = createMobileJesusModel(2);
    expect(jesus.userData.getCharges()).toBe(2);
    expect(jesus.userData.isCharred()).toBe(false);
    expect(jesus.userData.isBroken()).toBe(false);
    expect(jesus.userData.defensiveRadius, 'Mobile Jesus defense aura must be exactly 4.0 meters').toBe(4.0);

    // Charge 1 used (cancels hunt, catches fire, turns charred)
    const burn1 = jesus.userData.burnCharge();
    expect(burn1.blocked).toBe(true);
    expect(burn1.chargesRemaining).toBe(1);
    expect(jesus.userData.getCharges()).toBe(1);
    expect(jesus.userData.isCharred()).toBe(true);
    expect(jesus.userData.isBroken()).toBe(false);
    jesus.userData.update(0.05);

    // Charge 2 used (cancels hunt, breaks into ash)
    const burn2 = jesus.userData.burnCharge();
    expect(burn2.blocked).toBe(true);
    expect(burn2.chargesRemaining).toBe(0);
    expect(jesus.userData.getCharges()).toBe(0);
    expect(jesus.userData.isBroken()).toBe(true);

    // Charge 3 used (already 0 charges, cannot block)
    const burn3 = jesus.userData.burnCharge();
    expect(burn3.blocked).toBe(false);

    // ----------------------------------------------------------------------------
    // TEST 11: Smudge Sticks & Lighter (6s Smoke, 5s Blind)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Smudge Sticks & Lighter', () => {
    const smudge = createSmudgeSticksModel();
    expect(smudge.userData.isLit()).toBe(false);

    const lit = smudge.userData.light();
    expect(lit).toBe(true);
    expect(smudge.userData.isLit()).toBe(true);

    // Simulate smoke billow updates
    smudge.userData.update(1.0);
    expect(smudge.userData.isLit()).toBe(true);

    // Simulate burning past 6.0 seconds
    smudge.userData.update(5.5);
    expect(smudge.userData.isLit(), 'Smudge must extinguish after 6.0 seconds').toBe(false);

    // ----------------------------------------------------------------------------
    // TEST 12: Sanity Flask Pálinka (+35% Sanity & Single Use)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Sanity Flask (Borsodi Pálinka 52%)', () => {
    const palinka = createSanityPalinkaModel();
    expect(palinka.userData.isEmpty()).toBe(false);

    const drank = palinka.userData.drink();
    expect(drank, 'First drink must succeed').toBe(true);
    expect(palinka.userData.isEmpty()).toBe(true);

    const drankAgain = palinka.userData.drink();
    expect(drankAgain, 'Empty flask cannot be drunk again').toBe(false);

    // ----------------------------------------------------------------------------
    // TEST 13: Tier 1 vs Tier 2 Flashlights (Beam Range & Color)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Tier 1 & Tier 2 Flashlights', () => {
    const t1 = createFlashlightModel(1);
    const t2 = createFlashlightModel(2);

    expect(t1.userData.light.color.getHex(), 'Tier 1 must be warm incandescent #FFEAA7').toBe(0xffeaa7);
    expect(t1.userData.light.distance).toBe(18.0);
    expect(t1.userData.light.intensity).toBe(1.8);

    expect(t2.userData.light.color.getHex(), 'Tier 2 must be cold-white LED #E8F4FD').toBe(0xe8f4fd);
    expect(t2.userData.light.distance).toBe(32.0);
    expect(t2.userData.light.intensity).toBe(3.5);

    // Test hunt flickering
    t1.userData.flicker(0.8);
    t2.userData.flicker(0.8);

    // ----------------------------------------------------------------------------
    // TEST 14: Salt Shaker & Salt Piles (3 Placements & Stepped-on Mesh)
    // ----------------------------------------------------------------------------
  });

  it('Verifying Salt Shaker & Stepped-On Footprint Mesh', () => {
    const shaker = createSaltShakerModel();
    expect(shaker.userData.getCharges()).toBe(3);
    expect(shaker.userData.placeSalt()).toBe(true);
    expect(shaker.userData.getCharges()).toBe(2);
    expect(shaker.userData.placeSalt()).toBe(true);
    expect(shaker.userData.placeSalt()).toBe(true);
    expect(shaker.userData.placeSalt(), 'Salt shaker cannot place more than 3 piles').toBe(false);

    const pile = createSaltPileModel(false);
    expect(pile.userData.isSteppedOn()).toBe(false);
    const stepped = pile.userData.stepOn();
    expect(stepped).toBe(true);
    expect(pile.userData.isSteppedOn()).toBe(true);

    // ----------------------------------------------------------------------------
    // TEST 15: ItemSystem Integration (3 Slots, Viewmodels, Actions, Drop, Raycast)
    // ----------------------------------------------------------------------------
  });

  it('Verifying ItemSystem Complete System Integration', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1.33, 0.1, 1000);
    const viewmodelGroup = new THREE.Group();
    const interactivePropsGroup = new THREE.Group();
    scene.add(viewmodelGroup);
    scene.add(interactivePropsGroup);

    let inventoryEvents = [];
    let promptEvents = [];
    let sanityEvents: number[] = [];

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

    expect(itemSystem.inventory.length, 'Inventory must have exactly 3 slots').toBe(3);
    expect(itemSystem.activeSlot).toBe(0);

    // Equip Mobile Jesus into Slot 0
    itemSystem.addItemToInventory({
      id: 'mobile_jesus_1',
      type: TOOL_TYPES.MOBILE_JESUS,
      name: 'Mobil Jézus',
      charges: 2
    }, 0);

    expect(itemSystem.inventory[0]?.type).toBe(TOOL_TYPES.MOBILE_JESUS);
    expect(itemSystem.currentViewmodelMesh, 'Active viewmodel must be created').toBeTruthy();
    expect(itemSystem.currentViewmodelMesh?.userData.type).toBe(TOOL_TYPES.MOBILE_JESUS);

    // Equip EMF Reader into Slot 1
    itemSystem.addItemToInventory({
      id: 'emf_reader_1',
      type: TOOL_TYPES.EMF_READER,
      name: 'EMF 5 Mérő'
    }, 1);

    // Select Slot 1 (EMF Reader)
    itemSystem.selectSlot(1);
    expect(itemSystem.activeSlot).toBe(1);
    expect(itemSystem.currentViewmodelMesh?.userData.type).toBe(TOOL_TYPES.EMF_READER);

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
    expect(itemSystem.currentViewmodelMesh?.userData.type).toBe(TOOL_TYPES.SANITY_PALINKA);
    itemSystem.triggerPrimaryAction();
    expect(sanityEvents.length).toBe(1);
    expect(sanityEvents[0], 'Drinking pálinka must restore +35% sanity').toBe(35.0);

    // Test Procedural Viewmodel Animation Update loop
    itemSystem.update(0.016, 4.5); // Sprinting movement
    itemSystem.update(0.016, 0.0); // Idle breathing

    // Test Drop Action ('G' key)
    itemSystem.dropCurrentItem();
    expect(itemSystem.inventory[2], 'Slot 2 must be empty after drop').toBe(null);
    expect(interactivePropsGroup.children.length, 'Dropped item mesh must be added to interactivePropsGroup').toBe(1);

    // Test Placement Mode (Mobile Jesus in Slot 0)
    itemSystem.selectSlot(0);
    itemSystem.togglePlacementMode();
    expect(itemSystem.isPlacementMode).toBe(true);
    expect(itemSystem.placementPreviewMesh, 'Placement preview mesh must be created').toBeTruthy();
    itemSystem.cancelPlacementMode();
    expect(itemSystem.isPlacementMode).toBe(false);

    // Late-join snapshot: server dropped items are mirrored, deduped and replaced on resync
    itemSystem.syncServerItems([
      { id: 'srv_emf_1', type: 'emf_reader', name: 'EMF 5 Mérő', x: 1, y: 0.1, z: 2 },
      { id: 'bad', type: 'emf_reader', x: 'nope' }
    ]);
    expect(itemSystem.placedItems.has('srv_emf_1'), 'Server dropped item must be spawned').toBeTruthy();
    expect(itemSystem.placedItems.has('bad'), 'Item with invalid coordinates must be skipped').toBeFalsy();
    expect(itemSystem.placedItems.get('srv_emf_1')?.userData.itemId).toBe('srv_emf_1');
    itemSystem.syncServerItems([]);
    expect(itemSystem.placedItems.has('srv_emf_1'), 'Resync must remove stale server items').toBe(false);

    // World sync: incremental updates (late join / other players)
    itemSystem.applyWorldItem('spawned', { id: 'w1', type: 'emf_reader', x: 1, y: 0, z: 2, rx: 0, ry: 0.5, rz: 0 }, false);
    expect(itemSystem.placedItems.has('w1'), 'Remote spawn must create the item').toBeTruthy();
    itemSystem.applyWorldItem('spawned', { id: 'w1', type: 'emf_reader', x: 1, y: 0, z: 2 }, false);
    expect([...itemSystem.placedItems.keys()].filter((k) => k === 'w1').length, 'Repeated spawn must not duplicate').toBe(1);
    itemSystem.applyWorldItem('moved', { id: 'w1', type: 'emf_reader', x: 4, y: 0.1, z: 5 }, false);
    expect(itemSystem.placedItems.get('w1')?.position.x, 'Remote move must reposition the item').toBe(4);
    itemSystem.applyWorldItem('removed', { id: 'w1', type: 'emf_reader' }, false);
    expect(itemSystem.placedItems.has('w1'), 'Remote removal must delete the item').toBeFalsy();

    // Own drop: the server echo re-keys the local mesh instead of spawning a second one
    const emitted: Array<[string, unknown]> = [];
    itemSystem.socket = { emit: (ev: string, payload: unknown) => emitted.push([ev, payload]), on: () => undefined, off: () => undefined };
    const localMesh = itemSystem.spawnPlacedWorldItem('emf_reader', new THREE.Vector3(2, 0, 2));
    itemSystem.trackLocalDrop();
    const before = itemSystem.placedItems.size;
    itemSystem.applyWorldItem('spawned', { id: 'srv_own_1', type: 'emf_reader', x: 9, y: 0, z: 9 }, true);
    expect(itemSystem.placedItems.size, 'Own spawn echo must not double spawn').toBe(before);
    expect(itemSystem.placedItems.get('srv_own_1'), 'Local mesh must be re-keyed to the server id').toBe(localMesh);
    expect(emitted.some(([ev, p]) => ev === 'phobia:item-moved' && isRecord(p) && p.itemId === 'srv_own_1'), 'Settled drop must be reported with phobia:item-moved').toBeTruthy();
    itemSystem.socket = null;

    // Clean disposal
    itemSystem.dispose();
  });
});
