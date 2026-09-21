import * as Vitest from '@effect/vitest';

import * as Float from '../index.js';

Vitest.describe('Float.fromNumber runtime', () => {
  Vitest.it('returns the branded float for valid input', () => {
    Vitest.expect(Float.fromNumber(1.5)).toBe(1.5);
  });

  Vitest.it('throws for integers', () => {
    Vitest.expect(() => Float.fromNumber(1)).toThrow();
  });
});

Vitest.describe('Float.toNumber runtime', () => {
  Vitest.it('returns the underlying number', () => {
    Vitest.expect(Float.toNumber(Float.makeUnsafe(1.5))).toBe(1.5);
  });
});
