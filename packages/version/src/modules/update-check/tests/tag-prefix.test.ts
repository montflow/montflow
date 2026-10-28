import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as UpdateCheck from '../index.js';

/**
 * The tag prefix the update check parses must be the prefix changesets writes.
 *
 * This runs the installed `@changesets/cli tag` against a throwaway git
 * fixture, so neither side is a restatement of the other: changesets produces
 * the tag and `versionOfTag` parses it.
 */

const require = createRequire(import.meta.url);

const changesetsBin = (): string => {
  const manifest = require.resolve('@changesets/cli/package.json');
  return join(dirname(manifest), 'bin.js');
};

const git = (cwd: string, args: ReadonlyArray<string>): string => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

Vitest.describe('UpdateCheck tag prefix runtime', () => {
  Vitest.it.effect('parses the tag changesets produces for a package version', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-tag-prefix-')));
      try {
        yield* Effect.promise(async () => {
          await mkdir(join(root, '.changeset'), { recursive: true });
          await mkdir(join(root, 'packages', 'skills'), { recursive: true });
          await writeFile(
            join(root, 'package.json'),
            JSON.stringify({
              name: 'fixture',
              private: true,
              version: '0.0.0',
              workspaces: ['packages/*'],
            }),
          );
          await writeFile(
            join(root, 'packages', 'skills', 'package.json'),
            JSON.stringify({
              name: '@montflow/skills',
              private: true,
              version: '0.0.9',
            }),
          );
          await writeFile(
            join(root, '.changeset', 'config.json'),
            JSON.stringify({
              changelog: false,
              commit: false,
              fixed: [],
              linked: [],
              access: 'restricted',
              baseBranch: 'main',
              updateInternalDependencies: 'patch',
              ignore: [],
              privatePackages: { version: true, tag: true },
            }),
          );
          git(root, ['init', '-b', 'main']);
          // Annotated tags need a committer identity; `-c user.*` on the
          // commit does not persist it to the repository.
          git(root, ['config', 'user.name', 'Test']);
          git(root, ['config', 'user.email', 'test@example.com']);
          git(root, ['add', '.']);
          git(root, ['-c', 'user.name=T', '-c', 'user.email=t@e', 'commit', '-m', 'fixture']);
        });

        const tagged = yield* Effect.sync(() =>
          spawnSync(process.execPath, [changesetsBin(), 'tag'], {
            cwd: root,
            encoding: 'utf8',
          }),
        );
        Vitest.expect(tagged.status, tagged.stderr).toBe(0);

        const tags = yield* Effect.sync(() =>
          git(root, ['tag', '--list']).split('\n').filter(Boolean),
        );
        Vitest.expect(tags).toContain('@montflow/skills@0.0.9');

        const tag = tags.find((candidate) => candidate.startsWith('@montflow/skills@')) ?? '';
        Vitest.expect(UpdateCheck.versionOfTag('@montflow/skills', `refs/tags/${tag}`)).toBe(
          '0.0.9',
        );
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }
    }),
  );
});
