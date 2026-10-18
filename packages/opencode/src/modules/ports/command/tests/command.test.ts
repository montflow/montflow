import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { CommandDefinition } from '@opencode/plugin/effect/command';
import * as Command from '../index.js';

const makeContext = (added: Array<CommandDefinition>): Command.CommandContext => ({
  command: {
    transform: (callback) =>
      Effect.sync(() => {
        callback({
          add: (definition) => {
            added.push(definition);
          },
        });
        return { dispose: Effect.void };
      }),
    list: () => Effect.succeed({ data: [] }),
  },
});

Vitest.describe('CommandPort runtime', () => {
  Vitest.it.effect('register appends the definition through the host transform', () =>
    Effect.gen(function* () {
      const added: Array<CommandDefinition> = [];
      const port = Command.makeCommandPort(makeContext(added));
      const definition: CommandDefinition = { name: 'specs', execute: () => Effect.void };
      yield* port.register(definition).pipe(Effect.scoped);
      Vitest.expect(added).toStrictEqual([definition]);
    }),
  );

  Vitest.it.effect('list reads the host registry', () =>
    Effect.gen(function* () {
      const port = Command.makeCommandPort(makeContext([]));
      Vitest.expect(yield* port.list()).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('fails at call time without a server context', () =>
    Effect.gen(function* () {
      const port = Command.makeCommandPort({});
      const error = yield* port.register({ name: 'specs', execute: () => Effect.void }).pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
        Effect.scoped,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );
});
