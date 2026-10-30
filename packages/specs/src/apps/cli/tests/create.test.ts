import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { SurfaceError, parseScaffoldTask, runSlash, scaffold } from '../index.js';
import { stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';

/** Read a slash failure's problem whether it is a surface or store error. */
const slashProblem = (error: {
  readonly reason?: string;
  readonly diagnostics?: ReadonlyArray<{ readonly problem: string }>;
}): string => error.diagnostics?.[0]?.problem ?? error.reason ?? '';

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

  Vitest.it.effect('emits the requested task sizes', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['build:execution:gates:large', 'explore:exploratory::tiny'],
      }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const build = files.find((file) => file.path === 'A001-build/TASK.md')?.content ?? '';
      Vitest.expect(build).toContain('size: large');
      const explore = files.find((file) => file.path === 'A002-explore/TASK.md')?.content ?? '';
      Vitest.expect(explore).toContain('size: tiny');
      const checked = yield* runSlash('check --name ship-login', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(checked.ok).toBe(true);
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
      Vitest.expect(slashProblem(error)).toContain('already exists');
    }),
  );

  Vitest.it.effect('refuses an invalid name with the usage diagnostic', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, { name: 'Ship_Login' }).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      Vitest.expect(error.diagnostics[0]?.code).toBe('cli.invalid-argument');
      Vitest.expect(error.diagnostics[0]?.field).toBe('--name');
      Vitest.expect(error.diagnostics[0]?.fix).toContain('slug');
      Vitest.expect(specs.size).toBe(0);
    }),
  );

  Vitest.it.effect('refuses an unknown workspace type', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, { name: 'ship-login', workspaceType: 'bogus' }).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(slashProblem(error)).toContain("Unknown workspace type 'bogus'");
    }),
  );

  Vitest.it.effect('refuses an unknown task type', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['build:bogus'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(slashProblem(error)).toContain("Unknown task type 'bogus'");
    }),
  );

  Vitest.it.effect('emits reviewer-profiles on the review task when supplied', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, {
        name: 'ship-login',
        author: 'Tester',
        reviewerProfiles: ['example-reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const review = files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('reviewer-profiles: example-reviewer');
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
      Vitest.expect(review).not.toContain('reviewer-profiles: example-reviewer');
    }),
  );

  Vitest.it.effect('refuses an invalid reviewer profile', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        reviewerProfiles: ['Effect_Reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(slashProblem(error)).toContain('not a valid reviewer profile');
    }),
  );

  Vitest.it.effect('creates a spec with a trailing-colon task size as medium', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['build:execution:gates:'],
      }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const build = files.find((file) => file.path === 'A001-build/TASK.md')?.content ?? '';
      Vitest.expect(build).toContain('size: medium');
    }),
  );

  Vitest.it.effect('refuses a fifth task-spec token instead of ignoring it', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['build:execution:gates:large:typo'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(slashProblem(error)).toContain('name[:type[:gates[:size]]]');
      Vitest.expect(specs.has('ship-login')).toBe(false);
    }),
  );

  Vitest.it.effect('refuses a duplicated reviewer profile', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        reviewerProfiles: ['example-reviewer', 'example-reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(slashProblem(error)).toContain('listed more than once');
    }),
  );
});

Vitest.describe('Cli.parseScaffoldTask', () => {
  Vitest.it('defaults to execution without gates', () => {
    Vitest.expect(parseScaffoldTask('build')).toStrictEqual({
      ok: true,
      task: { name: 'build', type: 'execution', gates: false, size: 'medium' },
    });
  });

  Vitest.it('parses type and gates', () => {
    Vitest.expect(parseScaffoldTask('build:planning:gates')).toStrictEqual({
      ok: true,
      task: { name: 'build', type: 'planning', gates: true, size: 'medium' },
    });
  });

  Vitest.it('parses a declared size and defaults the rest', () => {
    Vitest.expect(parseScaffoldTask('build:execution::large')).toStrictEqual({
      ok: true,
      task: { name: 'build', type: 'execution', gates: false, size: 'large' },
    });
    Vitest.expect(parseScaffoldTask('build:planning:gates:tiny')).toStrictEqual({
      ok: true,
      task: { name: 'build', type: 'planning', gates: true, size: 'tiny' },
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

  Vitest.it('treats a blank size token as omitted and defaults to medium', () => {
    Vitest.expect(parseScaffoldTask('build:execution:gates:')).toStrictEqual({
      ok: true,
      task: { name: 'build', type: 'execution', gates: true, size: 'medium' },
    });
  });

  Vitest.it('rejects a fifth token instead of ignoring it', () => {
    const extra = parseScaffoldTask('build:execution:gates:large:typo');
    Vitest.expect(extra.ok).toBe(false);
    if (!extra.ok) {
      Vitest.expect(extra.error).toContain('name[:type[:gates[:size]]]');
      Vitest.expect(extra.error).toContain('5 fields');
    }
  });

  Vitest.it('rejects an unknown size', () => {
    const badSize = parseScaffoldTask('build:execution:gates:huge');
    Vitest.expect(badSize.ok).toBe(false);
    if (!badSize.ok) Vitest.expect(badSize.error).toContain("Unknown task size 'huge'");
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
        'create --name ship-login --reviewer-profiles example-reviewer',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(true);
      const files = specs.get('ship-login') ?? [];
      const review = files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('reviewer-profiles: example-reviewer');
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
      Vitest.expect(slashProblem(error)).toContain('create requires --name');
    }),
  );

  Vitest.it.effect('refuses a malformed --name with the usage diagnostic', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      for (const name of ['..', 'A', 'a/b']) {
        const created = yield* runSlash(`create --name ${name}`, root).pipe(
          Effect.provide(stubLayer(specs)),
        );
        Vitest.expect(created.ok, name).toBe(false);
        Vitest.expect(created.output, name).toContain('code     cli.invalid-argument');
        Vitest.expect(created.output, name).toContain('field    --name');
        Vitest.expect(created.output, name).toContain('slug');
        Vitest.expect(created.output, name).not.toContain('store.error');
      }
      Vitest.expect(specs.size).toBe(0);
    }),
  );

  Vitest.it.effect('refuses a supplied-but-blank --name with the same guard as its siblings', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      // `--name=` parses to a supplied empty value, not a missing flag: it must
      // take the coded guard every sibling arm applies, not a store error.
      const created = yield* runSlash('create --name=', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(created.ok).toBe(false);
      Vitest.expect(created.output).toContain('code     cli.invalid-argument');
      Vitest.expect(created.output).toContain('field    --name');
      Vitest.expect(created.output).toContain('actual   empty string');
      Vitest.expect(created.output).toContain('next     mf-specs create --name <slug>');
      Vitest.expect(created.output).not.toContain('store.error');
      Vitest.expect(specs.size).toBe(0);
    }),
  );
});
