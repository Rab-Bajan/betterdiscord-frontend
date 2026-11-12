import { useRef, useState, type RefObject } from 'react';
import { isRecord } from '../../../shared/lib/guards';
import type { Attachment } from '../../../shared/types';

export interface AttachmentUpload {
  pendingAttachments: Attachment[];
  isUploading: boolean;
  /** The hidden file input; cleared after every upload so the same file can be picked again. */
  fileInputRef: RefObject<HTMLInputElement>;
  uploadFiles: (fileList: FileList | null) => Promise<void>;
  removeAttachment: (id: string | undefined) => void;
  clearAttachments: () => void;
}

const parseUploadResponse = (data: unknown): Attachment[] | null =>
  isRecord(data) && data.ok && Array.isArray(data.files) ? data.files.filter(isRecord) : null;

// Fájlok feltöltése a backend /api/upload végpontjára; a feltöltöttek küldésig várakoznak
export function useAttachmentUpload(): AttachmentUpload {
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);

    setIsUploading(true);
    const formData = new FormData();
    filesArray.forEach((f) => {
      formData.append('files', f);
    });

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Hiba történt a fájlok feltöltésekor.');
      }

      const uploaded = parseUploadResponse(await response.json());
      if (uploaded) {
        setPendingAttachments((prev) => [...prev, ...uploaded]);
      }
    } catch (err) {
      console.error('[Upload Hiba]:', err);
      alert('Nem sikerült feltölteni a fájlt: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Csatolmány eltávolítása küldés előtt
  const removeAttachment = (id: string | undefined) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAttachments = () => setPendingAttachments([]);

  return { pendingAttachments, isUploading, fileInputRef, uploadFiles, removeAttachment, clearAttachments };
}
