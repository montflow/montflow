import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { PROFILE_NAMES, runDoctor } from '../index.js';

/**
 * The profiles doctor is the last package to gain an installable payload. It
 * owns the six shipped profiles and nothing else: workspace-only profiles stay
 * user data, and `--check` writes nothing.
 */

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-profiles-doctor-'));

const profileDir = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'profiles', name);

const cleanup = (root: string): void => Fs.rmSync(root, { recursive: true, force: true });

Vitest.describe('profiles doctor', () => {
  Vitest.it.effect('installs every shipped profile and is then healthy', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const first = yield* runDoctor(root);
      Vitest.expect(first.healthy).toBe(true);
      Vitest.expect(first.status).toBe('installed');
      Vitest.expect(first.profiles.map((profile) => profile.name)).toStrictEqual([
        ...PROFILE_NAMES,
      ]);
      for (const name of PROFILE_NAMES) {
        Vitest.expect(Fs.existsSync(NodePath.join(profileDir(root, name), 'PROFILE.md'))).toBe(
          true,
        );
      }
      const second = yield* runDoctor(root, { check: true });
      Vitest.expect(second.healthy).toBe(true);
      Vitest.expect(second.status).toBe('ok');
      cleanup(root);
    }),
  );

  Vitest.it.effect('check mode reports missing profiles and writes nothing', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checked.status).toBe('drifted');
      Vitest.expect(checked.profiles.every((profile) => profile.status === 'missing')).toBe(true);
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);
      cleanup(root);
    }),
  );

  Vitest.it.effect('reports a stale profile and repairs it', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const name = PROFILE_NAMES[0];
      const file = NodePath.join(profileDir(root, name), 'PROFILE.md');
      const good = Fs.readFileSync(file, 'utf8');
      Fs.writeFileSync(file, 'hand edited\n');
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.profiles.find((profile) => profile.name === name)?.status).toBe(
        'stale',
      );
      Vitest.expect(Fs.readFileSync(file, 'utf8')).toBe('hand edited\n');
      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.healthy).toBe(true);
      Vitest.expect(Fs.readFileSync(file, 'utf8')).toBe(good);
      cleanup(root);
    }),
  );

  Vitest.it.effect('reports a missing shipped file as mismatched and restores it', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const name = PROFILE_NAMES[0];
      const file = NodePath.join(profileDir(root, name), 'PROFILE.md');
      Fs.rmSync(file);
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.profiles.find((profile) => profile.name === name)?.status).toBe(
        'mismatched',
      );
      yield* runDoctor(root);
      Vitest.expect(Fs.existsSync(file)).toBe(true);
      cleanup(root);
    }),
  );

  Vitest.it.effect('leaves a workspace-only profile untouched', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const extra = profileDir(root, 'workspace-only');
      Fs.mkdirSync(extra, { recursive: true });
      Fs.writeFileSync(NodePath.join(extra, 'PROFILE.md'), 'mine\n');
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(true);
      yield* runDoctor(root);
      Vitest.expect(Fs.readFileSync(NodePath.join(extra, 'PROFILE.md'), 'utf8')).toBe('mine\n');
      cleanup(root);
    }),
  );
});
