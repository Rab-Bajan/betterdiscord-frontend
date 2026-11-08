const ID_ONLY = /^[a-zA-Z0-9_-]{11}$/;
const URL_RE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i;

export function extractYouTubeId(urlOrId) {
  if (!urlOrId) return '';
  const str = urlOrId.trim();
  if (ID_ONLY.test(str)) return str;
  const match = str.match(URL_RE);
  return match ? match[1] : '';
}

// A szerver által küldött állapot aktuális időkódja (a megérkezés óta eltelt idővel korrigálva)
export function getLiveTime(state) {
  if (!state) return 0;
  const base = state.currentTime || 0;
  if (!state.isPlaying || !state.receivedAt) return base;
  return base + Math.max(0, (Date.now() - state.receivedAt) / 1000);
}
