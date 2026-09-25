import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Runs from '../index.js';

const listed = (): string =>
  [
    'Project packages:',
    '  ../packages/pi-runs',
    '    /home/daniel/dev/montflow/main/packages/pi-runs',
  ].join('\n');

Vitest.describe('Runs.parseListOutput runtime', () => {
  Vitest.it('reads pi-runs in pi list output as installed', () => {
    Vitest.expect(Runs.parseListOutput(listed())).toStrictEqual(true);
  });

  Vitest.it('reads pi list output without pi-runs as missing', () => {
    Vitest.expect(
      Runs.parseListOutput('Project packages:\n  ../packages/pi-profiles'),
    ).toStrictEqual(false);
  });

  Vitest.it('reads blank output as missing', () => {
    Vitest.expect(Runs.parseListOutput('')).toStrictEqual(false);
  });

  Vitest.it('does not read a lookalike package as installed', () => {
    Vitest.expect(
      Runs.parseListOutput('Project packages:\n  ../packages/not-pi-runs-x\n  pi-runs-extra'),
    ).toStrictEqual(false);
  });

  Vitest.it('reads the scoped package name as installed', () => {
    Vitest.expect(Runs.parseListOutput('  @montflow/pi-runs')).toStrictEqual(true);
  });
});

Vitest.describe('Runs.isRunsExtensionInstallError', () => {
  Vitest.it('matches only the exact install hint', () => {
    Vitest.expect(Runs.isRunsExtensionInstallError(Runs.RUNS_EXTENSION_INSTALL_HINT)).toBe(true);
    Vitest.expect(Runs.isRunsExtensionInstallError('Runs extension not installed')).toBe(false);
  });
});

Vitest.describe('Runs.runsExtensionInstalled runtime', () => {
  Vitest.afterEach(() => {
    Runs.setExtensionProbe(undefined);
  });

  Vitest.it.effect('honors an injected probe without shelling out', () =>
    Effect.gen(function* () {
      Runs.setExtensionProbe(() => Effect.succeed(true));
      Vitest.expect(yield* Runs.runsExtensionInstalled('/tmp')).toStrictEqual(true);
      Runs.setExtensionProbe(() => Effect.succeed(false));
      Vitest.expect(yield* Runs.runsExtensionInstalled('/tmp')).toStrictEqual(false);
    }),
  );
});
