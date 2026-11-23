import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { PRINCIPLE_NAMES, runDoctor } from '../index.js';

/**
 * The principles doctor owns the shipped principles and nothing else:
 * workspace-only principles stay user data, and `--check` writes nothing.
 */

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-principles-doctor-'));

const principleDir = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'principles', name);

const cleanup = (root: string): void => Fs.rmSync(root, { recursive: true, force: true });

Vitest.describe('principles doctor', () => {
  Vitest.it('ships at least one principle', () => {
    Vitest.expect(PRINCIPLE_NAMES).toContain('fix-root-causes');
  });

  Vitest.it.effect('installs every shipped principle and is then healthy', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const first = yield* runDoctor(root);
      Vitest.expect(first.healthy).toBe(true);
      Vitest.expect(first.status).toBe('installed');
      Vitest.expect(first.principles.map((entry) => entry.name)).toStrictEqual([
        ...PRINCIPLE_NAMES,
      ]);
      for (const name of PRINCIPLE_NAMES) {
        Vitest.expect(Fs.existsSync(NodePath.join(principleDir(root, name), 'PRINCIPLE.md'))).toBe(
          true,
        );
      }
      const second = yield* runDoctor(root, { check: true });
      Vitest.expect(second.healthy).toBe(true);
      Vitest.expect(second.status).toBe('ok');
      cleanup(root);
    }),
  );

  Vitest.it.effect('check mode reports missing principles and writes nothing', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checked.status).toBe('drifted');
      Vitest.expect(checked.principles.every((entry) => entry.status === 'missing')).toBe(true);
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);
      cleanup(root);
    }),
  );

  Vitest.it.effect('reports a stale principle and repairs it', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const name = PRINCIPLE_NAMES[0];
      if (name === undefined) return Vitest.expect.fail('expected a shipped principle');
      const file = NodePath.join(principleDir(root, name), 'PRINCIPLE.md');
      const good = Fs.readFileSync(file, 'utf8');
      Fs.writeFileSync(file, 'hand edited\n');
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.principles.find((entry) => entry.name === name)?.status).toBe('stale');
      Vitest.expect(Fs.readFileSync(file, 'utf8')).toBe('hand edited\n');
      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.healthy).toBe(true);
      Vitest.expect(Fs.readFileSync(file, 'utf8')).toBe(good);
      cleanup(root);
    }),
  );

  Vitest.it.effect('leaves a workspace-only principle untouched', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const extra = principleDir(root, 'workspace-only');
      Fs.mkdirSync(extra, { recursive: true });
      Fs.writeFileSync(NodePath.join(extra, 'PRINCIPLE.md'), 'mine\n');
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(true);
      yield* runDoctor(root);
      Vitest.expect(Fs.readFileSync(NodePath.join(extra, 'PRINCIPLE.md'), 'utf8')).toBe('mine\n');
      cleanup(root);
    }),
  );
});
