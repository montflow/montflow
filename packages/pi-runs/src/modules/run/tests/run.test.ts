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

Vitest.describe('Run.Run runtime', () => {
  Vitest.it.effect('constructs from decoded values', () =>
    Effect.gen(function* () {
      const decoded = yield* Run.decodeUnknown(valid);
      const remade = new Run.Run({
        id: decoded.id,
        parent: decoded.parent,
        status: decoded.status,
        created: decoded.created,
        updated: decoded.updated,
        sessionFile: decoded.sessionFile,
      });
      Vitest.expect(remade.id).toBe('run-1');
      Vitest.expect(remade.status).toBe('pending');
    }),
  );

  Vitest.it('throws on invalid id', () => {
    // SAFETY: intentionally invalid fixture — proves the constructor throws; never persisted.
    const badId = 'BAD ID!' as Run.Id;
    Vitest.expect(
      () =>
        new Run.Run({
          ...valid,
          status: 'pending',
          id: badId,
        }),
    ).toThrow();
  });
});
