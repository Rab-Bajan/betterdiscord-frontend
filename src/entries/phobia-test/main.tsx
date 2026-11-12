import React from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import '../../styles/index.css';
import MiskolcPhobiaView from '../../features/games/phobia/components/MiskolcPhobiaView.tsx';

declare global {
  interface Window {
    __socket?: Socket;
    __phobiaRoom?: string;
  }
}

const q = new URLSearchParams(location.search);
const socket = io('http://localhost:5055', { transports: ['websocket'] });
window.__socket = socket; window.__phobiaRoom = q.get("room")||"room1";
const user = { id: q.get('uid') || 'u1', username: q.get('name') || 'Tester' };
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('phobia-test: #root element missing');
createRoot(rootEl).render(
  <MiskolcPhobiaView socket={socket} channelId={q.get("room")||"room1"} currentUser={user} session={{}} onClose={() => console.log('CLOSE')} />
);
