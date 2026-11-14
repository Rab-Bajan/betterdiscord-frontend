// Kör alakú GPS-radar (spec 30): hexrács tisztaság szerinti színnel (zárt hex szürke), játékos-tűk
// látószög-kúppal, nyíl a mérleghez, iránytű. Újrahasználható: a teljes M térkép (Phase I) ugyanez
// nagyobb mérettel, `headingUp={false}`-szal.
import React, { useEffect, useRef } from 'react';
import { SWEEPERS_THEME as T, cleanlinessTone } from '../theme';
import { bearingDeg, clampToRim, compassLabel, projectToRadar, radarAngle, type RadarView } from '../lib/hud/radar';
import { hexCorner, hexToWorld } from '../lib/world/hexGrid';
import type { SweepersRadar } from '../lib/engine/SweepersGame';

interface GpsRadarProps {
  radar: SweepersRadar | null;
  /** Diameter in CSS pixels. */
  size?: number;
  /** World metres from the centre to the rim. */
  rangeM?: number;
  headingUp?: boolean;
}

const LOCKED = '#475569';

/** `#rrggbb` for alpha suffixes; any other CSS colour falls back to the vest orange. */
const hex6 = (color: string): string => (/^#[0-9a-f]{6}$/i.test(color) ? color : '#FF7A1A');

function drawCone(g: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, color: string): void {
  const spread = 0.42;
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  const grad = g.createLinearGradient(0, 0, 0, -length);
  grad.addColorStop(0, `${color}aa`);
  grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(Math.sin(-spread) * length, -Math.cos(spread) * length);
  g.lineTo(Math.sin(spread) * length, -Math.cos(spread) * length);
  g.closePath();
  g.fill();
  g.restore();
}

function drawPin(g: CanvasRenderingContext2D, x: number, y: number, color: string, self: boolean): void {
  g.beginPath();
  g.arc(x, y, self ? 4.5 : 3.5, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = self ? '#ffffff' : 'rgba(9, 10, 24, 0.9)';
  g.stroke();
}

export function paintRadar(g: CanvasRenderingContext2D, radar: SweepersRadar, size: number, rangeM: number, headingUp: boolean): void {
  const r = size / 2;
  const view: RadarView = { cx: radar.x, cz: radar.z, yaw: radar.yaw, rangeM, radiusPx: r, headingUp };
  g.clearRect(0, 0, size, size);
  g.save();
  g.translate(r, r);
  g.beginPath();
  g.arc(0, 0, r - 1, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = 'rgba(9, 10, 24, 0.78)';
  g.fillRect(-r, -r, size, size);

  for (const hex of radar.hexes) {
    const c = hexToWorld(hex.q, hex.r);
    const locked = !radar.unlocked.has(hex.district);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const corner = hexCorner(c.x, c.z, i);
      const p = projectToRadar(view, corner.x, corner.z);
      if (i === 0) g.moveTo(p.px, p.py);
      else g.lineTo(p.px, p.py);
    }
    g.closePath();
    const tone = locked ? LOCKED : cleanlinessTone(hex.cleanliness);
    g.fillStyle = `${tone}${locked ? '66' : '40'}`;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = `${tone}cc`;
    g.stroke();
  }

  // range rings
  g.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  for (const k of [0.33, 0.66]) {
    g.beginPath();
    g.arc(0, 0, r * k, 0, Math.PI * 2);
    g.stroke();
  }

  for (const p of radar.players) {
    const raw = projectToRadar(view, p.x, p.z);
    const at = clampToRim(raw, r);
    if (!at.clamped) drawCone(g, at.px, at.py, radarAngle(view, p.rotY), 16, hex6(p.color));
    drawPin(g, at.px, at.py, hex6(p.color), false);
  }

  if (radar.weighbridge) {
    const raw = projectToRadar(view, radar.weighbridge.x, radar.weighbridge.z);
    const at = clampToRim(raw, r, 10);
    if (!at.clamped) {
      g.fillStyle = T.orange;
      g.fillRect(raw.px - 4, raw.py - 3, 8, 6);
    }
    // arrow on the rim towards the weighbridge
    const angle = Math.atan2(raw.px, -raw.py);
    g.save();
    g.rotate(angle);
    g.translate(0, -(r - 9));
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(5, 3);
    g.lineTo(-5, 3);
    g.closePath();
    g.fillStyle = T.orange;
    g.fill();
    g.restore();
  }

  drawCone(g, 0, 0, radarAngle(view, radar.yaw), 26, hex6(radar.selfColor));
  drawPin(g, 0, 0, hex6(radar.selfColor), true);

  // north marker on the rim
  const north = projectToRadar(view, radar.x, radar.z - rangeM);
  const n = clampToRim(north, r, 9);
  g.fillStyle = T.red;
  g.font = '700 10px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('É', n.px, n.py);
  g.restore();

  g.beginPath();
  g.arc(r, r, r - 1, 0, Math.PI * 2);
  g.lineWidth = 2;
  g.strokeStyle = T.border;
  g.stroke();
}

export default function GpsRadar({ radar, size = 168, rangeM = 120, headingUp = true }: GpsRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !radar) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintRadar(g, radar, size, rangeM, headingUp);
  }, [radar, size, rangeM, headingUp]);

  const bearing = radar ? bearingDeg(radar.yaw) : 0;
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} aria-label="GPS-radar" role="img" />
      <div className="rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: 'rgba(16, 19, 41, 0.82)', border: `1px solid ${T.border}`, color: T.text }}>
        {compassLabel(bearing)} {Math.round(bearing)}°
      </div>
    </div>
  );
}
