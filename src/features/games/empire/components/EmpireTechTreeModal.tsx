import type { JSX } from 'react';
import { X, Check, Lock } from 'lucide-react';
import { GLASS } from './EmpireHud';
import { RES_META, costEntries, reqEpoch, buildingLabel } from '../lib/empireContent';
import type { Cost, EmpireContent } from '../types';

const MULT_HU: Readonly<Record<string, string>> = { gather: 'Gyűjtés', attack: 'Sebzés', hp: 'Életerő' };

function Costs({ cost }: { cost: Cost | undefined }): JSX.Element | null {
  const e = costEntries(cost);
  if (!e.length) return null;
  return (
    <span className="inline-flex gap-1.5 text-[10px]" style={{ color: '#c9cdea' }}>
      {e.map(([k, v]) => <span key={k} title={RES_META[k].hint}>{RES_META[k].icon}{v}</span>)}
    </span>
  );
}

// Technology tree built entirely from the server content: epochs, what unlocks in each, upgrades.
interface EmpireTechTreeModalProps {
  content: EmpireContent | null;
  currentEpoch?: number;
  onClose: () => void;
}

export default function EmpireTechTreeModal({ content, currentEpoch = 1, onClose }: EmpireTechTreeModalProps): JSX.Element {
  const epochs = content?.epochs || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(5,6,15,0.72)', backdropFilter: 'blur(6px)' }} onMouseDown={onClose}>
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl overflow-hidden" style={{ ...GLASS, background: 'rgba(16,19,41,0.95)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(125,105,255,0.2)' }}>
          <div>
            <div className="font-black text-lg">Technológiai fa</div>
            <div className="text-[11px]" style={{ color: '#999BBE' }}>Korszakok, feloldható egységek, épületek és fejlesztések</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {!epochs.length && <div className="text-sm" style={{ color: '#999BBE' }}>A tartalom még nem érkezett meg a szervertől.</div>}
          {content && epochs.map((ep) => {
            const state = ep.n < currentEpoch ? 'done' : ep.n === currentEpoch ? 'now' : 'locked';
            const units = content.unitList.filter((u) => reqEpoch(u) === ep.n);
            const blds = content.buildingList.filter((b) => reqEpoch(b) === ep.n);
            const mult = ep.n > 1 ? { gather: ep.gather, attack: ep.attack, hp: ep.hp } : null;
            return (
              <div key={ep.n} className="rounded-2xl p-4" style={{ background: '#151832', border: `1px solid ${state === 'now' ? 'rgba(118,85,245,0.7)' : 'rgba(125,105,255,0.15)'}`, opacity: state === 'locked' ? 0.8 : 1 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ background: state === 'locked' ? '#1B2040' : 'linear-gradient(135deg,#7655F5,#536CFF)' }}>{ep.n}</span>
                  <span className="font-bold">{ep.name}</span>
                  {state === 'done' && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#28C997' }}><Check className="w-3 h-3" />Elérve</span>}
                  {state === 'now' && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(118,85,245,0.25)', color: '#c7bfff' }}>Jelenlegi</span>}
                  {state === 'locked' && <Lock className="w-3 h-3" style={{ color: '#999BBE' }} />}
                  <span className="ml-auto flex items-center gap-3 text-[11px]" style={{ color: '#999BBE' }}>
                    {ep.cost && <Costs cost={ep.cost} />}
                    {(ep.researchTime ?? 0) > 0 && <span>{ep.researchTime} mp kutatás</span>}
                  </span>
                </div>
                {ep.description && <div className="text-xs mt-1.5" style={{ color: '#a9acd0' }}>{ep.description}</div>}
                {mult && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(mult).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 rounded-lg text-[11px] font-semibold" style={{ background: 'rgba(40,201,151,0.12)', color: '#28C997' }}>
                        {MULT_HU[k] || k}: ×{v}
                      </span>
                    ))}
                  </div>
                )}
                {(units.length > 0 || blds.length > 0) && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    {units.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#999BBE' }}>Egységek</div>
                        <div className="space-y-1">
                          {units.map((u) => (
                            <div key={u.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs" style={{ background: '#1B2040' }} title={u.description}>
                              <span className="font-semibold truncate">{u.name}{u.producer ? <span className="font-normal" style={{ color: '#999BBE' }}> · {content.buildings[u.producer]?.name || u.producer}</span> : null}</span>
                              <Costs cost={u.cost} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {blds.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#999BBE' }}>Épületek</div>
                        <div className="space-y-1">
                          {blds.map((b) => (
                            <div key={b.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs" style={{ background: '#1B2040' }} title={b.description}>
                              <span className="font-semibold truncate">{buildingLabel(content, b.id, ep.n)}</span>
                              <Costs cost={b.cost} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
