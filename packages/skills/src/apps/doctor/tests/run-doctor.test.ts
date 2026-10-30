import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Doctor from '../index.js';

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-skills-doctor-'));

/** Overwrite the installed copy of a skill, creating it if absent. */
const install = async (root: string, name: string, body: string): Promise<void> => {
  const dir = join(root, '.agents', 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), body, 'utf8');
};

/** Contents of an installed skill file, or undefined when absent. */
const readInstalled = async (root: string, name: string): Promise<string | undefined> => {
  try {
    return await readFile(join(root, '.agents', 'skills', name, 'SKILL.md'), 'utf8');
  } catch {
    return undefined;
  }
};

Vitest.describe('Doctor.runDoctor', () => {
  Vitest.it.effect('installs every shipped skill into a bare repo', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const result = yield* Doctor.runDoctor(root);
      Vitest.expect(result.healthy).toBe(true);
      Vitest.expect(result.status).toBe('repaired');
      Vitest.expect(result.skills.map((skill) => skill.status)).toStrictEqual(
        Doctor.SKILL_NAMES.map(() => 'installed'),
      );
      for (const name of Doctor.SKILL_NAMES) {
        Vitest.expect(yield* Effect.promise(() => readInstalled(root, name))).toBeDefined();
      }
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('is idempotent: a second run reports everything up to date', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Doctor.runDoctor(root);
      const second = yield* Doctor.runDoctor(root);
      Vitest.expect(second.status).toBe('ok');
      Vitest.expect(second.healthy).toBe(true);
      Vitest.expect(second.skills.every((skill) => skill.status === 'ok')).toBe(true);
      Vitest.expect(second.message).toContain('installed and up to date');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('repairs a stale copy so a drifted skill does not linger', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Doctor.runDoctor(root);
      const name = Doctor.SKILL_NAMES[0];
      const good = yield* Effect.promise(() => readInstalled(root, name));
      yield* Effect.promise(() => install(root, name, '# edited by hand and now out of date\n'));
      const repaired = yield* Doctor.runDoctor(root);
      Vitest.expect(repaired.status).toBe('repaired');
      Vitest.expect(repaired.skills.find((skill) => skill.name === name)?.status).toBe('repaired');
      Vitest.expect(yield* Effect.promise(() => readInstalled(root, name))).toBe(good);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('check mode reports staleness without writing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Doctor.runDoctor(root);
      const name = Doctor.SKILL_NAMES[0];
      yield* Effect.promise(() => install(root, name, 'drifted\n'));
      const checked = yield* Doctor.runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checked.status).toBe('drifted');
      Vitest.expect(checked.skills.find((skill) => skill.name === name)?.status).toBe('stale');
      Vitest.expect(yield* Effect.promise(() => readInstalled(root, name))).toBe('drifted\n');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('check mode reports a missing skill as unhealthy', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const checked = yield* Doctor.runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checked.skills.every((skill) => skill.status === 'missing')).toBe(true);
      Vitest.expect(checked.message).toContain('not usable');
      Vitest.expect(checked.message).toContain('/mf-skills doctor');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('names the caller the fix line came from', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const checked = yield* Doctor.runDoctor(root, {
        check: true,
        invocation: 'mf-skills doctor',
      });
      Vitest.expect(checked.message).toContain('Run: mf-skills doctor');
      Vitest.expect(checked.message).not.toContain('Run: /mf-skills doctor');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('detects an installed copy holding extra files', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Doctor.runDoctor(root);
      const name = Doctor.SKILL_NAMES[0];
      yield* Effect.promise(() =>
        writeFile(join(root, '.agents', 'skills', name, 'stray.md'), 'x', 'utf8'),
      );
      const checked = yield* Doctor.runDoctor(root, { check: true });
      const entry = checked.skills.find((skill) => skill.name === name);
      Vitest.expect(entry?.status).toBe('mismatched');
      Vitest.expect(entry?.detail).toContain('stray.md');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );
});
