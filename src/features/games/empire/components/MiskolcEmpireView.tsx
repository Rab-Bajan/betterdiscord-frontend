import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { X } from 'lucide-react';
import type { CurrentUser } from '../../../../shared/types';
import type { RoomSession } from '../../../voice-room/types';
import { useEmpireMatch } from '../hooks/useEmpireMatch';
import type { EmpireSocket } from '../hooks/useEmpireMatch';
import EmpireCanvas3D from './EmpireCanvas3D';
import EmpireHud, { GLASS } from './EmpireHud';
import EmpireLobby from './EmpireLobby';
import EmpireTechTreeModal from './EmpireTechTreeModal';

// Container: lobby list / waiting room, running match and tech tree. Works standalone (menu item)
// and inside a voice room (channelId set). The match keeps running on the server when this unmounts;
// the stored rejoin token resumes it on the next mount.
export interface MiskolcEmpireViewProps {
  socket: EmpireSocket;
  currentUser: CurrentUser | null;
  channelId?: string | null | undefined;
  channelSession?: RoomSession | null | undefined;
  onClose?: (() => void) | undefined;
}

export default function MiskolcEmpireView({ socket, currentUser, channelId = null, channelSession = null, onClose }: MiskolcEmpireViewProps): JSX.Element {
  const m = useEmpireMatch(socket);
  const [techOpen, setTechOpen] = useState(false);
  const { error, setError, store } = m;

  useEffect(() => {
    if (!error) return undefined;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error, setError]);

  const inGame = m.phase === 'playing' || m.phase === 'ended';

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full relative overflow-hidden" style={{ background: '#090A18', color: '#F4F3FF' }}>
      {inGame ? (
        <div className="flex-1 relative min-h-0">
          <EmpireCanvas3D store={store} onCommand={m.command} />
          <EmpireHud
            store={store}
            content={m.content}
            connected={m.connected}
            results={m.results}
            phase={m.phase}
            mode={m.current?.summary?.mode}
            onCommand={m.command}
            onResign={m.resign}
            onExit={onClose || m.leaveMatch}
            onBackToLobby={m.leaveMatch}
            onOpenTech={() => setTechOpen(true)}
            onDemolish={m.demolishBuilding}
            onChat={m.sendChat}
          />
        </div>
      ) : (
        <EmpireLobby
          m={m}
          channelId={channelId}
          channelSession={channelSession}
          currentUser={currentUser}
          onOpenTech={() => setTechOpen(true)}
          onClose={onClose}
        />
      )}

      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 pl-4 pr-2 py-2 rounded-2xl text-sm font-semibold shadow-xl" style={{ ...GLASS, color: '#ffb3c0', borderColor: 'rgba(233,75,100,0.6)' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
      )}

      {techOpen && (
        <EmpireTechTreeModal content={m.content} currentEpoch={store.res.epoch || 1} onClose={() => setTechOpen(false)} />
      )}
    </div>
  );
}
