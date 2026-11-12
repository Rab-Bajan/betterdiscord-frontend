import React, { type FormEvent, type ReactNode } from 'react';

interface CodeNodeNameModalProps {
  title: ReactNode;
  description?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}

// Név megadása a fájlfában (új fájl/mappa vagy átnevezés)
export default function CodeNodeNameModal({ title, description, value, onChange, placeholder, submitLabel, onSubmit, onCancel }: CodeNodeNameModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4">
      <div className="bg-shark-panel border border-shark-card p-6 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-bold text-shark-text mb-2">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-shark-muted mb-4">
            {description}
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
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
              className="px-4 py-2 rounded bg-shark-purple hover:bg-shark-purple-dim text-white text-xs font-semibold transition shadow"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
