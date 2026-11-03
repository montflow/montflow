import { Clock, Data, Duration, Effect, Fiber, FileSystem, Option, Result, Schema } from 'effect';

import { ClaimLockError, withRuntimeLock } from '../claim/index.js';
import { instant } from '../stamp/index.js';

import { sha256 } from './fingerprint.module.js';
import { type GateLane, normalizeCommand, normalizeScopeList } from './scope.module.js';
import {
  RUNS_LOCK_FILE,
  type RunAttempt,
  type RunOwner,
  type RunPhase,
  type RunState,
  SchedulerWriteError,
  lastAttempt,
  leaseExpired,
  listRunStates,
  pruneRunStates,
  readRecordAt,
  readRunState,
  runStatePath,
  writeRunState,
  writeRunStateChecked,
} from './scheduler.state.module.js';

export { type Fingerprint, fingerprintScopes } from './fingerprint.module.js';

export {
  GATE_LANES,
  type GateLane,
  REPO_SCOPE,
  isGateLane,
  isScopeToken,
  normalizeCommand,
  normalizeScopeList,
  normalizeScopes,
} from './scope.module.js';

/**
 * The verification scheduler: one run key at most once in flight, bounded heavy
 * lanes, an expiring lease, and run state that `check`, `status`, and `gate run`
 * read. It is a scheduler over the existing `GATE-RESULTS.jsonl` recorder, not a
 * second gate system.
 */

/** Prefix of every run key; changing the key grammar bumps it. */
export const GATE_KEY_PREFIX = 'gate-v1:';

/** Workspace-relative config file for the lane and lease bounds. */
export const GATE_CONFIG_FILE = '.agents/@montflow/gate.json';

/** Terminal run states the `status` panel renders at most. */
export const RUN_PANEL_TERMINAL_LIMIT = 20;

/** The global and heavy-lane bounds read from `gate.json`. */
export interface GateConfig {
  /** Heavy lane: how many run at once, and the global in-flight cap. */
  readonly heavy: { readonly lanes: number; readonly inFlight: number };
  /** Lease length in seconds after the last heartbeat. */
  readonly leaseSeconds: number;
  /** Heartbeat interval in seconds. */
  readonly heartbeatSeconds: number;
  /** How long a requester waits before `gate.wait-timeout`. */
  readonly waitTimeoutSeconds: number;
}

/** The shipped defaults: one heavy lane, two in flight, 60s lease. */
export const DEFAULT_GATE_CONFIG: GateConfig = {
  heavy: { lanes: 1, inFlight: 2 },
  leaseSeconds: 60,
  heartbeatSeconds: 10,
  waitTimeoutSeconds: 900,
};

/** Poll interval while waiting for a key, a lane, or an in-flight slot. */
export const SCHEDULER_POLL_MS = 50;

/** One parsed config plus every problem that makes it unusable. */
export interface GateConfigParse {
  readonly config: GateConfig;
  readonly problems: ReadonlyArray<string>;
}

/** A positive integer bound, or undefined when the value is not one. */
const positive = (value: number): number | undefined =>
  Number.isInteger(value) && value >= 1 ? value : undefined;

/** The `gate.json` document: every key optional, every bound a number. */
const GateConfigDocument = Schema.Struct({
  heavy: Schema.optionalKey(
    Schema.Struct({
      lanes: Schema.optionalKey(Schema.Number),
      inFlight: Schema.optionalKey(Schema.Number),
    }),
  ),
  leaseSeconds: Schema.optionalKey(Schema.Number),
  heartbeatSeconds: Schema.optionalKey(Schema.Number),
  waitTimeoutSeconds: Schema.optionalKey(Schema.Number),
});

/** Strict decode: an unknown key is a config problem, never silently dropped. */
const decodeGateConfig = Schema.decodeUnknownOption(GateConfigDocument, {
  onExcessProperty: 'error',
});

