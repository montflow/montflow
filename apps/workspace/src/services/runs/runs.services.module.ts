// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: runs store lives under .agents/@montflow/pi-runs; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for run files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: spawns the headless pi child for agent execution; migrate to Command when the app moves onto the platform layer graph.
import { spawn } from 'node:child_process';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Clock, Data, Effect, Layer } from 'effect';
import type { Run, Store } from '@montflow/pi-runs';

/**
 * Lazy handle to the runs extension runtime. Static imports from
 * `@montflow/pi-runs` are type-only (erased at build) — the runtime
 * resolves here, on first use, never at dashboard boot. A broken or
 * missing extension therefore cannot crash the TUI; the failing flow
 * surfaces the load error as a toast instead.
 */
type PiRunsLib = typeof import('@montflow/pi-runs');

/** Failure loading the runs extension runtime. `cause` classifies the import rejection. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/RunsExtensionLoadError')<{
  readonly message: string;
  readonly cause: 'network' | 'missing' | 'unknown';
}> {}

/** Substrings marking a failed module fetch (offline registry, dropped connection). */
const NETWORK_SIGNALS = [
  'failed to fetch',
  'fetch failed',
  'network',
  'econnreset',
  'etimedout',
  'enotfound',
];

/** Substrings marking a runtime that is not on disk (never installed, pruned). */
const MISSING_SIGNALS = [
  'cannot find',
  'err_module_not_found',
  'failed to resolve',
  'no such file',
  'enoent',
];

/** One-line copy per load-failure cause, toasted by the caller. */
export const loadErrorMessage = (cause: ExtensionLoadError['cause']): string => {
  switch (cause) {
    case 'network':
      return 'Runs extension download failed (network) — check the connection, then retry.';
    case 'missing':
      return 'Runs extension not found — reinstall the workspace dependencies, then retry.';
    default:
      return 'Runs extension failed to load — reinstall the workspace dependencies, then retry.';
  }
};

/**
 * Classify an import rejection into a typed load error. Dynamic imports
 * reject with plain Errors (or strings) — the message decides whether
 * the user should retry the network, reinstall, or just retry.
 * @param cause - import rejection payload
 * @returns typed load error
 */
export const classifyLoadError = (cause: unknown): ExtensionLoadError => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const lowered = message.toLowerCase();
  const kind: ExtensionLoadError['cause'] = NETWORK_SIGNALS.some((signal) =>
    lowered.includes(signal),
  )
    ? 'network'
    : MISSING_SIGNALS.some((signal) => lowered.includes(signal))
      ? 'missing'
      : 'unknown';
  return new ExtensionLoadError({ message: loadErrorMessage(kind), cause: kind });
};

/** Cached extension module promise. Cleared on failure so retrying reloads it. */
let cachedLib: Promise<PiRunsLib> | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<PiRunsLib> => {
  cachedLib ??= import('@montflow/pi-runs').then(
    (libs) => libs,
    (cause: unknown) => {
      cachedLib = undefined;
      throw cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause);
    },
  );
  return cachedLib;
};

/** Test hook: drop the cached runtime so the next load re-imports. */
export const resetExtensionCache = (): void => {
  cachedLib = undefined;
};

/**
 * Load the runs extension runtime as an Effect, caching the module
 * across flows.
 * @returns Effect resolving to the extension module namespace
 */
export const loadPiRuns = (): Effect.Effect<PiRunsLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => importOnce(),
    catch: (cause) => (cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause)),
  });

/** Node platform layers for the file-backed `Store`. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/**
 * Absolute runs directory for a working directory:
 * `<cwd>/.agents/@montflow/pi-runs/runs`.
 * @param root - workspace root
 * @returns absolute runs directory
 */
export const runsDir = (root: string): string =>
  join(root, '.agents', '@montflow', 'pi-runs', 'runs');

/**
 * Run one store operation against the file backend rooted at the
 * workspace runs directory. Loads the extension runtime, builds the
 * root-scoped store over the Node platform layers, and maps
 * `StoreError` to its displayable reason.
 * @param root - workspace root (runs store owner)
 * @param use - store operation
 * @returns Effect resolving to the operation result, failing with displayable message
 */
