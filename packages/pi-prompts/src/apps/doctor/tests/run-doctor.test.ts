import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Doctor from '../index.js';

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-prompts-doctor-'));

/** A `SkillStatus` for a skill that is not installed. */
const broken = (name: string): Doctor.SkillStatus => ({
  name,
  status: 'missing',
  source: '',
  target: '',
  detail: 'not installed',
});

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
      // Untouched: check mode must not repair.
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
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('check mode is clean right after a repairing install', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Doctor.runDoctor(root);
      const checked = yield* Doctor.runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(true);
      Vitest.expect(checked.status).toBe('ok');
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

  Vitest.it.effect('reinstalls a copy whose payload file was deleted', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Doctor.runDoctor(root);
      const name = Doctor.SKILL_NAMES[1];
      const good = yield* Effect.promise(() => readInstalled(root, name));
      yield* Effect.promise(() =>
        rm(join(root, '.agents', 'skills', name, 'CHANGELOG.md'), { force: true }),
      );
      const repaired = yield* Doctor.runDoctor(root);
      Vitest.expect(repaired.healthy).toBe(true);
      Vitest.expect(yield* Effect.promise(() => readInstalled(root, name))).toBe(good);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );
});

Vitest.describe('Doctor.doctorGateMessage', () => {
  Vitest.it('is two lines naming the problem and the fix', () => {
    const message = Doctor.doctorGateMessage({
      status: 'drifted',
      healthy: false,
      message: '',
      skills: [
        {
          name: 'montflow-execute-pi-prompts',
          status: 'stale',
          source: '/pkg/skills/montflow-execute-pi-prompts',
          target: '/repo/.agents/skills/montflow-execute-pi-prompts',
          detail: 'SKILL.md differs from the packaged version',
        },
      ],
    });
    Vitest.expect(message.split('\n').length).toBe(2);
    Vitest.expect(message).toContain('montflow-execute-pi-prompts');
    Vitest.expect(message).toContain('SKILL.md differs');
    Vitest.expect(message).toContain('/mf-prompts doctor');
  });

  Vitest.it('defaults to the slash form, since the slash command has no binary on PATH', () => {
    // The default is for the slash command, registered through
    // `pi.registerCommand`, so the leading slash is the only correct way to
    // name it. The binary overrides this with its bare `mf-prompts doctor`.
    const message = Doctor.doctorGateMessage({
      status: 'drifted',
      healthy: false,
      message: '',
      skills: [{ name: 'a', status: 'missing', source: '', target: '', detail: 'not installed' }],
    });
    Vitest.expect(message).toContain('`/mf-prompts doctor`');
    Vitest.expect(message).not.toMatch(/(^|[^/`])mf-prompts doctor/u);
  });

  Vitest.it('takes the invocation the caller supplies, slash or bare', () => {
    const result = {
      status: 'drifted',
      healthy: false,
      message: '',
      skills: [{ name: 'a', status: 'missing', source: '', target: '', detail: 'not installed' }],
    } as const;
    Vitest.expect(Doctor.doctorGateMessage(result, 'mf-prompts doctor')).toContain(
      '`mf-prompts doctor`',
    );
    Vitest.expect(Doctor.doctorGateMessage(result, '/mf-prompts doctor')).toContain(
      '`/mf-prompts doctor`',
    );
  });

  Vitest.it('lists every broken skill', () => {
    const message = Doctor.doctorGateMessage({
      status: 'drifted',
      healthy: false,
      message: '',
      skills: [broken('a'), broken('b')],
    });
    Vitest.expect(message).toContain('a (not installed); b (not installed)');
  });
});
