import * as Vitest from '@effect/vitest';

import * as PositiveNumber from '../index.js';

Vitest.describe('PositiveNumber.fromNumber runtime', () => {
  Vitest.it('returns the branded value for valid input', () => {
    Vitest.expect(PositiveNumber.fromNumber(3)).toBe(3);
  });

  Vitest.it('throws for non-positive input', () => {
    Vitest.expect(() => PositiveNumber.fromNumber(0)).toThrow();
  });
});

Vitest.describe('PositiveNumber.toNumber runtime', () => {
  Vitest.it('returns the underlying number', () => {
    Vitest.expect(PositiveNumber.toNumber(PositiveNumber.makeUnsafe(3))).toBe(3);
  });
});
