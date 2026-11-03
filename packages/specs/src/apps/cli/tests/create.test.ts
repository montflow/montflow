import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import {
  SurfaceError,
  parseScaffoldTask,
  runSlash,
  scaffold,
  scaffoldTaskSpecs,
} from '../index.js';
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
      Vitest.expect(report.taskCount).toBe(1);
      Vitest.expect(report.files).toContain('SPEC.md');
      Vitest.expect(report.files).toContain('A/PHASE.md');
      Vitest.expect(report.files).toContain('A/MEMORY.md');
      Vitest.expect(report.files).toContain('A/A001-implement/TASK.md');
      Vitest.expect(report.files.some((file) => /\/A\d*099-/.test(file))).toBe(false);
      Vitest.expect(specs.has('ship-login')).toBe(true);
      const spec = specs.get('ship-login')?.find((file) => file.path === 'SPEC.md')?.content ?? '';
      Vitest.expect(spec).toContain('spec-version: 2');
      Vitest.expect(spec).not.toContain(['locked', 'phases'].join('-'));
    }),
  );

  Vitest.it.effect('emits no reserved review task unless one is requested', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, { name: 'ship-login', author: 'Tester' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      const files = specs.get('ship-login') ?? [];
      Vitest.expect(files.some((file) => file.path.includes('099-review-phase'))).toBe(false);
      Vitest.expect(files.some((file) => file.path.includes('/review-phase/'))).toBe(false);
      const table = files.find((file) => file.path === 'SPEC.md')?.content ?? '';
      Vitest.expect(table).not.toContain('| A099 |');
      const checked = yield* runSlash('check --name ship-login', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(checked.ok).toBe(true);
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
      const build = files.find((file) => file.path === 'A/A001-build/TASK.md')?.content ?? '';
      Vitest.expect(build).toContain('size: large');
      const explore = files.find((file) => file.path === 'A/A002-explore/TASK.md')?.content ?? '';
      Vitest.expect(explore).toContain('size: tiny');
      const checked = yield* runSlash('check --name ship-login', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(checked.ok).toBe(true);
    }),
  );

  Vitest.it.effect('wires the review task to every non-review task in its phase', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['work:execution:gates', 'gate-review:review'],
      }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const review =
        files.find((file) => file.path === 'A/A002-gate-review/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('depends-on: A001');
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

  Vitest.it.effect('emits reviewer-profiles on a requested review task', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, {
        name: 'ship-login',
        author: 'Tester',
        taskSpecs: ['implement', 'review-phase:review'],
        reviewerProfiles: ['example-reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const review =
        files.find((file) => file.path === 'A/A002-review-phase/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('reviewer-profiles: example-reviewer');
      const checked = yield* runSlash('check --name ship-login', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(checked.ok).toBe(true);
    }),
  );

  Vitest.it.effect('emits an empty reviewer-profiles line on an explicit review task', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['implement', 'review-phase:review'],
      }).pipe(Effect.provide(stubLayer(specs)));
      const files = specs.get('ship-login') ?? [];
      const review =
        files.find((file) => file.path === 'A/A002-review-phase/TASK.md')?.content ?? '';
      Vitest.expect(review).toContain('reviewer-profiles:');
      Vitest.expect(review).not.toContain('reviewer-profiles: example-reviewer');
    }),
  );

  Vitest.it.effect('refuses reviewer profiles without a review task', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        reviewerProfiles: ['example-reviewer'],
      }).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(slashProblem(error)).toContain('needs a review task');
      Vitest.expect(specs.has('ship-login')).toBe(false);
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
      const build = files.find((file) => file.path === 'A/A001-build/TASK.md')?.content ?? '';
      Vitest.expect(build).toContain('size: medium');
    }),
  );

  Vitest.it.effect('refuses a sixth task-spec token instead of ignoring it', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* scaffold(root, {
        name: 'ship-login',
        taskSpecs: ['build:execution:gates:large:typo:extra'],
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

  Vitest.it('rejects a sixth token instead of ignoring it', () => {
    const extra = parseScaffoldTask('build:execution:gates:large:typo:extra');
    Vitest.expect(extra.ok).toBe(false);
    if (!extra.ok) {
      Vitest.expect(extra.error).toContain('name[:type[:gates[:size]]]');
      Vitest.expect(extra.error).toContain('6 fields');
    }
  });

  Vitest.it('parses a declared write scope', () => {
    Vitest.expect(parseScaffoldTask('build:execution:gates::scope=packages/specs')).toStrictEqual({
      ok: true,
      task: {
        name: 'build',
        type: 'execution',
        gates: true,
        size: 'medium',
        writeScope: 'packages/specs',
      },
    });
    const badScope = parseScaffoldTask('build::gates::scope=../escape');
    Vitest.expect(badScope.ok).toBe(false);
  });

  Vitest.it('accepts the documented scope short form and refuses another trailing token', () => {
    Vitest.expect(parseScaffoldTask('first:execution:scope=app')).toStrictEqual({
      ok: true,
      task: { name: 'first', type: 'execution', gates: false, size: 'medium', writeScope: 'app' },
    });
    Vitest.expect(parseScaffoldTask('build:planning:gates:large:scope=app,lib')).toStrictEqual({
      ok: true,
      task: {
        name: 'build',
        type: 'planning',
        gates: true,
        size: 'large',
        writeScope: 'app,lib',
      },
    });
    const dropped = parseScaffoldTask('build:execution:bogus');
    Vitest.expect(dropped.ok).toBe(false);
    if (!dropped.ok) Vitest.expect(dropped.error).toContain("'bogus' is not a gates token");
  });

  Vitest.it('rejects an unknown size', () => {
    const badSize = parseScaffoldTask('build:execution:gates:huge');
    Vitest.expect(badSize.ok).toBe(false);
    if (!badSize.ok) Vitest.expect(badSize.error).toContain("Unknown task size 'huge'");
  });
});

Vitest.describe('Cli.scaffoldTaskSpecs grammar', () => {
  Vitest.it('keeps a comma inside scope= in one task and splits entries with ;', () => {
    Vitest.expect(scaffoldTaskSpecs('first:execution:scope=app,lib')).toStrictEqual({
      ok: true,
      specs: ['first:execution:scope=app,lib'],
    });
    Vitest.expect(scaffoldTaskSpecs('first:execution,second:execution')).toStrictEqual({
      ok: true,
      specs: ['first:execution', 'second:execution'],
    });
    Vitest.expect(scaffoldTaskSpecs('first:execution:scope=app;build')).toStrictEqual({
      ok: true,
      specs: ['first:execution:scope=app', 'build'],
    });
    Vitest.expect(scaffoldTaskSpecs('first:execution:scope=app,lib;build')).toStrictEqual({
      ok: true,
      specs: ['first:execution:scope=app,lib', 'build'],
    });
  });

  Vitest.it('refuses a colon-less fragment a scope list could have swallowed', () => {
    const split = scaffoldTaskSpecs('first:execution:scope=app,build,second:execution');
    Vitest.expect(split.ok).toBe(false);
    if (!split.ok) {
      Vitest.expect(split.problem).toContain('ambiguous');
      Vitest.expect(split.problem).toContain("after a scope= field, 'build'");
      Vitest.expect(split.problem).toContain('first:execution:scope=app;build');
    }
  });
});

Vitest.describe('Cli.runSlash create', () => {
  Vitest.it.effect('creates a spec that then checks clean', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'create --name ship-login --description "Ship it" --author Tester --tasks build:execution:gates::scope=app,explore:execution:gates::scope=lib',
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

  Vitest.it.effect('keeps a comma-separated scope inside one --tasks entry', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'create --name scope-list --tasks first:execution:scope=app,lib',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(true);
      const files = specs.get('scope-list') ?? [];
      const tasks = files.filter((file) => file.path.endsWith('/TASK.md'));
      Vitest.expect(tasks.map((file) => file.path)).toStrictEqual(['A/A001-first/TASK.md']);
      Vitest.expect(tasks[0]?.content).toContain('write-scope: app,lib');
    }),
  );

  Vitest.it.effect('separates bare-name tasks with a semicolon', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'create --name scoped-tasks --tasks first:execution:scope=app;build',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(true);
      const files = specs.get('scoped-tasks') ?? [];
      const tasks = files.filter((file) => file.path.endsWith('/TASK.md'));
      Vitest.expect(tasks.map((file) => file.path)).toStrictEqual([
        'A/A001-first/TASK.md',
        'A/A002-build/TASK.md',
      ]);
      Vitest.expect(tasks[0]?.content).toContain('write-scope: app');
      Vitest.expect(tasks[1]?.content).toContain('name: build');
    }),
  );

  Vitest.it.effect('refuses an ambiguous fragment after a scope list and names the ; form', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'create --name ambiguous --tasks first:execution:scope=app,build,second:execution',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(false);
      Vitest.expect(created.output).toContain('ambiguous');
      Vitest.expect(created.output).toContain('first:execution:scope=app;build');
      Vitest.expect(specs.has('ambiguous')).toBe(false);
    }),
  );

  Vitest.it.effect('init keeps a comma scope list in one repeated --task', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'init --name init-scope --tier micro --task A:first:execution:medium:scope=app,lib',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(true);
      const files = specs.get('init-scope') ?? [];
      const tasks = files.filter((file) => file.path.endsWith('/TASK.md'));
      Vitest.expect(tasks.map((file) => file.path)).toStrictEqual(['A/A001-first/TASK.md']);
      Vitest.expect(tasks[0]?.content).toContain('write-scope: app,lib');
    }),
  );

  Vitest.it.effect('threads --reviewer-profiles into the requested review task', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const created = yield* runSlash(
        'create --name ship-login --tasks implement,review-phase:review --reviewer-profiles example-reviewer',
        root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(created.ok).toBe(true);
      const files = specs.get('ship-login') ?? [];
      const review =
        files.find((file) => file.path === 'A/A002-review-phase/TASK.md')?.content ?? '';
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
