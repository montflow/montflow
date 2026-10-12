import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { withInteractionTools } from '@montflow/pi-sessions';
import { DEFAULT_SESSION_TOOLS } from '../index.js';

Vitest.describe('Sessions.DEFAULT_SESSION_TOOLS', () => {
  Vitest.it.effect('keeps the interaction tools enabled under the allowlist', () =>
    Effect.sync(() => {
      // The Pi factory unions these into `allowedToolNames`; a session created
      // with the default tools must still be able to park (`ask_user`) and
      // notify (`notify_user`).
      const allowed = withInteractionTools([...DEFAULT_SESSION_TOOLS], ['ask_user', 'notify_user']);
      Vitest.expect(allowed).toStrictEqual(['read', 'write', 'edit', 'ask_user', 'notify_user']);
    }),
  );
});
