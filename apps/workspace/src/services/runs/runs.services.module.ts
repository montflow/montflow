// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: runs store lives under .agents/@montflow/runs; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for run files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: shells out to the pi CLI for the extension probe; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the extension probe shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Clock, Data, Effect, Layer } from 'effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import type {
  Run,
  RunDetail as EngineRunDetail,
  Runner,
  RunnerImpl,
  SessionFactory,
  Store,
  WorkspaceBridge,
} from '@montflow/pi-runs';

/**
 * Default tool allowlist for workspace-dispatched runs. Restores the
 * `pi -p --tools read,write,edit` capability set the in-process engine
 * replaced — without it Pi's session default also enables `bash`. The Pi
 * factory unions the interaction tools (`ask_user`/`notify_user`) into
 * whatever allowlist is passed, so a restricted run can still park and
 * notify.
 */
export const DEFAULT_RUN_TOOLS = ['read', 'write', 'edit'] as const;

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

/** The resolved extension runtime, once a flow has loaded it. */
let liveLib: PiRunsLib | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<PiRunsLib> => {
  cachedLib ??= import('@montflow/pi-runs').then(
    (libs) => {
      liveLib = libs;
      return libs;
    },
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
  liveLib = undefined;
};

/**
 * The loaded extension runtime, if any flow has loaded it yet.
 * @returns the extension module namespace, or undefined before first load
 */
export const loadedPiRuns = (): PiRunsLib | undefined => liveLib;

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
 * `<cwd>/.agents/@montflow/runs`. Mirrors the extension's
 * `Store.RUNS_SEGMENTS`; the pre-load fs checks (`runsInstalled`,
 * `ensureRunsStore`) cannot import the runtime, so engine paths derive
 * from the loaded segments via {@link runsDirFor} instead.
 * @param root - workspace root
 * @returns absolute runs directory
 */
export const runsDir = (root: string): string => join(root, '.agents', '@montflow', 'runs');

/**
 * Absolute runs directory derived from the loaded extension's segments,
 * so the engine's store location can never drift from pi-runs.
 * @param libs - loaded pi-runs namespace
 * @param root - workspace root
 * @returns absolute runs directory
 */
const runsDirFor = (libs: PiRunsLib, root: string): string =>
  join(root, ...libs.Store.RUNS_SEGMENTS);

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
      libs.Store.makeWithRoot(runsDirFor(libs, root)).pipe(
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
  /** Latest agent-posted progress line; empty when none. */
  readonly progress: string;
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
  progress: run.progress ?? '',
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
  // Full millisecond timestamp in base36 — a modulo suffix wrapped every
  // ~28 minutes, colliding same-named runs created a cycle apart.
  return `${base}-${now.toString(36)}`;
};

/**
 * Slug a fresh run id from a display name using the Effect `Clock` (no
 * wall-clock reads, so tests can drive time).
 * @param name - display name from the create modal
 * @returns Effect resolving to a directory-safe run id
 */
export const newRunId = (name: string): Effect.Effect<string> =>
  Clock.currentTimeMillis.pipe(Effect.map((now) => slugifyName(name, now)));

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
 * Parse `pi list` stdout. True when the pi-runs package is registered in
 * the pi session — its name appears as a path segment (project-local
 * `../packages/pi-runs`, absolute path) or as the `@montflow/pi-runs`
 * package on its own line. The segment match keeps lookalikes
 * (`not-pi-runs-x`) from reading as installed.
 * @param stdout - raw command stdout
 * @returns true when pi-runs is listed
 */
export const parseListOutput = (stdout: string): boolean =>
  stdout.split(/\r?\n/).some((line) => /(?:^|[/@\s])pi-runs(?:$|[/@\s])/.test(line));

/**
 * Toast copy when an agentic flow needs the runs extension but `pi list`
 * does not register it. The caller compares against this exact value to
 * route the failure to a toast instead of the flow-error modal. The
 * workspace engine imports `@montflow/pi-runs` directly; `pi list`
 * registration is what the Pi session needs to load the extension.
 */
export const RUNS_EXTENSION_INSTALL_HINT =
  'Runs extension not installed — register `@montflow/pi-runs` in `.pi/settings.json` (or reinstall the workspace dependencies), then retry.';

/**
 * True when a flow failure is the runs-extension install hint, so the TUI
 * routes it to a warning toast instead of the flow-error modal.
 * @param message - flow failure message
 * @returns true for the install hint
 */
export const isRunsExtensionInstallError = (message: string): boolean =>
  message === RUNS_EXTENSION_INSTALL_HINT;

/** Overridable extension probe: tests inject a fake so the gate is deterministic without a Pi install. */
let extensionProbe: ((root: string) => Effect.Effect<boolean, never>) | undefined;

/**
 * Test seam: replace the runs-extension probe, or clear it to restore the
 * `pi list` shell-out.
 * @param probe - probe to use, or undefined to restore the real one
 */
export const setExtensionProbe = (
  probe: ((root: string) => Effect.Effect<boolean, never>) | undefined,
): void => {
  extensionProbe = probe;
};

/** Default probe: shell out to `pi list` in the workspace root. */
const defaultExtensionProbe = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    promisify(execFile)('pi', ['list'], { cwd: root, timeout: 8000 }).then(
      ({ stdout }) => parseListOutput(stdout.toString()),
      () => false,
    ),
  );

