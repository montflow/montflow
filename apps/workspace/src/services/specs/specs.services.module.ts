// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: specs live under .agents/@montflow/specs; migrate to FileSystem when the app moves onto the platform layer graph.
import { readdir, readFile, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for spec files; both go away with the FileSystem migration.
import { join } from 'node:path';
import type { SessionDetail as EngineSessionDetail } from '@montflow/pi-sessions';
import { Data, Effect } from 'effect';
import * as Sessions from '../sessions/index.js';

/**
 * Lazy handles to the pi-specs and pi-reviews runtimes. Static imports are
 * type-only (erased at build) — the runtimes resolve here, on first use, never
 * at dashboard boot. A missing extension surfaces as a toast, not a crash.
 */
type PiSpecsLib = typeof import('@montflow/pi-specs');
type PiReviewsLib = typeof import('@montflow/pi-reviews');

/** Failure loading the pi-specs runtime. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/SpecsExtensionLoadError')<{
  readonly message: string;
}> {}

/** Cached extension module promises. Cleared on failure so retrying reloads them. */
let cachedLib: Promise<PiSpecsLib> | undefined;
let cachedReviews: Promise<PiReviewsLib> | undefined;

/** Test hook: drop the cached runtimes so the next load re-imports. */
export const resetExtensionCache = (): void => {
  cachedLib = undefined;
  cachedReviews = undefined;
};

/**
 * Load the pi-specs runtime as an Effect, caching the module across
 * flows.
 * @returns Effect resolving to the extension module namespace
 */
export const loadPiSpecs = (): Effect.Effect<PiSpecsLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => {
      cachedLib ??= import('@montflow/pi-specs').then(
        (libs) => libs,
        (cause: unknown) => {
          cachedLib = undefined;
          throw cause;
        },
      );
      return cachedLib;
    },
    catch: (cause) =>
      new ExtensionLoadError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

/**
 * Load the pi-reviews runtime, caching the module across flows. Used only to
 * read a round's `Phase:` attribution through its single-owner parser.
 * @returns a promise resolving to the pi-reviews module namespace
 */
const loadPiReviews = async (): Promise<PiReviewsLib> => {
  cachedReviews ??= import('@montflow/pi-reviews').then(
    (libs) => libs,
    (cause: unknown) => {
      cachedReviews = undefined;
      throw cause;
    },
  );
  return cachedReviews;
};

/** One file inside a spec directory, POSIX-relative to the spec root. */
export interface SnapshotFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Absolute specs directory for a working directory:
 * `<cwd>/.agents/@montflow/specs`.
 * @param root - workspace root
 * @returns absolute specs directory
 */
export const specsDir = (root: string): string => join(root, '.agents', '@montflow', 'specs');

/** Absolute reviews directory for a working directory: `<cwd>/.agents/@montflow/reviews`. */
export const reviewsDir = (root: string): string => join(root, '.agents', '@montflow', 'reviews');

/** One round of a linked review series, with its phase attribution when set. */
export interface ReviewSeriesRound {
  /** Round directory name, e.g. `001`. */
  readonly round: string;
  /** The phase the round reviews (its `- Phase:` metadata), when set. */
  readonly phase?: string | undefined;
}

/** A spec's linked review series, as the review store lays it out. */
export interface ReviewSeries {
  /** Series directory name (`<spec>` or `<spec>-<profile>`). */
  readonly name: string;
  /** The series' rounds, each carrying its phase attribution when set. */
  readonly rounds: ReadonlyArray<ReviewSeriesRound>;
}

/**
 * Read the review series linked to a spec: the default series plus one per
 * declared reviewer profile, in declared order. Only three-digit round
 * directories count, so a stray `README.md` or a legacy `<code>.md` file never
 * masquerades as a round; each round's `Phase:` attribution is read through
 * `@montflow/pi-reviews`' single-owner parser. A series directory that does not
 * exist is omitted, so the link verifier can tell "absent" from "present, no
 * round". Never fails on a missing series.
 * @param root - workspace root (review store owner)
 * @param name - spec directory slug
 * @param libs - loaded pi-specs runtime (series naming)
 * @param files - the spec's files as read from disk (review-task profiles)
 * @returns the existing linked series, default first
 */
export const readReviewSeries = async (
  root: string,
  name: string,
  libs: PiSpecsLib,
  files: ReadonlyArray<SnapshotFile>,
): Promise<ReadonlyArray<ReviewSeries>> => {
  const reviews = await loadPiReviews();
  const profiles = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => libs.Task.parseTaskFile(file.content))
    .flatMap((task) => (task === undefined || task.type !== 'review' ? [] : task.reviewerProfiles));
  const names = [...new Set(libs.ReviewLink.seriesNames(name, profiles))];
  const read = await Promise.all(
    names.map(async (series): Promise<ReviewSeries | undefined> => {
      const dir = join(reviewsDir(root), series);
      const entries = await readdir(dir).catch(() => undefined);
      if (entries === undefined) return undefined;
      const rounds = await Promise.all(
        entries
          .filter((entry) => reviews.Review.isValidRound(entry))
          .toSorted()
          .map(async (round): Promise<ReviewSeriesRound> => {
            const raw = await readFile(join(dir, round, reviews.Review.FILE_NAME), 'utf8').catch(
              () => undefined,
            );
            const phase =
              raw === undefined
                ? undefined
                : reviews.Review.parseRound(round, raw).metadata['Phase'];
            return phase === undefined || phase === '' ? { round } : { round, phase };
          }),
      );
      return { name: series, rounds };
    }),
  );
  return read.filter((series): series is ReviewSeries => series !== undefined);
};

