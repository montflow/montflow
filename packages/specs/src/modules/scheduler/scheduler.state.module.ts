import { Clock, Data, Effect, FileSystem, Option, Schema } from 'effect';

import { sha256 } from './fingerprint.module.js';
import { GATE_LANES, type GateLane } from './scope.module.js';

/**
 * The persisted run state and the result records it points at: the run-state
 * document, its exclusive-writer lock, the terminal-state window, and the one
 * record a waiter reads back. Nothing here decides when a run claims, waits,
 * or finishes; that policy stays in `scheduler.module.ts`.
 */

/** Run-state directory under the workspace runtime tree. */
export const RUNS_DIR = '.agents/@montflow/.runtime/runs';

/** Exclusive lock guarding every run-state transition. */
export const RUNS_LOCK_FILE = 'runs.lock';

/** A terminal run state older than this is pruned on the next write. */
export const RUN_STATE_TTL_MS = 24 * 60 * 60 * 1000;

/** Newest terminal run states kept regardless of the TTL. */
export const RUN_STATE_KEEP = 50;

/** Run-state phases, including the terminal ones. */
export const RUN_PHASES = [
  'waiting',
  'running',
  'passed',
  'failed',
  'cancelled',
  'timeout',
  'expired',
] as const;

/** Run-state phase. */
export type RunPhase = (typeof RUN_PHASES)[number];

/** Who owns one attempt. */
export interface RunOwner {
  /** Calling session id. */
  readonly session: string;
  /** Task id, or the orchestrator sentinel. */
  readonly task?: string | undefined;
  /** Process id, so a dead owner's lease is reclaimable. */
  readonly pid: number;
}

/** One attempt at one key. */
export interface RunAttempt {
  readonly owner: RunOwner;
  readonly startedAt: string;
  readonly heartbeatAt: string;
  readonly leaseExpiresAt: string;
  readonly finishedAt?: string | undefined;
  readonly exit?: number | undefined;
  readonly durationMs?: number | undefined;
}

/** One run state, stored as `.agents/@montflow/.runtime/runs/<hash>.json`. */
export interface RunState {
  readonly version: 1;
  readonly key: string;
  readonly command: string;
  readonly scope: ReadonlyArray<string>;
  readonly fingerprint: string;
  readonly state: RunPhase;
  readonly lane: GateLane;
  readonly attempts: ReadonlyArray<RunAttempt>;
  readonly waiters: ReadonlyArray<string>;
  readonly resultPath?: string | undefined;
  readonly resultIndex?: number | undefined;
}

/** Instant check for a run-state timestamp. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const OwnerSchema = Schema.Struct({
  session: Schema.NonEmptyString,
  task: Schema.optionalKey(Schema.NonEmptyString),
  pid: Schema.Int,
});

const AttemptSchema = Schema.Struct({
  owner: OwnerSchema,
  startedAt: Schema.String.check(Schema.isPattern(INSTANT)),
  heartbeatAt: Schema.String.check(Schema.isPattern(INSTANT)),
  leaseExpiresAt: Schema.String.check(Schema.isPattern(INSTANT)),
  finishedAt: Schema.optionalKey(Schema.String.check(Schema.isPattern(INSTANT))),
  exit: Schema.optionalKey(Schema.Int),
  durationMs: Schema.optionalKey(Schema.Int),
});

const RunStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  key: Schema.NonEmptyString,
  command: Schema.String,
  scope: Schema.Array(Schema.String),
  fingerprint: Schema.String,
  state: Schema.Literals(RUN_PHASES),
  lane: Schema.Literals(GATE_LANES),
  attempts: Schema.Array(AttemptSchema),
  waiters: Schema.Array(Schema.String),
  resultPath: Schema.optionalKey(Schema.String),
  resultIndex: Schema.optionalKey(Schema.Int),
});

const decodeRunState = Schema.decodeUnknownOption(RunStateSchema, {
  onExcessProperty: 'error',
});

/** Parse one run state; undefined when the document is malformed. */
export const parseRunState = (text: string): RunState | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const decoded = decodeRunState(value);
  return Option.isNone(decoded) ? undefined : decoded.value;
};

/** Absolute path of a run state. */
export const runStatePath = (workspace: string, key: string): string =>
  `${workspace.replace(/\/+$/, '')}/${RUNS_DIR}/${sha256(key)}.json`;

/** Read one run state; a missing or malformed file is undefined. */
export const readRunState = (
  workspace: string,
  key: string,
): Effect.Effect<RunState | undefined, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(runStatePath(workspace, key)).pipe(Effect.option);
    return Option.isNone(text) ? undefined : parseRunState(text.value);
  });

/** A run-state write did not land, so single flight cannot be guaranteed. */
export class SchedulerWriteError extends Data.TaggedError('@montflow/SchedulerWriteError')<{
  readonly path: string;
  readonly operation: 'claim' | 'terminal';
}> {}

