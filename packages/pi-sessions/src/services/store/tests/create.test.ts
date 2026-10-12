import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  StoreTag as Store,
  StoreErrorClass as StoreError,
  freshRoot,
  provideStore,
} from './helpers.js';

Vitest.describe('Store.create runtime', () => {
  Vitest.it.live('creates a pending session', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        const session = yield* store.create({ id: 'session-1', name: 'smoke' });
        Vitest.expect(session.status).toBe('pending');
        Vitest.expect(session.id).toBe('session-1');
        const loaded = yield* store.load('session-1');
        Vitest.expect(loaded.events).toHaveLength(0);
        Vitest.expect(loaded.receipt).toBeNull();
      }),
    ),
  );

  Vitest.it.live('persists the tools allowlist', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-1', tools: ['read', 'grep'] });
        const loaded = yield* store.load('session-1');
        Vitest.expect(loaded.session.tools).toStrictEqual(['read', 'grep']);
      }),
    ),
  );

  Vitest.it.live('persists the spec binding', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-1', spec: 'ship-login' });
        const loaded = yield* store.load('session-1');
        Vitest.expect(loaded.session.spec).toBe('ship-login');
        const listed = yield* store.list();
        Vitest.expect(listed[0]?.spec).toBe('ship-login');
      }),
    ),
  );

  Vitest.it.live('fails on duplicate id', () =>
    provideStore(
      freshRoot(),
      Effect.gen(function* () {
        const store = yield* Store;
        yield* store.create({ id: 'session-1' });
        const error = yield* store.create({ id: 'session-1' }).pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain('already exists');
      }),
    ),
  );

  Vitest.it.live('serializes creation under the session lock', () => {
    const root = freshRoot();
    return provideStore(
      root,
      Effect.gen(function* () {
        const store = yield* Store;
        yield* Effect.sync(() =>
          Fs.mkdirSync(NodePath.join(root, 'session-1', '.lock'), { recursive: true }),
        );
        const error = yield* store.create({ id: 'session-1' }).pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(StoreError);
        Vitest.expect(error.reason).toContain('is locked');
      }),
    );
  });
});