const withStore = <A>(
  root: string,
  use: (store: Store.Impl) => Effect.Effect<A, string>,
): Effect.Effect<A, string> =>
  loadPiRuns().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      libs.Store.makeWithRoot(runsDir(root)).pipe(
        Effect.provide(NodeLive),
        Effect.flatMap((store) => use(store)),
      ),
    ),
  );

/** One run row for the dashboard list. Mirrors `Run.Run` with display fallbacks. Satisfies the shared `Filterable` (description carries the initial prompt so search reaches it). */
export interface RunSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly model: string;
  readonly prompt: string;
  readonly updated: string;
}

/** Full run detail: the run row plus transcript events plus settlement receipt. */
export interface RunDetail {
  readonly summary: RunSummary;
  readonly events: ReadonlyArray<{
    readonly seq: number;
    readonly role: string;
    readonly text: string;
  }>;
  readonly receipt: { readonly outcome: string; readonly summary: string } | undefined;
}

/**
 * Bridge a `Run.Run` into a dashboard row. Total — the run already
 * carries every field; missing display fields fall back to the id.
 * @param run - pi-runs Run
 * @returns dashboard row
 */
export const fromRun = (run: Run.Run): RunSummary => ({
  id: run.id,
  name: run.name ?? run.id,
  description: run.prompt ?? run.name ?? run.id,
  status: run.status,
  model: run.model ?? '',
  prompt: run.prompt ?? '',
  updated: run.updated,
});

/** Directory-safe run id: lowercase alphanumeric groups joined by single hyphens. */
export const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * True when `id` is a safe run directory name (no traversal, no blanks).
 * @param id - candidate run id
 * @returns true for safe ids
 */
export const isValidRunId = (id: string): boolean =>
  id.length >= 1 && id.length <= 64 && RUN_ID_PATTERN.test(id);

/**
 * Slugify a run name into a directory-safe id: lowercase,
 * non-alphanumerics to hyphens, collapsed and trimmed, capped at 48
 * chars with a time suffix for uniqueness.
 * @param name - display name from the create modal
 * @param now - timestamp millis (Clock time at the call site; injected in tests)
 * @returns slug id
 */
export const slugifyName = (name: string, now: number): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
    .replace(/-+$/g, '');
  const base = slug === '' ? 'run' : slug;
  return `${base}-${(now % 36 ** 4).toString(36).padStart(4, '0')}`;
};

/**
 * True when the runs store directory exists.
 * @param root - workspace root
 * @returns installed flag, never fails
 */
export const runsInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(runsDir(root)).then(
      () => true,
      () => false,
    ),
  );

/**
 * Create the runs store directory (the install path behind `⏎`).
 * @param root - workspace root (runs store owner)
 * @returns Effect completing once installed, failing with the reason
 */
export const ensureRunsStore = (root: string): Effect.Effect<void, string> =>
  Effect.tryPromise({
    try: () => mkdir(runsDir(root), { recursive: true }).then(() => undefined),
    catch: (cause) => (cause instanceof Error ? cause.message.slice(-2000) : String(cause)),
  });

/** Staged boot phase behind the runs-panel Loader: extension import, then the run-list read. */
export type RunsPhase = 'extension' | 'runs';

/**
 * Run rows for the TUI boot through the loaded runs module: load the
 * extension runtime, then list the store newest-first. A missing store
 * directory reads as an empty list so the panel shows its install note
 * instead of an error.
 * @param root - workspace root (runs store owner)
 * @returns Effect resolving to sorted summary rows, failing with displayable message
 */
export const fetchRuns = (root: string): Effect.Effect<RunSummary[], string> =>
  withStore(root, (store) => store.list().pipe(Effect.mapError((error) => error.reason))).pipe(
    Effect.map((runs) => runs.map(fromRun).toSorted((a, b) => b.updated.localeCompare(a.updated))),
    Effect.catch((error) =>
      error.includes('missing') || error.includes('ENOENT') || error.includes('not exist')
        ? Effect.succeed<RunSummary[]>([])
        : Effect.fail(error),
    ),
  );

