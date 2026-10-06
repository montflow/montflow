import * as Vitest from '@effect/vitest';
import { Effect, type FileSystem, Stream } from 'effect';
import * as Changes from '../index.js';

// SAFETY: `tag` is one of WatchEvent's three literal tags and `path` is its only other field.
const event = (tag: 'Create' | 'Update' | 'Remove', path: string): FileSystem.WatchEvent => ({
  _tag: tag,
  path,
});

const resolve = (found: FileSystem.WatchEvent) =>
  Effect.succeed([{ kind: Changes.kindOf(found), id: found.path, value: 'entity' }]);

Vitest.describe('Changes.kindOf', () => {
  Vitest.it('maps filesystem events to change kinds', () => {
    Vitest.expect(Changes.kindOf(event('Create', 'a'))).toBe('created');
    Vitest.expect(Changes.kindOf(event('Update', 'a'))).toBe('updated');
    Vitest.expect(Changes.kindOf(event('Remove', 'a'))).toBe('removed');
  });
});

Vitest.describe('Changes.changesFrom', () => {
  Vitest.it.effect('maps each event to its changes in order when not debounced', () =>
    Effect.gen(function* () {
      const stream = Changes.changesFrom(
        Stream.make(
          event('Create', '/x/a.md'),
          event('Update', '/x/a.md'),
          event('Remove', '/x/b.md'),
        ),
        resolve,
        0,
      );
      const changes = yield* Stream.runCollect(stream);
      Vitest.expect(changes).toEqual([
        { kind: 'created', id: '/x/a.md', value: 'entity' },
        { kind: 'updated', id: '/x/a.md', value: 'entity' },
        { kind: 'removed', id: '/x/b.md', value: 'entity' },
      ]);
    }),
  );

  Vitest.it.effect('drops events the resolver maps to no changes', () =>
    Effect.gen(function* () {
      const stream = Changes.changesFrom(Stream.make(event('Update', '/x/a.md')), () =>
        Effect.succeed([]),
      );
      const changes = yield* Stream.runCollect(stream);
      Vitest.expect(changes).toEqual([]);
    }),
  );
});
