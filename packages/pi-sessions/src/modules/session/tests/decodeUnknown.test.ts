import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { Session } from '../index.js';

const valid = {
  id: 'session-1',
  parent: null,
  status: 'pending',
  created: '2026-09-05T00:00:00Z',
  updated: '2026-09-05T00:00:00Z',
  sessionFile: '.agents/@montflow/sessions/session-1/session.jsonl',
};

Vitest.describe('Session.decodeUnknown runtime', () => {
  Vitest.it.effect('decodes a valid session', () =>
    Effect.gen(function* () {
      const session = yield* Session.decodeUnknown(valid);
      Vitest.expect(session.id).toBe('session-1');
      Vitest.expect(session.status).toBe('pending');
      Vitest.expect(session.parent).toBeNull();
    }),
  );

  Vitest.it.effect('rejects an invalid id', () =>
    Effect.gen(function* () {
      const error = yield* Session.decodeUnknown({ ...valid, id: 'BAD ID!' }).pipe(Effect.flip);
      Vitest.expect(error).toBeDefined();
    }),
  );

  Vitest.it.effect('round-trips through encode', () =>
    Effect.gen(function* () {
      const session = yield* Session.decodeUnknown(valid);
      Vitest.expect(Session.encode(session)).toStrictEqual(valid);
    }),
  );
});
