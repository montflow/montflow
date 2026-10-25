import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

Vitest.describe('Prompts.isValidName runtime', () => {
  Vitest.it('accepts lowercase hyphen-separated slugs', () => {
    Vitest.expect(Prompts.isValidName('code-reviewer')).toBe(true);
    Vitest.expect(Prompts.isValidName('commit')).toBe(true);
    Vitest.expect(Prompts.isValidName('a')).toBe(true);
  });

  Vitest.it('rejects uppercase, spaces, and edge or repeated hyphens', () => {
    Vitest.expect(Prompts.isValidName('Code-Reviewer')).toBe(false);
    Vitest.expect(Prompts.isValidName('code reviewer')).toBe(false);
    Vitest.expect(Prompts.isValidName('-code')).toBe(false);
    Vitest.expect(Prompts.isValidName('code-')).toBe(false);
    Vitest.expect(Prompts.isValidName('code--reviewer')).toBe(false);
    Vitest.expect(Prompts.isValidName('')).toBe(false);
  });
});
