import * as Vitest from '@effect/vitest';
import * as Profiles from '../index.js';

Vitest.describe('Profiles.isValidName', () => {
  Vitest.it('accepts lowercase hyphen-separated slugs', () => {
    Vitest.expect(Profiles.isValidName('code-reviewer')).toBe(true);
    Vitest.expect(Profiles.isValidName('a')).toBe(true);
  });

  Vitest.it('rejects uppercase, spaces, and edge hyphens', () => {
    Vitest.expect(Profiles.isValidName('Code-Reviewer')).toBe(false);
    Vitest.expect(Profiles.isValidName('code reviewer')).toBe(false);
    Vitest.expect(Profiles.isValidName('-code')).toBe(false);
    Vitest.expect(Profiles.isValidName('')).toBe(false);
  });
});
