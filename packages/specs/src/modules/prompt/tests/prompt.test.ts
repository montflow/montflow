import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore, Prompts } from '@montflow/prompts';
import { Effect, FileSystem, Layer, Schema } from 'effect';
import { runDoctor } from '../../doctor/index.js';
import {
  CODES,
  DEFAULT_MODE,
  DOCTOR_FIX,
  MODE_HINT,
  PromptError,
  load,
  parseMode,
  unsupervisedOf,
} from '../prompt.module.js';

/**
 * The loader's contract: doctor proves the installed prompt is current, the
 * store and verifier come from `@montflow/prompts`, and a refusal names the
 * file plus `mf-specs doctor`. Every test uses a throwaway repo root, so the
 * real workspace prompt store is never written.
 */

const Platform = Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer);
const StoreLive = Layer.provideMerge(PromptStore.Default, Platform);

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const CREATE_PROMPT_FILE = NodePath.join(PACKAGE_ROOT, 'prompts', 'spec-create.json');

/** The authoring questions, in declaration order. */
const CREATE_VARIABLES = [
  'request',
  'notes',
  'rigor',
  'isolated',
  'origin',
  'origin_branch',
  'worktree_name',
] as const;

const RIGORS = ['trivial', 'light', 'standard', 'deep', 'critical'] as const;

/** The minimum `spec-create` answer set: every always-visible question. */
const CREATE_VALUES = { request: 'Ship login', rigor: 'standard', isolated: 'no' } as const;

/**
 * Rules that must survive both interaction modes: only asking changes, never
 * dispatch order, dependency edges, gates, review, locking, or verification.
 */
const SHARED_RULES = [
  'Dispatch the ready set',
  'depends-on',
  'gates',
  'review',
  'lock',
  'verification',
] as const;

const installedFile = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'prompts', `${name}.json`);

/** A scoped temp directory, removed by the test runtime. */
const scopedRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-prompt-' });
});

/** The two review skills the execution prompt declares but doctor does not own. */
const REVIEW_SKILLS = [
  'montflow-adversarial-review',
  'montflow-addressing-adversarial-review',
  'using-git-worktrees',
] as const;

/** Doctor plus stubs for the foreign skills, so every declared skill resolves. */
const doctor = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* runDoctor(root);
    for (const name of REVIEW_SKILLS) {
      const dir = NodePath.join(root, '.agents', 'skills', name);
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFileString(
        NodePath.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
  });

const EXECUTE_VALUES = {
  name: 'ship-login',
  state: 'state in-progress\nactive phase A',
  next: 'A001-implement ready · size small · target inherit',
  reviewBudget: '2',
} as const;