/**
 * True when the specs directory exists.
 * @param root - workspace root
 * @returns installed flag, never fails
 */
export const specsInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(specsDir(root)).then(
      () => true,
      () => false,
    ),
  );

/** Read every file under one spec directory as POSIX-relative paths. */
const readSnapshot = async (root: string, name: string): Promise<ReadonlyArray<SnapshotFile>> => {
  const dir = join(specsDir(root), name);
  const entries = await readdir(dir, { recursive: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<SnapshotFile | undefined> => {
      const absolute = join(dir, entry);
      const info = await stat(absolute);
      if (!info.isFile()) return undefined;
      return {
        path: entry.split('\\').join('/'),
        content: await readFile(absolute, 'utf8'),
      };
    }),
  );
  return files.filter((file): file is SnapshotFile => file !== undefined);
};

/** One spec row for the dashboard list. */
export interface SpecSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: string;
  readonly status: string;
  /** True when a live session is bound to this spec. */
  readonly active: boolean;
  readonly total: number;
  readonly complete: number;
  readonly issues: number;
  readonly valid: boolean;
}

/** Task counts keyed by canonical status. */
export type SpecCounts = Readonly<
  Record<'pending' | 'in-progress' | 'complete' | 'blocked', number>
>;

/** One task row inside a spec detail phase. */
export interface SpecTaskRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
}

/** One phase roll-up inside a spec detail. */
export interface SpecPhaseRow {
  readonly phase: string;
  readonly locked: boolean;
  readonly tasks: ReadonlyArray<SpecTaskRow>;
}

/** SPEC.md metadata for the detail header. */
export interface SpecMeta {
  readonly name: string;
  readonly status: string;
  readonly workspaceType: string;
  readonly author: string;
  readonly created: string;
  readonly lockedPhases: ReadonlyArray<string>;
  readonly description: string;
}

/** One verification issue shown in the detail. */
export interface SpecIssue {
  readonly field: string;
  readonly message: string;
}

/** Full spec detail: header metadata, per-phase tasks, and issues. */
export interface SpecDetail {
  readonly summary: SpecSummary;
  readonly meta: SpecMeta | undefined;
  readonly state: string;
  readonly counts: SpecCounts;
  readonly phases: ReadonlyArray<SpecPhaseRow>;
  readonly issues: ReadonlyArray<SpecIssue>;
}

