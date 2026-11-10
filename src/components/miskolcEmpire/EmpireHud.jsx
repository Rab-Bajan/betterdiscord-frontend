import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, Library, LogOut, Pause, WifiOff, X, Volume2, VolumeX, Hammer, Eye } from 'lucide-react';
import { selectionInfo, isMine, playerOf, playerColor, spyReportFor, notify } from './empireStore';
import { renderMinimap, miniToWorld } from './empireMinimap';
import { centerOnWorld } from './empireMath';
import {
  RES_KEYS, RES_META, canAfford, costEntries, reqEpoch, epochName, buildingLabel, unitLabel, isBuilderKind
} from './empireContent';
import { saveMuted } from './empireAudio';
import EmpireHeader from './EmpireHeader';
import ControlGroupsBar from './ControlGroupsBar';
import EmpireChat from './EmpireChat';
import { DefeatBanner, SpectatorBar } from './EmpireSpectator';

export const GLASS = {
  background: 'rgba(21, 24, 50, 0.78)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(125, 105, 255, 0.22)'
};

const RES_HU = { iron: 'Vas', copper: 'Réz', food: 'Kaja', wood: 'Fa' };
const STATUS_HU = { idle: 'Tétlen', move: 'Úton', gather: 'Gyűjt', return: 'Visszaviszi', build: 'Épít', attack: 'Támad', repair: 'Javít', siphon: 'Dézsmál' };
const CLASS_HU = {
  worker: 'Munkás', light: 'Könnyű közelharc', lightMelee: 'Könnyű közelharc', heavy: 'Nehéz közelharc', heavyMelee: 'Nehéz közelharc',
  ranged: 'Távolsági', vehicle: 'Jármű', fastVehicle: 'Gyors jármű', siege: 'Ostromgép', hero: 'Hős', building: 'Épület', spy: 'Kém'
};
const DEFAULT_DEMOLISH = { maxRefund: 0.5, minRefund: 0.35, holdMs: 1500 };

// Client-side preview of the server's refund rule (contract section 2); the ack is authoritative.
export function demolishRefundPreview(def, b, cfg = DEFAULT_DEMOLISH) {
  const cost = def?.cost || {};
  let r;
  if (b.bp < 100) r = cfg.maxRefund * (b.bp / 100);
  else {
    const f = Math.max(0, Math.min(1, b.hp / (b.mhp || 1)));
    r = f >= 0.5 ? cfg.minRefund + (cfg.maxRefund - cfg.minRefund) * ((f - 0.5) / 0.5) : cfg.minRefund * (f / 0.5);
  }
  const out = {};
  for (const k of Object.keys(cost)) out[k] = Math.floor(cost[k] * r + 1e-9);
  return out;
}

export function refundText(refund) {
  const parts = RES_KEYS.filter((k) => refund?.[k] > 0).map((k) => `+${refund[k]} ${RES_HU[k]}`);
  return parts.length ? `Bontás: ${parts.join(', ')}` : 'Bontás: nincs visszatérítés.';
}

// Re-render around 4 Hz so the HUD can read the mutable store without per-tick React state.
function useHudTick(ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => (n + 1) % 1e6), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function CostChips({ cost, res }) {
  const entries = costEntries(cost);
  if (!entries.length) return <span className="text-[10px]" style={{ color: '#999BBE' }}>ingyen</span>;
  return (
    <span className="flex flex-wrap gap-x-1.5 text-[10px] font-semibold">
      {entries.map(([k, v]) => (
        <span key={k} style={{ color: (res?.[k] || 0) >= v ? '#c9cdea' : '#E94B64' }} title={RES_META[k].hint}>
          {RES_META[k].icon}{v}
        </span>
      ))}
    </span>
  );
}

function Bar({ frac, color = '#28C997', h = 6 }) {
  return (
    <div className="rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)', height: h }}>
      <div style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color, height: '100%', transition: 'width .25s' }} />
    </div>
  );
}

