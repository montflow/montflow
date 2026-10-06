// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/skills; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for skill files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: home directory for the pi model catalogue; goes away with the FileSystem migration.
import { homedir } from 'node:os';
// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: shells out to the skills CLI for installs; migrate to Command when the app moves onto the platform layer graph.
import { execFile, spawn } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the installer shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import type { Interactive, Skill } from '@montflow/pi-skills';
import type { RunDetail as EngineRunDetail } from '@montflow/pi-runs';
import { Data, Effect, Schema } from 'effect';
import * as Runs from '../runs/index.js';

/**
 * Lazy handle to the skills extension runtime. Static imports from
 * `@montflow/pi-skills` are type-only (erased at build) — the runtime
 * resolves here, on first flow use, never at dashboard boot. A broken
 * or missing extension therefore cannot crash the TUI; the failing
 * flow surfaces the load error as a toast instead.
 */
type PiSkillsLib = typeof import('@montflow/pi-skills');

/** Failure loading the skills extension runtime. `cause` classifies the import rejection. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/ExtensionLoadError')<{
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
      return 'Skills extension download failed (network) — check the connection, then retry.';
    case 'missing':
      return 'Skills extension not found — reinstall the workspace dependencies, then retry.';
    default:
      return 'Skills extension failed to load — reinstall the workspace dependencies, then retry.';
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

/** Cached extension module promise. Cleared on failure so installing the extension then retrying reloads it. */
let cachedLib: Promise<PiSkillsLib> | undefined;

/** The resolved extension runtime, once a flow has loaded it. Backs the synchronous picker matcher below. */
let liveLib: PiSkillsLib | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<PiSkillsLib> => {
  cachedLib ??= import('@montflow/pi-skills').then(
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
 * Load the skills extension runtime as an Effect, caching the module
 * across flows. The dynamic import is the only Promise in the chain —
 * every rejection is classified (network vs missing vs unknown) into
 * an `ExtensionLoadError`, and failures clear the cache so a retry
 * re-imports.
 * @returns Effect resolving to the extension module namespace
 */
export const loadPiSkills = (): Effect.Effect<PiSkillsLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => importOnce(),
    catch: (cause) => (cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause)),
  });

/**
 * The loaded extension runtime, if any flow has loaded it yet.
 * @returns the extension module namespace, or undefined before first load
 */
export const loadedPiSkills = (): PiSkillsLib | undefined => liveLib;

/**
 * The shared subsequence matcher for the TUI filter picker, once a flow
 * has loaded the extension. The picker only opens mid-flow (after a
 * successful load), so callers fall back to unfiltered rows before that.
 * @returns matcher, or undefined before first load
 */
export const loadedMatcher = (): ((label: string, query: string) => boolean) | undefined =>
  liveLib?.Interactive.matchesFilter;

/**
 * Require the extension runtime inside flows: load failures become
 * string errors the TUI toasts (install, then retry).
 * @returns Effect resolving to the extension module namespace
 */
const loadLibs = (): Effect.Effect<PiSkillsLib, string> =>
  loadPiSkills().pipe(Effect.mapError((error) => error.message));

/** Panel ids with an installable backing extension. */
export type ExtensionPanel = 'skills' | 'prompts' | 'runs' | 'profiles';

/** Directory segments (under the workspace root) proving a panel installed. */
const PANEL_DIRS = {
  skills: ['.agents', 'skills'],
  prompts: ['.agents', '@montflow', 'pi-prompts'],
  runs: ['.agents', '@montflow', 'runs'],
  profiles: ['.agents', '@montflow', 'profiles'],
} satisfies Record<ExtensionPanel, ReadonlyArray<string>>;

/** Copy shown behind the install keybind per panel. */
const INSTALL_HINTS = {
  skills: 'npx skills add montflow/montflow -a pi -y',
  prompts: 'prompt packs land next',
  runs: 'run history lands next',
  profiles: 'profile sync lands next',
} satisfies Record<ExtensionPanel, string>;

/**
 * Install hint for a panel's missing extension.
 * @param panel - panel id
 * @returns hint copy
 */
export const installHint = (panel: ExtensionPanel): string => INSTALL_HINTS[panel];

/** One skill row for the dashboard list and detail views. */
export interface SkillSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly groups: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<string>;
  readonly body: string;
}

/** Frontmatter fields plus body, mirroring Skill.parseSkillFile. */
interface ParsedFile {
  readonly fields: Record<string, string | Array<string>>;
  readonly body: string;
}

/** Block scalar indicators (`>`, `>-`, `>+`, `|`, `|-`, `|+`). */
const BLOCK_SCALAR = /^[|>][+-]?$/;

/**
 * Parse the frontmatter subset the stores write: scalar `key: value`
 * lines, `>`/`|` block scalars with indented continuations, plus
 * blank-value keys followed by `  - item` list lines. `#` comment lines
 * skip. Null when no `---` block opens the file.
 * @param markdown - raw SKILL.md contents
 * @returns fields plus body, or null
 */
