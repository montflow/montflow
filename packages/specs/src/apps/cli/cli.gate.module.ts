import { Clock, Config, Console, Effect, FileSystem, Option, Stream } from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { holdsOrchestrator, readClaims } from '../../modules/claim/index.js';
import {
  GATE_CODES,
  GATE_RESULTS_FILE,
  type GateKind,
  type GateStage,
  type GateVerdict,
  instant,
  isPlaceholderCommand,
  parseGateResults,
  parseGates,
} from '../../modules/gates/index.js';
import { parseTaskDirName } from '../../modules/task/index.js';
import { type SpecSnapshot } from '../../modules/structure/index.js';
import { SLUG_PATTERN } from '../../modules/task/index.js';
import { type Issue } from '../../modules/verify/index.js';
import { SpecStore } from '../../services/index.js';

import {
  type SizingDiagnostic,
  SURFACE_CODES,
  SurfaceError,
  diagnostic,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
  VALIDATION_EXIT_CODE,
} from './cli.shared.module.js';

/** Default stage timeout, in seconds. */
export const DEFAULT_GATE_TIMEOUT = 600;

/** The calling session, from the environment the host sets for every agent. */
const callerSession = Config.option(Config.String('OPENCODE_SESSION_ID'));

/** The owner of one `GATES.md`: the phase, or one task inside it. */
export interface GateOwner {
  /** Path under the spec directory, e.g. `A` or `A/A001-implement`. */
  readonly prefix: string;
  /** Human label used in messages. */
  readonly label: string;
}

/** Options shared by the gate verbs. */
export interface GateSelector {
  /** Spec store directory. */
  readonly root: string;
  /** Workspace root that owns the claim registry and is the command cwd. */
  readonly workspace: string;
  /** Spec directory name. */
  readonly name: string;
  /** Phase id. */
  readonly phase: string;
  /** Task id; absent means the phase `GATES.md`. */
  readonly task?: string | undefined;
}

/** Options for `gate run`. */
export interface GateRunOptions extends GateSelector {
  /** Run exactly one stage. */
  readonly stage?: number | undefined;
  /** Run every mechanical stage and continue after a failure. */
  readonly all?: boolean | undefined;
  /** Per-stage timeout, in seconds. */
  readonly timeoutSeconds?: number | undefined;
  /** Calling session; the orchestrator binding must name it. */
  readonly session?: string | undefined;
}

/** One executed stage. */
export interface GateStageOutcome {
  readonly stage: number;
  readonly title: string;
  readonly kind: GateKind;
  readonly command: string;
  readonly exit: number;
  readonly verdict: GateVerdict;
  readonly at: string;
  readonly output: string;
}

/** Result of one `gate run`. */
export interface GateRunReport {
  readonly owner: GateOwner;
  /** Path shown to the caller, relative to the workspace root. */
  readonly resultsPath: string;
  readonly stages: ReadonlyArray<GateStageOutcome>;
  /** True when the default form stopped at the first failure. */
  readonly stopped: boolean;
}

/** Options for `gate record`. */
export interface GateRecordOptions extends GateSelector {
  readonly stage: number;
  readonly judge: string;
  readonly verdict: GateVerdict;
  readonly note: string;
  readonly session?: string | undefined;
}

/** One recorded subjective verdict. */
export interface GateRecordReport {
  readonly owner: GateOwner;
  readonly resultsPath: string;
  readonly stage: number;
  readonly judge: string;
  readonly verdict: GateVerdict;
  readonly at: string;
}

/** Build one coded gate refusal. */
export const gateFailure = (input: {
  readonly code: string;
  readonly path: string;
  readonly field: string;
  readonly problem: string;
  readonly rerun: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly fix?: string | undefined;
}): SurfaceError =>
  new SurfaceError({
    operation: 'SpecGate',
    diagnostics: [
      diagnostic({
        code: input.code,
        path: input.path,
        field: input.field,
        problem: input.problem,
        rerun: input.rerun,
        expected: input.expected,
        actual: input.actual,
        fix: input.fix,
      }),
    ],
  });

/** Path of one gate file inside a spec, relative to the spec root. */
export const gateFilePath = (owner: GateOwner, file: string): string => `${owner.prefix}/${file}`;

