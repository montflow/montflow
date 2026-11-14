import { NodeServices } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, Fiber, FileSystem, Layer, Path } from 'effect';

import { readRunState } from '../../../modules/scheduler/index.js';
import { parseGateResults, parseGates } from '../../../modules/gates/index.js';
import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import {
  type CheckReport,
  type GateRunOptions,
  SurfaceError,
  check,
  next,
  renderNext,
  renderStatus,
  runGate,
  status,
  storeDirOf,
} from '../index.js';

const Live = Layer.provideMerge(SpecStore.Default, NodeServices.layer);

interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly dir: string;
  readonly root: string;
}

const prepare = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-gate-scheduler-' });
  const root = path.join(dir, storeDirOf('.'));
  yield* fs.makeDirectory(root, { recursive: true });
  return { fs, path, dir, root } satisfies Work;
});

const write = (work: Work, relative: string, content: string) =>
  Effect.gen(function* () {
    const target = work.path.join(work.dir, relative);
    yield* work.fs.makeDirectory(work.path.dirname(target), { recursive: true });
    yield* work.fs.writeFileString(target, content);
  });

const read = (work: Work, relative: string) =>
  work.fs.readFileString(work.path.join(work.dir, relative)).pipe(Effect.orElseSucceed(() => ''));

/** Bind one or more sessions as the spec's orchestrator. */
const bindOrchestrators = (work: Work, spec: string, sessions: ReadonlyArray<string>) =>
  write(
    work,
    '.agents/@montflow/.runtime/claims.json',
    JSON.stringify({
      schema: 1,
      claims: sessions.map((session) => ({
        spec,
        task: 'orchestrator',
        session,
        at: '2026-11-03T12:00:00Z',
      })),
    }),
  );

interface StageFixture {
  readonly command: string;
  readonly scope?: string;
  readonly lane?: string;
}

const gatesMarkdown = (stages: ReadonlyArray<StageFixture>): string =>
  stages
    .map((stage, index) =>
      [
        `## Stage ${index}: Proof (mechanical)`,
        `command: ${stage.command}`,
        ...(stage.scope === undefined ? [] : [`scope: ${stage.scope}`]),
        ...(stage.lane === undefined ? [] : [`lane: ${stage.lane}`]),
        '',
        '- [ ] The proof passes.',
        '',
      ].join('\n'),
    )
    .join('\n');

interface TaskFixture {
  readonly id: string;
  readonly name: string;
  readonly status?: string;
  readonly writeScope?: string;
  readonly stages: ReadonlyArray<StageFixture>;
}

interface SeededTask {
  readonly id: string;
  readonly name: string;
  status: string;
  writeScope?: string;
}

const SPEC = 'sched-spec';

/** Seed a v2 spec whose phase holds one task per fixture. */
const seedSpec = (work: Work, tasks: ReadonlyArray<TaskFixture>, statusOf = 'in-progress') =>
  Effect.gen(function* () {
    yield* write(
      work,
      `${storeDirOf('.')}/${SPEC}/SPEC.md`,
      specMarkdown({
        name: SPEC,
        status: statusOf,
        version: '2',
        rows: tasks.map((task) => ({
          id: task.id,
          name: task.name,
          type: 'execution',
          status: task.status ?? statusOf,
          gates: 'Yes',
        })),
      }),
    );
    yield* write(
      work,
      `${storeDirOf('.')}/${SPEC}/A/PHASE.md`,
      phaseMarkdown({ id: 'A', status: statusOf }),
    );
    yield* write(work, `${storeDirOf('.')}/${SPEC}/A/MEMORY.md`, memoryMarkdown());
    for (const task of tasks) {
      const dir = `${storeDirOf('.')}/${SPEC}/A/${task.id}-${task.name}`;
      const taskFixture: SeededTask = {
        id: task.id,
        name: task.name,
        status: task.status ?? statusOf,
      };
      if (task.writeScope !== undefined) taskFixture.writeScope = task.writeScope;
      yield* write(work, `${dir}/TASK.md`, taskMarkdown(taskFixture));
      yield* write(work, `${dir}/MEMORY.md`, memoryMarkdown());
      yield* write(work, `${dir}/GATES.md`, gatesMarkdown(task.stages));
    }
  });