export const parseFile = (markdown: string): ParsedFile | null => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return null;
  let endIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === '---') {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) return null;
  const fields: Record<string, string | Array<string>> = {};
  const fmLines = lines.slice(1, endIndex);
  let index = 0;
  while (index < fmLines.length) {
    const trimmed = (fmLines[index] ?? '').trim();
    index++;
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);
    if (match === null) continue;
    const key = match[1] ?? '';
    const rawValue = (match[2] ?? '').trim();
    if (BLOCK_SCALAR.test(rawValue)) {
      const folded = rawValue.startsWith('>');
      const chunks: Array<string> = [];
      while (index < fmLines.length) {
        const next = fmLines[index] ?? '';
        if (!/^[ \t]+\S/.test(next)) break;
        chunks.push(next.trim());
        index++;
      }
      fields[key] = folded ? chunks.join(' ') : chunks.join('\n').trim();
    } else if (rawValue === '') {
      const items: Array<string> = [];
      while (index < fmLines.length) {
        const listMatch = /^[ \t]+-\s+(.+)$/.exec(fmLines[index] ?? '');
        if (listMatch === null) break;
        items.push((listMatch[1] ?? '').trim());
        index++;
      }
      fields[key] = items;
    } else {
      fields[key] = rawValue;
    }
  }
  return {
    fields,
    body: lines
      .slice(endIndex + 1)
      .join('\n')
      .trim(),
  };
};

const fieldString = (fields: ParsedFile['fields'], key: string): string | undefined => {
  const value = fields[key];
  if (value === undefined || Array.isArray(value) || value === '') return undefined;
  return value;
};

const fieldStrings = (fields: ParsedFile['fields'], key: string): ReadonlyArray<string> => {
  const value = fields[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item.trim() !== '');
};

/**
 * Decode one `SKILL.md` file into a summary row. The directory name is
 * the id; frontmatter `name` falls back to it. Malformed files read as
 * undefined so the list skips them.
 * @param id - skill directory name
 * @param markdown - raw SKILL.md contents
 * @returns summary row or undefined
 */
export const decodeSummary = (id: string, markdown: string): SkillSummary | undefined => {
  const parsed = parseFile(markdown);
  if (parsed === null) return undefined;
  return {
    id,
    name: fieldString(parsed.fields, 'name') ?? id,
    description: fieldString(parsed.fields, 'description') ?? '',
    groups: fieldStrings(parsed.fields, 'groups'),
    dependencies: fieldStrings(parsed.fields, 'dependencies'),
    body: parsed.body,
  };
};

/**
 * Parse `pi list` stdout. True when the pi-skills extension is registered
 * in the pi session — the package name (or path segment) shows on its
 * own line in the project/user package list.
 * @param stdout - raw command stdout
 * @returns true when pi-skills is listed
 */
export const parseListOutput = (stdout: string): boolean =>
  stdout.split(/\r?\n/).some((line) => line.includes('pi-skills'));

/**
 * True when pi-skills is installed in the pi session (`pi list` registers
 * it). The probe runs in the workspace root so project-local packages
 * resolve — from anywhere else `pi list` reports nothing. Slow or
 * failing probes read as missing — without the extension the dashboard
 * has no skill store to list.
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

/** Failure when the skills CLI install fails. Carries tailed CLI output. */
export class InstallError extends Data.TaggedError('@montflow/SkillsInstallError')<{
  readonly message: string;
}> {}

/** skills CLI arguments syncing every montflow skill into pi, project-local. */
export const installArgs = (): ReadonlyArray<string> => [
  'skills',
  'add',
  'montflow/montflow',
  '--all',
  '-a',
  'pi',
  '-y',
];

/**
 * Install workspace skills via the `skills` CLI (same mechanism as the
 * syncing-skills flow), project-local into `<root>/.agents/skills/`.
 * @param root - workspace root (install target)
 * @returns Effect completing once installed, failing with CLI output
 */
export const installSkills = (root: string): Effect.Effect<void, InstallError> =>
  Effect.tryPromise({
    try: () =>
      promisify(execFile)('npx', [...installArgs()], { cwd: root, timeout: 180_000 }).then(
        () => undefined,
      ),
    catch: (cause) =>
      new InstallError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
  });

/**
 * True when a panel's backing extension directory exists.
 * @param root - workspace root
 * @param panel - panel id
 * @returns installed flag, never fails
 */
export const panelInstalled = (
  root: string,
  panel: ExtensionPanel,
): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(join(root, ...PANEL_DIRS[panel])).then(
      () => true,
      () => false,
    ),
  );

/** Directory-safe skill id: lowercase alphanumeric groups joined by single hyphens. */
export const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * True when `id` is a safe skill directory name (no traversal, no blanks).
 * @param id - candidate skill id
 * @returns true for safe ids
 */
export const isValidSkillId = (id: string): boolean =>
  id.length >= 1 && id.length <= 64 && SKILL_ID_PATTERN.test(id);

/** Failure when deleting a skill directory fails. Carries the reason. */
export class DeleteError extends Data.TaggedError('@montflow/SkillsDeleteError')<{
  readonly message: string;
}> {}

/**
 * Delete a workspace skill by removing its directory under
 * `<root>/.agents/skills/`. Refuses blank or traversing ids so a bad
 * keybind target can never escape the store.
 * @param root - workspace root (skill store owner)
 * @param id - skill directory name
 * @returns Effect completing once removed, failing with the reason
 */
