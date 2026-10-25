import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { parseScaffoldTask, runSlash, scaffold } from '../index.js';
import { stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';

Vitest.describe('Cli.scaffold engine', () => {
  Vitest.it.effect('writes a valid tree and reports it', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const report = yield* scaffold(root, { name: 'ship-login', author: 'Tester' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.name).toBe('ship-login');
      Vitest.expect(report.dir).toBe(`${root}/ship-login`);
      Vitest.expect(report.phase).toBe('A');
      Vitest.expect(report.taskCount).toBe(2);
      Vitest.expect(report.files).toContain('SPEC.md');
      Vitest.expect(report.files).toContain('A001-implement/TASK.md');
      Vitest.expect(report.files).toContain('A099-review-phase/TASK.md');
      Vitest.expect(specs.has('ship-login')).toBe(true);
    }),
  );

  Vitest.it.effect('refuses an existing spec', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([
        ['ship-login', [{ path: 'SPEC.md', content: '# x\n' }]],
      ]);
      const error = yield* scaffold(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain('already exists');
    }),
  );

  Vitest.it.effect('refuses an invalid name', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, { name: 'Ship_Login' }).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain('not a valid spec name');
    }),
  );

  Vitest.it.effect('refuses an unknown workspace type', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, { name: 'ship-login', workspaceType: 'bogus' }).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain("Unknown workspace type 'bogus'");
    }),
  );

  Vitest.it.effect('refuses an unknown task type', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['build:bogus'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(error.reason).toContain("Unknown task type 'bogus'");
    }),
  );

  Vitest.it.effect('emits reviewer-profiles on the review task when supplied', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, {
        name: 'ship-login',
        author: 'Tester',
        reviewerProfiles: ['effect-reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const review = files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('reviewer-profiles: effect-reviewer');
      const checked = yield* runSlash('check --name ship-login', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(checked.ok).toBe(true);
    }),
  );

  Vitest.it.effect('emits an empty reviewer-profiles line by default', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, { name: 'ship-login' }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const review = files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('reviewer-profiles:');
      Vitest.expect(review).not.toContain('reviewer-profiles: effect-reviewer');
    }),
  );

  Vitest.it.effect('refuses an invalid reviewer profile', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        reviewerProfiles: ['Effect_Reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(error.reason).toContain('not a valid reviewer profile');
    }),
  );

  Vitest.it.effect('refuses a duplicated reviewer profile', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        reviewerProfiles: ['effect-reviewer', 'effect-reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(error.reason).toContain('listed more than once');
    }),
  );
});

Vitest.describe('Cli.parseScaffoldTask', () => {
  Vitest.it('defaults to execution without gates', () => {
    Vitest.expect(parseScaffoldTask('build')).toStrictEqual({
      ok: true,
      task: { name: 'build', type: 'execution', gates: false },
    });
  });

  Vitest.it('parses type and gates', () => {
    Vitest.expect(parseScaffoldTask('build:planning:gates')).toStrictEqual({
      ok: true,
      task: { name: 'build', type: 'planning', gates: true },
    });
  });

  Vitest.it('rejects a bad name and a bad type', () => {
    const badName = parseScaffoldTask('Bad_Name');
    Vitest.expect(badName.ok).toBe(false);
    if (!badName.ok) Vitest.expect(badName.error).toContain('not a valid task name');
    const badType = parseScaffoldTask('build:bogus');
    Vitest.expect(badType.ok).toBe(false);
    if (!badType.ok) Vitest.expect(badType.error).toContain("Unknown task type 'bogus'");
  });
});

Vitest.describe('Cli.runSlash create', () => {
  Vitest.it.effect('creates a spec that then checks clean', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'create --name ship-login --description "Ship it" --author Tester --tasks build:execution:gates,explore',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(true);
      Vitest.expect(created.output).toContain("created 'ship-login'");

      const checked = yield* runSlash('check --name ship-login', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(checked.ok).toBe(true);
    }),
  );

  Vitest.it.effect('threads --reviewer-profiles into the review task', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'create --name ship-login --reviewer-profiles effect-reviewer',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(true);
      const files = specs.get('ship-login') ?? [];
      const review = files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('reviewer-profiles: effect-reviewer');
      const checked = yield* runSlash('check --name ship-login', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(checked.ok).toBe(true);
    }),
  );

  Vitest.it.effect('rejects create without --name', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* runSlash('create', root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain('create requires --name');
    }),
  );
});