/**
 * True when pi-runs is installed in the pi session (`pi list` registers
 * it). The probe runs in the workspace root so project-local packages
 * resolve — from anywhere else `pi list` reports nothing. Slow or
 * failing probes read as missing, so an agentic flow gates instead of
 * dispatching against a runtime the session cannot see.
 * @param root - workspace root (pi project directory)
 * @returns installed flag, never fails
 */
export const runsExtensionInstalled = (root: string): Effect.Effect<boolean, never> =>
  (extensionProbe ?? defaultExtensionProbe)(root);

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

/** Workspace callbacks the run engine forwards to: a toast and a notification. */
export interface RunNotifier {
  readonly toast: (message: string, variant?: 'info' | 'success' | 'error') => void;
  readonly notify: (title: string, body: string) => void;
}

/**
 * Module-level notifier the TUI installs once on mount. The engine's
 * `WorkspaceBridge` forwards toasts and notifications here; when unset
 * (tests, headless import) both calls are silent.
 */
let notifier: RunNotifier | undefined;

/**
 * Install the TUI notifier the run engine's bridge forwards to.
 * @param next - notifier, or undefined to clear
 */
export const setRunNotifier = (next: RunNotifier | undefined): void => {
  notifier = next;
};

/**
 * Overridable Pi session factory layer: production uses the real
 * `PiSessionFactory`, tests inject a fake so the engine runs without a
 * Pi install.
 */
let sessionFactoryLayer: Layer.Layer<SessionFactory> | undefined;

/**
 * Per-repo-root engine runtimes. The engine's live-run registry must
 * survive across dispatches, so one runtime is built per root and
 * reused — mirroring `createRunnerHost` in `@montflow/pi-runs`.
 */
const runtimes = new Map<string, ManagedRuntime.ManagedRuntime<Runner, never>>();

/**
 * Dispose and forget every cached engine runtime, awaiting each disposal
 * so layer finalizers (and detached consumer fibers) finish before the
 * caller proceeds. Called by tests that swap the session factory and by
 * the TUI on unmount.
 * @returns promise resolving once every runtime is disposed
 */
export const resetRunnerRuntimes = async (): Promise<void> => {
  const disposals = [...runtimes.values()].map((runtime) => runtime.dispose());
  runtimes.clear();
  await Promise.all(disposals);
};

/**
 * Test seam: replace the Pi session factory the engine builds with, so
 * lifecycle tests run against a fake `SessionPort`. Clears the cached
 * runtimes so the next dispatch rebuilds with the injected factory.
 * @param layer - fake factory layer, or undefined to restore the real Pi factory
 */
export const setSessionFactoryLayer = (layer: Layer.Layer<SessionFactory> | undefined): void => {
  sessionFactoryLayer = layer;
  void resetRunnerRuntimes();
};

