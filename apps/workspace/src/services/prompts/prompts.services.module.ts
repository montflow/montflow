// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/@montflow/pi-prompts; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for prompt files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: shells out to the pi CLI for the session probe; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the session probe shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import type { Interactive as PromptsInteractive, Prompts } from '@montflow/pi-prompts';
import { Data, Effect } from 'effect';
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

/** One prompt row for the dashboard list and detail views. Mirrors `Prompts.Prompt` with an `id` alias (the slug). */
export interface PromptSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly template: string;
  readonly variables: ReadonlyArray<string>;
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
 * exactly one prompt file, then stops. Mirrors `AUTHOR_PREPROMPT` in
 * `@montflow/pi-prompts`'s extension (not exported through the package
 * index, so the workspace host carries this copy for its headless
 * `pi -p` runs).
 */
export const AUTHOR_PREPROMPT = `You are a prompt author for a pi coding agent.

Create exactly one new prompt file following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

The file is valid JSON (double quotes, no comments, no trailing commas)
with these fields:
- name: kebab-case file slug (also the file name)
- description: one non-empty line saying what the prompt does
- template: the prompt text with {{variable}} placeholders for user-supplied values
- variables: ordered list of variable names used in the template, in
  first-appearance order
- skills: list of skill names the run should load (empty when none)
- model: preferred model as provider/model-id, or '' when unset

Rules:
- Write the new prompt at .agents/@montflow/pi-prompts/<name>.json (choose a
  kebab-case <name> that fits the description), with all six fields present.
  The file name must equal the name field plus '.json'.
- Every {{token}} in the template must appear in variables, and vice versa.
- List .agents/skills/ and read each SKILL.md frontmatter 'name:' before
  listing a skill — reference existing skills only, otherwise leave skills
  empty.
- If a prompt with that name already exists, pick a fresh name instead.
- Do not touch anything outside .agents/@montflow/pi-prompts/.`;

/** Instructions after the user description: the reply shape. Mirrors the extension's `AUTHOR_POSTPROMPT`. */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the prompt name and what it does.';

/**
 * Instructions before the change request: the child agent edits the single
 * named prompt file, then stops. Mirrors `MODIFY_PREPROMPT` in
 * `@montflow/pi-prompts`'s extension.
 */
export const MODIFY_PREPROMPT = `You are a prompt author for a pi coding agent.

Modify the single prompt file named in the request, keeping the JSON schema valid
(name, description, template, variables, skills, model), then stop. Do not ask
follow-up questions — work from the change as given.

Rules:
- Edit only the named file under .agents/@montflow/pi-prompts/.
- Keep every {{token}} in the template covered by variables, and vice versa,
  with variables in first-appearance order.
- Do not rename the file and do not change the 'name' field. Do not touch
  anything else.
- Keep the file valid JSON (double quotes, no comments, no trailing commas).
- Reference existing skills only (check .agents/skills/ SKILL.md frontmatter
  'name:' values); drop unknown names instead of inventing them.`;

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
        AUTHOR_PREPROMPT,
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
 * Agentic prompt modification for the workspace host: run the shared
 * editor prompt headless scoped to the prompt name, re-read that prompt.
 * @param libs - loaded extension runtime
 * @param root - workspace root (prompt store owner)
 * @param prompt - prompt under edit
 * @param change - change request from the TUI input
 * @param modelLabel - `provider/model-id` pin, if any
 * @returns Effect resolving to the updated Prompt, failing with the reason
 */
export const modifyAgentic = (
  libs: PiPromptsLib,
  root: string,
  prompt: Prompts.Prompt,
  change: string,
  modelLabel: string | undefined,
): Effect.Effect<Prompts.Prompt, string> =>
  Effect.gen(function* () {
    yield* Skills.runHeadlessAgent(
      root,
      Skills.buildHeadlessPrompt(
        `${MODIFY_PREPROMPT}\n\nPrompt file: .agents/@montflow/pi-prompts/${prompt.name}.json`,
        `Change: ${change}`,
        MODIFY_POSTPROMPT,
      ),
      modelLabel,
    ).pipe(Effect.mapError((error) => error.message));
    const after = yield* listRows(libs, root);
    const updated = after.find((candidate) => candidate.name === prompt.name);
    if (updated === undefined)
      return yield* Effect.fail(
        'The agent finished without updating the prompt — try describing it differently.',
      );
    return updated;
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

/**
 * Agentic modification port for the shared interactive flows: headless
 * `pi -p` over the shared editor prompt, wrapped in the TUI working
 * overlay like generation.
 * @param root - workspace root (prompt store owner)
 * @param loading - working-overlay wrapper for the headless run
 * @returns modifier port for the interactive flows
 */
export const modifyFor =
  (root: string, loading: FlowPorts['loading']): PromptsInteractive.PromptModifier =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        loading(
          'Updating prompt',
          Effect.gen(function* () {
            const prompts = yield* listRows(libs, root);
            const prompt = prompts.find((candidate) => candidate.name === input.name);
            if (prompt === undefined) return yield* Effect.fail(`Unknown prompt '${input.name}'.`);
            return yield* modifyAgentic(libs, root, prompt, input.change, input.modelLabel);
          }),
        ),
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
 * rewrite), persist. Cancellations resolve undefined; the detail stays
 * open on the updated row.
 * @param root - workspace root (prompt store owner)
 * @param id - prompt name under edit
 * @param ports - TUI overlay ports
 * @returns Effect resolving to the saved row, or undefined on cancel
 */
export const runModifyFlow = (
  root: string,
  id: string,
  ports: FlowPorts,
): Effect.Effect<PromptSummary | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const prompts = yield* listRows(libs, root);
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        // SAFETY: same phantom-`PromptStore` requirement as creation (see
        // above) — the workspace modifier reads files directly.
        const prompt = yield* libs.Interactive.modifyPrompt(
          ports.ui,
          prompts,
          libs.Interactive.modelOptions(fallback, refs),
          modifyFor(root, ports.loading),
          id,
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
