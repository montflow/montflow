import * as Vitest from '@effect/vitest';

import * as Int from '../index.js';

Vitest.describe('Int.fromNumber runtime', () => {
  Vitest.it('returns the branded integer for valid input', () => {
    Vitest.expect(Int.fromNumber(42)).toBe(42);
  });

  Vitest.it('throws for non-integers', () => {
    Vitest.expect(() => Int.fromNumber(3.14)).toThrow();
  });
});

Vitest.describe('Int.toNumber runtime', () => {
  Vitest.it('returns the underlying number', () => {
    Vitest.expect(Int.toNumber(Int.makeUnsafe(42))).toBe(42);
  });
});