/**
 * Parse `gate.json`. Every key is optional, so a missing file means the defaults;
 * a malformed document, an unknown key, or a bound below 1 is a problem the
 * caller refuses rather than silently clamping.
 * @param text - raw file contents, or undefined when the file is absent
 * @returns the effective config and every problem found
 */
export const parseGateConfig = (text: string | undefined): GateConfigParse => {
  if (text === undefined || text.trim() === '')
    return { config: DEFAULT_GATE_CONFIG, problems: [] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { config: DEFAULT_GATE_CONFIG, problems: [`${GATE_CONFIG_FILE} is not valid JSON.`] };
  }
  const decoded = decodeGateConfig(value);
  if (Option.isNone(decoded)) {
    return {
      config: DEFAULT_GATE_CONFIG,
      problems: [
        `${GATE_CONFIG_FILE} must be an object holding only heavy.lanes, heavy.inFlight, leaseSeconds, heartbeatSeconds, waitTimeoutSeconds.`,
      ],
    };
  }
  const document = decoded.value;
  const problems: Array<string> = [];
  let lanes = DEFAULT_GATE_CONFIG.heavy.lanes;
  let inFlight = DEFAULT_GATE_CONFIG.heavy.inFlight;
  if (document.heavy?.lanes !== undefined) {
    const parsed = positive(document.heavy.lanes);
    if (parsed === undefined) {
      problems.push(`${GATE_CONFIG_FILE} heavy.lanes must be an integer >= 1.`);
    } else {
      lanes = parsed;
    }
  }
  if (document.heavy?.inFlight !== undefined) {
    const parsed = positive(document.heavy.inFlight);
    if (parsed === undefined) {
      problems.push(`${GATE_CONFIG_FILE} heavy.inFlight must be an integer >= 1.`);
    } else {
      inFlight = parsed;
    }
  }
  const seconds = (key: 'leaseSeconds' | 'heartbeatSeconds' | 'waitTimeoutSeconds'): number => {
    const raw = document[key];
    if (raw === undefined) return DEFAULT_GATE_CONFIG[key];
    const parsed = positive(raw);
    if (parsed === undefined) {
      problems.push(`${GATE_CONFIG_FILE} ${key} must be an integer >= 1.`);
      return DEFAULT_GATE_CONFIG[key];
    }
    return parsed;
  };
  const leaseSeconds = seconds('leaseSeconds');
  const heartbeatSeconds = seconds('heartbeatSeconds');
  const waitTimeoutSeconds = seconds('waitTimeoutSeconds');
  // A heartbeat that is not strictly faster than the lease lets a live owner's
  // lease expire before its first renewal, so a second requester would reclaim
  // and double-run the key. Refuse the config instead of silently clamping.
  if (heartbeatSeconds >= leaseSeconds) {
    problems.push(
      `${GATE_CONFIG_FILE} heartbeatSeconds (${heartbeatSeconds}) must be less than leaseSeconds (${leaseSeconds}).`,
    );
  }
  return {
    config: {
      heavy: { lanes, inFlight },
      leaseSeconds,
      heartbeatSeconds,
      waitTimeoutSeconds,
    },
    problems,
  };
};

/**
 * The run key: `gate-v1:` plus the SHA-256 of the canonical command, the sorted
 * scopes, and the current fingerprint. Task, phase, stage, and session ids never
 * enter it, so the same proof shared by two owners is one key.
 * @param command - the gate command verbatim
 * @param scopes - the scopes the command covers
 * @param fingerprint - digest over those scopes
 * @returns the run key
 */
export const gateKey = (
  command: string,
  scopes: ReadonlyArray<string>,
  fingerprint: string,
): string =>
  `${GATE_KEY_PREFIX}${sha256(
    `${normalizeCommand(command)}\n${normalizeScopeList(scopes).join(',')}\n${fingerprint}`,
  )}`;

