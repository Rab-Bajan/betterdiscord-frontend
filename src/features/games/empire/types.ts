// MiskolcEmpire: socket payloads (betterdiscord/miskolcEmpireHandler.js, miskolcEmpire/simulation.js and
// view.js) and the client-side match store built from them.
import { isRecord } from '../../../shared/lib/guards';

export type ResKey = 'iron' | 'copper' | 'food' | 'wood';
export type Cost = Partial<Record<ResKey, number>>;
export type Vec2 = { x: number; y: number };

// ---------------- content (`empire:get-content`, content.js getContent) ----------------

export interface UpgradeDef {
  cost?: Cost;
  buildTime?: number;
  epoch?: number;
  popCap?: number;
  hp?: number;
}

/** Fields shared by unit and building definitions; the server may add more. */
export interface EntityDef {
  id: string;
  name?: string;
  description?: string;
  cost?: Cost;
  buildTime?: number;
  epoch?: number;
  requires?: { epoch?: number };
  minEpoch?: number;
  hp?: number;
  sight?: number;
  attack?: number;
  range?: number;
  [field: string]: unknown;
}

export interface UnitDef extends EntityDef {
  producer?: string;
  speed?: number;
  armor?: number;
  class?: string;
}

export interface BuildingDef extends EntityDef {
  size?: number;
  popCap?: number;
  upgrades?: UpgradeDef[];
  buildable?: boolean;
}

export interface EpochDef {
  id?: unknown;
  /** Epoch number (1-based), derived by normalizeContent. */
  n: number;
  name?: string;
  description?: string;
  cost?: Cost;
  researchTime?: number;
  gather?: number;
  attack?: number;
  hp?: number;
  [field: string]: unknown;
}

export interface DemolishConfig {
  maxRefund: number;
  minRefund: number;
  holdMs: number;
}

/** The raw content payload; only the parts the client reads directly are typed. */
export interface RawContent {
  resources?: Partial<Record<ResKey, { name?: string }>>;
  demolish?: Partial<DemolishConfig>;
  [field: string]: unknown;
}

export interface EmpireContent {
  raw: RawContent;
  epochs: EpochDef[];
  unitList: UnitDef[];
  buildingList: BuildingDef[];
  units: Record<string, UnitDef>;
  buildings: Record<string, BuildingDef>;
}

// ---------------- match records (snapshot / tick) ----------------

export interface PlayerInfo {
  idx: number;
  name: string;
  team: number;
  /** A CSS colour from the server; an integer picks from the client palette. */
  color?: string | number;
  isAi?: boolean;
  alive?: boolean;
  connected?: boolean;
  epoch?: number;
  spectator?: boolean;
}

export interface YouInfo {
  idx: number;
  team: number;
  spectator?: boolean;
}

export interface MapInfo {
  w: number;
  h: number;
  tiles: string;
}

export interface NodeRecord {
  i: number;
  k: string;
  x: number;
  y: number;
  a: number;
}

/** simulation.js unitFull / unitFor; ticks send partial records keyed by `i`. */
export interface UnitRecord {
  i: number;
  o: number;
  k: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  v: number;
  hp: number;
  st: string;
  c: number;
  ct: string | null;
  tg: number | null;
}

export interface QueueItem {
  u: string;
  p: number;
}

/** simulation.js buildingFull; ticks send partial records keyed by `i`. */
export interface BuildingRecord {
  i: number;
  o: number;
  k: string;
  x: number;
  y: number;
  hp: number;
  mh: number;
  bp: number;
  q: QueueItem[];
  ra: [number, number] | null;
  lv: number;
  up: number;
}

export interface Research {
  epoch: number;
  pct: number;
}

/** simulation.js resView. */
export interface ResourceView {
  iron: number;
  copper: number;
  food: number;
  wood: number;
  pop: number;
  popCap: number;
  epoch: number;
  research: Research | null;
}

export interface PauseInfo {
  reason: string;
  untilMs: number;
}

export interface SpyReport {
  unitId: number;
  victim: number;
  name: string;
  color: string;
  res: Partial<Record<ResKey, number>>;
  epoch: number;
  research: Research | null;
  military: number;
}

export interface SpectatorRow {
  idx: number;
  name: string;
  color?: string | number;
  team?: number;
  alive?: boolean;
  army: number | null;
  workers: number | null;
  buildings: number | null;
  epoch?: number;
}

export interface SpectatorSummary {
  elapsed: number;
  players: SpectatorRow[];
}

export interface DefeatStats {
  unitsLost: number;
  unitsKilled: number;
  buildingsDestroyed: number;
  gathered: number;
  damageDealt: number;
}