/** Inputs for creating a run: display name, initial agent prompt, optional model pin. */
export interface CreateRunInput {
  readonly name: string;
  readonly prompt: string;
  readonly model?: string | undefined;
}

/**
 * Create a run: slug an id from the name, `Store.create` with the
 * prompt/model capture, `start` it, and append the initial user prompt
 * as the first transcript event. Returns the dashboard row.
 * @param root - workspace root (runs store owner)
 * @param input - name, prompt, and optional model pin from the create modal
 * @returns Effect resolving to the created row, failing with displayable message
 */
export const createRun = (root: string, input: CreateRunInput): Effect.Effect<RunSummary, string> =>
  withStore(root, (store) =>
    Effect.gen(function* () {
      const id = slugifyName(input.name, yield* Clock.currentTimeMillis);
      if (!isValidRunId(id)) return yield* Effect.fail(`Unsafe run id '${id}'.`);
      if (input.model !== undefined && input.model !== '') {
        yield* store
          .create({ id, name: input.name, prompt: input.prompt, model: input.model })
          .pipe(Effect.mapError((error) => error.reason));
      } else {
        yield* store
          .create({ id, name: input.name, prompt: input.prompt })
          .pipe(Effect.mapError((error) => error.reason));
      }
      const started = yield* store.start(id).pipe(Effect.mapError((error) => error.reason));
      yield* store
        .append({ runId: id, role: 'user', text: input.prompt })
        .pipe(Effect.mapError((error) => error.reason));
      return fromRun(started);
    }),
  );

/**
 * Load one run for the detail page: run plus transcript events plus
 * settlement receipt (if any).
 * @param root - workspace root (runs store owner)
 * @param id - run id
 * @returns Effect resolving to the detail, failing with displayable message
 */
export const loadRun = (root: string, id: string): Effect.Effect<RunDetail, string> =>
  withStore(root, (store) =>
    Effect.gen(function* () {
      if (!isValidRunId(id)) return yield* Effect.fail(`Unknown run '${id}'.`);
      const loaded = yield* store.load(id).pipe(Effect.mapError((error) => error.reason));
      return {
        summary: fromRun(loaded.run),
        events: loaded.events.map((event) => ({
          seq: event.seq,
          role: event.role,
          text: event.text,
        })),
        receipt:
          loaded.receipt === null
            ? undefined
            : { outcome: loaded.receipt.outcome, summary: loaded.receipt.summary },
      } satisfies RunDetail;
    }),
  );

/**
 * Interrupt a live run: `Store.cancel` writes the cancelled receipt.
 * The in-flight agent fiber is stopped by the caller (fiber interrupt
 * kills the headless child) — the store transition lands either way.
 * @param root - workspace root (runs store owner)
 * @param id - run id
 * @returns Effect completing once cancelled, failing with displayable message
 */
export const cancelRun = (root: string, id: string): Effect.Effect<void, string> =>
  withStore(root, (store) =>
    Effect.gen(function* () {
      if (!isValidRunId(id)) return yield* Effect.fail(`Unknown run '${id}'.`);
      yield* store.cancel(id).pipe(Effect.mapError((error) => error.reason));
    }),
  );

/**
 * Park a running run while it waits on user answers: `Store.ask`
 * flips `running` to `awaiting-input` (the question itself is appended
 * by the agent before parking).
 * @param root - workspace root (runs store owner)
 * @param id - run id
 * @param question - question the agent is asking
 * @returns Effect completing once parked, failing with displayable message
 */
export const askRun = (root: string, id: string, question: string): Effect.Effect<void, string> =>
  withStore(root, (store) =>
    Effect.gen(function* () {
      if (!isValidRunId(id)) return yield* Effect.fail(`Unknown run '${id}'.`);
      yield* store.ask({ runId: id, question }).pipe(Effect.mapError((error) => error.reason));
    }),
  );

/**
 * Answer a parked run: `Store.answer` appends the user reply and flips
 * `awaiting-input` back to `running`.
 * @param root - workspace root (runs store owner)
 * @param id - run id
 * @param text - user answer
 * @returns Effect completing once resumed, failing with displayable message
 */
