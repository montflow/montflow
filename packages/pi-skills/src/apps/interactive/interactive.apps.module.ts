import { Effect } from 'effect';
import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import * as Skill from '../../modules/skill/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-skills`). */
export const COMMAND_NAME = 'mf-skills';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Browse, create (manually or with an agent), show, modify (manually or with an agent), and delete workspace skills.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-skills [browse | list | create [name] | show <name> | modify [name] | delete [name] | help]';

/** Failure value when the user cancels a dialog. Notified as info, not an error. */
export const CANCELLED = 'Cancelled.';

/**
 * Instructions before the user description: the child agent authors
 * exactly one skill, then stops. Transported as the preprompt.
 * Lives here (not the pi extension entry) so every host — the pi
 * extension and the workspace TUI headless runner — shares one copy.
 */
export const AUTHOR_PREPROMPT = `You are a skill author for a pi coding agent.

Create exactly one new skill following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

---
name: <kebab-case-name>
description: <one or two sentences: when to use this skill, what it does>
groups: [<optional comma-separated group tags>]
dependencies: [<optional names of skills this one depends on>]
---

<Body: concise, actionable instructions for the agent that will load this
skill. Use short sections and bullet lists. Include concrete steps, expected
inputs/outputs, and any edge cases. Keep it focused — no filler.>

Rules:
- Write the new skill at .agents/skills/<name>/SKILL.md (choose a kebab-case
  <name> that fits the description), with the frontmatter block exactly as
  shown (name/description required; groups/dependencies optional).
- The description must say WHEN to use the skill (it drives skill selection).
- If a skill with that name already exists, pick a fresh name instead.
- Do not touch anything outside .agents/skills/.`;

/**
 * Instructions after the user description: the reply shape.
 * Transported as the postprompt.
 */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the skill name and what it does.';

/**
 * Instructions before the change request: the child agent edits exactly
 * the named skill in place, then stops. Transported as the preprompt.
 */
export const MODIFY_PREPROMPT =
  'You are a skill editor for a pi coding agent. Edit exactly the skill named below, then stop. ' +
  'Do not ask follow-up questions — work from the change request as given. ' +
  'Do not rename the skill directory. Keep frontmatter keys valid (name/description required; groups/dependencies optional). ' +
  'Keep the description saying WHEN to use the skill. Do not touch anything outside that skill directory.';

/**
 * Instructions after the change request: the reply shape.
 * Transported as the postprompt.
 */
export const MODIFY_POSTPROMPT =
  'When done, reply with one short line: the skill name and what changed.';

/**
 * Instructions before the fix request: the child agent brings exactly the
 * named skill into the standard format, then stops. Transported as the
 * preprompt.
 */
export const TRANSFORM_PREPROMPT =
  'You are a skill editor for a pi coding agent. Bring exactly the skill named below ' +
  'into the standard skill format, then stop. Do not ask follow-up questions. ' +
  'Keep what the skill teaches unchanged — fix the shape only: frontmatter must have ' +
  'name (matching the directory), description (1-2 sentences saying WHEN to use the skill), ' +
  'id (keep the existing 16-hex value unchanged), author, version (SemVer), ' +
  'plus groups/dependencies lists when non-empty; ' +
  'the body must have `# When To Use`, `# Pipeline`, and `# Reference` sections. ' +
  'Do not rename the skill directory. Do not touch anything outside that skill directory.';

/**
 * Instructions after the fix request: the reply shape.
 * Transported as the postprompt.
 */
export const TRANSFORM_POSTPROMPT =
  'When done, reply with one short line: the skill name and what was fixed.';

/**
 * Minimal UI surface the flows need. Mirrors Pi's own narrowing for dialogs,
 * so any real `ctx.ui` is assignable and fakes stay tiny.
 */
export interface InteractiveUi {
  readonly select: (title: string, options: string[]) => Promise<string | undefined>;
  readonly confirm: (title: string, message: string) => Promise<boolean>;
  readonly input: (title: string, placeholder?: string) => Promise<string | undefined>;
  readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
  /** Live filter-as-you-type picker. Absent outside the TUI (falls back to input+select). */
  readonly searchSelect?: (title: string, options: string[]) => Promise<string | undefined>;
}

/** UI surface available where custom TUI components can render (TUI mode). */
export interface FilterUi extends InteractiveUi {
  readonly custom: ExtensionUIContext['custom'];
}

/** Persistence port the consuming extension injects (file store, memory, router). */
export interface SkillStore {
  readonly list: () => Effect.Effect<readonly Skill.Skill[], string>;
  readonly save: (skill: Skill.Skill) => Effect.Effect<void, string>;
  readonly delete: (id: string) => Effect.Effect<void, string>;
  /** Raw `SKILL.md` contents for mechanical verification. Fails on unknown ids. */
  readonly readRaw: (id: string) => Effect.Effect<string, string>;
}

/** One model offered for agentic runs: `provider/model-id` plus current-run marker. */
export interface ModelOption {
  readonly label: string;
  readonly current: boolean;
}

/** Agentic skill generation port the consuming extension injects (child agent run). */
export interface GenerateInput {
  readonly description: string;
  readonly modelLabel: string | undefined;
  readonly inject: ReadonlyArray<Skill.Skill>;
}

export type SkillGenerator = (input: GenerateInput) => Effect.Effect<Skill.Skill, string>;

/** Agentic skill modification port the consuming extension injects (child agent run). */
export interface ModifyInput {
  readonly skill: Skill.Skill;
  readonly instruction: string;
  readonly modelLabel: string | undefined;
  readonly inject: ReadonlyArray<Skill.Skill>;
}

export type SkillModifier = (input: ModifyInput) => Effect.Effect<Skill.Skill, string>;

/** Minimal model reference carried from the Pi context (provider + id only). */
export interface ModelRef {
  readonly provider: string;
  readonly id: string;
}

/** Minimal model catalogue carried from the Pi context. */
export interface ModelCatalog {
  readonly getAvailable: () => ReadonlyArray<ModelRef>;
}

