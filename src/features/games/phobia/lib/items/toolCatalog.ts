/**
 * toolCatalog.ts
 *
 * MiskolcPhobia tool and survival item catalogue: canonical type ids and aliases, Hungarian voice and
 * ghost-writing lines, photo bounties and per-tool metadata. Pure data (the 3D models live in
 * ToolDefinitions.ts).
 */

// ============================================================================
// CANONICAL TOOL TYPES & ALIASES
// ============================================================================

export const TOOL_TYPES = {
  // Investigation Tools
  EMF_READER: 'emf_reader',
  SPIRIT_BOX: 'spirit_box',
  UV_LIGHT: 'uv_light',
  THERMOMETER: 'thermometer',
  VIDEO_CAMERA: 'video_camera',
  GHOST_WRITING_BOOK: 'ghost_writing_book',
  DOTS_PROJECTOR: 'dots_projector',
  PHOTO_CAMERA: 'photo_camera',

  // Survival Items
  MOBILE_JESUS: 'mobile_jesus',
  SMUDGE_STICKS: 'smudge_sticks',
  SANITY_PALINKA: 'sanity_palinka',
  FLASHLIGHT_T1: 'flashlight_t1',
  FLASHLIGHT_T2: 'flashlight_t2',
  SALT_SHAKER: 'salt_shaker',
  SALT_PILE: 'salt_pile'
} as const;

export type ToolType = (typeof TOOL_TYPES)[keyof typeof TOOL_TYPES];

export const TOOL_ALIASES: Readonly<Record<string, ToolType>> = {
  emf: TOOL_TYPES.EMF_READER,
  emf_reader_1: TOOL_TYPES.EMF_READER,
  spiritbox: TOOL_TYPES.SPIRIT_BOX,
  spirit_box_1: TOOL_TYPES.SPIRIT_BOX,
  uv: TOOL_TYPES.UV_LIGHT,
  uv_flashlight: TOOL_TYPES.UV_LIGHT,
  uv_light_1: TOOL_TYPES.UV_LIGHT,
  thermo: TOOL_TYPES.THERMOMETER,
  thermometer_1: TOOL_TYPES.THERMOMETER,
  camera: TOOL_TYPES.PHOTO_CAMERA,
  photo_camera_1: TOOL_TYPES.PHOTO_CAMERA,
  video_cam: TOOL_TYPES.VIDEO_CAMERA,
  video_camera_1: TOOL_TYPES.VIDEO_CAMERA,
  book: TOOL_TYPES.GHOST_WRITING_BOOK,
  writing_book: TOOL_TYPES.GHOST_WRITING_BOOK,
  ghost_writing_book_1: TOOL_TYPES.GHOST_WRITING_BOOK,
  dots: TOOL_TYPES.DOTS_PROJECTOR,
  dots_projector_1: TOOL_TYPES.DOTS_PROJECTOR,
  jesus: TOOL_TYPES.MOBILE_JESUS,
  crucifix: TOOL_TYPES.MOBILE_JESUS,
  mobile_jesus_1: TOOL_TYPES.MOBILE_JESUS,
  smudge: TOOL_TYPES.SMUDGE_STICKS,
  smudge_sticks_1: TOOL_TYPES.SMUDGE_STICKS,
  palinka: TOOL_TYPES.SANITY_PALINKA,
  palinka_flask: TOOL_TYPES.SANITY_PALINKA,
  sanity_palinka_1: TOOL_TYPES.SANITY_PALINKA,
  flashlight: TOOL_TYPES.FLASHLIGHT_T1,
  flashlight_1: TOOL_TYPES.FLASHLIGHT_T1,
  flashlight_2: TOOL_TYPES.FLASHLIGHT_T2,
  salt: TOOL_TYPES.SALT_SHAKER,
  salt_shaker_1: TOOL_TYPES.SALT_SHAKER
};

/** Canonical tool type for any alias / casing; unknown types come back lower-cased and trimmed. */
export function normalizeToolType(rawType: unknown): string {
  if (!rawType) return TOOL_TYPES.FLASHLIGHT_T1;
  const lower = String(rawType).toLowerCase().trim();
  const alias = TOOL_ALIASES[lower];
  if (alias) return alias;
  for (const [key, val] of Object.entries(TOOL_TYPES)) {
    if (val === lower || key.toLowerCase() === lower) return val;
  }
  return lower;
}

// ============================================================================
// HUNGARIAN VOICE LINES & GHOST TEXT POOLS
// ============================================================================

export const SPIRIT_BOX_VOICE_LINES: readonly string[] = [
  'Itt vagyok',
  'Mögötted',
  'Menj innen',
  'Gyilkolni',
  'Hideg',
  'A VASAT AKAROM!' // Specific to Rostás "Flexes" Béla
];

export const GHOST_WRITING_SCRIBBLES: readonly string[] = [
  'MEGDÖGLESZ',
  'TAKAGY',
  'NE NYÚLJ A RÉZHEZ!',
  'EZ AZ ÉN TELEPEM!',
  'NEM VISZITEK EL A LERAKATOT!'
];

