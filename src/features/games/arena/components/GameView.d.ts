// Type declaration for the (still JavaScript) arena view, so typed callers can pass real props.
import type { JSX } from 'react';
import type { Socket } from 'socket.io-client';
import type { PresenceUser } from '../../../../shared/types';

export interface GameViewProps {
  socket: Socket;
  channelId: string | undefined;
  isAdmin?: boolean;
  participants?: PresenceUser[];
  setPeerVolume?: (peerId: string, volume: number) => void;
}

export default function GameView(props: GameViewProps): JSX.Element;
