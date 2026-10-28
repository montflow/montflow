// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/@montflow/prompts; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for prompt files; both go away with the FileSystem migration.
import { join } from 'node:path';
import type { Prompts } from '@montflow/prompts';
import { Data, Effect } from 'effect';

/**
 * Lazy handle to the prompts extension runtime. Static imports from
 * `@montflow/prompts` are type-only (erased at build) — the runtime
 * resolves here, on first flow use, never at dashboard boot. A broken
 * or missing extension therefore cannot crash the TUI; the failing
 * flow surfaces the load error as a toast instead.
 */
type PromptsLib = typeof import('@montflow/prompts');

/** Failure loading the prompts extension runtime. `cause` classifies the import rejection. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/PromptsExtensionLoadError')<{
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
      return 'Prompts extension download failed (network) — check the connection, then retry.';
    case 'missing':
      return 'Prompts extension not found — reinstall the workspace dependencies, then retry.';
    default:
      return 'Prompts extension failed to load — reinstall the workspace dependencies, then retry.';
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
let cachedLib: Promise<PromptsLib> | undefined;

/** The resolved extension runtime, once a flow has loaded it. Backs the synchronous picker matcher below. */
let liveLib: PromptsLib | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<PromptsLib> => {
  cachedLib ??= import('@montflow/prompts').then(
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
 * Load the prompts extension runtime as an Effect, caching the module
 * across flows. The dynamic import is the only Promise in the chain —
 * every rejection is classified (network vs missing vs unknown) into
 * an `ExtensionLoadError`, and failures clear the cache so a retry
 * re-imports.
 * @returns Effect resolving to the extension module namespace
 */
export const loadPrompts = (): Effect.Effect<PromptsLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => importOnce(),
    catch: (cause) => (cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause)),
  });

/**
 * The loaded extension runtime, if any flow has loaded it yet.
 * @returns the extension module namespace, or undefined before first load
 */
export const loadedPrompts = (): PromptsLib | undefined => liveLib;

/**
 * The shared subsequence matcher for the TUI filter picker, once a flow
 * has loaded it. The picker only opens mid-flow (after a successful
 * load), so callers fall back to unfiltered rows before that.
 * @returns matcher, or undefined before first load
 */
export const loadedMatcher = (): ((label: string, query: string) => boolean) | undefined =>
  liveLib?.Interactive.matchesFilter;

/**
 * Require the extension runtime inside flows: load failures become
 * string errors the TUI toasts (install, then retry).
 * @returns Effect resolving to the extension module namespace
 */
const loadLibs = (): Effect.Effect<PromptsLib, string> =>
  loadPrompts().pipe(Effect.mapError((error) => error.message));

/**
 * One prompt row for the dashboard list and detail views. Mirrors
 * `Prompts.Prompt` with an `id` alias (the slug). `variables` carries the full
 * `Variable` records rather than bare names, so a row that round-trips through
 * the editor keeps each variable's `required`, `default`, `label`, and `type`
 * instead of silently rewriting them to "required, no default".
 */
export interface PromptSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly template: string;
  readonly variables: ReadonlyArray<Prompts.Variable>;
  readonly skills: ReadonlyArray<string>;
  readonly model: string;
}

/**
 * Bridge a `Prompts.Prompt` into a dashboard row. Total — the prompt
 * already carries every field.
 * @param prompt - stored prompt
 * @returns dashboard row
 */
export const fromPrompt = (prompt: Prompts.Prompt): PromptSummary => ({
  id: prompt.name,
  name: prompt.name,
  description: prompt.description,
  template: prompt.template,
  variables: [...prompt.variables],
  skills: [...prompt.skills],
  model: prompt.model,
});

/**
 * Bridge a dashboard row back into a `Prompts.Prompt` for the shared
 * interactive flows. Takes the lazily loaded runtime — no static extension
 * dependency.
 * @param libs - loaded extension runtime
 * @param row - dashboard prompt row
 * @returns Effect resolving to the Prompt, failing on invalid rows
 */