/**
 * Locate the `GATES.md` owner in a snapshot. A task must sit inside the named
 * phase; a missing owner is a refusal, never an empty run.
 * @param snapshot - spec directory listing
 * @param phase - phase id
 * @param task - task id, or undefined for the phase
 * @returns the owner prefix and label
 */
export const locateOwner = (
  snapshot: SpecSnapshot,
  phase: string,
  task: string | undefined,
): GateOwner | undefined => {
  const files = snapshot.files.filter((entry) => (entry.kind ?? 'file') === 'file');
  const phasePresent = snapshot.files.some(
    (entry) =>
      entry.path === phase ||
      entry.path.startsWith(`${phase}/`) ||
      (entry.kind === 'directory' && entry.path === phase),
  );
  if (task === undefined) {
    return phasePresent ? { prefix: phase, label: `Phase '${phase}'` } : undefined;
  }
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    if (slash === -1) continue;
    const prefix = file.path.slice(0, slash);
    const leaf = prefix.includes('/') ? prefix.slice(prefix.lastIndexOf('/') + 1) : prefix;
    const parsed = parseTaskDirName(leaf);
    if (parsed !== undefined && parsed.id === task && parsed.phase === phase) {
      return { prefix, label: `Task '${task}'` };
    }
  }
  return undefined;
};

/** One selected stage plus its command, or the refusal that stops it. */
type StageSelection =
  | { readonly kind: 'ok'; readonly stages: ReadonlyArray<GateStage> }
  | { readonly kind: 'refused'; readonly error: SurfaceError };

/** Validate one mechanical stage's command line for execution. */
const commandOf = (stage: GateStage, owner: GateOwner, name: string): SurfaceError | undefined => {
  const commands = stage.metadata.filter((entry) => entry.key === 'command');
  const path = gateFilePath(owner, 'GATES.md');
  if (commands.length !== 1) {
    return gateFailure({
      code: GATE_CODES.malformedMetadata,
      path,
      field: 'GATES.md',
      problem: `Mechanical stage ${stage.stage ?? '?'} must carry exactly one \`command:\` line; found ${commands.length}.`,
      rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
      expected: 'exactly one `command: <shell command>`',
      actual: `${commands.length} command lines`,
      fix: 'Add one `command:` line between the stage heading and its first checklist item.',
    });
  }
  const command = stage.command ?? '';
  if (command.trim() === '') {
    return gateFailure({
      code: GATE_CODES.malformedMetadata,
      path,
      field: 'GATES.md',
      problem: `Mechanical stage ${stage.stage ?? '?'} has an empty \`command:\` line.`,
      rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
      expected: 'a shell command to execute',
      actual: 'empty',
      fix: 'Write the command that proves this stage.',
    });
  }
  if (isPlaceholderCommand(command)) {
    return gateFailure({
      code: GATE_CODES.placeholderCommand,
      path,
      field: 'GATES.md',
      problem: `Mechanical stage ${stage.stage ?? '?'} command is still a placeholder: '${command}'.`,
      rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
      expected: 'the real command that proves this stage',
      actual: command,
      fix: 'Replace the placeholder with the command the stage actually runs.',
    });
  }
  return undefined;
};

/**
 * Select the stages one run executes. `--stage` selects exactly one and is
 * refused for an unknown, unclassified, or subjective stage; the default and
 * `--all` select every mechanical stage in ascending order.
 * @param stages - every parsed stage
 * @param owner - owner for messages
 * @param name - spec name for the repair command
 * @param options - stage/all selection
 * @returns the selected stages or one refusal
 */
