import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Vitest from '@effect/vitest';

/**
 * `@effect/vitest` only runs an `Effect` body when it is registered through
 * `it.effect`. Registered with plain `it`, the returned `Effect` is not
 * thenable, so vitest treats the body as a synchronous test that returns a
 * value and never executes it — the test passes while asserting nothing. That
 * is silent lost coverage, so the shape is guarded mechanically here rather
 * than by review.
 */

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
);

/** Directories whose suites must use `it.effect` for Effect bodies. */
const GUARDED_DIRS = [
  resolve(REPO_ROOT, 'packages', 'prompts', 'src'),
  resolve(REPO_ROOT, 'apps', 'workspace', 'src', 'services', 'prompts'),
] as const;

/** An `it` registration whose body returns an `Effect`, i.e. never runs. */
const PLAIN_IT_WITH_EFFECT_BODY =
  /\b(?:Vitest\.)?it\(\s*(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)\s*,\s*(?:\(\s*\)|[A-Za-z_$][\w$]*)\s*=>\s*Effect\./u;

/** Every test file under `dir`, recursively. */
const testFiles = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.test.ts'))
    .map((entry) => join(dir, entry));

Vitest.describe('Effect test registration', () => {
  Vitest.it.each(GUARDED_DIRS)('%s: registers every Effect body with it.effect', (dir) => {
    const offenders = testFiles(dir).filter((file) =>
      PLAIN_IT_WITH_EFFECT_BODY.test(readFileSync(file, 'utf8')),
    );
    Vitest.expect(offenders).toStrictEqual([]);
  });
});
