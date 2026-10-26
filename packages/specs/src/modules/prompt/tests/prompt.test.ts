import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '@montflow/prompts';
import { Effect, FileSystem, Layer } from 'effect';
import { runDoctor } from '../../../apps/doctor/index.js';
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

      const loaded = yield* load(root, 'spec-create', { request: 'Ship login' });
      Vitest.expect(loaded.name).toBe('spec-create');
      Vitest.expect(loaded.text).toContain('Ship login');
      Vitest.expect(loaded.text).toContain('## 4. Size every task');
      Vitest.expect(loaded.text).not.toContain('complexity tier');
      Vitest.expect(loaded.text).not.toContain('spec-appraiser');
      Vitest.expect(loaded.skills).toStrictEqual(['montflow-create-specs']);
      Vitest.expect(loaded.prompt.skills).toStrictEqual(['montflow-create-specs']);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders the optional notes only when supplied', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const plain = yield* load(root, 'spec-create', { request: 'Ship login' });
      Vitest.expect(plain.text).not.toContain('Extra constraints');

      const noted = yield* load(root, 'spec-create', {
        request: 'Ship login',
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
      Vitest.expect(loaded.text).toContain('budget is 2');
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

  Vitest.it.effect('refuses a fourth review round and names the budget', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);

      const tiny = yield* load(root, 'spec-execute', { ...EXECUTE_VALUES, reviewBudget: '1' });
      Vitest.expect(tiny.text).toContain('budget is 1');
      Vitest.expect(tiny.text).toContain('A round past the budget is refused');
      Vitest.expect(tiny.text).toContain('each series gets exactly one round');
      Vitest.expect(tiny.text).toContain('- Phase: <PHASE>');
      Vitest.expect(tiny.text).toContain('one cycle is one round in every series');

      const large = yield* load(root, 'spec-execute', { ...EXECUTE_VALUES, reviewBudget: '3' });
      Vitest.expect(large.text).toContain('budget is 3');
      Vitest.expect(large.text).toContain('exceeds the hard cap of 3');
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

      const error = yield* load(root, 'spec-create', { request: 'Ship login' }).pipe(Effect.flip);
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

      const error = yield* load(root, 'spec-create', {}).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.missingVariable);
      Vitest.expect(error.field).toBe('request');
      Vitest.expect(error.actual).toBe('missing: request');
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
