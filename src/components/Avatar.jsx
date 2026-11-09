import React, { useState } from 'react';

const SIZES = { xs: 20, sm: 28, md: 36, lg: 48, xl: 72, '2xl': 104 };

const STATUS_COLORS = {
  online: '#28C997',
  idle: '#F5B041',
  streaming: '#7655F5',
  muted: '#E94B64',
  offline: '#999BBE'
};

// The one avatar of the app. Accepts `user` ({ username, avatarUrl, avatarColor }) or the same three
// fields as props (explicit props win).
// size: a preset (xs 20, sm 28, md 36, lg 48, xl 72, 2xl 104), a pixel number, or 'fill' to take the
// parent's box. A failed image falls back to the letter and retries when avatarUrl changes.
// The speaking ring and status badge are overlays, so they never change the layout box.
export default function Avatar({
  user,
  username = user?.username,
  avatarUrl = user?.avatarUrl,
  avatarColor = user?.avatarColor,
  size = 'md',
  speaking = false,
  status = null,
  badgeBorderColor = '#101329',
  className = '',
  style,
  title
}) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = !!avatarUrl && avatarUrl !== failedUrl;
  const letter = (username || '?').trim().charAt(0).toUpperCase() || '?';

  const fill = size === 'fill';
  const px = fill ? null : (typeof size === 'number' ? size : SIZES[size] || SIZES.md);
  const boxStyle = fill ? { width: '100%', height: '100%' } : { width: px, height: px };
  const badge = px ? Math.max(8, Math.round(px * 0.28)) : 14;

  return (
    <span
      className={`relative inline-block flex-shrink-0 aspect-square align-middle ${className}`}
      style={{ ...boxStyle, ...style }}
      title={title ?? username}
    >
      <span
        className="flex items-center justify-center w-full h-full flex-shrink-0 aspect-square rounded-full overflow-hidden text-white font-bold select-none"
        style={{
          backgroundColor: avatarColor || '#7655F5',
          fontSize: px ? Math.max(9, Math.round(px * 0.42)) : undefined,
          containerType: fill ? 'size' : undefined
        }}
      >
        {showImage ? (
          <img
            src={avatarUrl}
            alt={username || ''}
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => setFailedUrl(avatarUrl)}
          />
        ) : (
          <span style={fill ? { fontSize: '42cqw' } : undefined}>{letter}</span>
        )}
      </span>
      {speaking && <span className="avatar-speaking" aria-hidden="true" />}
      {status && (
        <span
          className="absolute rounded-full"
          style={{
            right: 0,
            bottom: 0,
            width: badge,
            height: badge,
            backgroundColor: STATUS_COLORS[status] || STATUS_COLORS.online,
            border: `2px solid ${badgeBorderColor}`,
            boxSizing: 'border-box'
          }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
