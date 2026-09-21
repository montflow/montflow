import * as Vitest from '@effect/vitest';

import * as Int from '../index.js';

Vitest.describe('Int.check runtime', () => {
  Vitest.it('accepts integers', () => {
    Vitest.expect(Int.check(0)).toBe(true);
    Vitest.expect(Int.check(42)).toBe(true);
    Vitest.expect(Int.check(-1)).toBe(true);
  });

  Vitest.it('rejects non-integers with a message', () => {
    Vitest.expect(Int.check(3.14)).toBe('Int must be an integer');
    Vitest.expect(Int.check(Number.NaN)).toBe('Int must be an integer');
    Vitest.expect(Int.check(Number.POSITIVE_INFINITY)).toBe('Int must be an integer');
  });

  Vitest.it('rejects non-numbers with a message', () => {
    Vitest.expect(Int.check('42')).toBe('Int must be an integer');
    Vitest.expect(Int.check(null)).toBe('Int must be an integer');
  });
});
