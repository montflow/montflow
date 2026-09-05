import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { provideEphemeral, StoreTag as Store, StoreErrorClass as StoreError } from './helpers.js';

Vitest.describe('Store.ephemeral runtime', () => {
  Vitest.it.effect('runs the full lifecycle without disk', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        yield* store.start('run-1');
        const event = yield* store.append({ runId: 'run-1', role: 'user', text: 'hello' });
        Vitest.expect(event.seq).toBe(1);
        yield* store.settle({ runId: 'run-1', outcome: 'done', summary: 'green' });
        const loaded = yield* store.load('run-1');
        Vitest.expect(loaded.run.status).toBe('done');
        Vitest.expect(loaded.events).toHaveLength(1);
        Vitest.expect(loaded.receipt?.outcome).toBe('done');
      }),
    ),
  );

  Vitest.it.effect('enforces invariants like the file backend', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'run-1' });
        const error = yield* Effect.flip(
          store.settle({ runId: 'run-1', outcome: 'done', summary: 'x' }),
        );
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain("from status 'pending'");
      }),
    ),
  );

  Vitest.it.effect('lists runs sorted', () =>
    provideEphemeral(
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'b-run' });
        yield* store.create({ id: 'a-run' });
        const runs = yield* store.list();
        Vitest.expect(runs.map((run) => run.id)).toStrictEqual(['a-run', 'b-run']);
      }),
    ),
  );
});
