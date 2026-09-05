import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { RunEvent } from '../index.js';

const valid = {
  seq: 1,
  role: 'user',
  text: 'hello',
  at: '2026-09-05T00:00:01Z',
};

Vitest.describe('RunEvent.decodeUnknown runtime', () => {
  Vitest.it.effect('decodes a chat turn', () =>
    Effect.gen(function* () {
      const event = yield* RunEvent.decodeUnknown(valid);
      Vitest.expect(event.seq).toBe(1);
      Vitest.expect(event.role).toBe('user');
    }),
  );

  Vitest.it.effect('decodes a subrun pointer', () =>
    Effect.gen(function* () {
      const event = yield* RunEvent.decodeUnknown({
        ...valid,
        seq: 2,
        role: 'system',
        text: 'subrun started',
        subrunId: 'run-1-scout',
      });
      Vitest.expect(event.subrunId).toBe('run-1-scout');
    }),
  );

  Vitest.it.effect('rejects seq zero', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(RunEvent.decodeUnknown({ ...valid, seq: 0 }));
      Vitest.expect(error).toBeDefined();
    }),
  );

  Vitest.it.effect('round-trips through encode', () =>
    Effect.gen(function* () {
      const event = yield* RunEvent.decodeUnknown(valid);
      Vitest.expect(RunEvent.encode(event)).toStrictEqual(valid);
    }),
  );
});
