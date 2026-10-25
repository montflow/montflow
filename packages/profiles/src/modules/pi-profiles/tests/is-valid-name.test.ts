import * as Vitest from '@effect/vitest';
import * as PiProfiles from '../index.js';

Vitest.describe('PiProfiles.isValidName', () => {
  Vitest.it('accepts lowercase hyphen-separated slugs', () => {
    Vitest.expect(PiProfiles.isValidName('code-reviewer')).toBe(true);
    Vitest.expect(PiProfiles.isValidName('a')).toBe(true);
  });

  Vitest.it('rejects uppercase, spaces, and edge hyphens', () => {
    Vitest.expect(PiProfiles.isValidName('Code-Reviewer')).toBe(false);
    Vitest.expect(PiProfiles.isValidName('code reviewer')).toBe(false);
    Vitest.expect(PiProfiles.isValidName('-code')).toBe(false);
    Vitest.expect(PiProfiles.isValidName('')).toBe(false);
  });
});
