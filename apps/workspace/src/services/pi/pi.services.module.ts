// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: probes the pi CLI; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the pi probe; both go away with the Command migration.
import { promisify } from 'node:util';
import { Effect } from 'effect';

const execFileAsync = promisify(execFile);

/**
 * Parse `pi --version` stdout. Blank means unusable.
 * @param stdout - raw command stdout
 * @returns trimmed version or `unknown`
 */
export const parseVersion = (stdout: string): string => {
  const version = stdout.trim();
  return version === '' ? 'unknown' : version;
};

/**
 * True when the `pi` CLI resolves and reports a version. Slow or failing
 * probes read as missing — the dashboard cannot drive pi without it.
 * @returns installed flag, never fails
 */
export const isInstalled = (): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    execFileAsync('pi', ['--version'], { timeout: 8000 }).then(
      ({ stdout }) => parseVersion(stdout.toString()) !== 'unknown',
      () => false,
    ),
  );
