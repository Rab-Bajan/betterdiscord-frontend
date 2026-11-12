import React from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Btn, Card, Muted, Status, usePanel, RARITY_COLORS, currencyIcon } from './menuKit';
import type * as T from './menuTypes';
import { hasFields, isList } from './menuTypes';

const isShop = hasFields<T.Shop>('wallet', 'items');

export default function ShopPanel({ socket }: { socket: ArenaSocket }) {
  const shop = usePanel(socket, 'shop', isShop);
  const inv = usePanel(socket, 'inventory', isList<T.InventoryEntry>);
  const buy = async (id: string) => {
    await shop.act('buy', { id }, 'Megvetted!');
    void inv.reload();
  };
  return (
    <div className="space-y-3">
      <Status panel={shop} /><Status panel={{ ...inv, data: true }} />
      {shop.data && (
        <Card title="Bolt" right={<span className="text-xs text-white">{Object.entries(shop.data.wallet).map(([k, v]) => `${currencyIcon(k)} ${v}`).join('  ')}</span>}>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {shop.data.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs" style={{ background: '#1B2040' }}>
                <span><b style={{ color: RARITY_COLORS[i.rarity] }}>{i.name}</b><span className="block text-[10px]" style={{ color: '#999BBE' }}>{i.rarity} · {i.slot}</span></span>
                <Btn onClick={() => buy(i.id)}>{i.price.amount} {currencyIcon(i.price.currency)}</Btn>
              </div>
            ))}
          </div>
        </Card>
      )}
      {inv.data && (
        <Card title="Leltár">
          {inv.data.length === 0 ? <Muted>Üres a leltárad.</Muted> : (
            <div className="grid sm:grid-cols-2 gap-1.5">
              {inv.data.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs" style={{ background: '#1B2040' }}>
                  <b style={{ color: RARITY_COLORS[i.item.rarity] }}>{i.item.name}</b>
                  {i.item.slot !== 'collectible' && <Btn kind={i.equipped ? 'ghost' : 'primary'} onClick={() => inv.act('equip', { id: i.id, unequip: i.equipped })}>{i.equipped ? 'Levétel' : 'Felvétel'}</Btn>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
