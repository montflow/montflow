import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { CliError } from 'effect/unstable/cli';
import { TestConsole } from 'effect/testing';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { issue, warning } from '../../../modules/verify/index.js';
import { SpecStore } from '../../../services/index.js';
import {
  type CheckReport,
  INTERNAL_EXIT_CODE,
  check,
  checkExitCode,
  reduceCheck,
  renderCheck,
  runDiagnosed,
} from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const okFiles = [
  entry('SPEC.md', specMarkdown({ name: 'ok' })),
  entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
  entry('A001-implement-login/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

const specs = new Map([
  ['ok', okFiles],
  ['bad', [entry('SPEC.md', specMarkdown({ name: 'bad' }))]],
]);

Vitest.describe('Cli.check runtime', () => {
  Vitest.it.effect('aggregates every spec under the root', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/specs').pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.specs.map((spec) => spec.name)).toStrictEqual(['bad', 'ok']);
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(report.specs.find((spec) => spec.name === 'ok')?.valid).toBe(true);
    }),
  );

  Vitest.it.effect('checks a single named spec', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs).toHaveLength(1);
      Vitest.expect(report.failed).toBe(0);
    }),
  );

  Vitest.it.effect('reports a missing named spec as a failure', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/specs', { name: 'nope' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(report.specs[0]?.issues[0]?.field).toBe('nope');
    }),
  );

  Vitest.it.effect('passes a no-profile spec with a completed review and no series (F17)', () =>
    Effect.gen(function* () {
      const tree = new Map([
        [
          'reviewed',
          [
            entry(
              'SPEC.md',
              specMarkdown({
                name: 'reviewed',
                rows: [
                  {
                    id: 'A001',
                    name: 'implement-login',
                    type: 'execution',
                    status: 'complete',
                    gates: 'No',
                  },
                  {
                    id: 'A099',
                    name: 'review-phase',
                    type: 'review',
                    status: 'complete',
                    gates: 'No',
                  },
                ],
              }),
            ),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({ id: 'A001', name: 'implement-login', status: 'complete' }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({
                id: 'A099',
                name: 'review-phase',
                type: 'review',
                status: 'complete',
              }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const report = yield* check('.agents/@montflow/specs', { name: 'reviewed' }).pipe(
        Effect.provide(stubLayer(tree)),
      );
      Vitest.expect(report.specs[0]?.valid).toBe(true);
      Vitest.expect(report.failed).toBe(0);
    }),
  );
});

const report: CheckReport = {
  root: '.agents/@montflow/specs',
  specs: [
    { name: 'ok', valid: true, issues: [] },
    {
      name: 'bad',
      valid: false,
      issues: [{ field: 'SPEC.md: tasks', message: 'Task table has no rows.' }],
    },
  ],
  rootIssues: [],
  failed: 1,
  issueCount: 1,
  warningCount: 0,
};

Vitest.describe('Cli.renderCheck runtime', () => {
  Vitest.it('hides passing specs by default', () => {
    Vitest.expect(renderCheck(report, false)).toBe(
      '\u2717 bad (1)\n  SPEC.md: tasks: Task table has no rows.\n\n2 specs \u00b7 1 failed \u00b7 1 issue',
    );
  });

  Vitest.it('lists passing specs and the root when verbose', () => {
    Vitest.expect(renderCheck(report, true)).toBe(
      'root .agents/@montflow/specs\n\u2713 ok\n\u2717 bad (1)\n  SPEC.md: tasks: Task table has no rows.\n\n2 specs \u00b7 1 failed \u00b7 1 issue',
    );
  });
});

const warningReport: CheckReport = {
  root: '.agents/@montflow/specs',
  specs: [
    {
      name: 'ok',
      valid: true,
      issues: [
        {
          field: 'metrics',
          message: 'No metrics recorded.',
          severity: 'warning',
          fix: 'Add a `## Metrics` section.',
        },
      ],
    },
  ],
  rootIssues: [],
  failed: 0,
  issueCount: 0,
  warningCount: 1,
};

Vitest.describe('Cli.renderCheck warnings runtime', () => {
  Vitest.it('renders warnings with a mark, apart from issues', () => {
    Vitest.expect(renderCheck(warningReport, false)).toBe(
      '\u2713 ok (1 warning)\n  ! metrics: No metrics recorded.\n    Fix: Add a `## Metrics` section.\n\n1 spec \u00b7 0 failed \u00b7 0 issues \u00b7 1 warning',
    );
  });

  Vitest.it('shows a warning-only spec without --verbose', () => {
    Vitest.expect(renderCheck(warningReport, false)).toContain('\u2713 ok (1 warning)');
  });
});

Vitest.describe('Cli.reduceCheck severity runtime', () => {
  const root = '.agents/@montflow/specs';

  Vitest.it('defaults an issue to error and fails the check', () => {
    const reduced = reduceCheck(root, [{ name: 'bad', issues: [issue('id', 'Missing.')] }], false);
    Vitest.expect(reduced.failed).toBe(1);
    Vitest.expect(reduced.issueCount).toBe(1);
    Vitest.expect(reduced.warningCount).toBe(0);
    Vitest.expect(reduced.specs[0]?.valid).toBe(false);
    Vitest.expect(checkExitCode(reduced)).toBe(1);
  });

  Vitest.it('does not fail on warnings alone', () => {
    const reduced = reduceCheck(
      root,
      [{ name: 'ok', issues: [warning('metrics', 'No metrics recorded.')] }],
      false,
    );
    Vitest.expect(reduced.failed).toBe(0);
    Vitest.expect(reduced.issueCount).toBe(0);
    Vitest.expect(reduced.warningCount).toBe(1);
    Vitest.expect(reduced.specs[0]?.valid).toBe(true);
    Vitest.expect(checkExitCode(reduced)).toBe(0);
  });

  Vitest.it('promotes warnings to errors under strict', () => {
    const reduced = reduceCheck(
      root,
      [{ name: 'ok', issues: [warning('metrics', 'No metrics recorded.')] }],
      true,
    );
    Vitest.expect(reduced.failed).toBe(1);
    Vitest.expect(reduced.issueCount).toBe(1);
    Vitest.expect(reduced.warningCount).toBe(0);
    Vitest.expect(reduced.specs[0]?.valid).toBe(false);
    Vitest.expect(checkExitCode(reduced)).toBe(1);
  });
});

Vitest.describe('Cli.check diagnostics runtime', () => {
  Vitest.it.effect('adds a malformed repo config cause chain only under --verbose', () =>
    Effect.gen(function* () {
      const malformed = stubLayer(new Map(), new Map([['sizing.json', '{"sizes": {']]));
      const checked = yield* check('.agents/@montflow/specs').pipe(Effect.provide(malformed));
      Vitest.expect(checked.rootIssues[0]?.cause).toBeDefined();
      Vitest.expect(checked.rootIssues[0]?.layers).toStrictEqual({
        consulted: ['repo'],
        layer: 'repo',
      });

      const compact = renderCheck(checked, false);
      Vitest.expect(compact).toBe(
        [
          '\u2717 sizing.json (1)',
          '  code     sizing.malformed-json',
          '  path     sizing.json',
          '  field    root',
          '  problem  Config is not valid JSON.',
          '  expected a JSON object with a "sizes" map',
          '  actual   unparseable JSON',
          '  fix      Rewrite sizing.json as valid JSON.',
          '  next     mf-specs check',
          '',
          '0 specs \u00b7 1 config \u00b7 1 failed \u00b7 1 issue',
        ].join('\n'),
      );
      Vitest.expect(compact).not.toContain('cause');
      Vitest.expect(compact).not.toContain('layers');

      const verbose = renderCheck(checked, true);
      Vitest.expect(checked.rootIssues[0]?.cause).toBeInstanceOf(SyntaxError);
      Vitest.expect(verbose).toMatch(/  cause    .*position \d+/);
      Vitest.expect(verbose).not.toContain('Expected a valid JSON string');
      Vitest.expect(verbose).toContain('  layers   consulted repo \u00b7 layer repo');
    }),
  );

  Vitest.it.effect('traces the layers consulted by spec-config and task-size findings', () =>
    Effect.gen(function* () {
      const traced = new Map([
        [
          'traced',
          [
            entry('SPEC.md', specMarkdown({ name: 'traced' })),
            entry('sizing.json', '{"sizes": {"huge": {"model": "a/b"}}}'),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({ id: 'A001', name: 'implement-login', withoutSize: true }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const checked = yield* check('.agents/@montflow/specs', { name: 'traced' }).pipe(
        Effect.provide(stubLayer(traced)),
      );
      const verbose = renderCheck(checked, true);
      Vitest.expect(verbose).toContain('  layers   consulted repo,spec \u00b7 layer spec');
      Vitest.expect(verbose).toContain('  layers   consulted repo,spec,phase \u00b7 phase A');
      Vitest.expect(renderCheck(checked, false)).not.toContain('layers');
    }),
  );

  Vitest.it.effect('traces a nested phase override as the phase layer', () =>
    Effect.gen(function* () {
      const traced = new Map([
        [
          'traced',
          [
            entry('SPEC.md', specMarkdown({ name: 'traced' })),
            entry(
              'sizing.json',
              '{"sizes": {}, "phases": {"A": {"sizes": {"huge": {"model": "a/b"}}}}}',
            ),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({ id: 'A001', name: 'implement-login' }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const checked = yield* check('.agents/@montflow/specs', { name: 'traced' }).pipe(
        Effect.provide(stubLayer(traced)),
      );
      const verbose = renderCheck(checked, true);
      Vitest.expect(verbose).toContain(
        '  layers   consulted repo,spec,phase \u00b7 layer phase \u00b7 phase A',
      );
    }),
  );

  Vitest.it('leaves non-sizing findings on their terse line under --verbose', () => {
    const legacy: CheckReport = {
      ...report,
      specs: [
        {
          name: 'bad',
          valid: false,
          issues: [{ field: 'notes.txt', message: 'Unexpected file at the spec root.' }],
        },
      ],
      issueCount: 1,
      failed: 1,
    };
    const verbose = renderCheck(legacy, true);
    Vitest.expect(verbose).toContain('  notes.txt: Unexpected file at the spec root.');
    Vitest.expect(verbose).not.toContain('layers');
    Vitest.expect(verbose).not.toContain('cause');
  });

  Vitest.it.effect('renders an unreadable config as a coded finding and keeps aggregating', () =>
    Effect.gen(function* () {
      const failure = new SpecStore.StoreError({
        operation: 'SpecStore.readRootFile',
        reason: 'PermissionDenied: FileSystem.readFile (/store/sizing.json)',
        path: 'sizing.json',
        cause: new Error('EACCES: permission denied, open sizing.json'),
      });
      const store = stubLayer(specs, new Map(), { rootFileFailure: failure });
      const checked = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
        Effect.provide(store),
      );
      Vitest.expect(checked.rootIssues[0]?.code).toBe('store.error');
      Vitest.expect(checked.rootIssues[0]?.cause).toBeInstanceOf(Error);
      Vitest.expect(checked.specs[0]?.valid).toBe(true);
      Vitest.expect(checkExitCode(checked)).toBe(1);

      const verbose = renderCheck(checked, true);
      Vitest.expect(verbose).toContain('\u2717 sizing.json (1)');
      Vitest.expect(verbose).toContain('  code     store.error');
      Vitest.expect(verbose).toContain('  path     sizing.json');
      Vitest.expect(verbose).toContain('  field    root');
      Vitest.expect(verbose).toContain('  cause    EACCES: permission denied, open sizing.json');
      Vitest.expect(verbose).toContain('1 spec \u00b7 1 config \u00b7 1 failed \u00b7 1 issue');
    }),
  );

  Vitest.it.effect('counts the config as the failed unit when only the config fails', () =>
    Effect.gen(function* () {
      const broken = stubLayer(new Map(), new Map([['sizing.json', '{"sizes": {']]));
      const checked = yield* check('.agents/@montflow/specs').pipe(Effect.provide(broken));
      Vitest.expect(checked.failed).toBe(0);
      Vitest.expect(renderCheck(checked, false)).toContain(
        '0 specs \u00b7 1 config \u00b7 1 failed \u00b7 1 issue',
      );
    }),
  );

  Vitest.it.effect('reports an unreadable spec directory as a coded finding', () =>
    Effect.gen(function* () {
      const failure = new SpecStore.StoreError({
        operation: 'SpecStore.snapshot',
        reason: 'PermissionDenied: FileSystem.readDirectory',
        path: 'ok/A001-x/TASK.md',
        cause: new Error('EACCES: permission denied, scandir ok/A001-x/TASK.md'),
      });
      const store = stubLayer(specs, new Map(), { snapshotFailure: failure });
      const checked = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
        Effect.provide(store),
      );
      Vitest.expect(checked.specs[0]?.valid).toBe(false);
      Vitest.expect(checked.specs[0]?.issues[0]?.code).toBe('store.error');
      Vitest.expect(renderCheck(checked, false)).toContain('  path     ok/A001-x/TASK.md');
      Vitest.expect(checkExitCode(checked)).toBe(1);
    }),
  );
  Vitest.it.effect(
    'reports an unreadable spec directory once, without doubling the spec name',
    () =>
      Effect.gen(function* () {
        const failure = new SpecStore.StoreError({
          operation: 'SpecStore.snapshot',
          reason: 'PermissionDenied: FileSystem.readDirectory',
          path: '.agents/@montflow/specs/ok',
          cause: new Error('EACCES: permission denied, scandir ok'),
        });
        const store = stubLayer(specs, new Map(), { snapshotFailure: failure });
        const checked = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
          Effect.provide(store),
        );
        const rendered = renderCheck(checked, false);
        Vitest.expect(rendered).toContain('  path     ok');
        Vitest.expect(rendered).toContain('  field    root');
        Vitest.expect(rendered).not.toContain('ok/ok');
        Vitest.expect(checkExitCode(checked)).toBe(1);
      }),
  );
});

Vitest.describe('Cli command Cause diagnosis runtime', () => {
  Vitest.it.effect('labels an injected defect internal, exits 2, and hides the stack', () =>
    Effect.gen(function* () {
      const before = process.exitCode;
      yield* runDiagnosed(Effect.die(new Error('boom')), () => ({
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      }));
      const exitCode = process.exitCode;
      process.exitCode = before;
      const logged = (yield* TestConsole.logLines).map(String).join('\n');
      Vitest.expect(exitCode).toBe(INTERNAL_EXIT_CODE);
      Vitest.expect(logged).toContain('code     internal');
      Vitest.expect(logged).toContain('problem  Internal defect: boom');
      Vitest.expect(logged).not.toContain('    at ');
    }),
  );

  Vitest.it.effect('reports a usage rejection as its own message, not an unhandled failure', () =>
    Effect.gen(function* () {
      const before = process.exitCode;
      yield* runDiagnosed(
        Effect.fail(
          new CliError.UserError({
            cause: "Unknown status 'bogus'.",
            userMessage: "Unknown status 'bogus'.",
          }),
        ),
        () => ({
          path: 'ship-spec',
          rerun: 'mf-specs list',
          verbose: false,
        }),
      );
      const exitCode = process.exitCode;
      process.exitCode = before;
      const logged = (yield* TestConsole.logLines).map(String).join('\n');
      Vitest.expect(exitCode).toBe(1);
      Vitest.expect(logged).toContain("Unknown status 'bogus'.");
      Vitest.expect(logged).not.toContain('failure.unhandled');
    }),
  );

  Vitest.it.effect('shows the stack of an injected defect under --verbose', () =>
    Effect.gen(function* () {
      const before = process.exitCode;
      yield* runDiagnosed(Effect.die(new Error('boom')), () => ({
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: true,
      }));
      process.exitCode = before;
      const logged = (yield* TestConsole.logLines).map(String).join('\n');
      Vitest.expect(logged).toContain('stack    Error: boom');
    }),
  );

  Vitest.it.effect('runs the body and prints nothing extra on success', () =>
    Effect.gen(function* () {
      yield* runDiagnosed(Effect.succeed('done'), () => ({
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      }));
      Vitest.expect(yield* TestConsole.logLines).toStrictEqual([]);
    }),
  );
});
