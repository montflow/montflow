import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore, Prompts } from '@montflow/prompts';
import { Effect, FileSystem, Layer, Result, Schema } from 'effect';
import { runDoctor } from '../../../apps/doctor/index.js';
import * as Catalogue from '../../catalogue/index.js';
import { CODES, DOCTOR_FIX, PromptError, load } from '../prompt.module.js';

/**
 * `spec-sizing` is the guided sizing wizard. These tests pin the canonical file,
 * its variable bijection and skills, every scope render, the doctor gate, and
 * the catalogue rules that stop an invented model id or effort token. Every run
 * uses a throwaway root, so no real `sizing.json` is written.
 */

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const CANONICAL = NodePath.join(PACKAGE_ROOT, 'prompts', 'spec-sizing.json');
const FIXTURE_CATALOGUE = NodePath.join(PACKAGE_ROOT, 'fixtures', 'catalog.json');

/** The exact declared order the template must follow. */
const VARIABLES = ['scope', 'name', 'phase', 'unsupervised', 'focus'] as const;

const SKILLS = [
  'executing-skills',
  'montflow-find-specs',
  'montflow-create-specs',
  'grilling',
  'i-have-adhd',
] as const;

/** Skills the wizard declares but doctor does not install. */
const FOREIGN_SKILLS = ['executing-skills', 'grilling', 'i-have-adhd'] as const;

const SIZES = ['tiny', 'small', 'medium', 'large'] as const;

const Platform = Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer);
const StoreLive = Layer.provideMerge(PromptStore.Default, Platform);

const installedFile = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'prompts', `${name}.json`);

/** A scoped temp directory, removed by the test runtime. */
const scopedRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-sizing-prompt-' });
});

/** Doctor plus stubs for the skills the prompt declares but doctor does not own. */
const doctor = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* runDoctor(root);
    for (const name of FOREIGN_SKILLS) {
      const dir = NodePath.join(root, '.agents', 'skills', name);
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFileString(
        NodePath.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
  });

/** Render the canonical wizard in a fresh doctor-installed root. */
const render = (values: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const root = yield* scopedRoot;
    yield* doctor(root);
    return yield* load(root, 'spec-sizing', values);
  }).pipe(Effect.provide(StoreLive));

/** The canonical prompt, decoded and verified from the package file. */
const canonical = () => {
  const raw = Fs.readFileSync(CANONICAL, 'utf-8');
  return {
    raw,
    prompt: Schema.decodeUnknownSync(Prompts.FromJson)(raw),
    verified: Prompts.verifyPromptFile('spec-sizing', raw),
  };
};

const word = (token: string): RegExp => new RegExp(`\\b${token}\\b`, 'u');

Vitest.describe('spec-sizing prompt file', () => {
  Vitest.it('verifies, declares the five variables in order, and names its skills', () => {
    const { prompt, verified } = canonical();
    Vitest.expect(verified.valid).toBe(true);
    Vitest.expect(prompt.name).toBe('spec-sizing');
    Vitest.expect(prompt.model).toBe('');
    Vitest.expect(prompt.variables.map((variable) => variable.name)).toStrictEqual([...VARIABLES]);
    Vitest.expect(Prompts.templateVariables(prompt.template)).toStrictEqual([...VARIABLES]);
    Vitest.expect(prompt.skills).toStrictEqual([...SKILLS]);
  });

  Vitest.it('carries the wizard contract and all four sizes', () => {
    const { prompt } = canonical();
    for (const size of SIZES) Vitest.expect(word(size).test(prompt.template)).toBe(true);
    for (const clause of [
      'Show what exists first',
      'Ask the user one question: size the repo-wide config, one spec, or one phase of one spec.',
      'Read the live harness catalogue',
      'explicit `inherit`',
      'Write only after that confirmation',
      'overwriting a non-empty size entry with a different value',
      'Keep every unrelated size',
      'Emit `sizes` first, then `phases`',
      'One run writes one layer',
      'A failing check blocks the report',
      'Never edit a `TASK.md`',
      'Never invent a model id or an effort token',
    ]) {
      Vitest.expect(prompt.template).toContain(clause);
    }
  });
});