function ActionButton({ label, sub, cost, res, disabled, reason, active, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled && reason ? reason : label}
      className="text-left rounded-xl px-2.5 py-1.5 transition-all duration-150 enabled:hover:-translate-y-0.5 enabled:active:scale-95 disabled:cursor-not-allowed"
      style={{
        minWidth: 112,
        background: active ? 'linear-gradient(135deg,#7655F5,#536CFF)' : '#1B2040',
        border: '1px solid rgba(125,105,255,0.25)',
        opacity: disabled ? 0.45 : 1,
        color: '#F4F3FF'
      }}
    >
      <div className="text-xs font-bold truncate">{label}</div>
      {sub && <div className="text-[10px]" style={{ color: '#999BBE' }}>{sub}</div>}
      <CostChips cost={cost} res={res} />
      {disabled && reason && <div className="text-[9px] font-semibold" style={{ color: '#f5b041' }}>{reason}</div>}
    </button>
  );
}

function TopBar({ store, content, onOpenTech, onCommand, onResign, onLeave, onToggleMute }) {
  const res = store.res;
  const epoch = res.epoch || 1;
  const next = content?.epochs?.find((e) => e.n === epoch + 1);
  const researching = res.research;
  const nextReason = researching ? 'Kutatás folyamatban' : !canAfford(res, next?.cost) ? 'Nincs elég nyersanyag' : '';
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl" style={GLASS}>
      {RES_KEYS.map((k) => (
        <div key={k} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl" style={{ background: '#101329' }} title={content?.raw?.resources?.[k]?.name || RES_META[k].hint}>
          <span className="text-sm">{RES_META[k].icon}</span>
          <span className="text-[10px] uppercase tracking-wider hidden md:inline" style={{ color: '#999BBE' }}>{RES_META[k].label}</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: RES_META[k].color }}>{Math.floor(res[k] || 0)}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl" style={{ background: '#101329' }} title="Lakosság">
        <span className="text-sm">👥</span>
        <span className="text-[10px] uppercase tracking-wider hidden md:inline" style={{ color: '#999BBE' }}>Lakosság</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: res.pop >= res.popCap ? '#E94B64' : '#F4F3FF' }}>{res.pop || 0}/{res.popCap || 0}</span>
      </div>
      {next && (
        <button
          onClick={() => onCommand('advance-epoch', {})}
          disabled={!!nextReason}
          title={nextReason || `Fejlesztés: ${next.n}. Korszak: ${next.name}`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition enabled:hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed min-w-0"
          style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', color: '#fff' }}
        >
          <span>Fejlesztés</span>
          <span className="hidden lg:inline truncate max-w-[160px] font-semibold opacity-90">→ {next.name}</span>
          <CostChips cost={next.cost} res={res} />
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onToggleMute} title={store.ui.muted ? 'Hang bekapcsolása' : 'Némítás'} className="p-1.5 rounded-xl transition hover:brightness-125" style={{ background: '#1B2040', color: '#999BBE' }}>
          {store.ui.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button onClick={onOpenTech} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition hover:brightness-125" style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125,105,255,0.25)' }}>
          <Library className="w-3.5 h-3.5" /><span className="hidden sm:inline">Technológiák</span>
        </button>
        <button onClick={onResign} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition hover:brightness-125" style={{ background: 'rgba(233,75,100,0.15)', color: '#E94B64', border: '1px solid rgba(233,75,100,0.4)' }}>
          <Flag className="w-3.5 h-3.5" /><span className="hidden sm:inline">Feladás</span>
        </button>
        <button onClick={onLeave} title="Vissza (a meccs fut tovább)" className="p-1.5 rounded-xl transition hover:brightness-125" style={{ background: '#1B2040', color: '#999BBE' }}>
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const MINI = 172;
function Minimap({ store }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = MINI * dpr; c.height = MINI * dpr;
    const id = setInterval(() => renderMinimap(ctx, store, MINI, MINI, dpr), 100);
    return () => clearInterval(id);
  }, [store]);

  const tmp = { x: 0, y: 0 };
  const pan = (e) => {
    const r = ref.current.getBoundingClientRect();
    miniToWorld(store, MINI, MINI, (e.clientX - r.left) * (MINI / r.width), (e.clientY - r.top) * (MINI / r.height), tmp);
    return tmp;
  };
  const drag = useRef(false);
  return (
    <div className="pointer-events-auto rounded-2xl p-1.5 flex-shrink-0" style={GLASS}>
      <canvas
        ref={ref}
        style={{ width: MINI, height: MINI, borderRadius: 12, cursor: 'crosshair', display: 'block', touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button === 2) {
            if (store.spectator) return;
            const p = pan(e);
            const ids = selectionInfo(store).units.filter((u) => isMine(store, u.o)).slice(0, 60).map((u) => u.i);
            if (ids.length) store.onMiniOrder?.(ids, +p.x.toFixed(2), +p.y.toFixed(2));
            return;
          }
          drag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId);
          const p = pan(e); centerOnWorld(store.camera, p.x, p.y);
        }}
        onPointerMove={(e) => { if (drag.current) { const p = pan(e); centerOnWorld(store.camera, p.x, p.y); } }}
        onPointerUp={() => { drag.current = false; }}
      />
    </div>
  );
}

