// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/@montflow/pi-prompts; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for prompt files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: shells out to the pi CLI for the session probe; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the session probe shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import type { Interactive as PromptsInteractive, Prompts } from '@montflow/pi-prompts';
import type { RunDetail as EngineRunDetail } from '@montflow/pi-runs';
import { Data, Effect } from 'effect';
import * as Runs from '../runs/index.js';
import * as Skills from '../skills/index.js';

/**
 * Lazy handle to the prompts extension runtime. Static imports from
 * `@montflow/pi-prompts` are type-only (erased at build) — the runtime
 * resolves here, on first flow use, never at dashboard boot. A broken
 * or missing extension therefore cannot crash the TUI; the failing
 * flow surfaces the load error as a toast instead.
 */
type PiPromptsLib = typeof import('@montflow/pi-prompts');

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
let cachedLib: Promise<PiPromptsLib> | undefined;

/** The resolved extension runtime, once a flow has loaded it. Backs the synchronous picker matcher below. */
let liveLib: PiPromptsLib | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<PiPromptsLib> => {
  cachedLib ??= import('@montflow/pi-prompts').then(
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
export const loadPiPrompts = (): Effect.Effect<PiPromptsLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => importOnce(),
    catch: (cause) => (cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause)),
  });

/**
 * The loaded extension runtime, if any flow has loaded it yet.
 * @returns the extension module namespace, or undefined before first load
 */
export const loadedPiPrompts = (): PiPromptsLib | undefined => liveLib;

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
const loadLibs = (): Effect.Effect<PiPromptsLib, string> =>
  loadPiPrompts().pipe(Effect.mapError((error) => error.message));

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
 * @param prompt - pi-prompts Prompt
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
  libs: PiPromptsLib,
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

/**
 * Parse `pi list` stdout. True when the pi-prompts extension is registered
 * in the pi session — the package name (or path segment) shows on its
 * own line in the project/user package list. Mirrors the skills session
 * probe so every panel stages its boot identically.
 * @param stdout - raw command stdout
 * @returns true when pi-prompts is listed
 */
export const parseListOutput = (stdout: string): boolean =>
  stdout.split(/\r?\n/).some((line) => line.includes('pi-prompts'));

/**
 * True when pi-prompts is installed in the pi session (`pi list` registers
 * it). The probe runs in the workspace root so project-local packages
 * resolve — from anywhere else `pi list` reports nothing. Slow or
 * failing probes read as missing — without the extension the dashboard
 * has no prompt runtime to run flows against. Stage one of the panel
 * boot (`extension`); the list read follows it, so the Loader narrates
 * the same two stages with the same timing profile as the skills and
 * profiles panels.
 * @param root - workspace root (pi project directory)
 * @returns installed flag, never fails
 */
export const isExtensionInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    promisify(execFile)('pi', ['list'], { cwd: root, timeout: 8000 }).then(
      ({ stdout }) => parseListOutput(stdout.toString()),
      () => false,
    ),
  );

/** Directory segments (under the workspace root) owning the prompt store. */
const PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/** Failure when the prompts CLI install (directory seed) fails. Carries the reason. */
export class InstallError extends Data.TaggedError('@montflow/PromptsInstallError')<{
  readonly message: string;
}> {}

/**
 * True when the prompts store directory exists.
 * @param root - workspace root
 * @returns installed flag, never fails
 */
export const isStoreInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(join(root, ...PROMPTS_DIR)).then(
      () => true,
      () => false,
    ),
  );

/**
 * Seed the prompts store directory (`<root>/.agents/@montflow/pi-prompts/`).
 * @param root - workspace root (install target)
 * @returns Effect completing once installed, failing with the reason
 */
