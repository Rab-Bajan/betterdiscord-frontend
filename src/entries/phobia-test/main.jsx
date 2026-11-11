import React from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import '../../styles/index.css';
import MiskolcPhobiaView from '../../features/games/phobia/components/MiskolcPhobiaView.jsx';
const q = new URLSearchParams(location.search);
const socket = io('http://localhost:5055', { transports: ['websocket'] });
window.__socket = socket; window.__phobiaRoom = q.get("room")||"room1";
const user = { id: q.get('uid') || 'u1', username: q.get('name') || 'Tester' };
createRoot(document.getElementById('root')).render(
  <MiskolcPhobiaView socket={socket} channelId={q.get("room")||"room1"} currentUser={user} session={{}} onClose={() => console.log('CLOSE')} />
);
