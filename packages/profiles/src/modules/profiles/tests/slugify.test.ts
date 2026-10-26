import * as Vitest from '@effect/vitest';
import * as Profiles from '../index.js';

Vitest.describe('Profiles.slugify', () => {
  Vitest.it('lowercases and hyphenates display names', () => {
    Vitest.expect(Profiles.slugify('Code Reviewer')).toBe('code-reviewer');
  });

  Vitest.it('collapses runs and trims edge hyphens', () => {
    Vitest.expect(Profiles.slugify('  Security__Audit!! ')).toBe('security-audit');
  });
});
