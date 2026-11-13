// Rajzolási keret (spec 11): a világ minden InstancedMesh / statikus hálója előre megtervezett csoport.
// A futó réteg pontosan ebből a tervből épít, így a teszt a valódi felső korlátot számolja.
import { BUILDING_ARCHETYPES, PROP_ARCHETYPES, type Archetype } from './archetypes';
import type { BuildingKind, PropKind, RoadKind, SurfaceKind, WorldLayout } from '../../worldTypes';

export type Tier = 'near' | 'mid' | 'far';

/** LOD tiers (horizontal distance from the camera, metres). */
export const LOD_NEAR_M = 25;
export const LOD_MID_M = 70;

/** Shadow-casting lights besides the sun (nearest street lamp + depot floodlight), see LightingRig. */
export const SPOT_SHADOW_LIGHTS = 2;
/** Hard ceiling of the spec (draw calls per frame, all passes). */
export const DRAW_CALL_LIMIT = 400;

export interface InstancedGroup {
  readonly family: 'building' | 'prop';
  readonly kind: BuildingKind | PropKind;
  readonly part: string;
  readonly tier: Tier;
  /** Drawn into every shadow map (sun and each lamp): near-tier parts only. */
  readonly castShadow: boolean;
}

export interface StaticGroup {
  readonly name: string;
  readonly castShadow: boolean;
}

export interface DrawPlan {
  readonly instanced: readonly InstancedGroup[];
  /** One impostor mesh draws every far building / prop. */
  readonly impostor: boolean;
  readonly statics: readonly StaticGroup[];
}

export function archetypeOf(family: 'building' | 'prop', kind: BuildingKind | PropKind): Archetype | null {
  if (family === 'building') return kind in BUILDING_ARCHETYPES ? BUILDING_ARCHETYPES[kind as BuildingKind] : null;
  return kind in PROP_ARCHETYPES ? PROP_ARCHETYPES[kind as PropKind] : null;
}

function groupsFor(family: 'building' | 'prop', kind: BuildingKind | PropKind, a: Archetype): InstancedGroup[] {
  const out: InstancedGroup[] = [];
  for (const part of a.parts) {
    out.push({ family, kind, part: part.id, tier: 'near', castShadow: part.castShadow });
    if (a.mid.includes(part.id)) out.push({ family, kind, part: part.id, tier: 'mid', castShadow: false });
  }
  return out;
}

export interface PlanInput {
  readonly buildingKinds: ReadonlySet<BuildingKind>;
  readonly propKinds: ReadonlySet<PropKind>;
  readonly roadKinds: ReadonlySet<RoadKind>;
  readonly surfaceKinds: ReadonlySet<SurfaceKind>;
}

export function planInputOf(layout: WorldLayout): PlanInput {
  return {
    buildingKinds: new Set(layout.buildings.map((b) => b.kind)),
    propKinds: new Set(layout.props.map((p) => p.kind)),
    roadKinds: new Set(layout.roads.map((r) => r.kind)),
    surfaceKinds: new Set(layout.surfaces.map((s) => s.kind))
  };
}

/** Static (non-LOD) meshes of the layout layers, in build order. */
export function staticGroups(input: PlanInput): StaticGroup[] {
  const out: StaticGroup[] = [{ name: 'terrain', castShadow: false }];
  for (const kind of input.roadKinds) out.push({ name: `road.${kind}`, castShadow: false });
  if (input.roadKinds.has('rail')) out.push({ name: 'rail.steel', castShadow: false }, { name: 'rail.sleepers', castShadow: false });
  for (const kind of input.surfaceKinds) out.push({ name: `surface.${kind}`, castShadow: false });
  out.push(
    { name: 'hex-borders', castShadow: false },
    { name: 'locked-tape', castShadow: false },
    { name: 'hex-beacons', castShadow: false },
    { name: 'rain', castShadow: false }
  );
  return out;
}

export function planDraws(input: PlanInput): DrawPlan {
  const instanced: InstancedGroup[] = [];
  for (const kind of input.buildingKinds) {
    const a = archetypeOf('building', kind);
    if (a) instanced.push(...groupsFor('building', kind, a));
  }
  for (const kind of input.propKinds) {
    const a = archetypeOf('prop', kind);
    if (a) instanced.push(...groupsFor('prop', kind, a));
  }
  return { instanced, impostor: true, statics: staticGroups(input) };
}

/** Every kind the protocol knows: the worst case any layout can reach. */
export function worstCaseInput(): PlanInput {
  return {
    buildingKinds: new Set(Object.keys(BUILDING_ARCHETYPES) as BuildingKind[]),
    propKinds: new Set(Object.keys(PROP_ARCHETYPES) as PropKind[]),
    roadKinds: new Set<RoadKind>(['road', 'sidewalk', 'rail', 'path', 'stairs']),
    surfaceKinds: new Set<SurfaceKind>(['wet', 'mud', 'grease', 'acid'])
  };
}

export interface DrawBudget {
  readonly main: number;
  readonly sunShadow: number;
  readonly spotShadow: number;
  readonly total: number;
}

/**
 * Upper bound of draw calls per frame with every group visible at once: the main pass, the sun's
 * shadow pass and `SPOT_SHADOW_LIGHTS` lamp shadow passes. three r170 renders every visible caster
 * into every shadow map (it filters by the main camera's layers, never per light), so each shadow
 * pass costs all casters. `extra` covers objects outside the world plan (remote player figures:
 * FIGURE_DRAW_CALLS / FIGURE_SHADOW_CASTERS each).
 */
export function drawBudget(plan: DrawPlan, extraMain = 0, extraCasters = 0): DrawBudget {
  const main = plan.instanced.length + (plan.impostor ? 1 : 0) + plan.statics.length + extraMain;
  const casters = plan.instanced.filter((g) => g.castShadow).length + plan.statics.filter((s) => s.castShadow).length + extraCasters;
  const spotShadow = SPOT_SHADOW_LIGHTS * casters;
  return { main, sunShadow: casters, spotShadow, total: main + casters + spotShadow };
}
