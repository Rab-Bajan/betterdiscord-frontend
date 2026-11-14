import React, { useEffect, useState } from 'react';
import { SWEEPERS_THEME as T } from '../theme';

/** One line every 60 ms (E.7); the strip stays this long after the last line. */
export const RECEIPT_LINE_MS = 60;
export const RECEIPT_HOLD_MS = 8000;

interface ReceiptPrinterProps {
  lines: readonly string[];
  onDone: () => void;
}

/** The weigher's paper receipt (88): a monospace DOM strip that prints line by line. */
export default function ReceiptPrinter({ lines, onDone }: ReceiptPrinterProps) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const timer = setInterval(() => setShown((n) => Math.min(lines.length, n + 1)), RECEIPT_LINE_MS);
    const done = setTimeout(onDone, lines.length * RECEIPT_LINE_MS + RECEIPT_HOLD_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(done);
    };
  }, [lines, onDone]);
  return (
    <div className="absolute right-4 bottom-28 z-20 pointer-events-none" role="status" aria-label="Mérlegjegy">
      <div className="w-72 px-3 py-2 text-[11px] leading-snug shadow-lg" style={{ background: '#F4F1E8', color: '#1b1b1b', fontFamily: '"Courier New", ui-monospace, monospace', borderTop: `3px dashed ${T.muted}` }}>
        {lines.slice(0, shown).map((line, i) => (
          <div key={i} className={i === 0 || line.startsWith('Összesen') ? 'font-bold' : undefined} style={i > 0 ? { borderBottom: '1px dotted #b9b3a3' } : undefined}>{line}</div>
        ))}
      </div>
    </div>
  );
}
