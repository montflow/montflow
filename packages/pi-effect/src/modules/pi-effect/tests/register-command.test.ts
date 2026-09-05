import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiEffect from '../index.js';

const makeUi = (): PiEffect.PiUi & { notifications: Array<string> } => {
  const notifications: Array<string> = [];
  return {
    notifications,
    notify: (message) => {
      notifications.push(message);
    },
    confirm: () => Promise.resolve(true),
    select: () => Promise.resolve(undefined),
    input: () => Promise.resolve(undefined),
  };
};

/** Narrow command surface the test exercises — full Pi contexts remain assignable. */
type NarrowHandler = (args: string, ctx: { readonly ui: PiEffect.PiUi }) => Promise<void>;

type Registered = {
  name: string;
  description: string;
  handler: NarrowHandler;
};

const makeApi = (registered: Array<Registered>) => ({
  registerCommand: (
    name: string,
    options: { readonly description: string; readonly handler: NarrowHandler },
  ): void => {
    registered.push({ name, description: options.description, handler: options.handler });
  },
});

Vitest.describe('PiEffect.registerCommand runtime', () => {
  Vitest.it.effect('registers the command and runs the workflow with its args', () =>
    Effect.gen(function* () {
      const ui = makeUi();
      const registered: Array<Registered> = [];
      const seen: Array<string> = [];
      PiEffect.registerCommand(makeApi(registered), 'hello', 'Say hello', (args) =>
        Effect.gen(function* () {
          seen.push(args);
          yield* PiEffect.notify(ui, 'hi');
        }),
      );
      Vitest.expect(registered.map((r) => [r.name, r.description])).toStrictEqual([
        ['hello', 'Say hello'],
      ]);
      yield* Effect.promise(() => registered[0]!.handler('--loud', { ui }));
      Vitest.expect(seen).toStrictEqual(['--loud']);
      Vitest.expect(ui.notifications).toStrictEqual(['hi']);
    }),
  );

  Vitest.it.effect('notifies when the workflow fails', () =>
    Effect.gen(function* () {
      const ui = makeUi();
      const registered: Array<Registered> = [];
      PiEffect.registerCommand(makeApi(registered), 'oops', 'Always fails', () =>
        Effect.fail('kaput'),
      );
      yield* Effect.promise(() => registered[0]!.handler('', { ui }));
      Vitest.expect(ui.notifications).toStrictEqual(['kaput']);
    }),
  );
});
