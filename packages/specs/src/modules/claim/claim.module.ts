import { Clock, Data, Duration, Effect, FileSystem, Option, Schema } from 'effect';

/** Runtime directory under the workspace `.agents/` tree. */
export const RUNTIME_DIR = '.agents/@montflow/.runtime';

/** One workspace claim registry, shared by every spec. */
export const CLAIMS_FILE = 'claims.json';

/** Exclusive-create lock guarding one registry read-modify-write. */
export const CLAIMS_LOCK_FILE = 'claims.lock';

/** How long a claim retries the registry lock before failing. */
export const CLAIMS_LOCK_TIMEOUT_MS = 5000;

/** Retry interval while the registry lock is held by another writer. */
export const CLAIMS_LOCK_RETRY_MS = 25;

/** The task sentinel a session uses for the spec's orchestrator binding. */
export const ORCHESTRATOR = 'orchestrator';

/** One runtime session binding. Never written into a spec file. */
export interface Claim {
  /** Spec directory name the binding belongs to. */
  readonly spec: string;
  /** A task id, or {@link ORCHESTRATOR}. */
  readonly task: string;
  /** Calling session id. */
  readonly session: string;
  /** ISO instant the binding was recorded. */
  readonly at: string;
}

/** One claim entry, as the registry stores it. */
const ClaimSchema = Schema.Struct({
  spec: Schema.NonEmptyString,
  task: Schema.NonEmptyString,
  session: Schema.NonEmptyString,
  at: Schema.NonEmptyString,
});

/** Canonical registry document. */
const ClaimsDocument = Schema.Struct({
  schema: Schema.optionalKey(Schema.Number),
  claims: Schema.Array(ClaimSchema),
});

/** Strict decoder: an unknown key or malformed entry yields no authority. */
const decodeClaims = Schema.decodeUnknownOption(ClaimsDocument, {
  onExcessProperty: 'error',
});

/** Absolute path of the workspace claim registry. */
export const claimsPath = (workspace: string): string =>
  `${workspace.replace(/\/+$/, '')}/${RUNTIME_DIR}/${CLAIMS_FILE}`;

/** Absolute path of the registry lock. */
export const claimsLockPath = (workspace: string): string =>
  `${workspace.replace(/\/+$/, '')}/${RUNTIME_DIR}/${CLAIMS_LOCK_FILE}`;

/** The registry lock could not be acquired within the retry window. */
export class ClaimLockError extends Data.TaggedError('@montflow/ClaimLockError')<{
  readonly path: string;
  readonly cause?: unknown;
}> {}

/**
 * Run one read-modify-write under an exclusive-create lock. The lock is created
 * with `wx` (fails when present), retried for {@link CLAIMS_LOCK_TIMEOUT_MS}, and
 * always removed afterwards, so a failed writer never leaves a stale lock
 * behind. The claim registry and the gate run-state directory share this one
 * primitive with different lock files.
 * @param workspace - workspace root that owns `.agents/`
 * @param file - lock file name under `.agents/@montflow/.runtime`
 * @param body - the operation to run while the lock is held
 * @returns the body's result, or {@link ClaimLockError} on timeout
 */
export const withRuntimeLock = <A, E, R>(
  workspace: string,
  file: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | ClaimLockError, R | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const lock = `${workspace.replace(/\/+$/, '')}/${RUNTIME_DIR}/${file}`;
    const lockDir = lock.slice(0, lock.lastIndexOf('/'));
    yield* fs
      .makeDirectory(lockDir, { recursive: true })
      .pipe(Effect.orElseSucceed(() => undefined));
    const deadline = (yield* Clock.currentTimeMillis) + CLAIMS_LOCK_TIMEOUT_MS;
    let acquired = false;
    while (!acquired) {
      const outcome = yield* fs.writeFileString(lock, '', { flag: 'wx' }).pipe(Effect.result);
      if ('success' in outcome) {
        acquired = true;
        break;
      }
      const now = yield* Clock.currentTimeMillis;
      if (now >= deadline) {
        return yield* Effect.fail(new ClaimLockError({ path: lock, cause: outcome.failure }));
      }
      yield* Effect.sleep(Duration.millis(CLAIMS_LOCK_RETRY_MS));
    }
    return yield* body.pipe(
      Effect.ensuring(fs.remove(lock).pipe(Effect.orElseSucceed(() => undefined))),
    );
  });

/**
 * Run one registry read-modify-write under the claims lock.
 * @param workspace - workspace root that owns `.agents/`
 * @param body - the registry operation to run while the lock is held
 * @returns the body's result, or {@link ClaimLockError} on timeout
 */
export const withClaimsLock = <A, E, R>(
  workspace: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | ClaimLockError, R | FileSystem.FileSystem> =>
  withRuntimeLock(workspace, CLAIMS_LOCK_FILE, body);

/**
 * Parse a claim registry. The canonical document is
 * `{"schema":1,"claims":[...]}`; a bare array is accepted so a hand-written or
 * older runtime file still reads. A malformed document yields no binding rather
 * than an error, because an unreadable registry means no caller holds authority.
 * @param text - raw registry contents
 * @returns every claim, in file order
 */
export const parseClaims = (text: string): ReadonlyArray<Claim> => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  const candidate = Array.isArray(value) ? { schema: 1, claims: value } : value;
  const decoded = decodeClaims(candidate);
  return Option.isNone(decoded) ? [] : decoded.value.claims;
};

/** Read the workspace claim registry; a missing or unreadable file is no claims. */
export const readClaims = (
  workspace: string,
): Effect.Effect<ReadonlyArray<Claim>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(claimsPath(workspace))
      .pipe(Effect.orElseSucceed(() => undefined));
    return text === undefined ? [] : parseClaims(text);
  });

/**
 * True when `session` holds the spec's orchestrator binding. A worker's task
 * binding never passes, which is the authority rule the restricted verbs share.
 * @param claims - every claim in the workspace registry
 * @param spec - spec directory name
 * @param session - caller session, or undefined when the caller supplied none
 * @returns whether the caller may run a restricted verb
 */
export const holdsOrchestrator = (
  claims: ReadonlyArray<Claim>,
  spec: string,
  session: string | undefined,
): boolean =>
  session !== undefined &&
  session !== '' &&
  claims.some(
    (claim) => claim.spec === spec && claim.task === ORCHESTRATOR && claim.session === session,
  );

/** Render a claim registry document, so every writer emits the same shape. */
export const renderClaims = (claims: ReadonlyArray<Claim>): string =>
  `${JSON.stringify({ schema: 1, claims }, null, 2)}\n`;