/** Staged boot phase behind the specs-panel Loader. */
export type SpecsPhase = 'extension' | 'specs';

const EMPTY_COUNTS = {
  pending: 0,
  'in-progress': 0,
  complete: 0,
  blocked: 0,
} satisfies SpecCounts;

/** First non-empty line of the `## Description` section. */
const descriptionOf = (content: string): string => {
  const match = /^## Description\s*\n+([^\n#].*)$/m.exec(content);
  return match?.[1]?.trim() ?? '';
};

/** Phase prefix of a task id, e.g. `AA012` → `AA`. */
const phaseOf = (id: string): string => id.replace(/\d+$/, '');

/** Parsed pieces shared by the summary and the detail builders. */
const inspect = (
  libs: PiSpecsLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
  active: boolean,
  review: ReadonlyArray<ReviewSeries>,
) => {
  const specFile = files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : libs.Spec.parseSpecFile(specFile.content);
  const tasks = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => libs.Task.parseTaskFile(file.content))
    .filter((task) => task !== undefined);
  const verify = libs.Structure.verifySpecTree({ name: id, files }, review);
  const analysis =
    spec === undefined
      ? undefined
      : libs.Lifecycle.analyze({
          status: spec.status,
          lockedPhases: spec.lockedPhases,
          tasks: tasks.map((task) => ({ id: task.id, status: task.status })),
          active,
        });
  return { spec, specFile, tasks, verify, analysis };
};

/** Bridge one spec directory into a dashboard row. Total by construction. */
const summarize = (
  libs: PiSpecsLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
  active: boolean,
  review: ReadonlyArray<ReviewSeries>,
): SpecSummary => {
  const { spec, specFile, tasks, verify, analysis } = inspect(libs, id, files, active, review);
  return {
    id,
    name: spec?.name ?? id,
    description: descriptionOf(specFile?.content ?? '') || (spec?.name ?? id),
    state: analysis?.state ?? 'inconsistent',
    status: spec?.status ?? 'unknown',
    active,
    total: tasks.length,
    complete: tasks.filter((task) => task.status === 'complete').length,
    issues: verify.issues.length,
    valid: verify.valid,
  };
};

/**
 * Spec slugs with a live session bound: persisted sessions whose `spec` is
 * set and whose id is in the runner's live registry. A missing sessions store
 * or an unbuilt runtime reads as empty, never an error.
 * @param root - workspace root (sessions store and runner owner)
 * @returns Effect resolving to the active spec slugs
 */
export const activeSpecIds = (root: string): Effect.Effect<ReadonlySet<string>> =>
  Effect.gen(function* () {
    const sessions = yield* Sessions.fetchSessions(root).pipe(Effect.orElseSucceed(() => []));
    const live = yield* Sessions.liveSessionIds(root).pipe(
      Effect.orElseSucceed(() => new Set<string>()),
    );
    return new Set(
      sessions
        .filter((session) => session.spec !== '' && live.has(session.id))
        .map((session) => session.spec),
    );
  });

/** List every spec directory as a summary row, alphabetical. */
const readSpecs = async (
  root: string,
  libs: PiSpecsLib,
  active: ReadonlySet<string>,
): Promise<ReadonlyArray<SpecSummary>> => {
  const dir = specsDir(root);
  const entries = await readdir(dir);
  const names = entries.filter((entry) => !entry.startsWith('.')).toSorted();
  const rows = await Promise.all(
    names.map(async (name): Promise<SpecSummary | undefined> => {
      const info = await stat(join(dir, name));
      if (!info.isDirectory()) return undefined;
      const files = await readSnapshot(root, name);
      const review = await readReviewSeries(root, name, libs, files);
      return summarize(libs, name, files, active.has(name), review);
    }),
  );
  return rows.filter((row): row is SpecSummary => row !== undefined);
};

