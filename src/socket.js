import { io } from 'socket.io-client';
import { SOCKET_URL } from './config';

// Egyetlen megosztott kapcsolat. Nem csatlakozik automatikusan: az App az összes eseménykezelő
// bekötése után hívja a connect()-et, így nem veszhet el az első esemény.
export const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false
});