function InfoPanel({ store, content, sel }) {
  const { units, buildings, node } = sel;
  const res = store.res;
  if (units.length === 1 && !buildings.length) {
    const u = units[0];
    const def = content?.units?.[u.k];
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: playerColor(store, u.o) }} />
          <span className="font-bold text-sm">{u.k === 'civilian' ? 'Vándorló civil' : unitLabel(content, u.k)}</span>
          <span className="text-[10px]" style={{ color: '#999BBE' }}>{u.k === 'civilian' ? 'Semleges' : CLASS_HU[def?.class] || def?.class || ''}</span>
        </div>
        <div className="mt-1"><Bar frac={u.hp / u.mhp} color="#28C997" /></div>
        <div className="text-[11px] mt-0.5" style={{ color: '#c9cdea' }}>{Math.ceil(u.hp)}/{Math.ceil(u.mhp)} élet · {STATUS_HU[u.st] || u.st}</div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1.5 text-[11px]" style={{ color: '#999BBE' }}>
          {def?.attack > 0 && <span>Sebzés: <b style={{ color: '#F4F3FF' }}>{def.attack}</b></span>}
          {def?.range > 0 && <span>Hatótáv: <b style={{ color: '#F4F3FF' }}>{def.range}</b></span>}
          {def?.speed > 0 && <span>Sebesség: <b style={{ color: '#F4F3FF' }}>{def.speed}</b></span>}
          {def?.armor !== undefined && <span>Páncél: <b style={{ color: '#F4F3FF' }}>{def.armor}</b></span>}
          {def?.sight > 0 && <span>Látótáv: <b style={{ color: '#F4F3FF' }}>{def.sight}</b></span>}
          {u.c > 0 && <span>Rakomány: <b style={{ color: '#F4F3FF' }}>{Math.floor(u.c)} {RES_HU[u.ct] || ''}</b></span>}
        </div>
        {def?.description && <div className="text-[10px] mt-1 italic" style={{ color: '#7f83a8' }}>{def.description}</div>}
      </div>
    );
  }
  if (units.length > 1) {
    const counts = new Map();
    for (const u of units) counts.set(u.k, (counts.get(u.k) || 0) + 1);
    return (
      <div>
        <div className="font-bold text-sm mb-1">{units.length} egység kijelölve</div>
        <div className="flex flex-wrap gap-1.5">
          {[...counts].map(([k, n]) => (
            <span key={k} className="px-2 py-0.5 rounded-lg text-[11px]" style={{ background: '#1B2040' }}>{k === 'civilian' ? 'Vándorló civil' : unitLabel(content, k)} ×{n}</span>
          ))}
        </div>
      </div>
    );
  }
  if (buildings.length) {
    const b = buildings[0];
    const def = content?.buildings?.[b.k];
    const owner = playerOf(store, b.o);
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: playerColor(store, b.o) }} />
          <span className="font-bold text-sm">{buildingLabel(content, b.k, owner?.epoch ?? res.epoch)}</span>
          {buildings.length > 1 && <span className="text-[10px]" style={{ color: '#999BBE' }}>+{buildings.length - 1} további</span>}
        </div>
        <div className="mt-1"><Bar frac={b.bp < 100 ? b.bp / 100 : b.hp / b.mhp} color={b.bp < 100 ? '#536CFF' : '#28C997'} /></div>
        <div className="text-[11px] mt-0.5" style={{ color: '#c9cdea' }}>
          {b.bp < 100 ? `Épül: ${Math.floor(b.bp)}%` : `${Math.ceil(b.hp)}/${Math.ceil(b.mhp)} élet`}
        </div>
        {b.q?.length > 0 && isMine(store, b.o) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {b.q.map((it, i) => (
              <span key={i} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg text-[11px]" style={{ background: '#1B2040' }}>
                {unitLabel(content, it.u)}{i === 0 ? ` ${Math.floor(it.p || 0)}%` : ''}
                <button title="Megszakítás" onClick={() => store.onCancelTrain?.(b.i, i)} className="p-0.5 rounded hover:bg-white/10"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        {def?.description && <div className="text-[10px] mt-1 italic" style={{ color: '#7f83a8' }}>{def.description}</div>}
      </div>
    );
  }
  if (node) {
    return (
      <div>
        <div className="font-bold text-sm">{RES_META[node.k]?.icon} {RES_HU[node.k] || node.k} lelőhely</div>
        <div className="text-[11px] mt-1" style={{ color: '#c9cdea' }}>Hátralévő mennyiség: <b>{Math.floor(node.a)}</b></div>
        <div className="text-[10px] mt-1" style={{ color: '#999BBE' }}>Jobb gombbal a kijelölt gyűjtőkkel kiaknázható.</div>
      </div>
    );
  }
  return (
    <div className="text-[11px] leading-relaxed" style={{ color: '#999BBE' }}>
      <div className="font-bold text-sm mb-1" style={{ color: '#F4F3FF' }}>{store.spectator ? 'Megfigyelő mód' : 'Parancsnoki híd'}</div>
      {store.spectator ? (
        <>Szabad kamera: WASD vagy a képernyő széle · Görgő: nagyítás · Középső gomb (vagy Alt+bal gomb): forgatás · Q/E: elforgatás<br />Kattints egy egységre vagy épületre a részletekért.</>
      ) : (
        <>
          Bal gomb: kijelölés (húzással keret) · Jobb gomb: mozgás / gyűjtés / támadás / javítás / dézsmálás<br />
          WASD vagy a képernyő széle: kamera · Görgő: nagyítás · Középső gomb (vagy Alt+bal gomb): forgatás · Q/E: elforgatás<br />
          Ctrl+1..9: csoport mentése · 1..9: csoport (dupla: odaugrás) · X: megállj · H: Vajda Háza · Delete (nyomva tartva): bontás · Enter: csevegés
        </>
      )}
    </div>
  );
}

function DemolishButton({ store, content, buildings, onDemolish }) {
  const cfg = { ...DEFAULT_DEMOLISH, ...(content?.raw?.demolish || {}) };
  const holdMs = cfg.holdMs || 1500;
  const [prog, setProg] = useState(0);
  const [busy, setBusy] = useState(false);
  const startRef = useRef(null);
  const rafRef = useRef(0);
  const idsRef = useRef([]);
  idsRef.current = buildings.map((b) => b.i);

  const cancel = useCallback(() => {
    startRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setProg(0);
  }, []);
  const fire = useCallback(async () => {
    setBusy(true);
    const refund = await onDemolish(idsRef.current);
    setBusy(false);
    if (refund) notify(store, refundText(refund), 'good');
  }, [onDemolish, store]);
  const begin = useCallback(() => {
    if (startRef.current !== null || busy) return;
    startRef.current = performance.now();
    const step = () => {
      if (startRef.current === null) return;
      const k = (performance.now() - startRef.current) / holdMs;
      if (k >= 1) { cancel(); fire(); return; }
      setProg(k);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [busy, holdMs, cancel, fire]);

  useEffect(() => {
    const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const down = (e) => { if (e.key === 'Delete' && !typing(e)) { e.preventDefault(); begin(); } };
    const up = (e) => { if (e.key === 'Delete') cancel(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', cancel); cancel(); };
  }, [begin, cancel]);

  const preview = {};
  for (const b of buildings) {
    const r = demolishRefundPreview(content?.buildings?.[b.k], b, cfg);
    for (const [k, v] of Object.entries(r)) preview[k] = (preview[k] || 0) + v;
  }
  const previewEntries = RES_KEYS.filter((k) => preview[k] > 0);
  return (
    <div key="demolish">
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#999BBE' }}>Bontás</div>
      <button
        onPointerDown={(e) => { e.preventDefault(); begin(); }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        disabled={busy}
        title={`Tartsd lenyomva ${(holdMs / 1000).toFixed(1)} mp-ig (vagy a Delete billentyűt)`}
        className="relative overflow-hidden rounded-xl px-3 py-2 text-left select-none transition active:scale-[0.98] disabled:opacity-50"
        style={{ minWidth: 190, background: 'rgba(233,75,100,0.14)', border: '1px solid rgba(233,75,100,0.55)', color: '#ffb3c0', boxShadow: prog > 0 ? '0 0 18px rgba(233,75,100,0.45)' : 'none' }}
      >
        <span className="absolute inset-y-0 left-0" style={{ width: `${prog * 100}%`, background: 'linear-gradient(90deg,rgba(233,75,100,0.55),rgba(255,120,90,0.75))' }} />
        <span className="relative flex items-center gap-2">
          <Hammer className="w-4 h-4" />
          <span>
            <span className="block text-xs font-black">Bontás / Épület törlése{buildings.length > 1 ? ` (${buildings.length})` : ''}</span>
            <span className="block text-[10px] font-semibold" style={{ color: '#f3c7cf' }}>
              {busy ? 'Bontás folyamatban...' : prog > 0 ? 'Tartsd lenyomva...' : 'Nyomva tartva (Delete)'}
            </span>
          </span>
        </span>
      </button>
      <div className="text-[10px] mt-1" style={{ color: '#999BBE' }}>
        Várható visszatérítés: {previewEntries.length ? previewEntries.map((k) => `${RES_META[k].icon}${preview[k]}`).join(' ') : 'semmi'}
      </div>
    </div>
  );
}

function SpyReportPanel({ store, content }) {
  if (store.spectator) return null;
  const spies = selectionInfo(store).units.filter((u) => u.k === 'infiltrator' && isMine(store, u.o));
  let report = null;
  for (const u of spies) { report = spyReportFor(store, u.i); if (report) break; }
  if (!spies.length) return null;
  if (!report) {
    return (
      <div className="pointer-events-auto w-[250px] rounded-2xl px-3 py-2.5 text-[11px]" style={{ ...GLASS, borderColor: 'rgba(245,176,65,0.35)' }}>
        <div className="flex items-center gap-1.5 font-black text-xs" style={{ color: '#f5b041' }}><Eye className="w-3.5 h-3.5" /> Kémjelentés</div>
        <div className="mt-1" style={{ color: '#999BBE' }}>Nincs ellenséges épület a közelben. Vidd a Vándor Kémet egy ellenséges telep közelébe.</div>
      </div>
    );
  }
  const color = typeof report.color === 'string' ? report.color : playerColor(store, report.victim);
  const rows = [['iron', 'Vas'], ['copper', 'Réz'], ['food', 'Kaja'], ['wood', 'Fa']];
  return (
    <div className="pointer-events-auto w-[250px] rounded-2xl px-3 py-2.5" style={{ ...GLASS, borderColor: 'rgba(245,176,65,0.45)', boxShadow: '0 8px 26px rgba(0,0,0,0.35)' }}>
      <div className="flex items-center gap-1.5 font-black text-xs" style={{ color: '#f5b041' }}><Eye className="w-3.5 h-3.5" /> Kémjelentés</div>
      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="font-bold text-sm truncate" title={report.name}>{report.name}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {rows.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between px-2 py-1 rounded-lg text-[11px]" style={{ background: '#101329' }}>
            <span style={{ color: '#999BBE' }}>{RES_META[k].icon} {label}</span>
            <b className="tabular-nums" style={{ color: RES_META[k].color }}>{Math.floor(report.res?.[k] || 0)}</b>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[11px]" style={{ color: '#c9cdea' }}>
        Korszak: <b>{report.epoch}. {epochName(content, report.epoch)}</b>
      </div>
      {report.research ? (
        <div className="mt-1">
          <div className="text-[10px]" style={{ color: '#999BBE' }}>Kutatás: {epochName(content, report.research.epoch)} · {Math.floor(report.research.pct || 0)}%</div>
          <Bar frac={(report.research.pct || 0) / 100} color="#536CFF" h={4} />
        </div>
      ) : <div className="text-[10px] mt-0.5" style={{ color: '#7f83a8' }}>Nem kutat semmit.</div>}
      <div className="mt-1 text-[11px]" style={{ color: '#c9cdea' }}>Katonai létszám: <b style={{ color: '#E94B64' }}>{report.military}</b></div>
    </div>
  );
}

function ActionPanel({ store, content, sel, onCommand, onDemolish }) {
  if (store.spectator) return null;
  const res = store.res;
  const epoch = res.epoch || 1;
  const placing = store.ui.placing;
  const myUnits = sel.units.filter((u) => isMine(store, u.o));
  const hasBuilder = myUnits.some((u) => isBuilderKind(u.k));
  const myB = sel.buildings.filter((b) => isMine(store, b.o));
  const sections = [];

  if (hasBuilder && content) {
    sections.push(
      <div key="build">
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#999BBE' }}>Építés</div>
        <div className="flex flex-wrap gap-1.5">
          {content.buildingList.filter((d) => d.buildable !== false).map((d) => {
            const locked = reqEpoch(d) > epoch;
            const poor = !canAfford(res, d.cost);
            return (
              <ActionButton
                key={d.id}
                label={buildingLabel(content, d.id, epoch)}
                sub={d.buildTime ? `${d.buildTime} mp` : undefined}
                cost={d.cost}
                res={res}
                active={placing === d.id}
                disabled={locked || poor}
                reason={locked ? `${reqEpoch(d)}. korszaktól` : poor ? 'Kevés nyersanyag' : ''}
                onClick={() => { store.ui.placing = placing === d.id ? null : d.id; }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (myB.length === 1 && myB[0].bp >= 100 && content) {
    const b = myB[0];
    const trainable = content.unitList.filter((d) => d.producer === b.k);
    if (trainable.length) {
      sections.push(
        <div key="train">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#999BBE' }}>Gyártás</div>
          <div className="flex flex-wrap gap-1.5">
            {trainable.map((d) => {
              const locked = reqEpoch(d) > epoch;
              const poor = !canAfford(res, d.cost);
              const full = res.pop >= res.popCap;
              return (
                <ActionButton
                  key={d.id}
                  label={d.name || d.id}
                  sub={d.buildTime ? `${d.buildTime} mp` : undefined}
                  cost={d.cost}
                  res={res}
                  disabled={locked || poor || full}
                  reason={locked ? `${reqEpoch(d)}. korszaktól` : full ? 'Betelt a lakosság' : poor ? 'Kevés nyersanyag' : ''}
                  onClick={() => onCommand('train', { buildingId: b.i, unit: d.id })}
                />
              );
            })}
          </div>
        </div>
      );
    }
    if (b.k === 'townCenter') {
      const next = content.epochs.find((e) => e.n === epoch + 1);
      if (next) {
        const poor = !canAfford(res, next.cost);
        sections.push(
          <div key="epoch">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#999BBE' }}>Fejlesztés</div>
            <ActionButton
              label={next.name}
              sub={next.researchTime ? `${next.researchTime} mp kutatás` : undefined}
              cost={next.cost}
              res={res}
              disabled={!!res.research || poor}
              reason={res.research ? 'Folyamatban' : poor ? 'Kevés nyersanyag' : ''}
              onClick={() => onCommand('advance-epoch', {})}
            />
          </div>
        );
      }
    }
  }
  if (myB.length && sel.units.length === 0) {
    sections.push(<DemolishButton key="demolish" store={store} content={content} buildings={myB.slice(0, 10)} onDemolish={onDemolish} />);
  }
  if (!sections.length) return null;
  return <div className="space-y-2">{sections}</div>;
}

function ResultsScreen({ store, results, onBackToLobby }) {
  const myRow = results?.results?.find((r) => r.idx === store.you.idx);
  const won = myRow?.won;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-auto" style={{ background: 'rgba(5,6,15,0.78)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-2xl rounded-3xl p-6" style={{ ...GLASS, boxShadow: '0 20px 80px rgba(0,0,0,.6)' }}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-1">{won ? '🏆' : myRow ? '🪦' : '🏁'}</div>
          <div className="text-2xl font-black" style={{ color: won ? '#28C997' : myRow ? '#E94B64' : '#F4F3FF' }}>
            {won ? 'Győzelem!' : myRow ? 'Vereség' : 'A játék véget ért'}
          </div>
          <div className="text-xs mt-1" style={{ color: '#999BBE' }}>
            {won ? 'A Vajda Háza áll, a bogrács forr.' : 'A telep ma nem állta meg a helyét, de a MÉH-telep mindig újraéled.'}
          </div>
        </div>
        {results?.results?.length > 0 && (
          <div className="overflow-x-auto rounded-2xl" style={{ background: '#101329' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: '#999BBE' }}>
                  <th className="text-left p-2">Játékos</th><th className="p-2">Csapat</th><th className="p-2">Eredmény</th>
                  <th className="p-2">Legyőzött egység</th><th className="p-2">Elvesztett egység</th><th className="p-2">Lerombolt épület</th><th className="p-2">Okozott sebzés</th><th className="p-2">Gyűjtött</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((r) => (
                  <tr key={r.idx} className="text-center" style={{ borderTop: '1px solid rgba(125,105,255,0.12)', background: r.idx === store.you.idx ? 'rgba(118,85,245,0.12)' : 'transparent' }}>
                    <td className="p-2 text-left font-semibold">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: playerColor(store, r.idx) }} />{r.name}{r.isAi ? ' (MI)' : ''}
                    </td>
                    <td className="p-2">{r.team + 1}</td>
                    <td className="p-2 font-bold" style={{ color: r.won ? '#28C997' : '#E94B64' }}>{r.won ? 'Győztes' : 'Vesztes'}</td>
                    <td className="p-2">{r.unitsKilled}</td><td className="p-2">{r.unitsLost ?? '–'}</td><td className="p-2">{r.buildingsDestroyed}</td>
                    <td className="p-2">{r.damageDealt !== undefined ? Math.floor(r.damageDealt) : '–'}</td><td className="p-2">{Math.floor(r.gathered || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-center mt-5">
          <button onClick={onBackToLobby} className="px-5 py-2.5 rounded-xl text-sm font-bold transition hover:brightness-110 active:scale-95" style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', color: '#fff' }}>
            Vissza a lobbyba
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmpireHud({ store, content, connected, results, phase, mode, onCommand, onResign, onExit, onBackToLobby, onOpenTech, onDemolish, onChat }) {
  useHudTick(250);
  const [confirmResign, setConfirmResign] = useState(false);
  const [defeatSeen, setDefeatSeen] = useState(false);
  const [, setMuteTick] = useState(0);
  const sel = selectionInfo(store);
  const paused = store.paused;
  const pauseLeft = paused?.untilMs ? Math.max(0, Math.ceil((paused.untilMs - Date.now()) / 1000)) : null;
  const spectator = store.spectator;
  const showDefeat = !!store.defeat && !defeatSeen && phase === 'playing';
  const finishDefeat = useCallback(() => {
    setDefeatSeen(true);
    notify(store, 'Megfigyelő mód: a teljes térkép látható, a kamera szabadon mozog.', 'info');
  }, [store]);
  const toggleMute = () => {
    store.ui.muted = !store.ui.muted;
    saveMuted(store.ui.muted);
    setMuteTick((n) => n + 1);
  };

  useEffect(() => {
    store.onMiniOrder = (ids, x, y) => {
      onCommand('move', { unitIds: ids, target: { x, y } });
      store.moveMarks.push({ x, y, t0: store.time, color: '#28C997' });
    };
    store.onCancelTrain = (buildingId, index) => onCommand('cancel-train', { buildingId, index });
    return () => { store.onMiniOrder = null; store.onCancelTrain = null; };
  }, [store, onCommand]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-2 gap-2">
      <div className="flex flex-col gap-2">
        {spectator ? (
          <SpectatorBar store={store} content={content} onLeave={onBackToLobby} onOpenTech={onOpenTech} onToggleMute={toggleMute} />
        ) : (
          <TopBar
            store={store}
            content={content}
            onOpenTech={onOpenTech}
            onCommand={onCommand}
            onResign={() => setConfirmResign(true)}
            onLeave={onExit}
            onToggleMute={toggleMute}
          />
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 max-w-sm min-w-0">
            {store.notices.map((n, i) => (
              <div key={`${n.t0}-${i}`} className="pointer-events-auto px-3 py-1.5 rounded-xl text-xs font-semibold animate-in fade-in" style={{ ...GLASS, color: n.kind === 'alert' ? '#E94B64' : n.kind === 'good' ? '#28C997' : '#F4F3FF' }}>
                {n.text}
              </div>
            ))}
          </div>
          <div className="flex flex-col items-end gap-2">
            {!spectator && <EmpireHeader store={store} content={content} mode={mode} />}
            <SpyReportPanel store={store} content={content} />
          </div>
        </div>
      </div>

      {(paused || !connected) && phase === 'playing' && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold" style={{ ...GLASS, color: !connected ? '#E94B64' : '#f5b041', borderColor: 'rgba(245,176,65,0.5)' }}>
          {!connected ? <WifiOff className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {!connected
            ? 'A kapcsolat megszakadt, újracsatlakozás folyamatban...'
            : `A játék szünetel: ${paused.reason || 'egy játékos újracsatlakozik'}${pauseLeft !== null ? ` (${pauseLeft} mp)` : ''}`}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <EmpireChat store={store} onSend={onChat} />
          {!spectator && <ControlGroupsBar store={store} content={content} />}
          <div className="w-[1px]" />
        </div>
        <div className="flex items-end gap-2 flex-wrap md:flex-nowrap">
          <Minimap store={store} />
          <div className="pointer-events-auto flex-1 min-w-[260px] rounded-2xl p-3 flex flex-col md:flex-row gap-4 max-h-[42vh] overflow-y-auto" style={GLASS}>
            <div className="md:w-[40%] min-w-0"><InfoPanel store={store} content={content} sel={sel} /></div>
            <div className="flex-1 min-w-0"><ActionPanel store={store} content={content} sel={sel} onCommand={onCommand} onDemolish={onDemolish} /></div>
          </div>
        </div>
      </div>

      {store.ui.placing && !spectator && (
        <div className="absolute bottom-64 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-semibold pointer-events-none" style={{ ...GLASS, color: '#c7bfff' }}>
          Kattints a lerakáshoz (Shift: többet is) · Jobb gomb / Esc: mégse
        </div>
      )}

      {confirmResign && !spectator && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto" style={{ background: 'rgba(5,6,15,0.6)' }}>
          <div className="rounded-2xl p-5 max-w-xs text-center" style={GLASS}>
            <div className="font-bold mb-1">Biztosan feladod?</div>
            <div className="text-xs mb-4" style={{ color: '#999BBE' }}>Ezzel kiesel a meccsből, de megfigyelőként tovább nézheted.</div>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setConfirmResign(false)} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: '#1B2040' }}>Mégsem</button>
              <button onClick={() => { setConfirmResign(false); onResign(); }} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: '#E94B64', color: '#fff' }}>Feladom</button>
            </div>
          </div>
        </div>
      )}

      {showDefeat && <DefeatBanner stats={store.defeat.stats} onContinue={finishDefeat} />}

      {!store.map.w && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-5 py-3 rounded-2xl text-sm font-semibold animate-pulse" style={{ ...GLASS, color: '#c7bfff' }}>Csatatér betöltése...</div>
        </div>
      )}

      {phase === 'ended' && <ResultsScreen store={store} results={results} onBackToLobby={onBackToLobby} />}
    </div>
  );
}
