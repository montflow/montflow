import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Sessions from '../index.js';

const listed = (): string =>
  [
    'Project packages:',
    '  ../packages/pi-sessions',
    '    /home/daniel/dev/montflow/main/packages/pi-sessions',
  ].join('\n');

Vitest.describe('Sessions.parseListOutput runtime', () => {
  Vitest.it('reads pi-sessions in pi list output as installed', () => {
    Vitest.expect(Sessions.parseListOutput(listed())).toStrictEqual(true);
  });

  Vitest.it('reads pi list output without pi-sessions as missing', () => {
    Vitest.expect(
      Sessions.parseListOutput('Project packages:\n  ../packages/pi-profiles'),
    ).toStrictEqual(false);
  });

  Vitest.it('reads blank output as missing', () => {
    Vitest.expect(Sessions.parseListOutput('')).toStrictEqual(false);
  });

  Vitest.it('does not read a lookalike package as installed', () => {
    Vitest.expect(
      Sessions.parseListOutput(
        'Project packages:\n  ../packages/not-pi-sessions-x\n  pi-sessions-extra',
      ),
    ).toStrictEqual(false);
  });

  Vitest.it('reads the scoped package name as installed', () => {
    Vitest.expect(Sessions.parseListOutput('  @montflow/pi-sessions')).toStrictEqual(true);
  });
});

Vitest.describe('Sessions.isSessionsExtensionInstallError', () => {
  Vitest.it('matches only the exact install hint', () => {
    Vitest.expect(
      Sessions.isSessionsExtensionInstallError(Sessions.SESSIONS_EXTENSION_INSTALL_HINT),
    ).toBe(true);
    Vitest.expect(
      Sessions.isSessionsExtensionInstallError('Sessions extension not installed'),
    ).toBe(false);
  });
});

Vitest.describe('Sessions.sessionsExtensionInstalled runtime', () => {
  Vitest.afterEach(() => {
    Sessions.setExtensionProbe(undefined);
  });

  Vitest.it.effect('honors an injected probe without shelling out', () =>
    Effect.gen(function* () {
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      Vitest.expect(yield* Sessions.sessionsExtensionInstalled('/tmp')).toStrictEqual(true);
      Sessions.setExtensionProbe(() => Effect.succeed(false));
      Vitest.expect(yield* Sessions.sessionsExtensionInstalled('/tmp')).toStrictEqual(false);
    }),
  );
});