export const selectStages = (
  stages: ReadonlyArray<GateStage>,
  owner: GateOwner,
  name: string,
  options: { readonly stage?: number | undefined; readonly all?: boolean | undefined },
): StageSelection => {
  if (options.stage !== undefined) {
    const stage = stages.find((candidate) => candidate.stage === options.stage);
    if (stage === undefined) {
      return {
        kind: 'refused',
        error: gateFailure({
          code: GATE_CODES.stageUnknown,
          path: gateFilePath(owner, 'GATES.md'),
          field: '--stage',
          problem: `${owner.label} has no stage ${options.stage}.`,
          rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
          expected: 'a stage number declared in GATES.md',
          actual: String(options.stage),
          fix: 'Pick a stage number this GATES.md declares.',
        }),
      };
    }
    if (stage.kind === undefined) {
      return {
        kind: 'refused',
        error: gateFailure({
          code: GATE_CODES.kindMissing,
          path: gateFilePath(owner, 'GATES.md'),
          field: 'GATES.md',
          problem: `Stage ${options.stage} has no (mechanical) or (subjective) kind, so it is not runnable.`,
          rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
          expected: 'a classified stage heading',
          actual: stage.heading,
          fix: 'Add `(mechanical)` to the stage heading and a `command:` line.',
        }),
      };
    }
    if (stage.kind === 'subjective') {
      return {
        kind: 'refused',
        error: gateFailure({
          code: GATE_CODES.notMechanical,
          path: gateFilePath(owner, 'GATES.md'),
          field: '--stage',
          problem: `Stage ${options.stage} is subjective; a reviewer records it, the CLI never runs it.`,
          rerun: `mf-specs gate record --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''} --stage ${options.stage} --judge <slug> --verdict pass|fail --note <text>`,
          expected: 'a mechanical stage for `gate run`',
          actual: stage.heading,
          fix: 'Have the named reviewer record this stage with `gate record`.',
        }),
      };
    }
    const problem = commandOf(stage, owner, name);
    return problem === undefined
      ? { kind: 'ok', stages: [stage] }
      : { kind: 'refused', error: problem };
  }

  const mechanical = stages
    .filter((stage) => stage.kind === 'mechanical')
    .toSorted((left, right) => (left.stage ?? 0) - (right.stage ?? 0));
  if (mechanical.length === 0) {
    return {
      kind: 'refused',
      error: gateFailure({
        code: GATE_CODES.noMechanicalStages,
        path: gateFilePath(owner, 'GATES.md'),
        field: 'GATES.md',
        problem: `${owner.label} declares no mechanical stage to run.`,
        rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
        expected: 'at least one stage classified `(mechanical)` with a `command:` line',
        actual: 'no mechanical stages',
        fix: 'Classify a stage as mechanical and name its command, or use `gate record` for a subjective review.',
      }),
    };
  }
  for (const stage of mechanical) {
    const problem = commandOf(stage, owner, name);
    if (problem !== undefined) return { kind: 'refused', error: problem };
  }
  return { kind: 'ok', stages: mechanical };
};

/** Parse the owner's existing results file and refuse a corrupt one. */
const existingResults = (
  content: string | undefined,
  owner: GateOwner,
  name: string,
): Effect.Effect<ReadonlyArray<Issue>, SurfaceError> => {
  if (content === undefined) return Effect.succeed([]);
  const parsed = parseGateResults(content);
  const malformed = parsed.issues.filter((found) => found.code === GATE_CODES.resultsMalformed);
  if (malformed.length === 0) return Effect.succeed([]);
  return Effect.fail(
    gateFailure({
      code: GATE_CODES.resultsMalformed,
      path: gateFilePath(owner, GATE_RESULTS_FILE),
      field: GATE_RESULTS_FILE,
      problem: `${gateFilePath(owner, GATE_RESULTS_FILE)} holds a line that is not a gate result, so the run will not append to it.`,
      rerun: `mf-specs check --name ${name}`,
      expected: 'one B004 result record per line',
      actual: malformed[0]?.message ?? 'malformed line',
      fix: 'Remove or fix the malformed line, then re-run the gate.',
    }),
  );
};

/** Append one JSON line to a results file. */
const appendResult = (
  path: string,
  line: string,
): Effect.Effect<void, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const existing = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''));
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
    yield* fs.writeFileString(path, `${separator}${line}\n`, { flag: 'a' });
  }).pipe(
    Effect.mapError((cause) =>
      gateFailure({
        code: GATE_CODES.writeFailed,
        path,
        field: GATE_RESULTS_FILE,
        problem: `Cannot append a gate result to '${path}'.`,
        rerun: 'mf-specs check --name <spec>',
        expected: 'a writable GATE-RESULTS.jsonl',
        actual: cause instanceof Error ? cause.message : String(cause),
        fix: 'Check the owner directory is writable, then re-run the gate.',
      }),
    ),
  );

/** Outcome of one shell command. */
interface CommandOutcome {
  readonly exit: number;
  readonly output: string;
}

