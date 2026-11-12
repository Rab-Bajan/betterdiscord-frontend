import { useState, type Dispatch, type SetStateAction } from 'react';
import { useSocketEvents } from '../../../shared/hooks/useSocketEvents';
import { stringField } from '../../../shared/lib/guards';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';

export interface SpeedTestRequest {
  requesterName: string;
}

export interface SpeedTestApi {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  requestToast: SpeedTestRequest | null;
  setRequestToast: Dispatch<SetStateAction<SpeedTestRequest | null>>;
  requestUserTest: (targetUserId: string, targetUsername: string) => void;
}

export function useSpeedTest(socket: SocketLike): SpeedTestApi {
  const [isOpen, setIsOpen] = useState(false);
  const [requestToast, setRequestToast] = useState<SpeedTestRequest | null>(null);

  useSocketEvents(socket, {
    'speedtest:requested-by': (payload) => {
      const requesterName = stringField(payload, 'requesterName');
      if (requesterName !== undefined) setRequestToast({ requesterName });
    }
  });

  const requestUserTest = (targetUserId: string, targetUsername: string) => {
    socket.emit('speedtest:request-user', { targetUserId });
    alert(`Sebességteszt kérés sikeresen elküldve ${targetUsername} felhasználónak!`);
  };

  return { isOpen, setIsOpen, requestToast, setRequestToast, requestUserTest };
}
