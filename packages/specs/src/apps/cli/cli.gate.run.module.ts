import { Effect, FileSystem, Option, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { holdsOrchestrator, readClaims } from '../../modules/claim/index.js';
import {
  GATE_CODES,
  GATE_RESULTS_FILE,
  type GateKind,
  type GateVerdict,
  parseGateResults,
  parseGates,
  stageLane,
} from '../../modules/gates/index.js';
import {
  GATE_CONFIG_FILE,
  GateWaitTimeout,
  type GateConfig,
  type GateLane,
  type ScheduleOutcome,
  SchedulerLockError,
  SchedulerWriteError,
  fingerprintScopes,
  gateKey,
  isGateLane,
  isScopeList,
  isScopeToken,
  laneOf,
  normalizeScopes,
  parseGateConfig,
  scheduleRun,
} from '../../modules/scheduler/index.js';
import {
  type Task,
  parseTaskDirName,
  parseTaskFile,
  writeScopeTokens,
} from '../../modules/task/index.js';
import { type SpecSnapshot } from '../../modules/structure/index.js';
import { type Issue } from '../../modules/verify/index.js';
import { SpecStore } from '../../services/index.js';

import { SURFACE_CODES, SurfaceError, VALIDATION_EXIT_CODE } from './cli.shared.module.js';
import {
  type GateOwner,
  gateFailure,
  gateFilePath,
  resolveStageScopes,
  selectStages,
} from './cli.gate.stage.module.js';

export const DEFAULT_GATE_TIMEOUT = 600;

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
  /** Override every stage's scope for this invocation. */
  readonly scope?: string | undefined;
  /** Override every stage's lane for this invocation. */
  readonly lane?: string | undefined;
  /** Force a run even when a matching pass exists. */
  readonly noReuse?: boolean | undefined;
  /** Heavy-lane bound override; `< 1` is refused. */
  readonly lanes?: number | undefined;
  /** Global in-flight bound override; `< 1` is refused. */
  readonly inFlight?: number | undefined;
  /** Wait cap override, in seconds; `< 1` is refused. */
  readonly waitTimeoutSeconds?: number | undefined;
  /** Poll interval override (tests only). */
  readonly pollMs?: number | undefined;
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
  /** Run key the stage executed (or reused) under. */
  readonly key: string;
  /** Scopes the fingerprint covered. */
  readonly scope: ReadonlyArray<string>;
  /** Lane the run took. */
  readonly lane: GateLane;
  /** Fingerprint the key was computed from. */
  readonly fingerprint: string;
  /** How long the requester waited before running or consuming. */
  readonly waitedMs: number;
  /** True when this requester consumed an earlier run. */
  readonly reused: boolean;
  /** Instant of the original run when reused. */
  readonly source?: string | undefined;
  /** True when this requester reclaimed an expired lease. */
  readonly reclaimed: boolean;
  /** 1-based attempt number. */
  readonly attempt: number;
  /** Live runs beside this requester when it acquired. */
  readonly inflight: number;
  /** Heavy-lane bound in force. */
  readonly lanes: number;
  /** True when this requester waited at all. */
  readonly waited: boolean;
  /** Queue position when this requester waited for the key. */
  readonly position?: number | undefined;
  /** Owner label: the task id, or `orchestrator` for a phase gate. */
  readonly owner: string;
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

/** Parse the owner's existing results file and refuse a corrupt one. */
export const existingResults = (
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

/**
 * Append one JSON line to a results file and report its 0-based record index,
 * so a run state can point a waiter at the exact outcome record.
 */
export const appendResult = (
  path: string,
  line: string,
): Effect.Effect<number, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const existing = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''));
    const index = existing.split('\n').filter((entry) => entry.trim() !== '').length;
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
    yield* fs.writeFileString(path, `${separator}${line}\n`, { flag: 'a' });
    return index;
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
  /** True when the per-stage timeout fired instead of the command finishing. */
  readonly timedOut: boolean;
}

