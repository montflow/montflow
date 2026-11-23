import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

Vitest.describe('Prompts.slugify runtime', () => {
  Vitest.it('lowercases and hyphenates display names', () => {
    Vitest.expect(Prompts.slugify('Code Reviewer')).toBe('code-reviewer');
  });

  Vitest.it('collapses runs and trims edge separators', () => {
    Vitest.expect(Prompts.slugify('  Security__Audit!! ')).toBe('security-audit');
    Vitest.expect(Prompts.slugify('--Code--Reviewer--')).toBe('code-reviewer');
  });
});