/** Where the model picker reads from: current, scoped, catalogue fallback. */
export interface ModelSource {
  readonly model: ModelRef | undefined;
  readonly scopedModels: ReadonlyArray<{ readonly model: ModelRef }>;
  readonly modelRegistry: ModelCatalog;
}

/**
 * TUI model picker port the consuming extension injects (search UI with the
 * current session model pinned). Absent outside the TUI (falls back to the
 * menu-driven `pickModel`).
 */
export type ModelPickerFn = (models: ReadonlyArray<ModelOption>) => Promise<string | undefined>;

/**
 * TUI loading-modal port the consuming extension injects (spinner that
 * locks input while a closed Effect runs). Absent outside the TUI
 * (runs the Effect directly).
 */
export type LoadingFn = <A, E>(
  message: string,
  self: Effect.Effect<A, E, never>,
) => Effect.Effect<A, E>;

/**
 * Skill installer port the consuming extension injects (fetches missing
 * skills into the workspace store).
 */
export type SkillInstaller = (names: ReadonlyArray<string>) => Effect.Effect<void, string>;

/** Command environment: dialogs, cwd, resolved picker options, and injected ports. */
export interface CommandEnv {
  readonly ui: InteractiveUi;
  readonly cwd: string;
  readonly models: ReadonlyArray<ModelOption>;
  readonly modelPicker: ModelPickerFn | undefined;
  readonly loading: LoadingFn | undefined;
  readonly installer: SkillInstaller;
  readonly menu: MenuFn | undefined;
  /** Agentic format-transform port (fix a skill to the standard shape). */
  readonly transform: SkillModifier;
}

/** Narrow command surface the registration needs — full Pi APIs remain assignable. */
export interface CommandApi {
  readonly registerCommand: (
    name: string,
    options: {
      readonly description: string;
      readonly handler: (
        args: string,
        ctx: { readonly ui: FilterUi; readonly cwd: string; readonly mode: string } & ModelSource,
      ) => Promise<void>;
    },
  ) => void;
}

/** Parsed `/mf-skills` invocation. */
export type Action =
  | { readonly kind: 'Menu' }
  | { readonly kind: 'Browse' }
  | { readonly kind: 'List' }
  | { readonly kind: 'Help' }
  | { readonly kind: 'Create'; readonly name: string | undefined }
  | { readonly kind: 'Show'; readonly name: string }
  | { readonly kind: 'Modify'; readonly name: string | undefined }
  | { readonly kind: 'Delete'; readonly name: string | undefined };

/**
 * Split args on whitespace, keeping `"quoted spans"` together (quotes stripped).
 * @param args - raw slash-command args
 * @returns token list
 */
export const tokenize = (args: string): readonly string[] => {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of args.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter((token) => token !== '');
};

/**
 * Parse raw slash-command args into an {@link Action}. Bare `/mf-skills`
 * opens the menu; a lone unknown token is treated as `show <name>` shortcut.
 * @param args - raw slash-command args
 * @returns the parsed action
 */
export const parseAction = (args: string): Action => {
  const tokens = tokenize(args);
  const head = tokens[0];
  if (head === undefined) return { kind: 'Menu' };
  switch (head) {
    case 'browse':
      return { kind: 'Browse' };
    case 'list':
      return { kind: 'List' };
    case 'create':
      return { kind: 'Create', name: tokens[1] };
    case 'show':
      return tokens[1] === undefined ? { kind: 'Menu' } : { kind: 'Show', name: tokens[1] };
    case 'modify':
      return { kind: 'Modify', name: tokens[1] };
    case 'delete':
      return { kind: 'Delete', name: tokens[1] };
    case 'help':
    case '--help':
    case '-h':
      return { kind: 'Help' };
    default:
      return tokens.length === 1 ? { kind: 'Show', name: head } : { kind: 'Help' };
  }
};

/**
 * Notify the skill list, or a hint when empty.
 * @param ui - Pi ui dialogs
 * @param skills - skills to list
 * @returns Effect completing once notified
 */
export const listSkills = (
  ui: InteractiveUi,
  skills: readonly Skill.Skill[],
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (skills.length === 0) {
      ui.notify('No skills yet — create one with `/mf-skills create <name>`.', 'info');
      return;
    }
    ui.notify(skills.map((skill) => `• ${skill.id} — ${skill.description}`).join('\n'), 'info');
  });

/**
 * Notify a skill's description and body, failing on unknown names.
 * Matches by directory id first, then frontmatter name.
 * @param ui - Pi ui dialogs
 * @param skills - skills to search
 * @param name - skill id or name
 * @returns Effect completing once notified, failing on unknown names
 */
export const showSkill = (
  ui: InteractiveUi,
  skills: readonly Skill.Skill[],
  name: string,
): Effect.Effect<void, string> => {
  const skill = skills.find((candidate) => candidate.id === name || candidate.name === name);
  if (skill === undefined) return Effect.fail(`Unknown skill '${name}'.`);
  return Effect.sync(() => {
    const header = skill.description === '' ? skill.id : `${skill.id} — ${skill.description}`;
    ui.notify(
      skill.body === '' ? `${header}\n(no body instructions yet)` : `${header}\n\n${skill.body}`,
      'info',
    );
  });
};

/**
 * Manual create flow: name (when missing) then description via dialogs.
 * The directory id is slugified from the name.
 * @param ui - Pi ui dialogs
 * @param name - initial name, if already given
 * @returns Effect resolving to the new descriptor, failing on cancel or blank input
 */
export const createManual = (
  ui: InteractiveUi,
  name: string | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    let resolved = (name ?? '').trim();
    if (resolved === '') {
      const entered = yield* Effect.promise(() => ui.input('Skill name', 'code-reviewer'));
      if (entered === undefined) return yield* Effect.fail(CANCELLED);
      resolved = entered.trim();
    }
    if (resolved === '') return yield* Effect.fail('Skill name must not be empty.');
    const id = Skill.slugify(resolved);
    if (!Skill.isValidName(id)) return yield* Effect.fail(`Invalid skill name '${resolved}'.`);
    const description = yield* Effect.promise(() => ui.input('Description'));
    if (description === undefined) return yield* Effect.fail(CANCELLED);
    if (description.trim() === '') return yield* Effect.fail('Description must not be empty.');
    return yield* Skill.decodeUnknown({
      id,
      name: resolved,
      description,
      groups: [],
      dependencies: [],
      body: '',
    }).pipe(Effect.mapError(() => `Invalid skill name '${resolved}'.`));
  });

