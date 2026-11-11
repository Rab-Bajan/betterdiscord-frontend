import React, { useState } from 'react';
import { GROUP_SLOTS, groupSummary, saveGroup, selectGroup, groupCenter, isMine, notify } from './empireStore';
import { centerOnWorld } from './empireMath';
import { unitLabel, buildingLabel } from './empireContent';

export const KIND_ICON = {
  scavenger: '🛒', builder: '🔨', knife: '🔪', brawler: '🥊', slingshot: '🎯', airgunner: '🔫', horseWagon: '🐴',
  lada: '🚗', grinder: '⚙️', ram: '🛢️', elder: '👑', infiltrator: '🕵️', ciganyAsszony: '🩴', civilian: '🚶'
};
const BUILDING_ICON = '🏠';

// Nine control-group slots. Ctrl+1..9 (canvas) or the 'Elmentés' button saves; click / 1..9 selects;
// double click / double tap centres the camera on the group.
export default function ControlGroupsBar({ store, content }) {
  const [active, setActive] = useState(null);
  const ownSel = [...store.selection].some((id) => {
    const e = store.units.get(id) || store.buildings.get(id);
    return e && isMine(store, e.o);
  });
  const center = (k) => {
    const c = groupCenter(store, k, { x: 0, y: 0 });
    if (c) centerOnWorld(store.camera, c.x, c.y, true);
  };
  const save = (k) => {
    const n = saveGroup(store, k);
    notify(store, n ? `${k}. csoport mentve: ${n} egység.` : `${k}. csoport törölve.`, n ? 'good' : 'info');
  };
  return (
    <div className="pointer-events-auto flex items-end gap-1 px-1.5 py-1 rounded-2xl" style={{ background: 'rgba(12,14,32,0.55)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(125,105,255,0.18)' }}>
      {GROUP_SLOTS.map((k) => {
        const g = groupSummary(store, k);
        const isActive = active === k;
        const hpF = g ? Math.max(0, Math.min(1, g.hp / (g.mhp || 1))) : 0;
        const title = g
          ? `${k}. csoport: ${g.kinds.map(([kind, n, isB]) => `${isB ? buildingLabel(content, kind) : unitLabel(content, kind)} ×${n}`).join(', ')}`
          : `${k}. csoport (üres) · Ctrl+${k}: mentés`;
        return (
          <div key={k} className="relative flex flex-col items-center">
            {isActive && ownSel && (
              <button
                onClick={() => save(k)}
                className="absolute -top-6 whitespace-nowrap px-2 py-0.5 rounded-lg text-[10px] font-bold transition hover:brightness-125 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', color: '#fff', boxShadow: '0 4px 12px rgba(83,108,255,0.4)' }}
              >
                Elmentés
              </button>
            )}
            <button
              title={title}
              onClick={() => { setActive(k); if (g) selectGroup(store, k); }}
              onDoubleClick={() => { if (g) { selectGroup(store, k); center(k); } }}
              className="relative w-[46px] h-[42px] rounded-xl flex flex-col items-center justify-center transition-all duration-150 hover:-translate-y-0.5"
              style={g ? {
                background: isActive ? 'linear-gradient(160deg,rgba(118,85,245,0.45),rgba(27,32,64,0.9))' : 'rgba(27,32,64,0.85)',
                border: `1px solid ${isActive ? 'rgba(160,140,255,0.8)' : 'rgba(125,105,255,0.35)'}`
              } : {
                background: 'rgba(10,12,28,0.35)',
                border: `1px dashed ${isActive ? 'rgba(160,140,255,0.7)' : 'rgba(153,155,190,0.28)'}`
              }}
            >
              <span className="absolute top-0.5 left-1 text-[9px] font-black" style={{ color: g ? '#c7bfff' : 'rgba(153,155,190,0.45)' }}>{k}</span>
              {g ? (
                <>
                  <span className="text-[13px] leading-none mt-1 flex">
                    {g.kinds.slice(0, 3).map(([kind, , isB]) => <span key={kind}>{isB ? BUILDING_ICON : KIND_ICON[kind] || '🧍'}</span>)}
                  </span>
                  <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-black flex items-center justify-center"
                    style={{ background: '#28C997', color: '#06140e', boxShadow: '0 0 0 2px rgba(9,10,24,0.9)' }}>{g.count}</span>
                  <span className="absolute bottom-1 left-1.5 right-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <span className="block h-full" style={{ width: `${hpF * 100}%`, background: hpF > 0.5 ? '#3ad08f' : hpF > 0.25 ? '#f5b041' : '#E94B64' }} />
                  </span>
                </>
              ) : (
                <span className="text-sm font-bold" style={{ color: 'rgba(153,155,190,0.3)' }}>{k}</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
