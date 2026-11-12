import { useState, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useSocketEvents } from '../../../shared/hooks/useSocketEvents';
import { TOKEN_KEY, USER_KEY } from '../../../config';
import { isRecord } from '../../../shared/lib/guards';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import type { CurrentUser } from '../../../shared/types';
import { errorTextOf, isCurrentUser, parseAuthSuccess, type LoginRequest, type ProfileUpdate } from '../types';

const safeStorage = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* nincs tárhely */ } },
  remove: (k: string): void => { try { localStorage.removeItem(k); } catch { /* nincs tárhely */ } }
};

export interface AuthApi {
  currentUser: CurrentUser | null;
  currentUserRef: RefObject<CurrentUser | null>;
  isLoggedIn: boolean;
  authError: string | null;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: Dispatch<SetStateAction<boolean>>;
  profileError: string | null;
  login: (request: LoginRequest) => void;
  updateProfile: (update: ProfileUpdate) => void;
  logout: () => void;
}

export function useAuth(socket: SocketLike): AuthApi {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useSocketEvents(socket, {
    // Automatikus belépés mentett token alapján
    connect: () => {
      const token = safeStorage.get(TOKEN_KEY);
      if (token) socket.emit('auth:verify-token', { token });
    },
    'init:data': (data) => {
      if (!isRecord(data)) return;
      setCurrentUser(isCurrentUser(data.self) ? data.self : null);
    },
    'auth:success': (payload) => {
      const success = parseAuthSuccess(payload);
      if (!success) return;
      setCurrentUser(success.user);
      setIsLoggedIn(true);
      setAuthError(null);
      if (success.token) safeStorage.set(TOKEN_KEY, success.token);
    },
    'auth:error': (payload) => setAuthError(errorTextOf(payload)),
    'auth:token-invalid': () => {
      safeStorage.remove(TOKEN_KEY);
      setIsLoggedIn(false);
    },
    'user:profile-updated': (user) => {
      if (!isCurrentUser(user)) return;
      setCurrentUser((prev) => ({ ...prev, ...user }));
      setIsProfileModalOpen(false);
      setProfileError(null);
      safeStorage.set(USER_KEY, JSON.stringify(user));
    },
    'profile:error': (payload) => setProfileError(errorTextOf(payload))
  });

  const login = (request: LoginRequest) => {
    setAuthError(null);
    if (request.type === 'register') {
      const { username, password, avatarColor } = request;
      socket.emit('auth:register', { username, password, avatarColor });
    } else if (request.type === 'login') {
      const { username, password } = request;
      socket.emit('auth:login', { username, password });
    } else {
      const { username, avatarColor } = request;
      socket.emit('user:join', { username, avatarColor }); // vendég
      setIsLoggedIn(true);
    }
  };

  const updateProfile = ({ username, avatarColor, avatarUrl }: ProfileUpdate) => {
    setProfileError(null);
    socket.emit('user:update-profile', { username, avatarColor, avatarUrl });
  };

  const logout = () => {
    const token = safeStorage.get(TOKEN_KEY);
    if (token) socket.emit('auth:logout', { token });
    safeStorage.remove(TOKEN_KEY);
    setIsLoggedIn(false);
    setCurrentUser(null);
    window.location.reload();
  };

  return {
    currentUser,
    currentUserRef,
    isLoggedIn,
    authError,
    isProfileModalOpen,
    setIsProfileModalOpen,
    profileError,
    login,
    updateProfile,
    logout
  };
}
