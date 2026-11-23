import * as Vitest from '@effect/vitest';
import * as Skill from '../index.js';

Vitest.describe('Skill.slugify', () => {
  Vitest.it('lowercases and hyphenates display names', () => {
    Vitest.expect(Skill.slugify('Code Reviewer')).toBe('code-reviewer');
  });

  Vitest.it('collapses runs and trims edge hyphens', () => {
    Vitest.expect(Skill.slugify('  Security__Audit!! ')).toBe('security-audit');
  });
});
