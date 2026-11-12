import React, { type FormEvent } from 'react';

interface NewBoardModalProps {
  /** Placeholder name suggestion (the user's name). */
  username: string | undefined;
  title: string;
  onTitleChange: (title: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}

// Új rajztábla indítása: név megadása
export default function NewBoardModal({ username, title, onTitleChange, onCreate, onCancel }: NewBoardModalProps) {
  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    onCreate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4">
      <div className="bg-shark-panel border border-shark-card p-6 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-shark-text mb-2">
          Új Rajztábla Indítása
        </h3>
        <p className="text-xs text-shark-muted mb-4">
          Adj meg egy nevet a rajztáblának. Mindenki látni fogja és bele tud rajzolni.
        </p>
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={`Pl. ${username} Rajza, Skribbl, Tervezés...`}
            autoFocus
            className="w-full bg-shark-panel text-shark-text px-3.5 py-2.5 rounded-lg outline-none border border-shark-purple/30 focus:border-shark-purple text-sm font-medium"
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded text-xs font-semibold text-shark-muted hover:text-white transition"
            >
              Mégse
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-shark-green hover:opacity-90 text-white text-xs font-semibold transition shadow"
            >
              Indítás
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
