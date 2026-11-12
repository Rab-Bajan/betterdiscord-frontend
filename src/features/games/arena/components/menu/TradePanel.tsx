import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { useSocketEvents } from '../../../../../shared/hooks/useSocketEvents';
import { stringField } from '../../../../../shared/lib/guards';
import { Btn, Card, Input, Muted, Status, usePanel, RARITY_COLORS, resultField } from './menuKit';
import type * as T from './menuTypes';
import { isList } from './menuTypes';

interface OfferEditorProps {
  trade: T.Trade;
  inventory: T.InventoryEntry[];
  onSave: (offer: { items: string[]; coins: number }) => void;
}

function OfferEditor({ trade, inventory, onSave }: OfferEditorProps) {
  const [items, setItems] = useState<string[]>(trade.myOffer.items.map((i) => i.id));
  const [coins, setCoins] = useState(trade.myOffer.coins);
  const toggle = (id: string) => setItems((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {inventory.filter((i) => i.item.tradable).map((i) => (
          <button key={i.id} type="button" onClick={() => toggle(i.id)} className="px-2 py-1 rounded text-[11px] font-bold" style={{ background: items.includes(i.id) ? '#7655F5' : '#1B2040', color: RARITY_COLORS[i.item.rarity] }}>{i.item.name}</button>
        ))}
      </div>
      <div className="flex gap-2 items-center"><Input type="number" min="0" value={coins} onChange={(e) => setCoins(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="w-28" /><span className="text-xs text-white">érme</span><Btn kind="ghost" onClick={() => onSave({ items, coins })}>Ajánlat mentése</Btn></div>
    </div>
  );
}

const offerText = (o: T.TradeOffer): string => [...o.items.map((i) => i.name), o.coins ? `${o.coins} érme` : null].filter(Boolean).join(', ') || 'semmi';

export default function TradePanel({ socket }: { socket: ArenaSocket }) {
  const panel = usePanel(socket, 'trades', isList<T.Trade>);
  const inv = usePanel(socket, 'inventory', isList<T.InventoryEntry>);
  const [name, setName] = useState('');
  useSocketEvents(socket, { 'game:notify': (n) => { if (stringField(n, 'kind')?.startsWith('trade')) { void panel.reload(); void inv.reload(); } } });
  const open = (panel.data || []).filter((t) => ['pending', 'active'].includes(t.status));
  const history = (panel.data || []).filter((t) => !['pending', 'active'].includes(t.status));
  return (
    <div className="space-y-3">
      <Status panel={panel} />
      <Card title="Új csere"><div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Felhasználónév" className="flex-1" /><Btn onClick={() => panel.act('tradeCreate', { username: name }, 'Kérés elküldve.')}>Kérés</Btn></div></Card>
      {open.map((t) => (
        <Card key={t.id} title={`Csere: ${t.partner}`} right={<Btn kind="danger" onClick={() => panel.act('tradeCancel', { id: t.id })}>Lemondás</Btn>}>
          {t.status === 'pending' ? (t.incoming ? <Btn onClick={() => panel.act('tradeAccept', { id: t.id })}>Elfogadás</Btn> : <Muted>Várakozás a másik félre.</Muted>) : (
            <>
              <div className="text-xs text-white">Te adod: <b>{offerText(t.myOffer)}</b> {t.myConfirm && '✅'}</div>
              <div className="text-xs text-white">Te kapod: <b>{offerText(t.theirOffer)}</b> {t.theirConfirm && '✅'}</div>
              <Muted>Ha bárki módosít, a megerősítések törlődnek. Megerősítés előtt ellenőrizd, mit kapsz.</Muted>
              {inv.data && <OfferEditor key={JSON.stringify(t.myOffer)} trade={t} inventory={inv.data} onSave={(offer) => panel.act('tradeSetOffer', { id: t.id, offer })} />}
              <Btn className="mt-2" disabled={t.myConfirm} onClick={async () => { await panel.act('tradeConfirm', { id: t.id }, (r) => (resultField(r, 'completed') ? 'A csere teljesült!' : 'Megerősítve, várakozás a másik félre.')); void inv.reload(); }}>Megerősítés</Btn>
            </>
          )}
        </Card>
      ))}
      {history.length > 0 && <Card title="Előzmények">{history.map((t) => <div key={t.id} className="text-xs py-0.5 text-white">{t.partner}: {t.status === 'completed' ? 'teljesült' : 'lemondva'} · adtál: {offerText(t.myOffer)} · kaptál: {offerText(t.theirOffer)}</div>)}</Card>}
    </div>
  );
}
