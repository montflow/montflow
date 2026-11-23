import { spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';

/**
 * The real binary, spawned: exit codes are set inside the handlers, `show`
 * prints bytes unchanged, and the verbs compose over one workspace root.
 */

const MAIN = NodePath.resolve(import.meta.dirname, '..', 'main.ts');

const run = (args: ReadonlyArray<string>) => {
  const result = spawnSync('bun', ['run', MAIN, ...args], {
    encoding: 'utf8',
    // oxlint-disable-next-line montflow/no-process-env -- the spawned binary needs the runner's PATH; only the update-check opt-out is added.
    env: { ...process.env, MONTFLOW_NO_UPDATE_CHECK: '1' },
  });
  return { status: result.status, stdout: result.stdout };
};

Vitest.describe('mf-mode playbooks binary', () => {
  Vitest.it('doctor installs the sample, then list, show, and verify agree', () => {
    const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-playbooks-bin-'));
    try {
      Vitest.expect(run(['doctor', '--check', '--dir', root]).status).toBe(1);
      Vitest.expect(run(['doctor', '--dir', root]).status).toBe(0);
      Vitest.expect(run(['doctor', '--check', '--dir', root]).status).toBe(0);

      const list = run(['playbooks', 'list', '--dir', root]);
      Vitest.expect(list.status).toBe(0);
      Vitest.expect(list.stdout).toMatch(/^opening-a-pr: /m);

      const file = NodePath.join(root, '.agents/@montflow/playbooks/opening-a-pr/PLAYBOOK.md');
      const show = run(['playbooks', 'show', 'opening-a-pr', '--dir', root]);
      Vitest.expect(show.stdout).toBe(Fs.readFileSync(file, 'utf8'));
      Vitest.expect(run(['playbooks', 'show', 'nope', '--dir', root]).status).toBe(1);

      const verify = run(['playbooks', 'verify', 'opening-a-pr', '--dir', root]);
      Vitest.expect(verify.status).toBe(0);
      Vitest.expect(verify.stdout.trim()).toBe(
        'warn opening-a-pr [body] No list item: number the steps (`1.`) or list the rules (`-`).\nsummary entries=1 issues=0 warnings=1',
      );

      // One doctor installs the skills and principles the playbooks name, so the store verifies.
      Vitest.expect(run(['playbooks', 'verify', '--all', '--dir', root]).status).toBe(0);

      // Remove the principles store and every reference to it breaks.
      Fs.rmSync(NodePath.join(root, '.agents/@montflow/principles'), { recursive: true });
      const all = run(['playbooks', 'verify', '--all', '--dir', root]);
      Vitest.expect(all.status).toBe(1);
      Vitest.expect(all.stdout).toMatch(/\[principles\] Principle '[a-z-]+' does not exist/);

      Fs.writeFileSync(file, '# no frontmatter\n');
      Vitest.expect(run(['playbooks', 'verify', 'opening-a-pr', '--dir', root]).status).toBe(1);
      Vitest.expect(
        run(['playbooks', 'verify', 'opening-a-pr', '--all', '--dir', root]).status,
      ).toBe(1);
    } finally {
      Fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
