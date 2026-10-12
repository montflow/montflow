import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { StoreTag as Store, freshRoot, provideStore } from './helpers.js';

Vitest.describe('Store.list runtime', () => {
  Vitest.it.live('returns empty on a fresh root', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        Vitest.expect(yield* store.list()).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.live('returns ids sorted', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'b-session' });
        yield* store.create({ id: 'a-session' });
        const sessions = yield* store.list();
        Vitest.expect(sessions.map((session) => session.id)).toStrictEqual([
          'a-session',
          'b-session',
        ]);
      }),
    ),
  );

  Vitest.it.live('skips an unreadable session directory instead of failing the batch', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'a-session' });
        yield* store.create({ id: 'b-session' });
        yield* Effect.sync(() => Fs.mkdirSync(NodePath.join(root, 'broken-session')));
        const sessions = yield* store.list();
        Vitest.expect(sessions.map((session) => session.id)).toStrictEqual([
          'a-session',
          'b-session',
        ]);
      }),
    );
  });
});