export const installPrompts = (root: string): Effect.Effect<void, InstallError> =>
  Effect.tryPromise({
    try: () => mkdir(join(root, ...PROMPTS_DIR), { recursive: true }).then(() => undefined),
    catch: (cause) =>
      new InstallError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
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
 * Delete a workspace prompt by removing its file under
 * `<root>/.agents/@montflow/pi-prompts/`. Refuses blank or traversing
 * ids so a bad keybind target can never escape the store.
 * @param root - workspace root (prompt store owner)
 * @param id - prompt file slug (without `.json`)
 * @returns Effect completing once removed, failing with the reason
 */
export const deletePrompt = (root: string, id: string): Effect.Effect<void, DeleteError> => {
  if (!isValidPromptId(id))
    return Effect.fail(
      new DeleteError({ message: `Refusing to delete unsafe prompt id '${id}'.` }),
    );
  return Effect.tryPromise({
    try: () => rm(join(root, ...PROMPTS_DIR, `${id}.json`)).then(() => undefined),
    catch: (cause) =>
      new DeleteError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
  });
};

/** Failure when persisting a prompt file fails. Carries the reason. */
export class SaveError extends Data.TaggedError('@montflow/PromptsSaveError')<{
  readonly message: string;
}> {}

/**
 * Persist a prompt row to `<root>/.agents/@montflow/pi-prompts/<id>.json`,
 * creating the directory as needed. Encodes through the lazily loaded
 * runtime so both hosts produce identical files.
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
    yield* Effect.tryPromise({
      try: () =>
        mkdir(join(root, ...PROMPTS_DIR), { recursive: true })
          .then(() =>
            writeFile(
              join(root, ...PROMPTS_DIR, `${row.id}.json`),
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
  Effect.promise(() =>
    readdir(join(root, ...PROMPTS_DIR)).then(
      (names): DirEntries => ({
        installed: true,
        names: names.filter((name) => name.endsWith('.json')),
      }),
      (): DirEntries => ({ installed: false, names: [] }),
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
  libs: PiPromptsLib,
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
      readEntries(root).pipe(
        Effect.flatMap((entries) => {
          if (!entries.installed) {
            const none: Array<PromptSummary> = [];
            return Effect.succeed(none);
          }
          return Effect.forEach(entries.names, (file) =>
            Effect.promise(() =>
              readFile(join(root, ...PROMPTS_DIR, file), 'utf8').then(
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
  );

/**
 * Instructions before the user description: the child agent authors
 * exactly one prompt file, then verifies it.
 *
 * The rules body is `Prompts.authoringRules()`, read off the lazily loaded
 * runtime so the workspace host and the extension can never disagree about
 * the grammar. See `authoringRules` in the extension for the fallback copy
 * used when the runtime is unavailable.
 */
export const AUTHOR_PREPROMPT = `You are a prompt author for a pi coding agent.

Create exactly one new prompt file following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

RULES_PLACEHOLDER

Rules for this task:
- Write the new prompt at .agents/@montflow/pi-prompts/<name>.json (choose a
  kebab-case <name> that fits the description), with all six fields present.
  The file name must equal the name field plus '.json'.
- A variable used only to guard a branch with {{#if}} is still declared;
  declare it with "required": false and no "default" so leaving it blank takes
  the {{else}} branch.
- List .agents/skills/ and read each SKILL.md frontmatter 'name:' before
  listing a skill — reference existing skills only, otherwise leave skills
  empty.
- If a prompt with that name already exists, pick a fresh name instead.
- Do not touch anything outside .agents/@montflow/pi-prompts/.

Before you finish, run \`/mf-prompts verify <name>\`. Fix every issue it
reports and run it again until it says the file matches the standard format.`;

/** Substitute the runtime's authoring rules into a pre-prompt template. */
const withRules = (libs: PiPromptsLib, preprompt: string): string =>
  preprompt.replace('RULES_PLACEHOLDER', libs.Prompts.authoringRules());

/** Instructions after the user description: the reply shape. Mirrors the extension's `AUTHOR_POSTPROMPT`. */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the prompt name and what it does.';

/**
 * Instructions before the change request: the child agent edits the single
 * named prompt file, then verifies it. Mirrors `MODIFY_PREPROMPT` in
 * `@montflow/pi-prompts`'s extension.
 */
export const MODIFY_PREPROMPT = `You are a prompt author for a pi coding agent.

Modify the single prompt file named in the request, keeping the JSON schema valid
(name, description, template, variables, skills, model), then stop. Do not ask
follow-up questions — work from the change as given.

RULES_PLACEHOLDER

Rules for this task:
- Edit only the named file under .agents/@montflow/pi-prompts/.
- Do not rename the file and do not change the 'name' field. Do not touch
  anything else.
- Keep the file valid JSON (double quotes, no comments, no trailing commas).
- Reference existing skills only (check .agents/skills/ SKILL.md frontmatter
  'name:' values); drop unknown names instead of inventing them.

Before you finish, run \`/mf-prompts verify <name>\`. Fix every issue it
reports and run it again until it says the file matches the standard format.`;

/** Instructions after the change request: the reply shape. Mirrors the extension's `MODIFY_POSTPROMPT`. */
export const MODIFY_POSTPROMPT = 'When done, reply with one short line: what changed.';

/**
 * List decoded prompt rows, skipping malformed files. Shared by the
 * agentic ports (name-diff detection) and the boot list.
 * @param libs - loaded extension runtime
 * @param root - workspace root (prompt store owner)
 * @returns Effect resolving to the decoded rows
 */
const listRows = (libs: PiPromptsLib, root: string): Effect.Effect<ReadonlyArray<Prompts.Prompt>> =>
  readEntries(root).pipe(
    Effect.flatMap((entries) =>
      Effect.forEach(entries.names, (file) =>
        Effect.promise(() =>
          readFile(join(root, ...PROMPTS_DIR, file), 'utf8').then(
            (raw) => raw,
            () => undefined,
          ),
        ).pipe(
          Effect.flatMap((raw) => {
            if (raw === undefined) return Effect.succeed(undefined);
            // SAFETY: `JSON.parse` returns `any`; narrow to `unknown` so the `Prompt` schema validates it at the boundary below.
            return Effect.try(() => JSON.parse(raw) as unknown).pipe(
              Effect.flatMap((json) =>
                libs.Prompts.decodeUnknown(json).pipe(Effect.orElseSucceed(() => undefined)),
              ),
              Effect.orElseSucceed(() => undefined),
            );
          }),
        ),
      ),
    ),
    Effect.map((rows) => rows.filter((row): row is Prompts.Prompt => row !== undefined)),
  );

/**
 * Agentic prompt generation for the workspace host: snapshot the store,
 * run the shared author prompt headless, return the fresh prompt.
 * New prompts are detected by name diff so agent chatter never parses.
 * @param libs - loaded extension runtime
 * @param root - workspace root (prompt store owner)
 * @param description - prompt description from the TUI input
 * @param modelLabel - `provider/model-id` pin, if any
 * @returns Effect resolving to the generated Prompt, failing with the reason
 */
export const generateAgentic = (
  libs: PiPromptsLib,
  root: string,
  description: string,
  modelLabel: string | undefined,
): Effect.Effect<Prompts.Prompt, string> =>
  Effect.gen(function* () {
    const before = yield* listRows(libs, root);
    const beforeNames = new Set(before.map((prompt) => prompt.name));
    yield* Skills.runHeadlessAgent(
      root,
      Skills.buildHeadlessPrompt(
        withRules(libs, AUTHOR_PREPROMPT),
        `Prompt description: ${description}`,
        AUTHOR_POSTPROMPT,
      ),
      modelLabel,
    ).pipe(Effect.mapError((error) => error.message));
    const after = yield* listRows(libs, root);
    const fresh = after.find((prompt) => !beforeNames.has(prompt.name));
    if (fresh === undefined)
      return yield* Effect.fail(
        'The agent finished without creating a prompt — try describing it differently.',
      );
    return fresh;
  });

/**
 * Read one raw prompt file. Fails on unknown or unsafe names — the
 * dispatch snapshot compares these bytes against the settled state to
 * refuse a no-op run.
 * @param root - workspace root (prompt store owner)
 * @param id - prompt file slug (without `.json`)
 * @returns Effect resolving to the raw file contents
 */
export const readRawPrompt = (root: string, id: string): Effect.Effect<string, string> => {
  if (!isValidPromptId(id)) return Effect.fail(`Unknown prompt '${id}'.`);
  return Effect.promise(() =>
    readFile(join(root, ...PROMPTS_DIR, `${id}.json`), 'utf8').then(
      (raw) => raw,
      () => undefined,
    ),
  ).pipe(
    Effect.flatMap((raw) =>
      raw === undefined ? Effect.fail(`Unknown prompt '${id}'.`) : Effect.succeed(raw),
    ),
  );
};

/** One settled prompt file: its raw bytes and the decoded dashboard row, if any. */
interface FreshPrompt {
  readonly raw: string | undefined;
  readonly row: PromptSummary | undefined;
}

/**
 * Read the settled state of one prompt file the editor run was scoped
 * to. Never fails: a missing file reads as no bytes and no row, a
 * malformed one as bytes with no row (so the caller can tell "wrote
 * nothing" from "wrote something unusable").
 * @param libs - loaded extension runtime
 * @param root - workspace root (prompt store owner)
 * @param id - prompt file slug
 * @returns Effect resolving to the raw bytes plus the decoded row
 */
const readFreshPrompt = (
  libs: PiPromptsLib,
  root: string,
  id: string,
): Effect.Effect<FreshPrompt> =>
  readRawPrompt(root, id).pipe(
    Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }),
    Effect.flatMap((raw): Effect.Effect<FreshPrompt> =>
      raw === undefined
        ? Effect.succeed({ raw: undefined, row: undefined })
        : decodeRow(libs, `${id}.json`, raw).pipe(Effect.map((row): FreshPrompt => ({ raw, row }))),
    ),
  );