/**
 * Resolve the modify target: use the named skill when given, else pick
 * from the list via dialog.
 * @param ui - Pi ui dialogs
 * @param skills - skills to search
 * @param name - skill id or name, if already given
 * @returns Effect resolving to the target skill, failing on cancel or unknown names
 */
export const resolveModifyTarget = (
  ui: InteractiveUi,
  skills: readonly Skill.Skill[],
  name: string | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    let resolved = name;
    if (resolved === undefined) {
      if (skills.length === 0) return yield* Effect.fail('No skills yet — create one first.');
      const chosen = yield* Effect.promise(() =>
        ui.select(
          'Modify skill',
          skills.map((skill) => skill.id),
        ),
      );
      if (chosen === undefined) return yield* Effect.fail(CANCELLED);
      resolved = chosen;
    }
    const skill = skills.find(
      (candidate) => candidate.id === resolved || candidate.name === resolved,
    );
    if (skill === undefined) return yield* Effect.fail(`Unknown skill '${resolved}'.`);
    return skill;
  });

/**
 * Pick the authoring model for an agentic run: session model when the
 * catalogue is empty, the injected TUI widget when provided (current
 * session model pinned first, single-keystroke keep), else the
 * menu-driven `pickModel`. Notifies the chosen runtime, unless the
 * loading modal is showing it instead.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @param modelPicker - TUI widget port, if available
 * @param verb - progress verb for the notify line (Generating/Modifying)
 * @param loading - TUI loading-modal port, if available (silences notifies)
 * @returns Effect resolving to the picked label (undefined = session model)
 */
export const pickAgenticModel = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  modelPicker: ModelPickerFn | undefined,
  verb: string,
  loading?: LoadingFn | undefined,
): Effect.Effect<string | undefined, string> =>
  Effect.gen(function* () {
    const silent = loading !== undefined;
    if (models.length === 0) {
      if (!silent)
        yield* Effect.sync(() => ui.notify(`${verb} skill with the session model…`, 'info'));
      return undefined;
    }
    if (modelPicker !== undefined) {
      const picked = yield* Effect.promise(() => modelPicker(models));
      if (picked === undefined) return yield* Effect.fail(CANCELLED);
      if (!silent) yield* Effect.sync(() => ui.notify(`${verb} skill with ${picked}…`, 'info'));
      return picked;
    }
    const picked = yield* pickModel(ui, models);
    yield* Effect.sync(() => ui.notify(`${verb} skill with ${picked}…`, 'info'));
    return picked;
  });

/**
 * Run an agentic Effect behind the loading modal when available, else
 * directly. The modal message names the runtime the spinner covers.
 * @param loading - TUI loading-modal port, if available
 * @param message - status text beside the spinner
 * @param self - closed Effect to run
 * @returns Effect resolving to the wrapped value, failing with its error
 */
export const runWithLoading = <A, E>(
  loading: LoadingFn | undefined,
  message: string,
  self: Effect.Effect<A, E, never>,
): Effect.Effect<A, E> => (loading !== undefined ? loading(message, self) : self);

/** Row label advancing the gate with the checked skills. */
export const REQUIREMENTS_CONTINUE = 'Continue with checked skills';

/** Row label installing every missing required skill. */
export const REQUIREMENTS_INSTALL = 'Install missing skills';

/** Main-menu entry installing the missing required skills. Shown only when some are missing. */
export const MENU_INSTALL = 'Install required skills';

/**
 * TUI main-menu port the consuming extension injects (heading, info
 * panel, then options). Absent outside the TUI (falls back to Pi-native
 * `select`).
 */
export type MenuFn = (
  title: string,
  info: ReadonlyArray<string>,
  options: ReadonlyArray<string>,
) => Effect.Effect<string | undefined>;

/**
 * Every skill any agentic flow in this command may inject: the union of
 * the generation and modification requirements. Drives the main-menu
 * info-panel line and the install entry.
 */
export const MENU_REQUIREMENTS: ReadonlyArray<string> = [
  ...new Set([...Skill.GENERATION_REQUIREMENTS, ...Skill.MODIFICATION_REQUIREMENTS]),
];

/**
 * Main-menu info-panel line: generic dependency state without naming
 * each skill. Rendered in the `Batch.box` panel, verdict first.
 * @param statuses - statuses from {@link Skill.checkRequirements}
 * @returns one generic status line for the panel
 */
export const menuInfoLine = (statuses: ReadonlyArray<Skill.RequirementStatus>): string => {
  const missing = Skill.missingRequirements(statuses);
  if (missing.length === 0) return '✓ dependencies installed';
  return '✗ dependencies missing';
};

/** Display row for one required skill: checked when it will inject. */
export const requirementRow = (status: Skill.RequirementStatus, selected: boolean): string => {
  if (!status.present) return `✗ ${status.name} — not installed`;
  if (selected) return `✓ ${status.name} — installed, will inject`;
  return `○ ${status.name} — installed, skip`;
};

/**
 * Requirements gate for an agentic run: checklist every required skill
 * (checked = will inject, toggle by picking), installing the missing
 * ones on request. Present skills start checked; the check itself is the
 * pure {@link Skill.checkRequirements} — this flow only presents it.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @param installer - injected skill installer port
 * @param required - required skill names (from `Skill.*_REQUIREMENTS`)
 * @param purpose - flow name for the dialog title
 * @param selected - checked names, defaulting to every installed one
 * @returns Effect resolving to the skills to inject, failing on cancel
 */
