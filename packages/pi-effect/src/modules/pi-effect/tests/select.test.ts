import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiEffect from '../index.js';

const makeUi = (choice: string | undefined): PiEffect.PiUi => ({
  notify: () => {},
  confirm: () => Promise.resolve(true),
  select: () => Promise.resolve(choice),
  input: () => Promise.resolve(undefined),
});

Vitest.describe('PiEffect.select runtime', () => {
  Vitest.it.effect('resolves the picked option', () =>
    Effect.gen(function* () {
      const result = yield* PiEffect.select(makeUi('b'), 'Pick', ['a', 'b']);
      Vitest.expect(result).toBe('b');
    }),
  );

  Vitest.it.effect('resolves undefined when the dialog is cancelled', () =>
    Effect.gen(function* () {
      const result = yield* PiEffect.select(makeUi(undefined), 'Pick', ['a', 'b']);
      Vitest.expect(result).toBeUndefined();
    }),
  );
});