export const deleteSkill = (root: string, id: string): Effect.Effect<void, DeleteError> => {
  if (!isValidSkillId(id))
    return Effect.fail(new DeleteError({ message: `Refusing to delete unsafe skill id '${id}'.` }));
  return Effect.tryPromise({
    try: () => rm(join(root, ...PANEL_DIRS.skills, id), { recursive: true }).then(() => undefined),
    catch: (cause) =>
      new DeleteError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
  });
};

/**
 * Load workspace skills: installed flag plus rows sorted by name.
 * Malformed files skip so the list stays usable.
 * @param root - workspace root
 * @returns installed flag and rows, never fails
 */
export const getSkills = (
  root: string,
): Effect.Effect<{ readonly installed: boolean; readonly skills: SkillSummary[] }, never> =>
  Effect.gen(function* () {
    const dir = join(root, ...PANEL_DIRS.skills);
    const entries = yield* Effect.promise(() =>
      readdir(dir).then(
        (names) => ({ ok: true as const, names }),
        // SAFETY: the rejection branch carries no names, so the empty array type is exact.
        () => ({ ok: false as const, names: [] as Array<string> }),
      ),
    );
    if (!entries.ok) return { installed: false, skills: [] };
    const rows = yield* Effect.forEach(entries.names, (entry) =>
      Effect.promise(() =>
        readFile(join(dir, entry, 'SKILL.md'), 'utf8').then(
          (raw) => decodeSummary(entry, raw),
          () => undefined,
        ),
      ),
    );
    return {
      installed: true,
      skills: rows
        .filter((row): row is SkillSummary => row !== undefined)
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    };
  });

/**
 * Serialize a skill row to `SKILL.md` contents: frontmatter plus body.
 * Empty `groups` / `dependencies` drop their keys. Mirrors the writer in
 * `@montflow/pi-skills` so both hosts produce identical files.
 * @param skill - skill row to persist
 * @returns file contents
 */
export const encodeSummary = (skill: SkillSummary): string => {
  const lines = ['---', `name: ${skill.name}`, `description: ${skill.description}`];
  if (skill.groups.length > 0) {
    lines.push('groups:');
    for (const group of skill.groups) lines.push(`  - ${group}`);
  }
  if (skill.dependencies.length > 0) {
    lines.push('dependencies:');
    for (const dependency of skill.dependencies) lines.push(`  - ${dependency}`);
  }
  lines.push('---', '');
  if (skill.body !== '') lines.push(skill.body, '');
  return lines.join('\n');
};

/** Failure when persisting a skill file fails. Carries the reason. */
export class SaveError extends Data.TaggedError('@montflow/SkillsSaveError')<{
  readonly message: string;
}> {}

/**
 * Persist a skill row to `<root>/.agents/skills/<id>/SKILL.md`, creating
 * the directory as needed. Covers both create and manual modify — the
 * caller owns validation (ids stay slug-guarded like deletes).
 * @param root - workspace root (skill store owner)
 * @param skill - skill row to persist
 * @returns Effect completing once written, failing with the reason
 */
export const saveSkill = (root: string, skill: SkillSummary): Effect.Effect<void, SaveError> => {
  if (!isValidSkillId(skill.id))
    return Effect.fail(
      new SaveError({ message: `Refusing to save unsafe skill id '${skill.id}'.` }),
    );
  return Effect.tryPromise({
    try: () =>
      mkdir(join(root, ...PANEL_DIRS.skills, skill.id), { recursive: true })
        .then(() =>
          writeFile(
            join(root, ...PANEL_DIRS.skills, skill.id, 'SKILL.md'),
            encodeSummary(skill),
            'utf8',
          ),
        )
        .then(() => undefined),
    catch: (cause) =>
      new SaveError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
  });
};

/**
 * Bridge a dashboard row into a pi-skills `Skill` for the shared
 * interactive flows (`createSkill`, `modifySkill`, requirements gate).
 * Takes the lazily loaded runtime — no static extension dependency.
 * @param libs - loaded extension runtime
 * @param row - dashboard skill row
 * @returns Effect resolving to the Skill, failing on invalid rows
 */
export const toSkill = (libs: PiSkillsLib, row: SkillSummary): Effect.Effect<Skill.Skill, string> =>
  libs.Skill.decodeUnknown({
    id: row.id,
    name: row.name,
    description: row.description,
    groups: [...row.groups],
    dependencies: [...row.dependencies],
    body: row.body,
  }).pipe(Effect.mapError(() => `Invalid skill '${row.id}'.`));

/**
 * Bridge a pi-skills `Skill` back into a dashboard row for persistence.
 * Total — `Skill.encode` only produces valid shapes.
 * @param libs - loaded extension runtime
 * @param skill - pi-skills Skill
 * @returns dashboard row
 */
export const fromSkill = (libs: PiSkillsLib, skill: Skill.Skill): SkillSummary => {
  const encoded = libs.Skill.encode(skill);
  return {
    id: encoded.id,
    name: encoded.name,
    description: encoded.description,
    groups: [...encoded.groups],
    dependencies: [...encoded.dependencies],
    body: encoded.body,
  };
};