/**
 * Spec rows for the TUI boot: load the extension runtime, then list
 * and verify every spec directory. A missing directory reads as an
 * empty list so the panel shows its empty note instead of an error.
 * @param root - workspace root (specs directory owner)
 * @returns Effect resolving to summary rows, failing with displayable message
 */
export const fetchSpecs = (root: string): Effect.Effect<ReadonlyArray<SpecSummary>, string> =>
  loadPiSpecs().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const active = yield* activeSpecIds(root);
        return yield* Effect.tryPromise({
          try: () => readSpecs(root, libs, active),
          catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
        });
      }),
    ),
    Effect.catch((error) =>
      error.includes('ENOENT') || error.includes('no such file')
        ? Effect.succeed<ReadonlyArray<SpecSummary>>([])
        : Effect.fail(error),
    ),
  );

/**
 * Load one spec for the detail page: header metadata, per-phase
 * tasks, verification issues, and the derived lifecycle state.
 * @param root - workspace root (specs directory owner)
 * @param id - spec directory name
 * @returns Effect resolving to the detail, failing with displayable message
 */
export const loadSpec = (root: string, id: string): Effect.Effect<SpecDetail, string> =>
  loadPiSpecs().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const active = yield* activeSpecIds(root);
        const isActive = active.has(id);
        return yield* Effect.tryPromise({
          try: async (): Promise<SpecDetail> => {
            const files = await readSnapshot(root, id);
            const review = await readReviewSeries(root, id, libs, files);
            const { spec, specFile, tasks, verify, analysis } = inspect(
              libs,
              id,
              files,
              isActive,
              review,
            );
            const phases = (analysis?.phases ?? []).map((phase) => ({
              phase: phase.phase,
              locked: phase.locked,
              tasks: tasks
                .filter((task) => phaseOf(task.id) === phase.phase)
                .map((task) => ({
                  id: task.id,
                  name: task.name,
                  type: task.type,
                  status: task.status,
                })),
            }));
            return {
              summary: summarize(libs, id, files, isActive, review),
              meta:
                spec === undefined
                  ? undefined
                  : {
                      name: spec.name,
                      status: spec.status,
                      workspaceType: spec.workspaceType,
                      author: spec.author,
                      created: spec.created,
                      lockedPhases: spec.lockedPhases,
                      description: descriptionOf(specFile?.content ?? ''),
                    },
              state: analysis?.state ?? 'inconsistent',
              counts: analysis?.counts ?? EMPTY_COUNTS,
              phases,
              issues: verify.issues,
            };
          },
          catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
        });
      }),
    ),
  );

/**
 * Raw spec directory names under the specs root, regardless of
 * decode validity. Used to snapshot the store at dispatch and to find the
 * spec an author session created after it settles. Dotfiles are skipped.
 * @param root - workspace root (specs store owner)
 * @returns Effect resolving to directory names (empty when the store is missing)
 */
export const rawSpecIds = (root: string): Effect.Effect<ReadonlyArray<string>> =>
  Effect.promise((): Promise<ReadonlyArray<string>> =>
    readdir(specsDir(root)).then(
      (names) => names.filter((name) => !name.startsWith('.')),
      () => [],
    ),
  );

/**
 * Tool allowlist for a spec-author session: the standard workspace set plus
 * `bash`, so the agent can run the mechanical checker before finishing.
 * `@montflow/pi-sessions` unions the interaction tools (`ask_user` /
 * `notify_user`) into whatever allowlist is passed.
 */
export const SPEC_SESSION_TOOLS = ['read', 'write', 'edit', 'bash'] as const;

/** One transcript line, shared by the engine detail and the dashboard row. */
interface TranscriptLine {
  readonly role: string;
  readonly text: string;
}

/**
 * Final assistant text from a settled session's transcript, or undefined when
 * the session produced no assistant turn.
 * @param events - stored transcript events
 * @returns last assistant text, if any
 */
export const finalAssistantText = (events: ReadonlyArray<TranscriptLine>): string | undefined =>
  events.findLast((event) => event.role === 'assistant')?.text;

