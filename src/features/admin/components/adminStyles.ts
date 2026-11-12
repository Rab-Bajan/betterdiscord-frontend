// Az admin menü közös stílusai.
import type { CSSProperties } from 'react';

export const card: CSSProperties = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' };
export const inputCls = 'px-2.5 py-1.5 rounded-lg text-sm outline-none text-white w-full min-w-0';
export const inputStyle: CSSProperties = { background: '#101329', border: '1px solid rgba(125, 105, 255, 0.2)' };
export const btnCls = 'px-3 py-2 min-h-[36px] rounded-lg text-xs font-bold text-white transition active:scale-95 flex-shrink-0';
export const btnStyle: CSSProperties = { background: 'linear-gradient(135deg, #7655F5, #536CFF)' };

/** A status line under an admin form. */
export interface AdminMessage {
  text: string;
  ok: boolean;
}