/** Staged boot phase behind the skills-panel Loader: extension import, then the skill-list read. */
export type SkillsPhase = 'extension' | 'skills';

/**
 * Skill rows for the TUI boot through the loaded skill module: load the
 * extension runtime, then list the store via its async `SkillStore`
 * file reads (an Effect, sorted by name). The caller sets the Loader
 * variant per stage — `extension` while the import runs, `skills`
 * while the list reads — so boot narrates step by step.
 * @param root - workspace root (skill store owner)
 * @returns Effect resolving to sorted summary rows, failing with displayable message
 */
export const fetchSkills = (root: string): Effect.Effect<SkillSummary[], string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      libs.SkillStore.list(root).pipe(
        Effect.map((skills) =>
          skills
            .map((skill) => fromSkill(libs, skill))
            .toSorted((a, b) => a.name.localeCompare(b.name)),
        ),
      ),
    ),
  );

/** One model offered by the picker: `provider/model-id`. */
export interface ModelRef {
  readonly provider: string;
  readonly id: string;
}

/** One catalogue model: only the id matters to the picker. */
const CatalogueModel = Schema.Struct({ id: Schema.String });

/** One provider entry: the models payload stays unchecked here so one odd provider never fails the catalogue — each entry is validated below. */
const CatalogueEntry = Schema.Struct({ models: Schema.optional(Schema.Unknown) });

/** One provider entry: a missing or malformed models list reads as none. */
const CatalogueModels = Schema.Array(Schema.Unknown);

/** The pi model catalogue: provider keys to provider entries. */
const Catalogue = Schema.Record(Schema.String, CatalogueEntry);

/**
 * Parse the pi model catalogue (`~/.pi/agent/models-store.json`:
 * provider keys holding `{ models: [{ id }] }`) into picker refs.
 * Decoded by schema at the boundary — malformed JSON or unexpected
 * shapes read as empty, and the picker falls back to the session
 * default.
 * @param json - raw catalogue contents
 * @returns `provider/id` refs in catalogue order
 */
export const parseModelsStore = (json: string): ReadonlyArray<ModelRef> => {
  let catalogue: typeof Catalogue.Type;
  try {
    catalogue = Schema.decodeUnknownSync(Catalogue)(JSON.parse(json));
  } catch {
    return [];
  }
  const refs: Array<ModelRef> = [];
  for (const [provider, entry] of Object.entries(catalogue)) {
    let models: ReadonlyArray<unknown>;
    try {
      models = Schema.decodeUnknownSync(CatalogueModels)(entry.models ?? []);
    } catch {
      continue;
    }
    for (const model of models) {
      let id: string;
      try {
        id = Schema.decodeUnknownSync(CatalogueModel)(model).id;
      } catch {
        continue;
      }
      if (id !== '') refs.push({ provider, id });
    }
  }
  return refs;
};

/**
 * List installed pi models for the model picker. Reads the catalogue
 * once per call — failures read as empty, never fail.
 * @param home - home directory override (defaults to the live one)
 * @returns catalogue refs, or empty when unreadable
 */
export const listModelLabels = (
  home: string = homedir(),
): Effect.Effect<ReadonlyArray<ModelRef>, never> =>
  Effect.promise(() =>
    readFile(join(home, '.pi', 'agent', 'models-store.json'), 'utf8').then(
      (raw) => parseModelsStore(raw),
      () => [],
    ),
  );

/** The pi session defaults: the provider/model pair headless runs fall back to. */
const PiDefaults = Schema.Struct({
  defaultProvider: Schema.optional(Schema.String),
  defaultModel: Schema.optional(Schema.String),
});

/**
 * Parse the pi session defaults (`~/.pi/agent/settings.json`) into the
 * default model ref — the model the session is on right now. Decoded
 * by schema at the boundary: malformed JSON or a missing pair reads
 * as undefined, and the picker simply marks no row current.
 * @param json - raw settings contents
 * @returns default ref, or undefined when absent
 */
export const parseDefaultModel = (json: string): ModelRef | undefined => {
  let defaults: typeof PiDefaults.Type;
  try {
    defaults = Schema.decodeUnknownSync(PiDefaults)(JSON.parse(json));
  } catch {
    return undefined;
  }
  if (defaults.defaultProvider === undefined || defaults.defaultModel === undefined)
    return undefined;
  if (defaults.defaultProvider === '' || defaults.defaultModel === '') return undefined;
  return { provider: defaults.defaultProvider, id: defaults.defaultModel };
};

/**
 * Read the session default model for the model picker. Failures read
 * as undefined, never fail.
 * @param home - home directory override (defaults to the live one)
 * @returns default ref, or undefined when unreadable
 */
export const listDefaultModel = (
  home: string = homedir(),
): Effect.Effect<ModelRef | undefined, never> =>
  Effect.promise(() =>
    readFile(join(home, '.pi', 'agent', 'settings.json'), 'utf8').then(
      (raw) => parseDefaultModel(raw),
      () => undefined,
    ),
  );

/**
 * Assemble a headless child prompt the same way `AgentRun.buildPrompt`
 * does: preprompt, user prompt, postprompt separated by blank lines.
 * Blank parts drop out.
 * @param preprompt - role and format instructions
 * @param prompt - user request
 * @param postprompt - reply shape
 * @returns assembled prompt text
 */
