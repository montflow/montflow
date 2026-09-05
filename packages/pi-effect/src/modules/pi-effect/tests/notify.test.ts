import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiEffect from '../index.js';

const makeUi = (overrides?: Partial<PiEffect.PiUi>): PiEffect.PiUi => ({
  notify: () => {},
  confirm: () => Promise.resolve(true),
  select: () => Promise.resolve(undefined),
  input: () => Promise.resolve(undefined),
  ...overrides,
});

Vitest.describe('PiEffect.notify runtime', () => {
  Vitest.it.effect('delivers the message and severity to ui.notify', () =>
    Effect.gen(function* () {
      const seen: Array<{ message: string; type: 'info' | 'warning' | 'error' | undefined }> = [];
      const ui = makeUi({
        notify: (message, type) => {
          seen.push({ message, type });
        },
      });
      yield* PiEffect.notify(ui, 'hello', 'info');
      Vitest.expect(seen).toStrictEqual([{ message: 'hello', type: 'info' }]);
    }),
  );

  Vitest.it.effect('omits severity when none is given', () =>
    Effect.gen(function* () {
      const seen: Array<{ message: string; type: 'info' | 'warning' | 'error' | undefined }> = [];
      const ui = makeUi({
        notify: (message, type) => {
          seen.push({ message, type });
        },
      });
      yield* PiEffect.notify(ui, 'hello');
      Vitest.expect(seen).toStrictEqual([{ message: 'hello', type: undefined }]);
    }),
  );
});
