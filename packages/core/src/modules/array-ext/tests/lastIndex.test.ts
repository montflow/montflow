import * as Vitest from '@effect/vitest';

import * as ArrayExt from '../index.js';

Vitest.describe('ArrayExt.lastIndex runtime', () => {
  Vitest.it('returns the index of the last element', () => {
    Vitest.expect(ArrayExt.lastIndex([10, 20, 30])).toBe(2);
    Vitest.expect(ArrayExt.lastIndex(['only'])).toBe(0);
  });

  Vitest.it('returns -1 for an empty array', () => {
    Vitest.expect(ArrayExt.lastIndex([])).toBe(-1);
  });

  Vitest.it('accepts a readonly array', () => {
    const values = [1, 2] as const;
    Vitest.expect(ArrayExt.lastIndex(values)).toBe(1);
  });
});
