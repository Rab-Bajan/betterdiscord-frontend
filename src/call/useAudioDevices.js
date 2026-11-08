import { useState, useEffect, useCallback } from 'react';

// Mikrofon- és hangkimenet-eszközök listája (frissül, ha eszközt csatlakoztatnak/leválasztanak).
// Az eszközök nevei csak mikrofon-engedély után láthatók; hívás közben ez adott.
export function useAudioDevices() {
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        inputs: list.filter((d) => d.kind === 'audioinput'),
        outputs: list.filter((d) => d.kind === 'audiooutput')
      });
    } catch (e) { /* nem támogatott */ }
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  const supportsOutputSelection = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  return { ...devices, supportsOutputSelection, refresh };
}
