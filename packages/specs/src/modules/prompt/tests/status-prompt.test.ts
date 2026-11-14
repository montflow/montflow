import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptExecute, PromptStore, Prompts, SpecSource } from '@montflow/prompts';
import { Effect, FileSystem, Layer, Schema } from 'effect';
import { runDoctor } from '../../doctor/index.js';
import * as Which from '../../which/index.js';
import { load } from '../prompt.module.js';

/**
 * `spec-status` is the read-only counterpart to `spec-execute`. These tests pin
 * the canonical file, the three-variable contract, every I001 report section and
 * terminal line, the `/mf-prompts` picker source, and the read-only boundary.
 * Every run uses a throwaway root, so the real prompt store is never written.
 */

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const CANONICAL = NodePath.join(PACKAGE_ROOT, 'prompts', 'spec-status.json');

/** The exact declared order the template must follow. */
const VARIABLES = ['name', 'focus', 'root'] as const;

/** The ten report sections I001 fixed, in order. */
const SECTIONS = [
  'Declared status',
  'Derived lifecycle state',
  'Active phase',
  'Locked phases',
  'Task counts',
  'Phase review budgets',
  'Ready set',
  'Verification result and blocking codes',
  'Review evidence',
  'Next command',
] as const;

/** The commands the reporter may run; all are read-only. */
const READ_COMMANDS = ['state', 'status', 'next', 'check', 'review decide', 'which'] as const;

const Platform = Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer);
const StoreLive = Layer.provideMerge(PromptStore.Default, Platform);

const installedFile = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'prompts', `${name}.json`);

/** A scoped temp directory, removed by the test runtime. */
const scopedRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-status-prompt-' });
});

/** Doctor installs the prompt and its one doctor-owned skill. */
const doctor = (root: string) => runDoctor(root);

/** Render the canonical reporter in a fresh doctor-installed root. */
const render = (values: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const root = yield* scopedRoot;
    yield* doctor(root);
    return yield* load(root, 'spec-status', values);
  }).pipe(Effect.provide(StoreLive));

/** The canonical prompt, decoded and verified from the package file. */
const canonical = () => {
  const raw = Fs.readFileSync(CANONICAL, 'utf-8');
  return {
    raw,
    prompt: Schema.decodeUnknownSync(Prompts.FromJson)(raw),
    verified: Prompts.verifyPromptFile('spec-status', raw),
  };
};

const entry = (name: string, state: SpecSource.SpecState): SpecSource.SpecEntry => ({
  name,
  state,
});

Vitest.describe('spec-status prompt file', () => {
  Vitest.it('verifies, declares the three variables in order, and sources name from specs', () => {
    const { prompt, verified } = canonical();
    Vitest.expect(verified.valid).toBe(true);
    Vitest.expect(prompt.name).toBe('spec-status');
    Vitest.expect(prompt.model).toBe('');
    Vitest.expect(prompt.variables.map((variable) => variable.name)).toStrictEqual([...VARIABLES]);
    Vitest.expect(Prompts.templateVariables(prompt.template)).toStrictEqual([...VARIABLES]);

    const name = prompt.variables[0];
    Vitest.expect(name?.required).toBe(true);
    Vitest.expect(name?.source).toBe('specs');

    const focus = prompt.variables[1];
    Vitest.expect(focus?.required).toBe(false);
    Vitest.expect(focus?.source).toBeUndefined();

    const root = prompt.variables[2];
    Vitest.expect(root?.internal).toBe(true);
    Vitest.expect(root?.required).toBe(false);

    Vitest.expect(prompt.skills).toStrictEqual(['montflow-find-specs']);
  });

  Vitest.it('carries every I001 section from the derived commands', () => {
    const { prompt } = canonical();
    for (const section of SECTIONS) Vitest.expect(prompt.template).toContain(section);
    for (const command of READ_COMMANDS)
      Vitest.expect(prompt.template).toContain(`mf-specs ${command}`);

    for (const line of [
      'inconsistent · codes <check codes or none>',
      'blocked <state blocker codes or no codes>',
      'complete · every phase locked',
      'no active phase · spec.no-active-phase',
      'unreadable SPEC.md · no code / SPEC.md',
    ]) {
      Vitest.expect(prompt.template).toContain(line);
    }
  });

  Vitest.it('selects the unreadable line before the state lines when SPEC.md is missing', () => {
    const { prompt } = canonical();
    const precedence = prompt.template.indexOf(
      'A missing or unreadable `SPEC.md` selects the `unreadable SPEC.md` line before the state lines',
    );
    Vitest.expect(precedence).toBeGreaterThan(-1);
    Vitest.expect(precedence).toBeLessThan(prompt.template.indexOf('- `inconsistent · codes'));
  });

  Vitest.it('the generic fill path omits --dir when root is unanswered', () => {
    const { prompt } = canonical();
    const accepted = PromptExecute.resolveInputs(prompt, { name: 'ship-login' });
    Vitest.expect(accepted.problems).toStrictEqual([]);
    const text = Prompts.renderToString(prompt.template, prompt.variables, accepted.values);
    Vitest.expect(text).not.toContain('--dir "');
    Vitest.expect(text).toContain('No workspace was resolved for this render');
  });
});

