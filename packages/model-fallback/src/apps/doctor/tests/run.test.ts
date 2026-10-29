import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { PROMPT_NAMES, installedPrompt, run, shippedPromptsDir } from '../index.js';

const withTempDir = <A, E>(use: (root: string) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-fallback-')));
    return yield* use(root).pipe(
      Effect.ensuring(Effect.promise(() => rm(root, { recursive: true, force: true }))),
    );
  });

const promptName = PROMPT_NAMES[0];
const shipped = join(shippedPromptsDir(), `${promptName}.json`);

const readFileText = (file: string): Effect.Effect<string> =>
  Effect.promise(() => readFile(file, 'utf8'));

Vitest.describe('Doctor.run runtime', () => {
  Vitest.it.effect('check reports the prompt as missing and writes nothing', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* run(root, { check: true });

        Vitest.expect(result.healthy).toBe(false);
        Vitest.expect(result.artifacts).toHaveLength(1);
        Vitest.expect(result.artifacts[0]?.name).toBe('model-fallback');
        Vitest.expect(result.artifacts[0]?.status).toBe('missing');
        Vitest.expect(result.artifacts[0]?.detail).toBe('not installed');
        Vitest.expect(existsSync(installedPrompt(root, promptName))).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('installs the prompt template and reports a repair', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const result = yield* run(root);

        Vitest.expect(result.healthy).toBe(true);
        Vitest.expect(result.status).toBe('repaired');
        Vitest.expect(result.artifacts[0]?.status).toBe('installed');
        Vitest.expect(result.artifacts[0]?.target).toBe(installedPrompt(root, promptName));
        Vitest.expect(existsSync(installedPrompt(root, promptName))).toBe(true);
      }),
    ),
  );

  Vitest.it.effect('a check after install is ok and byte-identical to the packaged template', () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        yield* run(root);

        const checked = yield* run(root, { check: true });

        Vitest.expect(checked.healthy).toBe(true);
        Vitest.expect(checked.status).toBe('ok');
        Vitest.expect(checked.artifacts[0]?.status).toBe('ok');
        Vitest.expect(yield* readFileText(installedPrompt(root, promptName))).toBe(
          yield* readFileText(shipped),
        );
      }),
    ),
  );
});