export const buildHeadlessPrompt = (
  preprompt: string,
  prompt: string,
  postprompt: string,
): string =>
  [preprompt, prompt, postprompt]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n');

/**
 * `pi -p` arguments for a headless agentic run: ephemeral session, tight
 * tool allowlist, optional model pin. Mirrors the tool scope the pi
 * extension grants its child agents (`read`, `write`, `edit`).
 * @param prompt - assembled child prompt
 * @param modelLabel - `provider/model-id` pin, if any
 * @returns argv for `pi`
 */
export const headlessArgs = (
  prompt: string,
  modelLabel: string | undefined,
): ReadonlyArray<string> => [
  '-p',
  '--no-session',
  '--tools',
  'read,write,edit',
  ...(modelLabel === undefined ? [] : ['--model', modelLabel]),
  prompt,
];

/** Failure when a headless agent run fails. Carries tailed CLI output. */
export class AgentError extends Data.TaggedError('@montflow/SkillsAgentError')<{
  readonly message: string;
}> {}

/** Headless runs get five minutes — skill authoring is one file plus thought. */
const AGENT_TIMEOUT_MS = 300_000;

/**
 * Run a headless child agent via the `pi` CLI (`-p`, ephemeral, tight
 * tools) in the workspace root. Stdout carries the reply; failures
 * carry tailed output. Spawned (not `execFile`) so the Effect stays
 * interruptible — cancelling the fiber kills the child, and the five
 * minute timeout interrupts the wait the same way. This is the
 * workspace host for the `@montflow/pi-skills` agent prompts — same
 * preprompts the pi extension feeds `AgentRun`, transported over the
 * CLI instead.
 * @param root - workspace root (child working directory)
 * @param prompt - assembled child prompt
 * @param modelLabel - `provider/model-id` pin, if any
 * @returns Effect resolving to the reply text, failing with the reason
 */
export const runHeadlessAgent = (
  root: string,
  prompt: string,
  modelLabel: string | undefined,
): Effect.Effect<string, AgentError> =>
  Effect.callback<string, AgentError>((resume, signal) => {
    const child = spawn('pi', [...headlessArgs(prompt, modelLabel)], { cwd: root });
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
              new AgentError({ message: (stderr || stdout || `exit ${code}`).slice(-2000) }),
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
      error instanceof AgentError
        ? error
        : new AgentError({ message: 'Agent run timed out after five minutes.' }),
    ),
  );

/**
 * One transcript line, shared by the engine detail and the dashboard row.
 */
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

/** How a settled author run's skill was resolved. */
export type AuthoredSkillPick =
  | { readonly kind: 'one'; readonly id: string }
  | { readonly kind: 'ambiguous'; readonly ids: ReadonlyArray<string> }
  | { readonly kind: 'none' };

/**
 * Resolve the skill a settled author run authored. Prefers the fresh
 * skill named in the run's final reply — correlating concurrent creates
 * to their own run — and falls back to the id diff only when exactly one
 * fresh skill exists (unambiguous).
 * @param reply - final assistant text from the run, if any
 * @param freshIds - skill ids added since the run was dispatched
 * @returns the chosen id, an ambiguity, or none
 */
export const pickAuthoredSkill = (
  reply: string | undefined,
  freshIds: ReadonlyArray<string>,
): AuthoredSkillPick => {
  if (freshIds.length === 0) return { kind: 'none' };
  const named = reply === undefined ? [] : freshIds.filter((id) => reply.includes(id));
  if (named.length === 1) {
    const id = named[0];
    if (id !== undefined) return { kind: 'one', id };
  }
  if (freshIds.length === 1) {
    const id = freshIds[0];
    if (id !== undefined) return { kind: 'one', id };
  }
  return { kind: 'ambiguous', ids: freshIds };
};

/**
 * TUI callbacks for a dispatched author run's completion: the fresh
 * skill was found (refresh + open its detail), or the run settled
 * without one (surface the reason). The run id lets the TUI clear only
 * the matching dispatched-run keybind target. Absent in headless tests.
 */
export interface CreateFlowHooks {
  /** Fresh skill found after the author run settled. */
  readonly onSkillCreated?: ((skill: SkillSummary, runId: string) => void) | undefined;
  /** Author run settled without creating a skill. */
  readonly onSkillFailed?: ((message: string, runId: string) => void) | undefined;
}

/**
 * TUI callbacks for a dispatched editor run's completion: the named
 * skill was found and persisted (refresh + toast), or the run settled
 * without a usable change (surface the reason). Absent in headless tests.
 */
export interface ModifyFlowHooks {
  /** Named skill found after the editor run settled. */
  readonly onSkillModified?: ((skill: SkillSummary, runId: string) => void) | undefined;
  /** Editor run settled without updating the skill. */
  readonly onSkillFailed?: ((message: string, runId: string) => void) | undefined;
}

/**
 * Raw `SKILL.md` bytes for the dispatch snapshot, or undefined when the
 * file is missing or the id is unsafe.
 * @param root - workspace root (skill store owner)
 * @param id - skill directory slug
 * @returns Effect resolving to the raw file contents
 */
