import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { withInteractionTools } from '@montflow/pi-runs';
import { DEFAULT_RUN_TOOLS } from '../index.js';

Vitest.describe('Runs.DEFAULT_RUN_TOOLS', () => {
  Vitest.it.effect('keeps the interaction tools enabled under the allowlist', () =>
    Effect.sync(() => {
      // The Pi factory unions these into `allowedToolNames`; a run created
      // with the default tools must still be able to park (`ask_user`) and
      // notify (`notify_user`).
      const allowed = withInteractionTools([...DEFAULT_RUN_TOOLS], ['ask_user', 'notify_user']);
      Vitest.expect(allowed).toStrictEqual(['read', 'write', 'edit', 'ask_user', 'notify_user']);
    }),
  );
});
