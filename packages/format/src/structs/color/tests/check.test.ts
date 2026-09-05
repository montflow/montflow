import * as Vitest from '@effect/vitest';

import * as Color from '../index.js';

Vitest.describe('Color.check runtime', () => {
  Vitest.it('accepts each label', () => {
    for (const label of Color.LABELS) {
      Vitest.expect(Color.check(label)).toBe(true);
    }
  });

  Vitest.it('rejects unknown names', () => {
    Vitest.expect(Color.check('blurple')).toBe('Invalid Color');
  });

  Vitest.it('rejects wrong case and surrounding whitespace', () => {
    Vitest.expect(Color.check('Red')).toBe('Invalid Color');
    Vitest.expect(Color.check(' red')).toBe('Invalid Color');
    Vitest.expect(Color.check('red ')).toBe('Invalid Color');
  });

  Vitest.it('rejects empty and numeric strings', () => {
    Vitest.expect(Color.check('')).toBe('Invalid Color');
    Vitest.expect(Color.check('31')).toBe('Invalid Color');
  });
});
