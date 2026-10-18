import * as Vitest from '@effect/vitest';
import * as PiProfiles from '../index.js';

Vitest.describe('PiProfiles.slugify', () => {
  Vitest.it('lowercases and hyphenates display names', () => {
    Vitest.expect(PiProfiles.slugify('Code Reviewer')).toBe('code-reviewer');
  });

  Vitest.it('collapses runs and trims edge hyphens', () => {
    Vitest.expect(PiProfiles.slugify('  Security__Audit!! ')).toBe('security-audit');
  });
});
