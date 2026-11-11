// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveSocketUrl, SOCKET_URL, RTC_CONFIG, TOKEN_KEY, USER_KEY } from '../../../src/config';

describe('resolveSocketUrl', () => {
  it('points at backend :5000 over https when served from the :3000 dev server', () => {
    expect(resolveSocketUrl({ port: '3000', hostname: 'example.test', origin: 'http://example.test:3000' }))
      .toBe('https://example.test:5000');
  });

  it('uses the page origin for any other port', () => {
    expect(resolveSocketUrl({ port: '', hostname: 'chat.example', origin: 'https://chat.example' }))
      .toBe('https://chat.example');
    expect(resolveSocketUrl({ port: '5000', hostname: 'h', origin: 'https://h:5000' })).toBe('https://h:5000');
  });

  it('SOCKET_URL is derived from window.location (jsdom serves http://localhost:3000)', () => {
    expect(window.location.port).toBe('3000');
    expect(SOCKET_URL).toBe('https://localhost:5000');
  });
});

describe('static config', () => {
  it('RTC_CONFIG matches the original values', () => {
    expect(RTC_CONFIG).toEqual({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.services.mozilla.com' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });
  });

  it('storage keys are unchanged', () => {
    expect(TOKEN_KEY).toBe('sharkvoic_token');
    expect(USER_KEY).toBe('sharkvoic_user');
  });
});