Vitest.describe('spec-sizing scope renders', () => {
  Vitest.it.effect('open scope asks before any write and lists the three layers', () =>
    Effect.gen(function* () {
      const loaded = yield* render({});
      Vitest.expect(loaded.text).toContain('Scope is open');
      Vitest.expect(loaded.text).toContain('Ask which layer before any write.');
      Vitest.expect(loaded.text).toContain(
        'Never write before the scope and the proposal are resolved.',
      );
      Vitest.expect(loaded.text).toContain('The three possible layers:');
      Vitest.expect(loaded.text).toContain('`repo` -> `<specs-root>/sizing.json`');
      Vitest.expect(loaded.text).toContain('`spec` -> `<spec>/sizing.json`');
      Vitest.expect(loaded.text).toContain('`phase` -> `phases.<ID>.sizes`');
      Vitest.expect(loaded.text).not.toContain('Scope: repo (fixed');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('repo scope names only the repo file and forbids a phases key', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ scope: 'repo' });
      Vitest.expect(loaded.text).toContain('Scope: repo (fixed for this run');
      Vitest.expect(loaded.text).toContain('`<specs-root>/sizing.json`');
      Vitest.expect(loaded.text).toContain('never a `phases` key');
      Vitest.expect(loaded.text).not.toContain('`repo` ->');
      Vitest.expect(loaded.text).not.toContain('`spec` ->');
      Vitest.expect(loaded.text).not.toContain('`phase` ->');
      Vitest.expect(loaded.text).not.toContain('Scope is open');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('spec scope names the spec and only its file', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ scope: 'spec', name: 'ship-login' });
      Vitest.expect(loaded.text).toContain(
        'Spec: ship-login. Its config is `ship-login/sizing.json`.',
      );
      Vitest.expect(loaded.text).toContain('`ship-login/sizing.json`.');
      Vitest.expect(loaded.text).not.toContain('`repo` ->');
      Vitest.expect(loaded.text).not.toContain('`spec` ->');
      Vitest.expect(loaded.text).not.toContain('`phase` ->');
      Vitest.expect(loaded.text).not.toContain('Scope is open');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('phase scope names the phase and only the nested write target', () =>
    Effect.gen(function* () {
      const loaded = yield* render({ scope: 'phase', name: 'ship-login', phase: 'A' });
      Vitest.expect(loaded.text).toContain(
        'Phase: A. The write target is `phases.A.sizes` inside `ship-login/sizing.json`.',
      );
      Vitest.expect(loaded.text).toContain(
        'The only path this run may write is:\n- `phases.A.sizes` inside `ship-login/sizing.json`.',
      );
      Vitest.expect(loaded.text).not.toContain('`repo` ->');
      Vitest.expect(loaded.text).not.toContain('`spec` ->');
      Vitest.expect(loaded.text).not.toContain('`phase` ->');
      Vitest.expect(loaded.text).not.toContain('Scope is open');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('guides by default and decides the three checkpoints when autonomous', () =>
    Effect.gen(function* () {
      const guided = yield* render({ scope: 'repo' });
      Vitest.expect(guided.text).toContain('Guided run:');
      Vitest.expect(guided.text).not.toContain('Autonomous run:');

      const autonomous = yield* render({ scope: 'repo', mode: 'autonomous' });
      Vitest.expect(autonomous.text).toContain('Autonomous run:');
      Vitest.expect(autonomous.text).toContain('decide the scope, the proposal, and any overwrite');
      Vitest.expect(autonomous.text).toContain('record one line per call');
      Vitest.expect(autonomous.text).not.toContain('Guided run:');
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('spec-sizing doctor gate', () => {
  Vitest.it.effect('refuses a missing prompt before rendering and writes nothing', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;

      const error = yield* load(root, 'spec-sizing', {}).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(PromptError);
      Vitest.expect(error.code).toBe(CODES.missing);
      Vitest.expect(error.path).toBe(installedFile(root, 'spec-sizing'));
      Vitest.expect(error.fix).toBe(DOCTOR_FIX);
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a stale prompt with the doctor repair', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* doctor(root);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(installedFile(root, 'spec-sizing'), '{"stale":true}\n');

      const error = yield* load(root, 'spec-sizing', {}).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.stale);
      Vitest.expect(error.path).toBe(installedFile(root, 'spec-sizing'));
      Vitest.expect(error.problem).toContain('not current');
      Vitest.expect(error.fix).toContain('mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('spec-sizing catalogue constraints', () => {
  Vitest.it('states the null / [] / known-variants rule unambiguously', () => {
    const { prompt } = canonical();
    Vitest.expect(prompt.template).toContain('`null` means the host does not know the variants.');
    Vitest.expect(prompt.template).toContain('`[]` means the host knows there are no variants.');
    Vitest.expect(prompt.template).toContain(
      'an effort is allowed only when that list contains the exact token',
    );
  });

  Vitest.it('carries no model id or variant token from the fixture catalogue', () => {
    const { prompt } = canonical();
    const decoded = Catalogue.decode(
      Fs.readFileSync(FIXTURE_CATALOGUE, 'utf-8'),
      FIXTURE_CATALOGUE,
    );
    Vitest.expect(Result.isSuccess(decoded)).toBe(true);
    if (!Result.isSuccess(decoded)) return;

    for (const model of decoded.success.models) {
      Vitest.expect(prompt.template).not.toContain(model.label);
      for (const variant of model.variants ?? []) {
        Vitest.expect(word(variant).test(prompt.template)).toBe(false);
      }
    }
    Vitest.expect(prompt.model).toBe('');
  });
});
