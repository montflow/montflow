// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: specs live under .agents/@montflow/specs; migrate to FileSystem when the app moves onto the platform layer graph.
import { readdir, readFile, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for spec files; both go away with the FileSystem migration.
import { join } from 'node:path';
import type { RunDetail as EngineRunDetail } from '@montflow/pi-runs';
import { Data, Effect } from 'effect';
import * as Runs from '../runs/index.js';

/**
 * Lazy handle to the pi-specs runtime. Static imports are type-only
 * (erased at build) — the runtime resolves here, on first use, never at
 * dashboard boot. A missing extension surfaces as a toast, not a crash.
 */
type PiSpecsLib = typeof import('@montflow/pi-specs');

/** Failure loading the pi-specs runtime. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/SpecsExtensionLoadError')<{
  readonly message: string;
}> {}

/** Cached extension module promise. Cleared on failure so retrying reloads it. */
let cachedLib: Promise<PiSpecsLib> | undefined;

/** Test hook: drop the cached runtime so the next load re-imports. */
export const resetExtensionCache = (): void => {
  cachedLib = undefined;
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
  /** True when a live run is bound to this spec. */
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
) => {
  const specFile = files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : libs.Spec.parseSpecFile(specFile.content);
  const tasks = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => libs.Task.parseTaskFile(file.content))
    .filter((task) => task !== undefined);
  const verify = libs.Structure.verifySpecTree({ name: id, files });
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
): SpecSummary => {
  const { spec, specFile, tasks, verify, analysis } = inspect(libs, id, files, active);
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
 * Spec slugs with a live run bound: persisted runs whose `spec` is
 * set and whose id is in the runner's live registry. A missing runs store
 * or an unbuilt runtime reads as empty, never an error.
 * @param root - workspace root (runs store and runner owner)
 * @returns Effect resolving to the active spec slugs
 */
export const activeSpecIds = (root: string): Effect.Effect<ReadonlySet<string>> =>
  Effect.gen(function* () {
    const runs = yield* Runs.fetchRuns(root).pipe(Effect.orElseSucceed(() => []));
    const live = yield* Runs.liveRunIds(root).pipe(Effect.orElseSucceed(() => new Set<string>()));
    return new Set(
      runs.filter((run) => run.spec !== '' && live.has(run.id)).map((run) => run.spec),
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
      return summarize(libs, name, await readSnapshot(root, name), active.has(name));
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
            const { spec, specFile, tasks, verify, analysis } = inspect(libs, id, files, isActive);
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
              summary: summarize(libs, id, files, isActive),
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
 * spec an author run created after it settles. Dotfiles are skipped.
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
 * Tool allowlist for a spec-author run: the standard workspace set plus
 * `bash`, so the agent can run the mechanical checker before finishing.
 * `@montflow/pi-runs` unions the interaction tools (`ask_user` /
 * `notify_user`) into whatever allowlist is passed.
 */
export const SPEC_RUN_TOOLS = ['read', 'write', 'edit', 'bash'] as const;

/** One transcript line, shared by the engine detail and the dashboard row. */
interface TranscriptLine {
  readonly role: string;
  readonly text: string;
}

/**
 * Final assistant text from a settled run's transcript, or undefined when
 * the run produced no assistant turn.
 * @param events - stored transcript events
 * @returns last assistant text, if any
 */
export const finalAssistantText = (events: ReadonlyArray<TranscriptLine>): string | undefined =>
  events.findLast((event) => event.role === 'assistant')?.text;

/** How a settled author run's spec was resolved. */
export type AuthoredSpecPick =
  | { readonly kind: 'one'; readonly id: string }
  | { readonly kind: 'ambiguous'; readonly ids: ReadonlyArray<string> }
  | { readonly kind: 'none' };

/**
 * Resolve the spec a settled author run created. Prefers the fresh
 * spec named in the run's final reply — correlating concurrent authors
 * to their own run — and falls back to the name diff only when exactly one
 * fresh spec exists (unambiguous).
 * @param reply - final assistant text from the run, if any
 * @param fresh - spec directory ids added since the run was dispatched
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
 * TUI callbacks for a dispatched author run's completion: the fresh
 * spec was found (refresh + open its detail), or the run settled
 * without one (surface the reason). The run id lets the TUI clear only the
 * matching dispatched-run keybind target.
 */
export interface BeginFlowHooks {
  /** Fresh spec found after the author run settled. */
  readonly onSpecCreated?: ((specId: string, runId: string) => void) | undefined;
  /** Author run settled without creating a spec. */
  readonly onSpecFailed?: ((message: string, runId: string) => void) | undefined;
}

/**
 * Completion hook for a dispatched author run: resolve the spec the run
 * authored (reply-correlated, name-diff fallback) and notify the hooks.
 * Exported so a resumed author run can re-attach the same hook through
 * `Runs.resumeRun` after an app restart.
 * @param root - workspace root (specs store owner)
 * @param runId - the author run id
 * @param beforeIds - spec directory ids snapshotted at dispatch, or undefined after a restart
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const specAuthorCompletion =
  (
    root: string,
    runId: string,
    beforeIds: ReadonlyArray<string> | undefined,
    hooks?: BeginFlowHooks,
  ): ((detail: EngineRunDetail) => Effect.Effect<void>) =>
  (detail) =>
    Effect.gen(function* () {
      const afterIds = yield* rawSpecIds(root);
      const freshIds = afterIds.filter((id) => !(beforeIds ?? []).includes(id));
      const pick = pickAuthoredSpec(finalAssistantText(detail.events), freshIds);
      if (pick.kind === 'one') {
        hooks?.onSpecCreated?.(pick.id, runId);
        return;
      }
      if (pick.kind === 'ambiguous') {
        hooks?.onSpecFailed?.(
          `Run '${runId}' created several specs (${pick.ids.join(', ')}) — open the one you want from the list.`,
          runId,
        );
        return;
      }
      hooks?.onSpecFailed?.(
        `Run '${runId}' finished without creating a spec — try describing it differently.`,
        runId,
      );
    });

/** Inputs for dispatching a spec-author run. */
export interface BeginSpecInput {
  /** The user's spec request. */
  readonly description: string;
  /** `provider/model-id` pin for the author run, if any. */
  readonly modelLabel?: string | undefined;
  /** TUI completion callbacks, if any. */
  readonly hooks?: BeginFlowHooks | undefined;
}

/**
 * Begin a spec from the workspace: gate on the runs extension, snapshot
 * the specs store, dispatch an author run through the pi-runs engine
 * with the authoring preprompt, and return its id. The run may park on
 * `ask_user` for the user to answer; on settle,
 * {@link specAuthorCompletion} correlates the fresh spec to this
 * run's final reply. The run, not this flow, writes the spec.
 * @param root - workspace root (specs store owner)
 * @param input - spec request, optional model pin, and completion hooks
 * @returns Effect resolving to the dispatched run id, failing with displayable message
 */
export const beginSpec = (
  root: string,
  input: BeginSpecInput,
): Effect.Effect<{ readonly runId: string }, string> =>
  loadPiSpecs().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) => {
      const prompt = libs.Prompt.buildAuthorPrompt(input.description);
      return Effect.gen(function* () {
        const installed = yield* Runs.runsExtensionInstalled(root);
        if (!installed) return yield* Effect.fail(Runs.RUNS_EXTENSION_INSTALL_HINT);
        const beforeIds = yield* rawSpecIds(root);
        const runId = yield* Runs.newRunId('author-spec');
        yield* Runs.startRun(root, {
          id: runId,
          name: `Author spec: ${input.description.trim().slice(0, 72)}`,
          prompt,
          model: input.modelLabel,
          tools: [...SPEC_RUN_TOOLS],
          onSettled: specAuthorCompletion(root, runId, beforeIds, input.hooks),
        });
        return { runId };
      });
    }),
  );
