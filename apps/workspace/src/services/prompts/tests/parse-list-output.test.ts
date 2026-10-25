import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

Vitest.describe('Prompts.isValidPromptId', () => {
  Vitest.it('accepts kebab-case slugs', () => {
    Vitest.expect(Prompts.isValidPromptId('audit-code')).toStrictEqual(true);
  });

  Vitest.it('refuses traversal and blanks', () => {
    Vitest.expect(Prompts.isValidPromptId('../escape')).toStrictEqual(false);
    Vitest.expect(Prompts.isValidPromptId('')).toStrictEqual(false);
    Vitest.expect(Prompts.isValidPromptId('Upper_Case')).toStrictEqual(false);
  });
});
