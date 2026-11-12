import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { X, Hammer } from 'lucide-react';
import { isMine, playerOf, playerColor, notify } from '../lib/empireStore';
import type { SelectionInfo } from '../lib/empireStore';
import {
  RES_KEYS, RES_META, canAfford, costEntries, reqEpoch, buildingLabel, unitLabel, isBuilderKind, isResKey,
  buildingLevelCount, nextUpgradeDef, levelPopCap
} from '../lib/empireContent';
import { DEFAULT_DEMOLISH, demolishRefundPreview, refundText } from '../lib/empireDemolish';
import type { EmpireMatch } from '../hooks/useEmpireMatch';
import type { Cost, EmpireBuilding, EmpireCommand, EmpireContent, EmpireStore, ResourceView } from '../types';

// Bottom HUD panel: details of the selection (left) and the commands it offers (right).

const RES_HU: Readonly<Record<string, string>> = { iron: 'Vas', copper: 'Réz', food: 'Kaja', wood: 'Fa' };
const STATUS_HU: Readonly<Record<string, string>> = { idle: 'Tétlen', move: 'Úton', gather: 'Gyűjt', return: 'Visszaviszi', build: 'Épít', attack: 'Támad', repair: 'Javít', siphon: 'Dézsmál' };
const CLASS_HU: Readonly<Record<string, string>> = {
  worker: 'Munkás', light: 'Könnyű közelharc', lightMelee: 'Könnyű közelharc', heavy: 'Nehéz közelharc', heavyMelee: 'Nehéz közelharc',
  ranged: 'Távolsági', vehicle: 'Jármű', fastVehicle: 'Gyors jármű', siege: 'Ostromgép', hero: 'Hős', building: 'Épület', spy: 'Kém'
};

export function CostChips({ cost, res }: { cost: Cost | undefined; res: Partial<ResourceView> | undefined }): JSX.Element {
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

export function Bar({ frac, color = '#28C997', h = 6 }: { frac: number; color?: string; h?: number }): JSX.Element {
  return (
    <div className="rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)', height: h }}>
      <div style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color, height: '100%', transition: 'width .25s' }} />
    </div>
  );
}

interface ActionButtonProps {
  label: string | undefined;
  sub?: string | undefined;
  cost: Cost | undefined;
  res: Partial<ResourceView>;
  disabled: boolean;
  reason: string;
  active?: boolean;
  onClick: () => void;
}

function ActionButton({ label, sub, cost, res, disabled, reason, active, onClick }: ActionButtonProps): JSX.Element {
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

interface PanelProps {
  store: EmpireStore;
  content: EmpireContent | null;
  sel: SelectionInfo;
}

export function InfoPanel({ store, content, sel }: PanelProps): JSX.Element {
  const { units, buildings, node } = sel;
  const res = store.res;
  const u = units[0];
  if (u && units.length === 1 && !buildings.length) {
    const def = content?.units?.[u.k];
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: playerColor(store, u.o) }} />
          <span className="font-bold text-sm">{u.k === 'civilian' ? 'Vándorló civil' : unitLabel(content, u.k)}</span>
          <span className="text-[10px]" style={{ color: '#999BBE' }}>{u.k === 'civilian' ? 'Semleges' : CLASS_HU[def?.class ?? ''] || def?.class || ''}</span>
        </div>
        <div className="mt-1"><Bar frac={u.hp / u.mhp} color="#28C997" /></div>
        <div className="text-[11px] mt-0.5" style={{ color: '#c9cdea' }}>{Math.ceil(u.hp)}/{Math.ceil(u.mhp)} élet · {STATUS_HU[u.st] || u.st}</div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 mt-1.5 text-[11px]" style={{ color: '#999BBE' }}>
          {(def?.attack ?? 0) > 0 && def && <span>Sebzés: <b style={{ color: '#F4F3FF' }}>{def.attack}</b></span>}
          {(def?.range ?? 0) > 0 && def && <span>Hatótáv: <b style={{ color: '#F4F3FF' }}>{def.range}</b></span>}
          {(def?.speed ?? 0) > 0 && def && <span>Sebesség: <b style={{ color: '#F4F3FF' }}>{def.speed}</b></span>}
          {def?.armor !== undefined && <span>Páncél: <b style={{ color: '#F4F3FF' }}>{def.armor}</b></span>}
          {(def?.sight ?? 0) > 0 && def && <span>Látótáv: <b style={{ color: '#F4F3FF' }}>{def.sight}</b></span>}
          {u.c > 0 && <span>Rakomány: <b style={{ color: '#F4F3FF' }}>{Math.floor(u.c)} {RES_HU[u.ct ?? ''] || ''}</b></span>}
        </div>
        {def?.description && <div className="text-[10px] mt-1 italic" style={{ color: '#7f83a8' }}>{def.description}</div>}
      </div>
    );
  }
  if (units.length > 1) {
    const counts = new Map<string, number>();
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
  const b = buildings[0];
  if (b) {
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
        {buildingLevelCount(content, b.k) > 1 && b.bp >= 100 && (
          <div className="text-[11px] mt-0.5" style={{ color: '#c9cdea' }}>
            {b.lv || 1}/{buildingLevelCount(content, b.k)}. szint
            {levelPopCap(content, b.k, b.lv || 1) > 0 && <> · <b style={{ color: '#F4F3FF' }}>{levelPopCap(content, b.k, b.lv || 1)}</b> lakóhely</>}
          </div>
        )}
        {b.up >= 0 && (
          <div className="mt-1">
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#ffc94a' }}>
              Fejlesztés a(z) {(b.lv || 1) + 1}. szintre: {Math.floor(b.up)}%
              {isMine(store, b.o) && <button title="Fejlesztés megszakítása (teljes visszatérítés)" onClick={() => store.onCancelUpgrade?.(b.i)} className="p-0.5 rounded hover:bg-white/10"><X className="w-3 h-3" /></button>}
            </div>
            <Bar frac={b.up / 100} color="#ffc94a" h={4} />
          </div>
        )}
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
        <div className="font-bold text-sm">{isResKey(node.k) ? RES_META[node.k].icon : undefined} {RES_HU[node.k] || node.k} lelőhely</div>
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
          Bal gomb: kijelölés · Bal gomb húzása: térkép mozgatása · Ctrl + bal gomb húzása: keretes kijelölés · Jobb gomb: mozgás / gyűjtés / támadás / javítás / dézsmálás<br />
          WASD vagy a képernyő széle: kamera · Görgő: nagyítás · Középső gomb (vagy Alt+bal gomb): forgatás · Q/E: elforgatás<br />
          Ctrl+1..9: csoport mentése · 1..9: csoport (dupla: odaugrás) · X: megállj · H: Vajda Háza · Delete (nyomva tartva): bontás · Enter: csevegés
        </>
      )}
    </div>
  );
}