/** Commands that exercise a suite, a build, a typecheck, lint, or formatting. */
const HEAVY_COMMAND =
  /(?:^|[\s;&|])(?:bun\s+(?:run\s+)?)?(?:test|tests|vitest|jest|mocha|pytest|turbo|tsc|typecheck|build|lint|fmt|format|oxlint|oxfmt|eslint|prettier|make|cargo|go\s+test|mf-specs\s+(?:check|gate))\b/;

/**
 * Classify a command into a lane. An explicit `lane:` wins; otherwise a suite,
 * typecheck, build, lint, format, or repo/package-wide check is heavy and every
 * single-file or narrow check is light.
 * @param command - the gate command verbatim
 * @param declared - the stage's explicit lane, when it names one
 * @returns the lane
 */
export const laneOf = (command: string, declared?: GateLane | undefined): GateLane =>
  declared ?? (HEAVY_COMMAND.test(normalizeCommand(command)) ? 'heavy' : 'light');

/** A requester waited past `waitTimeoutSeconds`. */
export class GateWaitTimeout extends Data.TaggedError('@montflow/GateWaitTimeout')<{
  readonly key: string;
  readonly lane: GateLane;
  readonly waitedMs: number;
  readonly reason: 'key' | 'lane' | 'in-flight';
}> {}

/** The run-state lock could not be acquired within the retry window. */
export class SchedulerLockError extends Data.TaggedError('@montflow/SchedulerLockError')<{
  readonly path: string;
}> {}

/** The result of one shell command, as the scheduler consumes it. */
export interface CommandResult {
  readonly exit: number;
  readonly output: string;
  /** True when the run hit its timeout rather than the command exiting. */
  readonly timedOut?: boolean | undefined;
}

/** One requester's outcome. */
export interface ScheduleOutcome {
  /** Terminal phase of the run. */
  readonly state: 'passed' | 'failed' | 'cancelled' | 'timeout';
  /** Exit status; 130 for a cancellation and 124 for a timeout. */
  readonly exit: number;
  /** Captured command output. */
  readonly output: string;
  /** When the result was produced (or the original instant when reused). */
  readonly at: string;
  /** Command duration in milliseconds. */
  readonly durationMs: number;
  /** How long this requester waited before it ran, reused, or consumed. */
  readonly waitedMs: number;
  /** True when this requester did not execute the command. */
  readonly reused: boolean;
  /** Instant of the original run when the result was reused. */
  readonly source?: string | undefined;
  /** 1-based attempt number. */
  readonly attempt: number;
  /** True when this requester reclaimed an expired lease. */
  readonly reclaimed: boolean;
  /** Heavy-lane bound in force. */
  readonly lanes: number;
  /** True when this requester waited at all. */
  readonly waited: boolean;
  /** Live runs beside this requester when it acquired or consumed. */
  readonly inflight: number;
  /** Position in the queue when this requester waited for a key. */
  readonly position?: number | undefined;
}

/** One scheduled request. */
export interface ScheduleRequest {
  readonly workspace: string;
  readonly key: string;
  readonly command: string;
  readonly scope: ReadonlyArray<string>;
  readonly fingerprint: string;
  readonly lane: GateLane;
  readonly config: GateConfig;
  readonly owner: RunOwner;
  /** False forces a run even when a matching pass exists. */
  readonly reuse: boolean;
  /** Workspace-relative path of the record that will hold the outcome. */
  readonly resultPath: string;
  /** Poll interval while waiting; the tests pass a smaller value. */
  readonly pollMs?: number | undefined;
  /** Wait cap; the tests pass a smaller value. */
  readonly waitTimeoutSeconds?: number | undefined;
}

/** Map a terminal phase to a pass/fail state. */
const terminal = (phase: RunPhase): ScheduleOutcome['state'] =>
  phase === 'passed'
    ? 'passed'
    : phase === 'timeout'
      ? 'timeout'
      : phase === 'cancelled'
        ? 'cancelled'
        : 'failed';

