import React, { type FormEvent } from 'react';
import { Keyboard } from 'lucide-react';

interface BrowserTextInputModalProps {
  customText: string;
  setCustomText: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

// Szövegbeviteli modál (vágólap vagy kényelmi gépelés)
export default function BrowserTextInputModal({ customText, setCustomText, onSubmit, onClose }: BrowserTextInputModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 rounded-2xl shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95"
        style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.25)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-[#7655F5]" />
            <h3 className="font-bold text-sm text-[#F4F3FF]">Szöveg beillesztése a böngészőbe</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[#999BBE] hover:text-white">✕</button>
        </div>
        <p className="text-xs text-[#999BBE]">
          A beírt vagy beillesztett szöveg közvetlenül a fókuszban lévő beviteli mezőbe kerül.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Írd be vagy másold be ide a szöveget..."
            rows={3}
            autoFocus
            className="w-full p-3 rounded-xl text-sm outline-none resize-none font-medium"
            style={{ background: '#101329', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#999BBE]"
            >
              Mégse
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow"
              style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
            >
              Beillesztés
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
