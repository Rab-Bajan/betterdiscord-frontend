// Stub WebGL2 context for running the real three r170 WebGLRenderer in vitest (jsdom). Every GL call is a
// no-op; three still builds programs, walks the scene, renders every shadow map and counts its draws.
import { vi } from 'vitest';

class FakeWebGL2 {}

const constants = new Map<string, number>();
const names = new Map<number, string>();
const constant = (name: string): number => {
  let value = constants.get(name);
  if (value === undefined) {
    value = 0x10000 + constants.size;
    constants.set(name, value);
    names.set(value, name);
  }
  return value;
};

const noop = (): void => undefined;

let nextId = 0;
const handle = (): { id: number } => ({ id: ++nextId });

const SPECIAL: Readonly<Record<string, (...args: unknown[]) => unknown>> = {
  getParameter: (p) => {
    const name = typeof p === 'number' ? names.get(p) : undefined;
    if (name === 'VERSION') return 'WebGL 2.0';
    if (name === 'SHADING_LANGUAGE_VERSION') return 'WebGL GLSL ES 3.00';
    if (name === 'VIEWPORT' || name === 'SCISSOR_BOX') return new Int32Array([0, 0, 64, 64]);
    return 16;
  },
  getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
  getExtension: (name) => (name === 'WEBGL_lose_context' ? { loseContext: noop } : {}),
  getSupportedExtensions: () => [],
  getContextAttributes: () => ({ alpha: true, antialias: false, depth: true, stencil: false }),
  getShaderParameter: () => true,
  getProgramParameter: (_program, p) => {
    const name = typeof p === 'number' ? names.get(p) : undefined;
    return name === 'ACTIVE_UNIFORMS' || name === 'ACTIVE_ATTRIBUTES' ? 0 : true;
  },
  getShaderInfoLog: () => '',
  getProgramInfoLog: () => '',
  createProgram: handle,
  createShader: handle,
  createBuffer: handle,
  createTexture: handle,
  createFramebuffer: handle,
  createRenderbuffer: handle,
  createVertexArray: handle,
  getUniformLocation: () => ({}),
  getAttribLocation: () => 0,
  checkFramebufferStatus: () => constant('FRAMEBUFFER_COMPLETE'),
  isContextLost: () => false,
  getError: () => 0
};

export interface StubDom {
  /** Runs the queued animation frames once each, advancing `performance.now()` by `stepMs` first. */
  frame(stepMs?: number): void;
  readonly now: () => number;
  restore(): void;
}

/** Installs the stub context, a manual requestAnimationFrame and a controllable clock. */
export function installStubWebGl(): StubDom {
  let now = 1000;
  const queue = new Map<number, FrameRequestCallback>();
  let rafId = 0;
  vi.stubGlobal('WebGL2RenderingContext', FakeWebGL2);
  const gl = new Proxy(new FakeWebGL2(), {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (key === 'drawingBufferWidth' || key === 'drawingBufferHeight') return 64;
      const special = SPECIAL[key];
      if (special) return special;
      if (/^[A-Z0-9_]+$/.test(key)) return constant(key);
      return noop;
    }
  });
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: (kind: string) => (kind === 'webgl2' ? gl : null)
  });
  const request = (cb: FrameRequestCallback): number => {
    rafId += 1;
    queue.set(rafId, cb);
    return rafId;
  };
  const cancel = (id: number): void => {
    queue.delete(id);
  };
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  window.requestAnimationFrame = request;
  window.cancelAnimationFrame = cancel;
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  return {
    frame(stepMs = 16) {
      now += stepMs;
      const due = [...queue.entries()];
      queue.clear();
      for (const [, cb] of due) cb(now);
    },
    now: () => now,
    restore() {
      nowSpy.mockRestore();
      if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original);
      vi.unstubAllGlobals();
    }
  };
}