/** `empire:snapshot` (simulation.js snapshot + roomId). Missing parts fall back to empty values. */
export interface EmpireSnapshot {
  roomId: string;
  status?: string;
  tick?: number;
  tickHz?: number;
  you?: YouInfo;
  players?: PlayerInfo[];
  map: Partial<MapInfo>;
  nodes?: NodeRecord[];
  units?: UnitRecord[];
  buildings?: BuildingRecord[];
  res?: Partial<ResourceView>;
  paused?: PauseInfo | null;
  spy?: SpyReport[];
  sv?: SpectatorSummary;
}

export type EmpireEvent =
  | { e: 'proj'; a: number; x: number; y: number; tx: number; ty: number; k: string; rb?: number }
  | { e: 'hit'; i: number }
  | { e: 'attacked'; x: number; y: number }
  | { e: 'built'; i: number }
  | { e: 'upgraded'; i: number; lv: number }
  | { e: 'epoch'; o: number; n: number }
  | { e: 'msg'; text?: string }
  | { e: 'ping'; x: number; y: number; o: number }
  | { e: 'siphoned'; text?: string; x?: number; y?: number }
  | { e: 'demolish'; i: number; k: string; x: number; y: number; size?: number }
  | { e: 'defeat'; stats?: DefeatStats }
  | { e: 'dead'; i: number; x: number; y: number };

/** `empire:tick` (view.js buildTick): only the parts that changed are present. */
export interface EmpireTick {
  t: number;
  you?: YouInfo;
  r?: Partial<ResourceView>;
  p?: PauseInfo | null;
  spy?: SpyReport[];
  sv?: SpectatorSummary;
  u?: ReadonlyArray<Partial<UnitRecord> | null>;
  b?: ReadonlyArray<Partial<BuildingRecord> | null>;
  n?: ReadonlyArray<readonly [number, number]>;
  x?: readonly number[];
  ev?: readonly EmpireEvent[];
}

// ---------------- lobby (`empire:matches`, `empire:list-matches`, join / create acks) ----------------

export interface SummaryPlayer {
  idx: number;
  name: string;
  team: number;
  color?: string | number;
  isAi?: boolean;
  connected?: boolean;
}

/** miskolcEmpireHandler.js summary(). */
export interface MatchSummary {
  roomId: string;
  channelId?: string | null;
  name?: string;
  mode?: string;
  status?: string;
  active?: boolean;
  startedBy?: string;
  host?: number;
  players?: SummaryPlayer[];
  maxPlayers?: number;
  difficulty?: string;
  mapSize?: string | null;
}

export interface ResultRow {
  idx: number;
  name: string;
  team: number;
  isAi?: boolean;
  won?: boolean;
  unitsKilled?: number;
  buildingsDestroyed?: number;
  gathered?: number;
  unitsLost?: number;
  damageDealt?: number;
}

/** `empire:match-ended`. */
export interface MatchResults {
  roomId: string;
  winnerTeam?: number | null;
  results?: ResultRow[];
}

/** `empire:chat` (the server adds no roomId; one is honoured when present). */
export interface ChatPayload {
  from?: unknown;
  idx?: number;
  text: string;
  spectator?: unknown;
  t?: number;
  roomId?: unknown;
}

// The server builds these payloads; like the arena guards, only the top-level shape the client relies on
// is checked, so a guard never rejects a valid server payload.

/** sendSnapshot always sets the room id before emitting. */
export const isEmpireSnapshot = (v: unknown): v is EmpireSnapshot => isRecord(v) && isRecord(v.map) && typeof v.roomId === 'string';

export const isEmpireTick = (v: unknown): v is EmpireTick => isRecord(v) && typeof v.t === 'number';

export const isMatchSummary = (v: unknown): v is MatchSummary => isRecord(v) && typeof v.roomId === 'string';

export const isMatchResults = (v: unknown): v is MatchResults => isRecord(v) && typeof v.roomId === 'string';

export const isChatPayload = (v: unknown): v is ChatPayload => isRecord(v) && typeof v.text === 'string';

// ---------------- client-side store ----------------

export type NoticeKind = 'info' | 'alert' | 'good';

export interface EmpireCamera {
  x: number;
  y: number;
  dist: number;
  yaw: number;
  pitch: number;
  goal: Vec2 | null;
}

/** A unit as the client keeps it: the server record plus local smoothing state. */
export interface EmpireUnit extends UnitRecord {
  /** correction offset that decays towards the server position */
  dx: number;
  dy: number;
  flash: number;
  /** animation phase */
  ph: number;
  mhp: number;
}

