import React from 'react';
import { Trophy } from 'lucide-react';
import { REASON_TEXT, card, sideLabel } from '../lib/arenaLabels';
import type { Faction, MatchResult } from '../types';

interface MatchResultsProps {
  result: MatchResult;
  factions: Record<string, Faction>;
  onBack: () => void;
}

// Meccs utáni eredmények és jutalmak
export default function MatchResults({ result, factions, onBack }: MatchResultsProps) {
  const myRewards = result.youIndex === undefined ? undefined : result.rewards?.[result.youIndex];
  const me = result.players.find((p) => p.i === result.youIndex);
  const label = (side: string) => sideLabel(side, result.players, factions);
  let title = result.winner ? `${label(result.winner)} győzött!` : 'Nincs győztes';
  if (result.mode === 'boss') title = result.winner ? 'A főellenség legyőzve!' : 'Lejárt az idő';
  if (result.mode === 'survival') title = `Túlélt hullámok: ${result.waves}`;
  const ordered = result.mode === 'racing' || result.mode === 'royale' ? [...result.players].sort((a, b) => (a.place || 99) - (b.place || 99)) : [...result.players].sort((a, b) => b.kills - a.kills);
  return (
    <div className="flex-1 overflow-y-auto p-4 flex justify-center">
      <div className="w-full max-w-xl rounded-2xl p-5 h-fit" style={card}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-6 h-6 text-shark-gold" />
          <h2 className="text-xl font-extrabold text-white">{title}</h2>
        </div>
        <p className="text-sm mb-3" style={{ color: '#999BBE' }}>
          {me?.outcome === 'win' ? 'Győztél! ' : ''}{me?.place ? `${me.place}. hely. ` : ''}{(result.reason && REASON_TEXT[result.reason]) || ''}
        </p>
        <table className="w-full text-sm text-left mb-3" style={{ color: '#F4F3FF' }}>
          <thead><tr style={{ color: '#999BBE' }} className="text-xs"><th className="py-1">Játékos</th><th>Ölés</th><th>Halál</th><th>Asszt</th><th>Sebzés</th></tr></thead>
          <tbody>
            {ordered.map((p) => (
              <tr key={p.i}><td className="py-0.5" style={{ color: factions[p.team]?.color }}>{p.place ? `${p.place}. ` : ''}{p.username}</td><td>{p.kills}</td><td>{p.deaths}</td><td>{p.assists}</td><td>{p.damage}</td></tr>
            ))}
          </tbody>
        </table>
        {!result.rewardsSaved && <p className="text-sm mb-3" style={{ color: '#E94B64' }}>A meccs eredményét nem sikerült elmenteni, ezért nem kaptál jutalmat.</p>}
        {result.rewardsSaved && myRewards && (
          <p className="text-sm mb-3 font-semibold" style={{ color: '#28C997' }}>
            +{myRewards.xp} XP · +{myRewards.coins || 0} érme · {myRewards.level}. szint{myRewards.leveledUp ? ' · Szintlépés!' : ''}
            {myRewards.xp === 0 && <span style={{ color: '#999BBE' }}> (rövid vagy üres meccsért nem jár jutalom)</span>}
            {(myRewards.achievements?.length ?? 0) > 0 && <span className="block">🏆 Új eredmény! Nézd meg a Küldetések fülön.</span>}
          </p>
        )}
        {result.rewardsSaved && !myRewards && <p className="text-sm mb-3" style={{ color: '#999BBE' }}>Vendégként nem gyűjtesz jutalmat, ehhez jelentkezz be.</p>}
        <button type="button" onClick={onBack} className="w-full py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}>Vissza a lobbiba</button>
      </div>
    </div>
  );
}
