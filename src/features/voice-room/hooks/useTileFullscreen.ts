import { useState, useEffect, type MouseEvent } from 'react';

export interface TileFullscreen {
  fullscreenId: string | null;
  toggle: (event: MouseEvent<HTMLElement>) => void;
}

// Egy elem (pl. kameracsempe) teljes képernyőre váltása. Az elemet a data-tile-id attribútuma azonosítja.
export function useTileFullscreen(): TileFullscreen {
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => {
      const el = document.fullscreenElement;
      setFullscreenId(el instanceof HTMLElement ? el.dataset.tileId ?? null : null);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Eseményből megkeresi a legközelebbi csempét és ki-be kapcsolja a teljes képernyőt
  const toggle = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    const tile = event.currentTarget.closest('[data-tile-id]');
    if (!tile) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else tile.requestFullscreen?.().catch(() => {});
  };

  return { fullscreenId, toggle };
}