export const toPrompt = (
  libs: PromptsLib,
  row: PromptSummary,
): Effect.Effect<Prompts.Prompt, string> =>
  libs.Prompts.decodeUnknown({
    name: row.name,
    description: row.description,
    template: row.template,
    variables: [...row.variables],
    skills: [...row.skills],
    model: row.model,
  }).pipe(Effect.mapError(() => `Invalid prompt '${row.id}'.`));

/** Directory segments (under the workspace root) owning the prompt store. */
const PROMPTS_DIR = ['.agents', '@montflow', 'prompts'] as const;

/** Retired prompt-store segments; read-only fallback until `doctor` migrates. */
const LEGACY_PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/**
 * Root the panel reads. Mirrors `PromptStore.storeLayout`: the current store
 * wins, the retired store is a read-only fallback while it is the only one.
 * @param root - workspace root
 * @returns absolute directory to read prompt files from
 */
const dirExists = (dir: string): Promise<boolean> =>
  stat(dir).then(
    () => true,
    () => false,
  );

const readPromptsRoot = (root: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const current = join(root, ...PROMPTS_DIR);
    const legacy = join(root, ...LEGACY_PROMPTS_DIR);
    if (await dirExists(current)) return current;
    return (await dirExists(legacy)) ? legacy : current;
  });

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. Mirrors the prompt file slug without loading the runtime. */
export const PROMPT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * True when `id` is a safe prompt file name (no traversal, no blanks).
 * @param id - candidate prompt slug
 * @returns true for safe ids
 */
export const isValidPromptId = (id: string): boolean =>
  id.length >= 1 && id.length <= 64 && PROMPT_SLUG_PATTERN.test(id);

/** Failure when deleting a prompt file fails. Carries the reason. */
export class DeleteError extends Data.TaggedError('@montflow/PromptsDeleteError')<{
  readonly message: string;
}> {}

/**
 * Delete a workspace prompt by removing its file under the store the panel
 * reads (`prompts/`, or the retired store directory until migration). Refuses
 * blank or traversing ids so a bad keybind target can never escape the store.
 * @param root - workspace root (prompt store owner)
 * @param id - prompt file slug (without `.json`)
 * @returns Effect completing once removed, failing with the reason
 */
export const deletePrompt = (root: string, id: string): Effect.Effect<void, DeleteError> => {
  if (!isValidPromptId(id))
    return Effect.fail(
      new DeleteError({ message: `Refusing to delete unsafe prompt id '${id}'.` }),
    );
  return Effect.gen(function* () {
    const storeRoot = yield* readPromptsRoot(root);
    yield* Effect.tryPromise({
      try: () => rm(join(storeRoot, `${id}.json`)).then(() => undefined),
      catch: (cause) =>
        new DeleteError({
          message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
        }),
    });
  });
};

/** Failure when persisting a prompt file fails. Carries the reason. */
export class SaveError extends Data.TaggedError('@montflow/PromptsSaveError')<{
  readonly message: string;
}> {}

/**
 * Persist a prompt row to `<root>/.agents/@montflow/prompts/<id>.json`,
 * creating the directory as needed. Writes always target the current store so
 * an edit made in the dashboard converges the workspace with the CLI. Encodes
 * through the lazily loaded runtime so both hosts produce identical files.
 * @param root - workspace root (prompt store owner)
 * @param row - prompt row to persist
 * @returns Effect completing once written, failing with the reason
 */
