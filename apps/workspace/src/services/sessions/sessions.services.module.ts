// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: sessions store lives under .agents/@montflow/sessions; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for session files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: shells out to the pi CLI for the extension probe; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the extension probe shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Clock, Data, Effect, Layer } from 'effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import type {
  Session,
  SessionDetail as EngineSessionDetail,
  SessionRunner,
  SessionRunnerImpl,
  SessionFactory,
  Store,
  WorkspaceBridge,
} from '@montflow/pi-sessions';

/**
 * Default tool allowlist for workspace-dispatched sessions. Restores the
 * `pi -p --tools read,write,edit` capability set the in-process engine
 * replaced — without it Pi's session default also enables `bash`. The Pi
 * factory unions the interaction tools (`ask_user`/`notify_user`) into
 * whatever allowlist is passed, so a restricted session can still park and
 * notify.
 */
export const DEFAULT_SESSION_TOOLS = ['read', 'write', 'edit'] as const;

/**
 * The `session_*` tools the pi-sessions extension registers (`extension.ts`). An
 * explicit `tools` allowlist filters *extension* tools too — Pi keeps only
 * the listed names — so an orchestrator session that must spawn workers has to
 * name these, or `session_start` is filtered out of its session.
 */
export const SESSION_TOOL_NAMES = [
  'session_start',
  'session_status',
  'session_verify',
  'session_list',
  'session_resume',
  'session_interrupt',
  'session_steer',
  'session_answer',
] as const;

/**
 * Lazy handle to the sessions extension runtime. Static imports from
 * `@montflow/pi-sessions` are type-only (erased at build) — the runtime
 * resolves here, on first use, never at dashboard boot. A broken or
 * missing extension therefore cannot crash the TUI; the failing flow
 * surfaces the load error as a toast instead.
 */
type PiSessionsLib = typeof import('@montflow/pi-sessions');

/** Failure loading the sessions extension runtime. `cause` classifies the import rejection. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/SessionsExtensionLoadError')<{
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
      return 'Sessions extension download failed (network) — check the connection, then retry.';
    case 'missing':
      return 'Sessions extension not found — reinstall the workspace dependencies, then retry.';
    default:
      return 'Sessions extension failed to load — reinstall the workspace dependencies, then retry.';
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
let cachedLib: Promise<PiSessionsLib> | undefined;

/** The resolved extension runtime, once a flow has loaded it. */
let liveLib: PiSessionsLib | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<PiSessionsLib> => {
  cachedLib ??= import('@montflow/pi-sessions').then(
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
export const loadedPiSessions = (): PiSessionsLib | undefined => liveLib;

/**
 * Load the sessions extension runtime as an Effect, caching the module
 * across flows.
 * @returns Effect resolving to the extension module namespace
 */
export const loadPiSessions = (): Effect.Effect<PiSessionsLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => importOnce(),
    catch: (cause) => (cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause)),
  });

/** Node platform layers for the file-backed `Store`. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/**
 * Absolute sessions directory for a working directory:
 * `<cwd>/.agents/@montflow/sessions`. Mirrors the extension's
 * `Store.SESSIONS_SEGMENTS`; the pre-load fs checks (`sessionsInstalled`,
 * `ensureSessionsStore`) cannot import the runtime, so engine paths derive
 * from the loaded segments via {@link sessionsDirFor} instead.
 * @param root - workspace root
 * @returns absolute sessions directory
 */
export const sessionsDir = (root: string): string => join(root, '.agents', '@montflow', 'sessions');

/**
 * Absolute sessions directory derived from the loaded extension's segments,
 * so the engine's store location can never drift from pi-sessions.
 * @param libs - loaded pi-sessions namespace
 * @param root - workspace root
 * @returns absolute sessions directory
 */
const sessionsDirFor = (libs: PiSessionsLib, root: string): string =>
  join(root, ...libs.Store.SESSIONS_SEGMENTS);

/**
 * Run one store operation against the file backend rooted at the
 * workspace sessions directory. Loads the extension runtime, builds the
 * root-scoped store over the Node platform layers, and maps
 * `StoreError` to its displayable reason.
 * @param root - workspace root (sessions store owner)
 * @param use - store operation
 * @returns Effect resolving to the operation result, failing with displayable message
 */