/**
 * TUI callbacks for a dispatched editor run's completion: the named
 * prompt was found and persisted (refresh + toast), or the run settled
 * without a usable change (surface the reason). Absent in headless tests.
 */
export interface ModifyFlowHooks {
  /** Named prompt found after the editor run settled. */
  readonly onPromptModified?: ((prompt: PromptSummary, runId: string) => void) | undefined;
  /** Editor run settled without updating the prompt. */
  readonly onPromptFailed?: ((message: string, runId: string) => void) | undefined;
}

/**
 * Completion hook for a dispatched editor run: re-read the named
 * prompt, refuse a no-op settle by comparing the raw file to the
 * dispatch snapshot, persist it canonically through the loaded
 * runtime's decode+encode path, and notify the hooks. Exported so a
 * resumed editor run can re-attach the same hook through
 * `Runs.resumeRun` after an app restart.
 * @param root - workspace root (prompt store owner)
 * @param libs - loaded extension runtime
 * @param runId - the editor run id
 * @param promptId - prompt file slug under edit
 * @param beforeRaw - raw prompt file snapshotted at dispatch, or undefined when unreadable
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const modifyCompletion =
  (
    root: string,
    libs: PiPromptsLib,
    runId: string,
    promptId: string,
    beforeRaw: string | undefined,
    hooks?: ModifyFlowHooks,
  ): ((detail: EngineRunDetail) => Effect.Effect<void>) =>
  (_detail) =>
    Effect.gen(function* () {
      const { raw: afterRaw, row: updated } = yield* readFreshPrompt(libs, root, promptId);
      if (updated === undefined) {
        hooks?.onPromptFailed?.(
          afterRaw === undefined
            ? `Run '${runId}' finished without updating prompt '${promptId}' — try describing the change differently.`
            : `Run '${runId}' wrote an invalid prompt '${promptId}' — check its JSON and retry.`,
          runId,
        );
        return;
      }
      if (beforeRaw !== undefined && afterRaw === beforeRaw) {
        hooks?.onPromptFailed?.(
          `Run '${runId}' finished without updating prompt '${promptId}' — try describing the change differently.`,
          runId,
        );
        return;
      }
      const failure = yield* savePrompt(root, updated).pipe(
        Effect.match({ onFailure: (error) => error.message, onSuccess: () => undefined }),
      );
      if (failure !== undefined) {
        hooks?.onPromptFailed?.(
          `Run '${runId}' updated '${promptId}' but it could not be saved: ${failure}`,
          runId,
        );
        return;
      }
      hooks?.onPromptModified?.(updated, runId);
    });

/**
 * Agentic generation port for the shared interactive flows: headless
 * `pi -p` over the shared author prompt, wrapped in the TUI working
 * overlay (the prompts flows take no loading port of their own, so the
 * host applies it here — input locks while the child agent runs). The
 * `PromptStore` requirement stays unfulfilled by construction — the
 * workspace host reads files directly, so the port runs anywhere the
 * flows run.
 * @param root - workspace root (prompt store owner)
 * @param loading - working-overlay wrapper for the headless run
 * @returns generator port for the interactive flows
 */