const readRawSkill = (root: string, id: string): Effect.Effect<string | undefined> =>
  storeFor(root)
    .readRaw(id)
    .pipe(Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }));

/**
 * Completion hook for a dispatched author run: resolve the skill the
 * run authored (reply-correlated, id-diff fallback), persist it
 * canonically through the loaded runtime's decode+encode path, and
 * notify the hooks. Exported so a resumed author run can re-attach the
 * same hook through `Runs.resumeRun` after an app restart.
 * @param root - workspace root (skill store owner)
 * @param libs - loaded extension runtime
 * @param runId - the author run id
 * @param beforeIds - store ids snapshotted at dispatch, or undefined after a restart
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const authorCompletion =
  (
    root: string,
    libs: PiSkillsLib,
    runId: string,
    beforeIds: ReadonlyArray<string> | undefined,
    hooks?: CreateFlowHooks,
  ): ((detail: EngineRunDetail) => Effect.Effect<void>) =>
  (detail) =>
    Effect.gen(function* () {
      const { skills } = yield* getSkills(root);
      const fresh = skills.filter((row) => !(beforeIds ?? []).includes(row.id));
      const pick = pickAuthoredSkill(
        finalAssistantText(detail.events),
        fresh.map((row) => row.id),
      );
      if (pick.kind === 'one') {
        const row = fresh.find((candidate) => candidate.id === pick.id);
        if (row === undefined) return;
        const failure = yield* saveSkill(root, row).pipe(
          Effect.match({ onFailure: (error) => error.message, onSuccess: () => undefined }),
        );
        if (failure !== undefined) {
          hooks?.onSkillFailed?.(
            `Run '${runId}' created '${row.id}' but it could not be saved: ${failure}`,
            runId,
          );
          return;
        }
        hooks?.onSkillCreated?.(row, runId);
        return;
      }
      if (pick.kind === 'ambiguous') {
        hooks?.onSkillFailed?.(
          `Run '${runId}' created several skills (${pick.ids.join(', ')}) — open the one you want from the list.`,
          runId,
        );
        return;
      }
      hooks?.onSkillFailed?.(
        `Run '${runId}' finished without creating a skill — try describing it differently.`,
        runId,
      );
    });

/**
 * Completion hook for a dispatched editor run: re-read the named skill,
 * refuse a no-op settle by comparing the raw `SKILL.md` to the dispatch
 * snapshot, persist it canonically through the loaded runtime's
 * decode+encode path, and notify the hooks. Exported so a resumed
 * editor run can re-attach the same hook through `Runs.resumeRun` after
 * an app restart.
 * @param root - workspace root (skill store owner)
 * @param libs - loaded extension runtime
 * @param runId - the editor run id
 * @param skillId - skill directory slug under edit
 * @param beforeRaw - raw `SKILL.md` snapshotted at dispatch, or undefined when unreadable
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const modifyCompletion =
  (
    root: string,
    libs: PiSkillsLib,
    runId: string,
    skillId: string,
    beforeRaw: string | undefined,
    hooks?: ModifyFlowHooks,
  ): ((detail: EngineRunDetail) => Effect.Effect<void>) =>
  (_detail) =>
    Effect.gen(function* () {
      const afterRaw = yield* readRawSkill(root, skillId);
      if (afterRaw === undefined) {
        hooks?.onSkillFailed?.(
          `Run '${runId}' finished without updating skill '${skillId}' — try describing the change differently.`,
          runId,
        );
        return;
      }
      if (beforeRaw !== undefined && afterRaw === beforeRaw) {
        hooks?.onSkillFailed?.(
          `Run '${runId}' finished without updating skill '${skillId}' — try describing the change differently.`,
          runId,
        );
        return;
      }
      const { skills } = yield* getSkills(root);
      const updated = skills.find((row) => row.id === skillId);
      if (updated === undefined) {
        hooks?.onSkillFailed?.(
          `Run '${runId}' wrote an unusable skill '${skillId}' — check its SKILL.md and retry.`,
          runId,
        );
        return;
      }
      const row = updated;
      const failure = yield* saveSkill(root, row).pipe(
        Effect.match({ onFailure: (error) => error.message, onSuccess: () => undefined }),
      );
      if (failure !== undefined) {
        hooks?.onSkillFailed?.(
          `Run '${runId}' updated '${skillId}' but it could not be saved: ${failure}`,
          runId,
        );
        return;
      }
      hooks?.onSkillModified?.(row, runId);
    });

/** Result of a create flow: persisted manually, or dispatched as a run. */
export type CreateFlowResult =
  | { readonly kind: 'saved'; readonly skill: SkillSummary }
  | { readonly kind: 'dispatched'; readonly runId: string };

/** Result of a modify flow: persisted manually, or dispatched as a run. */
export type ModifyFlowResult =
  | { readonly kind: 'saved'; readonly skill: SkillSummary }
  | { readonly kind: 'dispatched'; readonly runId: string };

/** Run id dispatched by the most recent agentic create, consumed by {@link runCreateFlow}. */
let dispatchedRunId: string | undefined;

/** Run id dispatched by the most recent agentic modify, consumed by {@link runModifyFlow}. */
let dispatchedModifyRunId: string | undefined;

