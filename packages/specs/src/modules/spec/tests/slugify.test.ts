import * as Vitest from '@effect/vitest';
import * as Spec from '../index.js';

Vitest.describe('Spec.slugify runtime', () => {
  Vitest.it('lowercases and hyphenates display names', () => {
    Vitest.expect(Spec.slugify('Ship Spec')).toBe('ship-spec');
  });

  Vitest.it('collapses runs and trims edge hyphens', () => {
    Vitest.expect(Spec.slugify('  Ship__Spec!! ')).toBe('ship-spec');
  });
});