export const ensureRequirements = (
  ui: InteractiveUi,
  store: SkillStore,
  installer: SkillInstaller,
  required: ReadonlyArray<string>,
  purpose: string,
  selected?: ReadonlySet<string> | undefined,
): Effect.Effect<ReadonlyArray<Skill.Skill>, string> =>
  Effect.gen(function* () {
    const installed = yield* store.list();
    const statuses = Skill.checkRequirements(installed, required);
    const checked =
      selected ?? new Set(statuses.filter((status) => status.present).map((status) => status.name));
    const missing = Skill.missingRequirements(statuses);
    const rows = [
      REQUIREMENTS_CONTINUE,
      ...statuses.map((status) => requirementRow(status, checked.has(status.name))),
      ...(missing.length > 0 ? [REQUIREMENTS_INSTALL] : []),
    ];
    const picked = yield* Effect.promise(() => ui.select(`Options — ${purpose}`, rows));
    if (picked === undefined) return yield* Effect.fail(CANCELLED);
    if (picked === REQUIREMENTS_CONTINUE) {
      return Skill.resolveInjection(installed, [...checked]);
    }
    if (picked === REQUIREMENTS_INSTALL) {
      yield* installer(missing);
      yield* Effect.sync(() => ui.notify(`Installed ${missing.join(', ')}.`, 'info'));
      return yield* ensureRequirements(ui, store, installer, required, purpose, undefined);
    }
    const status = statuses.find(
      (candidate) => requirementRow(candidate, checked.has(candidate.name)) === picked,
    );
    if (status === undefined) return yield* Effect.fail(`Unknown requirement '${picked}'.`);
    if (!status.present) {
      yield* Effect.sync(() =>
        ui.notify(`'${status.name}' is not installed — install missing skills first.`, 'info'),
      );
      return yield* ensureRequirements(ui, store, installer, required, purpose, checked);
    }
    const next = new Set(checked);
    if (next.has(status.name)) {
      next.delete(status.name);
    } else {
      next.add(status.name);
    }
    return yield* ensureRequirements(ui, store, installer, required, purpose, next);
  });

/**
 * Manual modify flow: pick the skill (when unnamed) then enter a new
 * description. Persists nothing itself — the caller saves the returned
 * descriptor.
 * @param ui - Pi ui dialogs
 * @param skills - skills to search
 * @param name - skill id or name, if already given
 * @returns Effect resolving to the updated descriptor, failing on cancel or unknown names
 */
export const modifyManual = (
  ui: InteractiveUi,
  skills: readonly Skill.Skill[],
  name: string | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const skill = yield* resolveModifyTarget(ui, skills, name);
    const description = yield* Effect.promise(() =>
      ui.input(`Description for '${skill.id}'`, skill.description),
    );
    if (description === undefined) return yield* Effect.fail(CANCELLED);
    if (description.trim() === '') return yield* Effect.fail('Description must not be empty.');
    return yield* Skill.decodeUnknown({ ...Skill.encode(skill), description }).pipe(
      Effect.mapError(() => `Invalid description for skill '${skill.id}'.`),
    );
  });

/**
 * Agentic modify flow: pick the skill (when unnamed), describe the change,
 * pick the authoring model (current session model first), then run the
 * injected modifier behind the loading modal when available. Uses the
 * injected TUI widget when provided, else the menu-driven `pickModel` —
 * same picker as {@link createAgentic}.
 * @param ui - Pi ui dialogs
 * @param skills - skills to search
 * @param name - skill id or name, if already given
 * @param models - picker options from {@link modelOptions}
 * @param modify - injected agentic modification port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect resolving to the modified skill, failing on cancel or agent errors
 */
export const modifyAgentic = (
  ui: InteractiveUi,
  skills: readonly Skill.Skill[],
  name: string | undefined,
  models: ReadonlyArray<ModelOption>,
  modify: SkillModifier,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const skill = yield* resolveModifyTarget(ui, skills, name);
    const inject = yield* ensureRequirements(
      ui,
      store,
      installer,
      Skill.MODIFICATION_REQUIREMENTS,
      'agentic skill modification',
    );
    const entered = yield* Effect.promise(() =>
      ui.input(`How should the agent change '${skill.id}'?`),
    );
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const instruction = entered.trim();
    if (instruction === '') return yield* Effect.fail('Instruction must not be empty.');
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Modifying', loading);
    const message =
      modelLabel === undefined
        ? `Modifying skill '${skill.id}' with the session model…`
        : `Modifying skill '${skill.id}' with ${modelLabel}…`;
    return yield* runWithLoading(
      loading,
      message,
      modify({ skill, instruction, modelLabel, inject }),
    );
  });

/**
 * Modify flow entry: manual vs agentic choice, then the chosen flow.
 * Persists nothing itself — the caller saves the returned descriptor.
 * @param ui - Pi ui dialogs
 * @param skills - skills to search
 * @param name - skill id or name, if already given
 * @param models - picker options from {@link modelOptions}
 * @param modify - injected agentic modification port
 * @param modelPicker - TUI widget port, if available
 * @returns Effect resolving to the updated descriptor, failing on cancel or unknown names
 */
