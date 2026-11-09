import React, { useEffect, useRef } from 'react';
import { clampCamera, zoomAbout, centerOnWorld, screenToWorld } from './empireMath';
import {
  advance, updateFog, pickAt, boxSelect, selectionInfo, canPlace, isMine, isAllied, notify
} from './empireStore';
import { renderFrame } from './empireRender';
import { buildingSize, isBuilderKind } from './empireContent';

const EDGE = 16;
const PAN_SPEED = 760; // iso px per second at zoom 1
const MAX_IDS = 60;

function isTyping(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

// Isometric Canvas 2D view. All input handling and the render loop live here; tick data is read
// straight from the mutable store so React never re-renders per tick.
export default function EmpireCanvas25D({ store, onCommand }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const cmdRef = useRef(onCommand);
  cmdRef.current = onCommand;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    const view = { vw: 1, vh: 1, dpr: 1, ghost: null, ghostFootprint: null, hoverTarget: null, box: null };
    const mouse = { x: 0, y: 0, inside: false, moved: false };
    const keys = new Set();
    const wp = { x: 0, y: 0 };
    const ghostObj = { i: -1, o: 0, k: '', x: 0, y: 0, size: 2, bp: 100, hp: 1, mhp: 1, flash: 0 };
    const ghostFp = { x: 0, y: 0, size: 2, ok: false };
    let drag = null;
    let lastClick = { t: 0, k: null };
    let raf = 0;
    let last = performance.now();
    let fogAt = 0;
    const groups = store.groups || (store.groups = {});

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      view.vw = Math.max(1, Math.floor(r.width));
      view.vh = Math.max(1, Math.floor(r.height));
      view.dpr = dpr;
      canvas.width = Math.floor(view.vw * dpr);
      canvas.height = Math.floor(view.vh * dpr);
      canvas.style.width = `${view.vw}px`;
      canvas.style.height = `${view.vh}px`;
      store.viewport = { w: view.vw, h: view.vh };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const placeAnchor = () => {
      const kind = store.ui.placing;
      const size = buildingSize(store.content, kind);
      screenToWorld(store.camera, view.vw, view.vh, mouse.x, mouse.y, wp);
      return { size, x: Math.round(wp.x - size / 2), y: Math.round(wp.y - size / 2) };
    };

    const ownUnits = () => selectionInfo(store).units.filter((u) => isMine(store, u.o));

    const sendOrder = (sx, sy) => {
      const sel = selectionInfo(store);
      const units = sel.units.filter((u) => isMine(store, u.o));
      screenToWorld(store.camera, view.vw, view.vh, sx, sy, wp);
      const mw = store.map.w, mh = store.map.h;
      const gx = Math.max(0.5, Math.min(mw - 0.5, wp.x));
      const gy = Math.max(0.5, Math.min(mh - 0.5, wp.y));
      if (units.length) {
        const ids = units.slice(0, MAX_IDS).map((u) => u.i);
        const pick = pickAt(store, view.vw, view.vh, sx, sy);
        if (pick && pick.kind !== 'node' && !isAllied(store, pick.e.o)) {
          cmdRef.current('attack', { unitIds: ids, target: { entityId: pick.e.i } });
          return;
        }
        if (pick && pick.kind === 'node') {
          const gatherers = units.filter((u) => u.k === 'scavenger');
          const use = (gatherers.length ? gatherers : units).slice(0, MAX_IDS).map((u) => u.i);
          cmdRef.current('gather', { unitIds: use, target: { nodeId: pick.e.i } });
          return;
        }
        if (pick && pick.kind === 'building' && isAllied(store, pick.e.o) && (pick.e.bp < 100 || pick.e.hp < pick.e.mhp)) {
          const builders = units.filter((u) => isBuilderKind(u.k));
          const use = (builders.length ? builders : units).slice(0, MAX_IDS).map((u) => u.i);
          cmdRef.current('repair', { unitIds: use, target: { entityId: pick.e.i } });
          return;
        }
        cmdRef.current('move', { unitIds: ids, target: { x: +gx.toFixed(2), y: +gy.toFixed(2) } });
        store.moveMarks.push({ x: gx, y: gy, t0: store.time, color: '#28C997' });
        return;
      }
      const mine = sel.buildings.filter((b) => isMine(store, b.o));
      if (mine.length) {
        for (const b of mine.slice(0, 10)) cmdRef.current('set-rally', { buildingId: b.i, target: { x: +gx.toFixed(2), y: +gy.toFixed(2) } });
        store.moveMarks.push({ x: gx, y: gy, t0: store.time, color: '#536CFF' });
      }
    };

    const clickSelect = (sx, sy, additive) => {
      const pick = pickAt(store, view.vw, view.vh, sx, sy);
      const now = performance.now();
      if (!pick) { if (!additive) store.selection.clear(); return; }
      const id = pick.e.i;
      // double click selects every visible own unit of the same type
      if (pick.kind === 'unit' && isMine(store, pick.e.o) && lastClick.k === pick.e.k && now - lastClick.t < 320) {
        store.selection.clear();
        const tmp = { x: 0, y: 0 };
        for (const u of store.units.values()) {
          if (u.k !== pick.e.k || !isMine(store, u.o)) continue;
          const ix = (u.x - u.y) * 32, iy = (u.x + u.y) * 16;
          tmp.x = (ix - store.camera.x) * store.camera.zoom + view.vw / 2;
          tmp.y = (iy - store.camera.y) * store.camera.zoom + view.vh / 2;
          if (tmp.x >= 0 && tmp.x <= view.vw && tmp.y >= 0 && tmp.y <= view.vh) store.selection.add(u.i);
        }
        lastClick = { t: 0, k: null };
        return;
      }
      lastClick = { t: now, k: pick.kind === 'unit' ? pick.e.k : null };
      const sameKind = (a) => (a ? isMine(store, a.o) && a.dx !== undefined : false);
      if (additive && pick.kind === 'unit' && isMine(store, pick.e.o) && [...store.selection].every((s) => sameKind(store.units.get(s)))) {
        if (store.selection.has(id)) store.selection.delete(id); else store.selection.add(id);
      } else {
        store.selection.clear();
        store.selection.add(id);
      }
    };

    const onPointerDown = (e) => {
      mouse.x = e.offsetX; mouse.y = e.offsetY; mouse.inside = true;
      canvas.setPointerCapture?.(e.pointerId);
      if (e.button === 1) { drag = { mode: 'pan', lx: e.clientX, ly: e.clientY, id: e.pointerId }; e.preventDefault(); return; }
      if (e.button === 2) {
        if (store.ui.placing) { store.ui.placing = null; return; }
        sendOrder(e.offsetX, e.offsetY);
        return;
      }
      if (e.button !== 0) return;
      if (store.ui.placing) {
        const a = placeAnchor();
        if (!canPlace(store, store.ui.placing, a.x, a.y)) { notify(store, 'Ide nem építhetsz.', 'alert'); return; }
        const builders = ownUnits().filter((u) => isBuilderKind(u.k));
        if (!builders.length) { notify(store, 'Válassz ki egy Építő Mestert az építéshez.', 'alert'); return; }
        cmdRef.current('build', { unitIds: builders.slice(0, MAX_IDS).map((u) => u.i), building: store.ui.placing, target: { x: a.x, y: a.y } });
        if (!e.shiftKey) store.ui.placing = null;
        return;
      }
      if (e.pointerType === 'touch') { drag = { mode: 'touchpan', lx: e.clientX, ly: e.clientY, sx: e.offsetX, sy: e.offsetY, moved: 0, id: e.pointerId }; return; }
      drag = { mode: 'box', x0: e.offsetX, y0: e.offsetY, id: e.pointerId };
    };

    const onPointerMove = (e) => {
      mouse.x = e.offsetX; mouse.y = e.offsetY; mouse.inside = true; mouse.moved = true;
      if (!drag) return;
      if (drag.mode === 'pan' || drag.mode === 'touchpan') {
        const z = store.camera.zoom;
        store.camera.x -= (e.clientX - drag.lx) / z;
        store.camera.y -= (e.clientY - drag.ly) / z;
        if (drag.mode === 'touchpan') drag.moved += Math.abs(e.clientX - drag.lx) + Math.abs(e.clientY - drag.ly);
        drag.lx = e.clientX; drag.ly = e.clientY;
      } else if (drag.mode === 'box') {
        if (Math.hypot(e.offsetX - drag.x0, e.offsetY - drag.y0) > 5) view.box = { x0: drag.x0, y0: drag.y0, x1: e.offsetX, y1: e.offsetY };
      }
    };

    const onPointerUp = (e) => {
      canvas.releasePointerCapture?.(e.pointerId);
      const d = drag;
      drag = null;
      if (!d) return;
      if (d.mode === 'touchpan') {
        if (d.moved < 8) {
          const pick = pickAt(store, view.vw, view.vh, d.sx, d.sy);
          if (ownUnits().length && !(pick && pick.kind === 'unit' && isMine(store, pick.e.o))) sendOrder(d.sx, d.sy);
          else clickSelect(d.sx, d.sy, false);
        }
        return;
      }
      if (d.mode !== 'box') return;
      if (view.box) {
        const ids = boxSelect(store, view.vw, view.vh, view.box.x0, view.box.y0, view.box.x1, view.box.y1);
        if (!e.shiftKey) store.selection.clear();
        for (const id of ids) store.selection.add(id);
        view.box = null;
      } else clickSelect(e.offsetX, e.offsetY, e.shiftKey);
    };

    const onLeave = () => { mouse.inside = false; };
    const onWheel = (e) => {
      e.preventDefault();
      zoomAbout(store.camera, view.vw, view.vh, e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0012));
    };
    const onContext = (e) => e.preventDefault();

    const onKeyDown = (e) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (/^[1-9]$/.test(k)) { groups[k] = [...store.selection]; e.preventDefault(); }
        return;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); return; }
      if (/^[1-9]$/.test(k) && groups[k]) {
        store.selection.clear();
        for (const id of groups[k]) if (store.units.has(id) || store.buildings.has(id)) store.selection.add(id);
        return;
      }
      if (k === 'escape') { store.ui.placing = null; store.selection.clear(); return; }
      if (k === 'h') {
        for (const b of store.buildings.values()) if (isMine(store, b.o) && b.k === 'townCenter') { centerOnWorld(store.camera, b.x + b.size / 2, b.y + b.size / 2); return; }
      }
      if (k === 'x') {
        const ids = ownUnits().slice(0, MAX_IDS).map((u) => u.i);
        if (ids.length) cmdRef.current('stop', { unitIds: ids });
      }
    };
    const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
    const onBlur = () => keys.clear();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!store.map.w) { renderFrame(ctx, store, view); return; }
      const cam = store.camera;

      if (!store.cameraReady) { // first frame of a match: look at our base
        let b = null;
        for (const x of store.buildings.values()) if (isMine(store, x.o)) { if (!b || x.k === 'townCenter') b = x; }
        const u = !b && [...store.units.values()].find((x) => isMine(store, x.o));
        if (b) centerOnWorld(cam, b.x + b.size / 2, b.y + b.size / 2);
        else if (u) centerOnWorld(cam, u.x, u.y);
        else centerOnWorld(cam, store.map.w / 2, store.map.h / 2);
        cam.zoom = 1;
        store.cameraReady = true;
      }

      advance(store, dt);
      if (now - fogAt > 200) { fogAt = now; updateFog(store); }

      // camera pan: keys + screen-edge scrolling
      let px = 0, py = 0;
      if (keys.has('a') || keys.has('arrowleft')) px -= 1;
      if (keys.has('d') || keys.has('arrowright')) px += 1;
      if (keys.has('w') || keys.has('arrowup')) py -= 1;
      if (keys.has('s') || keys.has('arrowdown')) py += 1;
      if (mouse.inside && !drag && document.hasFocus()) {
        if (mouse.x < EDGE) px -= 1; else if (mouse.x > view.vw - EDGE) px += 1;
        if (mouse.y < EDGE) py -= 1; else if (mouse.y > view.vh - EDGE) py += 1;
      }
      if (px || py) {
        const sp = PAN_SPEED / cam.zoom * dt;
        cam.x += px * sp; cam.y += py * sp * 0.6;
      }
      clampCamera(cam, store.map.w, store.map.h);

      // hover and placement ghost
      view.hoverTarget = null;
      view.ghost = null; view.ghostFootprint = null;
      if (mouse.inside && !drag) {
        if (store.ui.placing) {
          const a = placeAnchor();
          ghostFp.x = a.x; ghostFp.y = a.y; ghostFp.size = a.size;
          ghostFp.ok = canPlace(store, store.ui.placing, a.x, a.y);
          view.ghostFootprint = ghostFp;
          Object.assign(ghostObj, { o: store.you.idx, k: store.ui.placing, x: a.x, y: a.y, size: a.size });
          view.ghost = ghostObj;
          canvas.style.cursor = 'copy';
        } else {
          const pick = pickAt(store, view.vw, view.vh, mouse.x, mouse.y);
          view.hoverTarget = pick ? pick.e : null;
          const hasUnits = store.selection.size > 0;
          canvas.style.cursor = pick && hasUnits && pick.kind !== 'node' && !isAllied(store, pick.e.o) ? 'crosshair' : pick ? 'pointer' : 'default';
        }
      }
      renderFrame(ctx, store, view);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [store]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" style={{ background: '#05060f', touchAction: 'none' }}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
