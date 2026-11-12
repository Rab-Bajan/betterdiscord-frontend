// A SUDS WAR menü közös építőkövei: gombok, kártyák, állapotsor és a lapok adatbetöltése.
import React, { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { isRecord } from '../../../../../shared/lib/guards';
import { GameRpc, type TimeoutSocket } from '../../lib/GameRpc';

export const card = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.18)' };
export const RARITY_COLORS: Readonly<Record<string, string>> = { common: '#9ca3af', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24', mythic: '#f472b6', secret: '#f87171' };
export const CURRENCY_LABELS: Readonly<Record<string, string>> = { coins: '🪙 érme', gems: '💎 drágakő', war_tokens: '⚔️ háborús zseton', season_tokens: '🍂 évszak zseton' };
export const RANK_LABELS: Readonly<Record<string, string>> = { leader: 'Vezető', co_leader: 'Társvezető', officer: 'Tiszt', member: 'Tag', recruit: 'Újonc' };
export const MODE_LABELS: Readonly<Record<string, string>> = { team_deathmatch: 'Szappan vs Kosz', infection: 'Fertőzés', survival: 'Túlélés', boss: 'Főellenség', royale: 'Royale', racing: 'Verseny', clan_wars: 'Klánháború' };
export const STAT_LABELS: Readonly<Record<string, string>> = { matches: 'Meccsek', wins: 'Győzelmek', losses: 'Vereségek', kills: 'Ölések', deaths: 'Halálok', assists: 'Gólpasszok', boss_kills: 'Főellenség-ölések', damage: 'Sebzés', territories_captured: 'Elfoglalt területek', race_wins: 'Versenygyőzelmek', survival_best: 'Túlélési rekord', playtime_s: 'Játékidő (mp)', contribution: 'Frakció-hozzájárulás' };

export const currencyIcon = (currency: string): string => (CURRENCY_LABELS[currency] ?? '').split(' ')[0] ?? '';
export const rewardText = (r: Readonly<Record<string, number>>): string =>
  Object.entries(r).map(([k, v]) => `+${v} ${CURRENCY_LABELS[k] || k}`).join(', ');

/** A field of an RPC result (for success messages). */
export const resultField = (out: unknown, key: string): unknown => (isRecord(out) ? out[key] : undefined);

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: 'primary' | 'danger' | 'ghost';
}

export const Btn = ({ children, kind = 'primary', ...props }: BtnProps) => (
  <button type="button" {...props} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40 ${props.className || ''}`} style={{ background: kind === 'primary' ? 'linear-gradient(135deg, #7655F5, #536CFF)' : kind === 'danger' ? '#E94B64' : '#1B2040', color: '#fff' }}>
    {children}
  </button>
);

interface CardProps {
  title?: ReactNode;
  children?: ReactNode;
  right?: ReactNode;
}

export const Card = ({ title, children, right }: CardProps) => (
  <div className="rounded-2xl p-3" style={card}>
    {(title || right) && <div className="flex items-center justify-between mb-2"><h3 className="font-extrabold text-sm text-white">{title}</h3>{right}</div>}
    {children}
  </div>
);

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`px-2 py-1.5 rounded-lg text-xs outline-none min-w-0 select-text ${props.className || ''}`} style={{ background: '#1B2040', color: '#F4F3FF' }} />;
export const Muted = ({ children }: { children: ReactNode }) => <p className="text-xs" style={{ color: '#999BBE' }}>{children}</p>;

export type SuccessMessage = string | ((out: unknown) => string) | undefined;

export interface Panel<T> {
  data: T | null;
  error: string | null;
  message: string | null;
  reload: () => Promise<void>;
  act: (name: string, args?: Record<string, unknown>, success?: SuccessMessage) => Promise<unknown>;
}

/** What the status row needs; `data: true` hides the spinner for side panels. */
export interface PanelStatus {
  data: unknown;
  error: string | null;
  message: string | null;
}

const parseParams = (key: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(key);
  return isRecord(parsed) ? { ...parsed } : {};
};

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Betöltés, hiba, frissítés és művelet minden lapnak ugyanúgy
export function usePanel<T>(socket: TimeoutSocket, method: string, isData: (v: unknown) => v is T, params?: Record<string, unknown>): Panel<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rpc = useMemo(() => new GameRpc(socket), [socket]);
  const key = JSON.stringify(params || {});

  const reload = useCallback(
    () => rpc.call(method, parseParams(key)).then((d) => {
      if (isData(d)) { setData(d); setError(null); } else setError('Váratlan válasz a szervertől.');
    }).catch((e: unknown) => setError(errorText(e))),
    [rpc, method, key, isData]
  );
  useEffect(() => { void reload(); }, [reload]);

  const act = async (name: string, args: Record<string, unknown> = {}, success?: SuccessMessage) => {
    try {
      const out = await rpc.call(name, args);
      setError(null);
      setMessage(typeof success === 'function' ? success(out) : success || null);
      await reload();
      return out;
    } catch (e) {
      setError(errorText(e));
      setMessage(null);
      return null;
    }
  };
  return { data, error, message, reload, act };
}

export function Status({ panel }: { panel: PanelStatus }) {
  return (
    <>
      {panel.error && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(233,75,100,0.15)', color: '#E94B64' }}>{panel.error}</div>}
      {panel.message && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(40,201,151,0.14)', color: '#28C997' }}>{panel.message}</div>}
      {!panel.data && !panel.error && <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-[#7655F5]" /></div>}
    </>
  );
}
