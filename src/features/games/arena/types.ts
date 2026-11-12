// SUDS WAR aréna: a meccs indító adatai, a snapshotok és az események (betterdiscord/game).
import { isRecord } from '../../../shared/lib/guards';
import type { Collider, MovementWorld, Track } from './lib/movement';

export type Vec3 = [number, number, number];

export interface Cosmetics {
  color?: string;
  hat?: string;
  trail?: string | null;
  [slot: string]: unknown;
}

export interface MatchPlayer {
  i: number;
  sid: string | null;
  username: string;
  team: string;
  side: string;
  characterId: string;
  cosmetics?: Cosmetics;
}

export interface CharacterStats {
  id: string;
  name: string;
  role: string;
  faction: string;
  speed: number;
  maxHp: number;
  damage: number;
  ability: { name: string };
}

export interface Faction {
  id: string;
  name: string;
  color: string;
}

export interface Pickup {
  id: string;
  type: string;
  x: number;
  z: number;
}

export interface Structure {
  id: string;
  side: string;
  kind: string;
  min: Vec3;
  max: Vec3;
  hp: number;
}

export interface ArenaTrack extends Track {
  boostPads: Array<[number, number]>;
  itemBoxes: Array<[number, number]>;
  checkpoints: Array<[number, number]>;
  checkpointRadius: number;
  routes: Array<Track['routes'][number] & { shortcut?: boolean }>;
}

export interface ArenaCollider extends Collider {
  kind: string;
}

export interface ArenaWorld extends MovementWorld {
  colliders: ArenaCollider[];
  bounds: MovementWorld['bounds'] & { height: number };
  track?: ArenaTrack | null;
  heading?: number;
  spawns: Record<string, unknown>;
  nodes?: Array<{ id: string; x: number; z: number }>;
}

/** `game:match-start` (gameHandler.js `matchInfo`). */
export interface MatchInfo {
  matchId: string;
  you: number;
  mode: string;
  modeName: string;
  flags: { vehicle: boolean; pve: boolean; ffa: boolean; teams: boolean };
  world: ArenaWorld;
  factions: Record<string, Faction>;
  characters: Record<string, CharacterStats>;
  npcDefs: Record<string, { size?: number; name?: string }>;
  weapons: Record<string, { name?: string }>;
  pickups: Pickup[];
  structures?: Structure[];
  scoreLimit: number;
  timeLimit: number;
  tickRate: number;
  snapshotMs: number;
  players: MatchPlayer[];
  resumed?: boolean;
}

/**
 * One player in a snapshot (simulation.js `playerEntry`); the index constants in GameClient
 * name the fields.
 */
export type PlayerState = readonly [
  x: number, y: number, z: number, yaw: number, pitch: number, hp: number, flags: number, seq: number,
  vy: number, kx: number, kz: number, dashTime: number, dashX: number, dashZ: number, cooldown: number,
  kills: number, deaths: number, respawn: number, side: string, speed: number, heading: number, lap: number,
  checkpoint: number, nitro: number, boost: number, stun: number, item: string, armor: number, place: number, revive: number
];

/** Mode HUD data (`snapshot.m`). */
export interface ModeHud {
  nodes?: Array<[string, string | null]>;
  zx?: number;
  zz?: number;
  zr?: number;
  startIn?: number;
  boss?: string;
  bossHp?: number;
  bossMax?: number;
  phase?: number;
  wave?: number;
  enemies?: number;
  alive?: number;
  resources?: Record<string, number>;
  rank?: number[];
  laps?: number;
}

export interface Snapshot {
  t: number;
  left: number;
  score: Record<string, number>;
  /** null for players outside the interest radius */
  p: Array<PlayerState | null>;
  n?: Array<[id: string, type: string, x: number, y: number, z: number, yaw: number, hp: number, maxHp: number]>;
  hz?: Array<[id: string, x: number, z: number, r: number, armed: number]>;
  st?: number[];
  m?: ModeHud;
}

export type GameEvent =
  | { t: 'shot'; i: number; to: Vec3; hit: number }
  | { t: 'hit'; i: number; by: number }
  | { t: 'npc_hit'; by: number }
  | { t: 'npc_kill'; id: string }
  | { t: 'npc_attack'; id: string; to: number }
  | { t: 'ability'; i: number; kind: string }
  | { t: 'kill'; i: number; by: number }
  | { t: 'pickup_add'; p: Pickup }
  | { t: 'pickup_gone'; id: string }
  | { t: 'emote'; i: number; e: string }
  | { t: 'mine'; mines: Array<[string, number, number]>; blast?: [number, number] | null }
  | { t: 'rocket'; i: number; to: number }
  | { t: 'structure_down' }
  | { t: 'tower'; to: number }
  | { t: 'wave'; wave: number }
  | { t: 'boss_wave' }
  | { t: 'boss_phase'; phase: number }
  | { t: 'zone' }
  | { t: 'chaos' }
  | { t: 'infected'; i: number }
  | { t: 'revived'; i: number }
  | { t: 'siege' }
  | { t: 'go' }
  | { t: 'finish'; i: number; place: number };

