import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { ProfileStore } from '@montflow/profiles';
import { SpecStore } from '@montflow/specs';
import { ProfileProbe, ReviewStore } from '../../../services/index.js';
import * as Engines from '../engines.apps.module.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const Live = Layer.mergeAll(
  Layer.provide(ReviewStore.Default, NodeLive),
  ProfileProbe.Default,
  Layer.provide(SpecStore.Default, NodeLive),
  Layer.provide(ProfileStore.Default, NodeLive),
);

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-spec-profiles-'));

/** Write a file, creating parent directories. */
const writeAt = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
};

/** Write a valid decodable `PROFILE.md`. */
const writeProfile = (root: string, name: string): Promise<void> =>
  writeAt(
    join(root, '.agents', '@montflow', 'profiles', name, 'PROFILE.md'),
    [
      '---',
      `name: ${name}`,
      `description: ${name} reviewer`,
      'model:',
      'skills:',
      '  - montflow-adversarial-review',
      '---',
      '',
      `# ${name}`,
      '',
      '## Instructions',
      '',
      'Review.',
      '',
      '## Review Checklist',
      '',
      '- [ ] Check.',
      '',
    ].join('\n'),
  );

/** Write a review `TASK.md` declaring `profiles`. */
const writeReviewTask = (
  root: string,
  spec: string,
  taskDir: string,
  profiles: string,
  status = 'pending',
): Promise<void> =>
  writeAt(
    join(root, '.agents', '@montflow', 'specs', spec, 'C', taskDir, 'TASK.md'),
    [
      '---',
      'id: C099',
      'name: review-phase',
      'type: review',
      'originator: user',
      'depends-on:',
      'related-tasks:',
      `reviewer-profiles: ${profiles}`,
      `status: ${status}`,
      '---',
      '',
      '# Task C099: review-phase',
      '',
      '## Type: review',
      '',
      '## Description',
      '',
      'x',
      '',
      '## Requirements',
      '',
      '- x',
      '',
      '## Completion',
      '',
      '- [ ] x',
      '',
    ].join('\n'),
  );

Vitest.describe('Engines.verifySpecProfiles', () => {
  Vitest.it.effect('is a no-op when the specs root is absent', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const entries = yield* Engines.verifySpecProfiles({ cwd: root });
      Vitest.expect(entries).toHaveLength(0);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('passes when a declared profile exists', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer'));
      yield* Effect.promise(() =>
        writeReviewTask(root, 'demo', 'C099-review-phase', 'effect-reviewer'),
      );
      const entries = yield* Engines.verifySpecProfiles({ cwd: root });
      Vitest.expect(entries).toHaveLength(0);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('fails for a declared profile that was not created (still pending)', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() =>
        writeReviewTask(root, 'demo', 'C099-review-phase', 'effect-reviewer'),
      );
      const entries = yield* Engines.verifySpecProfiles({ cwd: root });
      Vitest.expect(entries).toHaveLength(1);
      Vitest.expect(entries[0]?.path).toBe(
        '.agents/@montflow/specs/demo/C/C099-review-phase/TASK.md',
      );
      Vitest.expect(entries[0]?.result.issues[0]?.field).toBe('reviewer-profiles');
      Vitest.expect(entries[0]?.result.issues[0]?.message).toBe(
        "Declared reviewer profile 'effect-reviewer' was not found under .agents/@montflow/profiles.",
      );
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('resolves each of two declared profiles independently', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer'));
      yield* Effect.promise(() =>
        writeReviewTask(root, 'demo', 'C099-review-phase', 'effect-reviewer, generic-reviewer'),
      );
      const entries = yield* Engines.verifySpecProfiles({ cwd: root });
      Vitest.expect(entries).toHaveLength(1);
      Vitest.expect(entries[0]?.result.issues[0]?.message).toContain('generic-reviewer');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('verifyAll folds the declared-profile issue into its issue count', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() =>
        writeReviewTask(root, 'demo', 'C099-review-phase', 'effect-reviewer'),
      );
      const report = yield* Engines.verifyAll({ cwd: root });
      Vitest.expect(report.issueCount).toBe(1);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('ignores a field declared on a non-review task', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() =>
        writeAt(
          join(root, '.agents', '@montflow', 'specs', 'demo', 'C', 'C001-do-work', 'TASK.md'),
          [
            '---',
            'id: C001',
            'name: do-work',
            'type: execution',
            'originator: user',
            'depends-on:',
            'related-tasks:',
            'reviewer-profiles: effect-reviewer',
            'status: pending',
            '---',
            '',
            '# Task C001: do-work',
            '',
            '## Type: execution',
            '',
            '## Description',
            '',
            'x',
            '',
            '## Requirements',
            '',
            '- x',
            '',
            '## Completion',
            '',
            '- [ ] x',
            '',
          ].join('\n'),
        ),
      );
      const entries = yield* Engines.verifySpecProfiles({ cwd: root });
      Vitest.expect(entries).toHaveLength(0);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