/** An attempt's lease fields for one owner. */
const leaseOf = (owner: RunOwner, now: number, config: GateConfig): RunAttempt => {
  const startedAt = instant(now);
  return {
    owner,
    startedAt,
    heartbeatAt: startedAt,
    leaseExpiresAt: instant(now + config.leaseSeconds * 1000),
  };
};

/** What one bounded, locked transition tells the requester to do next. */
type Step =
  | {
      readonly kind: 'run';
      readonly attempt: number;
      readonly inflight: number;
      readonly reclaimed: boolean;
    }
  | { readonly kind: 'reuse'; readonly state: RunState; readonly inflight: number }
  | {
      readonly kind: 'wait';
      readonly phase: 'key' | 'lane' | 'in-flight';
      readonly position?: number | undefined;
      /** Attempts the live owner had when this requester registered, key waits only. */
      readonly observedAttempt?: number | undefined;
    };

/**
 * Execute one key through the scheduler: reuse a matching pass, wait for an
 * in-flight owner, reclaim an expired lease, respect the lane and in-flight
 * bounds, then run the command exactly once and record the result.
 *
 * The `persist` callback appends this requester's `GATE-RESULTS.jsonl` record and
 * returns its index, so a waiter can read the original outcome from that record
 * instead of trusting a second execution.
 * @param request - key, scope, lane, owner, bounds, and record path
 * @param execute - the command to run when this requester owns the attempt
 * @param persist - append this requester's record; returns its index
 * @returns this requester's outcome
 */
export const scheduleRun = <E, R, E2 = E, R2 = R>(
  request: ScheduleRequest,
  execute: Effect.Effect<CommandResult, never, R>,
  persist: (outcome: ScheduleOutcome) => Effect.Effect<number, E2, R2>,
): Effect.Effect<
  ScheduleOutcome,
  E2 | GateWaitTimeout | SchedulerLockError | SchedulerWriteError,
  FileSystem.FileSystem | R | R2
