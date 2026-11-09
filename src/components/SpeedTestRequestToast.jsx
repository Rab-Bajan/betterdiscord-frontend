import React from 'react';
import { Activity, X } from 'lucide-react';

// Értesítés, ha valaki sebességtesztet kért tőlünk
export default function SpeedTestRequestToast({ requesterName, onAccept, onDismiss }) {
  return (
    <div
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 sm:max-w-md z-50 p-4 rounded-2xl shadow-2xl flex flex-wrap items-center gap-3 animate-bounce"
      style={{ background: '#101329', border: '1px solid #7655F5', boxShadow: '0 8px 30px rgba(118, 85, 245, 0.3)' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(118, 85, 245, 0.2)', color: '#7655F5' }}
      >
        <Activity className="w-6 h-6 animate-pulse" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold" style={{ color: '#F4F3FF' }}>
          {requesterName} sebességtesztet kért tőled!
        </div>
        <div className="text-xs" style={{ color: '#999BBE' }}>
          Mérd le a netedet és oszd meg az eredményt!
        </div>
      </div>
      <div className="flex items-center gap-2 sm:ml-2">
        <button
          onClick={onAccept}
          className="px-3 py-2 rounded-xl text-white text-xs font-semibold transition"
          style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
        >
          Mérés Most
        </button>
        <button
          onClick={onDismiss}
          className="p-2 rounded-xl text-xs transition"
          style={{ color: '#999BBE' }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#F4F3FF')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#999BBE')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
