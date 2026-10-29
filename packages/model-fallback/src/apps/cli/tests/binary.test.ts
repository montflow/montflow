import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackStore } from '../../../modules/index.js';

/** Run one case against a throwaway workspace, always deleting it afterwards. */
const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
  });

const seedStore = (root: string, text: string): Effect.Effect<void> =>
  Effect.promise(async () => {
    const target = FallbackStore.file(root);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  });

/** This package's root: the working directory `bun run --cwd packages/model-fallback` uses. */
const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

/** Run `src/apps/cli/main.ts` the way a user does: the real binary, real argv. */
const runBinary = (args: ReadonlyArray<string>) => {
  const result = spawnSync('bun', ['run', 'src/apps/cli/main.ts', ...args], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    output: `${result.stdout}${result.stderr}`,
  };
};

Vitest.describe('mf-model-fallback binary status', () => {
  Vitest.it.effect(
    'serializes the chain as provider/model labels in JSON',
    () =>
      withTempDir((root) =>
        Effect.gen(function* () {
          yield* seedStore(root, '{"version":1,"chain":["a/one","b/two"],"triggers":["auth"]}\n');

          const result = yield* Effect.sync(() => runBinary(['status', '--json', '--dir', root]));

          Vitest.expect(result.status).toBe(0);
          // SAFETY: the binary prints the `status` engine result as JSON; only `chain` is read.
          const parsed = JSON.parse(result.stdout) as { chain: ReadonlyArray<string> };
          Vitest.expect(parsed.chain).toStrictEqual(['a/one', 'b/two']);
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'status --check exits 1 without a chain and 0 once a store exists',
    () =>
      withTempDir((root) =>
        Effect.gen(function* () {
          const unconfigured = yield* Effect.sync(() =>
            runBinary(['status', '--check', '--dir', root]),
          );

          Vitest.expect(unconfigured.status).toBe(1);
          Vitest.expect(unconfigured.output).toContain('No chain configured');

          yield* seedStore(root, '{"version":1,"chain":["a/one"],"triggers":["auth"]}\n');

          const configured = yield* Effect.sync(() =>
            runBinary(['status', '--check', '--dir', root]),
          );

          Vitest.expect(configured.status).toBe(0);
        }),
      ),
    30_000,
  );
});
