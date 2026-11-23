import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { PROFILE_NAMES, SKILL_NAMES, runDoctor } from '../index.js';

/**
 * The mode doctor owns the shipped mf-mode skills and profiles and nothing
 * else: other skills stay user data, nested skill files install, and
 * `--check` writes nothing.
 */

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-doctor-'));
const cleanup = (root: string): void => Fs.rmSync(root, { recursive: true, force: true });

Vitest.describe('mode doctor', () => {
  Vitest.it('ships the mf-mode skills and both profiles', () => {
    Vitest.expect(SKILL_NAMES).toContain('mf-mode');
    Vitest.expect(
      SKILL_NAMES.every((name) => name === 'mf-mode' || name.startsWith('mf-mode-')),
    ).toBe(true);
    Vitest.expect([...PROFILE_NAMES]).toEqual(['mf-mode-comment-sicko', 'mf-mode-generic-worker']);
  });

  Vitest.it.effect('installs nested skill files and profiles, then reports healthy', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      Vitest.expect((yield* runDoctor(root, { check: true })).healthy).toBe(false);
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);

      const first = yield* runDoctor(root);
      Vitest.expect(first.healthy).toBe(true);
      Vitest.expect(
        Fs.existsSync(NodePath.join(root, '.agents/skills/mf-mode/references/harnesses.md')),
      ).toBe(true);
      Vitest.expect(
        Fs.existsSync(
          NodePath.join(root, '.agents/@montflow/profiles/mf-mode-generic-worker/PROFILE.md'),
        ),
      ).toBe(true);
      Vitest.expect((yield* runDoctor(root, { check: true })).status).toBe('ok');
      cleanup(root);
    }),
  );

  Vitest.it.effect('repairs a stale nested file and leaves other skills alone', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const nested = NodePath.join(root, '.agents/skills/mf-mode/references/harnesses.md');
      const good = Fs.readFileSync(nested, 'utf8');
      Fs.writeFileSync(nested, 'hand edited\n');
      const mine = NodePath.join(root, '.agents/skills/my-skill/SKILL.md');
      Fs.mkdirSync(NodePath.dirname(mine), { recursive: true });
      Fs.writeFileSync(mine, 'mine\n');

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.installs.find((entry) => entry.name === 'mf-mode')?.status).toBe(
        'stale',
      );
      Vitest.expect((yield* runDoctor(root)).healthy).toBe(true);
      Vitest.expect(Fs.readFileSync(nested, 'utf8')).toBe(good);
      Vitest.expect(Fs.readFileSync(mine, 'utf8')).toBe('mine\n');
      cleanup(root);
    }),
  );
});