/** How a settled author session's spec was resolved. */
export type AuthoredSpecPick =
  | { readonly kind: 'one'; readonly id: string }
  | { readonly kind: 'ambiguous'; readonly ids: ReadonlyArray<string> }
  | { readonly kind: 'none' };

/**
 * Resolve the spec a settled author session created. Prefers the fresh
 * spec named in the session's final reply — correlating concurrent authors
 * to their own session — and falls back to the name diff only when exactly one
 * fresh spec exists (unambiguous).
 * @param reply - final assistant text from the session, if any
 * @param fresh - spec directory ids added since the session was dispatched
 * @returns the chosen spec, an ambiguity, or none
 */
export const pickAuthoredSpec = (
  reply: string | undefined,
  fresh: ReadonlyArray<string>,
): AuthoredSpecPick => {
  if (fresh.length === 0) return { kind: 'none' };
  const named = reply === undefined ? [] : fresh.filter((id) => reply.includes(id));
  if (named.length === 1) {
    const id = named[0];
    if (id !== undefined) return { kind: 'one', id };
  }
  if (fresh.length === 1) {
    const id = fresh[0];
    if (id !== undefined) return { kind: 'one', id };
  }
  return { kind: 'ambiguous', ids: fresh.toSorted() };
};

/**
 * TUI callbacks for a dispatched author session's completion: the fresh
 * spec was found (refresh + open its detail), or the session settled
 * without one (surface the reason). The session id lets the TUI clear only the
 * matching dispatched-session keybind target.
 */
export interface BeginFlowHooks {
  /** Fresh spec found after the author session settled. */
  readonly onSpecCreated?: ((specId: string, sessionId: string) => void) | undefined;
  /** Author session settled without creating a spec. */
  readonly onSpecFailed?: ((message: string, sessionId: string) => void) | undefined;
}

/**
 * Completion hook for a dispatched author session: resolve the spec the session
 * authored (reply-correlated, name-diff fallback) and notify the hooks.
 * Exported so a resumed author session can re-attach the same hook through
 * `Sessions.resumeSession` after an app restart.
 * @param root - workspace root (specs store owner)
 * @param sessionId - the author session id
 * @param beforeIds - spec directory ids snapshotted at dispatch, or undefined after a restart
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const specAuthorCompletion =
  (
    root: string,
    sessionId: string,
    beforeIds: ReadonlyArray<string> | undefined,
    hooks?: BeginFlowHooks,
  ): ((detail: EngineSessionDetail) => Effect.Effect<void>) =>
  (detail) =>
    Effect.gen(function* () {
      const afterIds = yield* rawSpecIds(root);
      const freshIds = afterIds.filter((id) => !(beforeIds ?? []).includes(id));
      const pick = pickAuthoredSpec(finalAssistantText(detail.events), freshIds);
      if (pick.kind === 'one') {
        hooks?.onSpecCreated?.(pick.id, sessionId);
        return;
      }
      if (pick.kind === 'ambiguous') {
        hooks?.onSpecFailed?.(
          `Session '${sessionId}' created several specs (${pick.ids.join(', ')}) — open the one you want from the list.`,
          sessionId,
        );
        return;
      }
      hooks?.onSpecFailed?.(
        `Session '${sessionId}' finished without creating a spec — try describing it differently.`,
        sessionId,
      );
    });

/** Inputs for dispatching a spec-author session. */
export interface BeginSpecInput {
  /** The user's spec request. */
  readonly description: string;
  /** `provider/model-id` pin for the author session, if any. */
  readonly modelLabel?: string | undefined;
  /** TUI completion callbacks, if any. */
  readonly hooks?: BeginFlowHooks | undefined;
}

/**
 * Begin a spec from the workspace: gate on the sessions extension, snapshot
 * the specs store, dispatch an author session through the pi-sessions engine
 * with the authoring preprompt, and return its id. The session may park on
 * `ask_user` for the user to answer; on settle,
 * {@link specAuthorCompletion} correlates the fresh spec to this
 * session's final reply. The session, not this flow, writes the spec.
 * @param root - workspace root (specs store owner)
 * @param input - spec request, optional model pin, and completion hooks
 * @returns Effect resolving to the dispatched session id, failing with displayable message
 */
