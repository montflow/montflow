import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Doctor from '../index.js';
import { git, makeWorkspace, realLive } from '../../cli/tests/fixtures.js';

/**
 * `doctor` is the only writer of the workspace scaffolding and the installed
 * skills, so these tests hold both halves: it must repair what it owns, and
 * `--check` must be a true no-op even when the workspace is broken.
 */

const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-references-doctor-'));

const run = (root: string, options: Doctor.DoctorOptions = {}) =>
  Doctor.runDoctor(root, options).pipe(Effect.provide(realLive));

const cleanup = (root: string): Promise<void> => rm(root, { recursive: true, force: true });

const read = (root: string, name: string, file: string): Promise<string> =>
  readFile(join(root, '.agents', 'skills', name, file), 'utf8');

const fileExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const exists = (target: string): Effect.Effect<boolean> => Effect.promise(() => fileExists(target));

const checkNamed = (result: Doctor.DoctorResult, name: string): Doctor.DoctorCheck | undefined =>
  result.checks.find((entry) => entry.name === name);

Vitest.describe('Doctor.runDoctor skills', () => {
  Vitest.it.effect('installs every shipped skill into a bare repo', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const result = yield* run(root);
      Vitest.expect(result.healthy).toBe(true);
      Vitest.expect(result.status).toBe('repaired');
      Vitest.expect(result.checks.map((entry) => entry.name)).toStrictEqual([
        ...Doctor.CHECK_NAMES,
      ]);
      Vitest.expect(checkNamed(result, 'skills-installed')?.status).toBe('repaired');
      for (const name of Doctor.SKILL_NAMES) {
        Vitest.expect(yield* Effect.promise(() => read(root, name, 'SKILL.md'))).toContain(
          `name: ${name}`,
        );
        Vitest.expect(yield* Effect.promise(() => read(root, name, 'CHANGELOG.md'))).toContain(
          '# Changelog',
        );
      }
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('is idempotent: a second run reports everything ok', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* run(root);
      const second = yield* run(root);
      Vitest.expect(second.healthy).toBe(true);
      Vitest.expect(second.status).toBe('ok');
      Vitest.expect(second.checks.every((entry) => entry.status === 'ok')).toBe(true);
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('repairs a stale skill copy', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* run(root);
      const name = Doctor.SKILL_NAMES[0];
      const good = yield* Effect.promise(() => read(root, name, 'SKILL.md'));
      yield* Effect.promise(() =>
        writeFile(join(root, '.agents', 'skills', name, 'SKILL.md'), '# edited by hand\n'),
      );
      const repaired = yield* run(root);
      Vitest.expect(checkNamed(repaired, 'skills-current')?.status).toBe('repaired');
      Vitest.expect(checkNamed(repaired, 'skills-current')?.detail).toContain(`rewrote ${name}`);
      Vitest.expect(yield* Effect.promise(() => read(root, name, 'SKILL.md'))).toBe(good);
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('check mode reports a stale copy as drift and writes nothing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* run(root);
      const name = Doctor.SKILL_NAMES[0];
      yield* Effect.promise(() =>
        writeFile(join(root, '.agents', 'skills', name, 'SKILL.md'), 'drifted\n'),
      );
      const checked = yield* run(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checked.status).toBe('drifted');
      const current = checkNamed(checked, 'skills-current');
      Vitest.expect(current?.status).toBe('drifted');
      Vitest.expect(current?.detail).toContain(`stale ${name}`);
      Vitest.expect(yield* Effect.promise(() => read(root, name, 'SKILL.md'))).toBe('drifted\n');
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('check mode reports a mismatched file set; repair restores it', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* run(root);
      const name = Doctor.SKILL_NAMES[0];
      yield* Effect.promise(() => rm(join(root, '.agents', 'skills', name, 'CHANGELOG.md')));
      const checked = yield* run(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checkNamed(checked, 'skills-current')?.detail).toContain(`mismatched ${name}`);
      Vitest.expect(
        yield* Effect.promise(() =>
          fileExists(join(root, '.agents', 'skills', name, 'CHANGELOG.md')),
        ),
      ).toBe(false);

      const repaired = yield* run(root);
      Vitest.expect(checkNamed(repaired, 'skills-current')?.status).toBe('repaired');
      Vitest.expect(
        yield* Effect.promise(() =>
          fileExists(join(root, '.agents', 'skills', name, 'CHANGELOG.md')),
        ),
      ).toBe(true);
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('reports an extra installed file and stays healthy', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* run(root);
      const name = Doctor.SKILL_NAMES[0];
      yield* Effect.promise(() =>
        writeFile(join(root, '.agents', 'skills', name, 'stray.md'), 'x', 'utf8'),
      );
      const checked = yield* run(root, { check: true });
      Vitest.expect(checked.healthy).toBe(true);
      Vitest.expect(checkNamed(checked, 'skills-current')?.detail).toContain(
        'extra file(s): stray.md',
      );
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('warns about the retired generic skill names without failing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      for (const name of Doctor.RETIRED_SKILL_NAMES) {
        yield* Effect.promise(() =>
          mkdir(join(root, '.agents', 'skills', name), { recursive: true }),
        );
      }
      const result = yield* run(root);
      Vitest.expect(result.healthy).toBe(true);
      const retired = checkNamed(result, 'retired-skills');
      Vitest.expect(retired?.warning).toBe(true);
      Vitest.expect(retired?.detail).toContain('adding-references');
      Vitest.expect(retired?.detail).toContain('finding-references');
      Vitest.expect(retired?.detail).toContain('git rm -r');
      yield* Effect.promise(() => cleanup(root));
    }),
  );
});

Vitest.describe('Doctor.runDoctor workspace', () => {
  Vitest.it.effect('creates the store root, clone root, .gitkeep, and ignore rule', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const result = yield* run(root);
      Vitest.expect(result.healthy).toBe(true);
      Vitest.expect(checkNamed(result, 'store-root')?.status).toBe('repaired');
      Vitest.expect(checkNamed(result, 'clone-root')?.status).toBe('repaired');
      Vitest.expect(checkNamed(result, 'gitkeep')?.status).toBe('repaired');
      Vitest.expect(checkNamed(result, 'gitignore')?.status).toBe('repaired');
      Vitest.expect(yield* exists(join(root, '.agents', 'references', '.gitkeep'))).toBe(true);
      Vitest.expect(yield* Effect.promise(() => readFile(join(root, '.gitignore'), 'utf8'))).toBe(
        '.agents/references\n',
      );
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('a missing ignore rule is repaired without touching other lines', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeFile(join(root, '.gitignore'), 'node_modules', 'utf8'));
      const checked = yield* run(root, { check: true });
      Vitest.expect(checkNamed(checked, 'gitignore')?.status).toBe('drifted');
      Vitest.expect(yield* Effect.promise(() => readFile(join(root, '.gitignore'), 'utf8'))).toBe(
        'node_modules',
      );

      const repaired = yield* run(root);
      Vitest.expect(checkNamed(repaired, 'gitignore')?.status).toBe('repaired');
      Vitest.expect(yield* Effect.promise(() => readFile(join(root, '.gitignore'), 'utf8'))).toBe(
        'node_modules\n.agents/references\n',
      );
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('a missing .gitkeep is recreated and staged in a git work tree', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      yield* run(root);
      yield* Effect.promise(() => rm(join(root, '.agents', 'references', '.gitkeep')));
      const repaired = yield* run(root);
      Vitest.expect(checkNamed(repaired, 'gitkeep')?.status).toBe('repaired');
      Vitest.expect(
        yield* Effect.promise(() => git(root, ['ls-files', '.agents/references'])),
      ).toContain('.agents/references/.gitkeep');
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('mirrors the checkout when no clone exists', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const result = yield* run(root);
      Vitest.expect(result.healthy).toBe(true);
      Vitest.expect(checkNamed(result, 'registry')?.detail).toContain('issues=0');
      Vitest.expect(yield* exists(join(root, '.agents', 'references'))).toBe(true);
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('reports an invalid registry entry with its entry and field', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dir = join(root, '.agents', '@montflow', 'references', 'bad');
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      yield* Effect.promise(() =>
        writeFile(
          join(dir, 'REFERENCE.md'),
          [
            '---',
            'name: bad',
            'url: ssh://git@example.test/owner/bad.git',
            'purpose: Invalid entry for a doctor test.',
            'added: 2026-10-26',
            '---',
            '',
            '# Notes',
            '',
          ].join('\n'),
          'utf8',
        ),
      );
      const result = yield* run(root);
      Vitest.expect(result.healthy).toBe(false);
      const registry = checkNamed(result, 'registry');
      Vitest.expect(registry?.status).toBe('drifted');
      Vitest.expect(registry?.detail).toContain('.agents/@montflow/references/bad/REFERENCE.md');
      Vitest.expect(registry?.detail).toContain('[url]');
      yield* Effect.promise(() => cleanup(root));
    }),
  );

  Vitest.it.effect('check mode writes nothing and exits unhealthy', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const checked = yield* run(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checked.status).toBe('drifted');
      Vitest.expect(yield* exists(join(root, '.agents'))).toBe(false);
      Vitest.expect(yield* exists(join(root, '.gitignore'))).toBe(false);
      yield* Effect.promise(() => cleanup(root));
    }),
  );
});

Vitest.describe('Doctor.doctorGateMessage', () => {
  Vitest.it('is two lines naming the problem and the fix', () => {
    const message = Doctor.doctorGateMessage({
      status: 'drifted',
      healthy: false,
      checks: [
        {
          name: 'store-root',
          status: 'drifted',
          detail: 'missing .agents/@montflow/references',
        },
      ],
    });
    Vitest.expect(message.split('\n').length).toBe(2);
    Vitest.expect(message).toContain('store-root');
    Vitest.expect(message).toContain('/mf-references doctor');
  });
});
