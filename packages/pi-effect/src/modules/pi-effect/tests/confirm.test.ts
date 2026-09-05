import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiEffect from '../index.js';

const makeUi = (answer: boolean): PiEffect.PiUi => ({
  notify: () => {},
  confirm: () => Promise.resolve(answer),
  select: () => Promise.resolve(undefined),
  input: () => Promise.resolve(undefined),
});

Vitest.describe('PiEffect.confirm runtime', () => {
  Vitest.it.effect('resolves true when the dialog is confirmed', () =>
    Effect.gen(function* () {
      const result = yield* PiEffect.confirm(makeUi(true), 'Sure?', 'Proceed?');
      Vitest.expect(result).toBe(true);
    }),
  );

  Vitest.it.effect('resolves false when the dialog is dismissed', () =>
    Effect.gen(function* () {
      const result = yield* PiEffect.confirm(makeUi(false), 'Sure?', 'Proceed?');
      Vitest.expect(result).toBe(false);
    }),
  );
});
