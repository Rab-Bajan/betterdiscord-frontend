import { describe, it, expect } from 'vitest';
import { tuneOpusSdp } from '../../../../src/features/call/lib/sdp';

const WANTED = 'minptime=10;useinbandfec=1;usedtx=0;cbr=0;stereo=0;sprop-stereo=0;maxplaybackrate=48000;sprop-maxcapturerate=48000;maxaveragebitrate=64000';
const fmtpOf = (sdp: string, pt: string) => sdp.split('\r\n').find((l) => l.startsWith(`a=fmtp:${pt} `));
const paramsOf = (line: string | undefined) =>
  Object.fromEntries((line ?? '').replace(/^a=fmtp:\d+ /, '').split(';').map((kv) => kv.split('=') as [string, string]));

describe('tuneOpusSdp', () => {
  it('merges the wanted Opus params into an existing fmtp line, overriding and keeping extra params', () => {
    const sdp = ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 0', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=20;useinbandfec=0;custom=x', 'a=rtpmap:0 PCMU/8000', ''].join('\r\n');
    const out = tuneOpusSdp(sdp, 64000);
    expect(paramsOf(fmtpOf(out, '111'))).toEqual({ ...paramsOf(`a=fmtp:111 ${WANTED}`), custom: 'x' });
    expect(fmtpOf(out, '111')).toBe(`a=fmtp:111 minptime=10;useinbandfec=1;custom=x;${WANTED.split(';').slice(2).join(';')}`);
    expect(out.split('\r\n')).toHaveLength(sdp.split('\r\n').length);
  });

  it('inserts an fmtp line right after the rtpmap when there is none, and normalises to CRLF', () => {
    const sdp = 'v=0\nm=audio 9 RTP 109\na=rtpmap:109 OPUS/48000/2\na=rtcp-fb:109 nack';
    const out = tuneOpusSdp(sdp, 32000);
    expect(out.split('\r\n')).toEqual(['v=0', 'm=audio 9 RTP 109', 'a=rtpmap:109 OPUS/48000/2', `a=fmtp:109 ${WANTED.replace('64000', '32000')}`, 'a=rtcp-fb:109 nack']);
  });

  it('keeps "=" inside existing values', () => {
    const out = tuneOpusSdp('a=rtpmap:96 opus/48000/2\r\na=fmtp:96 x=a=b', 64000);
    expect(paramsOf(fmtpOf(out, '96')).x).toBe('a');
    expect(fmtpOf(out, '96')).toContain('x=a=b;');
  });

  it('returns the SDP unchanged without Opus or on unexpected input', () => {
    const pcmu = 'v=0\r\na=rtpmap:0 PCMU/8000';
    expect(tuneOpusSdp(pcmu, 64000)).toBe(pcmu);
    expect(tuneOpusSdp('', 64000)).toBe('');
    expect(tuneOpusSdp(null as unknown as string, 64000)).toBeNull();
  });
});
