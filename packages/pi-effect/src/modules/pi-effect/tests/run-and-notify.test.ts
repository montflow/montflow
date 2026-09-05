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

Vitest.describe('PiEffect.runAndNotify runtime', () => {
  Vitest.it.effect('runs silently when the workflow succeeds', () =>
    Effect.gen(function* () {
      const ui = makeUi();
      yield* Effect.promise(() => PiEffect.runAndNotify({ ui }, Effect.succeed('ok')));
      Vitest.expect(ui.notifications).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('notifies instead of throwing when the workflow fails', () =>
    Effect.gen(function* () {
      const ui = makeUi();
      yield* Effect.promise(() => PiEffect.runAndNotify({ ui }, Effect.fail('boom')));
      Vitest.expect(ui.notifications).toStrictEqual(['boom']);
    }),
  );
});