Vitest.describe('spec-status renders', () => {
  Vitest.it.effect('renders the spec and every section in order', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ name: 'ship-login' });
      Vitest.expect(loaded.text).toContain('ship-login');

      let cursor = -1;
      for (const section of SECTIONS) {
        const at = loaded.text.indexOf(section);
        Vitest.expect(at, section).toBeGreaterThan(cursor);
        cursor = at;
      }
      for (const command of READ_COMMANDS) {
        Vitest.expect(loaded.text).toContain(`mf-specs ${command}`);
      }
      Vitest.expect(loaded.text).not.toContain('Focus this report on:');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders focus only when the user supplies it', () =>
    Effect.gen(function* () {
      const focused = yield* render({ name: 'ship-login', focus: 'review risk' });
      Vitest.expect(focused.text).toContain('Focus this report on: review risk');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('carries the resolved workspace into every command form', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ name: 'ship-login', root: '/other/workspace' });
      Vitest.expect(loaded.text).toContain('--dir "/other/workspace"');
      Vitest.expect(loaded.text).toContain(
        'mf-specs check --name ship-login --verbose --dir "/other/workspace"',
      );
      Vitest.expect(loaded.text).not.toContain('--dir "$PWD"');
      Vitest.expect(loaded.text).not.toContain('No workspace was resolved for this render');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('omits --dir entirely when the generic render supplies no workspace', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ name: 'ship-login' });
      Vitest.expect(loaded.text).not.toContain('--dir "');
      Vitest.expect(loaded.text).not.toContain('--dir ""');
      Vitest.expect(loaded.text).toContain('No workspace was resolved for this render');
      Vitest.expect(loaded.text).toContain('mf-specs check --name ship-login --verbose');
      Vitest.expect(loaded.text).toContain('mf-specs which');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('an inconsistent render names the blocker and the repair command', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ name: 'ship-login' });
      Vitest.expect(loaded.text).toContain('inconsistent · codes');
      Vitest.expect(loaded.text).toContain('mf-specs check --name ship-login --verbose');
      Vitest.expect(loaded.text).toContain('blocked <state blocker codes or no codes>');
      Vitest.expect(loaded.text).toContain('never invent one');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('a complete render claims no pending work and stops', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ name: 'ship-login' });
      Vitest.expect(loaded.text).toContain(
        'complete · every phase locked · next mf-specs check --name ship-login --require-complete',
      );
      Vitest.expect(loaded.text).toContain('no pending work');
      Vitest.expect(loaded.text).toContain('stops');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('doctor installs the packaged prompt bytes', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      Vitest.expect(Fs.readFileSync(installedFile(root, 'spec-status'), 'utf-8')).toBe(
        Fs.readFileSync(CANONICAL, 'utf-8'),
      );
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('spec-status read-only boundary', () => {
  Vitest.it('states the boundary in imperative language and names no write or dispatch', () => {
    const { prompt } = canonical();
    const text = prompt.template;

    for (const boundary of [
      'Read-only boundary',
      'Do not write `SPEC.md`',
      'Do not edit a status, a lock',
      'Do not dispatch a worker',
      'Do not mutate git',
    ]) {
      Vitest.expect(text).toContain(boundary);
    }

    for (const forbidden of [
      'subagent',
      'spec_status',
      'claim',
      'gate run',
      'gate record',
      'stamp',
      'waiver',
      'git commit',
      'git push',
      'git checkout',
      'git switch',
    ]) {
      Vitest.expect(new RegExp(`\\b${forbidden}\\b`, 'u').test(text.toLowerCase())).toBe(false);
    }
  });
});

Vitest.describe('spec-status picker source', () => {
  Vitest.it('preselects the branch guess and orders pending specs before complete ones', () => {
    const { prompt } = canonical();
    Vitest.expect(prompt.variables[0]?.source).toBe('specs');

    const names = ['montflow-spec-standard', 'other'];
    const guess = SpecSource.guess(names, 'feat/montflow-spec');
    Vitest.expect(guess).toBe('montflow-spec-standard');

    const ordered = SpecSource.order(
      [
        entry('a-complete', 'complete'),
        entry('b-pending', 'pending'),
        entry('montflow-spec-standard', 'pending'),
        entry('c-complete', 'complete'),
      ],
      guess,
    );
    Vitest.expect(ordered.map((item) => item.name)).toStrictEqual([
      'montflow-spec-standard',
      'b-pending',
      'a-complete',
      'c-complete',
    ]);
  });

  Vitest.it('resolves the same branch identically in the picker and the entry point', () => {
    const names = ['montflow-spec-standard', 'spec-standard', 'ship-login', 'ship'];
    const branches = [
      'feat/montflow-spec-standard',
      'feat/montflow-spec',
      'feat/spec-standard',
      'feat/ship',
      'feat/spec',
      'feat/unknown',
      'spec-standard',
    ];

    for (const branch of branches) {
      const picker = SpecSource.guess(names, branch);
      const parsed = Which.parseBranch(branch);
      const matched = parsed.ok ? Which.matchFeature(parsed.feature, names) : undefined;
      const entryPoint = matched?.ok === true ? matched.name : undefined;
      Vitest.expect(picker, branch).toBe(entryPoint);
    }
  });
});