/**
 * Execute one stage command from the workspace root with `sh -c`. A timeout is
 * exit 124 and a spawn failure is exit 127; both are recorded, never thrown.
 * @param command - the command verbatim from `GATES.md`
 * @param cwd - workspace root
 * @param timeoutSeconds - per-stage timeout
 * @returns the exit status and combined output
 */
export const executeGateCommand = (
  command: string,
  cwd: string,
  timeoutSeconds: number,
): Effect.Effect<CommandOutcome, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make('sh', ['-c', command], {
      cwd,
      extendEnv: true,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = yield* handle.all.pipe(Stream.decodeText(), Stream.mkString);
    const exit = yield* handle.exitCode;
    return { exit: Number(exit), output };
  }).pipe(
    Effect.scoped,
    Effect.timeoutOption(timeoutSeconds * 1000),
    Effect.map(
      Option.getOrElse((): CommandOutcome => ({
        exit: 124,
        output: `Timed out after ${timeoutSeconds} seconds.`,
      })),
    ),
    Effect.catch((cause) =>
      Effect.succeed({
        exit: 127,
        output: `Failed to execute command: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
    ),
  );

/** Resolve the snapshot and owner, with one refusal per missing part. */
const readOwner = (
  options: GateSelector,
): Effect.Effect<
  { readonly owner: GateOwner; readonly snapshot: SpecSnapshot },
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore
> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const exists = yield* store.exists(options.root, options.name);
    if (!exists) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecGate',
          reason: `Spec directory '${options.name}' was not found under ${options.root}.`,
          path: `${options.root}/${options.name}`,
        }),
      );
    }
    const snapshot = yield* store.snapshot(options.root, options.name);
    const owner = locateOwner(snapshot, options.phase, options.task);
    if (owner === undefined) {
      return yield* Effect.fail(
        gateFailure({
          code: options.task === undefined ? SURFACE_CODES.unknownPhase : GATE_CODES.ownerMissing,
          path: `${options.name}/${options.phase}`,
          field: options.task === undefined ? '--phase' : '--task',
          problem:
            options.task === undefined
              ? `Phase '${options.phase}' has no directory in spec '${options.name}'.`
              : `Task '${options.task}' is not in phase '${options.phase}' of spec '${options.name}'.`,
          rerun: `mf-specs state --name ${options.name}`,
          expected:
            options.task === undefined ? 'a phase directory' : 'a task directory inside that phase',
          actual: options.task ?? options.phase,
          fix: 'Use the phase and task ids the derived state reports.',
        }),
      );
    }
    return { owner, snapshot };
  });

/** One file's contents from a snapshot. */
const fileAt = (snapshot: SpecSnapshot, path: string): string | undefined =>
  snapshot.files.find((entry) => entry.path === path && (entry.kind ?? 'file') === 'file')?.content;

/**
 * Execute mechanical stages and append one result line per executed stage to
 * the owner's `GATE-RESULTS.jsonl`. Only a session holding the spec's
 * orchestrator binding may call it. With no selector every mechanical stage
 * runs and stops at the first failure; `--all` continues; `--stage` runs one.
 * @param options - owner, selection, timeout, and caller session
 * @returns every executed stage, in run order
 */
export const runGate = (
  options: GateRunOptions,
): Effect.Effect<
  GateRunReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    if (options.stage !== undefined && options.all === true) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.argumentConflict,
          path: '--stage',
          field: '--all',
          problem: '`--stage` and `--all` cannot be combined.',
          rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
          expected: 'either `--stage <n>` or `--all`',
          actual: '--stage with --all',
          fix: 'Pick one: `--stage <n>` for a single stage, or `--all` for every stage.',
        }),
      );
    }
    if (options.stage !== undefined && (!Number.isInteger(options.stage) || options.stage < 0)) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.stageUnknown,
          path: '--stage',
          field: '--stage',
          problem: `Stage '${options.stage}' is not a non-negative integer.`,
          rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
          expected: 'a non-negative stage number',
          actual: String(options.stage),
          fix: 'Pass the number the stage heading declares.',
        }),
      );
    }
    const claims = yield* readClaims(options.workspace);
    if (!holdsOrchestrator(claims, options.name, options.session)) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.notOrchestrator,
          path: options.name,
          field: 'session',
          problem: `Session ${options.session === undefined || options.session === '' ? '(none)' : `'${options.session}'`} does not hold the orchestrator binding for '${options.name}'.`,
          rerun: `mf-specs claim --name ${options.name} --orchestrator`,
          expected: 'a session bound with `claim --orchestrator`',
          actual: options.session ?? 'no session',
          fix: 'The execution orchestrator binds itself with `mf-specs claim --name <spec> --orchestrator`; a worker may never run a gate.',
        }),
      );
    }

    const { owner, snapshot } = yield* readOwner(options);
    const gatesPath = gateFilePath(owner, 'GATES.md');
    const gates = fileAt(snapshot, gatesPath);
    if (gates === undefined) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.fileMissing,
          path: gatesPath,
          field: 'GATES.md',
          problem: `${owner.label} has no GATES.md.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: `${gatesPath}`,
          actual: 'missing',
          fix: 'Add the gate file, or select an owner that has one.',
        }),
      );
    }

    const resultsPath = gateFilePath(owner, GATE_RESULTS_FILE);
    yield* existingResults(fileAt(snapshot, resultsPath), owner, options.name);
    const stages = parseGates(gates);
    const selection = selectStages(stages, owner, options.name, options);
    if (selection.kind === 'refused') return yield* Effect.fail(selection.error);

    const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_GATE_TIMEOUT;
    const outcomes: Array<GateStageOutcome> = [];
    let stopped = false;
    for (const [index, stage] of selection.stages.entries()) {
      const command = stage.command ?? '';
      const result = yield* executeGateCommand(command, options.workspace, timeoutSeconds);
      const at = instant(yield* Clock.currentTimeMillis);
      const verdict: GateVerdict = result.exit === 0 ? 'pass' : 'fail';
      const outcome: GateStageOutcome = {
        stage: stage.stage ?? 0,
        title: stage.title,
        kind: 'mechanical',
        command,
        exit: result.exit,
        verdict,
        at,
        output: result.output,
      };
      // The record carries exactly B004's mechanical keys, no extras.
      yield* appendResult(
        `${options.root}/${options.name}/${resultsPath}`,
        JSON.stringify(outcome),
      );
      outcomes.push(outcome);
      if (verdict === 'fail' && options.stage === undefined && options.all !== true) {
        stopped = index < selection.stages.length - 1;
        break;
      }
    }
    return { owner, resultsPath, stages: outcomes, stopped };
  });

