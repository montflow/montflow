import { NodeServices } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, FileSystem, Layer, Path } from 'effect';

import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import {
  type CheckReport,
  SurfaceError,
  check,
  gateExitCode,
  recordGate,
  runGate,
  storeDirOf,
} from '../index.js';

/** Everything the gate engine needs: the store, filesystem, and a spawner. */
const Live = Layer.provideMerge(SpecStore.Default, NodeServices.layer);

interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  /** Workspace root that owns `.agents/`. */
  readonly dir: string;
  /** `<dir>/.agents/@montflow/specs`. */
  readonly root: string;
}

const prepare = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-gate-' });
  const root = path.join(dir, storeDirOf('.'));
  yield* fs.makeDirectory(root, { recursive: true });
  return { fs, path, dir, root } satisfies Work;
});

/** Write a workspace-relative file, creating its parents. */
const write = (work: Work, relative: string, content: string) =>
  Effect.gen(function* () {
    const target = work.path.join(work.dir, relative);
    yield* work.fs.makeDirectory(work.path.dirname(target), { recursive: true });
    yield* work.fs.writeFileString(target, content);
  });

/** Bind one session as the spec's orchestrator in the workspace registry. */
const bindOrchestrator = (work: Work, spec: string, session: string) =>
  write(
    work,
    '.agents/@montflow/.runtime/claims.json',
    JSON.stringify({
      schema: 1,
      claims: [{ spec, task: 'orchestrator', session, at: '2026-11-03T12:00:00Z' }],
    }),
  );

/** Seed one v2 spec with a single task and the given gate file. */
const seedSpec = (work: Work, options: { readonly gates: string; readonly status: string }) =>
  Effect.gen(function* () {
    const name = 'gate-spec';
    yield* write(
      work,
      `${storeDirOf('.')}/${name}/SPEC.md`,
      specMarkdown({
        name,
        status: options.status,
        version: '2',
        rows: [
          {
            id: 'A001',
            name: 'implement',
            type: 'execution',
            status: options.status,
            gates: 'Yes',
          },
        ],
      }),
    );
    yield* write(
      work,
      `${storeDirOf('.')}/${name}/A/PHASE.md`,
      phaseMarkdown({ id: 'A', status: 'complete' }),
    );
    yield* write(work, `${storeDirOf('.')}/${name}/A/MEMORY.md`, memoryMarkdown());
    yield* write(
      work,
      `${storeDirOf('.')}/${name}/A/A001-implement/TASK.md`,
      taskMarkdown({ id: 'A001', name: 'implement', status: options.status }),
    );
    yield* write(work, `${storeDirOf('.')}/${name}/A/A001-implement/MEMORY.md`, memoryMarkdown());
    yield* write(work, `${storeDirOf('.')}/${name}/A/A001-implement/GATES.md`, options.gates);
    return name;
  });

/** Write a closed review round attributed to one phase. */
const seedClosedRound = (work: Work, name: string, phase: string) =>
  write(
    work,
    `.agents/@montflow/reviews/${name}/001/REVIEW.md`,
    [
      `# Review: ${name} / 001`,
      '',
      '## Metadata',
      '',
      `- Phase: ${phase}`,
      '- Status: closed',
      '',
      '## Findings',
      '',
      'None.',
      '',
    ].join('\n'),
  );

const readResults = (work: Work, relative: string) =>
  work.fs.readFileString(work.path.join(work.dir, relative)).pipe(Effect.orElseSucceed(() => ''));

const lines = (text: string): ReadonlyArray<string> =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

const codesOf = (report: CheckReport): ReadonlyArray<string | undefined> =>
  report.specs.flatMap((spec) => spec.issues.map((found) => found.code));

const twoStages = [
  '## Stage 1: Passing (mechanical)',
  'command: printf second',
  '',
  '- [ ] Passes.',
  '',
  '## Stage 0: Failing (mechanical)',
  'command: printf out; printf err >&2; exit 3',
  '',
  '- [ ] Fails on purpose.',
  '',
].join('\n');