export const modifySkill = (
  ui: InteractiveUi,
  skills: readonly Skill.Skill[],
  name: string | undefined,
  models: ReadonlyArray<ModelOption>,
  modify: SkillModifier,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const mode = yield* Effect.promise(() =>
      ui.select('Modify skill', ['Modify with agent', 'Modify manually']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Modify with agent')
      return yield* modifyAgentic(
        ui,
        skills,
        name,
        models,
        modify,
        store,
        installer,
        modelPicker,
        loading,
      );
    return yield* modifyManual(ui, skills, name);
  });

/**
 * Model picker options: the current session model first (marked), then
 * scoped models, deduplicated by label. Pure constructors for tests.
 * @param current - current session model, if any
 * @param catalog - other models (scoped or full catalogue)
 * @returns picker options, possibly empty
 */
export const modelOptions = (
  current: ModelRef | undefined,
  catalog: ReadonlyArray<ModelRef>,
): ReadonlyArray<ModelOption> => {
  const options: Array<ModelOption> = [];
  const seen = new Set<string>();
  const push = (provider: string, id: string, isCurrent: boolean): void => {
    const label = `${provider}/${id}`;
    if (seen.has(label)) return;
    seen.add(label);
    options.push({ label, current: isCurrent });
  };
  if (current !== undefined) push(current.provider, current.id, true);
  for (const entry of catalog) push(entry.provider, entry.id, false);
  return options;
};

/**
 * Resolve picker options from the command source: scoped models when the
 * session scopes them, otherwise the live catalogue (models with usable
 * auth). Pure and total — catalogue reads are sync snapshots.
 * @param source - model source from the Pi context
 * @returns picker options, possibly empty
 */
export const resolveModelOptions = (source: ModelSource): ReadonlyArray<ModelOption> => {
  if (source.scopedModels.length > 0) {
    return modelOptions(
      source.model,
      source.scopedModels.map((scoped) => scoped.model),
    );
  }
  return modelOptions(source.model, source.modelRegistry.getAvailable());
};

/**
 * Subsequence fuzzy match: every query character appears in the label in
 * order (not necessarily consecutive). Case-insensitive. Stays
 * dependency-light on purpose — the workspace TUI owns the Fuse-based
 * search; the extension keeps the zero-dep subsequence matcher.
 * @param label - model label to test
 * @param query - user filter text
 * @returns true when the label matches
 */
export const matchesFilter = (label: string, query: string): boolean => {
  const haystack = label.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  let position = 0;
  for (const char of needle) {
    position = haystack.indexOf(char, position);
    if (position === -1) return false;
    position++;
  }
  return true;
};

/** Display label with the current-run marker. */
const displayModel = (option: ModelOption): string =>
  option.current ? `${option.label} (current)` : option.label;

/** Bottom menu entry opening the filter step. */
export const PICK_ANOTHER = 'Pick another model…';

/**
 * Map a picked display label back to its model label.
 * @param models - picker options
 * @param picked - display label from a dialog
 * @returns Effect resolving to the model label, failing on unknown picks
 */
const modelLabelFor = (
  models: ReadonlyArray<ModelOption>,
  picked: string,
): Effect.Effect<string, string> => {
  const match = models.find((option) => displayModel(option) === picked || option.label === picked);
  if (match === undefined) return Effect.fail(`Unknown model '${picked}'.`);
  return Effect.succeed(match.label);
};

/**
 * Model picker menu: the current model first and a bottom
 * `Pick another model…` entry. The filter step uses the live
 * search dialog when provided, else input-then-select.
 * Non-TUI path — the TUI uses the injected `ModelPickerFn` widget instead.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @returns Effect resolving to the picked label, failing on cancel or no match
 */
export const pickModel = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    const first = yield* Effect.promise(() =>
      ui.select('Model for the authoring run', [...models.map(displayModel), PICK_ANOTHER]),
    );
    if (first === undefined) return yield* Effect.fail(CANCELLED);
    if (first !== PICK_ANOTHER) return yield* modelLabelFor(models, first);
    const search = ui.searchSelect;
    if (search !== undefined) {
      const picked = yield* Effect.promise(() => search('Filter models', models.map(displayModel)));
      if (picked === undefined) return yield* Effect.fail(CANCELLED);
      return yield* modelLabelFor(models, picked);
    }
    const entered = yield* Effect.promise(() => ui.input('Filter models', 'sonnet'));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const query = entered.trim();
    const candidates =
      query === '' ? models : models.filter((option) => matchesFilter(option.label, query));
    if (candidates.length === 0) return yield* Effect.fail(`No models match '${query}'.`);
    const picked = yield* Effect.promise(() =>
      ui.select('Model for the authoring run', candidates.map(displayModel)),
    );
    if (picked === undefined) return yield* Effect.fail(CANCELLED);
    return yield* modelLabelFor(candidates, picked);
  });

/**
 * Agentic create flow: describe the skill, pick the authoring model
 * (current session model first), then run the injected generator behind
 * the loading modal when available. Uses the injected TUI widget when
 * provided, else the menu-driven `pickModel`.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link modelOptions}
 * @param generate - injected agentic generation port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect resolving to the generated skill, failing on cancel or agent errors
 */
export const createAgentic = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: SkillGenerator,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const inject = yield* ensureRequirements(
      ui,
      store,
      installer,
      Skill.GENERATION_REQUIREMENTS,
      'agentic skill creation',
    );
    const entered = yield* Effect.promise(() => ui.input('Describe the skill'));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const description = entered.trim();
    if (description === '') return yield* Effect.fail('Description must not be empty.');
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Generating', loading);
    const message =
      modelLabel === undefined
        ? 'Generating skill with the session model…'
        : `Generating skill with ${modelLabel}…`;
    return yield* runWithLoading(loading, message, generate({ description, modelLabel, inject }));
  });

/**
 * Create flow entry: manual vs agentic choice, then the chosen flow.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link modelOptions}
 * @param generate - injected agentic generation port
 * @param name - initial manual name, if already given
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect resolving to the new skill, failing on cancel or blank input
 */
export const createSkill = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: SkillGenerator,
  store: SkillStore,
  installer: SkillInstaller,
  name: string | undefined,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const mode = yield* Effect.promise(() =>
      ui.select('Create skill', ['Create with agent', 'Create manually']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Create with agent')
      return yield* createAgentic(ui, models, generate, store, installer, modelPicker, loading);
    return yield* createManual(ui, name);
  });

/**
 * Finish a create: announce the saved file, then land on the new skill's
 * detail menu (Show / Modify / Re-verify / Delete / Back, plus
 * Transform when unverified) so it can be inspected right away.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @param skill - the saved skill
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @param transform - injected agentic format-transform port
 * @param installer - injected skill installer port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @param menu - TUI main-menu port, if available
 * @returns Effect completing once the detail menu exits
 */
export const completeCreate = (
  ui: InteractiveUi,
  store: SkillStore,
  skill: Skill.Skill,
  models: ReadonlyArray<ModelOption>,
  modify: SkillModifier,
  transform: SkillModifier,
  installer: SkillInstaller,
  modelPicker: ModelPickerFn | undefined,
  loading: LoadingFn | undefined,
  menu: MenuFn | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    yield* Effect.sync(() =>
      ui.notify(`Saved skill '${skill.id}' — .agents/skills/${skill.id}/SKILL.md`, 'info'),
    );
    yield* detailFrom(
      ui,
      store,
      skill.id,
      models,
      modify,
      transform,
      installer,
      modelPicker,
      loading,
      menu,
    );
  });