export interface KillFeedEntry {
  id: number;
  killer: string;
  killerTeam: string | null;
  victim: string | undefined;
  victimTeam: string | undefined;
  verb: string | undefined;
  at: number;
}

export interface ScoreboardRow extends MatchPlayer {
  kills: number;
  deaths: number;
  connected: boolean;
}

/** What GameClient reports to the React HUD (about 10× per second). */
export interface HudState {
  hp: number;
  maxHp: number;
  alive: boolean;
  downed: boolean;
  eliminated: boolean;
  place: number;
  armor: number;
  item: string;
  lap: number;
  speed: number;
  nitro: number;
  revive: number;
  side: string;
  modeHud: ModeHud | null;
  npcs: number;
  announcement: string | null;
  spectating: string | null;
  respawnIn: number;
  shield: boolean;
  score: Record<string, number>;
  timeLeft: number;
  abilityCooldown: number;
  feed: KillFeedEntry[];
  paused: boolean;
  locked: boolean;
  hitMarker: boolean;
  damaged: boolean;
  showScoreboard: boolean;
  board: ScoreboardRow[];
}

/** The server builds these payloads; the shape is checked at the top level only (they arrive 20×/s). */
export const isSnapshot = (v: unknown): v is Snapshot =>
  isRecord(v) && Array.isArray(v.p) && v.p.every((e: unknown) => e === null || Array.isArray(e));

export const isGameEventList = (v: unknown): v is GameEvent[] =>
  Array.isArray(v) && v.every((e: unknown) => isRecord(e) && typeof e.t === 'string');

export const isMatchInfo = (v: unknown): v is MatchInfo =>
  isRecord(v) && typeof v.you === 'number' && Array.isArray(v.players) && isRecord(v.world) && isRecord(v.flags)
  && isRecord(v.characters) && isRecord(v.factions) && typeof v.tickRate === 'number' && Array.isArray(v.pickups);

// ---------- lobby / catalog / results ----------

export interface LobbyPlayer {
  id: string;
  username: string;
  team: string;
  characterId: string;
  ready: boolean;
  title?: string | null;
}

/** `game:lobby` (gameHandler.js `publicLobby`). */
export interface Lobby {
  channelId: string;
  mode: string;
  modeOptions: { bossId?: string; difficulty?: string; trackId?: string; battleId?: string };
  phase: string;
  teamLimit: number;
  battle?: { territory: string } | null;
  players: LobbyPlayer[];
}

export interface CatalogMode {
  id: string;
  name: string;
  min: number;
  max: number;
  description?: string;
  /** The server sends `m.options || null`. */
  options: { bosses: string[]; tracks: string[] } | null;
}

/** `game:catalog`. */
export interface Catalog {
  factions: Record<string, Faction>;
  characters: Record<string, CharacterStats>;
  modes: CatalogMode[];
  difficulties: Record<string, { label: string }>;
  tracks: Record<string, string>;
  npcDefs: Record<string, { name: string }>;
}

/** `game:profile`. */
export interface ArenaProfile {
  level: number;
  xp: number;
  wins: number;
}

export interface ResultPlayer {
  i: number;
  username: string;
  team: string;
  side?: string;
  place?: number;
  outcome?: string;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export interface PlayerRewards {
  xp: number;
  coins?: number;
  level: number;
  leveledUp?: boolean;
  achievements?: unknown[];
}

/** `game:match-end`, completed with what the client knew about the match. */
export interface MatchResult {
  mode: string;
  winner?: string | null;
  reason?: string;
  waves?: number;
  players: ResultPlayer[];
  /** player index -> rewards (missing for guests) */
  rewards?: Record<number, PlayerRewards | null | undefined>;
  rewardsSaved: boolean;
  youIndex: number | undefined;
  factions: Record<string, Faction> | undefined;
}

export const isLobby = (v: unknown): v is Lobby =>
  isRecord(v) && typeof v.channelId === 'string' && Array.isArray(v.players) && isRecord(v.modeOptions);

export const isCatalog = (v: unknown): v is Catalog =>
  isRecord(v) && isRecord(v.factions) && isRecord(v.characters) && Array.isArray(v.modes);

export const isArenaProfile = (v: unknown): v is ArenaProfile => isRecord(v) && typeof v.level === 'number';

export const isMatchEnd = (v: unknown): v is Omit<MatchResult, 'youIndex' | 'factions'> =>
  isRecord(v) && typeof v.mode === 'string' && Array.isArray(v.players);