// ============================================================================
// PHOTO BOUNTY SPECIFICATION (Point 82)
// ============================================================================

export interface PhotoBounty {
  stars: number;
  rewardFt: number;
  labelHu: string;
}

export type PhotoBountyKey =
  | 'GHOST_3_STAR'
  | 'GHOST_2_STAR'
  | 'GHOST_1_STAR'
  | 'FINGERPRINT'
  | 'EMF_5'
  | 'INTERACTED_PROP'
  | 'DEAD_BODY';

export const PHOTO_BOUNTIES: Readonly<Record<PhotoBountyKey, PhotoBounty>> = {
  GHOST_3_STAR: { stars: 3, rewardFt: 1000, labelHu: 'Szellem Fénykép (Közeli ★★★)' },
  GHOST_2_STAR: { stars: 2, rewardFt: 700, labelHu: 'Szellem Fénykép (Közepes ★★☆)' },
  GHOST_1_STAR: { stars: 1, rewardFt: 400, labelHu: 'Szellem Fénykép (Távoli ★☆☆)' },
  FINGERPRINT: { stars: 3, rewardFt: 500, labelHu: 'UV Ujjlenyomat / Só Lábnyom ★★★' },
  EMF_5: { stars: 3, rewardFt: 400, labelHu: 'EMF 5 Készülék Érték ★★★' },
  INTERACTED_PROP: { stars: 2, rewardFt: 300, labelHu: 'Eldobott Vas Hulladék ★★☆' },
  DEAD_BODY: { stars: 3, rewardFt: 300, labelHu: 'Halott Nyomozó Holtteste ★★★' }
};

// ============================================================================
// TOOL METADATA REGISTRY
// ============================================================================

export interface ToolTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ToolDefinition {
  id: ToolType;
  nameHu: string;
  category: 'investigation' | 'survival';
  evidenceType?: string | null;
  descriptionHu: string;
  isPlaceable: boolean;
  isConsumable: boolean;
  maxCharges: number;
  viewmodelOffset: ToolTransform;
  worldScale: [number, number, number];
}