/**
 * Delete flow: pick the skill (when unnamed), confirm, then delete.
 * Returns nothing itself — the caller notifies.
 * @param ui - Pi ui dialogs
 * @param skills - skills to search
 * @param store - injected persistence port
 * @param name - skill id or name, if already given
 * @returns Effect resolving to the deleted id, failing on cancel or unknown names
 */
export const deleteSkill = (
  ui: InteractiveUi,
  skills: readonly Skill.Skill[],
  store: SkillStore,
  name: string | undefined,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    let resolved = name;
    if (resolved === undefined) {
      if (skills.length === 0) return yield* Effect.fail('No skills yet — create one first.');
      const chosen = yield* Effect.promise(() =>
        ui.select(
          'Delete skill',
          skills.map((skill) => skill.id),
        ),
      );
      if (chosen === undefined) return yield* Effect.fail(CANCELLED);
      resolved = chosen;
    }
    const skill = skills.find(
      (candidate) => candidate.id === resolved || candidate.name === resolved,
    );
    if (skill === undefined) return yield* Effect.fail(`Unknown skill '${resolved}'.`);
    const confirmed = yield* Effect.promise(() =>
      ui.confirm(`Delete skill '${skill.id}'?`, 'This removes its SKILL.md and cannot be undone.'),
    );
    if (!confirmed) return yield* Effect.fail(CANCELLED);
    yield* store.delete(skill.id);
    return skill.id;
  });

/**
 * Browse loop: pick a skill, then loop its detail menu until Back or Delete.
 * The list refreshes after every mutation. An empty list fails on entry
 * (hint to create) but exits quietly once deletions drain it.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @param transform - injected agentic format-transform port
 * @param installer - injected skill installer port
 * @param modelPicker - TUI widget port, if available
 * @param menu - TUI main-menu port, if available
 * @returns Effect completing on Back or cancel, failing with displayable message
 */
export const browse = (
  ui: InteractiveUi,
  store: SkillStore,
  models: ReadonlyArray<ModelOption>,
  modify: SkillModifier,
  transform: SkillModifier,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
  menu?: MenuFn | undefined,
): Effect.Effect<void, string> =>
  browseFrom(ui, store, true, models, modify, transform, installer, modelPicker, loading, menu);

/** Detail-menu entry re-running mechanical verification on the file. */
export const DETAIL_REVERIFY = 'Re-verify';

/** Detail-menu entry fixing an unverified skill to the standard shape. */
export const DETAIL_TRANSFORM = 'Transform to standard';

/**
 * Detail-menu options for a verify result: the transform entry appears
 * near the bottom only while the skill is unverified.
 * @param result - result from {@link Skill.verifySkillFile}
 * @returns menu choices in display order
 */
export const detailOptions = (result: Skill.VerifyResult): ReadonlyArray<string> =>
  result.valid
    ? ['Show', 'Modify', DETAIL_REVERIFY, 'Delete', 'Back']
    : ['Show', 'Modify', DETAIL_REVERIFY, 'Delete', DETAIL_TRANSFORM, 'Back'];

/**
 * Verify one skill against the standard shape by reading its raw file.
 * Runs inline (no loading modal): the check is a pure function over one
 * file read, and the detail menu cannot render before the outcome lands
 * anyway — its options depend on the result. The `Batch.box` info panel
 * in the menu is where the outcome surfaces.
 * @param store - injected persistence port
 * @param id - picked skill id
 * @returns Effect resolving to the mechanical result, failing on unknown ids
 */
export const verifySkill = (
  store: SkillStore,
  id: string,
): Effect.Effect<Skill.VerifyResult, string> =>
  store.readRaw(id).pipe(Effect.map((raw) => Skill.verifySkillFile(id, raw)));

/**
 * Notify a verify outcome: one line when valid, the issue list otherwise.
 * @param ui - Pi ui dialogs
 * @param id - verified skill id
 * @param result - result from {@link verifySkill}
 * @returns Effect completing once notified
 */
export const notifyVerifyResult = (
  ui: InteractiveUi,
  id: string,
  result: Skill.VerifyResult,
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (result.valid) {
      ui.notify(`✓ '${id}' matches the standard format.`, 'info');
      return;
    }
    ui.notify(
      `✗ '${id}' has ${result.issues.length} issue${result.issues.length === 1 ? '' : 's'}:\n${result.issues.map((found) => `• [${found.field}] ${found.message}`).join('\n')}`,
      'info',
    );
  });

/** Fixed agent instruction for the format-transform run: keep the teaching, fix the shape. */
export const TRANSFORM_INSTRUCTION =
  'Bring this skill into the standard skill format without changing what it teaches: ' +
  'ensure frontmatter has name (matching the directory), description (1-2 sentences, WHEN to use), ' +
  'id (keep the existing 16-hex value unchanged), author, version (SemVer), ' +
  'plus groups/dependencies lists when non-empty; ' +
  'ensure the body has `# When To Use`, `# Pipeline`, and `# Reference` sections. ' +
  'Do not rename the skill directory. Do not touch anything outside that skill directory.';

/**
 * Agentic transform flow: resolve the fresh skill, pick the authoring
 * model, then run the injected transformer behind the loading modal when
 * available. The instruction is fixed ({@link TRANSFORM_INSTRUCTION}) —
 * no free-text prompt needed.
 * @param ui - Pi ui dialogs
 * @param skill - skill to fix
 * @param models - picker options from {@link modelOptions}
 * @param transform - injected agentic format-transform port
 * @param store - injected persistence port (requirement gate source)
 * @param installer - injected skill installer port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect resolving to the transformed skill, failing on cancel or agent errors
 */
export const transformAgentic = (
  ui: InteractiveUi,
  skill: Skill.Skill,
  models: ReadonlyArray<ModelOption>,
  transform: SkillModifier,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const inject = yield* ensureRequirements(
      ui,
      store,
      installer,
      Skill.TRANSFORM_REQUIREMENTS,
      'skill format transform',
    );
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Transforming', loading);
    const message =
      modelLabel === undefined
        ? `Transforming skill '${skill.id}' with the session model…`
        : `Transforming skill '${skill.id}' with ${modelLabel}…`;
    return yield* runWithLoading(
      loading,
      message,
      transform({ skill, instruction: TRANSFORM_INSTRUCTION, modelLabel, inject }),
    );
  });

