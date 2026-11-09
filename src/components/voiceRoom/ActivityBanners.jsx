import React from 'react';

function Banner({ background, borderColor, textColor, accentColor, icon, who, text, action, actionStyle, onAction, actionClass }) {
  return (
    <div
      className="px-3 py-2 flex items-center justify-between text-xs flex-shrink-0 gap-2 min-w-0 w-full max-w-full overflow-hidden"
      style={{ background, borderBottom: `1px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-2 truncate min-w-0" style={{ color: textColor }}>
        <span className="text-base animate-bounce flex-shrink-0">{icon}</span>
        <span className="truncate">
          <strong style={{ color: accentColor }}>{who}</strong> {text}
        </span>
      </div>
      <button
        onClick={onAction}
        className={`px-2.5 py-1.5 min-h-[32px] rounded-lg font-extrabold text-xs shadow transition transform active:scale-95 flex-shrink-0 whitespace-nowrap ${actionClass}`}
        style={actionStyle}
      >
        {action}
      </button>
    </div>
  );
}

// Értesítő sávok: másik nézetben vagyunk, miközben a szobában fut valami
export default function ActivityBanners({ subView, watchState, casinoSession, chessSession, empireSession, browserSession, gameSession, onOpen }) {
  return (
    <>
      {gameSession && subView !== 'game' && (
        <Banner
          background="#151832"
          borderColor="rgba(83, 108, 255, 0.3)"
          textColor="#F4F3FF"
          accentColor="#536CFF"
          icon="🫧"
          who={gameSession.startedBy || 'Valaki'}
          text={gameSession.active ? 'meccset játszik a SUDS WAR-ban!' : `lobbit nyitott a SUDS WAR-hoz (${gameSession.playerCount} játékos)!`}
          action="Megnyitás 🫧"
          actionClass="text-white"
          actionStyle={{ background: 'linear-gradient(135deg, #536CFF, #9bd14b)' }}
          onAction={() => onOpen('game')}
        />
      )}
      {browserSession?.active && subView !== 'browser' && (
        <Banner
          background="#151832"
          borderColor="rgba(83, 108, 255, 0.3)"
          textColor="#F4F3FF"
          accentColor="#536CFF"
          icon="🌐"
          who={browserSession.startedBy || 'Valaki'}
          text="elindította a Közös Böngészőt!"
          action="Csatlakozás 🌐"
          actionClass="text-white"
          actionStyle={{ background: 'linear-gradient(135deg, #536CFF, #7655F5)' }}
          onAction={() => onOpen('browser')}
        />
      )}
      {watchState?.active && subView !== 'watch' && (
        <Banner
          background="#151832"
          borderColor="rgba(233, 75, 100, 0.3)"
          textColor="#F4F3FF"
          accentColor="#E94B64"
          icon="🔴"
          who={watchState.startedBy || 'Valaki'}
          text="elindította a közös YouTube videót!"
          action="Megnyitás ▶️"
          actionClass="text-white ml-1"
          actionStyle={{ background: 'linear-gradient(135deg, #E94B64, #c93a52)' }}
          onAction={() => onOpen('watch')}
        />
      )}
      {casinoSession?.active && subView !== 'casino' && (
        <Banner
          background="#151832"
          borderColor="rgba(245, 176, 65, 0.3)"
          textColor="#F4F3FF"
          accentColor="#F5B041"
          icon="🎰"
          who={casinoSession.startedBy}
          text="elindította a 3D Kaszinót!"
          action="Belépés 🎲"
          actionClass="text-black"
          actionStyle={{ background: 'linear-gradient(135deg, #F5B041, #d4922a)' }}
          onAction={() => onOpen('casino')}
        />
      )}
      {chessSession?.active && subView !== 'chess' && (
        <Banner
          background="#151832"
          borderColor="rgba(118, 85, 245, 0.3)"
          textColor="#F4F3FF"
          accentColor="#7655F5"
          icon="♟️"
          who={chessSession.startedBy}
          text="elindított egy Sakk partit!"
          action="Csatlakozás / Nézés ♟️"
          actionClass="text-white"
          actionStyle={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
          onAction={() => onOpen('chess')}
        />
      )}
      {empireSession?.active && subView !== 'empire' && (
        <Banner
          background="#151832"
          borderColor="rgba(40, 201, 151, 0.3)"
          textColor="#F4F3FF"
          accentColor="#28C997"
          icon="⚔️"
          who={empireSession.startedBy}
          text="MiskolcEmpire meccset játszik!"
          action="Megnyitás ⚔️"
          actionClass="text-black"
          actionStyle={{ background: 'linear-gradient(135deg, #28C997, #1fa57c)' }}
          onAction={() => onOpen('empire')}
        />
      )}
    </>
  );
}