/** A stage command that counts its own executions outside any gate scope. */
const counting = (command: string): string => `printf x >> .executions; ${command}`;

const executions = (work: Work) =>
  read(work, '.executions').pipe(Effect.map((text) => text.replace(/\n/g, '').length));

const resultsPath = (task: string) => `${storeDirOf('.')}/${SPEC}/A/${task}-run/GATE-RESULTS.jsonl`;

const records = (work: Work, task: string) =>
  read(work, resultsPath(task)).pipe(Effect.map((text) => parseGateResults(text).records));

const codesOf = (report: CheckReport): ReadonlyArray<string | undefined> =>
  report.specs.flatMap((spec) => spec.issues.map((found) => found.code));

const run = (work: Work, session: string, task = 'A001', extra: Partial<GateRunOptions> = {}) =>
  runGate({
    root: work.root,
    workspace: work.dir,
    name: SPEC,
    phase: 'A',
    task,
    session,
    pollMs: 10,
    ...extra,
  });

/** A spec with one scoped task writing outside its scope, so reuse is stable. */
const singleTask = (stages: ReadonlyArray<StageFixture>, writeScope: string | undefined = 'app') =>
  Effect.gen(function* () {
    const work = yield* prepare;
    yield* bindOrchestrators(work, SPEC, ['sess-a', 'sess-b']);
    yield* write(work, 'app/source.txt', 'one\n');
    yield* write(work, 'app2/source.txt', 'two\n');
    yield* seedSpec(work, [{ id: 'A001', name: 'run', writeScope, stages }]);
    return work;
  });