> =>
  Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const pollMs = request.pollMs ?? SCHEDULER_POLL_MS;
    const waitTimeoutMs = (request.waitTimeoutSeconds ?? request.config.waitTimeoutSeconds) * 1000;
    let waited = false;
    let position: number | undefined;
    let lastPhase: 'key' | 'lane' | 'in-flight' = 'key';
    /** Attempts the live key owner had when this requester registered as a waiter. */
    let observedAttempt: number | undefined;

    const step = (): Effect.Effect<
      Step,
      SchedulerLockError | SchedulerWriteError,
      FileSystem.FileSystem
    > =>
      withRuntimeLock(
        request.workspace,
        RUNS_LOCK_FILE,
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const state = yield* readRunState(request.workspace, request.key);
          // 1. A matching pass is reused while its key (hence fingerprint) holds.
          if (
            state !== undefined &&
            request.reuse &&
            state.state === 'passed' &&
            state.fingerprint === request.fingerprint
          ) {
            const live = yield* listRunStates(request.workspace);
            return {
              kind: 'reuse',
              state,
              inflight: live.filter((run) => run.state === 'running' && !leaseExpired(run, now))
                .length,
            } satisfies Step;
          }
          // 2. A live owner keeps the key: register as a waiter and consume later.
          if (state !== undefined && state.state === 'running' && !leaseExpired(state, now)) {
            const waiters = state.waiters.includes(request.owner.session)
              ? state.waiters
              : [...state.waiters, request.owner.session];
            if (waiters !== state.waiters) {
              yield* writeRunState(request.workspace, { ...state, waiters });
            }
            return {
              kind: 'wait',
              phase: 'key',
              position: waiters.indexOf(request.owner.session) + 1,
              observedAttempt: state.attempts.length,
            } satisfies Step;
          }
          // 3. Reclaim: mark the dead attempt expired, append no result, and start
          //    attempt n+1 under the same key.
          const reclaimed =
            state !== undefined && state.state === 'running' && leaseExpired(state, now);
          if (reclaimed) {
            yield* writeRunState(request.workspace, {
              ...state,
              state: 'expired',
              waiters: [],
              attempts: state.attempts.map((entry, index) =>
                index === state.attempts.length - 1
                  ? { ...entry, finishedAt: entry.finishedAt ?? instant(now) }
                  : entry,
              ),
            });
          }
          // 4. Global in-flight cap, then the bounded heavy lane.
          const running = (yield* listRunStates(request.workspace)).filter(
            (candidate) => candidate.state === 'running' && !leaseExpired(candidate, now),
          );
          const inflight = running.length;
          const heavy = running.filter((candidate) => candidate.lane === 'heavy').length;
          if (inflight >= request.config.heavy.inFlight) {
            return { kind: 'wait', phase: 'in-flight' } satisfies Step;
          }
          if (request.lane === 'heavy' && heavy >= request.config.heavy.lanes) {
            return { kind: 'wait', phase: 'lane' } satisfies Step;
          }
          const attempt: RunAttempt = leaseOf(request.owner, now, request.config);
          // The claim is the single-flight guarantee: if it does not land this
          // requester must not run, or a second requester could claim the same key.
          yield* writeRunStateChecked(
            request.workspace,
            {
              version: 1,
              key: request.key,
              command: request.command,
              scope: request.scope,
              fingerprint: request.fingerprint,
              state: 'running',
              lane: request.lane,
              attempts: [...(state?.attempts ?? []), attempt],
              waiters: [],
              resultPath: request.resultPath,
            },
            'claim',
          );
          return {
            kind: 'run',
            attempt: (state?.attempts.length ?? 0) + 1,
            inflight: inflight + 1,
            reclaimed,
          } satisfies Step;
        }),
      ).pipe(
        Effect.catchTag('@montflow/ClaimLockError', (error) =>
          Effect.fail(new SchedulerLockError({ path: error.path })),
        ),
      );

    /** Build this requester's outcome with the shared wait bookkeeping. */
    const outcomeOf = (
      now: number,
      interim: Omit<ScheduleOutcome, 'waitedMs' | 'waited' | 'reclaimed' | 'lanes' | 'position'> & {
        readonly reclaimed?: boolean | undefined;
      },
    ): ScheduleOutcome => ({
      ...interim,
      waitedMs: Math.max(0, now - started),
      waited,
      reclaimed: interim.reclaimed ?? false,
      lanes: request.config.heavy.lanes,
      position,
    });

    /**
     * Finish one owned attempt in a single critical section: verify ownership,
     * append the authoritative record, then write one terminal state carrying
     * both the verdict and the record's index. The record lands before the
     * terminal state, so no reader can observe a terminal `passed` state without
     * the pointer to its proof. Both writes hold {@link RUNS_LOCK_FILE}, so no
     * claim can land between the ownership check and the append: a finisher
     * whose attempt was reclaimed appends no record and moves no pointer, and a
     * waiter always consumes the attempt it registered against. The lock covers
     * one record line, never the command.
     *
     * A failed append writes a truthful `failed` state with no pointer — never a
     * pass `check` cannot prove — and then fails the request with the append's
     * error. An attempt that is no longer last returns its local outcome for the
     * caller's report and writes neither state nor record.
     */
    const finish = (
      phase: RunState['state'],
      result: CommandResult,
      attempt: number,
      at: string,
      durationMs: number,
      reclaimed: boolean,
      inflight: number,
    ): Effect.Effect<
      ScheduleOutcome,
      E2 | SchedulerWriteError | SchedulerLockError,
      FileSystem.FileSystem | R2
    > =>
      Effect.gen(function* () {
        const outcome = outcomeOf(yield* Clock.currentTimeMillis, {
          state: terminal(phase),
          exit: result.exit,
          output: result.output,
          at,
          durationMs,
          reused: false,
          attempt,
          reclaimed,
          inflight,
        });
        const terminalState = (
          state: RunState,
          written: RunPhase,
          resultIndex?: number,
        ): RunState => {
          const next: RunState = {
            ...state,
            state: written,
            waiters: state.waiters.filter((session) => session !== request.owner.session),
            resultPath: request.resultPath,
            attempts: state.attempts.map((entry, seat) =>
              seat === state.attempts.length - 1
                ? { ...entry, finishedAt: at, exit: result.exit, durationMs }
                : entry,
            ),
          };
          return resultIndex === undefined ? next : { ...next, resultIndex };
        };
        yield* withRuntimeLock(
          request.workspace,
          RUNS_LOCK_FILE,
          Effect.gen(function* () {
            const state = yield* readRunState(request.workspace, request.key);
            if (state === undefined) {
              return yield* Effect.fail(
                new SchedulerWriteError({
                  path: runStatePath(request.workspace, request.key),
                  operation: 'terminal',
                }),
              );
            }
            // Attempts only ever append, so `length === attempt` means this
            // finisher still owns the last one. A lease reclaimed while its
            // owner was paused appends a newer attempt; that newer attempt must
            // keep its owner, its lease, its phase, and its authoritative
            // record, so a resumed owner writes neither state nor record.
            const last = lastAttempt(state);
            if (
              state.attempts.length !== attempt ||
              last?.owner.session !== request.owner.session
            ) {
              return false;
            }
            const appended = yield* Effect.result(persist(outcome));
            if (Result.isFailure(appended)) {
              // No record exists, so the state must not claim a pass: write the
              // truthful failed terminal state, then report the append failure.
              yield* writeRunStateChecked(
                request.workspace,
                terminalState(state, 'failed'),
                'terminal',
              );
              return yield* Effect.fail(appended.failure);
            }
            yield* writeRunStateChecked(
              request.workspace,
              terminalState(state, phase, appended.success),
              'terminal',
            );
            return true;
          }),
        ).pipe(
          Effect.catchIf(
            (error): error is ClaimLockError => error instanceof ClaimLockError,
            (error) => Effect.fail(new SchedulerLockError({ path: error.path })),
          ),
        );
        yield* pruneRunStates(request.workspace, yield* Clock.currentTimeMillis);
        return outcome;
      });

    /** Consume the owner's recorded outcome (a pass is reused; a failure is not). */
    const consume = (
      state: RunState,
      inflight: number,
    ): Effect.Effect<ScheduleOutcome, E2, FileSystem.FileSystem | R2> =>
      Effect.gen(function* () {
        // A terminal state left by an older scheduler, or the truthful `failed`
        // state left by a failed append, carries no `resultIndex`. Fall back to
        // the attempt's own exit fields so a waiter still gets the outcome
        // instead of hanging.
        const record =
          state.resultIndex === undefined
            ? undefined
            : yield* readRecordAt(
                request.workspace,
                state.resultPath ?? request.resultPath,
                state.resultIndex,
              );
        const attempt = lastAttempt(state);
        const source = record?.at ?? attempt?.finishedAt;
        const outcome = outcomeOf(yield* Clock.currentTimeMillis, {
          state: terminal(state.state),
          exit: record?.exit ?? attempt?.exit ?? 1,
          output: record?.output ?? '',
          at: instant(yield* Clock.currentTimeMillis),
          durationMs: record?.durationMs ?? attempt?.durationMs ?? 0,
          reused: true,
          source,
          attempt: state.attempts.length,
          inflight,
        });
        yield* persist(outcome);
        yield* dropWaiter(request);
        return outcome;
      });

    while (true) {
      const next = yield* step();
      if (next.kind === 'run') {
        const begin = yield* Clock.currentTimeMillis;
        const heartbeat = yield* heartbeatLoop(request, next.attempt).pipe(Effect.forkChild);
        const result = yield* execute.pipe(
          Effect.ensuring(Fiber.interrupt(heartbeat)),
          Effect.onInterrupt(() =>
            Effect.gen(function* () {
              const cancelledAt = yield* Clock.currentTimeMillis;
              return yield* finish(
                'cancelled',
                { exit: 130, output: 'Interrupted.' },
                next.attempt,
                instant(cancelledAt),
                Math.max(0, cancelledAt - begin),
                next.reclaimed,
                Math.max(0, next.inflight - 1),
              );
            }).pipe(
              Effect.catch(() => Effect.succeed(undefined)),
              Effect.uninterruptible,
            ),
          ),
        );
        const finishedAt = yield* Clock.currentTimeMillis;
        return yield* finish(
          result.timedOut === true ? 'timeout' : result.exit === 0 ? 'passed' : 'failed',
          result,
          next.attempt,
          instant(finishedAt),
          Math.max(0, finishedAt - begin),
          next.reclaimed,
          Math.max(0, next.inflight - 1),
        );
      }
      if (next.kind === 'reuse') {
        return yield* consume(next.state, next.inflight);
      }
      waited = true;
      lastPhase = next.phase;
      observedAttempt = next.observedAttempt;
      if (next.position !== undefined) position = next.position;
      const now = yield* Clock.currentTimeMillis;
      if (now - started >= waitTimeoutMs) {
        return yield* Effect.fail(
          new GateWaitTimeout({
            key: request.key,
            lane: request.lane,
            waitedMs: Math.max(0, now - started),
            reason: lastPhase,
          }),
        );
      }
      yield* Effect.sleep(Duration.millis(pollMs));
      // Only a requester that registered against the live attempt may consume
      // its outcome. A lane/in-flight wait re-enters `step()`, so a terminal
      // state left by an earlier attempt (or a --no-reuse request) is never
      // mistaken for this requester's run.
      if (lastPhase !== 'key') continue;
      const current = yield* readRunState(request.workspace, request.key);
      if (
        current !== undefined &&
        current.state !== 'running' &&
        current.state !== 'waiting' &&
        current.waiters.includes(request.owner.session) &&
        (observedAttempt === undefined || current.attempts.length >= observedAttempt)
      ) {
        return yield* consume(current, 0);
      }
    }
  });