/**
 * Execute one stage command from the workspace root with `sh -c`. A timeout is
 * exit 124 (marked `timedOut`) and a spawn failure is exit 127; both are
 * recorded, never thrown.
 * @param command - the command verbatim from `GATES.md`
 * @param cwd - workspace root
 * @param timeoutSeconds - per-stage timeout
 * @returns the exit status, combined output, and whether it timed out
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
    return { exit: Number(exit), output, timedOut: false };
  }).pipe(
    Effect.scoped,
    Effect.timeoutOption(timeoutSeconds * 1000),
    Effect.map(
      Option.getOrElse((): CommandOutcome => ({
        exit: 124,
        output: `Timed out after ${timeoutSeconds} seconds.`,
        timedOut: true,
      })),
    ),
    Effect.catch((cause) =>
      Effect.succeed({
        exit: 127,
        output: `Failed to execute command: ${cause instanceof Error ? cause.message : String(cause)}`,
        timedOut: false,
      }),
    ),
  );

/** Resolve the snapshot and owner, with one refusal per missing part. */
export const readOwner = (
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
export const fileAt = (snapshot: SpecSnapshot, path: string): string | undefined =>
  snapshot.files.find((entry) => entry.path === path && (entry.kind ?? 'file') === 'file')?.content;

/** One mechanical result record, exactly the keys `gate run` writes. */
interface MechanicalResult {
  readonly stage: number;
  readonly title: string;
  readonly kind: 'mechanical';
  readonly command: string;
  readonly scope: ReadonlyArray<string>;
  readonly key: string;
  readonly fingerprint: string;
  readonly owner: string;
  readonly exit: number;
  readonly verdict: GateVerdict;
  readonly at: string;
  readonly durationMs: number;
  readonly lane: GateLane;
  readonly waitedMs: number;
  readonly reused: boolean;
  source?: string | undefined;
  readonly output: string;
}

/**
 * The owner's fallback scope: a task's declared `write-scope`, or `repo` for the
 * phase gate. `none` and an absent field resolve to nothing, so a task gate with
 * no scope is `gate.scope-missing` rather than silently fingerprinting the repo.
 */
const ownerScope = (task: Task | undefined): ReadonlyArray<string> | undefined => {
  if (task === undefined) return ['repo'];
  const tokens = writeScopeTokens(task);
  if (tokens === undefined) return undefined;
  if (tokens.length === 1 && tokens[0] === 'none') return undefined;
  return tokens;
};

/** Read and validate `gate.json`, applying the flag overrides. */
const gateConfigOf = (
  workspace: string,
  options: GateRunOptions,
  name: string,
  phase: string,
): Effect.Effect<GateConfig, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(`${workspace.replace(/\/+$/, '')}/${GATE_CONFIG_FILE}`)
      .pipe(Effect.option);
    const parsed = parseGateConfig(Option.isNone(text) ? undefined : text.value);
    if (parsed.problems.length > 0) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.invalidConfig,
          path: GATE_CONFIG_FILE,
          field: GATE_CONFIG_FILE,
          problem: parsed.problems[0] ?? 'Invalid gate config.',
          rerun: `mf-specs gate run --name ${name} --phase ${phase}`,
          expected:
            '{"heavy":{"lanes":1,"inFlight":2},"leaseSeconds":60,"heartbeatSeconds":10,"waitTimeoutSeconds":900}',
          actual: parsed.problems.join(' '),
          fix: 'Fix or remove .agents/@montflow/gate.json; every bound must be an integer >= 1.',
        }),
      );
    }
    let config = parsed.config;
    if (options.lanes !== undefined) {
      if (!Number.isInteger(options.lanes) || options.lanes < 1) {
        return yield* Effect.fail(invalidBound('--lanes', options.lanes, name, phase));
      }
      config = { ...config, heavy: { ...config.heavy, lanes: options.lanes } };
    }
    if (options.inFlight !== undefined) {
      if (!Number.isInteger(options.inFlight) || options.inFlight < 1) {
        return yield* Effect.fail(invalidBound('--in-flight', options.inFlight, name, phase));
      }
      config = { ...config, heavy: { ...config.heavy, inFlight: options.inFlight } };
    }
    if (options.waitTimeoutSeconds !== undefined) {
      if (!Number.isInteger(options.waitTimeoutSeconds) || options.waitTimeoutSeconds < 1) {
        return yield* Effect.fail(
          invalidBound('--wait-timeout', options.waitTimeoutSeconds, name, phase),
        );
      }
      config = { ...config, waitTimeoutSeconds: options.waitTimeoutSeconds };
    }
    return config;
  });

