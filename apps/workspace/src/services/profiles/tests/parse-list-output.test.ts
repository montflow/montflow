import * as Vitest from '@effect/vitest';
import * as Profiles from '../index.js';

const listed = (): string =>
  [
    'Project packages:',
    '  ../packages/pi-profiles',
    '    /home/daniel/dev/montflow/main/packages/pi-profiles',
  ].join('\n');

Vitest.describe('Profiles.parseListOutput runtime', () => {
  Vitest.it('reads pi-profiles in pi list output as installed', () => {
    Vitest.expect(Profiles.parseListOutput(listed())).toStrictEqual(true);
  });

  Vitest.it('reads pi list output without pi-profiles as missing', () => {
    Vitest.expect(
      Profiles.parseListOutput('Project packages:\n  ../packages/pi-prompts'),
    ).toStrictEqual(false);
  });

  Vitest.it('reads blank output as missing', () => {
    Vitest.expect(Profiles.parseListOutput('')).toStrictEqual(false);
  });
});
