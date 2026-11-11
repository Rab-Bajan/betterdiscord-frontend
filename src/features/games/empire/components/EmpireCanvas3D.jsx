import React, { useEffect, useRef } from 'react';
import { clampCamera, centerOnWorld, stepCameraGoal, panDelta, MIN_PITCH, MAX_PITCH } from '../lib/empireMath';
import {
  advance, updateFog, pickAt, boxSelect, visibleOfKind, selectionInfo, canPlace, upgradeTargetAt, isMine, isAllied, isNeutral, notify,
  saveGroup, selectGroup, groupCenter, cueAsszonyVoice
} from '../lib/empireStore';
import { buildingSize, isBuilderKind, nextUpgradeDef, reqEpoch, canAfford } from '../lib/empireContent';
import { createEmpireScene } from '../lib/empire3d/scene';
import { playEmpireSfx } from '../lib/empireAudio';

const EDGE = 14;
const MAX_IDS = 60;
const SIPHON_TARGETS = new Set(['scrapYard', 'townCenter']);
const DOUBLE_TAP_MS = 350;
const PAN_THRESHOLD = 6; // px of left-drag movement before it counts as a pan instead of a click

function isTyping(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

// Three.js RTS view. Input handling and the render loop live here; tick data is read straight from the
// mutable store so React never re-renders per tick.
export default function EmpireCanvas3D({ store, onCommand }) {
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const cmdRef = useRef(onCommand);
  cmdRef.current = onCommand;

  useEffect(() => {
    const wrap = wrapRef.current;
    const boxEl = boxRef.current;
    // the canvas is created here so a remount never reuses a context that was force-lost on dispose
    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-full';
    canvas.style.touchAction = 'none';
    canvas.tabIndex = -1;
    wrap.insertBefore(canvas, wrap.firstChild);
    let world;
    try {
      world = createEmpireScene(canvas, store);
    } catch (err) {
      console.error('[MiskolcEmpire] WebGL init failed:', err);
      notify(store, 'A 3D nézet nem indítható (WebGL hiba).', 'alert');
      canvas.remove();
      return undefined;
    }
    const view = world.view;
    const size = { w: 1, h: 1 };
    const mouse = { x: 0, y: 0, inside: false };
    const keys = new Set();
    const wp = { x: 0, y: 0 };
    let drag = null;
    let box = null;
    let lastClick = { t: 0, k: null };
    let lastDigit = { k: null, t: 0 };
    let raf = 0;
    let last = performance.now();
    let fogAt = 0;
    let wasSpectator = store.spectator;
    const info = { hoverId: null, ghost: null };
    const ghost = { kind: '', x: 0, y: 0, size: 2, ok: false, group: null };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      size.w = Math.max(1, Math.floor(r.width));
      size.h = Math.max(1, Math.floor(r.height));
      world.resize(size.w, size.h);
      store.viewport = { w: size.w, h: size.h };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const placeAnchor = () => {
      const kind = store.ui.placing;
      const s = buildingSize(store.content, kind);
      const g = view.groundAt(mouse.x, mouse.y, 0, wp);
      if (!g) return null;
      return { size: s, x: Math.round(g.x - s / 2), y: Math.round(g.y - s / 2) };
    };
    const ownUnits = () => selectionInfo(store).units.filter((u) => isMine(store, u.o));
    // why the building cannot be upgraded right now (null when it can)
    const upgradeBlocker = (b) => {
      const next = nextUpgradeDef(store.content, b);
      if (!next) return 'Ez az épület már a legmagasabb szinten van.';
      if (b.up >= 0) return 'Ez az épület már fejlesztés alatt áll.';
      if (reqEpoch(next) > (store.res.epoch || 1)) return `A fejlesztéshez ${reqEpoch(next)}. korszak kell.`;
      if (!canAfford(store.res, next.cost)) return 'Nincs elég nyersanyag a fejlesztéshez.';
      return null;
    };
    const ids = (list) => list.slice(0, MAX_IDS).map((u) => u.i);

    const sendOrder = (sx, sy) => {
      if (store.spectator) return;
      const sel = selectionInfo(store);
      const units = sel.units.filter((u) => isMine(store, u.o));
      const g = view.groundAt(sx, sy, 0, wp);
      const mw = store.map.w, mh = store.map.h;
      const gx = g ? Math.max(0.5, Math.min(mw - 0.5, g.x)) : null;
      const gy = g ? Math.max(0.5, Math.min(mh - 0.5, g.y)) : null;
      if (units.length) {
        const pick = pickAt(store, view, sx, sy);
        if (pick && pick.kind !== 'node' && !isNeutral(pick.e.o) && !isAllied(store, pick.e.o)) {
          if (pick.kind === 'building' && SIPHON_TARGETS.has(pick.e.k)) {
            const spies = units.filter((u) => u.k === 'infiltrator');
            const rest = units.filter((u) => u.k !== 'infiltrator');
            if (spies.length) cmdRef.current('siphon', { unitIds: ids(spies), target: { entityId: pick.e.i } });
            if (rest.length) cmdRef.current('attack', { unitIds: ids(rest), target: { entityId: pick.e.i } });
          } else {
            cmdRef.current('attack', { unitIds: ids(units), target: { entityId: pick.e.i } });
          }
          store.moveMarks.push({ x: pick.kind === 'building' ? pick.e.x + pick.e.size / 2 : pick.e.x, y: pick.kind === 'building' ? pick.e.y + pick.e.size / 2 : pick.e.y, t0: store.time, color: '#E94B64' });
          return;
        }
        if (pick && pick.kind === 'node') {
          const gatherers = units.filter((u) => u.k === 'scavenger');
          cmdRef.current('gather', { unitIds: ids(gatherers.length ? gatherers : units), target: { nodeId: pick.e.i } });
          store.moveMarks.push({ x: pick.e.x + 0.5, y: pick.e.y + 0.5, t0: store.time, color: '#f5b041' });
          return;
        }
        if (pick && pick.kind === 'building' && isAllied(store, pick.e.o) && (pick.e.bp < 100 || pick.e.hp < pick.e.mhp)) {
          const builders = units.filter((u) => isBuilderKind(u.k));
          cmdRef.current('repair', { unitIds: ids(builders.length ? builders : units), target: { entityId: pick.e.i } });
          return;
        }
        if (gx === null) return;
        cmdRef.current('move', { unitIds: ids(units), target: { x: +gx.toFixed(2), y: +gy.toFixed(2) } });
        store.moveMarks.push({ x: gx, y: gy, t0: store.time, color: '#28C997' });
        return;
      }
      const mine = sel.buildings.filter((b) => isMine(store, b.o));
      if (mine.length && gx !== null) {
        for (const b of mine.slice(0, 10)) cmdRef.current('set-rally', { buildingId: b.i, target: { x: +gx.toFixed(2), y: +gy.toFixed(2) } });
        store.moveMarks.push({ x: gx, y: gy, t0: store.time, color: '#536CFF' });
      }
    };

    const clickSelect = (sx, sy, additive) => {
      const pick = pickAt(store, view, sx, sy);
      const now = performance.now();
      if (!pick) { if (!additive) store.selection.clear(); return; }
      const id = pick.e.i;
      // double click selects every own unit of the same type on screen
      if (pick.kind === 'unit' && isMine(store, pick.e.o) && lastClick.k === pick.e.k && now - lastClick.t < 320) {
        store.selection.clear();
        for (const i of visibleOfKind(store, view, pick.e.k, size.w, size.h)) store.selection.add(i);
        lastClick = { t: 0, k: null };
        return;
      }
      lastClick = { t: now, k: pick.kind === 'unit' ? pick.e.k : null };
      const ownUnit = (a) => !!a && isMine(store, a.o) && store.units.has(a.i);
      if (additive && pick.kind === 'unit' && isMine(store, pick.e.o) && [...store.selection].every((s) => ownUnit(store.units.get(s)))) {
        if (store.selection.has(id)) store.selection.delete(id); else store.selection.add(id);
      } else {
        store.selection.clear();
        store.selection.add(id);
        cueAsszonyVoice(store, [id]);
      }
    };

    const onPointerDown = (e) => {
      const [x, y] = local(e);
      mouse.x = x; mouse.y = y; mouse.inside = true;
      canvas.setPointerCapture?.(e.pointerId);
      if (e.button === 1 || (e.button === 0 && e.altKey)) { drag = { mode: 'rotate', lx: e.clientX, ly: e.clientY }; e.preventDefault(); return; }
      if (e.button === 2) {
        if (store.ui.placing) { store.ui.placing = null; return; }
        sendOrder(x, y);
        return;
      }
      if (e.button !== 0) return;
      if (store.ui.placing && !store.spectator) {
        const a = placeAnchor();
        // dropped onto an own building of the same kind: upgrade it, the selected builders help
        const up = a && upgradeTargetAt(store, store.ui.placing, a.x, a.y);
        if (up) {
          const why = upgradeBlocker(up);
          if (why) { notify(store, why, 'alert'); return; }
          const helpers = ownUnits().filter((u) => isBuilderKind(u.k));
          cmdRef.current('upgrade', { buildingId: up.i, ...(helpers.length ? { unitIds: ids(helpers) } : {}) });
          if (!e.shiftKey) store.ui.placing = null;
          return;
        }
        if (!a || !canPlace(store, store.ui.placing, a.x, a.y)) { notify(store, 'Ide nem építhetsz.', 'alert'); return; }
        const builders = ownUnits().filter((u) => isBuilderKind(u.k));
        if (!builders.length) { notify(store, 'Válassz ki egy Építő Mestert az építéshez.', 'alert'); return; }
        cmdRef.current('build', { unitIds: ids(builders), building: store.ui.placing, target: { x: a.x, y: a.y } });
        if (!e.shiftKey) store.ui.placing = null;
        return;
      }
      if (e.pointerType === 'touch') { drag = { mode: 'touchpan', lx: e.clientX, ly: e.clientY, sx: x, sy: y, moved: 0 }; return; }
      // Ctrl/Cmd + left drag: selection box. Plain left drag: grab-and-pan the map; a click without movement selects.
      if (e.ctrlKey || e.metaKey) { drag = { mode: 'box', x0: x, y0: y }; return; }
      drag = { mode: 'mousepan', lx: e.clientX, ly: e.clientY, moved: 0 };
    };

    const onPointerMove = (e) => {
      const [x, y] = local(e);
      mouse.x = x; mouse.y = y; mouse.inside = true;
      if (!drag) return;
      const cam = store.camera;
      if (drag.mode === 'rotate') {
        cam.yaw -= (e.clientX - drag.lx) * 0.006;
        cam.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, cam.pitch + (e.clientY - drag.ly) * 0.004));
        drag.lx = e.clientX; drag.ly = e.clientY;
      } else if (drag.mode === 'touchpan' || drag.mode === 'mousepan') {
        drag.moved += Math.abs(e.clientX - drag.lx) + Math.abs(e.clientY - drag.ly);
        // small jitter during a click must not move the camera
        if (drag.mode === 'mousepan' && drag.moved < PAN_THRESHOLD) return;
        const k = cam.dist / size.h * 1.15;
        panDelta(cam, -(e.clientX - drag.lx), -(e.clientY - drag.ly), k, wp);
        cam.x += wp.x; cam.y += wp.y; cam.goal = null;
        drag.lx = e.clientX; drag.ly = e.clientY;
        if (drag.mode === 'mousepan') canvas.style.cursor = 'grabbing';
      } else if (drag.mode === 'box') {
        if (Math.hypot(x - drag.x0, y - drag.y0) > 5) box = { x0: drag.x0, y0: drag.y0, x1: x, y1: y };
      }
    };

    const onPointerUp = (e) => {
      canvas.releasePointerCapture?.(e.pointerId);
      const d = drag;
      drag = null;
      if (!d) return;
      if (d.mode === 'touchpan') {
        if (d.moved < 8) {
          const pick = pickAt(store, view, d.sx, d.sy);
          if (ownUnits().length && !(pick && pick.kind === 'unit' && isMine(store, pick.e.o))) sendOrder(d.sx, d.sy);
          else clickSelect(d.sx, d.sy, false);
        }
        return;
      }
      if (d.mode === 'mousepan') {
        canvas.style.cursor = '';
        if (d.moved < PAN_THRESHOLD) { const [x, y] = local(e); clickSelect(x, y, e.shiftKey); }
        return;
      }
      if (d.mode !== 'box') return;
      if (box) {
        const sel = boxSelect(store, view, box.x0, box.y0, box.x1, box.y1);
        if (!e.shiftKey) store.selection.clear();
        for (const id of sel) store.selection.add(id);
        cueAsszonyVoice(store, sel);
        box = null;
      } else {
        const [x, y] = local(e);
        clickSelect(x, y, e.shiftKey);
      }
    };

    const onLeave = () => { mouse.inside = false; };
    const onWheel = (e) => {
      e.preventDefault();
      const cam = store.camera;
      const [x, y] = local(e);
      const before = view.groundAt(x, y, 0, { x: 0, y: 0 });
      const old = cam.dist;
      cam.dist *= Math.exp(e.deltaY * 0.0011);
      clampCamera(cam, store.map.w, store.map.h, store.spectator);
      // zoom towards the point under the cursor
      if (before && cam.dist !== old) {
        const k = 1 - cam.dist / old;
        cam.x += (before.x - cam.x) * k;
        cam.y += (before.y - cam.y) * k;
        cam.goal = null;
      }
    };
    const onContext = (e) => e.preventDefault();

    const centerGroup = (k) => {
      const c = groupCenter(store, k, { x: 0, y: 0 });
      if (c) centerOnWorld(store.camera, c.x, c.y, true);
    };

    const onKeyDown = (e) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      const digit = /^Digit[1-9]$/.test(e.code) ? e.code.slice(5) : /^[1-9]$/.test(k) ? k : null;
      if (e.ctrlKey || e.metaKey) {
        if (digit && !store.spectator) {
          e.preventDefault();
          const n = saveGroup(store, digit);
          notify(store, n ? `${digit}. csoport mentve: ${n} egység.` : `${digit}. csoport törölve.`, n ? 'good' : 'info');
        }
        return;
      }
      if (e.altKey) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e'].includes(k)) { keys.add(k); e.preventDefault(); return; }
      if (digit) {
        if (store.spectator) return;
        const now = performance.now();
        if (store.groups[digit]) {
          selectGroup(store, digit);
          if (lastDigit.k === digit && now - lastDigit.t < DOUBLE_TAP_MS) { centerGroup(digit); lastDigit = { k: null, t: 0 }; } else lastDigit = { k: digit, t: now };
        }
        return;
      }
      if (k === 'escape') { store.ui.placing = null; store.selection.clear(); return; }
      if (k === 'h') {
        for (const b of store.buildings.values()) if (isMine(store, b.o) && b.k === 'townCenter') { centerOnWorld(store.camera, b.x + b.size / 2, b.y + b.size / 2, true); return; }
      }
      if (k === 'x' && !store.spectator) {
        const list = ownUnits();
        if (list.length) cmdRef.current('stop', { unitIds: ids(list) });
      }
    };
    const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
    const onBlur = () => keys.clear();
    store.centerGroup = centerGroup;

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
      const cam = store.camera;
      if (store.map.w && !store.cameraReady) { // first frame of a match: look at our base
        let b = null;
        for (const x of store.buildings.values()) if (isMine(store, x.o)) { if (!b || x.k === 'townCenter') b = x; }
        const u = !b && [...store.units.values()].find((x) => isMine(store, x.o));
        if (b) centerOnWorld(cam, b.x + b.size / 2, b.y + b.size / 2);
        else if (u) centerOnWorld(cam, u.x, u.y);
        else centerOnWorld(cam, store.map.w / 2, store.map.h / 2);
        cam.dist = store.spectator ? 70 : 26;
        store.cameraReady = true;
      }
      if (store.spectator && !wasSpectator) { cam.dist = Math.max(cam.dist, 48); store.ui.placing = null; }
      wasSpectator = store.spectator;

      advance(store, dt);
      if (now - fogAt > 200) { fogAt = now; updateFog(store); }

      // camera: keys + screen-edge scrolling, Q/E rotate
      let px = 0, py = 0;
      if (keys.has('a') || keys.has('arrowleft')) px -= 1;
      if (keys.has('d') || keys.has('arrowright')) px += 1;
      if (keys.has('w') || keys.has('arrowup')) py -= 1;
      if (keys.has('s') || keys.has('arrowdown')) py += 1;
      if (keys.has('q')) cam.yaw += dt * 1.6;
      if (keys.has('e')) cam.yaw -= dt * 1.6;
      if (mouse.inside && !drag && document.hasFocus()) {
        if (mouse.x < EDGE) px -= 1; else if (mouse.x > size.w - EDGE) px += 1;
        if (mouse.y < EDGE) py -= 1; else if (mouse.y > size.h - EDGE) py += 1;
      }
      if (px || py) {
        panDelta(cam, px, py, cam.dist * 0.95 * dt, wp);
        cam.x += wp.x; cam.y += wp.y; cam.goal = null;
      }
      stepCameraGoal(cam, dt);
      if (store.map.w) clampCamera(cam, store.map.w, store.map.h, store.spectator);

      // hover and placement ghost
      info.hoverId = null;
      info.ghost = null;
      if (mouse.inside && !drag && store.map.w) {
        if (store.ui.placing && !store.spectator) {
          const a = placeAnchor();
          if (a) {
            const up = upgradeTargetAt(store, store.ui.placing, a.x, a.y);
            ghost.kind = store.ui.placing; ghost.size = a.size;
            // over an own building of the same kind the ghost snaps onto it as an upgrade
            if (up) { ghost.x = up.x; ghost.y = up.y; ghost.ok = !upgradeBlocker(up); ghost.upgrade = true; }
            else { ghost.x = a.x; ghost.y = a.y; ghost.ok = canPlace(store, store.ui.placing, a.x, a.y); ghost.upgrade = false; }
            info.ghost = ghost;
          }
          canvas.style.cursor = 'copy';
        } else {
          const pick = pickAt(store, view, mouse.x, mouse.y);
          info.hoverId = pick ? pick.e.i : null;
          const hasUnits = store.selection.size > 0 && !store.spectator;
          canvas.style.cursor = pick && hasUnits && pick.kind !== 'node' && !isNeutral(pick.e.o) && !isAllied(store, pick.e.o) ? 'crosshair' : pick ? 'pointer' : 'default';
        }
      }
      world.frame(dt, info);

      // one-shot sounds queued by store events, attenuated by distance to the camera target
      while (store.sfx.length) {
        const s = store.sfx.shift();
        const d = Math.hypot((s.x ?? cam.x) - cam.x, (s.y ?? cam.y) - cam.y);
        playEmpireSfx(s.id, { volume: 0.85 * Math.max(0, 1 - d / (cam.dist * 1.6 + 10)), muted: store.ui.muted, delay: s.delay });
      }

      if (box) {
        boxEl.style.display = 'block';
        boxEl.style.left = `${Math.min(box.x0, box.x1)}px`;
        boxEl.style.top = `${Math.min(box.y0, box.y1)}px`;
        boxEl.style.width = `${Math.abs(box.x1 - box.x0)}px`;
        boxEl.style.height = `${Math.abs(box.y1 - box.y0)}px`;
      } else boxEl.style.display = 'none';
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
      if (store.centerGroup === centerGroup) store.centerGroup = null;
      store.viewQuad = null;
      world.dispose();
      canvas.remove();
    };
  }, [store]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" style={{ background: '#05060f', touchAction: 'none' }}>
      <div
        ref={boxRef}
        className="absolute pointer-events-none"
        style={{ display: 'none', border: '1px solid rgba(64,255,154,0.9)', background: 'rgba(40,201,151,0.14)', borderRadius: 2 }}
      />
    </div>
  );
}
