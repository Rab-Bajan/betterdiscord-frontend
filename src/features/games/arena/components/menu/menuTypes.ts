// A SUDS WAR menü lapjainak adatai (`game:rpc` válaszok, betterdiscord/game/meta.js).
// A szerver állítja elő őket; a lapok a felső szintű alakot ellenőrzik, a mélyebb mezőket nem.
import { isRecord } from '../../../../../shared/lib/guards';

export type Wallet = Record<string, number>;

export interface MatchHistoryEntry { ended_at: number; mode: string; outcome: string; kills: number; deaths: number; xp_awarded: number }
export interface Overview {
  profile: { username?: string; level: number; badge: string; title?: string | null; stats: Record<string, number>; history: MatchHistoryEntry[]; faction?: string | null };
  wallet: Wallet;
}
export interface Friend { username: string; online: boolean; status: string; incoming?: boolean }
export interface Mission { id: string; kind: string; name: string; reward: Wallet; claimed: boolean; progress: number; goal: number }
export interface Achievement { id: string; name: string; desc: string; earned: boolean; secret?: boolean }
export interface ShopItem { id: string; name: string; rarity: string; slot: string; price: { amount: number; currency: string } }
export interface Shop { wallet: Wallet; items: ShopItem[] }
export interface InventoryEntry { id: string; equipped: boolean; item: { name: string; rarity: string; slot: string; tradable?: boolean } }
export interface ClanSummary { id: string; name: string; logo: string; members: number; xp: number; open: boolean }
export interface ClanMember { username: string; rank: string; self?: boolean }
export interface ClanInfo {
  myRank?: string | null;
  invites?: Array<{ id: string; name: string; logo: string }>;
  clan: { name: string; logo: string; description?: string; xp: number; wins: number; war_wins: number; contribution: number; open: boolean } | null;
  list: ClanSummary[];
  /** Absent when the player has no clan. */
  members?: ClanMember[];
  chat?: Array<{ at: number; username: string; text: string }>;
}
export interface TradeOffer { items: Array<{ id: string; name: string }>; coins: number }
export interface Trade { id: string; partner: string; status: string; incoming?: boolean; myOffer: TradeOffer; theirOffer: TradeOffer; myConfirm: boolean; theirConfirm: boolean }
export interface Territory {
  id: string; name: string; x: number; y: number; value: number; defense: number; owner: string | null;
  links: string[]; battle?: { id: string } | null; history: Array<{ resolved_at: number; attacker: string; winner: string | null }>;
}
export interface Standing { faction: string; total: number; points?: number; territoryValue?: number }
export interface WarMap { territories: Territory[]; standings: Standing[] }
export interface BaseBuilding { id: string; level: number; health: number; maxHealth: number; ready: boolean; ready_at: number; def: { name: string; maxLevel: number; cost: number } }
export interface BaseState {
  defense: number; pending: number; now: number; raidReadyAt: number; buildings: BaseBuilding[];
  catalog: Array<{ id: string; name: string; desc: string; time: number; max: number; cost: number }>;
}
export interface LeaderboardInfo { id: string; name: string }
export interface Leaderboard { name: string; rows: Array<{ username?: string | null; value: number }> }
export interface Seasons {
  current: { id: number; ends_at: number };
  standings: Standing[];
  history: Array<{ id: number; winner: string | null; summary: { top: Array<{ username?: string }> } }>;
}
export interface AdminOverview {
  memoryMb: number; lobbies: number; seasonDays: number; xpMultiplier: number; disabledModes: string[];
  matches: Array<{ id: string; mode: string; players: number; time: number; score: unknown }>;
  reports: Array<{ id: string; reporter: string; target: string; reason: string }>;
  audit: Array<{ at: number; actor: string; action: string; detail: string }>;
}

/** A guard that only checks that the reply has the listed top-level fields. */
export const hasFields = <T>(...keys: string[]) => (v: unknown): v is T => isRecord(v) && keys.every((k) => k in v);
export const isList = <T>(v: unknown): v is T[] => Array.isArray(v);

/** The faction fields the menu shows. */
export interface MenuFaction {
  id: string;
  name: string;
  color: string;
}