/** Test seam: forget the dispatched-run ref so a fresh create flow starts clean. */
export const resetDispatchedRun = (): void => {
  dispatchedRunId = undefined;
};

/** Test seam: forget the dispatched-modify-run ref so a fresh modify flow starts clean. */
export const resetDispatchedModifyRun = (): void => {
  dispatchedModifyRunId = undefined;
};

/** Skill ids currently in the store, regardless of decode validity. */
const storeIds = (root: string): Effect.Effect<ReadonlyArray<string>> =>
  getSkills(root).pipe(Effect.map(({ skills }) => skills.map((skill) => skill.id)));

/**
 * Agentic generation port for the shared interactive flows: gate on the
 * runs extension, snapshot the store, dispatch an author run through the
 * pi-runs engine, then unwind the shared `createSkill` flow with
 * `CANCELLED` (the run, not this flow, writes the skill). The run id
 * lands in a module-level ref that {@link runCreateFlow} reads to
 * distinguish a dispatch from a real cancel. When the run settles,
 * {@link authorCompletion} correlates the fresh skill to this run's final
 * reply, so concurrent creates never cross wires.
 * @param root - workspace root (skill store owner)
 * @param hooks - TUI completion callbacks, if any
 * @returns generator port for the interactive flows
 */
export const generateFor =
  (root: string, hooks?: CreateFlowHooks): Interactive.SkillGenerator =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        Effect.gen(function* () {
          const installed = yield* Runs.runsExtensionInstalled(root);
          if (!installed) return yield* Effect.fail(Runs.RUNS_EXTENSION_INSTALL_HINT);
          const beforeIds = yield* storeIds(root);
          const id = yield* Runs.newRunId('create-skill');
          yield* Runs.startRun(root, {
            id,
            name: `Create skill: ${input.description.trim().slice(0, 80)}`,
            prompt: buildHeadlessPrompt(
              libs.Interactive.AUTHOR_PREPROMPT + libs.Skill.formatInjectedSkills(input.inject),
              `Skill description: ${input.description}`,
              libs.Interactive.AUTHOR_POSTPROMPT,
            ),
            model: input.modelLabel,
            tools: [...Runs.DEFAULT_RUN_TOOLS],
            onSettled: authorCompletion(root, libs, id, beforeIds, hooks),
          });
          dispatchedRunId = id;
          return yield* Effect.fail(libs.Interactive.CANCELLED);
        }),
      ),
    );

/**
 * Agentic modification port for the shared interactive flows: gate on
 * the runs extension, snapshot the named skill's raw file, dispatch an
 * editor run through the pi-runs engine, then unwind the shared
 * `modifySkill` flow with `CANCELLED` (the run, not this flow, writes
 * the skill). The run id lands in a module-level ref that
 * {@link runModifyFlow} reads to distinguish a dispatch from a real
 * cancel. When the run settles, {@link modifyCompletion} re-reads and
 * persists the named skill.
 * @param root - workspace root (skill store owner)
 * @param hooks - TUI completion callbacks, if any
 * @returns modifier port for the interactive flows
 */
export const modifyFor =
  (root: string, hooks?: ModifyFlowHooks): Interactive.SkillModifier =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        Effect.gen(function* () {
          const installed = yield* Runs.runsExtensionInstalled(root);
          if (!installed) return yield* Effect.fail(Runs.RUNS_EXTENSION_INSTALL_HINT);
          const beforeRaw = yield* readRawSkill(root, input.skill.id);
          const id = yield* Runs.newRunId('modify-skill');
          yield* Runs.startRun(root, {
            id,
            name: `Modify skill: ${input.skill.id}`,
            prompt: buildHeadlessPrompt(
              libs.Interactive.MODIFY_PREPROMPT +
                '\n\nSkill to edit: ' +
                input.skill.id +
                libs.Skill.formatInjectedSkills(input.inject),
              `Change request: ${input.instruction}`,
              libs.Interactive.MODIFY_POSTPROMPT,
            ),
            model: input.modelLabel,
            tools: [...Runs.DEFAULT_RUN_TOOLS],
            onSettled: modifyCompletion(root, libs, id, input.skill.id, beforeRaw, hooks),
          });
          dispatchedModifyRunId = id;
          return yield* Effect.fail(libs.Interactive.CANCELLED);
        }),
      ),
    );

/**
 * File-backed `SkillStore` port for the shared interactive flows: the
 * workspace host behind `Interactive.createSkill` / `modifySkill` /
 * the requirements gate. Malformed files skip on list (dashboard
 * convention); saves and deletes carry string errors.
 * @param root - workspace root (skill store owner)
 * @returns store port for the interactive flows
 */
export const storeFor = (root: string): Interactive.SkillStore => ({
  list: () =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        getSkills(root).pipe(
          Effect.flatMap(({ skills }) =>
            Effect.forEach(skills, (row) =>
              toSkill(libs, row).pipe(Effect.orElseSucceed(() => undefined)),
            ),
          ),
          Effect.map((all) => all.filter((skill): skill is Skill.Skill => skill !== undefined)),
        ),
      ),
    ),
  save: (skill) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        saveSkill(root, fromSkill(libs, skill)).pipe(Effect.mapError((error) => error.message)),
      ),
    ),
  delete: (id) => deleteSkill(root, id).pipe(Effect.mapError((error) => error.message)),
  readRaw: (id) => {
    if (!isValidSkillId(id)) return Effect.fail(`Unknown skill '${id}'.`);
    return Effect.promise(() =>
      readFile(join(root, ...PANEL_DIRS.skills, id, 'SKILL.md'), 'utf8').then(
        (raw) => raw,
        () => undefined,
      ),
    ).pipe(
      Effect.flatMap((raw) =>
        raw === undefined ? Effect.fail(`Unknown skill '${id}'.`) : Effect.succeed(raw),
      ),
    );
  },
});