/** File-backed store layer rooted at the workspace runs directory. */
const storeLayer = (libs: PiRunsLib, root: string): Layer.Layer<Store.Store> =>
  Layer.effect(libs.Store.Store, libs.Store.makeWithRoot(runsDirFor(libs, root))).pipe(
    Layer.provide(NodeLive),
  );

/** Escape character, built without a literal so the source stays ASCII. */
const ESCAPE = String.fromCharCode(27);

/**
 * Strip ANSI escapes and control characters from run-controlled text
 * before it reaches the TUI. Mirrors the pi-runs `ConsoleBridge`
 * sanitizer: a prompt-injected agent must not be able to move the
 * cursor or corrupt the toast layer.
 * @param text - run-controlled text (toast body, notification title/body)
 * @returns printable, trimmed text
 */
export const sanitizeRunText = (text: string): string => {
  const chars = [...text];
  let stripped = '';
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index] ?? '';
    if (char === ESCAPE && chars[index + 1] === '[') {
      index += 2;
      while (index < chars.length && !/[A-Za-z]/.test(chars[index] ?? '')) index++;
      continue;
    }
    stripped += char;
  }
  let out = '';
  for (const char of stripped) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  return out.trim();
};

/** Engine bridge: both calls land on the TUI notifier, sanitized and silent when unset. */
const bridgeLayer = (libs: PiRunsLib): Layer.Layer<WorkspaceBridge> =>
  Layer.succeed(libs.WorkspaceBridge, {
    toast: (message, variant) =>
      Effect.sync(() => {
        notifier?.toast(sanitizeRunText(message), variant);
      }),
    notify: (title, body) =>
      Effect.sync(() => {
        notifier?.notify(sanitizeRunText(title), sanitizeRunText(body));
      }),
  });

/** Full engine layer for one repo root: store plus Pi factory plus bridge. */
const runnerLayer = (libs: PiRunsLib, root: string): Layer.Layer<Runner> =>
  libs.Default.pipe(
    Layer.provide(
      Layer.mergeAll(
        storeLayer(libs, root),
        sessionFactoryLayer ?? libs.PiSessionFactory,
        bridgeLayer(libs),
      ),
    ),
  );

/** Build (once) and cache the engine runtime for a repo root. */
const runtimeFor = (
  libs: PiRunsLib,
  root: string,
): ManagedRuntime.ManagedRuntime<Runner, never> => {
  const existing = runtimes.get(root);
  if (existing !== undefined) return existing;
  const created = ManagedRuntime.make(runnerLayer(libs, root));
  runtimes.set(root, created);
  return created;
};

/**
 * Run one engine operation against the root's long-lived runtime: load
 * the extension, resolve the `Runner` service, and hand it to `use`.
 * @param root - workspace root (runtime cache key)
 * @param use - engine operation
 * @returns Effect resolving to the operation result, failing with displayable message
 */
const withRunner = <A>(
  root: string,
  use: (runner: RunnerImpl) => Effect.Effect<A, string>,
): Effect.Effect<A, string> =>
  loadPiRuns().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.promise(() => runtimeFor(libs, root).runPromise(libs.Runner)).pipe(
        Effect.flatMap((runner) => use(runner)),
      ),
    ),
  );

/** Substrings marking a missing Pi coding-agent install in an engine failure. */
const PI_MISSING_SIGNALS = [
  'cannot find module',
  'cannot find package',
  'err_module_not_found',
  'failed to resolve',
  'module not found',
];

/** True when an engine failure names a missing Pi coding-agent install. */
const isMissingPiRuntime = (reason: string): boolean => {
  const lowered = reason.toLowerCase();
  return PI_MISSING_SIGNALS.some((signal) => lowered.includes(signal));
};

/**
 * Map an engine failure to user-facing copy. A missing Pi coding-agent
 * install (the factory's dynamic import rejects) surfaces the reinstall
 * step; every other failure passes through untouched. The caller owns the
 * display — returning the message (without also toasting) keeps a single
 * failure from showing twice.
 * @param reason - engine failure message
 * @returns displayable message
 */
const surfaceRunFailure = (reason: string): string => {
  if (!isMissingPiRuntime(reason)) return reason;
  return "Pi runtime not found — reinstall workspace dependencies so '@earendil-works/pi-coding-agent' resolves, then retry.";
};

