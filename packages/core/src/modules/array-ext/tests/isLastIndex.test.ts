import * as Vitest from '@effect/vitest';

import * as ArrayExt from '../index.js';

Vitest.describe('ArrayExt.isLastIndex runtime', () => {
  Vitest.it('returns true only for the last index', () => {
    Vitest.expect(ArrayExt.isLastIndex([10, 20, 30], 2)).toBe(true);
    Vitest.expect(ArrayExt.isLastIndex([10, 20, 30], 0)).toBe(false);
    Vitest.expect(ArrayExt.isLastIndex([10, 20, 30], 1)).toBe(false);
    Vitest.expect(ArrayExt.isLastIndex([10, 20, 30], 3)).toBe(false);
  });

  Vitest.it('returns false for negative indices on non-empty arrays', () => {
    Vitest.expect(ArrayExt.isLastIndex([10, 20, 30], -1)).toBe(false);
  });

  Vitest.it('returns true for -1 on an empty array', () => {
    Vitest.expect(ArrayExt.isLastIndex([], -1)).toBe(true);
    Vitest.expect(ArrayExt.isLastIndex([], 0)).toBe(false);
  });

  Vitest.it('returns true for index 0 on a single-element array', () => {
    Vitest.expect(ArrayExt.isLastIndex(['only'], 0)).toBe(true);
  });
});