const withStore = <A>(
  root: string,
  use: (store: Store.Impl) => Effect.Effect<A, string>,
): Effect.Effect<A, string> =>
  loadPiSessions().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      libs.Store.makeWithRoot(sessionsDirFor(libs, root)).pipe(
        Effect.provide(NodeLive),
        Effect.flatMap((store) => use(store)),
      ),
    ),
  );

/** One session row for the dashboard list. Mirrors `Session.Session` with display fallbacks. Satisfies the shared `Filterable` (description carries the initial prompt so search reaches it). */
export interface SessionSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly model: string;
  /** Thinking-level pin for the session, empty when the session default applies. */
  readonly thinking: string;
  /** Tool allowlist for the session's Pi session; empty means Pi's default set. */
  readonly tools: ReadonlyArray<string>;
  readonly prompt: string;
  /** Spec slug this session works on, empty when unbound. */
  readonly spec: string;
  /** Latest agent-posted progress line; empty when none. */
  readonly progress: string;
  readonly created: string;
  readonly updated: string;
}

/** Full session detail: the session row plus transcript events plus settlement receipt. */
export interface SessionDetail {
  readonly summary: SessionSummary;
  readonly events: ReadonlyArray<{
    readonly seq: number;
    readonly role: string;
    readonly text: string;
  }>;
  readonly receipt: { readonly outcome: string; readonly summary: string } | undefined;
}

/**
 * Bridge a `Session.Session` into a dashboard row. Total — the session already
 * carries every field; missing display fields fall back to the id.
 * @param session - pi-sessions Session
 * @returns dashboard row
 */
export const fromSession = (session: Session.Session): SessionSummary => ({
  id: session.id,
  name: session.name ?? session.id,
  description: session.prompt ?? session.name ?? session.id,
  status: session.status,
  model: session.model ?? '',
  thinking: session.thinking ?? '',
  tools: session.tools ?? [],
  prompt: session.prompt ?? '',
  spec: session.spec ?? '',
  progress: session.progress ?? '',
  created: session.created,
  updated: session.updated,
});

/** Directory-safe session id: lowercase alphanumeric groups joined by single hyphens. */
export const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * True when `id` is a safe session directory name (no traversal, no blanks).
 * @param id - candidate session id
 * @returns true for safe ids
 */
export const isValidSessionId = (id: string): boolean =>
  id.length >= 1 && id.length <= 64 && SESSION_ID_PATTERN.test(id);

/**
 * Slugify a session name into a directory-safe id: lowercase,
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
  const base = slug === '' ? 'session' : slug;
  // Full millisecond timestamp in base36 — a modulo suffix wrapped every
  // ~28 minutes, colliding same-named sessions created a cycle apart.
  return `${base}-${now.toString(36)}`;
};

/**
 * Slug a fresh session id from a display name using the Effect `Clock` (no
 * wall-clock reads, so tests can drive time).
 * @param name - display name from the create modal
 * @returns Effect resolving to a directory-safe session id
 */
export const newSessionId = (name: string): Effect.Effect<string> =>
  Clock.currentTimeMillis.pipe(Effect.map((now) => slugifyName(name, now)));

/**
 * True when the sessions store directory exists.
 * @param root - workspace root
 * @returns installed flag, never fails
 */
export const sessionsInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(sessionsDir(root)).then(
      () => true,
      () => false,
    ),
  );

/**
 * Parse `pi list` stdout. True when the pi-sessions package is registered in
 * the pi session — its name appears as a path segment (project-local
 * `../packages/pi-sessions`, absolute path) or as the `@montflow/pi-sessions`
 * package on its own line. The segment match keeps lookalikes
 * (`not-pi-sessions-x`) from reading as installed.
 * @param stdout - raw command stdout
 * @returns true when pi-sessions is listed
 */
export const parseListOutput = (stdout: string): boolean =>
  stdout.split(/\r?\n/).some((line) => /(?:^|[/@\s])pi-sessions(?:$|[/@\s])/.test(line));

/**
 * Toast copy when an agentic flow needs the sessions extension but `pi list`
 * does not register it. The caller compares against this exact value to
 * route the failure to a toast instead of the flow-error modal. The
 * workspace engine imports `@montflow/pi-sessions` directly; `pi list`
 * registration is what the Pi session needs to load the extension.
 */
export const SESSIONS_EXTENSION_INSTALL_HINT =
  'Sessions extension not installed — register `@montflow/pi-sessions` in `.pi/settings.json` (or reinstall the workspace dependencies), then retry.';

