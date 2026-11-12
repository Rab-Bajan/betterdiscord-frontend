// Profilkép feltöltése a szerverre (/api/upload). A hibák magyar, felhasználónak szóló szövegek.
import { isRecord, stringField } from '../../../shared/lib/guards';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

export type AvatarUploadResult = { ok: true; url: string | undefined } | { ok: false; error: string };

/** Why the file cannot be a profile picture, or null when it can. */
export function avatarFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!file.type.startsWith('image/')) return 'Csak képfájl tölthető fel profilképnek!';
  if (file.size > MAX_AVATAR_BYTES) return 'A profilkép mérete maximum 8MB lehet!';
  return null;
}

/** The url of the first uploaded file in an upload response, or null when the upload failed. */
export function uploadedUrlOf(data: unknown): { url: string | undefined } | null {
  if (!isRecord(data) || !data.ok || !Array.isArray(data.files) || data.files.length === 0) return null;
  return { url: stringField(data.files[0], 'url') };
}

export async function uploadAvatar(file: File): Promise<AvatarUploadResult> {
  try {
    const formData = new FormData();
    formData.append('files', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const uploaded = uploadedUrlOf(await res.json());
    return uploaded ? { ok: true, url: uploaded.url } : { ok: false, error: 'Hiba történt a kép feltöltése során.' };
  } catch (err) {
    console.error('Avatar upload error:', err);
    return { ok: false, error: 'Nem sikerült feltölteni a profilképet.' };
  }
}
