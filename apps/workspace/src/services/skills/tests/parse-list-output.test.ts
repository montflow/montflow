import * as Vitest from '@effect/vitest';
import * as Skills from '../index.js';

const listed = (): string =>
  [
    'Project packages:',
    '  ../packages/pi-skills',
    '    /home/daniel/dev/montflow/main/packages/pi-skills',
  ].join('\n');

Vitest.describe('Skills.parseListOutput runtime', () => {
  Vitest.it('reads pi-skills in pi list output as installed', () => {
    Vitest.expect(Skills.parseListOutput(listed())).toStrictEqual(true);
  });

  Vitest.it('reads pi list output without pi-skills as missing', () => {
    Vitest.expect(
      Skills.parseListOutput('Project packages:\n  ../packages/pi-prompts'),
    ).toStrictEqual(false);
  });

  Vitest.it('reads blank output as missing', () => {
    Vitest.expect(Skills.parseListOutput('')).toStrictEqual(false);
  });
});
