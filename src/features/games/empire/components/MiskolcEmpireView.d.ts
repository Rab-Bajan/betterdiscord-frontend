// Type declaration for the (still JavaScript) MiskolcEmpire view, so typed callers can pass real props.
import type { JSX } from 'react';
import type { Socket } from 'socket.io-client';
import type { CurrentUser } from '../../../../shared/types';
import type { RoomSession } from '../../../voice-room/types';

export interface MiskolcEmpireViewProps {
  socket: Socket;
  currentUser: CurrentUser | null;
  channelId?: string | null | undefined;
  channelSession?: RoomSession | null | undefined;
  onClose: () => void;
}

export default function MiskolcEmpireView(props: MiskolcEmpireViewProps): JSX.Element;
