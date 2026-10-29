import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '@montflow/prompts';
import { Effect, FileSystem, Layer } from 'effect';
import { runDoctor } from '../../doctor/index.js';
import {
  type AdvisoryCode,
  CODES,
  type Code,
  DOCTOR_FIX,
  PromptError,
  type SkillAdvisory,
  load,
} from '../prompt.module.js';

/**
 * The skill gate's two halves. Doctor-owned skills are required and keep their
 * coded failures; a declared skill the package does not ship is advisory, so a
 * fresh doctor-only workspace still renders every prompt. Every root is a
 * throwaway, so no test reads the skills installed in this repo.
 */

const Platform = Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer);
const StoreLive = Layer.provideMerge(PromptStore.Default, Platform);

const scopedRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-skill-gate-' });
});

const installedSkill = (root: string, name: string): string =>
  NodePath.join(root, '.agents', 'skills', name, 'SKILL.md');

const installSkill = (root: string, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = NodePath.dirname(installedSkill(root, name));
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(
      installedSkill(root, name),
      `---\nname: ${name}\ndescription: fixture\n---\n`,
    );
  });

const EXECUTE_VALUES = {
  name: 'ship-login',
  state: 'state in-progress\nactive phase A',
  next: 'A001-implement ready · size small · target inherit',
  reviewBudget: '2',
} as const;

/** Declared by `spec-execute` but not shipped by this package. */
const REVIEW_SKILLS = [
  'montflow-adversarial-review',
  'montflow-addressing-adversarial-review',
] as const;

/** Declared by `spec-sizing` but not shipped by this package. */
const SIZING_FOREIGN_SKILLS = ['executing-skills', 'grilling', 'i-have-adhd'] as const;

Vitest.describe('advisory and failure codes', () => {
  Vitest.it('keeps the advisory code out of the failure union', () => {
    Vitest.expectTypeOf<AdvisoryCode>().toEqualTypeOf<'prompt.skill-advisory'>();
    // `Code` is the failure channel: no `PromptError` is ever failed with the
    // advisory literal, so a `Match` over it stays exhaustive over failures.
    Vitest.expectTypeOf<Extract<Code, 'prompt.skill-advisory'>>().toEqualTypeOf<never>();
    Vitest.expectTypeOf<SkillAdvisory['code']>().toEqualTypeOf<AdvisoryCode>();
  });
});

Vitest.describe('fresh doctor-only workspace', () => {
  Vitest.it.effect('renders all three shipped prompts and names what is missing', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* runDoctor(root);

      const created = yield* load(root, 'spec-create', { request: 'Ship login' });
      Vitest.expect(created.skills).toStrictEqual(['montflow-create-specs']);
      Vitest.expect(created.advisories).toStrictEqual([]);
      Vitest.expect(created.text).not.toContain('## Skill advisories');

      const executed = yield* load(root, 'spec-execute', EXECUTE_VALUES);
      Vitest.expect(executed.skills).toStrictEqual(['montflow-find-specs']);
      Vitest.expect(executed.advisories.map((advisory) => advisory.field)).toStrictEqual([
        ...REVIEW_SKILLS,
      ]);
      Vitest.expect(executed.text).toContain('## Skill advisories');
      Vitest.expect(executed.text).toContain('code     ! prompt.skill-advisory');
      Vitest.expect(executed.text).toContain('next     mf-specs execute --name <spec>');
      for (const skill of REVIEW_SKILLS) Vitest.expect(executed.text).toContain(skill);

      const sized = yield* load(root, 'spec-sizing', { scope: 'repo' });
      Vitest.expect(sized.skills).toStrictEqual(['montflow-find-specs', 'montflow-create-specs']);
      Vitest.expect(sized.advisories.map((advisory) => advisory.field)).toStrictEqual([
        ...SIZING_FOREIGN_SKILLS,
      ]);
      for (const skill of SIZING_FOREIGN_SKILLS) Vitest.expect(sized.text).toContain(skill);
      Vitest.expect(sized.text).toContain('next     mf-specs sizing-config');
      Vitest.expect(sized.prompt.skills).toStrictEqual([
        'executing-skills',
        'montflow-find-specs',
        'montflow-create-specs',
        'grilling',
        'i-have-adhd',
      ]);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('drops an advisory once the non-doctor skill is installed', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* runDoctor(root);
      yield* installSkill(root, 'grilling');

      const loaded = yield* load(root, 'spec-sizing', { scope: 'repo' });
      Vitest.expect(loaded.skills).toStrictEqual([
        'montflow-find-specs',
        'montflow-create-specs',
        'grilling',
      ]);
      Vitest.expect(loaded.advisories.map((advisory) => advisory.field)).toStrictEqual([
        'executing-skills',
        'i-have-adhd',
      ]);
      Vitest.expect(loaded.text).not.toContain(
        "Skill 'grilling' declared by prompt 'spec-sizing' is not installed",
      );
      Vitest.expect(loaded.text).toContain(
        "Install 'i-have-adhd' under " + NodePath.join(root, '.agents', 'skills') + '/',
      );
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('doctor-owned skill gate', () => {
  Vitest.it.effect('a missing owned skill fails with its existing code and doctor fix', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* runDoctor(root);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(NodePath.join(root, '.agents', 'skills', 'montflow-find-specs'), {
        recursive: true,
      });

      const error = yield* load(root, 'spec-sizing', { scope: 'repo' }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(PromptError);
      Vitest.expect(error.code).toBe(CODES.skillMissing);
      Vitest.expect(error.field).toBe('montflow-find-specs');
      Vitest.expect(error.path).toBe(
        NodePath.join(root, '.agents', 'skills', 'montflow-find-specs'),
      );
      Vitest.expect(error.fix).toBe(DOCTOR_FIX);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('a missing owned authoring skill still fails despite advisories', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* runDoctor(root);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(NodePath.join(root, '.agents', 'skills', 'montflow-create-specs'), {
        recursive: true,
      });

      const error = yield* load(root, 'spec-create', { request: 'Ship login' }).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.skillMissing);
      Vitest.expect(error.field).toBe('montflow-create-specs');
      Vitest.expect(error.fix).toBe(DOCTOR_FIX);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('a stale owned skill fails as stale, never as an advisory', () =>
    Effect.gen(function* () {
      const root = yield* scopedRoot;
      yield* runDoctor(root);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(installedSkill(root, 'montflow-create-specs'), 'stale\n');

      const error = yield* load(root, 'spec-create', { request: 'Ship login' }).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(CODES.skillStale);
      Vitest.expect(error.field).toBe('montflow-create-specs');
      Vitest.expect(error.fix).toBe(DOCTOR_FIX);
    }).pipe(Effect.provide(StoreLive)),
  );
});