export const generateFor =
  (root: string, loading: FlowPorts['loading']): PromptsInteractive.PromptGenerator =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        loading(
          'Generating prompt',
          generateAgentic(libs, root, input.description, input.modelLabel),
        ),
      ),
    );

/** Result of a modify flow: persisted manually, or dispatched as a run. */
export type ModifyFlowResult =
  | { readonly kind: 'saved'; readonly prompt: PromptSummary }
  | { readonly kind: 'dispatched'; readonly runId: string };

/** Run id dispatched by the most recent agentic modify, consumed by {@link runModifyFlow}. */
let dispatchedModifyRunId: string | undefined;

/** Test seam: forget the dispatched-modify-run ref so a fresh modify flow starts clean. */
export const resetDispatchedModifyRun = (): void => {
  dispatchedModifyRunId = undefined;
};

/**
 * Agentic modification port for the shared interactive flows: gate on
 * the runs extension, snapshot the named prompt's raw file, dispatch an
 * editor run through the pi-runs engine, then unwind the shared
 * `modifyPrompt` flow with `CANCELLED` (the run, not this flow, writes
 * the prompt). The run id lands in a module-level ref that
 * {@link runModifyFlow} reads to distinguish a dispatch from a real
 * cancel. When the run settles, {@link modifyCompletion} re-reads and
 * persists the named prompt. Mirrors the profiles modify port.
 * @param root - workspace root (prompt store owner)
 * @param hooks - TUI completion callbacks, if any
 * @returns modifier port for the interactive flows
 */