/**
 * True when a flow failure is the sessions-extension install hint, so the TUI
 * routes it to a warning toast instead of the flow-error modal.
 * @param message - flow failure message
 * @returns true for the install hint
 */
export const isSessionsExtensionInstallError = (message: string): boolean =>
  message === SESSIONS_EXTENSION_INSTALL_HINT;

/** Overridable extension probe: tests inject a fake so the gate is deterministic without a Pi install. */
let extensionProbe: ((root: string) => Effect.Effect<boolean, never>) | undefined;

/**
 * Test seam: replace the sessions-extension probe, or clear it to restore the
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
 * True when pi-sessions is installed in the pi session (`pi list` registers
 * it). The probe runs in the workspace root so project-local packages
 * resolve — from anywhere else `pi list` reports nothing. Slow or
 * failing probes read as missing, so an agentic flow gates instead of
 * dispatching against a runtime the session cannot see.
 * @param root - workspace root (pi project directory)
 * @returns installed flag, never fails
 */
export const sessionsExtensionInstalled = (root: string): Effect.Effect<boolean, never> =>
  (extensionProbe ?? defaultExtensionProbe)(root);

/**
 * Create the sessions store directory (the install path behind `⏎`).
 * @param root - workspace root (sessions store owner)
 * @returns Effect completing once installed, failing with the reason
 */
export const ensureSessionsStore = (root: string): Effect.Effect<void, string> =>
  Effect.tryPromise({
    try: () => mkdir(sessionsDir(root), { recursive: true }).then(() => undefined),
    catch: (cause) => (cause instanceof Error ? cause.message.slice(-2000) : String(cause)),
  });

/** Staged boot phase behind the sessions-panel Loader: extension import, then the session-list read. */
export type SessionsPhase = 'extension' | 'sessions';

/**
 * Session rows for the TUI boot through the loaded sessions module: load the
 * extension runtime, then list the store newest-first. A missing store
 * directory reads as an empty list so the panel shows its install note
 * instead of an error.
 * @param root - workspace root (sessions store owner)
 * @returns Effect resolving to sorted summary rows, failing with displayable message
 */
export const fetchSessions = (root: string): Effect.Effect<SessionSummary[], string> =>
  withStore(root, (store) => store.list().pipe(Effect.mapError((error) => error.reason))).pipe(
    Effect.map((rows) =>
      rows.map(fromSession).toSorted((a, b) => b.updated.localeCompare(a.updated)),
    ),
    Effect.catch((error) =>
      error.includes('missing') || error.includes('ENOENT') || error.includes('not exist')
        ? Effect.succeed<SessionSummary[]>([])
        : Effect.fail(error),
    ),
  );

/**
 * Ids of sessions with a live in-process session. Persisted `running` statuses
 * left behind by a dead process are excluded, so this is the trustworthy
 * "is something actually working" signal for specs.
 * @param root - workspace root (runner runtime owner)
 * @returns Effect resolving to live session ids, failing with displayable message
 */
export const liveSessionIds = (root: string): Effect.Effect<ReadonlySet<string>, string> =>
  withSessionRunner(root, (runner) => runner.liveSessionIds(root));

/**
 * Load one session for the detail page: session plus transcript events plus
 * settlement receipt (if any).
 * @param root - workspace root (sessions store owner)
 * @param id - session id
 * @returns Effect resolving to the detail, failing with displayable message
 */
export const loadSession = (root: string, id: string): Effect.Effect<SessionDetail, string> =>
  withStore(root, (store) =>
    Effect.gen(function* () {
      if (!isValidSessionId(id)) return yield* Effect.fail(`Unknown session '${id}'.`);
      const loaded = yield* store.load(id).pipe(Effect.mapError((error) => error.reason));
      return {
        summary: fromSession(loaded.session),
        events: loaded.events.map((event) => ({
          seq: event.seq,
          role: event.role,
          text: event.text,
        })),
        receipt:
          loaded.receipt === null
            ? undefined
            : { outcome: loaded.receipt.outcome, summary: loaded.receipt.summary },
      } satisfies SessionDetail;
    }),
  );

/** Workspace callbacks the session engine forwards to: a toast and a notification. */
export interface SessionNotifier {
  readonly toast: (message: string, variant?: 'info' | 'success' | 'error') => void;
  readonly notify: (title: string, body: string) => void;
}

