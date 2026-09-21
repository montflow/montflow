import * as Vitest from '@effect/vitest';

import * as Float from '../index.js';

Vitest.describe('Float.check runtime', () => {
  Vitest.it('accepts finite non-integers', () => {
    Vitest.expect(Float.check(3.14)).toBe(true);
    Vitest.expect(Float.check(-0.5)).toBe(true);
  });

  Vitest.it('rejects integers with a message', () => {
    Vitest.expect(Float.check(1)).toBe('Float must be a finite non-integer');
    Vitest.expect(Float.check(0)).toBe('Float must be a finite non-integer');
  });

  Vitest.it('rejects NaN and infinities with a message', () => {
    Vitest.expect(Float.check(Number.NaN)).toBe('Float must be a finite non-integer');
    Vitest.expect(Float.check(Number.POSITIVE_INFINITY)).toBe('Float must be a finite non-integer');
  });

  Vitest.it('rejects non-numbers with a message', () => {
    Vitest.expect(Float.check('3.14')).toBe('Float must be a finite non-integer');
  });
});