/** Refuse a bound below 1 on a `gate run` flag. */
const invalidBound = (flag: string, value: number, name: string, phase: string): SurfaceError =>
  gateFailure({
    code: GATE_CODES.invalidConfig,
    path: flag,
    field: flag,
    problem: `${flag} '${value}' is not an integer >= 1.`,
    rerun: `mf-specs gate run --name ${name} --phase ${phase}`,
    expected: 'an integer >= 1',
    actual: String(value),
    fix: `Pass ${flag} with a positive integer, or omit it to use gate.json.`,
  });

/**
 * Execute mechanical stages through the verification scheduler and append one
 * result line per requester to the owner's `GATE-RESULTS.jsonl`. Only a session
 * holding the spec's orchestrator binding may call it. With no selector every
 * mechanical stage runs and stops at the first failure; `--all` continues;
 * `--stage` runs one.
 * @param options - owner, selection, timeout, scope/lane overrides, and caller session
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
    if (
      options.scope !== undefined &&
      (options.scope.trim() === '' || !isScopeList(options.scope))
    ) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.invalidScope,
          path: '--scope',
          field: '--scope',
          problem: `--scope '${options.scope}' is not a scope list.`,
          rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
          expected: 'comma-separated workspace-relative paths, optionally ending in /, or `repo`',
          actual: options.scope,
          fix: 'Name the paths the command reads, or `repo` for the whole workspace.',
        }),
      );
    }
    if (options.lane !== undefined && !isGateLane(options.lane)) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.invalidLane,
          path: '--lane',
          field: '--lane',
          problem: `--lane '${options.lane}' is not 'heavy' or 'light'.`,
          rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
          expected: 'heavy or light',
          actual: options.lane,
          fix: 'Pass `--lane heavy` for a suite/build/typecheck/lint or `--lane light` for a narrow check.',
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
    const absoluteResultsPath = `${options.root}/${options.name}/${resultsPath}`;
    yield* existingResults(fileAt(snapshot, resultsPath), owner, options.name);
    const stages = parseGates(gates);
    const selection = selectStages(stages, owner, options.name, options);
    if (selection.kind === 'refused') return yield* Effect.fail(selection.error);

    const taskText =
      options.task === undefined ? undefined : fileAt(snapshot, `${owner.prefix}/TASK.md`);
    const task = taskText === undefined ? undefined : parseTaskFile(taskText);
    const fallbackScope = ownerScope(task);
    const config = yield* gateConfigOf(options.workspace, options, options.name, options.phase);
    const timeoutSeconds = options.timeoutSeconds ?? DEFAULT_GATE_TIMEOUT;
    const explicitScope = options.scope === undefined ? undefined : normalizeScopes(options.scope);
    const explicitLane = options.lane === undefined ? undefined : options.lane;

    /**
     * Fingerprint a scope set against the tree as it stands *now*. Nothing is
     * cached: the pre-pass checks existence before any stage runs, and the loop
     * fingerprints again after the earlier stages wrote, so a cached pre-run
     * value would make a later stage's recorded key describe the wrong tree.
     */
    const fingerprintOf = (scopes: ReadonlyArray<string>, stage?: string) =>
      Effect.gen(function* () {
        const found = yield* fingerprintScopes(options.workspace, scopes);
        if (found.missing.length > 0) {
          const missing = found.missing[0] ?? '';
          return yield* Effect.fail(
            gateFailure({
              code: GATE_CODES.invalidScope,
              path: missing,
              field: 'scope',
              problem:
                stage === undefined
                  ? `Scope '${missing}' does not exist under ${options.workspace}.`
                  : `${owner.label} ${stage} declares scope '${missing}', which does not exist under ${options.workspace}.`,
              rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
              expected: 'a scope path that exists in the workspace',
              actual: found.missing.join(', '),
              fix: 'Fix the stage `scope:` line or `--scope`, or use `repo` for the whole workspace.',
            }),
          );
        }
        return found;
      });

    const outcomes: Array<GateStageOutcome> = [];
    let stopped = false;
    // Resolve and validate every selected stage's scope before any stage runs:
    // a usage error must not leave earlier stages executed and their records
    // appended. The loop keeps the same checks as a cheap assertion.
    const declaredScopes = yield* resolveStageScopes({
      owner,
      gatesPath,
      name: options.name,
      phase: options.phase,
      stages: selection.stages,
      fallbackScope,
      explicitScope,
      exists: (scopes, stage) => fingerprintOf(scopes, stage).pipe(Effect.asVoid),
    });
    for (const [index, stage] of selection.stages.entries()) {
      const command = stage.command ?? '';
      const declaredScope = declaredScopes[index];
      const scopes = explicitScope ?? declaredScope;
      if (scopes === undefined) {
        return yield* Effect.fail(
          gateFailure({
            code: GATE_CODES.scopeMissing,
            path: gatesPath,
            field: 'scope',
            problem: `${owner.label} stage ${stage.stage ?? '?'} has no resolvable scope.`,
            rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
            expected: 'a `scope:` line, a task `write-scope:`, or `--scope`',
            actual: 'no scope',
            fix: 'Declare `scope: <path[,path]>` on the stage, or give the task a `write-scope:` field.',
          }),
        );
      }
      const declaredLane = stageLane(stage);
      const lane: GateLane =
        explicitLane !== undefined
          ? explicitLane
          : declaredLane !== undefined
            ? declaredLane
            : laneOf(command);
      const badScope = scopes.find((token) => !isScopeToken(token));
      if (badScope !== undefined) {
        return yield* Effect.fail(
          gateFailure({
            code: GATE_CODES.invalidScope,
            path: badScope,
            field: 'scope',
            problem: `Scope '${badScope}' is outside the scope grammar.`,
            rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
            expected: 'a repo-root-relative path (optional trailing /), comma-separated, or `repo`',
            actual: badScope,
            fix: 'Remove the leading /, `..`, glob, or whitespace from the scope.',
          }),
        );
      }
      const print = yield* fingerprintOf(scopes);
      const key = gateKey(command, scopes, print.fingerprint);
      const session = options.session ?? '';
      const scheduled = yield* scheduleRun(
        {
          workspace: options.workspace,
          key,
          command,
          scope: scopes,
          fingerprint: print.fingerprint,
          lane,
          config,
          owner: { session, task: options.task, pid: process.pid },
          reuse: options.noReuse !== true,
          resultPath: absoluteResultsPath,
          pollMs: options.pollMs,
        },
        executeGateCommand(command, options.workspace, timeoutSeconds),
        (outcome: ScheduleOutcome) => {
          const record: MechanicalResult = {
            stage: stage.stage ?? 0,
            title: stage.title,
            kind: 'mechanical',
            command,
            scope: scopes,
            key,
            fingerprint: print.fingerprint,
            owner: session,
            exit: outcome.exit,
            verdict: outcome.exit === 0 ? 'pass' : 'fail',
            at: outcome.at,
            durationMs: outcome.durationMs,
            lane,
            waitedMs: outcome.waitedMs,
            reused: outcome.reused,
            output: outcome.output,
          };
          if (outcome.source !== undefined) record.source = outcome.source;
          return appendResult(absoluteResultsPath, JSON.stringify(record));
        },
      ).pipe(
        Effect.catchIf(
          (error): error is GateWaitTimeout => error instanceof GateWaitTimeout,
          (error) =>
            Effect.fail(
              gateFailure({
                code: GATE_CODES.waitTimeout,
                path: `runs/${key}`,
                field: '--wait-timeout',
                problem: `Waited ${error.waitedMs}ms for ${error.reason === 'key' ? 'key ' + key : error.reason === 'lane' ? 'a heavy lane slot' : 'an in-flight slot'} and gave up without running.`,
                rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
                expected: `a slot within ${config.waitTimeoutSeconds}s`,
                actual: `waited ${error.waitedMs}ms`,
                fix: 'Raise --wait-timeout, lower --lanes/--in-flight load, or let the running gate finish.',
              }),
            ),
        ),
        Effect.catchIf(
          (error): error is SchedulerLockError => error instanceof SchedulerLockError,
          () =>
            Effect.fail(
              gateFailure({
                code: GATE_CODES.schedulerLock,
                path: 'runs.lock',
                field: 'runs.lock',
                problem: 'Could not acquire the run-state lock within its retry window.',
                rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
                expected: 'an uncontended .agents/@montflow/.runtime/runs.lock',
                actual: 'lock held by another writer',
                fix: 'Retry once the other gate writer finishes; remove a stale runs.lock if no writer is alive.',
              }),
            ),
        ),
        Effect.catchIf(
          (error): error is SchedulerWriteError => error instanceof SchedulerWriteError,
          (error) =>
            Effect.fail(
              gateFailure({
                code: GATE_CODES.writeFailed,
                path: error.path,
                field: 'runs',
                problem: `Could not write the ${error.operation} run state at ${error.path}; single flight cannot be guaranteed.`,
                rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase}`,
                expected: 'a writable .agents/@montflow/.runtime/runs directory',
                actual: `unwritable ${error.path}`,
                fix: 'Fix the runtime directory permissions or free space, then retry; a result record may already be appended.',
              }),
            ),
        ),
      );
      const verdict: GateVerdict = scheduled.exit === 0 ? 'pass' : 'fail';
      const outcome: GateStageOutcome = {
        stage: stage.stage ?? 0,
        title: stage.title,
        kind: 'mechanical',
        command,
        exit: scheduled.exit,
        verdict,
        at: scheduled.at,
        output: scheduled.output,
        key,
        scope: scopes,
        lane,
        fingerprint: print.fingerprint,
        waitedMs: scheduled.waitedMs,
        reused: scheduled.reused,
        source: scheduled.source,
        reclaimed: scheduled.reclaimed,
        attempt: scheduled.attempt,
        inflight: scheduled.inflight,
        lanes: scheduled.lanes,
        waited: scheduled.waited,
        position: scheduled.position,
        owner: options.task ?? 'orchestrator',
      };
      outcomes.push(outcome);
      if (verdict === 'fail' && options.stage === undefined && options.all !== true) {
        stopped = index < selection.stages.length - 1;
        break;
      }
    }
    return { owner, resultsPath, stages: outcomes, stopped };
  });

/** Process exit code a gate run implies. */
export const gateExitCode = (report: GateRunReport): number =>
  report.stages.every((stage) => stage.verdict === 'pass') ? 0 : VALIDATION_EXIT_CODE;

/** Render one stage outcome line. */
export const renderStageOutcome = (outcome: GateStageOutcome): string => {
  const mark = outcome.verdict === 'pass' ? '\u2713' : '\u2717';
  const ran = outcome.reused ? `reused ${outcome.source ?? outcome.at}` : 'ran';
  return `${mark} stage ${outcome.stage} ${outcome.title} (${outcome.kind}) ${outcome.verdict} \u00b7 exit ${outcome.exit} \u00b7 ${ran} \u00b7 ${outcome.command}`;
};

/**
 * Render the scheduler detail for one stage: the wait line (when it waited), the
 * reclaim line (when it took over an expired lease), and the run key line that
 * names the scope, lane occupancy, wait, reuse source, and fingerprint.
 */
export const renderStageSchedule = (outcome: GateStageOutcome): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  if (outcome.waited) {
    lines.push(
      `waiting key ${outcome.key} \u00b7 lane ${outcome.lane} \u00b7 position ${outcome.position ?? 0} \u00b7 owner ${outcome.owner}`,
    );
  }
  if (outcome.reclaimed) lines.push(`reclaimed ${outcome.key} attempt ${outcome.attempt}`);
  lines.push(
    `key ${outcome.key} \u00b7 scope ${outcome.scope.join(',')} \u00b7 lane ${outcome.lane} ${outcome.inflight}/${outcome.lanes} \u00b7 waited ${outcome.waitedMs} \u00b7 ${outcome.reused ? `reused ${outcome.source ?? outcome.at}` : 'ran'} \u00b7 fingerprint ${outcome.fingerprint}`,
  );
  return lines;
};

/** Render a gate run report. */
export const renderGateRun = (report: GateRunReport): string => {
  const passed = report.stages.filter((stage) => stage.verdict === 'pass').length;
  const lines = report.stages.flatMap((stage) => [
    ...renderStageSchedule(stage),
    renderStageOutcome(stage),
  ]);
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
