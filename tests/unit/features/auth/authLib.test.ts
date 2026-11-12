import { describe, it, expect } from 'vitest';
import { avatarFileError, uploadedUrlOf } from '../../../../src/features/auth/lib/avatarUpload';
import { errorTextOf, parseAuthSuccess } from '../../../../src/features/auth/types';

describe('avatarFileError', () => {
  it('accepts images up to 8 MB and rejects other files', () => {
    expect(avatarFileError({ type: 'image/png', size: 8 * 1024 * 1024 })).toBeNull();
    expect(avatarFileError({ type: 'image/png', size: 8 * 1024 * 1024 + 1 })).toBe('A profilkép mérete maximum 8MB lehet!');
    expect(avatarFileError({ type: 'application/pdf', size: 10 })).toBe('Csak képfájl tölthető fel profilképnek!');
  });
});

describe('uploadedUrlOf', () => {
  it('returns the first file url of a successful upload', () => {
    expect(uploadedUrlOf({ ok: true, files: [{ url: '/uploads/a.png' }, { url: '/b' }] })).toEqual({ url: '/uploads/a.png' });
  });
  it('returns null for failed or empty uploads', () => {
    expect(uploadedUrlOf({ ok: false, files: [{ url: '/a' }] })).toBeNull();
    expect(uploadedUrlOf({ ok: true, files: [] })).toBeNull();
    expect(uploadedUrlOf('nope')).toBeNull();
  });
});

describe('auth payloads', () => {
  it('parses auth:success with or without a token', () => {
    const user = { id: 'u1', username: 'Anna', avatarColor: '#fff' };
    expect(parseAuthSuccess({ user, token: 't' })).toEqual({ user, token: 't' });
    expect(parseAuthSuccess({ user })).toEqual({ user, token: undefined });
    expect(parseAuthSuccess({ user: { username: 'x' } })).toBeNull();
  });
  it('reads error texts', () => {
    expect(errorTextOf({ error: 'Hibás jelszó' })).toBe('Hibás jelszó');
    expect(errorTextOf({})).toBeNull();
  });
});