export const savePrompt = (root: string, row: PromptSummary): Effect.Effect<void, SaveError> =>
  Effect.gen(function* () {
    const libs = yield* loadLibs().pipe(Effect.mapError((message) => new SaveError({ message })));
    const prompt = yield* toPrompt(libs, row).pipe(
      Effect.mapError((message) => new SaveError({ message })),
    );
    const encoded = libs.Prompts.encode(prompt);
    const storeRoot = yield* readPromptsRoot(root);
    const target = join(root, ...PROMPTS_DIR);
    yield* Effect.tryPromise({
      try: () =>
        (storeRoot === target ? Promise.resolve() : rename(storeRoot, target))
          .then(() => mkdir(target, { recursive: true }))
          .then(() =>
            writeFile(
              join(target, `${row.id}.json`),
              `${JSON.stringify(encoded, null, 2)}\n`,
              'utf8',
            ),
          )
          .then(() => undefined),
      catch: (cause) =>
        new SaveError({
          message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
        }),
    });
  });

/** Staged boot phase behind the prompts-panel Loader: extension import, then the prompt-list read. */
export type PromptsPhase = 'extension' | 'prompts';

/** Directory read outcome: names when the store exists, empty when it vanished mid-flight. */
interface DirEntries {
  readonly installed: boolean;
  readonly names: ReadonlyArray<string>;
}

/**
 * Read the store directory, never failing: a missing directory reads as
 * not-installed with no names (the caller owns the missing message).
 * @param root - workspace root (prompt store owner)
 * @returns Effect resolving to the install flag plus entry names
 */
const readEntries = (root: string): Effect.Effect<DirEntries> =>
  readPromptsRoot(root).pipe(
    Effect.flatMap((storeRoot) =>
      Effect.promise(() =>
        readdir(storeRoot).then(
          (names): DirEntries => ({
            installed: true,
            names: names.filter((name) => name.endsWith('.json')),
          }),
          (): DirEntries => ({ installed: false, names: [] }),
        ),
      ),
    ),
  );

/**
 * Decode one prompt file's rows through the loaded runtime. Malformed
 * files read as undefined so the list skips them.
 * @param libs - loaded extension runtime
 * @param file - prompt file name (with `.json`)
 * @param raw - raw file contents
 * @returns Effect resolving to the row, or undefined when undecodable
 */
const decodeRow = (
  libs: PromptsLib,
  file: string,
  raw: string,
): Effect.Effect<PromptSummary | undefined> =>
  // SAFETY: `JSON.parse` returns `any`; narrow to `unknown` so the `Prompt` schema validates it at the boundary below.
  Effect.try(() => JSON.parse(raw) as unknown).pipe(
    Effect.flatMap((json) =>
      libs.Prompts.decodeUnknown(json).pipe(
        Effect.map(fromPrompt),
        Effect.orElseSucceed(() => undefined),
      ),
    ),
    Effect.orElseSucceed(() => undefined),
  );

/**
 * Prompt rows for the TUI boot through the loaded prompt module: load
 * the extension runtime, then list the store via file reads decoded with
 * the `Prompt` schema (sorted by name). Malformed files skip so the list
 * stays usable. The caller sets the Loader variant per stage —
 * `extension` while the import runs, `prompts` while the list reads —
 * so boot narrates step by step.
 * @param root - workspace root (prompt store owner)
 * @returns Effect resolving to sorted summary rows, failing with displayable message
 */
export const fetchPrompts = (root: string): Effect.Effect<PromptSummary[], string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      readPromptsRoot(root).pipe(
        Effect.flatMap((storeRoot) =>
          readEntries(root).pipe(
            Effect.flatMap((entries) => {
              if (!entries.installed) {
                const none: Array<PromptSummary> = [];
                return Effect.succeed(none);
              }
              return Effect.forEach(entries.names, (file) =>
                Effect.promise(() =>
                  readFile(join(storeRoot, file), 'utf8').then(
                    (raw) => raw,
                    () => undefined,
                  ),
                ).pipe(
                  Effect.flatMap((raw) =>
                    raw === undefined ? Effect.succeed(undefined) : decodeRow(libs, file, raw),
                  ),
                ),
              ).pipe(
                Effect.map((rows) =>
                  rows
                    .filter((row): row is PromptSummary => row !== undefined)
                    .toSorted((a, b) => a.name.localeCompare(b.name)),
                ),
              );
            }),
          ),
        ),
      ),
    ),
  );
