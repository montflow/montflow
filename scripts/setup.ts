#!/usr/bin/env bun
/**
 * Set montflow up in a repository, or re-run it to add utilities or repair.
 *
 *   bun run <montflow>/scripts/setup.ts [--dir <repo>] [--only <a,b>] [--check]
 *
 * Expects this checkout at `<repo>/.agents/references/montflow` (the README's
 * Setup Prompt clones it there). Every step is an existing `mf-*` command run
 * through `bun run --cwd <montflow>/packages/<pkg> cli`, so setup does nothing
 * the CLIs do not already do:
 *
 *   1. register the checkout: `mf-references add` adopts the clone, pinned at
 *      its HEAD, and `mf-references doctor` git-ignores `.agents/references`
 *   2. install each selected utility (`mf-skills sync` for skills, `doctor`
 *      for the rest), skills first so playbook references resolve
 *   3. verify each selected utility
 *
 * `--only` picks utilities (default: all of them). `--check` installs nothing
 * and reports what is missing or stale; it exits 1 when anything is.
 * Output is one `step=… utility=… status=…` line per step, then a summary.
 * The exit code is 1 when any step failed.
 */
import { spawnSync } from 'node:child_process';
import * as Fs from 'node:fs';
import * as Path from 'node:path';

const MONTFLOW = Path.resolve(import.meta.dirname, '..');
const URL = 'https://github.com/montflow/montflow.git';
const PURPOSE = 'The montflow monorepo, the install source of its CLIs, skills and stores.';

interface Utility {
  /** Package directory under `packages/`. */
  readonly pkg: string;
  /** The CLI name, for the report. */
  readonly cli: string;
  /** Install, given the workspace root. */
  readonly install: (dir: string, check: boolean) => ReadonlyArray<string>;
  /** Verify, given the workspace root; empty when `doctor --check` is the check. */
  readonly verify: (dir: string) => ReadonlyArray<ReadonlyArray<string>>;
}

const doctor = (dir: string, check: boolean): ReadonlyArray<string> => [
  'doctor',
  ...(check ? ['--check'] : []),
  '--dir',
  dir,
];

/** Every utility, in install order: skills first, then what verifies against them. */
const UTILITIES: Readonly<Record<string, Utility>> = {
  skills: {
    pkg: 'mf-skills',
    cli: 'mf-skills',
    install: (dir, check) => ['sync', '--source', MONTFLOW, '--target', dir, ...(check ? ['--check'] : [])],
    verify: (dir) => [['verify', '--dir', dir]],
  },
  feature: {
    pkg: 'mf-feature',
    cli: 'mf-feature',
    install: doctor,
    verify: (dir) => [['roles', 'verify', '--dir', dir]],
  },
  profiles: {
    pkg: 'mf-profiles',
    cli: 'mf-profiles',
    install: doctor,
    verify: (dir) => [['verify', '--dir', dir]],
  },
  prompts: {
    pkg: 'mf-prompts',
    cli: 'mf-prompts',
    install: doctor,
    verify: (dir) => [['verify', '--all', '--dir', dir]],
  },
  principles: {
    pkg: 'mf-principles',
    cli: 'mf-principles',
    install: doctor,
    verify: (dir) => [['verify', '--all', '--dir', dir]],
  },
  playbooks: {
    pkg: 'mf-playbooks',
    cli: 'mf-playbooks',
    install: doctor,
    verify: (dir) => [['verify', '--all', '--dir', dir]],
  },
  reviews: {
    pkg: 'mf-reviews',
    cli: 'mf-reviews',
    install: doctor,
    verify: (dir) => [['verify', '--all', '--dir', dir]],
  },
  references: {
    pkg: 'mf-references',
    cli: 'mf-references',
    install: doctor,
    verify: (dir) => [['verify', '--dir', dir]],
  },
  'model-fallback': {
    pkg: 'mf-model-fallback',
    cli: 'mf-model-fallback',
    install: doctor,
    verify: () => [],
  },
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const dir = Path.resolve(flag('dir') ?? process.cwd());
const check = argv.includes('--check');
const only = flag('only');
const selected =
  only === undefined || only === 'all'
    ? Object.keys(UTILITIES)
    : only.split(',').map((name) => name.trim()).filter((name) => name.length > 0);
const unknown = selected.filter((name) => !(name in UTILITIES));
if (unknown.length > 0) {
  console.log(`refused: unknown utilities ${unknown.join(', ')}. Pick from: ${Object.keys(UTILITIES).join(', ')}.`);
  process.exit(1);
}
// Install order is the table's order, whatever order --only gave.
const utilities = Object.keys(UTILITIES).filter((name) => selected.includes(name));

const expected = Path.join(dir, '.agents', 'references', 'montflow');
if (!Fs.existsSync(expected) || Fs.realpathSync(expected) !== Fs.realpathSync(MONTFLOW)) {
  console.log(
    `refused: this checkout must sit at ${expected}. Clone it there first: git clone ${URL} .agents/references/montflow`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

let failures = 0;

/** Run one CLI verb and print one report line; the CLI's own output only on failure. */
const run = (step: string, utility: string, pkg: string, args: ReadonlyArray<string>): boolean => {
  const result = spawnSync('bun', ['run', '--cwd', Path.join(MONTFLOW, 'packages', pkg), 'cli', ...args], {
    encoding: 'utf8',
    env: { ...process.env, MONTFLOW_NO_UPDATE_CHECK: '1' },
  });
  const ok = result.status === 0;
  console.log(`step=${step} utility=${utility} status=${ok ? 'ok' : 'failed'} command="${UTILITIES[utility]?.cli ?? pkg} ${args.map((arg) => (arg === dir ? '<repo>' : arg === MONTFLOW ? '<montflow>' : arg.includes(' ') ? JSON.stringify(arg).replaceAll('"', "'") : arg)).join(' ')}"`);
  if (!ok) {
    failures += 1;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-15);
    for (const line of output) console.log(`  ${line}`);
  }
  return ok;
};

// 1. Register this checkout and git-ignore the clones.
const entry = Path.join(dir, '.agents', '@montflow', 'references', 'montflow', 'REFERENCE.md');
if (Fs.existsSync(entry)) {
  console.log('step=register utility=references status=ok note="montflow already registered"');
} else if (check) {
  failures += 1;
  console.log('step=register utility=references status=missing note="montflow is not registered"');
} else {
  run('register', 'references', 'mf-references', ['add', URL, '--name', 'montflow', '--purpose', PURPOSE, '--dir', dir]);
}
run('register', 'references', 'mf-references', doctor(dir, check));

// 2. Install, then 3. verify, each utility.
for (const name of utilities) {
  const utility = UTILITIES[name];
  if (utility === undefined) continue;
  run(check ? 'check' : 'install', name, utility.pkg, utility.install(dir, check));
}
for (const name of utilities) {
  const utility = UTILITIES[name];
  if (utility === undefined) continue;
  for (const args of utility.verify(dir)) run('verify', name, utility.pkg, args);
}

const head = spawnSync('git', ['-C', MONTFLOW, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
console.log(
  `summary montflow=${head} utilities=${utilities.join(',')} mode=${check ? 'check' : 'install'} failed=${failures}`,
);
if (failures === 0 && !check) {
  console.log(
    'next: commit .gitignore and the .agents/ files this run wrote (never .agents/references/); run `mf-feature roles set` to choose harnesses and models per role',
  );
}
process.exitCode = failures === 0 ? 0 : 1;