/**
 * Record one subjective verdict from the reviewer role. The CLI never derives
 * a subjective pass on its own: the judge must supply the verdict and note.
 * @param options - owner, stage, judge, verdict, and note
 * @returns the recorded verdict
 */
export const recordGate = (
  options: GateRecordOptions,
): Effect.Effect<
  GateRecordReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const claims = yield* readClaims(options.workspace);
    if (!holdsOrchestrator(claims, options.name, options.session)) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.notOrchestrator,
          path: options.name,
          field: 'session',
          problem: `Session ${options.session === undefined || options.session === '' ? '(none)' : `'${options.session}'`} does not hold the orchestrator binding for '${options.name}'.`,
          rerun: `mf-specs claim --name ${options.name} --orchestrator`,
          expected: 'a session bound with `claim --orchestrator`',
          actual: options.session ?? 'no session',
          fix: 'The execution orchestrator binds itself with `mf-specs claim --name <spec> --orchestrator`; a worker may never record a verdict.',
        }),
      );
    }
    if (!SLUG_PATTERN.test(options.judge)) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.malformedMetadata,
          path: '--judge',
          field: '--judge',
          problem: `Judge '${options.judge}' is not a profile slug.`,
          rerun: `mf-specs gate record --name ${options.name} --phase ${options.phase} --stage ${options.stage} --judge <slug> --verdict pass|fail --note <text>`,
          expected: 'a lowercase kebab-case profile slug',
          actual: options.judge,
          fix: 'Name the reviewer profile exactly as the stage `judge:` line names it.',
        }),
      );
    }
    if (options.note.trim() === '') {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.malformedMetadata,
          path: '--note',
          field: '--note',
          problem: 'A subjective verdict needs a non-empty note.',
          rerun: `mf-specs gate record --name ${options.name} --phase ${options.phase} --stage ${options.stage} --judge ${options.judge} --verdict ${options.verdict} --note <text>`,
          expected: 'the judge’s reason for the verdict',
          actual: 'empty',
          fix: 'Pass `--note` with what the reviewer judged and why.',
        }),
      );
    }
    const { owner, snapshot } = yield* readOwner(options);
    const gatesPath = gateFilePath(owner, 'GATES.md');
    const gates = fileAt(snapshot, gatesPath);
    if (gates === undefined) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.fileMissing,
          path: gatesPath,
          field: 'GATES.md',
          problem: `${owner.label} has no GATES.md.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: gatesPath,
          actual: 'missing',
          fix: 'Add the gate file, or select an owner that has one.',
        }),
      );
    }
    const stage = parseGates(gates).find((candidate) => candidate.stage === options.stage);
    if (stage === undefined) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.stageUnknown,
          path: gatesPath,
          field: '--stage',
          problem: `${owner.label} has no stage ${options.stage}.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: 'a stage number declared in GATES.md',
          actual: String(options.stage),
          fix: 'Pick a stage number this GATES.md declares.',
        }),
      );
    }
    if (stage.kind !== 'subjective') {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.notSubjective,
          path: gatesPath,
          field: '--stage',
          problem: `Stage ${options.stage} is ${stage.kind === 'mechanical' ? 'mechanical' : 'unclassified'}; only a subjective stage is recorded by a judge.`,
          rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase} --stage ${options.stage}`,
          expected: 'a subjective stage for `gate record`',
          actual: stage.heading,
          fix: 'Run a mechanical stage with `gate run`; record only a subjective verdict here.',
        }),
      );
    }
    if (stage.judge !== options.judge) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.judgeMismatch,
          path: gatesPath,
          field: '--judge',
          problem: `Stage ${options.stage} names judge '${stage.judge ?? '(none)'}' but '${options.judge}' tried to record it.`,
          rerun: `mf-specs gate record --name ${options.name} --phase ${options.phase} --stage ${options.stage} --judge ${stage.judge ?? '<slug>'} --verdict ${options.verdict} --note <text>`,
          expected: `the stage's declared judge '${stage.judge ?? '(none)'}'`,
          actual: options.judge,
          fix: 'Record the verdict under the reviewer profile the stage declares.',
        }),
      );
    }
    const resultsPath = gateFilePath(owner, GATE_RESULTS_FILE);
    yield* existingResults(fileAt(snapshot, resultsPath), owner, options.name);
    const at = instant(yield* Clock.currentTimeMillis);
    const record = {
      stage: options.stage,
      title: stage.title,
      kind: 'subjective' as const,
      judge: options.judge,
      verdict: options.verdict,
      at,
      note: options.note,
    };
    yield* appendResult(`${options.root}/${options.name}/${resultsPath}`, JSON.stringify(record));
    return {
      owner,
      resultsPath,
      stage: options.stage,
      judge: options.judge,
      verdict: options.verdict,
      at,
    };
  });