Vitest.describe('Gate scheduler runtime', () => {
  Vitest.it.live('runs once and lets the second requester reuse the pass', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([
        { command: counting('printf ok'), scope: 'app', lane: 'light' },
      ]);
      const first = yield* run(work, 'sess-a');
      Vitest.expect(first.stages[0]?.reused).toBe(false);
      Vitest.expect(first.stages[0]?.verdict).toBe('pass');
      Vitest.expect(yield* executions(work)).toBe(1);

      const second = yield* run(work, 'sess-b');
      Vitest.expect(second.stages[0]?.reused).toBe(true);
      Vitest.expect(second.stages[0]?.source).toBeDefined();
      Vitest.expect(second.stages[0]?.key).toBe(first.stages[0]?.key);
      Vitest.expect(yield* executions(work)).toBe(1);

      const lines = yield* records(work, 'A001');
      Vitest.expect(lines).toHaveLength(2);
      Vitest.expect(lines[0]).toMatchObject({
        stage: 0,
        kind: 'mechanical',
        scope: ['app'],
        lane: 'light',
        reused: false,
        verdict: 'pass',
        owner: 'sess-a',
      });
      Vitest.expect(lines[0]?.key?.startsWith('gate-v1:')).toBe(true);
      Vitest.expect(lines[0]?.fingerprint).toBeDefined();
      Vitest.expect(lines[0]?.durationMs).toBeTypeOf('number');
      Vitest.expect(lines[0]?.waitedMs).toBeTypeOf('number');
      Vitest.expect(lines[1]).toMatchObject({ reused: true, verdict: 'pass' });
      Vitest.expect(lines[1]?.source).toBeDefined();
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('reruns after the fingerprinted inputs change', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([{ command: counting('printf ok'), scope: 'app' }]);
      const first = yield* run(work, 'sess-a');
      yield* write(work, 'app/change.txt', 'changed\n');
      const second = yield* run(work, 'sess-b');
      Vitest.expect(second.stages[0]?.key).not.toBe(first.stages[0]?.key);
      Vitest.expect(second.stages[0]?.reused).toBe(false);
      Vitest.expect(yield* executions(work)).toBe(2);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('check rejects a green whose fingerprint is stale, naming the key', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([{ command: counting('printf ok'), scope: 'app' }]);
      const report = yield* run(work, 'sess-a');
      const key = report.stages[0]?.key ?? '';
      const clean = yield* check(work.root, { name: SPEC });
      Vitest.expect(codesOf(clean)).not.toContain('gate.stale-result');

      yield* write(work, 'app/change.txt', 'changed\n');
      const stale = yield* check(work.root, { name: SPEC });
      const finding = stale.specs[0]?.issues.find((found) => found.code === 'gate.stale-result');
      Vitest.expect(finding).toBeDefined();
      Vitest.expect(finding?.message).toContain(key);
      Vitest.expect(stale.specs[0]?.valid).toBe(false);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('a newer pass supersedes a stale one for the same stage', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([{ command: counting('printf ok'), scope: 'app' }]);
      const first = yield* run(work, 'sess-a');
      const staleKey = first.stages[0]?.key ?? '';

      yield* write(work, 'app/change.txt', 'changed\n');
      const second = yield* run(work, 'sess-b');
      Vitest.expect(second.stages[0]?.key).not.toBe(staleKey);
      Vitest.expect(second.stages[0]?.verdict).toBe('pass');

      // The old pass is stale on its own, but the newer pass is the effective
      // record for the stage, so check must not brick the append-only file.
      const fresh = yield* check(work.root, { name: SPEC });
      Vitest.expect(codesOf(fresh)).not.toContain('gate.stale-result');
      Vitest.expect(fresh.specs[0]?.valid).toBe(true);
      const lines = yield* records(work, 'A001');
      Vitest.expect(lines).toHaveLength(2);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('records a timeout as a fail, never a pass', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([{ command: 'sleep 3', scope: 'app' }]);
      const report = yield* run(work, 'sess-a', 'A001', { timeoutSeconds: 1 });
      Vitest.expect(report.stages[0]?.exit).toBe(124);
      Vitest.expect(report.stages[0]?.verdict).toBe('fail');

      const state = yield* readRunState(work.dir, report.stages[0]?.key ?? '');
      Vitest.expect(state?.state).toBe('timeout');
      const lines = yield* records(work, 'A001');
      Vitest.expect(lines[0]).toMatchObject({ exit: 124, verdict: 'fail' });
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('never reuses a failure as a pass', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([{ command: counting('exit 3'), scope: 'app' }]);
      const first = yield* run(work, 'sess-a');
      const second = yield* run(work, 'sess-b');
      Vitest.expect(first.stages[0]?.verdict).toBe('fail');
      Vitest.expect(second.stages[0]?.verdict).toBe('fail');
      Vitest.expect(second.stages[0]?.reused).toBe(false);
      Vitest.expect(yield* executions(work)).toBe(2);
      const state = yield* readRunState(work.dir, second.stages[0]?.key ?? '');
      Vitest.expect(state?.state).toBe('failed');
      Vitest.expect(state?.attempts).toHaveLength(2);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('bounds the heavy lane to one and honors the --lanes override', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrators(work, SPEC, ['sess-a', 'sess-b']);
      yield* write(work, 'app1/source.txt', 'one\n');
      yield* write(work, 'app2/source.txt', 'two\n');
      yield* seedSpec(work, [
        {
          id: 'A001',
          name: 'run',
          writeScope: 'app1',
          stages: [{ command: 'sleep 0.4; printf a', scope: 'app1', lane: 'heavy' }],
        },
        {
          id: 'A002',
          name: 'run',
          writeScope: 'app2',
          stages: [{ command: 'printf b', scope: 'app2', lane: 'heavy' }],
        },
      ]);

      const firstFiber = yield* run(work, 'sess-a', 'A001', { noReuse: true }).pipe(
        Effect.forkChild,
      );
      yield* Effect.sleep(100);
      const second = yield* run(work, 'sess-b', 'A002', { noReuse: true });
      yield* Fiber.join(firstFiber);
      Vitest.expect(second.stages[0]?.waited).toBe(true);

      const overrideFiber = yield* run(work, 'sess-a', 'A001', {
        noReuse: true,
        lanes: 2,
      }).pipe(Effect.forkChild);
      yield* Effect.sleep(100);
      const overridden = yield* run(work, 'sess-b', 'A002', { noReuse: true, lanes: 2 });
      yield* Fiber.join(overrideFiber);
      Vitest.expect(overridden.stages[0]?.waited).toBe(false);
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('refuses a bound below 1 and a scope that does not exist', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([{ command: 'printf ok', scope: 'app' }]);
      const below = yield* run(work, 'sess-a', 'A001', { lanes: 0 }).pipe(Effect.flip);
      Vitest.expect(below).toBeInstanceOf(SurfaceError);
      if (below instanceof SurfaceError) {
        Vitest.expect(below.diagnostics[0]?.code).toBe('gate.invalid-config');
      }
      const missing = yield* run(work, 'sess-a', 'A001', { scope: 'nope' }).pipe(Effect.flip);
      Vitest.expect(missing).toBeInstanceOf(SurfaceError);
      if (missing instanceof SurfaceError) {
        Vitest.expect(missing.diagnostics[0]?.code).toBe('gate.invalid-scope');
      }
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('exposes the key, lane, and reused source on next and status', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrators(work, SPEC, ['sess-a', 'sess-b']);
      yield* write(work, 'app/source.txt', 'one\n');
      yield* write(work, 'app2/source.txt', 'two\n');
      yield* seedSpec(work, [
        {
          id: 'A001',
          name: 'run',
          status: 'in-progress',
          writeScope: 'app',
          stages: [{ command: 'printf ok', scope: 'app' }],
        },
        {
          id: 'A002',
          name: 'later',
          status: 'pending',
          writeScope: 'app2',
          stages: [{ command: 'printf later', scope: 'app2', lane: 'light' }],
        },
      ]);
      yield* write(
        work,
        `${storeDirOf('.')}/${SPEC}/A/GATES.md`,
        [
          '## Stage 0: Phase suite (mechanical)',
          'command: printf phase',
          'scope: repo',
          '',
          '- [ ] Passes.',
          '',
        ].join('\n'),
      );

      const report = yield* status(work.root, SPEC);
      Vitest.expect(renderStatus(report)).toContain(
        'runs 0 in-flight \u00b7 0 queued \u00b7 0 stale',
      );

      const first = yield* run(work, 'sess-a');
      const key = first.stages[0]?.key ?? '';
      const nextReport = yield* next(work.root, SPEC);
      const nextText = renderNext(nextReport);
      Vitest.expect(nextText).toContain('gate task-local app2');
      Vitest.expect(nextText).toContain(
        'phase-gate mechanical repo \u00b7 shared once at boundary',
      );

      const after = yield* status(work.root, SPEC);
      const text = renderStatus(after);
      Vitest.expect(text).toContain('runs 0 in-flight');
      Vitest.expect(text).toContain(`run ${key} light`);
      Vitest.expect(text).toContain('passed');
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('refuses a task gate with no resolvable scope', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrators(work, SPEC, ['sess-a']);
      yield* write(work, 'app/source.txt', 'one\n');
      yield* seedSpec(work, [{ id: 'A001', name: 'run', stages: [{ command: 'printf ok' }] }]);
      const failure = yield* run(work, 'sess-a').pipe(Effect.flip);
      Vitest.expect(failure).toBeInstanceOf(SurfaceError);
      if (failure instanceof SurfaceError) {
        Vitest.expect(failure.diagnostics[0]?.code).toBe('gate.scope-missing');
      }
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('records the scope declared on the stage and honors a covering --scope', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([{ command: 'printf ok', scope: 'app/sub' }]);
      yield* write(work, 'app/sub/source.txt', 'nested\n');
      const declared = yield* run(work, 'sess-a', 'A001', { noReuse: true });
      Vitest.expect(declared.stages[0]?.scope).toStrictEqual(['app/sub']);
      const lines = yield* records(work, 'A001');
      Vitest.expect(
        parseGates(gatesMarkdown([{ command: 'printf ok', scope: 'app/sub' }])),
      ).toHaveLength(1);
      Vitest.expect(parseGateResults(JSON.stringify(lines[0])).records).toHaveLength(1);

      const narrowed = yield* run(work, 'sess-a', 'A001', {
        scope: 'app2',
        noReuse: true,
      }).pipe(Effect.flip);
      Vitest.expect(narrowed).toBeInstanceOf(SurfaceError);
      if (narrowed instanceof SurfaceError) {
        Vitest.expect(narrowed.diagnostics[0]?.code).toBe('gate.invalid-scope');
      }

      const overridden = yield* run(work, 'sess-a', 'A001', {
        scope: 'app',
        noReuse: true,
      });
      Vitest.expect(overridden.stages[0]?.scope).toStrictEqual(['app']);
      Vitest.expect(overridden.stages[0]?.key).not.toBe(declared.stages[0]?.key);
      const checked = yield* check(work.root, { name: SPEC });
      Vitest.expect(codesOf(checked)).not.toContain('gate.stale-result');
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('refuses a non-covering --scope before any stage runs or records', () =>
    Effect.gen(function* () {
      const work = yield* singleTask([
        { command: counting('printf one'), scope: 'app/sub', lane: 'light' },
        { command: counting('printf two'), scope: 'app', lane: 'light' },
      ]);
      yield* write(work, 'app/sub/source.txt', 'nested\n');
      const failure = yield* run(work, 'sess-a', 'A001', {
        scope: 'app/sub',
        all: true,
      }).pipe(Effect.flip);
      Vitest.expect(failure).toBeInstanceOf(SurfaceError);
      Vitest.expect(yield* executions(work)).toBe(0);
      Vitest.expect(yield* records(work, 'A001')).toHaveLength(0);
      if (failure instanceof SurfaceError) {
        Vitest.expect(failure.diagnostics[0]?.code).toBe('gate.invalid-scope');
        Vitest.expect(failure.diagnostics[0]?.problem).toContain('stage 1');
      }
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live('refuses a later stage with no declared scope before any stage runs', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrators(work, SPEC, ['sess-a']);
      yield* write(work, 'app/sub/source.txt', 'nested\n');
      // No task write-scope: stage 1 falls back to nothing, the shape the
      // generators produce by default.
      yield* seedSpec(work, [
        {
          id: 'A001',
          name: 'run',
          stages: [
            { command: counting('printf one'), scope: 'app/sub', lane: 'light' },
            { command: counting('printf two'), lane: 'light' },
          ],
        },
      ]);
      const failure = yield* run(work, 'sess-a', 'A001', { all: true }).pipe(Effect.flip);
      Vitest.expect(failure).toBeInstanceOf(SurfaceError);
      Vitest.expect(yield* executions(work)).toBe(0);
      Vitest.expect(yield* work.fs.exists(work.path.join(work.dir, resultsPath('A001')))).toBe(
        false,
      );
      if (failure instanceof SurfaceError) {
        Vitest.expect(failure.diagnostics[0]?.code).toBe('gate.scope-missing');
        Vitest.expect(failure.diagnostics[0]?.problem).toContain('stage 1');
      }
    }).pipe(Effect.provide(Live), Effect.scoped),
  );

  Vitest.it.live(
    'keeps check clean after --all when an earlier stage writes in a later scope',
    () =>
      Effect.gen(function* () {
        const work = yield* prepare;
        yield* bindOrchestrators(work, SPEC, ['sess-a']);
        yield* write(work, 'app/source.txt', 'one\n');
        // Stage 0 writes at the workspace root: outside its own `app` scope but
        // inside stage 1's `repo` scope, so only stage 1's key can go stale.
        yield* seedSpec(work, [
          {
            id: 'A001',
            name: 'run',
            stages: [
              { command: 'touch built.txt', scope: 'app', lane: 'light' },
              { command: 'printf two', scope: 'repo', lane: 'light' },
            ],
          },
        ]);
        const report = yield* run(work, 'sess-a', 'A001', { all: true });
        Vitest.expect(report.stages.map((stage) => stage.verdict)).toStrictEqual(['pass', 'pass']);
        Vitest.expect(yield* work.fs.exists(work.path.join(work.dir, 'built.txt'))).toBe(true);
        // The pre-pass may check existence, but it must not seed the key cache:
        // stage 1's recorded key has to describe the tree it actually verified.
        const checked = yield* check(work.root, { name: SPEC });
        Vitest.expect(codesOf(checked)).not.toContain('gate.stale-result');
      }).pipe(Effect.provide(Live), Effect.scoped),
  );
});