/**
 * Skill installer port for the shared interactive flows (the
 * requirements gate): named installs via the skills CLI.
 * @param root - workspace root (install target)
 * @returns installer port for the interactive flows
 */
export const installerFor =
  (root: string): Interactive.SkillInstaller =>
  (names) =>
    installSkillNames(root, names).pipe(Effect.mapError((error) => error.message));

/**
 * Overlay ports the TUI injects into the flow runners: dialogs plus the
 * model picker and working overlay. All `Interactive` references are
 * type positions — the runtime stays behind the lazy loader.
 */
export interface FlowPorts {
  readonly ui: Interactive.InteractiveUi;
  readonly modelPicker: Interactive.ModelPickerFn;
  readonly loading: Interactive.LoadingFn;
}

/**
 * Workspace host for the shared create flow: load the extension,
 * resolve picker models, run `createSkill` (manual or agentic behind
 * the overlays). Manual creation persists and lands on the new skill's
 * detail; agentic creation dispatches a run through the engine and
 * resolves `dispatched`; real cancels resolve undefined. The TUI needs
 * no `CANCELLED` knowledge — only real failures reject.
 * @param root - workspace root (skill store owner)
 * @param ports - TUI overlay ports
 * @param hooks - completion callbacks for a dispatched author run
 * @returns Effect resolving to the create outcome, or undefined on cancel
 */
export const runCreateFlow = (
  root: string,
  ports: FlowPorts,
  hooks?: CreateFlowHooks,
): Effect.Effect<CreateFlowResult | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const refs = yield* listModelLabels();
        const fallback = yield* listDefaultModel();
        dispatchedRunId = undefined;
        const skill = yield* libs.Interactive.createSkill(
          ports.ui,
          libs.Interactive.modelOptions(fallback, refs),
          generateFor(root, hooks),
          storeFor(root),
          installerFor(root),
          undefined,
          ports.modelPicker,
          ports.loading,
        );
        const row = fromSkill(libs, skill);
        yield* saveSkill(root, row).pipe(Effect.mapError((failure) => failure.message));
        return { kind: 'saved', skill: row } satisfies CreateFlowResult;
      }).pipe(
        Effect.catch((error) => {
          if (error !== libs.Interactive.CANCELLED) return Effect.fail(error);
          const runId = dispatchedRunId;
          dispatchedRunId = undefined;
          return Effect.succeed(
            runId === undefined
              ? undefined
              : ({ kind: 'dispatched', runId } satisfies CreateFlowResult),
          );
        }),
      ),
    ),
  );

/**
 * Workspace host for the shared modify flow for one skill: load the
 * extension, run `modifySkill` (manual description edit or agentic
 * rewrite). Manual edits persist and resolve `saved`; agentic edits
 * dispatch an editor run and resolve `dispatched`; real cancels resolve
 * undefined. The TUI needs no `CANCELLED` knowledge — only real
 * failures reject.
 * @param root - workspace root (skill store owner)
 * @param id - skill id under edit
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
        const skills = yield* storeFor(root).list();
        const refs = yield* listModelLabels();
        const fallback = yield* listDefaultModel();
        dispatchedModifyRunId = undefined;
        const skill = yield* libs.Interactive.modifySkill(
          ports.ui,
          skills,
          id,
          libs.Interactive.modelOptions(fallback, refs),
          modifyFor(root, hooks),
          storeFor(root),
          installerFor(root),
          ports.modelPicker,
          ports.loading,
        );
        const row = fromSkill(libs, skill);
        yield* saveSkill(root, row).pipe(Effect.mapError((failure) => failure.message));
        return { kind: 'saved', skill: row } satisfies ModifyFlowResult;
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

/** skills CLI arguments installing named requirement skills, project-local. */
export const installArgsFor = (names: ReadonlyArray<string>): ReadonlyArray<string> => [
  'skills',
  'add',
  'montflow/montflow',
  ...names.flatMap((name) => ['-s', name]),
  '-a',
  'pi',
  '-y',
];

/**
 * Install named requirement skills via the `skills` CLI (the gate behind
 * agentic flows), project-local into `<root>/.agents/skills/`.
 * @param root - workspace root (install target)
 * @param names - skill names to install
 * @returns Effect completing once installed, failing with CLI output
 */
export const installSkillNames = (
  root: string,
  names: ReadonlyArray<string>,
): Effect.Effect<void, InstallError> =>
  Effect.tryPromise({
    try: () =>
      promisify(execFile)('npx', [...installArgsFor(names)], { cwd: root, timeout: 180_000 }).then(
        () => undefined,
      ),
    catch: (cause) =>
      new InstallError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
  });
