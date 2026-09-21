import * as Vitest from '@effect/vitest';

import * as BrandExt from '../index.js';

Vitest.describe('BrandExt.check runtime', () => {
  const isEven = BrandExt.check(
    (value) => typeof value === 'number' && Number.isInteger(value) && value % 2 === 0,
    'must be even',
  );

  Vitest.it('returns true when the predicate accepts the value', () => {
    Vitest.expect(isEven(2)).toBe(true);
  });

  Vitest.it('returns the message when the predicate rejects the value', () => {
    Vitest.expect(isEven(3)).toBe('must be even');
    Vitest.expect(isEven('nope')).toBe('must be even');
  });
});