export const beginSpec = (
  root: string,
  input: BeginSpecInput,
): Effect.Effect<{ readonly sessionId: string }, string> =>
  loadPiSpecs().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) => {
      const prompt = libs.Prompt.buildAuthorPrompt(input.description);
      return Effect.gen(function* () {
        const installed = yield* Sessions.sessionsExtensionInstalled(root);
        if (!installed) return yield* Effect.fail(Sessions.SESSIONS_EXTENSION_INSTALL_HINT);
        const beforeIds = yield* rawSpecIds(root);
        const sessionId = yield* Sessions.newSessionId('author-spec');
        yield* Sessions.startSession(root, {
          id: sessionId,
          name: `Author spec: ${input.description.trim().slice(0, 72)}`,
          prompt,
          model: input.modelLabel,
          tools: [...SPEC_SESSION_TOOLS],
          onSettled: specAuthorCompletion(root, sessionId, beforeIds, input.hooks),
        });
        return { sessionId };
      });
    }),
  );

/**
 * Tool allowlist for a spec-execution session. Same shape as the author session —
 * `bash` so the orchestrator can run the mechanical checker — plus the
 * `session_*` tools it needs to spawn and supervise worker sessions. An explicit
 * allowlist filters extension tools too, so {@link Sessions.SESSION_TOOL_NAMES}
 * must be named or the orchestrator cannot dispatch.
 */
export const SPEC_EXECUTE_TOOLS = ['read', 'write', 'edit', 'bash'] as const;

/**
 * Render the state context a resume session needs: derived state, the active
 * phase, every task with its type and status, and the convention link of
 * each phase's review task to its round in every expected series (marking a
 * missing round). Built from the on-disk snapshot so the orchestrator starts
 * from the files, never from conversation memory.
 * @param libs - loaded extension runtime
 * @param id - spec directory slug
 * @param files - the spec's files as read from disk
 * @param review - the linked review series (default first)
 * @returns the context block injected under `Spec: <name>`
 */
export const buildResumeContext = (
  libs: PiSpecsLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
  review: ReadonlyArray<ReviewSeries>,
): string => {
  const specFile = files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : libs.Spec.parseSpecFile(specFile.content);
  const tasks = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => libs.Task.parseTaskFile(file.content))
    .filter((task) => task !== undefined)
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const analysis =
    spec === undefined
      ? undefined
      : libs.Lifecycle.analyze({
          status: spec.status,
          lockedPhases: spec.lockedPhases,
          tasks: tasks.map((task) => ({ id: task.id, status: task.status })),
        });

  const lines: Array<string> = [];
  lines.push(`State: ${analysis?.state ?? 'unreadable'}.`);
  if (spec !== undefined) {
    lines.push(`Status: ${spec.status}.`);
    lines.push(
      `Locked phases: ${spec.lockedPhases.length === 0 ? 'none' : spec.lockedPhases.join(', ')}.`,
    );
  }
  const active = analysis?.phases.find((phase) => !phase.locked && phase.complete < phase.total);
  lines.push(`Active phase: ${active?.phase ?? 'none'}.`);
  lines.push('', 'Tasks:');
  for (const task of tasks) {
    lines.push(`- ${task.id} [${task.type}] ${task.status} — ${task.name}`);
  }

  const reviewTasks = tasks.map((task) => ({
    id: task.id,
    type: task.type,
    reviewerProfiles: task.reviewerProfiles,
  }));
  lines.push(
    '',
    'Phase reviews (one series per reviewer profile: `<spec>` or `<spec>-<profile>`):',
  );
  for (const phase of libs.ReviewLink.reviewPhases(reviewTasks)) {
    const preferred = libs.ReviewLink.roundForPhase(phase);
    const profiles =
      reviewTasks.find((task) => task.type === 'review' && phaseOf(task.id) === phase)
        ?.reviewerProfiles ?? [];
    for (const series of libs.ReviewLink.seriesNames(id, profiles)) {
      const attributed = review
        .find((snapshot) => snapshot.name === series)
        ?.rounds.find((roundSnapshot) => roundSnapshot.phase === phase);
      const round = attributed?.round ?? preferred;
      lines.push(
        `- phase ${phase} → .agents/@montflow/reviews/${series}/${round}${attributed === undefined ? ' (missing)' : ''}`,
      );
    }
  }

  return lines.join('\n');
};

