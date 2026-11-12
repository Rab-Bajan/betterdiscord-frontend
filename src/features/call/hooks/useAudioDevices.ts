import { useState, useEffect, useCallback } from 'react';

// Mikrofon- és hangkimenet-eszközök listája (frissül, ha eszközt csatlakoztatnak/leválasztanak).
// Az eszközök nevei csak mikrofon-engedély után láthatók; hívás közben ez adott.
interface AudioDeviceLists {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

export interface AudioDevices extends AudioDeviceLists {
  supportsOutputSelection: boolean;
  refresh: () => Promise<void>;
}

export function useAudioDevices(): AudioDevices {
  const [devices, setDevices] = useState<AudioDeviceLists>({ inputs: [], outputs: [] });

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
    void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  const supportsOutputSelection = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  return { ...devices, supportsOutputSelection, refresh };
}
