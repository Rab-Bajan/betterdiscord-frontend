import { useState } from 'react';
import { useSocketEvents } from './useSocketEvents';

export function useSpeedTest(socket) {
  const [isOpen, setIsOpen] = useState(false);
  const [requestToast, setRequestToast] = useState(null);

  useSocketEvents(socket, {
    'speedtest:requested-by': ({ requesterName }) => setRequestToast({ requesterName })
  });

  const requestUserTest = (targetUserId, targetUsername) => {
    socket.emit('speedtest:request-user', { targetUserId });
    alert(`Sebességteszt kérés sikeresen elküldve ${targetUsername} felhasználónak!`);
  };

  return { isOpen, setIsOpen, requestToast, setRequestToast, requestUserTest };
}
