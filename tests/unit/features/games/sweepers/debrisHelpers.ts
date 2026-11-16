// Phase C test helpers: wire rows and chunk payloads built the way the server encodes them (C.2/C.5).
import { ITEM_KINDS, type ItemKind } from '../../../../../src/features/games/sweepers/lib/debris/tables';

/** Standard base64 of `bytes` (what the server's `Buffer.toString('base64')` gives). */
export function base64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 256 cell bytes, every cell `byte`. */
export const uniformCells = (byte: number): Uint8Array => new Uint8Array(256).fill(byte);

export interface RowSpec {
  readonly id: number;
  readonly kind: ItemKind;
  readonly x: number;
  readonly z: number;
  readonly massKg: number;
  readonly flags?: number;
  readonly rot8?: number;
  readonly seedKg?: number;
}

/** `[id, kind, xCm, zCm, rf, massDg(, seedDg)]`. */
export function itemRow(spec: RowSpec): number[] {
  const row = [spec.id, ITEM_KINDS.indexOf(spec.kind), Math.round(spec.x * 100), Math.round(spec.z * 100), (spec.rot8 ?? 0) | ((spec.flags ?? 0) << 8), Math.round(spec.massKg * 100)];
  if (spec.seedKg !== undefined) row.push(Math.round(spec.seedKg * 100));
  return row;
}

export const loadEntry = (id: number, cells: Uint8Array, items: readonly RowSpec[] = []) => ({ id, c: base64(cells), i: items.map(itemRow) });
