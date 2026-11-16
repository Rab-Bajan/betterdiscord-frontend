// A tisztasági maszk (spec 18) leképezése: világ XZ (±300 m) -> maszk UV / klip-tér. Tiszta kód.

export const MASK_SIZE = 2048;
export const MASK_HALF_EXTENT = 300;
const SPAN = MASK_HALF_EXTENT * 2;

/** u = (x + 300) / 600, v = (z + 300) / 600; the shader samples the mask with the same formula. */
export function worldToMaskUv(x: number, z: number): { u: number; v: number } {
  return { u: (x + MASK_HALF_EXTENT) / SPAN, v: (z + MASK_HALF_EXTENT) / SPAN };
}

/** The mask pass draws in clip space [-1, 1]², which the render target stores as UV [0, 1]². */
export function worldToMaskClip(x: number, z: number): { x: number; y: number } {
  const { u, v } = worldToMaskUv(x, z);
  return { x: u * 2 - 1, y: v * 2 - 1 };
}

/** A world-space length in clip units of the mask pass. */
export const worldLengthToClip = (metres: number): number => (metres / SPAN) * 2;

/** The texel holding world (x, z); clamped to the mask. */
export function worldToMaskTexel(x: number, z: number): { px: number; py: number } {
  const { u, v } = worldToMaskUv(x, z);
  const clampTexel = (t: number): number => Math.min(MASK_SIZE - 1, Math.max(0, Math.floor(t * MASK_SIZE)));
  return { px: clampTexel(u), py: clampTexel(v) };
}

/** Metres per mask texel (≈ 0.29 m). */
export const MASK_TEXEL_METRES = SPAN / MASK_SIZE;