Vitest.describe('Cli.gate run runtime', () => {
  Vitest.it.effect(
    'records a failed mechanical command with its command, exit, and timestamp',
    () =>
      Effect.gen(function* () {
        const work = yield* prepare;
        yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
        yield* seedSpec(work, {
          status: 'in-progress',
          gates: [
            '## Stage 0: Failing (mechanical)',
            'command: printf out; printf err >&2; exit 3',
            '',
            '- [ ] Fails on purpose.',
            '',
          ].join('\n'),
        });
        const report = yield* runGate({
          root: work.root,
          workspace: work.dir,
          name: 'gate-spec',
          phase: 'A',
          task: 'A001',
          session: 'sess-orchestrator',
        });
        Vitest.expect(report.stages).toHaveLength(1);
        Vitest.expect(report.stages[0]).toMatchObject({
          stage: 0,
          kind: 'mechanical',
          command: 'printf out; printf err >&2; exit 3',
          exit: 3,
          verdict: 'fail',
        });
        Vitest.expect(report.stages[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        Vitest.expect(report.stages[0]?.output).toContain('out');
        Vitest.expect(report.stages[0]?.output).toContain('err');
        Vitest.expect(gateExitCode(report)).toBe(1);
        const records = lines(
          yield* readResults(
            work,
            '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
          ),
        );
        Vitest.expect(records).toHaveLength(1);
        Vitest.expect(JSON.parse(records[0] ?? '{}')).toMatchObject({
          stage: 0,
          command: 'printf out; printf err >&2; exit 3',
          exit: 3,
          verdict: 'fail',
        });
      }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('stops at the first failure by default', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'in-progress', gates: twoStages });
      const report = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        session: 'sess-orchestrator',
      });
      Vitest.expect(report.stages.map((stage) => stage.stage)).toStrictEqual([0]);
      Vitest.expect(report.stopped).toBe(true);
      const records = lines(
        yield* readResults(
          work,
          '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
        ),
      );
      Vitest.expect(records).toHaveLength(1);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('continues and records every stage under --all', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'in-progress', gates: twoStages });
      const report = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        all: true,
        session: 'sess-orchestrator',
      });
      Vitest.expect(report.stages.map((stage) => [stage.stage, stage.verdict])).toStrictEqual([
        [0, 'fail'],
        [1, 'pass'],
      ]);
      Vitest.expect(report.stopped).toBe(false);
      const records = lines(
        yield* readResults(
          work,
          '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
        ),
      );
      Vitest.expect(records).toHaveLength(2);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('runs exactly one stage with --stage', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'in-progress', gates: twoStages });
      const report = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        stage: 1,
        session: 'sess-orchestrator',
      });
      Vitest.expect(report.stages.map((stage) => stage.stage)).toStrictEqual([1]);
      Vitest.expect(report.stages[0]?.verdict).toBe('pass');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses --stage with --all', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'in-progress', gates: twoStages });
      const error = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        stage: 0,
        all: true,
        session: 'sess-orchestrator',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (error instanceof SurfaceError) {
        Vitest.expect(error.diagnostics[0]?.code).toBe('gate.argument-conflict');
      }
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses a worker caller with gate.not-orchestrator and writes nothing', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* write(
        work,
        '.agents/@montflow/.runtime/claims.json',
        JSON.stringify({
          schema: 1,
          claims: [
            { spec: 'gate-spec', task: 'A001', session: 'sess-worker', at: '2026-11-03T12:00:00Z' },
          ],
        }),
      );
      yield* seedSpec(work, { status: 'in-progress', gates: twoStages });
      const error = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        session: 'sess-worker',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (error instanceof SurfaceError) {
        Vitest.expect(error.diagnostics[0]?.code).toBe('gate.not-orchestrator');
      }
      Vitest.expect(
        yield* readResults(
          work,
          '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
        ),
      ).toBe('');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses to run a placeholder command and records no pass', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, {
        status: 'in-progress',
        gates: [
          '## Stage 0: Verification (mechanical)',
          'command: <the command that proves implement>',
          '',
          '- [ ] Replace the example command.',
          '',
        ].join('\n'),
      });
      const error = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        session: 'sess-orchestrator',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (error instanceof SurfaceError) {
        Vitest.expect(error.diagnostics[0]?.code).toBe('gate.placeholder-command');
      }
      Vitest.expect(
        yield* readResults(
          work,
          '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
        ),
      ).toBe('');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses the old echo placeholder template too', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, {
        status: 'in-progress',
        gates: [
          '## Stage 0: Verification (mechanical)',
          "command: echo 'replace with the command that proves implement'",
          '',
          '- [ ] Replace the example command.',
          '',
        ].join('\n'),
      });
      const error = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        session: 'sess-orchestrator',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (error instanceof SurfaceError) {
        Vitest.expect(error.diagnostics[0]?.code).toBe('gate.placeholder-command');
      }
    }).pipe(Effect.provide(Live)),
  );
});

