import * as Vitest from '@effect/vitest';

import * as PositiveNumber from '../index.js';

Vitest.describe('PositiveNumber.check runtime', () => {
  Vitest.it('accepts positive finite numbers', () => {
    Vitest.expect(PositiveNumber.check(1)).toBe(true);
    Vitest.expect(PositiveNumber.check(0.5)).toBe(true);
  });

  Vitest.it('rejects zero and negative numbers with a message', () => {
    Vitest.expect(PositiveNumber.check(0)).toBe('PositiveNumber must be a positive finite number');
    Vitest.expect(PositiveNumber.check(-1)).toBe('PositiveNumber must be a positive finite number');
  });

  Vitest.it('rejects NaN and infinities with a message', () => {
    Vitest.expect(PositiveNumber.check(Number.NaN)).toBe(
      'PositiveNumber must be a positive finite number',
    );
    Vitest.expect(PositiveNumber.check(Number.POSITIVE_INFINITY)).toBe(
      'PositiveNumber must be a positive finite number',
    );
  });

  Vitest.it('rejects non-numbers with a message', () => {
    Vitest.expect(PositiveNumber.check('1')).toBe(
      'PositiveNumber must be a positive finite number',
    );
  });
});
