// Opus beállítás az SDP-ben. A fmtp sor azt írja le, amit a *helyi* oldal fogadni szeretne a másiktól,
// ezért mindkét fél a saját local description-jét módosítja. Ha bármi nem várt, az eredeti SDP marad.

const OPUS_PARAMS = (maxBitrate: number): Record<string, string> => ({
  minptime: '10',
  useinbandfec: '1',            // csomagvesztés elleni beépített redundancia (in-band FEC)
  usedtx: '0',                  // nincs DTX: nem vág be a beszéd eleje, nem "lélegzik" a háttérzaj
  cbr: '0',                     // változó bitráta: hatékonyabb és természetesebb
  stereo: '0',
  'sprop-stereo': '0',          // a beszéd mono; a bitráta a minőségre megy
  maxplaybackrate: '48000',     // fullband (20 kHz) lejátszás, ha mindkét fél támogatja
  'sprop-maxcapturerate': '48000',
  maxaveragebitrate: String(maxBitrate)
});

export function tuneOpusSdp(sdp: string, maxBitrate: number): string {
  try {
    const lines = sdp.split(/\r?\n/);
    const rtpmap = lines.find((l) => /^a=rtpmap:\d+ opus\/48000/i.test(l));
    if (!rtpmap) return sdp;
    // rtpmap matched /^a=rtpmap:\d+/ above, so the payload type is always present
    const pt = /^a=rtpmap:(\d+)/.exec(rtpmap)?.[1];
    if (pt === undefined) return sdp;

    const wanted = OPUS_PARAMS(maxBitrate);
    const fmtpIdx = lines.findIndex((l) => l.startsWith(`a=fmtp:${pt} `));
    const fmtpLine = lines[fmtpIdx];
    if (fmtpIdx >= 0 && fmtpLine !== undefined) {
      const existing: Record<string, string> = {};
      fmtpLine.slice(`a=fmtp:${pt} `.length).split(';').forEach((kv) => {
        const [k = '', ...v] = kv.split('=');
        if (k.trim()) existing[k.trim()] = v.join('=');
      });
      const merged = { ...existing, ...wanted };
      lines[fmtpIdx] = `a=fmtp:${pt} ${Object.entries(merged).map(([k, v]) => `${k}=${v}`).join(';')}`;
    } else {
      const rtpmapIdx = lines.indexOf(rtpmap);
      lines.splice(rtpmapIdx + 1, 0, `a=fmtp:${pt} ${Object.entries(wanted).map(([k, v]) => `${k}=${v}`).join(';')}`);
    }
    return lines.join('\r\n');
  } catch (e) {
    return sdp;
  }
}
