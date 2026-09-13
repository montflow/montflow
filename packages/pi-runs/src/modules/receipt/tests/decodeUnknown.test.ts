import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { Receipt } from '../index.js';

const valid = {
  runId: 'run-1',
  outcome: 'done',
  summary: 'all green',
  endedAt: '2026-09-05T01:00:00Z',
};

Vitest.describe('Receipt.decodeUnknown runtime', () => {
  Vitest.it.effect('decodes a valid receipt', () =>
    Effect.gen(function* () {
      const receipt = yield* Receipt.decodeUnknown(valid);
      Vitest.expect(receipt.outcome).toBe('done');
      Vitest.expect(receipt.runId).toBe('run-1');
    }),
  );

  Vitest.it.effect('rejects a non-terminal outcome', () =>
    Effect.gen(function* () {
      const error = yield* Receipt.decodeUnknown({ ...valid, outcome: 'running' }).pipe(
        Effect.flip,
      );
      Vitest.expect(error).toBeDefined();
    }),
  );

  Vitest.it.effect('round-trips through encode', () =>
    Effect.gen(function* () {
      const receipt = yield* Receipt.decodeUnknown(valid);
      Vitest.expect(Receipt.encode(receipt)).toStrictEqual(valid);
    }),
  );
});