interface DemolishButtonProps {
  store: EmpireStore;
  content: EmpireContent | null;
  buildings: EmpireBuilding[];
  onDemolish: EmpireMatch['demolishBuilding'];
}

function DemolishButton({ store, content, buildings, onDemolish }: DemolishButtonProps): JSX.Element {
  const cfg = { ...DEFAULT_DEMOLISH, ...(content?.raw?.demolish || {}) };
  const holdMs = cfg.holdMs || 1500;
  const [prog, setProg] = useState(0);
  const [busy, setBusy] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const idsRef = useRef<number[]>([]);
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
    const typing = (e: KeyboardEvent): boolean => { const t = e.target instanceof HTMLElement ? e.target : null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const down = (e: KeyboardEvent): void => { if (e.key === 'Delete' && !typing(e)) { e.preventDefault(); begin(); } };
    const up = (e: KeyboardEvent): void => { if (e.key === 'Delete') cancel(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', cancel); cancel(); };
  }, [begin, cancel]);

  const preview: Record<string, number> = {};
  for (const b of buildings) {
    const r = demolishRefundPreview(content?.buildings?.[b.k], b, cfg);
    for (const [k, v] of Object.entries(r)) preview[k] = (preview[k] || 0) + v;
  }
  const previewEntries = RES_KEYS.filter((k) => (preview[k] ?? 0) > 0);
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

interface ActionPanelProps extends PanelProps {
  onCommand: EmpireCommand;
  onDemolish: EmpireMatch['demolishBuilding'];
}

export function ActionPanel({ store, content, sel, onCommand, onDemolish }: ActionPanelProps): JSX.Element | null {
  if (store.spectator) return null;
  const res = store.res;
  const epoch = res.epoch || 1;
  const placing = store.ui.placing;
  const myUnits = sel.units.filter((u) => isMine(store, u.o));
  const hasBuilder = myUnits.some((u) => isBuilderKind(u.k));
  const myB = sel.buildings.filter((b) => isMine(store, b.o));
  const sections: JSX.Element[] = [];

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

  const b = myB[0];
  if (b && myB.length === 1 && b.bp >= 100 && content) {
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
    const up = nextUpgradeDef(content, b);
    if (up) {
      const lv = b.lv || 1;
      const locked = reqEpoch(up) > epoch;
      const poor = !canAfford(res, up.cost);
      const busy = b.up >= 0;
      const gain = (up.popCap ?? 0) - levelPopCap(content, b.k, lv);
      sections.push(
        <div key="upgrade">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#999BBE' }}>Épület fejlesztése</div>
          <ActionButton
            label={`${lv + 1}. szintre`}
            sub={`${gain > 0 ? `+${gain} lakóhely · ` : ''}${up.buildTime} mp`}
            cost={up.cost}
            res={res}
            disabled={busy || locked || poor}
            reason={busy ? 'Folyamatban' : locked ? `${reqEpoch(up)}. korszaktól` : poor ? 'Kevés nyersanyag' : ''}
            onClick={() => onCommand('upgrade', { buildingId: b.i })}
          />
        </div>
      );
    } else if (buildingLevelCount(content, b.k) > 1) {
      sections.push(<div key="upgrade" className="text-[10px]" style={{ color: '#999BBE' }}>Legmagasabb szint elérve.</div>);
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
