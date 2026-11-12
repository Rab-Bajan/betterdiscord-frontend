import React, { useEffect, useState } from 'react';
import { BINDINGS_KEY, DEFAULT_BINDINGS, QUALITY_PRESETS, SOUND_KEY, type KeyBindings } from '../../lib/GameClient';
import { Btn, Card, Muted } from './menuKit';

const LABELS: Record<keyof KeyBindings, string> = { forward: 'Előre', back: 'Hátra', left: 'Balra', right: 'Jobbra', jump: 'Ugrás', sprint: 'Sprint / nitró', ability: 'Képesség / tárgy', interact: 'Interakció', emote: 'Emote' };

interface SettingsPanelProps {
  quality: string;
  onQuality: (quality: string) => void;
  voiceMode: string;
  onVoiceMode: (mode: string) => void;
}

export default function SettingsPanel({ quality, onQuality, voiceMode, onVoiceMode }: SettingsPanelProps) {
  const load = (): KeyBindings => { try { return { ...DEFAULT_BINDINGS, ...JSON.parse(localStorage.getItem(BINDINGS_KEY) || '{}') }; } catch { return DEFAULT_BINDINGS; } };
  const [binds, setBinds] = useState(load);
  const [waiting, setWaiting] = useState<keyof KeyBindings | null>(null);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } });
  useEffect(() => {
    if (!waiting) return undefined;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const next = { ...binds, [waiting]: e.code };
      setBinds(next);
      setWaiting(null);
      try { localStorage.setItem(BINDINGS_KEY, JSON.stringify(next)); } catch { /* csak kényelmi beállítás */ }
    };
    window.addEventListener('keydown', handler, { once: true });
    return () => window.removeEventListener('keydown', handler);
  }, [waiting, binds]);
  const toggleSound = () => { const next = !sound; setSound(next); try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* csak kényelmi beállítás */ } };
  const select = { background: '#1B2040', color: '#F4F3FF' };
  return (
    <div className="space-y-3">
      <Card title="Grafika és hang">
        <div className="flex flex-wrap gap-3 items-center text-xs text-white">
          <label>Minőség <select value={quality} onChange={(e) => onQuality(e.target.value)} className="px-2 py-1 rounded-lg ml-1" style={select}>{Object.entries(QUALITY_PRESETS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}</select></label>
          <Btn kind="ghost" onClick={toggleSound}>Játékhangok: {sound ? 'be' : 'ki'}</Btn>
          <label>Hangcsevegés játék közben <select value={voiceMode} onChange={(e) => onVoiceMode(e.target.value)} className="px-2 py-1 rounded-lg ml-1" style={select}><option value="all">Mindenki hallható</option><option value="team">Csak a csapat</option><option value="proximity">Közelség alapján</option></select></label>
        </div>
      </Card>
      <Card title="Billentyűk">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {(Object.entries(LABELS) as Array<[keyof KeyBindings, string]>).map(([id, label]) => <div key={id} className="flex justify-between items-center text-xs text-white gap-2"><span>{label}</span><Btn kind="ghost" onClick={() => setWaiting(id)}>{waiting === id ? 'Nyomj gombot...' : binds[id]}</Btn></div>)}
        </div>
        <Muted>A változás a következő meccstől érvényes.</Muted>
      </Card>
    </div>
  );
}