/**
 * Detail loop for one skill: Show / Modify / Re-verify / Delete / Back
 * (plus Transform to standard while unverified) until Back, Delete, or
 * cancel. The heading carries a `Batch.box` info panel with the verify
 * status between the title and the options; Show, Modify, Re-verify, and
 * Transform return to this menu; Delete and Back return to the browse list.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @param id - picked skill id
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @param transform - injected agentic format-transform port
 * @param installer - injected skill installer port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @param menu - TUI main-menu port, if available
 * @returns Effect completing once the menu exits, failing with displayable message
 */
const detailFrom = (
  ui: InteractiveUi,
  store: SkillStore,
  id: string,
  models: ReadonlyArray<ModelOption>,
  modify: SkillModifier,
  transform: SkillModifier,
  installer: SkillInstaller,
  modelPicker: ModelPickerFn | undefined,
  loading: LoadingFn | undefined,
  menu: MenuFn | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const result = yield* verifySkill(store, id).pipe(Effect.orElseSucceed(() => undefined));
    if (result === undefined) return;
    const title = `Skill '${id}'`;
    const info = [Skill.verifyInfoLine(result)];
    const options = detailOptions(result);
    let detail: string | undefined;
    if (menu !== undefined) {
      detail = yield* menu(title, info, options);
    } else {
      yield* Effect.sync(() => ui.notify(info.join('\n'), 'info'));
      detail = yield* Effect.promise(() => ui.select(title, [...options]));
    }
    if (detail === undefined || detail === 'Back') return;
    if (detail === 'Show') {
      const fresh = yield* store.list();
      if (!fresh.some((skill) => skill.id === id || skill.name === id)) return;
      yield* showSkill(ui, fresh, id);
      return yield* detailFrom(
        ui,
        store,
        id,
        models,
        modify,
        transform,
        installer,
        modelPicker,
        loading,
        menu,
      );
    }
    if (detail === 'Modify') {
      const fresh = yield* store.list();
      const skill = yield* modifySkill(
        ui,
        fresh,
        id,
        models,
        modify,
        store,
        installer,
        modelPicker,
        loading,
      );
      yield* store.save(skill);
      yield* Effect.sync(() => ui.notify(`Saved skill '${skill.id}'.`, 'info'));
      return yield* detailFrom(
        ui,
        store,
        skill.id,
        models,
        modify,
        transform,
        installer,
        modelPicker,
        loading,
        menu,
      );
    }
    if (detail === DETAIL_REVERIFY) {
      const reverified = yield* verifySkill(store, id);
      yield* notifyVerifyResult(ui, id, reverified);
      return yield* detailFrom(
        ui,
        store,
        id,
        models,
        modify,
        transform,
        installer,
        modelPicker,
        loading,
        menu,
      );
    }
    if (detail === DETAIL_TRANSFORM) {
      const fresh = yield* store.list();
      const target = fresh.find((skill) => skill.id === id || skill.name === id);
      if (target === undefined) return;
      const transformed = yield* transformAgentic(
        ui,
        target,
        models,
        transform,
        store,
        installer,
        modelPicker,
        loading,
      );
      yield* store.save(transformed);
      yield* Effect.sync(() => ui.notify(`Saved skill '${transformed.id}'.`, 'info'));
      return yield* detailFrom(
        ui,
        store,
        transformed.id,
        models,
        modify,
        transform,
        installer,
        modelPicker,
        loading,
        menu,
      );
    }
    if (detail === 'Delete') {
      const fresh = yield* store.list();
      const deleted = yield* deleteSkill(ui, fresh, store, id);
      yield* Effect.sync(() => ui.notify(`Deleted skill '${deleted}'.`, 'info'));
      return;
    }
    return yield* Effect.fail(`Unknown detail choice '${detail}'.`);
  });

const browseFrom = (
  ui: InteractiveUi,
  store: SkillStore,
  first: boolean,
  models: ReadonlyArray<ModelOption>,
  modify: SkillModifier,
  transform: SkillModifier,
  installer: SkillInstaller,
  modelPicker: ModelPickerFn | undefined,
  loading: LoadingFn | undefined,
  menu: MenuFn | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const skills = yield* store.list();
    if (skills.length === 0) {
      if (first) return yield* Effect.fail('No skills yet — create one first.');
      return;
    }
    const search = ui.searchSelect;
    const picked = yield* Effect.promise(() =>
      search !== undefined
        ? search(
            'Browse skills',
            skills.map((skill) => skill.id),
          )
        : ui.select('Browse skills', [...skills.map((skill) => skill.id), 'Back']),
    );
    if (picked === undefined || picked === 'Back') return;
    yield* detailFrom(
      ui,
      store,
      picked,
      models,
      modify,
      transform,
      installer,
      modelPicker,
      loading,
      menu,
    );
    return yield* browseFrom(
      ui,
      store,
      false,
      models,
      modify,
      transform,
      installer,
      modelPicker,
      loading,
      menu,
    );
  });