Vitest.describe('Cli.gate completion proof runtime', () => {
  const mechanical = [
    '## Stage 0: Suite (mechanical)',
    'command: printf ok',
    '',
    '- [ ] The suite passes.',
    '',
  ].join('\n');

  Vitest.it.effect('check names an unproven gate, then passes once it is recorded', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'complete', gates: mechanical });
      yield* seedClosedRound(work, 'gate-spec', 'A');

      const before = yield* check(work.root, { name: 'gate-spec' });
      Vitest.expect(codesOf(before)).toContain('gate.unproven');
      Vitest.expect(before.specs[0]?.valid).toBe(false);

      yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        session: 'sess-orchestrator',
      });
      const after = yield* check(work.root, { name: 'gate-spec' });
      Vitest.expect(codesOf(after)).not.toContain('gate.unproven');
      Vitest.expect(after.specs[0]?.valid).toBe(true);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('records a phase gate and clears the phase unproven finding', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      const name = 'gate-spec';
      const store = storeDirOf('.');
      yield* write(
        work,
        `${store}/${name}/SPEC.md`,
        specMarkdown({
          name,
          status: 'complete',
          version: '2',
          rows: [
            { id: 'A001', name: 'implement', type: 'execution', status: 'complete', gates: 'No' },
          ],
        }),
      );
      yield* write(
        work,
        `${store}/${name}/A/PHASE.md`,
        phaseMarkdown({ id: 'A', status: 'complete', gate: 'mechanical' }),
      );
      yield* write(work, `${store}/${name}/A/MEMORY.md`, memoryMarkdown());
      yield* write(
        work,
        `${store}/${name}/A/GATES.md`,
        [
          '## Stage 0: Phase suite (mechanical)',
          'command: printf phase-ok',
          '',
          '- [ ] The phase suite passes.',
          '',
        ].join('\n'),
      );
      yield* write(
        work,
        `${store}/${name}/A/A001-implement/TASK.md`,
        taskMarkdown({ id: 'A001', name: 'implement', status: 'complete' }),
      );
      yield* write(work, `${store}/${name}/A/A001-implement/MEMORY.md`, memoryMarkdown());
      yield* seedClosedRound(work, name, 'A');

      const before = yield* check(work.root, { name });
      Vitest.expect(codesOf(before)).toContain('gate.unproven');
      Vitest.expect(
        before.specs[0]?.issues.some((found) => found.message.includes("Phase 'A'")),
      ).toBe(true);

      yield* runGate({
        root: work.root,
        workspace: work.dir,
        name,
        phase: 'A',
        session: 'sess-orchestrator',
      });
      const after = yield* check(work.root, { name });
      Vitest.expect(codesOf(after)).not.toContain('gate.unproven');
      Vitest.expect(after.specs[0]?.valid).toBe(true);
    }).pipe(Effect.provide(Live)),
  );

  const subjective = [
    '## Stage 1: Review (subjective)',
    'judge: effect-reviewer',
    '',
    '- [ ] Every failure is a tagged error.',
    '',
  ].join('\n');

  Vitest.it.effect('never runs or auto-passes a subjective stage, and accepts a judge record', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'complete', gates: subjective });

      const refused = yield* runGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        stage: 1,
        session: 'sess-orchestrator',
      }).pipe(Effect.flip);
      Vitest.expect(refused).toBeInstanceOf(SurfaceError);
      if (refused instanceof SurfaceError) {
        Vitest.expect(refused.diagnostics[0]?.code).toBe('gate.not-mechanical');
      }

      const before = yield* check(work.root, { name: 'gate-spec' });
      Vitest.expect(codesOf(before)).toContain('gate.unjudged');
      Vitest.expect(before.specs[0]?.valid).toBe(false);

      yield* recordGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        stage: 1,
        judge: 'effect-reviewer',
        verdict: 'pass',
        note: 'Every failure is a tagged error.',
        session: 'sess-orchestrator',
      });
      const after = yield* check(work.root, { name: 'gate-spec' });
      Vitest.expect(codesOf(after)).not.toContain('gate.unjudged');
      const records = lines(
        yield* readResults(
          work,
          '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
        ),
      );
      Vitest.expect(JSON.parse(records[0] ?? '{}')).toMatchObject({
        stage: 1,
        kind: 'subjective',
        judge: 'effect-reviewer',
        verdict: 'pass',
        note: 'Every failure is a tagged error.',
      });
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses a worker caller with gate.not-orchestrator and writes nothing', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* write(
        work,
        '.agents/@montflow/.runtime/claims.json',
        JSON.stringify({
          schema: 1,
          claims: [
            { spec: 'gate-spec', task: 'A001', session: 'sess-worker', at: '2026-11-03T12:00:00Z' },
          ],
        }),
      );
      yield* seedSpec(work, { status: 'in-progress', gates: subjective });
      const error = yield* recordGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        stage: 1,
        judge: 'effect-reviewer',
        verdict: 'pass',
        note: 'Looks fine.',
        session: 'sess-worker',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (error instanceof SurfaceError) {
        Vitest.expect(error.diagnostics[0]?.code).toBe('gate.not-orchestrator');
      }
      Vitest.expect(
        yield* readResults(
          work,
          '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
        ),
      ).toBe('');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses a judge other than the stage-declared reviewer', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'in-progress', gates: subjective });
      const error = yield* recordGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        stage: 1,
        judge: 'other-reviewer',
        verdict: 'pass',
        note: 'Looks fine.',
        session: 'sess-orchestrator',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (error instanceof SurfaceError) {
        Vitest.expect(error.diagnostics[0]?.code).toBe('gate.judge-mismatch');
      }
      Vitest.expect(
        yield* readResults(
          work,
          '.agents/@montflow/specs/gate-spec/A/A001-implement/GATE-RESULTS.jsonl',
        ),
      ).toBe('');
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses to record a mechanical stage as subjective', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* bindOrchestrator(work, 'gate-spec', 'sess-orchestrator');
      yield* seedSpec(work, { status: 'in-progress', gates: mechanical });
      const error = yield* recordGate({
        root: work.root,
        workspace: work.dir,
        name: 'gate-spec',
        phase: 'A',
        task: 'A001',
        stage: 0,
        judge: 'effect-reviewer',
        verdict: 'pass',
        note: 'Looks fine.',
        session: 'sess-orchestrator',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (error instanceof SurfaceError) {
        Vitest.expect(error.diagnostics[0]?.code).toBe('gate.not-subjective');
      }
    }).pipe(Effect.provide(Live)),
  );
});
