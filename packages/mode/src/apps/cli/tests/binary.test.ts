import { spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Binary } from '../index.js';

/**
 * The real binary, spawned, and the text that tells agents to call it. Every
 * `mf-mode <command>` a skill, playbook, profile, or wiki page names must be a
 * command this binary has, so an agent following the text never runs a verb
 * that does not exist.
 */

const MAIN = NodePath.resolve(import.meta.dirname, '..', 'main.ts');
const REPO = NodePath.resolve(import.meta.dirname, '../../../../../..');

const run = (args: ReadonlyArray<string>, env: Record<string, string> = {}) => {
  const result = spawnSync('bun', ['run', MAIN, ...args], {
    encoding: 'utf8',
    env: {
      // oxlint-disable-next-line montflow/no-process-env -- the spawned binary needs the runner's PATH; harness markers are cleared so detection is deterministic.
      ...process.env,
      MONTFLOW_NO_UPDATE_CHECK: '1',
      CLAUDECODE: '',
      OPENCODE: '',
      CODEX_THREAD_ID: '',
      MF_MODE_HARNESS: '',
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout };
};

/** Every Markdown file under a directory, recursively. */
const markdown = (dir: string): ReadonlyArray<string> =>
  Fs.existsSync(dir)
    ? Fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.md'))
        .map((file) => NodePath.join(dir, file))
    : [];

/** The text that tells agents (and people) to run `mf-mode`. */
const SOURCES = (): ReadonlyArray<string> => [
  ...Fs.readdirSync(NodePath.join(REPO, '.agents/skills'))
    .filter((name) => name === 'mf-mode' || name.startsWith('mf-mode-'))
    .flatMap((name) => markdown(NodePath.join(REPO, '.agents/skills', name))),
  ...markdown(NodePath.join(REPO, 'packages/playbooks/playbooks')),
  ...markdown(NodePath.join(REPO, 'packages/principles/principles')),
  ...markdown(NodePath.join(REPO, 'packages/profiles/profiles')),
  ...markdown(NodePath.join(REPO, 'scripts/mfstack')),
  NodePath.join(REPO, 'wiki/mf-mode.md'),
  NodePath.join(REPO, 'README.md'),
  NodePath.join(REPO, 'packages/mode/README.md'),
];

/** `mf-mode <word> [<word>]` in inline code or on a `$ ` command line. */
const INVOCATION = /(?:`|^\$ )mf-mode ([a-z][a-z-]*)(?: ([a-z][a-z-]*))?/gm;

const COMMANDS: ReadonlyArray<string> = Binary.COMMANDS;

Vitest.describe('mf-mode binary', () => {
  Vitest.it('has every command the COMMANDS list names', () => {
    for (const command of COMMANDS) {
      Vitest.expect(run([...command.split(' '), '--help']).status, command).toBe(0);
    }
  });

  Vitest.it('every mf-mode command named in shipped text exists', () => {
    const unknown: Array<string> = [];
    let found = 0;
    for (const file of SOURCES()) {
      const text = Fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(INVOCATION)) {
        found += 1;
        const [, first = '', second] = match;
        const ok =
          COMMANDS.includes(first) &&
          (second === undefined ||
            !COMMANDS.some((command) => command.startsWith(`${first} `)) ||
            COMMANDS.includes(`${first} ${second}`));
        if (!ok) unknown.push(`${NodePath.relative(REPO, file)}: ${match[0].replace(/^`/, '')}`);
      }
    }
    Vitest.expect(unknown).toEqual([]);
    Vitest.expect(found).toBeGreaterThan(0);
  });

  Vitest.it('set, resolve, verify, and dispatch agree over one workspace', () => {
    const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-bin-'));
    try {
      Vitest.expect(run(['roles', 'verify', '--dir', root]).status).toBe(0);
      Vitest.expect(
        run(['roles', 'set', 'feature', '--seat', 'codex:fable', '--dir', root]).status,
      ).toBe(1);
      Vitest.expect(
        run([
          'roles',
          'set',
          'feature',
          '--seat',
          'claude-code:opus:xhigh,codex:gpt-5.5:high',
          '--dir',
          root,
        ]).status,
      ).toBe(0);
      Vitest.expect(run(['roles', '--dir', root]).stdout).toContain(
        'feature: claude-code:opus:xhigh,codex:gpt-5.5:high',
      );

      Vitest.expect(run(['roles', 'resolve', 'feature', '--dir', root]).status).toBe(1);
      const fromCodex = run(['roles', 'resolve', 'feature', '--harness', 'codex', '--dir', root]);
      Vitest.expect(fromCodex.stdout).toMatch(/^seat=1 run=(dispatch|native|dropped) /m);

      const native = run(['roles', 'resolve', 'feature', '--dir', root], {
        MF_MODE_HARNESS: 'claude-code',
      });
      Vitest.expect(native.stdout).toContain(
        'seat=1 run=native harness=claude-code model=opus effort=xhigh',
      );

      Fs.writeFileSync(NodePath.join(root, 'brief.md'), 'Do it.\n');
      const refused = run(
        [
          'dispatch',
          'feature',
          '--brief',
          NodePath.join(root, 'brief.md'),
          '--profile',
          'none',
          '--dry-run',
          '--dir',
          root,
        ],
        { MF_MODE_HARNESS: 'claude-code' },
      );
      Vitest.expect(refused.status).toBe(1);
      Vitest.expect(refused.stdout).toContain('runs natively on claude-code');

      Vitest.expect(run(['roles', 'verify', '--dir', root]).stdout.trim()).toBe(
        'summary issues=0 warnings=0',
      );
    } finally {
      Fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