/**
 * Module-level notifier the TUI installs once on mount. The engine's
 * `WorkspaceBridge` forwards toasts and notifications here; when unset
 * (tests, headless import) both calls are silent.
 */
let notifier: SessionNotifier | undefined;

/**
 * Install the TUI notifier the session engine's bridge forwards to.
 * @param next - notifier, or undefined to clear
 */
export const setSessionNotifier = (next: SessionNotifier | undefined): void => {
  notifier = next;
};

/**
 * Overridable Pi session factory layer: production uses the real
 * `PiSessionFactory`, tests inject a fake so the engine runs without a
 * Pi install.
 */
let sessionFactoryLayer: Layer.Layer<SessionFactory> | undefined;

/**
 * Per-repo-root engine runtimes. The engine's live-session registry must
 * survive across dispatches, so one runtime is built per root and
 * reused — mirroring `createSessionRunnerHost` in `@montflow/pi-sessions`.
 */
const runtimes = new Map<string, ManagedRuntime.ManagedRuntime<SessionRunner, never>>();

/**
 * Dispose and forget every cached engine runtime, awaiting each disposal
 * so layer finalizers (and detached consumer fibers) finish before the
 * caller proceeds. Called by tests that swap the session factory and by
 * the TUI on unmount.
 * @returns promise resolving once every runtime is disposed
 */
export const resetSessionRuntimes = async (): Promise<void> => {
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
  void resetSessionRuntimes();
};

/** File-backed store layer rooted at the workspace sessions directory. */
const storeLayer = (libs: PiSessionsLib, root: string): Layer.Layer<Store.Store> =>
  Layer.effect(libs.Store.Store, libs.Store.makeWithRoot(sessionsDirFor(libs, root))).pipe(
    Layer.provide(NodeLive),
  );

/** Escape character, built without a literal so the source stays ASCII. */
const ESCAPE = String.fromCharCode(27);

/**
 * Strip ANSI escapes and control characters from session-controlled text
 * before it reaches the TUI. Mirrors the pi-sessions `ConsoleBridge`
 * sanitizer: a prompt-injected agent must not be able to move the
 * cursor or corrupt the toast layer.
 * @param text - session-controlled text (toast body, notification title/body)
 * @returns printable, trimmed text
 */