export interface EmpireBuilding extends BuildingRecord {
  flash: number;
  size: number;
  mhp: number;
}

export interface EmpireNode extends NodeRecord {
  max: number;
}

export interface Projectile {
  x: number;
  y: number;
  tx: number;
  ty: number;
  k: string;
  t0: number;
  dur: number;
  a: number;
  rb: boolean;
  hitDone?: boolean;
}

export interface Ping {
  x: number;
  y: number;
  t0: number;
  kind: 'alert' | 'ping';
  o?: number;
}

export interface StoreFx {
  kind: 'hit' | 'unit' | 'building';
  k?: string;
  x: number;
  y: number;
  t0: number;
  dur: number;
  done?: boolean;
}

export interface Collapse {
  i: number;
  k: string;
  o: number;
  x: number;
  y: number;
  size: number;
  bp: number;
  epoch: number;
  t0: number;
  dur: number;
  demolish: boolean;
  fxDone?: boolean;
}

export interface SfxCue {
  id: string;
  x?: number;
  y?: number;
  delay?: number;
}

export interface MoveMark {
  x: number;
  y: number;
  t0: number;
  color: string;
}

export interface Notice {
  text: string;
  kind: NoticeKind;
  t0: number;
}

export interface ChatLine {
  from: string;
  idx: number | undefined;
  text: string;
  spectator: boolean;
  t: number;
}

export interface Defeat {
  stats: Partial<DefeatStats>;
  t0: number;
  at: number;
}

export interface StoreYou {
  idx: number;
  team: number;
  spectator?: boolean;
}

export interface EmpireStore {
  content: EmpireContent | null;
  roomId: string | null;
  status: string;
  tick: number;
  lastT: number;
  time: number;
  you: StoreYou;
  spectator: boolean;
  players: PlayerInfo[];
  teamSet: Set<number>;
  map: MapInfo;
  codes: Uint8Array | null;
  nodes: Map<number, EmpireNode>;
  units: Map<number, EmpireUnit>;
  buildings: Map<number, EmpireBuilding>;
  res: ResourceView;
  paused: PauseInfo | null;
  explored: Uint8Array | null;
  visible: Uint8Array | null;
  fogVersion: number;
  terrainVersion: number;
  projectiles: Projectile[];
  pings: Ping[];
  fx: StoreFx[];
  collapses: Collapse[];
  sfx: SfxCue[];
  moveMarks: MoveMark[];
  notices: Notice[];
  chat: ChatLine[];
  chatVersion: number;
  spy: SpyReport[];
  sv: SpectatorSummary | null;
  svAt: number;
  defeat: Defeat | null;
  groups: Record<string, number[]>;
  selection: Set<number>;
  camera: EmpireCamera;
  /** ground footprint of the screen corners as x0, y0, ... x3, y3 (written by the 3D view) */
  viewQuad: number[] | null;
  ui: { placing: string | null; muted: boolean };
  cameraReady: boolean;
  lastAlertAt: number;
  // set by the canvas / HUD while mounted
  viewport?: { w: number; h: number };
  centerGroup?: ((slot: string) => void) | null;
  onMiniOrder?: ((ids: number[], x: number, y: number) => void) | null;
  onCancelTrain?: ((buildingId: number, index: number) => void) | null;
  onCancelUpgrade?: ((buildingId: number) => void) | null;
  // minimap bitmap caches (empireMinimap.ts)
  _miniTerrain?: HTMLCanvasElement;
  _miniTerrainVer?: number;
  _fog?: HTMLCanvasElement;
  _fogImg?: ImageData;
  _fogVer?: number;
}

/** Screen projection supplied by the 3D view for camera-agnostic picking. */
export interface ScreenPoint {
  x: number;
  y: number;
  /** pixels per world unit */
  s: number;
  /** in front of the camera */
  ok: boolean;
}

export interface PickView {
  project(wx: number, wy: number, hAbove: number, out: ScreenPoint): ScreenPoint;
  groundAt(sx: number, sy: number, h: number, out: Vec2): Vec2 | null;
}

export type EmpirePick =
  | { kind: 'unit'; e: EmpireUnit }
  | { kind: 'building'; e: EmpireBuilding }
  | { kind: 'node'; e: EmpireNode };

/** `onCommand(type, payload)`: the payload is merged into the `empire:command` message. */
export type CommandPayload = Readonly<Record<string, unknown>> & { unitIds?: readonly number[] };
export type EmpireCommand = (type: string, payload: CommandPayload) => void;
