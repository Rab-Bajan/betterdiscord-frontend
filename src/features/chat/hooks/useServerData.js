import { useState } from 'react';
import { useSocketEvents } from '../../../shared/hooks/useSocketEvents';
import { playMessageSound } from '../../../shared/services/audio';

// Csatornák, csevegőüzenetek, online felhasználók és hangszoba-állapotok
export function useServerData(socket, currentUserRef) {
  const [textChannels, setTextChannels] = useState([
    { id: 'altalanos', name: 'általános', description: 'Általános beszélgetés minden témáról' },
    { id: 'gaming', name: 'gaming', description: 'Játék megbeszélések és tippek' },
    { id: 'zene', name: 'zene-és-klipek', description: 'Kedvenc zenék és videók' }
  ]);
  const [voiceChannels, setVoiceChannels] = useState([
    { id: 'hang-altalanos', name: 'Általános Hang', userLimit: 10 },
    { id: 'hang-gaming-1', name: 'Gaming 1 (Squad)', userLimit: 5 },
    { id: 'hang-chill', name: 'Chill & Dumcsi', userLimit: 15 }
  ]);
  const [activeTextChannel, setActiveTextChannel] = useState('altalanos');
  const [messages, setMessages] = useState({});
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [voiceStates, setVoiceStates] = useState({});

  useSocketEvents(socket, {
    'init:data': (data) => {
      if (data.textChannels) setTextChannels(data.textChannels);
      if (data.voiceChannels) setVoiceChannels(data.voiceChannels);
      if (data.channelMessages) setMessages(data.channelMessages);
      if (data.voiceStates) setVoiceStates(data.voiceStates);
      if (data.onlineUsers) setOnlineUsers(data.onlineUsers);
    },
    'users:updated': setOnlineUsers,
    'voice:states-updated': setVoiceStates,
    'chat:new-message': (msg) => {
      setMessages((prev) => ({
        ...prev,
        [msg.channelId]: [...(prev[msg.channelId] || []), msg]
      }));
      const me = currentUserRef.current;
      if (me && msg.senderId !== me.id) playMessageSound();
    },
    'voice:user-speaking': ({ userId, isSpeaking }) => {
      setVoiceStates((prev) => {
        const next = {};
        for (const ch in prev) {
          next[ch] = prev[ch].map((u) => (u.id === userId ? { ...u, isSpeaking } : u));
        }
        return next;
      });
    },
    'speedtest:result-announced': ({ userId, result }) => {
      setOnlineUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, speedTest: result } : u)));
    }
  });

  const sendMessage = (text, attachments = []) => {
    if (activeTextChannel) {
      socket.emit('chat:message', { channelId: activeTextChannel, text, attachments });
    }
  };

  return {
    textChannels,
    voiceChannels,
    activeTextChannel,
    setActiveTextChannel,
    messages,
    onlineUsers,
    voiceStates,
    sendMessage
  };
}
