import React from 'react';

// Profilkép gyűrűkkel: csörgéskor táguló hullámok, beszédkor a hangszinthez igazodó ragyogás.
export default function CallAvatar({ peer, size = 112, rings = false, level = 0, speaking = false }) {
  const letter = (peer?.username || '?').charAt(0).toUpperCase();
  const glow = Math.min(1, level * 1.4);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {rings && [0, 0.7, 1.4].map((d) => (
        <span
          key={d}
          className="call-ring absolute inset-0 rounded-full"
          style={{ border: '2px solid rgba(118, 85, 245, 0.55)', animationDelay: `${d}s` }}
        />
      ))}
      <div
        className="relative rounded-full overflow-hidden flex items-center justify-center text-white font-bold select-none transition-shadow duration-100"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          backgroundColor: peer?.avatarColor || '#7655F5',
          boxShadow: speaking || glow > 0.08
            ? `0 0 0 3px rgba(40, 201, 151, ${0.55 + glow * 0.4}), 0 0 ${18 + glow * 46}px ${4 + glow * 14}px rgba(40, 201, 151, ${0.2 + glow * 0.35})`
            : '0 0 0 3px rgba(125, 105, 255, 0.35), 0 12px 40px rgba(0,0,0,0.5)'
        }}
      >
        {peer?.avatarUrl
          ? <img src={peer.avatarUrl} alt={peer.username} className="w-full h-full object-cover" draggable={false} />
          : letter}
      </div>
    </div>
  );
}
