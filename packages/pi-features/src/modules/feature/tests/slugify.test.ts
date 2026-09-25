import * as Vitest from '@effect/vitest';
import * as Feature from '../index.js';

Vitest.describe('Feature.slugify runtime', () => {
  Vitest.it('lowercases and hyphenates display names', () => {
    Vitest.expect(Feature.slugify('Ship Feature')).toBe('ship-feature');
  });

  Vitest.it('collapses runs and trims edge hyphens', () => {
    Vitest.expect(Feature.slugify('  Ship__Feature!! ')).toBe('ship-feature');
  });
});
