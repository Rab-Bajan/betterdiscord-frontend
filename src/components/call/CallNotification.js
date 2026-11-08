// Böngésző (OS) értesítés bejövő híváshoz, ha az alkalmazás háttérben / minimalizálva van.
// Fontos: az alkalmazás teljes bezárása után csak Web Push + service worker tudna értesíteni;
// ezt itt nem ígérjük (nincs push-infrastruktúra).
let current = null;

export function requestNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (e) { /* nem támogatott */ }
}

export function notifyIncomingCall(caller, callId) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    closeIncomingNotification();
    current = new Notification(`Bejövő hanghívás – ${caller.username}`, {
      body: 'Kattints az alkalmazás megnyitásához és a hívás fogadásához.',
      tag: `call-${callId}`,
      requireInteraction: true,
      silent: true, // a saját csengőhangunk szól
      icon: caller.avatarUrl || undefined
    });
    current.onclick = () => {
      window.focus();
      current?.close();
    };
  } catch (e) { /* ignore */ }
}

export function closeIncomingNotification() {
  try { current?.close(); } catch (e) { /* ignore */ }
  current = null;
}
