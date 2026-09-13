import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

const listed = (): string =>
  [
    'Project packages:',
    '  ../packages/pi-prompts',
    '    /home/daniel/dev/montflow/main/packages/pi-prompts',
  ].join('\n');

Vitest.describe('Prompts.parseListOutput runtime', () => {
  Vitest.it('reads pi-prompts in pi list output as installed', () => {
    Vitest.expect(Prompts.parseListOutput(listed())).toStrictEqual(true);
  });

  Vitest.it('reads pi list output without pi-prompts as missing', () => {
    Vitest.expect(
      Prompts.parseListOutput('Project packages:\n  ../packages/pi-skills'),
    ).toStrictEqual(false);
  });

  Vitest.it('reads blank output as missing', () => {
    Vitest.expect(Prompts.parseListOutput('')).toStrictEqual(false);
  });
});

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