export const modifyFor =
  (root: string, hooks?: ModifyFlowHooks): PromptsInteractive.PromptModifier =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        Effect.gen(function* () {
          const installed = yield* Runs.runsExtensionInstalled(root);
          if (!installed) return yield* Effect.fail(Runs.RUNS_EXTENSION_INSTALL_HINT);
          const beforeRaw = yield* readRawPrompt(root, input.name).pipe(
            Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }),
          );
          const id = yield* Runs.newRunId('modify-prompt');
          yield* Runs.startRun(root, {
            id,
            name: `Modify prompt: ${input.name}`,
            prompt: Skills.buildHeadlessPrompt(
              `${withRules(libs, MODIFY_PREPROMPT)}\n\nPrompt file: .agents/@montflow/pi-prompts/${input.name}.json`,
              `Change: ${input.change}`,
              MODIFY_POSTPROMPT,
            ),
            model: input.modelLabel,
            tools: [...Runs.DEFAULT_RUN_TOOLS],
            onSettled: modifyCompletion(root, libs, id, input.name, beforeRaw, hooks),
          });
          dispatchedModifyRunId = id;
          return yield* Effect.fail(libs.Interactive.CANCELLED);
        }),
      ),
    );

/**
 * Overlay ports the TUI injects into the flow runners: dialogs plus the
 * model picker and working overlay. All `Interactive` references are
 * type positions — the runtime stays behind the lazy loader. The
 * prompts flows take no loading port of their own, so `loading` wraps
 * the headless agent runs inside the generator / modifier ports
 * instead — same `LoadingFn` shape as the skills and profiles flows.
 */
