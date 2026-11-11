import { useState } from 'react';

// Kik osztanak épp képernyőt, melyiket nézzük, és mi az ő streamje
export function useScreenSharers({ participants, currentUserId, isScreenSharing, localScreenStream, remoteScreenStreams }) {
  const [chosenId, setSelectedSharerId] = useState(null);

  const screenSharers = participants.filter((p) =>
    p.id === currentUserId
      ? isScreenSharing && localScreenStream
      : p.isScreenSharing && remoteScreenStreams.has(p.id)
  );

  // A választás érvénytelenné válhat (valaki leállítja a megosztást): ilyenkor az első megosztóra esünk vissza
  const selectedSharerId = screenSharers.some((s) => s.id === chosenId) ? chosenId : screenSharers[0]?.id ?? null;

  const activeSharer = participants.find((p) => p.id === selectedSharerId);
  const activeStream =
    selectedSharerId === currentUserId
      ? localScreenStream
      : selectedSharerId
      ? remoteScreenStreams.get(selectedSharerId)
      : null;

  const isSharing = (p) =>
    p.id === currentUserId ? !!isScreenSharing : !!(p.isScreenSharing && remoteScreenStreams.has(p.id));

  return { screenSharers, selectedSharerId, setSelectedSharerId, activeSharer, activeStream, isSharing };
}
