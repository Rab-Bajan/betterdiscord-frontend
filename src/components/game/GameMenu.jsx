import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSocketEvents } from '../../hooks/useSocketEvents';
import { DEFAULT_BINDINGS, BINDINGS_KEY, SOUND_KEY, QUALITY_PRESETS } from '../../game/GameClient';

export const rpc = (socket, method, params = {}) =>
  new Promise((resolve, reject) => {
    socket.timeout(8000).emit('game:rpc', method, params, (err, reply) => {
      if (err) reject(new Error('A szerver nem válaszolt.'));
      else if (!reply.ok) reject(Object.assign(new Error(reply.error), { needsLogin: reply.needsLogin }));
      else resolve(reply.data);
    });
  });

const card = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.18)' };
const RARITY_COLORS = { common: '#9ca3af', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24', mythic: '#f472b6', secret: '#f87171' };
const CURRENCY_LABELS = { coins: '🪙 érme', gems: '💎 drágakő', war_tokens: '⚔️ háborús zseton', season_tokens: '🍂 évszak zseton' };
const RANK_LABELS = { leader: 'Vezető', co_leader: 'Társvezető', officer: 'Tiszt', member: 'Tag', recruit: 'Újonc' };
const MODE_LABELS = { team_deathmatch: 'Szappan vs Kosz', infection: 'Fertőzés', survival: 'Túlélés', boss: 'Főellenség', royale: 'Royale', racing: 'Verseny', clan_wars: 'Klánháború' };
const STAT_LABELS = { matches: 'Meccsek', wins: 'Győzelmek', losses: 'Vereségek', kills: 'Ölések', deaths: 'Halálok', assists: 'Gólpasszok', boss_kills: 'Főellenség-ölések', damage: 'Sebzés', territories_captured: 'Elfoglalt területek', race_wins: 'Versenygyőzelmek', survival_best: 'Túlélési rekord', playtime_s: 'Játékidő (mp)', contribution: 'Frakció-hozzájárulás' };

const Btn = ({ children, kind = 'primary', ...props }) => (
  <button type="button" {...props} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40 ${props.className || ''}`} style={{ background: kind === 'primary' ? 'linear-gradient(135deg, #7655F5, #536CFF)' : kind === 'danger' ? '#E94B64' : '#1B2040', color: '#fff' }}>
    {children}
  </button>
);
const Card = ({ title, children, right }) => (
  <div className="rounded-2xl p-3" style={card}>
    {(title || right) && <div className="flex items-center justify-between mb-2"><h3 className="font-extrabold text-sm text-white">{title}</h3>{right}</div>}
    {children}
  </div>
);
const Input = (props) => <input {...props} className={`px-2 py-1.5 rounded-lg text-xs outline-none min-w-0 select-text ${props.className || ''}`} style={{ background: '#1B2040', color: '#F4F3FF' }} />;
const Muted = ({ children }) => <p className="text-xs" style={{ color: '#999BBE' }}>{children}</p>;
const rewardText = (r) => Object.entries(r).map(([k, v]) => `+${v} ${CURRENCY_LABELS[k] || k}`).join(', ');

// Betöltés, hiba, frissítés és művelet minden lapnak ugyanúgy
function usePanel(socket, method, params) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const key = JSON.stringify(params || {});

  const reload = useCallback(() => rpc(socket, method, JSON.parse(key)).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), [socket, method, key]);
  useEffect(() => { reload(); }, [reload]);

  const act = async (name, args, success) => {
    try {
      const out = await rpc(socket, name, args);
      setError(null);
      setMessage(typeof success === 'function' ? success(out) : success || null);
      await reload();
      return out;
    } catch (e) {
      setError(e.message);
      setMessage(null);
      return null;
    }
  };
  return { data, error, message, reload, act };
}

function Status({ panel }) {
  return (
    <>
      {panel.error && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(233,75,100,0.15)', color: '#fca5a5' }}>{panel.error}</div>}
      {panel.message && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(40,201,151,0.14)', color: '#6ee7b7' }}>{panel.message}</div>}
      {!panel.data && !panel.error && <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-[#7655F5]" /></div>}
    </>
  );
}

function ProfilePanel({ socket, lobbyId }) {
  const panel = usePanel(socket, 'overview');
  const friends = usePanel(socket, 'friends');
  const [name, setName] = useState('');
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} /><Status panel={{ ...friends, data: true }} />
      {d && (
        <>
          <Card title={`${d.profile.username || ''} · ${d.profile.level}. szint · ${d.profile.badge}`} right={d.profile.title && <span className="text-xs font-bold text-amber-300">{d.profile.title}</span>}>
            <div className="flex flex-wrap gap-3 text-xs mb-2 text-white">{Object.entries(d.wallet).map(([k, v]) => <span key={k}>{CURRENCY_LABELS[k]}: <b>{v}</b></span>)}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs" style={{ color: '#c7d2fe' }}>
              {Object.entries(STAT_LABELS).map(([k, label]) => <div key={k} className="flex justify-between gap-2"><span style={{ color: '#999BBE' }}>{label}</span><b>{d.profile.stats[k] || 0}</b></div>)}
            </div>
          </Card>
          <Card title="Meccselőzmények">
            {d.profile.history.length === 0 ? <Muted>Még nincs lejátszott meccsed.</Muted> : d.profile.history.map((m) => (
              <div key={m.ended_at} className="flex justify-between text-xs py-0.5 text-white">
                <span>{MODE_LABELS[m.mode] || m.mode}</span>
                <span style={{ color: m.outcome === 'win' ? '#28C997' : '#999BBE' }}>{m.outcome === 'win' ? 'Győzelem' : m.outcome === 'draw' ? 'Döntetlen' : 'Vereség'}</span>
                <span>{m.kills}/{m.deaths} · +{m.xp_awarded} XP</span>
              </div>
            ))}
          </Card>
          <Card title="Barátok">
            <div className="flex gap-2 mb-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Felhasználónév" className="flex-1" />
              <Btn onClick={() => friends.act('friendRequest', { username: name }, 'Jelölés elküldve.')}>Jelölés</Btn>
              <Btn kind="ghost" onClick={() => friends.act('block', { username: name }, 'Letiltva.')}>Tiltás</Btn>
              <Btn kind="danger" onClick={() => { const reason = window.prompt('Miért jelented?'); if (reason) friends.act('report', { username: name, reason }, 'Jelentés elküldve.'); }}>Jelentés</Btn>
            </div>
            {(friends.data || []).map((f) => (
              <div key={f.username} className="flex items-center justify-between text-xs py-0.5 text-white">
                <span>{f.online ? '🟢' : '⚫'} {f.username}{f.status === 'pending' ? ' (függőben)' : ''}</span>
                <span className="flex gap-1">
                  {f.incoming && <Btn onClick={() => friends.act('friendAccept', { username: f.username })}>Elfogadás</Btn>}
                  {f.status === 'accepted' && <Btn kind="ghost" onClick={() => friends.act('inviteToLobby', { username: f.username, lobbyId }, 'Meghívó elküldve.')}>Meghívás</Btn>}
                  <Btn kind="ghost" onClick={() => friends.act('friendRemove', { username: f.username })}>Törlés</Btn>
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function MissionsPanel({ socket }) {
  const missions = usePanel(socket, 'missions');
  const achievements = usePanel(socket, 'achievements');
  return (
    <div className="space-y-3">
      <Status panel={missions} />
      {missions.data && ['daily', 'weekly'].map((kind) => (
        <Card key={kind} title={kind === 'daily' ? 'Napi küldetések' : 'Heti küldetések'}>
          {missions.data.filter((m) => m.kind === kind).map((m) => (
            <div key={m.id} className="py-1">
              <div className="flex justify-between items-center text-xs text-white gap-2">
                <span>{m.name} <span style={{ color: '#999BBE' }}>({rewardText(m.reward)})</span></span>
                {m.claimed ? <span style={{ color: '#28C997' }}>Átvéve</span> : <Btn disabled={m.progress < m.goal} onClick={() => missions.act('claimMission', { id: m.id }, (r) => `Jutalom: ${rewardText(r.reward)}`)}>Átvétel</Btn>}
              </div>
              <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: '#1B2040' }}><div className="h-full" style={{ width: `${(m.progress / m.goal) * 100}%`, background: '#7655F5' }} /></div>
              <div className="text-[10px]" style={{ color: '#999BBE' }}>{m.progress} / {m.goal}</div>
            </div>
          ))}
        </Card>
      ))}
      {achievements.data && (
        <Card title="Eredmények">
          <div className="grid sm:grid-cols-2 gap-1.5">
            {achievements.data.map((a) => (
              <div key={a.id} className="px-2 py-1.5 rounded-lg text-xs" style={{ background: a.earned ? 'rgba(40,201,151,0.14)' : '#1B2040', color: a.earned ? '#fff' : '#999BBE' }}>
                <b>{a.earned ? '🏆 ' : a.secret ? '🔒 ' : ''}{a.name}</b><div className="text-[11px]">{a.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ShopPanel({ socket }) {
  const shop = usePanel(socket, 'shop');
  const inv = usePanel(socket, 'inventory');
  const buy = async (id) => {
    await shop.act('buy', { id }, 'Megvetted!');
    inv.reload();
  };
  return (
    <div className="space-y-3">
      <Status panel={shop} /><Status panel={{ ...inv, data: true }} />
      {shop.data && (
        <Card title="Bolt" right={<span className="text-xs text-white">{Object.entries(shop.data.wallet).map(([k, v]) => `${CURRENCY_LABELS[k].split(' ')[0]} ${v}`).join('  ')}</span>}>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {shop.data.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs" style={{ background: '#1B2040' }}>
                <span><b style={{ color: RARITY_COLORS[i.rarity] }}>{i.name}</b><span className="block text-[10px]" style={{ color: '#999BBE' }}>{i.rarity} · {i.slot}</span></span>
                <Btn onClick={() => buy(i.id)}>{i.price.amount} {CURRENCY_LABELS[i.price.currency].split(' ')[0]}</Btn>
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

function ClanPanel({ socket }) {
  const panel = usePanel(socket, 'clanInfo');
  const [name, setName] = useState('');
  const [user, setUser] = useState('');
  const [chat, setChat] = useState('');
  useSocketEvents(socket, { 'game:clan-chat': () => panel.reload() });
  const d = panel.data;
  const rank = d?.myRank;
  const canManage = rank === 'leader' || rank === 'co_leader';
  const canInvite = canManage || rank === 'officer';

  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d?.invites?.map((c) => (
        <Card key={c.id}><div className="flex justify-between items-center text-xs text-white"><span>{c.logo} {c.name} meghívott</span><Btn onClick={() => panel.act('clanJoin', { id: c.id }, 'Beléptél.')}>Belépés</Btn></div></Card>
      ))}
      {d && !d.clan && (
        <>
          <Card title="Klán alapítása (500 érme)">
            <div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Klán neve" className="flex-1" /><Btn onClick={() => panel.act('clanCreate', { name, description: '' }, 'Klán létrehozva!')}>Alapítás</Btn></div>
          </Card>
          <Card title="Klánok">
            {d.list.length === 0 ? <Muted>Még nincs klán.</Muted> : d.list.map((c) => (
              <div key={c.id} className="flex justify-between items-center text-xs py-0.5 text-white"><span>{c.logo} {c.name} · {c.members} tag · {c.xp} XP</span>{c.open ? <Btn onClick={() => panel.act('clanJoin', { id: c.id }, 'Beléptél.')}>Csatlakozás</Btn> : <Muted>Csak meghívással</Muted>}</div>
            ))}
          </Card>
        </>
      )}
      {d?.clan && (
        <>
          <Card title={`${d.clan.logo} ${d.clan.name}`} right={<Btn kind="danger" onClick={() => panel.act('clanLeave', {}, 'Kiléptél.')}>Kilépés</Btn>}>
            <Muted>{d.clan.description || 'Nincs leírás.'}</Muted>
            <div className="flex flex-wrap gap-3 text-xs text-white mt-1"><span>XP: <b>{d.clan.xp}</b></span><span>Győzelmek: <b>{d.clan.wins}</b></span><span>Klánháború: <b>{d.clan.war_wins}</b></span><span>Hozzájárulás: <b>{d.clan.contribution}</b></span></div>
            {canManage && (
              <div className="flex gap-2 mt-2">
                <Btn kind="ghost" onClick={() => { const description = window.prompt('Új leírás', d.clan.description); if (description !== null) panel.act('clanUpdate', { description }); }}>Leírás</Btn>
                <Btn kind="ghost" onClick={() => { const logo = window.prompt('Új logó (emoji)', d.clan.logo); if (logo) panel.act('clanUpdate', { logo }); }}>Logó</Btn>
                <Btn kind="ghost" onClick={() => panel.act('clanUpdate', { open: !d.clan.open })}>{d.clan.open ? 'Zárt legyen' : 'Nyílt legyen'}</Btn>
              </div>
            )}
          </Card>
          <Card title="Tagok">
            {canInvite && <div className="flex gap-2 mb-2"><Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Felhasználónév" className="flex-1" /><Btn onClick={() => panel.act('clanInvite', { username: user }, 'Meghívó elküldve.')}>Meghívás</Btn></div>}
            {d.members.map((m) => (
              <div key={m.username} className="flex justify-between items-center text-xs py-0.5 text-white">
                <span>{m.username}{m.self ? ' (te)' : ''} · <span style={{ color: '#999BBE' }}>{RANK_LABELS[m.rank]}</span></span>
                {!m.self && canInvite && (
                  <span className="flex gap-1 items-center">
                    {canManage && <select value={m.rank} onChange={(e) => panel.act('clanSetRank', { username: m.username, rank: e.target.value })} className="px-1 py-0.5 rounded text-xs" style={{ background: '#1B2040', color: '#fff' }}>{Object.entries(RANK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                    <Btn kind="danger" onClick={() => panel.act('clanKick', { username: m.username })}>Kirúgás</Btn>
                  </span>
                )}
              </div>
            ))}
          </Card>
          <Card title="Klánchat">
            <div className="max-h-48 overflow-y-auto space-y-0.5 mb-2 select-text">{d.chat.map((c) => <div key={c.at + c.username} className="text-xs text-white"><b style={{ color: '#c7d2fe' }}>{c.username}:</b> {c.text}</div>)}</div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (chat.trim()) panel.act('clanChat', { text: chat }).then(() => setChat('')); }}>
              <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Üzenet" className="flex-1" /><Btn type="submit">Küldés</Btn>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function OfferEditor({ trade, inventory, onSave }) {
  const [items, setItems] = useState(trade.myOffer.items.map((i) => i.id));
  const [coins, setCoins] = useState(trade.myOffer.coins);
  const toggle = (id) => setItems((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
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

const offerText = (o) => [...o.items.map((i) => i.name), o.coins ? `${o.coins} érme` : null].filter(Boolean).join(', ') || 'semmi';

function TradePanel({ socket }) {
  const panel = usePanel(socket, 'trades');
  const inv = usePanel(socket, 'inventory');
  const [name, setName] = useState('');
  useSocketEvents(socket, { 'game:notify': (n) => { if (n.kind?.startsWith('trade')) { panel.reload(); inv.reload(); } } });
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
              <Btn className="mt-2" disabled={t.myConfirm} onClick={async () => { await panel.act('tradeConfirm', { id: t.id }, (r) => (r.completed ? 'A csere teljesült!' : 'Megerősítve, várakozás a másik félre.')); inv.reload(); }}>Megerősítés</Btn>
            </>
          )}
        </Card>
      ))}
      {history.length > 0 && <Card title="Előzmények">{history.map((t) => <div key={t.id} className="text-xs py-0.5 text-white">{t.partner}: {t.status === 'completed' ? 'teljesült' : 'lemondva'} · adtál: {offerText(t.myOffer)} · kaptál: {offerText(t.theirOffer)}</div>)}</Card>}
    </div>
  );
}

function WarPanel({ socket, onJoinBattle, factions }) {
  const map = usePanel(socket, 'warMap');
  const overview = usePanel(socket, 'overview');
  const [selected, setSelected] = useState(null);
  useSocketEvents(socket, { 'game:war-updated': () => map.reload() });
  const myFaction = overview.data?.profile.faction;
  const list = map.data?.territories || [];
  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  const t = selected && byId[selected];
  const color = (owner) => (owner ? factions[owner].color : '#6b7280');
  const reachable = t && myFaction && t.owner !== myFaction && t.links.some((id) => byId[id].owner === myFaction);

  return (
    <div className="space-y-3">
      <Status panel={map} />
      {overview.data && !myFaction && (
        <Card title="Válassz frakciót erre az évszakra">
          <div className="flex gap-2">{Object.values(factions).map((f) => <Btn key={f.id} onClick={async () => { await overview.act('setFaction', { faction: f.id }, `Csatlakoztál: ${f.name}`); map.reload(); }}>{f.name}</Btn>)}</div>
        </Card>
      )}
      {map.data && (
        <>
          <div className="flex flex-wrap gap-3 text-xs">{map.data.standings.map((s) => <span key={s.faction} style={{ color: factions[s.faction].color }}><b>{factions[s.faction].name}</b>: {s.total} pont</span>)}</div>
          <svg viewBox="0 0 100 100" className="w-full max-h-96 rounded-2xl" style={{ background: '#101329' }} role="img" aria-label="Világtérkép">
            {list.flatMap((a) => a.links.filter((id) => id > a.id).map((id) => <line key={a.id + id} x1={a.x} y1={a.y} x2={byId[id].x} y2={byId[id].y} stroke="rgba(153,155,190,0.35)" strokeWidth="0.4" />))}
            {list.map((a) => (
              <g key={a.id} onClick={() => setSelected(a.id)} className="cursor-pointer">
                <circle cx={a.x} cy={a.y} r={2 + a.value * 0.5} fill={color(a.owner)} stroke={selected === a.id ? '#fff' : a.battle ? '#ef4444' : 'none'} strokeWidth="0.7" />
                <text x={a.x} y={a.y + 7} textAnchor="middle" fontSize="2.5" fill="#F4F3FF">{a.name}</text>
              </g>
            ))}
          </svg>
        </>
      )}
      {t && (
        <Card title={t.name} right={<span className="text-xs font-bold" style={{ color: color(t.owner) }}>{t.owner ? factions[t.owner].name : 'Semleges'}</span>}>
          <div className="flex gap-3 text-xs text-white mb-2"><span>Védelem: <b>{t.defense}</b></span><span>Stratégiai érték: <b>{t.value}</b></span></div>
          {t.battle ? <Btn onClick={() => onJoinBattle(t.battle.id)}>Csatlakozás a csatához</Btn> : <Btn disabled={!reachable} onClick={async () => { const out = await map.act('warAttack', { id: t.id }, 'Támadás elindítva!'); if (out) onJoinBattle(out.battleId); }}>Támadás</Btn>}
          {!t.battle && !reachable && <Muted>Csak saját területtel szomszédos ellenséges vagy semleges terület támadható.</Muted>}
          <div className="mt-2">{t.history.map((h) => <div key={h.resolved_at} className="text-[11px]" style={{ color: '#999BBE' }}>{new Date(h.resolved_at).toLocaleString('hu-HU')}: támadó {factions[h.attacker].name}, győztes {h.winner ? factions[h.winner].name : 'senki'}</div>)}</div>
        </Card>
      )}
    </div>
  );
}

function BasePanel({ socket }) {
  const panel = usePanel(socket, 'baseState');
  const [target, setTarget] = useState('');
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d && (
        <>
          <Card title={`Bázis · védelem: ${d.defense}`} right={<Btn disabled={d.pending <= 0} onClick={() => panel.act('baseCollect', {}, (r) => `+${r.amount} érme`)}>Begyűjtés ({d.pending})</Btn>}>
            {d.buildings.length === 0 ? <Muted>Még nincs épületed.</Muted> : d.buildings.map((b) => (
              <div key={b.id} className="flex justify-between items-center text-xs py-1 text-white gap-2">
                <span><b>{b.def.name}</b> {b.level}. szint · {b.health}/{b.maxHealth} élet{!b.ready && <span style={{ color: '#f0b232' }}> · épül: {Math.ceil((b.ready_at - d.now) / 1000)} mp</span>}</span>
                <span className="flex gap-1">
                  {b.health < b.maxHealth && <Btn kind="ghost" onClick={() => panel.act('baseRepair', { id: b.id }, 'Megjavítva.')}>Javítás</Btn>}
                  <Btn disabled={!b.ready || b.level >= b.def.maxLevel} onClick={() => panel.act('baseUpgrade', { id: b.id }, 'Fejlesztés elindult.')}>Fejlesztés ({b.def.cost * (b.level + 1)})</Btn>
                </span>
              </div>
            ))}
          </Card>
          <Card title="Építés">
            <div className="grid sm:grid-cols-2 gap-1.5">
              {d.catalog.map((c) => (
                <div key={c.id} className="flex justify-between items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-white" style={{ background: '#1B2040' }}>
                  <span><b>{c.name}</b><span className="block text-[10px]" style={{ color: '#999BBE' }}>{c.desc} {c.time} mp, max {c.max}</span></span>
                  <Btn onClick={() => panel.act('baseBuild', { type: c.id }, 'Építés elindult.')}>{c.cost} 🪙</Btn>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Rajtaütés">
            <div className="flex gap-2"><Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Felhasználónév" className="flex-1" /><Btn disabled={d.raidReadyAt > d.now} onClick={() => panel.act('baseRaid', { username: target }, (r) => (r.success ? `Siker! ${r.stolen} érmét szereztél, sérült: ${r.damaged}.` : `Visszavertek (${r.attack} vs ${r.defense}).`))}>Támadás</Btn></div>
            {d.raidReadyAt > d.now && <Muted>Újra támadhatsz {Math.ceil((d.raidReadyAt - d.now) / 60000)} perc múlva.</Muted>}
          </Card>
        </>
      )}
    </div>
  );
}

function LeaderboardPanel({ socket }) {
  const boards = usePanel(socket, 'leaderboards');
  const [id, setId] = useState('overall');
  const board = usePanel(socket, 'leaderboard', { id });
  return (
    <div className="space-y-3">
      <Status panel={boards} />
      <div className="flex flex-wrap gap-1">{(boards.data || []).map((b) => <Btn key={b.id} kind={b.id === id ? 'primary' : 'ghost'} onClick={() => setId(b.id)}>{b.name}</Btn>)}</div>
      <Status panel={board} />
      {board.data && (
        <Card title={board.data.name}>
          {board.data.rows.length === 0 ? <Muted>Még nincs bejegyzés.</Muted> : board.data.rows.map((r, i) => <div key={`${r.username}${i}`} className="flex justify-between text-xs py-0.5 text-white"><span>{i + 1}. {r.username || 'Ismeretlen'}</span><b>{r.value}</b></div>)}
        </Card>
      )}
    </div>
  );
}

function SeasonPanel({ socket, factions }) {
  const panel = usePanel(socket, 'seasons');
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d && (
        <>
          <Card title={`${d.current.id}. évszak`}>
            <Muted>Vége: {new Date(d.current.ends_at).toLocaleString('hu-HU')}. A győztes frakció tagjai drágakövet, a részvevők évszak-zsetont, a legjobb 10 játékos extra jutalmat, az első hely exkluzív címet kap.</Muted>
            {d.standings.map((s) => <div key={s.faction} className="flex justify-between text-xs py-0.5" style={{ color: factions[s.faction].color }}><b>{factions[s.faction].name}</b><span>{s.points} + {s.territoryValue} terület = {s.total}</span></div>)}
          </Card>
          <Card title="Korábbi évszakok">
            {d.history.length === 0 ? <Muted>Még nem zárult le évszak.</Muted> : d.history.map((h) => <div key={h.id} className="text-xs py-0.5 text-white">{h.id}. évszak: {h.winner ? factions[h.winner].name : 'döntetlen'} · legjobb: {h.summary.top[0]?.username || '-'}</div>)}
          </Card>
        </>
      )}
    </div>
  );
}

function SettingsPanel({ quality, onQuality, voiceMode, onVoiceMode }) {
  const load = () => { try { return { ...DEFAULT_BINDINGS, ...JSON.parse(localStorage.getItem(BINDINGS_KEY) || '{}') }; } catch { return DEFAULT_BINDINGS; } };
  const [binds, setBinds] = useState(load);
  const [waiting, setWaiting] = useState(null);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } });
  useEffect(() => {
    if (!waiting) return undefined;
    const handler = (e) => {
      e.preventDefault();
      const next = { ...binds, [waiting]: e.code };
      setBinds(next);
      setWaiting(null);
      try { localStorage.setItem(BINDINGS_KEY, JSON.stringify(next)); } catch { /* csak kényelmi beállítás */ }
    };
    window.addEventListener('keydown', handler, { once: true });
    return () => window.removeEventListener('keydown', handler);
  }, [waiting, binds]);
  const LABELS = { forward: 'Előre', back: 'Hátra', left: 'Balra', right: 'Jobbra', jump: 'Ugrás', sprint: 'Sprint / nitró', ability: 'Képesség / tárgy', interact: 'Interakció', emote: 'Emote' };
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
          {Object.entries(LABELS).map(([id, label]) => <div key={id} className="flex justify-between items-center text-xs text-white gap-2"><span>{label}</span><Btn kind="ghost" onClick={() => setWaiting(id)}>{waiting === id ? 'Nyomj gombot...' : binds[id]}</Btn></div>)}
        </div>
        <Muted>A változás a következő meccstől érvényes.</Muted>
      </Card>
    </div>
  );
}

function AdminPanel({ socket }) {
  const panel = usePanel(socket, 'adminOverview');
  const [name, setName] = useState('');
  const [hours, setHours] = useState(24);
  const [detail, setDetail] = useState(null);
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d && (
        <>
          <Card title="Szerver" right={<Btn kind="ghost" onClick={panel.reload}>Frissítés</Btn>}>
            <div className="text-xs text-white">Memória: {d.memoryMb} MB · Lobbik: {d.lobbies} · Futó meccsek: {d.matches.length}</div>
            {d.matches.map((m) => <div key={m.id} className="text-xs" style={{ color: '#c7d2fe' }}>{MODE_LABELS[m.mode]} · {m.players} játékos · {m.time} mp · {JSON.stringify(m.score)}</div>)}
          </Card>
          <Card title="Beállítások">
            <div className="flex flex-wrap gap-2 items-center text-xs text-white">
              <Btn kind="ghost" onClick={() => { const days = Number(window.prompt('Évszak hossza (nap)', d.seasonDays)); if (days) panel.act('adminSetSeasonDays', { days }, 'Mentve.'); }}>Évszak: {d.seasonDays} nap</Btn>
              <Btn kind="ghost" onClick={() => { const value = Number(window.prompt('XP-szorzó', d.xpMultiplier)); if (!Number.isNaN(value)) panel.act('adminSetXpMultiplier', { value }, 'Mentve.'); }}>XP-szorzó: {d.xpMultiplier}</Btn>
              <Btn kind="danger" onClick={() => { if (window.confirm('Biztosan lezárod az évszakot?')) panel.act('adminEndSeason', {}, 'Évszak lezárva.'); }}>Évszak lezárása</Btn>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(MODE_LABELS).map(([id, label]) => {
                const off = d.disabledModes.includes(id);
                return <Btn key={id} kind={off ? 'danger' : 'ghost'} onClick={() => panel.act('adminSetDisabledModes', { modes: off ? d.disabledModes.filter((m) => m !== id) : [...d.disabledModes, id] })}>{label}: {off ? 'ki' : 'be'}</Btn>;
              })}
            </div>
          </Card>
          <Card title="Játékos">
            <div className="flex gap-2 items-center">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Felhasználónév" className="flex-1" />
              <Input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-20" />
              <Btn kind="danger" onClick={() => panel.act('adminSuspend', { username: name, hours }, hours ? 'Felfüggesztve.' : 'Feloldva.')}>Felfüggesztés (óra)</Btn>
              <Btn kind="ghost" onClick={async () => setDetail(await panel.act('adminPlayer', { username: name }))}>Adatok</Btn>
            </div>
            {detail && <pre className="text-[11px] mt-2 max-h-56 overflow-auto select-text" style={{ color: '#c7d2fe' }}>{JSON.stringify(detail, null, 1)}</pre>}
          </Card>
          <Card title="Jelentések">
            {d.reports.length === 0 ? <Muted>Nincs nyitott jelentés.</Muted> : d.reports.map((r) => <div key={r.id} className="flex justify-between items-center text-xs py-0.5 text-white gap-2"><span>{r.reporter} → {r.target}: {r.reason}</span><Btn kind="ghost" onClick={() => panel.act('adminCloseReport', { id: r.id })}>Lezárás</Btn></div>)}
          </Card>
          <Card title="Napló">{d.audit.map((a) => <div key={a.at + a.action} className="text-[11px]" style={{ color: '#999BBE' }}>{new Date(a.at).toLocaleString('hu-HU')} · {a.actor} · {a.action} · {a.detail}</div>)}</Card>
        </>
      )}
    </div>
  );
}

export const MENU_TABS = [['profile', 'Profil'], ['missions', 'Küldetések'], ['shop', 'Bolt'], ['clan', 'Klán'], ['trade', 'Csere'], ['war', 'Világháború'], ['base', 'Bázis'], ['leaders', 'Ranglista'], ['season', 'Évszak'], ['settings', 'Beállítások']];

export default function GameMenu({ tab, socket, factions, lobbyId, onJoinBattle, quality, onQuality, voiceMode, onVoiceMode }) {
  switch (tab) {
    case 'profile': return <ProfilePanel socket={socket} lobbyId={lobbyId} />;
    case 'missions': return <MissionsPanel socket={socket} />;
    case 'shop': return <ShopPanel socket={socket} />;
    case 'clan': return <ClanPanel socket={socket} />;
    case 'trade': return <TradePanel socket={socket} />;
    case 'war': return <WarPanel socket={socket} factions={factions} onJoinBattle={onJoinBattle} />;
    case 'base': return <BasePanel socket={socket} />;
    case 'leaders': return <LeaderboardPanel socket={socket} />;
    case 'season': return <SeasonPanel socket={socket} factions={factions} />;
    case 'settings': return <SettingsPanel quality={quality} onQuality={onQuality} voiceMode={voiceMode} onVoiceMode={onVoiceMode} />;
    case 'admin': return <AdminPanel socket={socket} />;
    default: return null;
  }
}