Vitest.describe('Prompt.load runtime', () => {
  Vitest.it.effect('renders spec-create with the request and its declared skill', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const loaded = yield* load(root, 'spec-create', CREATE_VALUES);
      Vitest.expect(loaded.name).toBe('spec-create');
      Vitest.expect(loaded.text).toContain('Ship login');
      Vitest.expect(loaded.text).toContain('Chosen rigor: `standard`');
      Vitest.expect(loaded.text).toContain('## 1. The user chose the rigor');
      Vitest.expect(loaded.text).toContain('## 2. Appraise against the chosen rigor');
      Vitest.expect(loaded.text).toContain('spec-appraiser');
      Vitest.expect(loaded.text).toContain('mf-specs rigor standard');
      Vitest.expect(loaded.text).toContain('## 7. Record the creation run');
      Vitest.expect(loaded.text).toContain('questions <n>/<budget>');
      Vitest.expect(loaded.text).toContain('self-reported');
      Vitest.expect(loaded.skills).toStrictEqual(['montflow-create-specs', 'using-git-worktrees']);
      Vitest.expect(loaded.prompt.skills).toStrictEqual([
        'montflow-create-specs',
        'using-git-worktrees',
      ]);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('names the orchestrator-only set and the advisory creation record', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const create = yield* load(root, 'spec-create', CREATE_VALUES);
      Vitest.expect(create.text).toContain('self-reported');
      Vitest.expect(create.text).toContain('questions <n>/<budget>');
      Vitest.expect(create.text).toContain('unresolved');

      const execute = yield* load(root, 'spec-execute', EXECUTE_VALUES);
      for (const verb of [
        'claim --start',
        'claim --block',
        'claim --close',
        'claim --release',
        'gate run',
        'mail',
      ]) {
        Vitest.expect(execute.text).toContain(verb);
      }
      Vitest.expect(execute.text).toContain('orchestrator-only');
      Vitest.expect(execute.text).toContain(
        'resets an `in-progress` or `blocked` task to `pending`',
      );
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders the optional notes only when supplied', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const plain = yield* load(root, 'spec-create', CREATE_VALUES);
      Vitest.expect(plain.text).not.toContain('Extra constraints');

      const noted = yield* load(root, 'spec-create', {
        ...CREATE_VALUES,
        notes: 'Do not touch packages/core.',
      });
      Vitest.expect(noted.text).toContain('Extra constraints');
      Vitest.expect(noted.text).toContain('Do not touch packages/core.');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders spec-execute with state, next, and the declared skills', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const loaded = yield* load(root, 'spec-execute', EXECUTE_VALUES);
      Vitest.expect(loaded.text).toContain('ship-login');
      Vitest.expect(loaded.text).toContain('state in-progress');
      Vitest.expect(loaded.text).toContain('A001-implement ready');
      Vitest.expect(loaded.text).toContain('is the budget of the phase this session starts on');
      Vitest.expect(loaded.text).toContain('Guided run (the default)');
      Vitest.expect(loaded.text).not.toContain('Autonomous run');
      Vitest.expect(loaded.text).not.toContain('Ask only for');
      Vitest.expect(loaded.skills).toStrictEqual([
        'montflow-find-specs',
        'montflow-adversarial-review',
        'montflow-addressing-adversarial-review',
      ]);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('keeps dispatch, gates, review, and locking in the guided render', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const loaded = yield* load(root, 'spec-execute', EXECUTE_VALUES);
      for (const rule of SHARED_RULES) Vitest.expect(loaded.text).toContain(rule);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders the autonomous branch from mode=autonomous', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const autonomous = yield* load(root, 'spec-execute', {
        ...EXECUTE_VALUES,
        mode: 'autonomous',
      });
      Vitest.expect(autonomous.text).toContain('Autonomous run');
      Vitest.expect(autonomous.text).not.toContain('Guided run');
      Vitest.expect(autonomous.text).toContain('a destructive or irreversible action');
      Vitest.expect(autonomous.text).toContain('a very dangerous tool call');
      Vitest.expect(autonomous.text).toContain('genuinely cannot make');
      Vitest.expect(autonomous.text).toContain('MEMORY.md');
      for (const rule of SHARED_RULES) Vitest.expect(autonomous.text).toContain(rule);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('defaults to guided and maps both public modes onto the internal flag', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const defaulted = yield* load(root, 'spec-execute', EXECUTE_VALUES);
      Vitest.expect(defaulted.text).toContain('Guided run (the default)');

      const guided = yield* load(root, 'spec-execute', { ...EXECUTE_VALUES, mode: 'guided' });
      Vitest.expect(guided.text).toContain('Guided run (the default)');
      Vitest.expect(guided.text).not.toContain('Autonomous run');

      // The public mode wins over a stale internal flag.
      const overridden = yield* load(root, 'spec-execute', {
        ...EXECUTE_VALUES,
        mode: 'guided',
        unsupervised: 'autonomous',
      });
      Vitest.expect(overridden.text).toContain('Guided run (the default)');

      const internal = yield* load(root, 'spec-execute', {
        ...EXECUTE_VALUES,
        unsupervised: 'autonomous',
      });
      Vitest.expect(internal.text).toContain('Autonomous run');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a mode that is not one of the two public names', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      for (const bad of ['autopilot', 'Guided', 'supervised', 'unsupervised']) {
        const error = yield* load(root, 'spec-execute', {
          ...EXECUTE_VALUES,
          mode: bad,
        }).pipe(Effect.flip);
        Vitest.expect(error).toBeInstanceOf(PromptError);
        Vitest.expect(error.code).toBe(CODES.mode);
        Vitest.expect(error.field).toBe('mode');
        Vitest.expect(error.actual).toBe(bad);
        Vitest.expect(error.expected).toBe(`one of ${MODE_HINT}`);
        Vitest.expect(error.fix).toContain('--mode');
        Vitest.expect(error.fix).toContain('guided');
        Vitest.expect(error.fix).toContain('autonomous');
      }
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders the review-cycle policy with the phase budget', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const tiny = yield* load(root, 'spec-execute', { ...EXECUTE_VALUES, reviewBudget: '1' });
      Vitest.expect(tiny.text).toContain('`1` is the budget of the phase this session starts on');
      Vitest.expect(tiny.text).toContain('review decide');
      Vitest.expect(tiny.text).toContain('Autonomous allows one overflow per phase per series');
      Vitest.expect(tiny.text).toContain('fix-and-stop');
      Vitest.expect(tiny.text).toContain('- Disposition: minor-deferred');
      Vitest.expect(tiny.text).toContain(
        'Never compute rounds, open counts, or severities by hand',
      );

      const large = yield* load(root, 'spec-execute', { ...EXECUTE_VALUES, reviewBudget: '3' });
      Vitest.expect(large.text).toContain('`3` is the budget of the phase this session starts on');
      Vitest.expect(large.text).toContain('`tiny` 1, `small` 2, `medium` 3, `large` 3');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a declared skill that is not installed before rendering', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(NodePath.join(root, '.agents', 'skills', 'montflow-find-specs'), {
        recursive: true,
      });

      const error = yield* load(root, 'spec-execute', EXECUTE_VALUES).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.skillMissing);
      Vitest.expect(error.field).toBe('montflow-find-specs');
      Vitest.expect(error.path).toBe(
        NodePath.join(root, '.agents', 'skills', 'montflow-find-specs'),
      );
      Vitest.expect(error.fix).toBe(DOCTOR_FIX);
      Vitest.expect(error.fix).toContain('mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a blocked declared skill with the doctor removal fix', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const target = NodePath.join(root, '.agents', 'skills', 'montflow-find-specs');
      const outside = NodePath.join(root, 'outside-skill');
      Fs.mkdirSync(outside, { recursive: true });
      Fs.writeFileSync(NodePath.join(outside, 'SKILL.md'), 'outside\n', 'utf-8');
      Fs.rmSync(target, { recursive: true, force: true });
      Fs.symlinkSync(outside, target);

      const error = yield* load(root, 'spec-execute', EXECUTE_VALUES).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.skillBlocked);
      Vitest.expect(error.field).toBe('montflow-find-specs');
      Vitest.expect(error.problem).toContain('blocked');
      Vitest.expect(error.fix).toContain('Remove the symlink');
      Vitest.expect(error.fix).not.toBe(DOCTOR_FIX);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a blocked prompt with the doctor move fix', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const target = installedFile(root, 'spec-execute');
      Fs.rmSync(target, { force: true });
      Fs.mkdirSync(target);

      const error = yield* load(root, 'spec-execute', EXECUTE_VALUES).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.blocked);
      Vitest.expect(error.path).toBe(target);
      Vitest.expect(error.problem).toContain('blocked');
      Vitest.expect(error.fix).toContain('Move ');
      Vitest.expect(error.fix).toContain('out of the way');
      Vitest.expect(error.fix).not.toBe(DOCTOR_FIX);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a missing prompt before rendering and writes nothing', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;

      const error = yield* load(root, 'spec-create', CREATE_VALUES).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(PromptError);
      Vitest.expect(error.code).toBe(CODES.missing);
      Vitest.expect(error.path).toBe(installedFile(root, 'spec-create'));
      Vitest.expect(error.problem).toContain('not installed');
      Vitest.expect(error.fix).toBe(DOCTOR_FIX);
      Vitest.expect(error.fix).toContain('mf-specs doctor');
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a stale prompt and keeps the doctor repair', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(installedFile(root, 'spec-execute'), '{"stale":true}\n');

      const error = yield* load(root, 'spec-execute', EXECUTE_VALUES).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.stale);
      Vitest.expect(error.path).toBe(installedFile(root, 'spec-execute'));
      Vitest.expect(error.problem).toContain('not current');
      Vitest.expect(error.fix).toContain('mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a prompt doctor does not ship', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;

      const error = yield* load(root, 'commit', {}).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.unknown);
      Vitest.expect(error.problem).toContain("Unknown spec prompt 'commit'");
      Vitest.expect(error.expected).toBe('one of spec-create, spec-execute, spec-sizing');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses to render without a required variable', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const error = yield* load(root, 'spec-create', { request: 'Ship login' }).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.missingVariable);
      Vitest.expect(error.field).toBe('rigor');
      Vitest.expect(error.actual).toBe('missing: rigor, isolated');
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('spec-create authoring contract', () => {
  Vitest.it('declares the questions in first-appearance order and hides the branch', () => {
    const raw = Fs.readFileSync(CREATE_PROMPT_FILE, 'utf-8');
    const prompt = Schema.decodeUnknownSync(Prompts.FromJson)(raw);
    Vitest.expect(Prompts.verifyPromptFile('spec-create', raw).valid).toBe(true);
    Vitest.expect(prompt.variables.map((variable) => variable.name)).toStrictEqual([
      ...CREATE_VARIABLES,
    ]);
    Vitest.expect(Prompts.templateVariables(prompt.template)).toStrictEqual([...CREATE_VARIABLES]);

    const rigor = prompt.variables.find((variable) => variable.name === 'rigor');
    Vitest.expect(rigor?.type).toBe('select');
    Vitest.expect(rigor?.options).toStrictEqual([...RIGORS]);
    Vitest.expect(rigor?.required).toBe(true);
    Vitest.expect(rigor?.default).toBe('');

    const origin = prompt.variables.find((variable) => variable.name === 'origin');
    Vitest.expect(origin?.when).toStrictEqual({ controller: 'isolated', equals: 'yes' });
    const originBranch = prompt.variables.find((variable) => variable.name === 'origin_branch');
    Vitest.expect(originBranch?.when).toStrictEqual({ controller: 'origin', equals: 'other' });
    const worktree = prompt.variables.find((variable) => variable.name === 'worktree_name');
    Vitest.expect(worktree?.when).toStrictEqual({ controller: 'isolated', equals: 'yes' });
  });

  Vitest.it.effect('isolated: no drops every origin and worktree token', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const loaded = yield* load(root, 'spec-create', {
        ...CREATE_VALUES,
        isolated: 'no',
        origin: 'main',
        origin_branch: 'release/2',
        worktree_name: 'feature-x',
      });
      const text = loaded.text.toLowerCase();
      for (const token of ['origin', 'worktree', 'using-git-worktrees', 'release/2', 'feature-x']) {
        Vitest.expect(text).not.toContain(token);
      }
      Vitest.expect(loaded.text).toContain('In-place authoring run');
      Vitest.expect(loaded.text).toContain('`in-place`');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('isolated: yes carries origin and the worktree branch and name', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const loaded = yield* load(root, 'spec-create', {
        ...CREATE_VALUES,
        isolated: 'yes',
        origin: 'main',
        worktree_name: 'feature-x',
      });
      Vitest.expect(loaded.text).toContain('from origin `main`');
      Vitest.expect(loaded.text).toContain('worktree named `feature-x`');
      Vitest.expect(loaded.text).toContain('using-git-worktrees');
      Vitest.expect(loaded.text).toContain('--workspace-type worktree');
      Vitest.expect(loaded.text).not.toContain('at branch');
      Vitest.expect(loaded.text).toContain('`isolated: yes · origin: main`');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('origin: other carries the freeform branch and nothing else does', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const other = yield* load(root, 'spec-create', {
        ...CREATE_VALUES,
        isolated: 'yes',
        origin: 'other',
        origin_branch: 'release/2',
        worktree_name: 'feature-x',
      });
      Vitest.expect(other.text).toContain('at branch `release/2`');
      Vitest.expect(other.text).toContain('with branch `release/2`');

      for (const origin of ['current', 'main'] as const) {
        const loaded = yield* load(root, 'spec-create', {
          ...CREATE_VALUES,
          isolated: 'yes',
          origin,
          worktree_name: 'feature-x',
        });
        Vitest.expect(loaded.text).not.toContain('release/2');
        Vitest.expect(loaded.text).not.toContain('at branch');
        Vitest.expect(loaded.text).not.toContain('Origin branch');
      }
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('doctor installs the packaged prompt bytes', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      Vitest.expect(Fs.readFileSync(installedFile(root, 'spec-create'), 'utf-8')).toBe(
        Fs.readFileSync(CREATE_PROMPT_FILE, 'utf-8'),
      );
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('Prompt.parseMode runtime', () => {
  Vitest.it('treats omitted and blank values as the guided default', () => {
    Vitest.expect(DEFAULT_MODE).toBe('guided');
    Vitest.expect(parseMode(undefined)).toStrictEqual({ ok: true, mode: 'guided' });
    Vitest.expect(parseMode('')).toStrictEqual({ ok: true, mode: 'guided' });
  });

  Vitest.it('accepts exactly the two public names', () => {
    Vitest.expect(parseMode('guided')).toStrictEqual({ ok: true, mode: 'guided' });
    Vitest.expect(parseMode('autonomous')).toStrictEqual({ ok: true, mode: 'autonomous' });
  });

  Vitest.it('refuses internal, cased, and invented names', () => {
    for (const bad of ['supervised', 'unsupervised', 'Guided', 'AUTONOMOUS', 'autopilot']) {
      const parsed = parseMode(bad);
      Vitest.expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      Vitest.expect(parsed.code).toBe(CODES.mode);
      Vitest.expect(parsed.expected).toBe(`one of ${MODE_HINT}`);
      Vitest.expect(parsed.actual).toBe(bad);
    }
  });

  Vitest.it('renders guided as a blank flag and autonomous as a non-empty one', () => {
    Vitest.expect(unsupervisedOf('guided')).toBe('');
    Vitest.expect(unsupervisedOf('autonomous')).not.toBe('');
  });
});
