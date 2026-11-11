import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

// A Clipboard API csak biztonságos környezetben érhető el, ezért kell a régi módszer tartaléknak
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // tartalék módszerrel próbálkozunk
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function CopyButton({ text, title = 'Másolás', className = '', iconClassName = 'w-3.5 h-3.5', label }) {
  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = async (e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    setStatus(ok ? 'copied' : 'failed');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('idle'), 1500);
  };

  const shownTitle = status === 'copied' ? 'Másolva!' : status === 'failed' ? 'Nem sikerült másolni' : title;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={shownTitle}
      aria-label={shownTitle}
      className={`inline-flex items-center gap-1 transition ${className}`}
      style={{ color: status === 'copied' ? '#28C997' : status === 'failed' ? '#E94B64' : undefined }}
    >
      {status === 'copied' ? <Check className={iconClassName} /> : <Copy className={iconClassName} />}
      {label && <span>{status === 'copied' ? 'Másolva!' : label}</span>}
    </button>
  );
}