export const answerRun = (root: string, id: string, text: string): Effect.Effect<void, string> =>
  withStore(root, (store) =>
    Effect.gen(function* () {
      if (!isValidRunId(id)) return yield* Effect.fail(`Unknown run '${id}'.`);
      yield* store.answer({ runId: id, text }).pipe(Effect.mapError((error) => error.reason));
    }),
  );

/** Failure when a headless agent run fails. Carries tailed CLI output. */
export class AgentError extends Data.TaggedError('@montflow/RunsAgentError')<{
  readonly message: string;
}> {}

/** Headless runs get ten minutes — agent work is open-ended. */
const AGENT_TIMEOUT_MS = 600_000;

/**
 * Run a headless child agent via the `pi` CLI (`-p`, ephemeral, tight
 * tools) in the workspace root and settle the run on exit: the reply
 * appends as the assistant event plus `done`; failures settle `failed`
 * and re-fail with the original reason so the flow toast names it.
 * Spawned (not `execFile`) so the Effect stays interruptible — cancelling the fiber kills the child,
 * and the timeout interrupts the wait the same way. The caller
 * interrupts this fiber to implement the detail-page stop key, then
 * `cancelRun` writes the cancelled receipt.
 * @param root - workspace root (child working directory)
 * @param runId - run under execution
 * @param prompt - assembled child prompt
 * @param modelLabel - `provider/model-id` pin, if any
 * @returns Effect resolving to the reply text, failing with the reason
 */
export const runAgent = (
  root: string,
  runId: string,
  prompt: string,
  modelLabel: string | undefined,
): Effect.Effect<string, string> =>
  withStore(root, (store) =>
    Effect.gen(function* () {
      const reply = yield* Effect.callback<string, AgentError>((resume, signal) => {
        const args = [
          '-p',
          '--no-session',
          '--tools',
          'read,write,edit',
          ...(modelLabel === undefined || modelLabel === '' ? [] : ['--model', modelLabel]),
          prompt,
        ];
        const child = spawn('pi', args, {
          cwd: root,
          // Headless agents must never inherit stdin: an interactive
          // prompt (auth, confirmation) would block forever on the
          // TUI's pty instead of failing fast on stderr.
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const settle = (finish: () => void): void => {
          if (settled) return;
          settled = true;
          finish();
        };
        child.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on('error', (cause) => {
          settle(() =>
            resume(
              Effect.fail(
                new AgentError({
                  message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
                }),
              ),
            ),
          );
        });
        child.on('close', (code) => {
          // Post-kill `close` must not resume: the fiber already settled
          // through the interruption that killed the child.
          if (signal.aborted) return;
          settle(() => {
            if (code === 0) resume(Effect.succeed(stdout));
            else
              resume(
                Effect.fail(
                  new AgentError({
                    message: (stderr || stdout || `exit ${code}`).slice(-2000),
                  }),
                ),
              );
          });
        });
        signal.addEventListener('abort', () => {
          child.kill();
        });
      }).pipe(
        Effect.timeout(AGENT_TIMEOUT_MS),
        Effect.mapError((error) =>
          error instanceof AgentError ? error.message : 'Agent run timed out after ten minutes.',
        ),
        // Agent failures settle the run as failed, then re-fail with
        // the original reason so the flow toast names it. Only
        // failures land here — interruptions skip the handler, and the
        // caller owns the cancelled receipt via `cancelRun`.
        Effect.catch((reason) =>
          store.settle({ runId, outcome: 'failed', summary: reason.slice(0, 500) }).pipe(
            Effect.mapError((error) => error.reason),
            Effect.ignore,
            Effect.flatMap(() => Effect.fail(reason)),
          ),
        ),
      );
      const text = reply.trim() === '' ? '(empty reply)' : reply;
      yield* store
        .append({ runId, role: 'assistant', text })
        .pipe(Effect.mapError((error) => error.reason));
      yield* store
        .settle({ runId, outcome: 'done', summary: text.slice(0, 500) })
        .pipe(Effect.mapError((error) => error.reason));
      return reply;
    }),
  );
