// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/skills; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for skill files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: home directory for the model catalogue; goes away with the FileSystem migration.
import { homedir } from 'node:os';
import type { Skill } from '@montflow/skills';
import { Data, Effect, Schema } from 'effect';

/**
 * Lazy handle to the skills extension runtime. Static imports from
 * `@montflow/skills` are type-only (erased at build) — the runtime
 * resolves here, on first flow use, never at dashboard boot. A broken
 * or missing extension therefore cannot crash the TUI; the failing
 * flow surfaces the load error as a toast instead.
 */
type PiSkillsLib = typeof import('@montflow/skills');

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
  cachedLib ??= import('@montflow/skills').then(
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
export type ExtensionPanel = 'skills' | 'prompts' | 'profiles';

/** Directory segments (under the workspace root) proving a panel installed. */
const PANEL_DIRS = {
  skills: ['.agents', 'skills'],
  prompts: ['.agents', '@montflow', 'pi-prompts'],
  profiles: ['.agents', '@montflow', 'profiles'],
} satisfies Record<ExtensionPanel, ReadonlyArray<string>>;

/** Copy shown behind the install keybind per panel. */
const INSTALL_HINTS = {
  skills: 'npx skills add montflow/montflow -a pi -y',
  prompts: 'prompt packs land next',
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
 * `@montflow/skills` so both hosts produce identical files.
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

/** The pi session defaults: the provider/model pair headless sessions fall back to. */
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