export const sanitizeSessionText = (text: string): string => {
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
const bridgeLayer = (libs: PiSessionsLib): Layer.Layer<WorkspaceBridge> =>
  Layer.succeed(libs.WorkspaceBridge, {
    toast: (message, variant) =>
      Effect.sync(() => {
        notifier?.toast(sanitizeSessionText(message), variant);
      }),
    notify: (title, body) =>
      Effect.sync(() => {
        notifier?.notify(sanitizeSessionText(title), sanitizeSessionText(body));
      }),
  });

/** Full engine layer for one repo root: store plus Pi factory plus bridge plus the platform services `Default` still requires. */
const sessionRunnerLayer = (libs: PiSessionsLib, root: string): Layer.Layer<SessionRunner> =>
  libs.Default.pipe(
    Layer.provide(
      Layer.mergeAll(
        storeLayer(libs, root),
        sessionFactoryLayer ?? libs.PiSessionFactory,
        bridgeLayer(libs),
        NodeLive,
      ),
    ),
  );

/** Build (once) and cache the engine runtime for a repo root. */
const runtimeFor = (
  libs: PiSessionsLib,
  root: string,
): ManagedRuntime.ManagedRuntime<SessionRunner, never> => {
  const existing = runtimes.get(root);
  if (existing !== undefined) return existing;
  const created = ManagedRuntime.make(sessionRunnerLayer(libs, root));
  runtimes.set(root, created);
  return created;
};

/**
 * Run one engine operation against the root's long-lived runtime: load
 * the extension, resolve the `SessionRunner` service, and hand it to `use`.
 * @param root - workspace root (runtime cache key)
 * @param use - engine operation
 * @returns Effect resolving to the operation result, failing with displayable message
 */
const withSessionRunner = <A>(
  root: string,
  use: (runner: SessionRunnerImpl) => Effect.Effect<A, string>,
): Effect.Effect<A, string> =>
  loadPiSessions().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.promise(() => runtimeFor(libs, root).runPromise(libs.SessionRunner)).pipe(
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
const surfaceSessionFailure = (reason: string): string => {
  if (!isMissingPiRuntime(reason)) return reason;
  return "Pi runtime not found — reinstall workspace dependencies so '@earendil-works/pi-coding-agent' resolves, then retry.";
};

/** Inputs for dispatching a fresh session through the engine. */
export interface StartSessionInput {
  readonly id: string;
  readonly name?: string | undefined;
  readonly prompt: string;
  readonly model?: string | undefined;
  readonly tools?: ReadonlyArray<string> | undefined;
  /** Parent session id: this session is a subsession of that session. */
  readonly parent?: string | undefined;
  /** Non-parent related session ids (siblings, review target). */
  readonly related?: ReadonlyArray<string> | undefined;
  /** Spec slug this session works on, when bound to one. */
  readonly spec?: string | undefined;
  /** Called once when the session settles; the profile-create completion hook lives here. */
  readonly onSettled?: ((detail: EngineSessionDetail) => Effect.Effect<void>) | undefined;
}

/**
 * Dispatch a fresh session through the engine: `Store.create` + `start`,
 * then a live Pi session whose events stream into the store. The engine
 * detaches the prompt, so this resolves as soon as the session is registered.
 * Tool allowlists default to {@link DEFAULT_SESSION_TOOLS} so a workspace session
 * never silently regains Pi's `bash` default.
 * @param root - workspace root (store and session owner)
 * @param input - session id, display name, prompt, optional model/tools pins, and parentage/hook
 * @returns Effect resolving to the running row, failing with displayable message
 */
export const startSession = (
  root: string,
  input: StartSessionInput,
): Effect.Effect<SessionSummary, string> =>
  withSessionRunner(root, (runner) =>
    runner
      .start({
        root,
        id: input.id,
        name: input.name,
        prompt: input.prompt,
        model: input.model,
        tools: input.tools ?? DEFAULT_SESSION_TOOLS,
        parent: input.parent,
        related: input.related,
        spec: input.spec,
        onSettled: input.onSettled,
      })
      .pipe(Effect.map(fromSession)),
  ).pipe(Effect.catch((reason) => Effect.fail(surfaceSessionFailure(reason))));

/**
 * Steer a live session. Pi delivers the steering turn after the in-flight
 * tool results; the engine mirrors it as a user event.
 * @param root - workspace root (store and session owner)
 * @param id - session id
 * @param text - steering message
 * @returns Effect completing once forwarded, failing with displayable message
 */
export const steerSession = (root: string, id: string, text: string): Effect.Effect<void, string> =>
  withSessionRunner(root, (runner) => runner.steer(root, id, text));

/**
 * Answer a parked session: the engine unparks it and resolves the awaiting
 * `ask_user` call — the answer travels in the tool result, so nothing is
 * relaunched.
 * @param root - workspace root (store and session owner)
 * @param id - session id
 * @param text - user answer
 * @returns Effect completing once the ask is released, failing with displayable message
 */
export const answerSession = (
  root: string,
  id: string,
  text: string,
): Effect.Effect<void, string> =>
  withSessionRunner(root, (runner) => runner.answer(root, id, text));

/**
 * Interrupt a live session: the engine aborts the session, releases any
 * parked ask, and writes the cancelled receipt. A stale live session with
 * no active runner is cancelled through the store.
 * @param root - workspace root (store and session owner)
 * @param id - session id
 * @returns Effect completing once cancelled, failing with displayable message
 */
export const interruptSession = (root: string, id: string): Effect.Effect<void, string> =>
  withSessionRunner(root, (runner) => runner.interrupt(root, id));

/**
 * Resume a settled or interrupted session from its stored transcript,
 * optionally with a continuation prompt. Pass `onSettled` to re-attach a
 * completion hook after an app restart — the engine holds hooks in memory
 * only, so a resumed author session otherwise settles unobserved.
 * @param root - workspace root (store and session owner)
 * @param id - session id
 * @param prompt - continuation prompt, if any
 * @param onSettled - completion hook re-attached for the resumed session
 * @returns Effect resolving to the resumed row, failing with displayable message
 */
export const resumeSession = (
  root: string,
  id: string,
  prompt?: string,
  onSettled?: (detail: EngineSessionDetail) => Effect.Effect<void>,
): Effect.Effect<SessionSummary, string> =>
  withSessionRunner(root, (runner) =>
    runner.resume(root, id, prompt, onSettled).pipe(Effect.map(fromSession)),
  ).pipe(Effect.catch((reason) => Effect.fail(surfaceSessionFailure(reason))));
