import * as Vitest from '@effect/vitest';
import * as Skill from '../index.js';

Vitest.describe('Skill.isValidName', () => {
  Vitest.it('accepts lowercase hyphen-separated slugs', () => {
    Vitest.expect(Skill.isValidName('code-reviewer')).toBe(true);
    Vitest.expect(Skill.isValidName('a')).toBe(true);
  });

  Vitest.it('rejects uppercase, spaces, and edge hyphens', () => {
    Vitest.expect(Skill.isValidName('Code-Reviewer')).toBe(false);
    Vitest.expect(Skill.isValidName('code reviewer')).toBe(false);
    Vitest.expect(Skill.isValidName('-code')).toBe(false);
    Vitest.expect(Skill.isValidName('')).toBe(false);
  });
});