/** Write one run state atomically and surface every I/O failure. */
export const writeRunStateChecked = (
  workspace: string,
  state: RunState,
  operation: 'claim' | 'terminal' = 'claim',
): Effect.Effect<void, SchedulerWriteError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const target = runStatePath(workspace, state.key);
    const parent = target.slice(0, target.lastIndexOf('/'));
    yield* fs.makeDirectory(parent, { recursive: true });
    const temp = `${target}.tmp-${process.pid}-${yield* Clock.currentTimeMillis}`;
    const body = `${JSON.stringify(state, null, 2)}\n`;
    yield* fs.writeFileString(temp, body);
    yield* fs.rename(temp, target).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          yield* fs.remove(temp).pipe(Effect.orElseSucceed(() => undefined));
          yield* fs.writeFileString(target, body);
        }),
      ),
    );
  }).pipe(
    Effect.mapError(
      () => new SchedulerWriteError({ path: runStatePath(workspace, state.key), operation }),
    ),
  );

/**
 * Write one run state atomically, best-effort. Used for advisory updates
 * (waiter registration, heartbeat renewal) where a lost write only delays a
 * poll; the claim and terminal writes use {@link writeRunStateChecked}.
 */
export const writeRunState = (
  workspace: string,
  state: RunState,
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  writeRunStateChecked(workspace, state).pipe(Effect.orElseSucceed(() => undefined));

/** Every run state under the workspace runtime tree, sorted by key. */
export const listRunStates = (
  workspace: string,
): Effect.Effect<ReadonlyArray<RunState>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = `${workspace.replace(/\/+$/, '')}/${RUNS_DIR}`;
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
    const states: Array<RunState> = [];
    for (const name of names.toSorted((left, right) => left.localeCompare(right))) {
      if (!name.endsWith('.json')) continue;
      const text = yield* fs.readFileString(`${dir}/${name}`).pipe(Effect.option);
      if (Option.isNone(text)) continue;
      const state = parseRunState(text.value);
      if (state !== undefined) states.push(state);
    }
    return states;
  });

/** The last attempt of a run state. */
export const lastAttempt = (state: RunState): RunAttempt | undefined =>
  state.attempts[state.attempts.length - 1];

/** The instant a run state last did anything, for pruning and ordering. */
export const lastTouchedAt = (state: RunState): number => {
  const attempt = lastAttempt(state);
  const at = attempt?.finishedAt ?? attempt?.startedAt;
  const parsed = at === undefined ? Number.NaN : Date.parse(at);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** True when a run state is terminal (no owner can still advance it). */
export const isTerminal = (state: RunState): boolean =>
  state.state !== 'running' && state.state !== 'waiting';

/**
 * Bound the run-state directory: drop terminal states older than
 * {@link RUN_STATE_TTL_MS} while always keeping the newest
 * {@link RUN_STATE_KEEP}. Live states are never touched. A failed removal is
 * ignored; the next write retries.
 * @param workspace - workspace root
 * @param now - current epoch milliseconds
 */
export const pruneRunStates = (
  workspace: string,
  now: number,
  keep: number = RUN_STATE_KEEP,
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const terminal = (yield* listRunStates(workspace))
      .filter(isTerminal)
      .toSorted((left, right) => lastTouchedAt(right) - lastTouchedAt(left));
    for (const [index, state] of terminal.entries()) {
      if (index < keep) continue;
      const touched = lastTouchedAt(state);
      if (touched === 0 || now - touched < RUN_STATE_TTL_MS) continue;
      yield* fs
        .remove(runStatePath(workspace, state.key))
        .pipe(Effect.orElseSucceed(() => undefined));
    }
  });

/** True when a process id is still alive. */
export const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    // SAFETY: Node's `process.kill(pid, 0)` throws a system error carrying the
    // errno string in `code`; EPERM means the process exists but is not ours.
    return (cause as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** Milliseconds since an ISO instant, or Infinity when unparsable. */
const ageMs = (at: string, now: number): number => {
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : now - parsed;
};

/**
 * True when the last attempt no longer holds its lease: the lease expired, the
 * owner process is gone, or the attempt never started.
 * @param state - run state to inspect
 * @param now - current epoch milliseconds
 * @returns whether the next requester may reclaim the key
 */
export const leaseExpired = (state: RunState, now: number): boolean => {
  const attempt = lastAttempt(state);
  if (attempt === undefined) return true;
  if (ageMs(attempt.leaseExpiresAt, now) > 0) return true;
  return !isPidAlive(attempt.owner.pid);
};

/** The stored record a waiter consumes. */
const StoredRecordSchema = Schema.Struct({
  at: Schema.String,
  exit: Schema.Int,
  output: Schema.String,
  durationMs: Schema.optionalKey(Schema.Int),
});

const decodeStoredRecord = Schema.decodeUnknownOption(StoredRecordSchema);

/** One decoded result record a waiter reads. */
type StoredRecord = typeof StoredRecordSchema.Type;

/** Read one record by index from a results file. */
export const readRecordAt = (
  workspace: string,
  resultPath: string,
  index: number,
): Effect.Effect<StoredRecord | undefined, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = resultPath.startsWith('/')
      ? resultPath
      : `${workspace.replace(/\/+$/, '')}/${resultPath}`;
    const text = yield* fs.readFileString(path).pipe(Effect.option);
    if (Option.isNone(text)) return undefined;
    const lines = text.value.split('\n').filter((line) => line.trim() !== '');
    const line = lines[index];
    if (line === undefined) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return undefined;
    }
    const decoded = decodeStoredRecord(value);
    return Option.isNone(decoded) ? undefined : decoded.value;
  });