export const TOOL_DEFINITIONS: Readonly<Record<ToolType, ToolDefinition>> = {
  [TOOL_TYPES.EMF_READER]: {
    id: TOOL_TYPES.EMF_READER,
    nameHu: 'EMF 5 Mérőműszer',
    category: 'investigation',
    evidenceType: 'emf_5',
    descriptionHu: 'Ipari feszültség- és elektromágneses mező detektor 5 LED skálával és arányos kattogással.',
    isPlaceable: false,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.24, -0.22, -0.42], rotation: [0.15, -0.2, 0.05], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.SPIRIT_BOX]: {
    id: TOOL_TYPES.SPIRIT_BOX,
    nameHu: 'Szellem Rádió (Spirit Box)',
    category: 'investigation',
    evidenceType: 'spirit_box',
    descriptionHu: 'Bömbölő CB rádió frekvencia pásztázóval és magyar nyelvű szellemhang válaszokkal.',
    isPlaceable: false,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.26, -0.24, -0.44], rotation: [0.1, -0.15, 0.08], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.UV_LIGHT]: {
    id: TOOL_TYPES.UV_LIGHT,
    nameHu: 'Pénzvizsgáló UV Zseblámpa',
    category: 'investigation',
    evidenceType: 'uv_fingerprints',
    descriptionHu: '12 méteres mélyibolya fénynyaláb (#4A00E0), mely felfedi a zölden fluoreszkáló ujjlenyomatokat.',
    isPlaceable: false,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.26, -0.22, -0.42], rotation: [0.08, -0.1, 0.02], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.THERMOMETER]: {
    id: TOOL_TYPES.THERMOMETER,
    nameHu: 'Lézeres Hőmérő',
    category: 'investigation',
    evidenceType: 'freezing_temperatures',
    descriptionHu: 'Infravörös lézeres pisztoly hőmérő hátsó digitális LCD kijelzővel. Fagypont alatti (<0.0°C) mérés.',
    isPlaceable: false,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.22, -0.25, -0.40], rotation: [0.12, -0.15, 0.04], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.VIDEO_CAMERA]: {
    id: TOOL_TYPES.VIDEO_CAMERA,
    nameHu: 'Éjjellátó Videókamera & Állvány',
    category: 'investigation',
    evidenceType: 'ghost_orbs',
    descriptionHu: 'Kézi vagy sárga állványra helyezhető IR kamerás egység. Felfedi a lebegő Szellemgömböket.',
    isPlaceable: true,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.25, -0.23, -0.45], rotation: [0.08, -0.2, 0.05], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.GHOST_WRITING_BOOK]: {
    id: TOOL_TYPES.GHOST_WRITING_BOOK,
    nameHu: 'Kockás Nyomozó Füzet',
    category: 'investigation',
    evidenceType: 'ghost_writing',
    descriptionHu: 'Magyar kockás füzet ceruzával. Letéve a szellem agresszív üzeneteket firkál bele.',
    isPlaceable: true,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.22, -0.25, -0.42], rotation: [0.35, -0.2, 0.15], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.DOTS_PROJECTOR]: {
    id: TOOL_TYPES.DOTS_PROJECTOR,
    nameHu: 'D.O.T.S. Projektor',
    category: 'investigation',
    evidenceType: 'dots_projector',
    descriptionHu: '144 zöld mátrix lézerpontot vetítő nehéz talpú egység. Átszaladó áttetsző árnyakat leplez le.',
    isPlaceable: true,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.25, -0.24, -0.44], rotation: [0.15, -0.15, 0.05], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.PHOTO_CAMERA]: {
    id: TOOL_TYPES.PHOTO_CAMERA,
    nameHu: 'Fényképezőgép',
    category: 'investigation',
    evidenceType: null,
    descriptionHu: 'Vintázs 35mm-es gép vakuval. Bizonyítékok és a szellem lefotózásáért készpénz (Ft) jutalom jár.',
    isPlaceable: false,
    isConsumable: true,
    maxCharges: 5,
    viewmodelOffset: { position: [0.20, -0.22, -0.38], rotation: [0.05, -0.1, 0.0], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.MOBILE_JESUS]: {
    id: TOOL_TYPES.MOBILE_JESUS,
    nameHu: 'Mobil Jézus (Arany Feszület)',
    category: 'survival',
    descriptionHu: 'Műszerfali szentelt arany feszület tapadókoronggal. 4 méteren belül kivédi a vadászatot (2 töltet).',
    isPlaceable: true,
    isConsumable: true,
    maxCharges: 2,
    viewmodelOffset: { position: [0.24, -0.24, -0.42], rotation: [0.1, -0.25, 0.1], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.SMUDGE_STICKS]: {
    id: TOOL_TYPES.SMUDGE_STICKS,
    nameHu: 'Füstölő Csomag & Öngyújtó',
    category: 'survival',
    descriptionHu: 'Szárított gyógynövény köteg öngyújtóval. Meggyújtva 5mp-re megvakítja a szellemet és késlelteti a vadászatot.',
    isPlaceable: false,
    isConsumable: true,
    maxCharges: 1,
    viewmodelOffset: { position: [0.24, -0.22, -0.40], rotation: [0.2, -0.15, 0.05], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.SANITY_PALINKA]: {
    id: TOOL_TYPES.SANITY_PALINKA,
    nameHu: 'Borsodi Házi Szilvapálinka (52%)',
    category: 'survival',
    descriptionHu: 'Laposüveges 52 fokos szilvapálinka. Kiivása azonnal +35% elmeállapotot ad.',
    isPlaceable: false,
    isConsumable: true,
    maxCharges: 1,
    viewmodelOffset: { position: [0.22, -0.24, -0.38], rotation: [0.15, -0.2, 0.08], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.FLASHLIGHT_T1]: {
    id: TOOL_TYPES.FLASHLIGHT_T1,
    nameHu: 'Normál Zseblámpa (Tier 1)',
    category: 'survival',
    descriptionHu: 'Melegfényű hagyományos izzós kézi lámpa (#FFEAA7, 18m távolság, 30 fokos kúp).',
    isPlaceable: false,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.26, -0.22, -0.42], rotation: [0.08, -0.1, 0.02], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.FLASHLIGHT_T2]: {
    id: TOOL_TYPES.FLASHLIGHT_T2,
    nameHu: 'Nagyfényű Taktikai LED (Tier 2)',
    category: 'survival',
    descriptionHu: 'Hidegfehér modern taktikai fényszóró (#E8F4FD, 32m távolság, 45 fokos kúp, 3.5 intenzitás).',
    isPlaceable: false,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0.26, -0.22, -0.42], rotation: [0.08, -0.1, 0.02], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.SALT_SHAKER]: {
    id: TOOL_TYPES.SALT_SHAKER,
    nameHu: 'Sószóró (3 Adag)',
    category: 'survival',
    descriptionHu: 'Padlóra szórható sókupacok. Ha a szellem belelép, lábnyoma és UV fluoreszkáló nyoma keletkezik.',
    isPlaceable: true,
    isConsumable: true,
    maxCharges: 3,
    viewmodelOffset: { position: [0.24, -0.24, -0.40], rotation: [0.12, -0.15, 0.05], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  },
  [TOOL_TYPES.SALT_PILE]: {
    id: TOOL_TYPES.SALT_PILE,
    nameHu: 'Padlóra Szórt Sókupac',
    category: 'survival',
    descriptionHu: 'Padlón lévő sókupac.',
    isPlaceable: false,
    isConsumable: false,
    maxCharges: 0,
    viewmodelOffset: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    worldScale: [1, 1, 1]
  }
};
