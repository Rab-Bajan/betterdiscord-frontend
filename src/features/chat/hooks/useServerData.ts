import { useState, type RefObject } from 'react';
import { useSocketEvents } from '../../../shared/hooks/useSocketEvents';
import { playMessageSound } from '../../../shared/services/audio';
import { isRecord, isString } from '../../../shared/lib/guards';
import { parsePresenceList, parseSpeedTestResult, parseVoiceStates } from '../../../shared/lib/presence';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import type { Attachment, PresenceUser, UserSummary, VoiceStates } from '../../../shared/types';
import {
  parseChannelMessage, parseChannelMessages, parseTextChannels, parseVoiceChannels,
  type ChannelMessages, type TextChannel, type VoiceChannel
} from '../types';

const DEFAULT_TEXT_CHANNELS: TextChannel[] = [
  { id: 'altalanos', name: 'általános', description: 'Általános beszélgetés minden témáról' },
  { id: 'gaming', name: 'gaming', description: 'Játék megbeszélések és tippek' },
  { id: 'zene', name: 'zene-és-klipek', description: 'Kedvenc zenék és videók' }
];

const DEFAULT_VOICE_CHANNELS: VoiceChannel[] = [
  { id: 'hang-altalanos', name: 'Általános Hang', userLimit: 10 },
  { id: 'hang-gaming-1', name: 'Gaming 1 (Squad)', userLimit: 5 },
  { id: 'hang-chill', name: 'Chill & Dumcsi', userLimit: 15 }
];

export interface ServerData {
  textChannels: TextChannel[];
  voiceChannels: VoiceChannel[];
  activeTextChannel: string;
  setActiveTextChannel: (channelId: string) => void;
  messages: ChannelMessages;
  onlineUsers: PresenceUser[];
  voiceStates: VoiceStates;
  sendMessage: (text: string, attachments?: Attachment[]) => void;
}

// Csatornák, csevegőüzenetek, online felhasználók és hangszoba-állapotok
export function useServerData(socket: SocketLike, currentUserRef: RefObject<UserSummary | null>): ServerData {
  const [textChannels, setTextChannels] = useState(DEFAULT_TEXT_CHANNELS);
  const [voiceChannels, setVoiceChannels] = useState(DEFAULT_VOICE_CHANNELS);
  const [activeTextChannel, setActiveTextChannel] = useState('altalanos');
  const [messages, setMessages] = useState<ChannelMessages>({});
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [voiceStates, setVoiceStates] = useState<VoiceStates>({});

  useSocketEvents(socket, {
    'init:data': (data) => {
      if (!isRecord(data)) return;
      const channels = parseTextChannels(data.textChannels);
      const voice = parseVoiceChannels(data.voiceChannels);
      const channelMessages = parseChannelMessages(data.channelMessages);
      const states = parseVoiceStates(data.voiceStates);
      const users = parsePresenceList(data.onlineUsers);
      if (channels) setTextChannels(channels);
      if (voice) setVoiceChannels(voice);
      if (channelMessages) setMessages(channelMessages);
      if (states) setVoiceStates(states);
      if (users) setOnlineUsers(users);
    },
    'users:updated': (list) => {
      const users = parsePresenceList(list);
      if (users) setOnlineUsers(users);
    },
    'voice:states-updated': (value) => {
      const states = parseVoiceStates(value);
      if (states) setVoiceStates(states);
    },
    'chat:new-message': (value) => {
      const msg = parseChannelMessage(value);
      if (!msg) return;
      setMessages((prev) => ({
        ...prev,
        [msg.channelId]: [...(prev[msg.channelId] || []), msg]
      }));
      const me = currentUserRef.current;
      if (me && msg.senderId !== me.id) playMessageSound();
    },
    'voice:user-speaking': (value) => {
      if (!isRecord(value) || !isString(value.userId)) return;
      const { userId } = value;
      const isSpeaking = !!value.isSpeaking;
      setVoiceStates((prev) => {
        const next: VoiceStates = {};
        for (const [channelId, users] of Object.entries(prev)) {
          next[channelId] = users.map((u) => (u.id === userId ? { ...u, isSpeaking } : u));
        }
        return next;
      });
    },
    'speedtest:result-announced': (value) => {
      if (!isRecord(value) || !isString(value.userId)) return;
      const { userId } = value;
      const result = parseSpeedTestResult(value.result);
      setOnlineUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, speedTest: result } : u)));
    }
  });

  const sendMessage = (text: string, attachments: Attachment[] = []) => {
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
