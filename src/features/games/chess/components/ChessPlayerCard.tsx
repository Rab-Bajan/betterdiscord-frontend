import React from 'react';
import Avatar from '../../../../shared/ui/Avatar';
import type { ChessPlayer } from '../types';

interface PlayerCardProps {
  player: ChessPlayer | null;
  colorName: string;
  isTurn: boolean;
  pieceIcon: string;
  isMe: boolean;
  canJoin: boolean | undefined;
  onJoin: () => void;
}

// Játékoskártya: név, kör jelzése, csatlakozás gomb
export default function ChessPlayerCard({ player, colorName, isTurn, pieceIcon, isMe, canJoin, onJoin }: PlayerCardProps) {
  if (!player) {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <span className="text-lg opacity-40">{pieceIcon}</span>
          <span className="text-xs text-[#999BBE] italic">{colorName} játékos nincs</span>
        </div>
        {canJoin && (
          <button
            onClick={onJoin}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#7655F5] hover:brightness-110 text-white transition-all shadow cursor-pointer"
          >
            Beszállás
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative flex-shrink-0">
          <Avatar user={player} size="sm" speaking={isTurn} />
          {isTurn && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#28C997] rounded-full border-2 border-[#151832] animate-ping" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#F4F3FF] truncate max-w-[120px] sm:max-w-[160px]">
              {player.username}
            </span>
            {isMe && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-[#7655F5]/30 text-[#7655F5] font-bold">
                Te
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#999BBE]">
            {colorName} {isTurn && '• Lépésre vár'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xl">{pieceIcon}</span>
      </div>
    </div>
  );
}