/**
 * Run one parsed args string end to end: parse, load, flow, save, notify.
 * @param args - raw slash-command args
 * @param env - command environment (dialogs, cwd, models)
 * @param store - injected persistence port
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @param transform - injected agentic format-transform port (defaults to `env.transform`, then `modify`)
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  env: CommandEnv,
  store: SkillStore,
  generate: SkillGenerator,
  modify: SkillModifier,
  transform?: SkillModifier | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const ui = env.ui;
    const models = env.models;
    const modelPicker = env.modelPicker;
    const loading = env.loading;
    const installer = env.installer;
    const fixer = transform ?? env.transform ?? modify;
    const action = parseAction(args);
    switch (action.kind) {
      case 'Help': {
        yield* Effect.sync(() => ui.notify(USAGE, 'info'));
        return;
      }
      case 'Browse': {
        yield* browse(ui, store, models, modify, fixer, installer, modelPicker, loading, env.menu);
        return;
      }
      case 'List': {
        yield* store.list().pipe(Effect.flatMap((skills) => listSkills(ui, skills)));
        return;
      }
      case 'Create': {
        const skill = yield* createSkill(
          ui,
          models,
          generate,
          store,
          installer,
          action.name,
          modelPicker,
          loading,
        );
        yield* store.save(skill);
        yield* completeCreate(
          ui,
          store,
          skill,
          models,
          modify,
          fixer,
          installer,
          modelPicker,
          loading,
          env.menu,
        );
        return;
      }
      case 'Show': {
        const skills = yield* store.list();
        yield* showSkill(ui, skills, action.name);
        return;
      }
      case 'Modify': {
        const skills = yield* store.list();
        const skill = yield* modifySkill(
          ui,
          skills,
          action.name,
          models,
          modify,
          store,
          installer,
          modelPicker,
          loading,
        );
        yield* store.save(skill);
        yield* Effect.sync(() => ui.notify(`Saved skill '${skill.id}'.`, 'info'));
        return;
      }
      case 'Delete': {
        const skills = yield* store.list();
        const id = yield* deleteSkill(ui, skills, store, action.name);
        yield* Effect.sync(() => ui.notify(`Deleted skill '${id}'.`, 'info'));
        return;
      }
      case 'Menu': {
        const menuSkills = yield* store.list();
        const menuStatuses = Skill.checkRequirements(menuSkills, MENU_REQUIREMENTS);
        const menuMissing = Skill.missingRequirements(menuStatuses);
        const options =
          menuMissing.length === 0
            ? ['Browse skills', 'Create skill', 'Exit']
            : ['Browse skills', 'Create skill', MENU_INSTALL, 'Exit'];
        const menuTitle = 'Skills';
        const menuInfo = [menuInfoLine(menuStatuses)];
        const menu = env.menu;
        const chosen =
          menu !== undefined
            ? yield* menu(menuTitle, menuInfo, options)
            : yield* Effect.promise(() => ui.select(menuTitle, options));
        if (chosen === undefined) return yield* Effect.fail(CANCELLED);
        switch (chosen) {
          case 'Browse skills': {
            yield* browse(ui, store, models, modify, fixer, installer, modelPicker, loading, menu);
            return;
          }
          case MENU_INSTALL: {
            yield* ensureRequirements(
              ui,
              store,
              installer,
              MENU_REQUIREMENTS,
              'skills extension setup',
            );
            return yield* run('', env, store, generate, modify, fixer);
          }
          case 'Create skill': {
            const skill = yield* createSkill(
              ui,
              models,
              generate,
              store,
              installer,
              undefined,
              modelPicker,
              loading,
            );
            yield* store.save(skill);
            yield* completeCreate(
              ui,
              store,
              skill,
              models,
              modify,
              fixer,
              installer,
              modelPicker,
              loading,
              menu,
            );
            return;
          }
          case 'Exit': {
            return;
          }
          default: {
            return yield* Effect.fail(`Unknown menu choice '${chosen}'.`);
          }
        }
      }
    }
  });

/**
 * Register the `/mf-skills` slash command on a Pi API. Failures notify;
 * user cancellation notifies as info instead of an error.
 * @param api - Pi extension API
 * @param storeFor - persistence port for the command's working directory
 * @param generateFor - agentic generation port for the command's working directory
 * @param modifyFor - agentic modification port for the command's working directory's working directory
 * @param installerFor - skill installer port for the command's working directory
 * @param searchFor - TUI filter picker factory, if available
 * @param modelPickerFor - TUI model picker factory, if available
 * @param loadingFor - TUI loading-modal factory, if available
 * @param menuFor - TUI main-menu factory, if available
 * @param transformFor - agentic format-transform port factory, if available (defaults to `modifyFor`)
 * @returns Nothing
 */
export const register = (
  api: CommandApi,
  storeFor: (cwd: string) => SkillStore,
  generateFor: (cwd: string) => SkillGenerator,
  modifyFor: (cwd: string) => SkillModifier,
  installerFor: (cwd: string) => SkillInstaller,
  searchFor?: (ctx: {
    readonly ui: FilterUi;
    readonly mode: string;
  }) => InteractiveUi['searchSelect'],
  modelPickerFor?: (ctx: {
    readonly ui: FilterUi;
    readonly mode: string;
  }) => ModelPickerFn | undefined,
  loadingFor?: (ctx: { readonly ui: FilterUi; readonly mode: string }) => LoadingFn | undefined,
  menuFor?: (ctx: { readonly ui: FilterUi; readonly mode: string }) => MenuFn | undefined,
  transformFor?: (cwd: string) => SkillModifier,
): void => {
  api.registerCommand(COMMAND_NAME, {
    description: COMMAND_DESCRIPTION,
    handler: (args, ctx) =>
      Effect.sync(() => {
        const base = ctx.ui;
        let ui: InteractiveUi = {
          select: (title, options) => base.select(title, options),
          confirm: (title, message) => base.confirm(title, message),
          input: (title, placeholder) => base.input(title, placeholder),
          notify: (message, type) => base.notify(message, type),
        };
        const search = searchFor?.({ ui: ctx.ui, mode: ctx.mode });
        if (search !== undefined) ui = { ...ui, searchSelect: search };
        const modelPicker = modelPickerFor?.({ ui: ctx.ui, mode: ctx.mode });
        const loading = loadingFor?.({ ui: ctx.ui, mode: ctx.mode });
        const menu = menuFor?.({ ui: ctx.ui, mode: ctx.mode });
        const modify = modifyFor(ctx.cwd);
        return run(
          args,
          {
            ui,
            cwd: ctx.cwd,
            models: resolveModelOptions(ctx),
            modelPicker,
            loading,
            installer: installerFor(ctx.cwd),
            menu,
            transform: transformFor?.(ctx.cwd) ?? modify,
          },
          storeFor(ctx.cwd),
          generateFor(ctx.cwd),
          modify,
        );
      }).pipe(
        Effect.flatMap((effect) => effect),
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.sync(() => ctx.ui.notify(error, error === CANCELLED ? 'info' : 'error')),
          onSuccess: () => Effect.void,
        }),
        Effect.runPromise,
      ),
  });
};