/** Inputs for dispatching a fresh run through the engine. */
export interface StartRunInput {
  readonly id: string;
  readonly name?: string | undefined;
  readonly prompt: string;
  readonly model?: string | undefined;
  readonly tools?: ReadonlyArray<string> | undefined;
  /** Parent run id: this run is a subrun of that run. */
  readonly parent?: string | undefined;
  /** Non-parent related run ids (siblings, review target). */
  readonly related?: ReadonlyArray<string> | undefined;
  /** Called once when the run settles; the profile-create completion hook lives here. */
  readonly onSettled?: ((detail: EngineRunDetail) => Effect.Effect<void>) | undefined;
}

/**
 * Dispatch a fresh run through the engine: `Store.create` + `start`,
 * then a live Pi session whose events stream into the store. The engine
 * detaches the prompt, so this resolves as soon as the run is registered.
 * Tool allowlists default to {@link DEFAULT_RUN_TOOLS} so a workspace run
 * never silently regains Pi's `bash` default.
 * @param root - workspace root (store and session owner)
 * @param input - run id, display name, prompt, optional model/tools pins, and parentage/hook
 * @returns Effect resolving to the running row, failing with displayable message
 */
export const startRun = (root: string, input: StartRunInput): Effect.Effect<RunSummary, string> =>
  withRunner(root, (runner) =>
    runner
      .start({
        root,
        id: input.id,
        name: input.name,
        prompt: input.prompt,
        model: input.model,
        tools: input.tools ?? DEFAULT_RUN_TOOLS,
        parent: input.parent,
        related: input.related,
        onSettled: input.onSettled,
      })
      .pipe(Effect.map(fromRun)),
  ).pipe(Effect.catch((reason) => Effect.fail(surfaceRunFailure(reason))));

/**
 * Steer a live run. Pi delivers the steering turn after the in-flight
 * tool results; the engine mirrors it as a user event.
 * @param root - workspace root (store and session owner)
 * @param id - run id
 * @param text - steering message
 * @returns Effect completing once forwarded, failing with displayable message
 */
export const steerRun = (root: string, id: string, text: string): Effect.Effect<void, string> =>
  withRunner(root, (runner) => runner.steer(root, id, text));

/**
 * Answer a parked run: the engine unparks it and resolves the awaiting
 * `ask_user` call — the answer travels in the tool result, so nothing is
 * relaunched.
 * @param root - workspace root (store and session owner)
 * @param id - run id
 * @param text - user answer
 * @returns Effect completing once the ask is released, failing with displayable message
 */
export const answerRun = (root: string, id: string, text: string): Effect.Effect<void, string> =>
  withRunner(root, (runner) => runner.answer(root, id, text));

/**
 * Interrupt a live run: the engine aborts the session, releases any
 * parked ask, and writes the cancelled receipt. A stale live run with no
 * session is cancelled through the store.
 * @param root - workspace root (store and session owner)
 * @param id - run id
 * @returns Effect completing once cancelled, failing with displayable message
 */
export const interruptRun = (root: string, id: string): Effect.Effect<void, string> =>
  withRunner(root, (runner) => runner.interrupt(root, id));

/**
 * Resume a settled or interrupted run from its stored transcript,
 * optionally with a continuation prompt. Pass `onSettled` to re-attach a
 * completion hook after an app restart — the engine holds hooks in memory
 * only, so a resumed author run otherwise settles unobserved.
 * @param root - workspace root (store and session owner)
 * @param id - run id
 * @param prompt - continuation prompt, if any
 * @param onSettled - completion hook re-attached for the resumed run
 * @returns Effect resolving to the resumed row, failing with displayable message
 */
export const resumeRun = (
  root: string,
  id: string,
  prompt?: string,
  onSettled?: (detail: EngineRunDetail) => Effect.Effect<void>,
): Effect.Effect<RunSummary, string> =>
  withRunner(root, (runner) =>
    runner.resume(root, id, prompt, onSettled).pipe(Effect.map(fromRun)),
  ).pipe(Effect.catch((reason) => Effect.fail(surfaceRunFailure(reason))));
