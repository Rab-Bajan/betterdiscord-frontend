import React, { useState, useMemo } from 'react';
import { Chess } from 'chess.js';
import Avatar from './Avatar';
import { 
  Trophy, 
  RotateCcw, 
  Flag, 
  Eye, 
  Users, 
  X, 
  Crown, 
  Swords, 
  Play, 
  Volume2, 
  Sparkles,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

// Elegáns SVG sakkfigurák a prémium megjelenésért
const PIECES = {
  w: {
    k: '♔',
    q: '♕',
    r: '♖',
    b: '♗',
    n: '♘',
    p: '♙'
  },
  b: {
    k: '♚',
    q: '♛',
    r: '♜',
    b: '♝',
    n: '♞',
    p: '♟'
  }
};

export default function ChessView({
  session,
  currentUser,
  channelId,
  channelName,
  onStart,
  onJoin,
  onMove,
  onResign,
  onRematch,
  onStop,
  onClose
}) {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [promotionSquare, setPromotionSquare] = useState(null);

  // Chess.js kliensoldali példány a legális lépések lekéréséhez
  const chessInstance = useMemo(() => {
    try {
      return new Chess(session?.fen || undefined);
    } catch (e) {
      return new Chess();
    }
  }, [session?.fen]);

  // Jelenlegi felhasználó szerepe
  const isWhite = session?.white?.id === currentUser?.id;
  const isBlack = session?.black?.id === currentUser?.id;
  const isPlayer = isWhite || isBlack;
  const isSpectator = session?.active && !isPlayer;
  const canJoinBlack = session?.active && !session?.black && !isWhite;
  const canJoinWhite = session?.active && !session?.white && !isBlack;

  const currentTurn = session?.turn || 'w'; // 'w' vagy 'b'
  const isMyTurn = (isWhite && currentTurn === 'w') || (isBlack && currentTurn === 'b');

  // Tábla orientáció: Fekete játékos alulról nézi a sajátjait
  const boardFlipped = isBlack;

  // Kiválasztott mező legális lépései
  const legalMoves = useMemo(() => {
    if (!selectedSquare || !isMyTurn || session?.status !== 'playing') return [];
    try {
      const moves = chessInstance.moves({ square: selectedSquare, verbose: true });
      return moves.map(m => m.to);
    } catch (e) {
      return [];
    }
  }, [selectedSquare, chessInstance, isMyTurn, session?.status]);

  // Mezőre kattintás kezelése
  const handleSquareClick = (square, piece) => {
    if (!isMyTurn || session?.status !== 'playing') {
      setSelectedSquare(null);
      return;
    }

    // Ha még nincs kiválasztva bábu:
    if (!selectedSquare) {
      if (piece) {
        const pieceColor = piece.color;
        const myColor = isWhite ? 'w' : 'b';
        if (pieceColor === myColor) {
          setSelectedSquare(square);
        }
      }
      return;
    }

    // Ha ugyanarra a mezőre kattintott, kijelölés törlése
    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    // Ha egy másik saját bábura kattintott, arra váltunk
    if (piece && piece.color === (isWhite ? 'w' : 'b')) {
      setSelectedSquare(square);
      return;
    }

    // Lépés megkísérlése
    if (legalMoves.includes(square)) {
      // Gyalogátváltozás (Promotion) ellenőrzése
      const isPawn = chessInstance.get(selectedSquare)?.type === 'p';
      const isPromotionRank = (isWhite && square[1] === '8') || (isBlack && square[1] === '1');

      if (isPawn && isPromotionRank) {
        // Alapértelmezett királynő (Queen) azonnal
        onMove({ from: selectedSquare, to: square, promotion: 'q' });
      } else {
        onMove({ from: selectedSquare, to: square });
      }
      setSelectedSquare(null);
    } else {
      setSelectedSquare(null);
    }
  };

  // 8x8 tábla mátrix felépítése
  const board = chessInstance.board(); // 8 sor, mindegyik 8 elem
  const ranks = boardFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = boardFlipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  // Ha nincs még aktív parti ebben a csatornában
  if (!session || !session.active) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-[#090A18]/90 backdrop-blur-md">
        <div className="max-w-md w-full bg-[#151832] border border-[#7655F5]/30 rounded-2xl p-8 shadow-2xl flex flex-col items-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-[#7655F5]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#7655F5] to-[#536CFF] flex items-center justify-center text-white text-3xl shadow-lg mb-4">
            <Swords className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-[#F4F3FF] mb-2">1v1 Sakk Aréna</h2>
          <p className="text-sm text-[#999BBE] mb-6">
            Hívd ki a szobában lévő barátaidat egy valós idejű sakkcsatára! A többiek élőben nézhetik a küzdelmet.
          </p>

          <div className="w-full space-y-3">
            <button
              onClick={() => onStart('white')}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#7655F5] to-[#536CFF] hover:brightness-110 text-white shadow-lg transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              <Crown className="w-4 h-4 text-[#F5B041] group-hover:scale-110 transition-transform" />
              <span>Parti indítása (Fehérként kezdek)</span>
            </button>

            <button
              onClick={() => onStart('black')}
              className="w-full py-3 px-4 rounded-xl font-semibold text-xs bg-[#1B2040] hover:bg-[#242b50] text-[#999BBE] hover:text-[#F4F3FF] border border-[#7655F5]/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Indítás Feketeként (Várok egy Fehér kihívóra)</span>
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs text-[#999BBE]">
            <Eye className="w-3.5 h-3.5 text-[#536CFF]" />
            <span>Valós idejű nézői (Spectator) támogatás</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#090A18]/95 select-none relative">
      {/* Felső fejléc sáv */}
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-[#7655F5]/20 bg-[#101329]/90 backdrop-blur-md z-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7655F5] to-[#536CFF] flex items-center justify-center text-white text-lg flex-shrink-0 shadow-md">
            ♟️
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#F4F3FF] truncate">
                SharkVoic Sakk
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#28C997]/20 text-[#28C997] border border-[#28C997]/40 uppercase tracking-wider flex-shrink-0 animate-pulse">
                ÉLŐ
              </span>
            </div>
            <div className="text-[11px] text-[#999BBE] flex items-center gap-2 truncate">
              <span>{channelName || 'Hangcsatorna'}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-[#536CFF]" />
                {session.spectators?.length || 0} néző
              </span>
            </div>
          </div>
        </div>

        {/* Felső vezérlők */}
        <div className="flex items-center gap-2">
          {isPlayer && session.status === 'playing' && (
            <button
              onClick={onResign}
              title="Parti feladása"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E94B64]/15 hover:bg-[#E94B64]/25 text-[#E94B64] border border-[#E94B64]/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Feladás</span>
            </button>
          )}

          {(isPlayer || session.startedBy === currentUser?.username) && (
            <button
              onClick={onStop}
              title="Parti leállítása mindenkinél"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1B2040] hover:bg-[#242b50] text-[#999BBE] hover:text-[#F4F3FF] border border-[#7655F5]/20 transition-all cursor-pointer"
            >
              Leállítás
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              title="Vissza a csatornához"
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#999BBE] hover:text-white hover:bg-[#1B2040] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Fő tartalom: Sakk tábla és Információs sáv */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row items-center lg:items-start justify-start lg:justify-center gap-4 sm:gap-6 p-2 sm:p-4 md:p-6 overflow-y-auto">
        
        {/* Bal oldali rész: A Sakk tábla */}
        <div className="flex flex-col items-center max-w-full">
          
          {/* Felső játékos kártya (Ellenfelem vagy a másik szín) */}
          <div className="w-full max-w-[min(80vw,480px)] md:max-w-[min(520px,70vh)] lg:max-w-[min(560px,75vh)] flex items-center justify-between px-3 py-2 bg-[#151832] border border-[#7655F5]/20 rounded-t-xl mb-1 shadow-sm">
            {boardFlipped ? (
              // Ha meg van fordítva a tábla, felül a Fehér van
              <PlayerCard
                player={session.white}
                colorName="Fehér"
                isTurn={session.turn === 'w' && session.status === 'playing'}
                pieceIcon="♔"
                isMe={isWhite}
                canJoin={canJoinWhite}
                onJoin={() => onJoin()}
              />
            ) : (
              // Standard nézetben felül a Fekete van
              <PlayerCard
                player={session.black}
                colorName="Fekete"
                isTurn={session.turn === 'b' && session.status === 'playing'}
                pieceIcon="♚"
                isMe={isBlack}
                canJoin={canJoinBlack}
                onJoin={() => onJoin()}
              />
            )}
          </div>

          {/* Sakk tábla rács */}
          <div 
            className="w-[min(80vw,480px)] h-[min(80vw,480px)] md:w-[min(520px,70vh)] md:h-[min(520px,70vh)] lg:w-[min(560px,75vh)] lg:h-[min(560px,75vh)] flex-shrink-0 bg-[#101329] p-1.5 sm:p-2 rounded-xl shadow-2xl border-2 border-[#7655F5]/30 flex flex-col relative select-none"
            style={{ boxShadow: '0 20px 50px rgba(9, 10, 24, 0.8), 0 0 30px rgba(118, 85, 245, 0.15)' }}
          >
            {ranks.map((rank) => (
              <div key={rank} className="flex-1 flex">
                {files.map((file) => {
                  const square = `${file}${rank}`;
                  const piece = chessInstance.get(square);
                  const isLight = (file.charCodeAt(0) - 97 + rank) % 2 !== 0;
                  const isSelected = selectedSquare === square;
                  const isLegalTarget = legalMoves.includes(square);
                  const isLastMove = session.lastMove && (session.lastMove.from === square || session.lastMove.to === square);
                  const isKingInCheck = session.inCheck && piece?.type === 'k' && piece?.color === session.turn;

                  return (
                    <div
                      key={square}
                      onClick={() => handleSquareClick(square, piece)}
                      className={`flex-1 relative flex items-center justify-center cursor-pointer transition-colors ${
                        isLight 
                          ? 'bg-[#293056] text-[#F4F3FF]' 
                          : 'bg-[#181D3B] text-[#F4F3FF]'
                      } ${isSelected ? '!bg-[#7655F5]/70' : ''} ${
                        isLastMove && !isSelected ? 'ring-2 ring-[#7655F5]/50 ring-inset bg-[#536CFF]/20' : ''
                      } ${isKingInCheck ? '!bg-[#E94B64]/60 ring-2 ring-[#E94B64] animate-pulse' : ''}`}
                    >
                      {/* Mező koordináták feliratai a széleken */}
                      {file === (boardFlipped ? 'h' : 'a') && (
                        <span className="absolute top-0.5 left-1 text-[9px] font-bold text-white/30 pointer-events-none">
                          {rank}
                        </span>
                      )}
                      {rank === (boardFlipped ? 8 : 1) && (
                        <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-white/30 pointer-events-none">
                          {file}
                        </span>
                      )}

                      {/* Legális lépés jelző pötty / körgyűrű */}
                      {isLegalTarget && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                          {piece ? (
                            <div className="w-full h-full border-4 border-[#28C997] rounded-sm opacity-80 animate-pulse" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-[#28C997] shadow-lg shadow-[#28C997]/50" />
                          )}
                        </div>
                      )}

                      {/* Bábu megjelenítése */}
                      {piece && (
                        <span
                          className={`text-2xl sm:text-3xl md:text-4xl transition-transform duration-100 ${
                            isSelected ? 'scale-115' : 'hover:scale-105'
                          } ${piece.color === 'w' ? 'drop-shadow-[0_2px_4px_rgba(255,255,255,0.4)] text-white' : 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-[#999BBE]'}`}
                          style={{
                            lineHeight: 1,
                            userSelect: 'none'
                          }}
                        >
                          {PIECES[piece.color][piece.type]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Alsó játékos kártya (Én vagy a kezdő szín) */}
          <div className="w-full max-w-[min(80vw,480px)] md:max-w-[min(520px,70vh)] lg:max-w-[min(560px,75vh)] flex items-center justify-between px-3 py-2 bg-[#151832] border border-[#7655F5]/20 rounded-b-xl mt-1 shadow-sm">
            {boardFlipped ? (
              // Ha meg van fordítva, lent a Fekete van
              <PlayerCard
                player={session.black}
                colorName="Fekete"
                isTurn={session.turn === 'b' && session.status === 'playing'}
                pieceIcon="♚"
                isMe={isBlack}
                canJoin={canJoinBlack}
                onJoin={() => onJoin()}
              />
            ) : (
              // Standard nézetben lent a Fehér van
              <PlayerCard
                player={session.white}
                colorName="Fehér"
                isTurn={session.turn === 'w' && session.status === 'playing'}
                pieceIcon="♔"
                isMe={isWhite}
                canJoin={canJoinWhite}
                onJoin={() => onJoin()}
              />
            )}
          </div>
        </div>

        {/* Jobb oldali sáv: Státusz, Lépéstörténet, Spectator Panel */}
        <div className="w-full lg:w-72 flex flex-col gap-3 min-w-0">
          
          {/* Státusz kártya */}
          <div className="bg-[#151832] border border-[#7655F5]/20 rounded-xl p-4 shadow-lg">
            <h3 className="text-xs font-bold text-[#999BBE] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#7655F5]" />
              Állapot
            </h3>

            {session.status === 'waiting' && (
              <div className="bg-[#101329] border border-[#F5B041]/30 rounded-lg p-3 text-center">
                <p className="text-xs font-semibold text-[#F5B041] mb-2">
                  Várakozás a 2. játékosra...
                </p>
                {canJoinBlack && (
                  <button
                    onClick={onJoin}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-gradient-to-r from-[#7655F5] to-[#536CFF] text-white hover:brightness-110 shadow transition-all cursor-pointer"
                  >
                    Csatlakozás Feketeként (1v1)
                  </button>
                )}
                {isPlayer && (
                  <p className="text-[11px] text-[#999BBE]">
                    Oszd meg a szobát a barátaiddal, hogy csatlakozzanak!
                  </p>
                )}
              </div>
            )}

            {session.status === 'playing' && (
              <div className="space-y-2">
                <div 
                  className="p-2.5 rounded-lg flex items-center justify-between border"
                  style={{
                    background: session.turn === 'w' ? 'rgba(118, 85, 245, 0.15)' : 'rgba(83, 108, 255, 0.15)',
                    borderColor: session.turn === 'w' ? '#7655F5' : '#536CFF'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {session.turn === 'w' ? '♔' : '♚'}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-[#F4F3FF]">
                        {session.turn === 'w' 
                          ? `${session.white?.username || 'Fehér'} lépése`
                          : `${session.black?.username || 'Fekete'} lépése`}
                      </div>
                      <div className="text-[10px] text-[#999BBE]">
                        {isMyTurn ? '👉 Te vagy a soron!' : 'Várakozás a lépésre...'}
                      </div>
                    </div>
                  </div>
                  {session.inCheck && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-[#E94B64] text-white animate-pulse">
                      SAKK!
                    </span>
                  )}
                </div>

                {isSpectator && (
                  <div className="text-center py-1.5 px-2 bg-[#1B2040]/60 rounded-lg text-xs text-[#999BBE] flex items-center justify-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-[#536CFF]" />
                    <span>Néző mód (Spectator)</span>
                  </div>
                )}
              </div>
            )}

            {/* Játék vége nézet */}
            {['checkmate', 'draw', 'resigned'].includes(session.status) && (
              <div className="bg-[#101329] border border-[#7655F5]/40 rounded-xl p-3 text-center space-y-2.5">
                <Trophy className="w-8 h-8 text-[#F5B041] mx-auto" />
                <div>
                  <div className="text-sm font-bold text-[#F4F3FF]">
                    {session.status === 'checkmate' && '🏆 SAKK-MATT!'}
                    {session.status === 'resigned' && '🏳️ Feladás!'}
                    {session.status === 'draw' && '🤝 Döntetlen!'}
                  </div>
                  <div className="text-xs text-[#28C997] font-semibold mt-0.5">
                    {session.winner === 'white' && `${session.white?.username || 'Fehér'} győzött!`}
                    {session.winner === 'black' && `${session.black?.username || 'Fekete'} győzött!`}
                    {session.winner === 'draw' && 'A játszma döntetlennel zárult.'}
                  </div>
                </div>

                {isPlayer && (
                  <button
                    onClick={onRematch}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-gradient-to-r from-[#28C997] to-[#28C997] text-white hover:brightness-110 shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Új játék / Visszavágó</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Lépéstörténet */}
          <div className="bg-[#151832] border border-[#7655F5]/20 rounded-xl p-3 shadow-lg flex-1 flex flex-col min-h-[140px] max-h-[220px]">
            <h3 className="text-xs font-bold text-[#999BBE] uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Lépéstörténet</span>
              <span className="text-[10px] text-[#7655F5]">
                {session.history?.length || 0} fél-lépés
              </span>
            </h3>

            <div className="flex-1 overflow-y-auto pr-1 space-y-1 font-mono text-xs">
              {session.history && session.history.length > 0 ? (
                formatHistory(session.history).map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between px-2 py-1 rounded bg-[#101329]/60 text-[#999BBE] hover:text-[#F4F3FF]">
                    <span className="text-[#7655F5] w-6">{idx + 1}.</span>
                    <span className="flex-1 text-center font-bold text-[#F4F3FF]">{row.white}</span>
                    <span className="flex-1 text-center text-[#999BBE]">{row.black || ''}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-[#999BBE]/60">
                  Még nincs megtett lépés.
                </div>
              )}
            </div>
          </div>

          {/* Nézők (Spectators) sáv */}
          {session.spectators && session.spectators.length > 0 && (
            <div className="bg-[#151832] border border-[#7655F5]/20 rounded-xl p-3 shadow-lg">
              <h3 className="text-xs font-bold text-[#999BBE] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#536CFF]" />
                Nézők ({session.spectators.length})
              </h3>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {session.spectators.map(spec => (
                  <span
                    key={spec.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#1B2040] text-[#999BBE] border border-[#7655F5]/10"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#536CFF]" />
                    {spec.username}
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Segédkomponens: Játékos Kártya
function PlayerCard({ player, colorName, isTurn, pieceIcon, isMe, canJoin, onJoin }) {
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

// Lépéstörténet párokba rendezése (Fehér és Fekete lépések egymás mellett)
function formatHistory(history) {
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      white: history[i]?.san || history[i],
      black: history[i + 1]?.san || history[i + 1] || null
    });
  }
  return rows;
}
