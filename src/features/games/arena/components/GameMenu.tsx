// A SUDS WAR menü: a lobbi melletti lapok (profil, küldetések, bolt, klán, ...).
import React from 'react';
import type { ArenaSocket } from '../lib/GameRpc';
import type { MenuFaction } from './menu/menuTypes';
import ProfilePanel from './menu/ProfilePanel';
import MissionsPanel from './menu/MissionsPanel';
import ShopPanel from './menu/ShopPanel';
import ClanPanel from './menu/ClanPanel';
import TradePanel from './menu/TradePanel';
import WarPanel from './menu/WarPanel';
import BasePanel from './menu/BasePanel';
import LeaderboardPanel from './menu/LeaderboardPanel';
import SeasonPanel from './menu/SeasonPanel';
import SettingsPanel from './menu/SettingsPanel';
import ArenaAdminPanel from './menu/ArenaAdminPanel';

export const MENU_TABS: ReadonlyArray<readonly [string, string]> = [['profile', 'Profil'], ['missions', 'Küldetések'], ['shop', 'Bolt'], ['clan', 'Klán'], ['trade', 'Csere'], ['war', 'Világháború'], ['base', 'Bázis'], ['leaders', 'Ranglista'], ['season', 'Évszak'], ['settings', 'Beállítások']];

interface GameMenuProps {
  tab: string;
  socket: ArenaSocket;
  factions: Record<string, MenuFaction>;
  lobbyId: string | undefined;
  onJoinBattle: (battleId: string) => void;
  quality: string;
  onQuality: (quality: string) => void;
  voiceMode: string;
  onVoiceMode: (mode: string) => void;
}

export default function GameMenu({ tab, socket, factions, lobbyId, onJoinBattle, quality, onQuality, voiceMode, onVoiceMode }: GameMenuProps) {
  switch (tab) {
    case 'profile': return <ProfilePanel socket={socket} lobbyId={lobbyId} />;
    case 'missions': return <MissionsPanel socket={socket} />;
    case 'shop': return <ShopPanel socket={socket} />;
    case 'clan': return <ClanPanel socket={socket} />;
    case 'trade': return <TradePanel socket={socket} />;
    case 'war': return <WarPanel socket={socket} factions={factions} onJoinBattle={onJoinBattle} />;
    case 'base': return <BasePanel socket={socket} />;
    case 'leaders': return <LeaderboardPanel socket={socket} />;
    case 'season': return <SeasonPanel socket={socket} factions={factions} />;
    case 'settings': return <SettingsPanel quality={quality} onQuality={onQuality} voiceMode={voiceMode} onVoiceMode={onVoiceMode} />;
    case 'admin': return <ArenaAdminPanel socket={socket} />;
    default: return null;
  }
}
