import { useState, useRef } from 'react';
import { useSocketEvents } from './useSocketEvents';
import { TOKEN_KEY, USER_KEY } from '../config';

const safeStorage = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  remove: (k) => { try { localStorage.removeItem(k); } catch (e) {} }
};

export function useAuth(socket) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useSocketEvents(socket, {
    // Automatikus belépés mentett token alapján
    connect: () => {
      const token = safeStorage.get(TOKEN_KEY);
      if (token) socket.emit('auth:verify-token', { token });
    },
    'init:data': (data) => setCurrentUser(data.self),
    'auth:success': ({ user, token }) => {
      setCurrentUser(user);
      setIsLoggedIn(true);
      setAuthError(null);
      if (token) safeStorage.set(TOKEN_KEY, token);
    },
    'auth:error': ({ error }) => setAuthError(error),
    'auth:token-invalid': () => {
      safeStorage.remove(TOKEN_KEY);
      setIsLoggedIn(false);
    },
    'user:profile-updated': (user) => {
      setCurrentUser((prev) => ({ ...prev, ...user }));
      setIsProfileModalOpen(false);
      setProfileError(null);
      safeStorage.set(USER_KEY, JSON.stringify(user));
    },
    'profile:error': ({ error }) => setProfileError(error)
  });

  const login = ({ type, username, password, avatarColor }) => {
    setAuthError(null);
    if (type === 'register') {
      socket.emit('auth:register', { username, password, avatarColor });
    } else if (type === 'login') {
      socket.emit('auth:login', { username, password });
    } else {
      socket.emit('user:join', { username, avatarColor }); // vendég
      setIsLoggedIn(true);
    }
  };

  const updateProfile = ({ username, avatarColor, avatarUrl }) => {
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