/** Process exit code a gate run implies. */
export const gateExitCode = (report: GateRunReport): number =>
  report.stages.every((stage) => stage.verdict === 'pass') ? 0 : VALIDATION_EXIT_CODE;

/** Render one stage outcome line. */
export const renderStageOutcome = (outcome: GateStageOutcome): string => {
  const mark = outcome.verdict === 'pass' ? '\u2713' : '\u2717';
  return `${mark} stage ${outcome.stage} ${outcome.title} (${outcome.kind}) ${outcome.verdict} \u00b7 exit ${outcome.exit} \u00b7 ${outcome.command}`;
};

/** Render a gate run report. */
export const renderGateRun = (report: GateRunReport): string => {
  const passed = report.stages.filter((stage) => stage.verdict === 'pass').length;
  const lines = report.stages.map(renderStageOutcome);
  lines.push(
    `${passed}/${report.stages.length} stage${report.stages.length === 1 ? '' : 's'} passed \u00b7 ${report.resultsPath}`,
  );
  if (report.stopped) {
    lines.push(
      'Stopped at the first failing stage; later stages were not run. Use --all to run them.',
    );
  }
  return lines.join('\n');
};

/** Render a recorded subjective verdict. */
export const renderGateRecord = (report: GateRecordReport): string =>
  `\u2713 recorded ${report.verdict} for stage ${report.stage} from ${report.judge} \u00b7 ${report.resultsPath}`;

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

/** `gate record`: append one reviewer's subjective verdict. */
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
