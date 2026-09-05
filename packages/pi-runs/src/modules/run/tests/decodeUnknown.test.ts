import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { Run } from '../index.js';

const valid = {
  id: 'run-1',
  parent: null,
  status: 'pending',
  created: '2026-09-05T00:00:00Z',
  updated: '2026-09-05T00:00:00Z',
  sessionFile: '.agents/@montflow/pi-runs/runs/run-1/session.jsonl',
};

Vitest.describe('Run.decodeUnknown runtime', () => {
  Vitest.it.effect('decodes a valid run', () =>
    Effect.gen(function* () {
      const run = yield* Run.decodeUnknown(valid);
      Vitest.expect(run.id).toBe('run-1');
      Vitest.expect(run.status).toBe('pending');
      Vitest.expect(run.parent).toBeNull();
    }),
  );

  Vitest.it.effect('rejects an invalid id', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Run.decodeUnknown({ ...valid, id: 'BAD ID!' }));
      Vitest.expect(error).toBeDefined();
    }),
  );

  Vitest.it.effect('round-trips through encode', () =>
    Effect.gen(function* () {
      const run = yield* Run.decodeUnknown(valid);
      Vitest.expect(Run.encode(run)).toStrictEqual(valid);
    }),
  );
});