/** Remove one session from a run's waiter list. */
const dropWaiter = (request: ScheduleRequest): Effect.Effect<void, never, FileSystem.FileSystem> =>
  withRuntimeLock(
    request.workspace,
    RUNS_LOCK_FILE,
    Effect.gen(function* () {
      const state = yield* readRunState(request.workspace, request.key);
      if (state === undefined) return;
      if (!state.waiters.includes(request.owner.session)) return;
      yield* writeRunState(request.workspace, {
        ...state,
        waiters: state.waiters.filter((session) => session !== request.owner.session),
      });
    }),
  ).pipe(Effect.orElseSucceed(() => undefined));

/** Keep one running attempt's lease fresh until it finishes. */
const heartbeatLoop = (
  request: ScheduleRequest,
  attempt: number,
): Effect.Effect<never, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    while (true) {
      yield* Effect.sleep(Duration.seconds(request.config.heartbeatSeconds));
      yield* withRuntimeLock(
        request.workspace,
        RUNS_LOCK_FILE,
        Effect.gen(function* () {
          const state = yield* readRunState(request.workspace, request.key);
          if (
            state === undefined ||
            state.state !== 'running' ||
            state.attempts.length !== attempt
          ) {
            return;
          }
          const now = yield* Clock.currentTimeMillis;
          const heartbeatAt = instant(now);
          yield* writeRunState(request.workspace, {
            ...state,
            attempts: state.attempts.map((entry, index) =>
              index === attempt - 1
                ? {
                    ...entry,
                    heartbeatAt,
                    leaseExpiresAt: instant(now + request.config.leaseSeconds * 1000),
                  }
                : entry,
            ),
          });
        }),
      ).pipe(Effect.orElseSucceed(() => undefined));
    }
  });
