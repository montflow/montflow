import { Config, Console, Effect, Option } from 'effect';
import { Command, Flag } from 'effect/cli';

import { GATE_CODES } from '../../modules/gates/index.js';
import { SpecStore } from '../../services/index.js';
import {
  type SizingDiagnostic,
  SURFACE_CODES,
  diagnostic,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
} from './cli.shared.module.js';
import { recordGate, renderGateRecord } from './cli.gate.record.module.js';
import { gateFailure } from './cli.gate.stage.module.js';
import {
  DEFAULT_GATE_TIMEOUT,
  gateExitCode,
  renderGateRun,
  runGate,
} from './cli.gate.run.module.js';

export * from './cli.gate.stage.module.js';
export * from './cli.gate.run.module.js';
export * from './cli.gate.record.module.js';

/** The calling session, from the environment the host sets for every agent. */
const callerSession = Config.option(Config.String('OPENCODE_SESSION_ID'));

/** Shared handler: resolve the workspace root a `--dir` names. */
const workspaceOfDir = (dir: string): string => (dir === '.' ? process.cwd() : dir);

/** `gate run`: execute mechanical stages and record their results. */
export const gateRunCommand = Command.make(
  'run',
  {
    dir: dirFlag,
    name: nameFlag,
    phase: Flag.String('phase').pipe(Flag.withDescription('Phase id that owns the GATES.md.')),
    task: Flag.optional(
      Flag.String('task').pipe(Flag.withDescription('Task id; omit to run the phase GATES.md.')),
    ),
    stage: Flag.optional(
      Flag.Int('stage').pipe(Flag.withDescription('Run exactly one stage number.')),
    ),
    all: Flag.Boolean('all').pipe(
      Flag.withDescription('Run every mechanical stage and continue after a failure.'),
      Flag.withDefault(false),
    ),
    timeout: Flag.Int('timeout').pipe(
      Flag.withDescription(`Per-stage timeout in seconds (default ${DEFAULT_GATE_TIMEOUT}).`),
      Flag.withDefault(DEFAULT_GATE_TIMEOUT),
    ),
    scope: Flag.optional(
      Flag.String('scope').pipe(
        Flag.withDescription(
          'Override every stage scope: comma-separated workspace-relative paths, or `repo`.',
        ),
      ),
    ),
    lane: Flag.optional(
      Flag.String('lane').pipe(
        Flag.withDescription('Override every stage lane: `heavy` or `light`.'),
      ),
    ),
    noReuse: Flag.Boolean('no-reuse').pipe(
      Flag.withDescription('Force a run even when a matching passing key exists.'),
      Flag.withDefault(false),
    ),
    lanes: Flag.optional(
      Flag.Int('lanes').pipe(Flag.withDescription('Heavy-lane bound (default 1 or gate.json).')),
    ),
    inFlight: Flag.optional(
      Flag.Int('in-flight').pipe(
        Flag.withDescription('Global in-flight bound (default 2 or gate.json).'),
      ),
    ),
    waitTimeout: Flag.optional(
      Flag.Int('wait-timeout').pipe(
        Flag.withDescription('Seconds to wait for a key, lane, or in-flight slot.'),
      ),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = workspaceOfDir(config.dir);
        const report = yield* runGate({
          root: storeDirOf(config.dir),
          workspace,
          name: config.name,
          phase: config.phase,
          task: opt(config.task),
          stage: Option.getOrUndefined(config.stage),
          all: config.all,
          timeoutSeconds: config.timeout,
          session: Option.getOrUndefined(yield* callerSession),
          scope: Option.getOrUndefined(config.scope),
          lane: Option.getOrUndefined(config.lane),
          noReuse: config.noReuse,
          lanes: Option.getOrUndefined(config.lanes),
          inFlight: Option.getOrUndefined(config.inFlight),
          waitTimeoutSeconds: Option.getOrUndefined(config.waitTimeout),
        });
        yield* Console.log(renderGateRun(report));
        const exit = gateExitCode(report);
        if (exit !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = exit;
          });
        }
      }),
      () => ({
        path: `${config.name}/${config.phase}`,
        rerun: `mf-specs gate run --name ${config.name} --phase ${config.phase}`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Execute mechanical gate stages and append their results.'),
  Command.provide(SpecStore.Default),
);
export const gateRecordCommand = Command.make(
  'record',
  {
    dir: dirFlag,
    name: nameFlag,
    phase: Flag.String('phase').pipe(Flag.withDescription('Phase id that owns the GATES.md.')),
    task: Flag.optional(
      Flag.String('task').pipe(
        Flag.withDescription('Task id; omit to record against the phase GATES.md.'),
      ),
    ),
    stage: Flag.Int('stage').pipe(Flag.withDescription('Subjective stage number to record.')),
    judge: Flag.String('judge').pipe(
      Flag.withDescription('Reviewer profile slug that judged the stage.'),
    ),
    verdict: Flag.String('verdict').pipe(
      Flag.withDescription('Reviewer verdict: `pass` or `fail`.'),
    ),
    note: Flag.String('note').pipe(Flag.withDescription('Why the judge reached the verdict.')),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        if (config.verdict !== 'pass' && config.verdict !== 'fail') {
          return yield* Effect.fail(
            gateFailure({
              code: GATE_CODES.malformedMetadata,
              path: '--verdict',
              field: '--verdict',
              problem: `Verdict '${config.verdict}' is not 'pass' or 'fail'.`,
              rerun: `mf-specs gate record --name ${config.name} --phase ${config.phase} --stage ${config.stage} --judge ${config.judge} --verdict pass|fail --note <text>`,
              expected: 'pass or fail',
              actual: config.verdict,
              fix: 'Use `--verdict pass` or `--verdict fail`.',
            }),
          );
        }
        const report = yield* recordGate({
          root: storeDirOf(config.dir),
          workspace: workspaceOfDir(config.dir),
          name: config.name,
          phase: config.phase,
          task: opt(config.task),
          stage: config.stage,
          judge: config.judge,
          verdict: config.verdict,
          note: config.note,
          session: Option.getOrUndefined(yield* callerSession),
        });
        yield* Console.log(renderGateRecord(report));
      }),
      () => ({
        path: `${config.name}/${config.phase}`,
        rerun: `mf-specs gate record --name ${config.name} --phase ${config.phase}`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Record a subjective gate verdict from its reviewer.'),
  Command.provide(SpecStore.Default),
);

/** `gate`: the mechanical gate runner and the subjective recorder. */
export const gateCommand = Command.make('gate').pipe(
  Command.withDescription('Run mechanical gates and record subjective verdicts.'),
  Command.withSubcommands([gateRunCommand, gateRecordCommand]),
);

/** The diagnostic used when the gate verb itself is missing a selector. */
export const gateSelectorDiagnostic = (verb: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: verb,
    field: '--name',
    problem: `gate ${verb} requires --name <spec> and --phase <id>.`,
    rerun: `mf-specs gate ${verb} --name <spec> --phase <id>`,
    expected: 'a spec name and a phase id',
    actual: 'missing',
    fix: 'Pass `--name` and `--phase`; add `--task` to target a task gate.',
  });
