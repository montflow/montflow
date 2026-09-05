import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiEffect from '../index.js';

const makeUi = (value: string | undefined): PiEffect.PiUi => ({
  notify: () => {},
  confirm: () => Promise.resolve(true),
  select: () => Promise.resolve(undefined),
  input: () => Promise.resolve(value),
});

Vitest.describe('PiEffect.input runtime', () => {
  Vitest.it.effect('resolves the entered value', () =>
    Effect.gen(function* () {
      const result = yield* PiEffect.input(makeUi('daniel'), 'Name', 'hint');
      Vitest.expect(result).toBe('daniel');
    }),
  );

  Vitest.it.effect('resolves undefined when the dialog is cancelled', () =>
    Effect.gen(function* () {
      const result = yield* PiEffect.input(makeUi(undefined), 'Name', 'hint');
      Vitest.expect(result).toBeUndefined();
    }),
  );
});
