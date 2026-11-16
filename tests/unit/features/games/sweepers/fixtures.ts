// Phase B fixtures: the real backend output (copied from .omc/handoffs/sweepers-b-layout-fixture.json,
// regenerate there with `node scripts/buildSweepersFixture.mjs`) and a small hand-made init_state.
import realRaw from '../../../../fixtures/sweepers-b-layout-fixture.json?raw';
import smallRaw from '../../../../fixtures/sweepers-init-small.json?raw';
import { parseInitState, type InitState } from '../../../../../src/features/games/sweepers/types';
import type { WorldLayout } from '../../../../../src/features/games/sweepers/worldTypes';
import { isRecord } from '../../../../../src/shared/lib/guards';

/** `{ description, initState, events }` exactly as the backend wrote it (untyped, like a socket payload). */
export const REAL_FIXTURE: unknown = JSON.parse(realRaw);
export const SMALL_INIT: unknown = JSON.parse(smallRaw);

export const realInitPayload = (): unknown => (isRecord(REAL_FIXTURE) ? REAL_FIXTURE.initState : null);
export const realEvent = (name: string): unknown => (isRecord(REAL_FIXTURE) && isRecord(REAL_FIXTURE.events) ? REAL_FIXTURE.events[name] : null);

function mustParse(payload: unknown): InitState & { layout: WorldLayout } {
  const init = parseInitState(payload);
  if (!init || !init.layout) throw new Error('fixture did not parse');
  return { ...init, layout: init.layout };
}

export const realInit = (): InitState & { layout: WorldLayout } => mustParse(realInitPayload());
export const smallInit = (): InitState & { layout: WorldLayout } => mustParse(SMALL_INIT);