/**
 * TUI callback for a dispatched execute session's completion: the session settled,
 * so the TUI refreshes the spec and toasts the outcome. Absent in headless
 * tests.
 */
export interface ExecuteFlowHooks {
  /** Resume session settled; `message` is a one-line outcome for the toast. */
  readonly onSpecSettled?:
    | ((specId: string, sessionId: string, message: string) => void)
    | undefined;
}

/**
 * Completion hook for a dispatched resume session: report the outcome to the
 * TUI so the spec detail and sessions list refresh. The session writes the spec
 * files; this hook never touches them.
 * @param specId - the spec the session executes
 * @param sessionId - the resume session id
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const specExecuteCompletion =
  (
    specId: string,
    sessionId: string,
    hooks?: ExecuteFlowHooks,
  ): ((detail: EngineSessionDetail) => Effect.Effect<void>) =>
  (detail) =>
    Effect.sync(() => {
      const outcome = detail.receipt?.outcome ?? 'done';
      const summary = detail.receipt?.summary ?? '';
      hooks?.onSpecSettled?.(
        specId,
        sessionId,
        `Session '${sessionId}' ${outcome}: ${summary}`.trim(),
      );
    });

/** Inputs for dispatching a spec-execution session. */
export interface ExecuteSpecInput {
  /** Spec directory slug to execute. */
  readonly id: string;
  /** `provider/model-id` pin for the resume session, if any. */
  readonly modelLabel?: string | undefined;
  /** TUI completion callbacks, if any. */
  readonly hooks?: ExecuteFlowHooks | undefined;
}

/**
 * Execute a spec from the workspace: gate on the sessions extension, read the
 * spec snapshot, build the resume prompt from its state, and dispatch a
 * resume session through the pi-sessions engine tagged with `spec` so the lifecycle
 * reads `in-progress`. The session orchestrates the phases (closing each with its
 * review round) and may park on `ask_user`; on settle,
 * {@link specExecuteCompletion} refreshes the TUI.
 * @param root - workspace root (specs and sessions store owner)
 * @param input - spec id, optional model pin, and completion hooks
 * @returns Effect resolving to the dispatched session id, failing with displayable message
 */
export const executeSpec = (
  root: string,
  input: ExecuteSpecInput,
): Effect.Effect<{ readonly sessionId: string }, string> =>
  loadPiSpecs().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const installed = yield* Sessions.sessionsExtensionInstalled(root);
        if (!installed) return yield* Effect.fail(Sessions.SESSIONS_EXTENSION_INSTALL_HINT);
        const files = yield* Effect.tryPromise({
          try: () => readSnapshot(root, input.id),
          catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
        });
        const review = yield* Effect.promise(() => readReviewSeries(root, input.id, libs, files));
        const prompt = libs.Prompt.buildResumePrompt(
          input.id,
          buildResumeContext(libs, input.id, files, review),
        );
        const sessionId = yield* Sessions.newSessionId(`execute-${input.id}`);
        yield* Sessions.startSession(root, {
          id: sessionId,
          name: `Execute spec: ${input.id}`,
          prompt,
          model: input.modelLabel,
          tools: [...SPEC_EXECUTE_TOOLS, ...Sessions.SESSION_TOOL_NAMES],
          spec: input.id,
          onSettled: specExecuteCompletion(input.id, sessionId, input.hooks),
        });
        return { sessionId };
      }),
    ),
  );
