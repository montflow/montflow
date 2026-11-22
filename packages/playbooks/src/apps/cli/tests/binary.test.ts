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

Vitest.describe('mf-playbooks binary', () => {
  Vitest.it('doctor installs the sample, then list, show, and verify agree', () => {
    const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-playbooks-bin-'));
    try {
      Vitest.expect(run(['doctor', '--check', '--dir', root]).status).toBe(1);
      Vitest.expect(run(['doctor', '--dir', root]).status).toBe(0);
      Vitest.expect(run(['doctor', '--check', '--dir', root]).status).toBe(0);

      const list = run(['list', '--dir', root]);
      Vitest.expect(list.status).toBe(0);
      Vitest.expect(list.stdout).toMatch(/^opening-a-pr: /m);

      const file = NodePath.join(root, '.agents/@montflow/playbooks/opening-a-pr/PLAYBOOK.md');
      const show = run(['show', 'opening-a-pr', '--dir', root]);
      Vitest.expect(show.stdout).toBe(Fs.readFileSync(file, 'utf8'));
      Vitest.expect(run(['show', 'nope', '--dir', root]).status).toBe(1);

      const verify = run(['verify', 'opening-a-pr', '--dir', root]);
      Vitest.expect(verify.status).toBe(0);
      Vitest.expect(verify.stdout.trim()).toBe(
        'warn opening-a-pr [body] No list item: number the steps (`1.`) or list the rules (`-`).\nsummary entries=1 issues=0 warnings=1',
      );

      // Playbooks name skills and principles from other stores; a bare workspace has none.
      const all = run(['verify', '--all', '--dir', root]);
      Vitest.expect(all.status).toBe(1);
      Vitest.expect(all.stdout).toMatch(/\[principles\] Principle '[a-z-]+' does not exist/);

      Fs.writeFileSync(file, '# no frontmatter\n');
      Vitest.expect(run(['verify', 'opening-a-pr', '--dir', root]).status).toBe(1);
      Vitest.expect(run(['verify', 'opening-a-pr', '--all', '--dir', root]).status).toBe(1);
    } finally {
      Fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
