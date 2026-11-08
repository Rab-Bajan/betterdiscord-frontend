import React, { useMemo } from 'react';
import { classInfo } from './classifications';

// Mindkét színhez a tömör bábuk, a szín a kitöltésből jön. A ︎ szöveges megjelenítést kényszerít (nem emoji).
const GLYPH = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
const SQUARE = 100;
const LIGHT = '#C8CBEE';
const DARK = '#7C80C2';

// FEN első mezője -> { 'e4': { type, color } }
function parsePlacement(fen) {
  const pieces = {};
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, rowIndex) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        pieces[`${'abcdefgh'[file]}${8 - rowIndex}`] = { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' };
        file += 1;
      }
    }
  });
  return pieces;
}

// Mező közepe az SVG-ben (a tábla forgatását is figyelembe véve)
function center(square, flipped) {
  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  const x = flipped ? 7 - file : file;
  const y = flipped ? rank : 7 - rank;
  return { x: x * SQUARE + SQUARE / 2, y: y * SQUARE + SQUARE / 2, col: x, row: y };
}

function Arrow({ from, to, flipped, color }) {
  const a = center(from, flipped);
  const b = center(to, flipped);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const ux = dx / length;
  const uy = dy / length;
  const head = 30;
  const tail = { x: a.x + ux * 22, y: a.y + uy * 22 };
  const neck = { x: b.x - ux * (head - 4), y: b.y - uy * (head - 4) };
  const tip = { x: b.x - ux * 6, y: b.y - uy * 6 };
  const px = -uy;
  const py = ux;
  const points = [
    [tip.x, tip.y],
    [neck.x + px * 17, neck.y + py * 17],
    [neck.x - px * 17, neck.y - py * 17]
  ].map((p) => p.join(',')).join(' ');
  return (
    <g opacity="0.85">
      <line x1={tail.x} y1={tail.y} x2={neck.x} y2={neck.y} stroke={color} strokeWidth="14" strokeLinecap="round" />
      <polygon points={points} fill={color} />
    </g>
  );
}

/**
 * @param {string} fen
 * @param {{from:string,to:string}|null} lastMove     a legutóbbi lépés (kiemelés)
 * @param {string|null} classification                a lépés besorolása (kiemelés színe + jelvény)
 * @param {{from:string,to:string}|null} bestMove     a Stockfish javaslata (nyíl)
 */
export default function AnalysisBoard({ fen, lastMove = null, classification = null, bestMove = null, flipped = false }) {
  const pieces = useMemo(() => parsePlacement(fen), [fen]);
  const info = classification ? classInfo(classification) : null;

  const squares = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const file = flipped ? 7 - col : col;
      const rank = flipped ? row + 1 : 8 - row;
      const name = `${'abcdefgh'[file]}${rank}`;
      squares.push({ name, row, col, light: (file + rank) % 2 === 1 });
    }
  }

  const to = lastMove ? center(lastMove.to, flipped) : null;
  // A jelvény a célmező jobb felső sarkában ül, de a tábla szélén sem lóghat ki
  const badge = to ? { x: Math.min(to.x + 34, 800 - 24), y: Math.max(to.y - 34, 24) } : null;

  return (
    <svg
      viewBox="0 0 800 800"
      className="w-full h-auto block rounded-lg select-none"
      role="img"
      aria-label={`Sakktábla${lastMove ? `, utolsó lépés: ${lastMove.from}–${lastMove.to}` : ''}`}
      style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)' }}
    >
      {squares.map(({ name, row, col, light }) => (
        <rect key={name} x={col * SQUARE} y={row * SQUARE} width={SQUARE} height={SQUARE} fill={light ? LIGHT : DARK} />
      ))}

      {/* Utolsó lépés kiemelése a besorolás színével */}
      {lastMove && [lastMove.from, lastMove.to].map((sq) => {
        const c = center(sq, flipped);
        return <rect key={sq} x={c.col * SQUARE} y={c.row * SQUARE} width={SQUARE} height={SQUARE} fill={info ? info.color : '#F5F682'} opacity="0.55" />;
      })}

      {/* Koordináták */}
      {squares.filter(({ col }) => col === 0).map(({ name, row, light }) => (
        <text key={`r${name}`} x={5} y={row * SQUARE + 20} fontSize="20" fontWeight="700" fill={light ? DARK : LIGHT}>{name[1]}</text>
      ))}
      {squares.filter(({ row }) => row === 7).map(({ name, col, light }) => (
        <text key={`f${name}`} x={col * SQUARE + SQUARE - 6} y={7 * SQUARE + SQUARE - 7} fontSize="20" fontWeight="700" textAnchor="end" fill={light ? DARK : LIGHT}>{name[0]}</text>
      ))}

      {bestMove && <Arrow from={bestMove.from} to={bestMove.to} flipped={flipped} color="#7FB92E" />}

      {/* Bábuk */}
      {Object.entries(pieces).map(([name, piece]) => {
        const c = center(name, flipped);
        const white = piece.color === 'w';
        return (
          <text
            key={name}
            x={c.x}
            y={c.y + 28}
            fontSize="86"
            textAnchor="middle"
            fill={white ? '#FFFFFF' : '#14142B'}
            stroke={white ? '#14142B' : '#E8E8FF'}
            strokeWidth="2.2"
            paintOrder="stroke"
            style={{ fontFamily: '"Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif' }}
          >
            {GLYPH[piece.type]}
          </text>
        );
      })}

      {/* Besorolás-jelvény a célmező sarkában */}
      {info && badge && (
        <g>
          <circle cx={badge.x} cy={badge.y} r="21" fill={info.color} stroke="#0B0C1E" strokeWidth="3" />
          <text x={badge.x} y={badge.y} fontSize={info.symbol.length > 1 && !/[\u{1F300}-\u{1FAFF}]/u.test(info.symbol) ? 20 : 22} fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="#fff">
            {info.symbol}
          </text>
        </g>
      )}
    </svg>
  );
}
