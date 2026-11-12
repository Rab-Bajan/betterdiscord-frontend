import React, { useRef, useState, type RefObject, type TouchEvent } from 'react';
import type GameClient from '../lib/GameClient';
import type { TouchInput } from '../lib/GameClient';

interface TouchAnchor {
  id: number | null;
  x: number;
  y: number;
}

type HeldButton = Exclude<keyof TouchInput, 'mx' | 'mz'>;

// Érintőképernyős vezérlés: bal oldalon joystick, jobb oldalon gombok, a többi felületen nézelődés
export default function TouchControls({ clientRef }: { clientRef: RefObject<GameClient | null> }) {
  const stick = useRef<TouchAnchor>({ id: null, x: 0, y: 0 });
  const look = useRef<TouchAnchor>({ id: null, x: 0, y: 0 });
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const touch = () => clientRef.current?.touch;

  const stickMove = (e: TouchEvent<HTMLDivElement>) => {
    const t = Array.from(e.changedTouches).find((q) => q.identifier === stick.current.id);
    const controls = touch();
    if (!t || !controls) return;
    const dx = Math.max(-50, Math.min(50, t.clientX - stick.current.x));
    const dy = Math.max(-50, Math.min(50, t.clientY - stick.current.y));
    setKnob([dx, dy]);
    controls.mx = dx / 50;
    controls.mz = -dy / 50;
  };
  const stickEnd = () => {
    stick.current.id = null;
    setKnob([0, 0]);
    const controls = touch();
    if (controls) Object.assign(controls, { mx: 0, mz: 0 });
  };
  const hold = (key: HeldButton) => ({
    onTouchStart: (e: TouchEvent) => { e.preventDefault(); e.stopPropagation(); const controls = touch(); if (controls) controls[key] = true; },
    onTouchEnd: (e: TouchEvent) => { e.preventDefault(); e.stopPropagation(); const controls = touch(); if (controls) controls[key] = false; }
  });
  const round = 'w-14 h-14 rounded-full flex items-center justify-center text-xs font-extrabold text-white';
  const glass = { background: 'rgba(118,85,245,0.45)', border: '1px solid rgba(255,255,255,0.3)' };

  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: 'none' }}
      onTouchStart={(e) => { const t = e.changedTouches[0]; if (t && look.current.id === null) look.current = { id: t.identifier, x: t.clientX, y: t.clientY }; }}
      onTouchMove={(e) => {
        const t = Array.from(e.changedTouches).find((q) => q.identifier === look.current.id);
        if (!t) return;
        clientRef.current?.look(t.clientX - look.current.x, t.clientY - look.current.y);
        look.current.x = t.clientX;
        look.current.y = t.clientY;
      }}
      onTouchEnd={() => { look.current.id = null; }}
    >
      <div
        className="absolute bottom-20 left-5 w-28 h-28 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)' }}
        onTouchStart={(e) => { e.stopPropagation(); const t = e.changedTouches[0]; if (t) stick.current = { id: t.identifier, x: t.clientX, y: t.clientY }; }}
        onTouchMove={(e) => { e.stopPropagation(); stickMove(e); }}
        onTouchEnd={(e) => { e.stopPropagation(); stickEnd(); }}
      >
        <div className="absolute w-12 h-12 rounded-full left-8 top-8" style={{ background: 'rgba(255,255,255,0.35)', transform: `translate(${knob[0] / 2}px, ${knob[1] / 2}px)` }} />
      </div>
      <div className="absolute bottom-20 right-4 grid grid-cols-2 gap-2">
        <button type="button" className={round} style={glass} {...hold('jump')}>UGR</button>
        <button type="button" className={round} style={glass} {...hold('fire')}>TŰZ</button>
        <button type="button" className={round} style={glass} {...hold('interact')}>E</button>
        <button type="button" className={round} style={glass} onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); clientRef.current?.triggerAbility(); }}>Q</button>
        <button type="button" className={`${round} col-span-2 w-full`} style={glass} {...hold('sprint')}>SPRINT</button>
      </div>
    </div>
  );
}
