// World pieces the MiskolcPhobia view adds on top of ScrapYardMap: the client <-> server door id
// tables, pole lamps for server lights the map does not model, and the ghost entity.
import * as THREE from 'three';
import type { ScrapYardMap } from './map/ScrapYardMap.ts';
import type { ElectricalSystem } from './systems/ElectricalSystem.ts';
import type { PhobiaEngine } from './engine/PhobiaEngine.ts';
import type { GhostDissolveMaterial } from './shaders/GhostDissolveMaterial.ts';
import type { GhostFigure } from './visual/HumanFigure.ts';

// --- Client <-> server id mapping ---------------------------------------------------------
// Hinged doors on the map use local ids, the authoritative server uses its own door table.
export const CLIENT_TO_SERVER_DOOR: Readonly<Record<string, string>> = {
  door_mazsahaz: 'door_mazsahaz_entry',
  door_hangar_main: 'door_hangar_main',
  main_gate_left: 'gate_depot_main',
  main_gate_right: 'gate_depot_main'
};
export const SERVER_TO_CLIENT_DOORS: Readonly<Record<string, readonly string[] | undefined>> = {
  door_mazsahaz_entry: ['door_mazsahaz'],
  door_hangar_main: ['door_hangar_main'],
  gate_depot_main: ['main_gate_left', 'main_gate_right']
};

interface ExtraLightDef {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

// Server light ids that have no fixture on the ScrapYardMap: the client builds a pole lamp for each.
const EXTRA_LIGHTS: readonly ExtraLightDef[] = [
  { id: 'light_mazsahaz_hall', name: 'Mázsaház Folyosó Lámpa', x: 3.0, y: 2.8, z: 5.0, color: 0xffcc77, intensity: 2.0, distance: 10 },
  { id: 'light_gate_floodlight', name: 'Főkapu Reflektor', x: 0.0, y: 4.0, z: -4.0, color: 0xddeeff, intensity: 2.6, distance: 16 },
  { id: 'light_yard_floodlight1', name: 'Udvar Reflektor 1', x: 12.0, y: 6.0, z: 10.0, color: 0xddff99, intensity: 3.0, distance: 20 },
  { id: 'light_yard_floodlight2', name: 'Udvar Reflektor 2', x: 18.0, y: 6.0, z: 30.0, color: 0xddff99, intensity: 3.0, distance: 20 }
];
const YARD_SWITCH_POS = [-1.2, 1.3, -10.0] as const;

/** Builds the lamp-pole fixtures for server lights the map does not model, plus a switch for them. */
export function buildExtraFixtures(map: ScrapYardMap, electrical: ElectricalSystem): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ExtraYardLights';
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7, metalness: 0.6 });
  const fixtureIds: Array<{ def: ExtraLightDef; light: THREE.PointLight; lamp: THREE.Mesh }> = [];

  for (const def of EXTRA_LIGHTS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, def.y, 8), poleMat);
    pole.position.set(def.x, def.y / 2, def.z);
    group.add(pole);

    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: def.color, emissiveIntensity: 0.0, roughness: 0.4 })
    );
    lamp.position.set(def.x, def.y, def.z);
    group.add(lamp);

    const light = new THREE.PointLight(def.color, def.intensity, def.distance, 2.0);
    light.position.set(def.x, def.y - 0.3, def.z);
    light.visible = false;
    group.add(light);
    fixtureIds.push({ def, light, lamp });
  }

  // Free-standing switch post near the truck bound to all the extra yard lights
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.18), poleMat);
  post.position.set(YARD_SWITCH_POS[0], 0.75, YARD_SWITCH_POS[2] - 0.12);
  group.add(post);
  const switchGroup = map.buildWallSwitch(group, 'switch_yard', YARD_SWITCH_POS[0], YARD_SWITCH_POS[1], YARD_SWITCH_POS[2], 0);

  for (const { def, light, lamp } of fixtureIds) {
    electrical.registerFixture({
      id: def.id,
      name: def.name,
      light,
      fixtureMesh: lamp,
      switchMesh: switchGroup,
      isOn: false,
      intensity: def.intensity,
      position: new THREE.Vector3(def.x, def.y, def.z)
    });
  }
  map.group.add(group);
  return group;
}

/** The ghost entity: dissolve material, articulated figure, glow light and its follow state. */
export interface GhostEntity {
  group: THREE.Group;
  material: GhostDissolveMaterial;
  glow: THREE.PointLight;
  fig: GhostFigure;
  target: THREE.Vector3;
  dissolve: number;
  wantVisible: boolean;
  yaw: number;
}

/** Simple translucent humanoid used for the ghost entity (dissolves in/out with the tick). */
export function buildGhostEntity(engine: PhobiaEngine): GhostEntity {
  const material = engine.createGhostMaterial();
  const group = new THREE.Group();
  group.name = 'GhostEntity';
  const fig = engine.createGhostFigure(material);
  group.add(fig.group);
  group.visible = false;
  const glow = new THREE.PointLight(0x61a6fa, 0.0, 9, 2);
  glow.position.y = 1.2;
  group.add(glow);
  engine.ghostGroup.add(group);
  return { group, material, glow, fig, target: new THREE.Vector3(5, 0, 8), dissolve: 1.0, wantVisible: false, yaw: 0 };
}
