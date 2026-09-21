import * as Vitest from '@effect/vitest';

import * as NumberExt from '../index.js';

Vitest.describe('NumberExt.isMultiple runtime', () => {
  Vitest.it('returns true when self is a multiple of of', () => {
    Vitest.expect(NumberExt.isMultiple(9, 3)).toBe(true);
    Vitest.expect(NumberExt.isMultiple(0, 3)).toBe(true);
    Vitest.expect(NumberExt.isMultiple(-9, 3)).toBe(true);
  });

  Vitest.it('returns false when self is not a multiple of of', () => {
    Vitest.expect(NumberExt.isMultiple(9, 4)).toBe(false);
  });

  Vitest.it('returns false when of is zero', () => {
    Vitest.expect(NumberExt.isMultiple(9, 0)).toBe(false);
  });

  Vitest.it('supports the data-last form', () => {
    const isMultipleOf3 = NumberExt.isMultiple(3);
    Vitest.expect(isMultipleOf3(9)).toBe(true);
    Vitest.expect(isMultipleOf3(10)).toBe(false);
  });
});