export interface FlowPorts {
  readonly ui: PromptsInteractive.InteractiveUi;
  readonly modelPicker: PromptsInteractive.ModelPickerFn;
  readonly loading: <A, E>(
    message: string,
    effect: Effect.Effect<A, E, never>,
  ) => Effect.Effect<A, E>;
}

/**
 * Workspace host for the shared create flow: load the extension,
 * resolve picker models, run `createPrompt` (manual or agentic behind
 * the overlays), persist. Cancellations resolve undefined so the TUI
 * needs no `CANCELLED` knowledge — only real failures reject.
 * @param root - workspace root (prompt store owner)
 * @param ports - TUI overlay ports
 * @returns Effect resolving to the saved row, or undefined on cancel
 */
export const runCreateFlow = (
  root: string,
  ports: FlowPorts,
): Effect.Effect<PromptSummary | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        // SAFETY: `createPrompt` threads the `PromptStore` requirement only
        // through the generator port; the workspace generator reads files
        // directly and never touches the service, so the requirement is
        // phantom — discharge it instead of building a layer for it.
        const prompt = yield* libs.Interactive.createPrompt(
          ports.ui,
          libs.Interactive.modelOptions(fallback, refs),
          generateFor(root, ports.loading),
          undefined,
          ports.modelPicker,
        ) as Effect.Effect<Prompts.Prompt, string, never>;
        const row = fromPrompt(prompt);
        yield* savePrompt(root, row).pipe(Effect.mapError((failure) => failure.message));
        return row;
      }).pipe(
        Effect.catch((error) =>
          error === libs.Interactive.CANCELLED ? Effect.succeed(undefined) : Effect.fail(error),
        ),
      ),
    ),
  );

/**
 * Workspace host for the shared modify flow for one prompt: load the
 * extension, run `modifyPrompt` (manual template edit or agentic
 * rewrite). Manual edits persist and resolve `saved`; agentic edits
 * dispatch an editor run and resolve `dispatched`; real cancels resolve
 * undefined. The TUI needs no `CANCELLED` knowledge — only real
 * failures reject. Mirrors the profiles modify host.
 * @param root - workspace root (prompt store owner)
 * @param id - prompt name under edit
 * @param ports - TUI overlay ports
 * @param hooks - completion callbacks for a dispatched editor run
 * @returns Effect resolving to the modify outcome, or undefined on cancel
 */
export const runModifyFlow = (
  root: string,
  id: string,
  ports: FlowPorts,
  hooks?: ModifyFlowHooks,
): Effect.Effect<ModifyFlowResult | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const prompts = yield* listRows(libs, root);
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        dispatchedModifyRunId = undefined;
        // SAFETY: same phantom-`PromptStore` requirement as creation (see
        // above) — the workspace modifier reads files directly.
        const prompt = yield* libs.Interactive.modifyPrompt(
          ports.ui,
          prompts,
          libs.Interactive.modelOptions(fallback, refs),
          modifyFor(root, hooks),
          id,
          ports.modelPicker,
        ) as Effect.Effect<Prompts.Prompt, string, never>;
        const row = fromPrompt(prompt);
        yield* savePrompt(root, row).pipe(Effect.mapError((failure) => failure.message));
        return { kind: 'saved', prompt: row } satisfies ModifyFlowResult;
      }).pipe(
        Effect.catch((error) => {
          if (error !== libs.Interactive.CANCELLED) return Effect.fail(error);
          const runId = dispatchedModifyRunId;
          dispatchedModifyRunId = undefined;
          return Effect.succeed(
            runId === undefined
              ? undefined
              : ({ kind: 'dispatched', runId } satisfies ModifyFlowResult),
          );
        }),
      ),
    ),
  );
