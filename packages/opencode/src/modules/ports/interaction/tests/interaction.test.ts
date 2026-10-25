import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interaction from '../index.js';

const makeContext = (
  overrides?: Partial<Interaction.InteractionUi>,
): Interaction.InteractionContext => ({
  ui: {
    dialog: {
      select: (options) => Promise.resolve(options.options[0]?.value),
      confirm: () => Promise.resolve(undefined),
      prompt: () => Promise.resolve(undefined),
      alert: () => Promise.resolve(),
    },
    toast: { show: () => {} },
    ...overrides,
  },
  attention: {
    notify: () => Promise.resolve({ ok: true, notification: true, sound: true }),
  },
});

Vitest.describe('InteractionPort runtime', () => {
  Vitest.it.effect('notify shows a toast', () =>
    Effect.gen(function* () {
      const seen: Array<Interaction.ToastOptions> = [];
      const port = Interaction.makeInteractionPort(
        makeContext({ toast: { show: (options) => seen.push(options) } }),
      );
      yield* port.notify({ message: 'hello', variant: 'success' });
      Vitest.expect(seen).toStrictEqual([{ message: 'hello', variant: 'success' }]);
    }),
  );

  Vitest.it.effect('select resolves the picked value', () =>
    Effect.gen(function* () {
      const port = Interaction.makeInteractionPort(makeContext());
      const picked = yield* port.select({
        title: 'pick',
        options: [{ title: 'Pick me', value: 'picked' }],
      });
      Vitest.expect(picked).toBe('picked');
    }),
  );

  Vitest.it.effect('attention resolves the host result', () =>
    Effect.gen(function* () {
      const port = Interaction.makeInteractionPort(makeContext());
      Vitest.expect(yield* port.attention({ message: 'ping' })).toStrictEqual({
        ok: true,
        notification: true,
        sound: true,
      });
    }),
  );

  Vitest.it.effect('fails at call time without a TUI context', () =>
    Effect.gen(function* () {
      const port = Interaction.makeInteractionPort({});
      const error = yield* port.notify({ message: 'hello' }).pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );
});
