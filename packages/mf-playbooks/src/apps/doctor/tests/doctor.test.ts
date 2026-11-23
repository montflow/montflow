import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { PLAYBOOK_NAMES, runDoctor } from '../index.js';

/**
 * The playbooks doctor owns the shipped playbooks and nothing else:
 * workspace-only playbooks stay user data, and `--check` writes nothing.
 */

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-playbooks-doctor-'));

const playbookDir = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'playbooks', name);

const cleanup = (root: string): void => Fs.rmSync(root, { recursive: true, force: true });

Vitest.describe('playbooks doctor', () => {
  Vitest.it('ships at least one playbook', () => {
    Vitest.expect(PLAYBOOK_NAMES).toContain('opening-a-pr');
  });

  Vitest.it.effect('installs every shipped playbook and is then healthy', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const first = yield* runDoctor(root);
      Vitest.expect(first.healthy).toBe(true);
      Vitest.expect(first.status).toBe('installed');
      Vitest.expect(first.playbooks.map((entry) => entry.name)).toStrictEqual([...PLAYBOOK_NAMES]);
      for (const name of PLAYBOOK_NAMES) {
        Vitest.expect(Fs.existsSync(NodePath.join(playbookDir(root, name), 'PLAYBOOK.md'))).toBe(
          true,
        );
      }
      const second = yield* runDoctor(root, { check: true });
      Vitest.expect(second.healthy).toBe(true);
      Vitest.expect(second.status).toBe('ok');
      cleanup(root);
    }),
  );

  Vitest.it.effect('check mode reports missing playbooks and writes nothing', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(false);
      Vitest.expect(checked.status).toBe('drifted');
      Vitest.expect(checked.playbooks.every((entry) => entry.status === 'missing')).toBe(true);
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);
      cleanup(root);
    }),
  );

  Vitest.it.effect('reports a stale playbook and repairs it', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const name = PLAYBOOK_NAMES[0];
      if (name === undefined) return Vitest.expect.fail('expected a shipped playbook');
      const file = NodePath.join(playbookDir(root, name), 'PLAYBOOK.md');
      const good = Fs.readFileSync(file, 'utf8');
      Fs.writeFileSync(file, 'hand edited\n');
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.playbooks.find((entry) => entry.name === name)?.status).toBe('stale');
      Vitest.expect(Fs.readFileSync(file, 'utf8')).toBe('hand edited\n');
      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.healthy).toBe(true);
      Vitest.expect(Fs.readFileSync(file, 'utf8')).toBe(good);
      cleanup(root);
    }),
  );

  Vitest.it.effect('leaves a workspace-only playbook untouched', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const extra = playbookDir(root, 'workspace-only');
      Fs.mkdirSync(extra, { recursive: true });
      Fs.writeFileSync(NodePath.join(extra, 'PLAYBOOK.md'), 'mine\n');
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.healthy).toBe(true);
      yield* runDoctor(root);
      Vitest.expect(Fs.readFileSync(NodePath.join(extra, 'PLAYBOOK.md'), 'utf8')).toBe('mine\n');
      cleanup(root);
    }),
  );
});
