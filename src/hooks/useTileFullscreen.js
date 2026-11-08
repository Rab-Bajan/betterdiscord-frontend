import { useState, useEffect } from 'react';

// Egy elem (pl. kameracsempe) teljes képernyőre váltása. Az elemet a data-tile-id attribútuma azonosítja.
export function useTileFullscreen() {
  const [fullscreenId, setFullscreenId] = useState(null);

  useEffect(() => {
    const onChange = () => setFullscreenId(document.fullscreenElement?.dataset?.tileId ?? null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Eseményből megkeresi a legközelebbi csempét és ki-be kapcsolja a teljes képernyőt
  const toggle = (event) => {
    event.stopPropagation();
    const tile = event.currentTarget.closest('[data-tile-id]');
    if (!tile) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else tile.requestFullscreen?.().catch(() => {});
  };

  return { fullscreenId, toggle };
}
