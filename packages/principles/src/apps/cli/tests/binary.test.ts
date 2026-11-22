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

Vitest.describe('mf-principles binary', () => {
  Vitest.it('doctor installs the sample, then list, show, and verify agree', () => {
    const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-principles-bin-'));
    try {
      Vitest.expect(run(['doctor', '--check', '--dir', root]).status).toBe(1);
      Vitest.expect(run(['doctor', '--dir', root]).status).toBe(0);
      Vitest.expect(run(['doctor', '--check', '--dir', root]).status).toBe(0);

      const list = run(['list', '--dir', root]);
      Vitest.expect(list.status).toBe(0);
      Vitest.expect(list.stdout).toMatch(/^fix-root-causes: Apply when debugging\./m);

      const file = NodePath.join(root, '.agents/@montflow/principles/fix-root-causes/PRINCIPLE.md');
      const show = run(['show', 'fix-root-causes', '--dir', root]);
      Vitest.expect(show.stdout).toBe(Fs.readFileSync(file, 'utf8'));
      Vitest.expect(run(['show', 'nope', '--dir', root]).status).toBe(1);

      const verify = run(['verify', '--all', '--dir', root]);
      Vitest.expect(verify.status).toBe(0);
      Vitest.expect(verify.stdout.trim()).toMatch(/^summary entries=\d+ issues=0 warnings=0$/);

      Fs.writeFileSync(file, '# no frontmatter\n');
      Vitest.expect(run(['verify', 'fix-root-causes', '--dir', root]).status).toBe(1);
      Vitest.expect(run(['verify', 'fix-root-causes', '--all', '--dir', root]).status).toBe(1);
    } finally {
      Fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
