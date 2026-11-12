import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from 'react';
import { Flag, Library, LogOut, Pause, WifiOff, Volume2, VolumeX, Eye } from 'lucide-react';
import { selectionInfo, isMine, playerColor, spyReportFor, notify } from '../lib/empireStore';
import { renderMinimap, miniToWorld } from '../lib/empireMinimap';
import { centerOnWorld } from '../lib/empireMath';
import { RES_KEYS, RES_META, canAfford, epochName, nextUpgradeDef } from '../lib/empireContent';
import { saveMuted } from '../lib/empireAudio';
import type { EmpireMatch, EmpirePhase } from '../hooks/useEmpireMatch';
import type { EmpireCommand, EmpireContent, EmpireStore, MatchResults, ResKey, SpyReport, Vec2 } from '../types';
import EmpireHeader from './EmpireHeader';
import ControlGroupsBar from './ControlGroupsBar';
import EmpireChat from './EmpireChat';
import { DefeatBanner, SpectatorBar } from './EmpireSpectator';
import { ActionPanel, Bar, CostChips, InfoPanel } from './EmpireSelectionPanels';

export const GLASS: CSSProperties = {
  background: 'rgba(21, 24, 50, 0.78)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(125, 105, 255, 0.22)'
};

// Re-render around 4 Hz so the HUD can read the mutable store without per-tick React state.
function useHudTick(ms = 250): void {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => (n + 1) % 1e6), ms);
    return () => clearInterval(id);
  }, [ms]);
}

interface TopBarProps {
  store: EmpireStore;
  content: EmpireContent | null;
  onOpenTech: () => void;
  onCommand: EmpireCommand;
  onResign: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
}

function TopBar({ store, content, onOpenTech, onCommand, onResign, onLeave, onToggleMute }: TopBarProps): JSX.Element {
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
function Minimap({ store }: { store: EmpireStore }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = MINI * dpr; c.height = MINI * dpr;
    const id = setInterval(() => renderMinimap(ctx, store, MINI, MINI, dpr), 100);
    return () => clearInterval(id);
  }, [store]);

  const tmp: Vec2 = { x: 0, y: 0 };
  const pan = (e: ReactPointerEvent<HTMLCanvasElement>): Vec2 => {
    const r = e.currentTarget.getBoundingClientRect();
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

function SpyReportPanel({ store, content }: { store: EmpireStore; content: EmpireContent | null }): JSX.Element | null {
  if (store.spectator) return null;
  const spies = selectionInfo(store).units.filter((u) => u.k === 'infiltrator' && isMine(store, u.o));
  let report: SpyReport | null = null;
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
  const rows: ReadonlyArray<readonly [ResKey, string]> = [['iron', 'Vas'], ['copper', 'Réz'], ['food', 'Kaja'], ['wood', 'Fa']];
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

function ResultsScreen({ store, results, onBackToLobby }: { store: EmpireStore; results: MatchResults | null; onBackToLobby: () => void }): JSX.Element {
  const rows = results?.results ?? [];
  const myRow = rows.find((r) => r.idx === store.you.idx);
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
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl" style={{ background: '#101329' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: '#999BBE' }}>
                  <th className="text-left p-2">Játékos</th><th className="p-2">Csapat</th><th className="p-2">Eredmény</th>
                  <th className="p-2">Legyőzött egység</th><th className="p-2">Elvesztett egység</th><th className="p-2">Lerombolt épület</th><th className="p-2">Okozott sebzés</th><th className="p-2">Gyűjtött</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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

interface EmpireHudProps {
  store: EmpireStore;
  content: EmpireContent | null;
  connected: boolean;
  results: MatchResults | null;
  phase: EmpirePhase;
  mode: string | undefined;
  onCommand: EmpireCommand;
  onResign: () => void;
  onExit: () => void;
  onBackToLobby: () => void;
  onOpenTech: () => void;
  onDemolish: EmpireMatch['demolishBuilding'];
  onChat: (text: string) => Promise<boolean>;
}

export default function EmpireHud({ store, content, connected, results, phase, mode, onCommand, onResign, onExit, onBackToLobby, onOpenTech, onDemolish, onChat }: EmpireHudProps): JSX.Element {
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
    store.onCancelUpgrade = (buildingId) => onCommand('cancel-upgrade', { buildingId });
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
            : `A játék szünetel: ${paused?.reason || 'egy játékos újracsatlakozik'}${pauseLeft !== null ? ` (${pauseLeft} mp)` : ''}`}
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
          Kattints a lerakáshoz (Shift: többet is){nextUpgradeDef(content, { k: store.ui.placing, lv: 1 }) ? ' · Egy meglévőre húzva fejleszti' : ''} · Jobb gomb / Esc: mégse
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

      {showDefeat && store.defeat && <DefeatBanner stats={store.defeat.stats} onContinue={finishDefeat} />}

      {!store.map.w && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-5 py-3 rounded-2xl text-sm font-semibold animate-pulse" style={{ ...GLASS, color: '#c7bfff' }}>Csatatér betöltése...</div>
        </div>
      )}

      {phase === 'ended' && <ResultsScreen store={store} results={results} onBackToLobby={onBackToLobby} />}
    </div>
  );
}
