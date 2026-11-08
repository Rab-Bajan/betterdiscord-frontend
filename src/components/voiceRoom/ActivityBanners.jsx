import React from 'react';

function Banner({ background, borderColor, textColor, accentColor, icon, who, text, action, actionStyle, onAction, actionClass }) {
  return (
    <div
      className="px-3 py-2 flex items-center justify-between text-xs flex-shrink-0 gap-2 min-w-0"
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
        className={`px-2.5 py-1 rounded-lg font-extrabold text-xs shadow transition transform active:scale-95 flex-shrink-0 whitespace-nowrap ${actionClass}`}
        style={actionStyle}
      >
        {action}
      </button>
    </div>
  );
}

// Értesítő sávok: másik nézetben vagyunk, miközben a szobában fut valami
export default function ActivityBanners({ subView, watchState, casinoSession, chessSession, browserSession, onOpen }) {
  return (
    <>
      {browserSession?.active && subView !== 'browser' && (
        <Banner
          background="linear-gradient(90deg, rgba(20, 28, 65, 0.9), rgba(15, 20, 48, 0.9))"
          borderColor="rgba(83, 108, 255, 0.3)"
          textColor="#bfdbfe"
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
          background="linear-gradient(90deg, rgba(44, 16, 21, 0.9), rgba(29, 13, 18, 0.9))"
          borderColor="rgba(233, 75, 100, 0.3)"
          textColor="#fca5a5"
          accentColor="#E94B64"
          icon="🔴"
          who={watchState.startedBy || 'Valaki'}
          text="elindította a közös YouTube videót!"
          action="Megnyitás ▶️"
          actionClass="text-white ml-1"
          actionStyle={{ background: 'linear-gradient(135deg, #dc2626, #e11d48)' }}
          onAction={() => onOpen('watch')}
        />
      )}
      {casinoSession?.active && subView !== 'casino' && (
        <Banner
          background="linear-gradient(90deg, rgba(41, 23, 66, 0.9), rgba(27, 17, 45, 0.9))"
          borderColor="rgba(245, 176, 65, 0.3)"
          textColor="#fde68a"
          accentColor="#f5b041"
          icon="🎰"
          who={casinoSession.startedBy}
          text="elindította a 3D Kaszinót!"
          action="Belépés 🎲"
          actionClass="text-black"
          actionStyle={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)' }}
          onAction={() => onOpen('casino')}
        />
      )}
      {chessSession?.active && subView !== 'chess' && (
        <Banner
          background="linear-gradient(90deg, rgba(30, 24, 75, 0.9), rgba(20, 16, 55, 0.9))"
          borderColor="rgba(118, 85, 245, 0.3)"
          textColor="#c7d2fe"
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
    </>
  );
}
