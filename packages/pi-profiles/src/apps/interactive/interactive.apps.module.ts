import { Effect } from 'effect';
import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import * as PiProfiles from '../../modules/pi-profiles/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-profiles`). */
export const COMMAND_NAME = 'mf-profiles';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Browse, create (manually or with an agent), show, modify (manually or with an agent), and delete workspace profiles.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-profiles [browse | list | create [name] | show <name> | modify [name] | delete [name] | help]';

/** Failure value when the user cancels a dialog. Notified as info, not an error. */
export const CANCELLED = 'Cancelled.';

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
export interface ProfileStore {
  readonly list: () => Effect.Effect<readonly PiProfiles.Profile[], string>;
  readonly save: (profile: PiProfiles.Profile) => Effect.Effect<void, string>;
  readonly delete: (name: string) => Effect.Effect<void, string>;
  /** Raw `PROFILE.md` contents for mechanical verification. Fails on unknown names. */
  readonly readRaw?: (name: string) => Effect.Effect<string, string>;
}

/** Installed skills the requirements gate checks (mirrors `Skill.Skill` fields). */
export interface InstalledSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly dependencies: ReadonlyArray<string>;
  readonly body: string;
}

/** Skill inventory port the consuming extension injects (workspace `.agents/skills/`). */
export interface SkillStore {
  readonly list: () => Effect.Effect<readonly InstalledSkill[], string>;
}

/**
 * Render injected skills as child-agent prompt context. Empty when none.
 * Local copy of the `Skill.formatInjectedSkills` shape so this package
 * stays decoupled from the skill file layout.
 * @param skills - skills to inject
 * @returns prompt section, or empty
 */
export const formatInjectedSkills = (skills: readonly InstalledSkill[]): string => {
  if (skills.length === 0) return '';
  const sections = skills.map((skill) => `### ${skill.id} — ${skill.description}\n\n${skill.body}`);
  return `\n\n## Injected skill context\n\nFollow these loaded skills while you work.\n\n${sections.join('\n\n')}`;
};

/** One model offered for agentic runs: `provider/model-id` plus current-run marker. */
export interface ModelOption {
  readonly label: string;
  readonly current: boolean;
}

/** Agentic profile generation port the consuming extension injects (child agent run). */
export interface GenerateInput {
  readonly description: string;
  readonly modelLabel: string | undefined;
  readonly inject: ReadonlyArray<InstalledSkill>;
}

export type ProfileGenerator = (input: GenerateInput) => Effect.Effect<PiProfiles.Profile, string>;

/** Agentic profile modification port the consuming extension injects (child agent run). */
export interface ModifyInput {
  readonly profile: PiProfiles.Profile;
  readonly instruction: string;
  readonly modelLabel: string | undefined;
  readonly inject: ReadonlyArray<InstalledSkill>;
}

export type ProfileModifier = (input: ModifyInput) => Effect.Effect<PiProfiles.Profile, string>;

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
 * skills into the workspace store — `npx skills add montflow/montflow`).
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
  /** Agentic format-fix port (fix a profile to the standard shape). */
  readonly transform?: ProfileModifier | undefined;
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

/** Parsed `/mf-profiles` invocation. */
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
 * Parse raw slash-command args into an {@link Action}. Bare `/mf-profiles`
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
 * Notify the profile list, or a hint when empty.
 * @param ui - Pi ui dialogs
 * @param profiles - profiles to list
 * @returns Effect completing once notified
 */
export const listProfiles = (
  ui: InteractiveUi,
  profiles: readonly PiProfiles.Profile[],
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (profiles.length === 0) {
      ui.notify('No profiles yet — create one with `/mf-profiles create <name>`.', 'info');
      return;
    }
    ui.notify(
      profiles.map((profile) => `• ${profile.name} — ${profile.description}`).join('\n'),
      'info',
    );
  });

/**
 * Notify a profile's description and body, failing on unknown names.
 * @param ui - Pi ui dialogs
 * @param profiles - profiles to search
 * @param name - profile name
 * @returns Effect completing once notified, failing on unknown names
 */
export const showProfile = (
  ui: InteractiveUi,
  profiles: readonly PiProfiles.Profile[],
  name: string,
): Effect.Effect<void, string> => {
  const profile = profiles.find((candidate) => candidate.name === name);
  if (profile === undefined) return Effect.fail(`Unknown profile '${name}'.`);
  return Effect.sync(() => {
    const header =
      profile.description === '' ? profile.name : `${profile.name} — ${profile.description}`;
    const meta = [
      profile.model !== '' ? `model: ${profile.model}` : null,
      profile.skills.length > 0 ? `skills: ${profile.skills.join(', ')}` : null,
    ].filter((line): line is string => line !== null);
    const checklist =
      profile.checklist.length > 0
        ? `\n\nReview checklist:\n${profile.checklist.map((item) => `- [ ] ${item}`).join('\n')}`
        : '';
    const instructions =
      profile.instructions === '' ? '(no instructions yet)' : profile.instructions;
    ui.notify(
      `${header}${meta.length > 0 ? `\n${meta.join('\n')}` : ''}\n\n${instructions}${checklist}`,
      'info',
    );
  });
};

/**
 * Manual create flow: name (when missing) then description via dialogs.
 * @param ui - Pi ui dialogs
 * @param name - initial name, if already given
 * @returns Effect resolving to the new descriptor, failing on cancel or blank input
 */
export const createManual = (
  ui: InteractiveUi,
  name: string | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    let resolved = (name ?? '').trim();
    if (resolved === '') {
      const entered = yield* Effect.promise(() => ui.input('Profile name', 'code-reviewer'));
      if (entered === undefined) return yield* Effect.fail(CANCELLED);
      resolved = entered.trim();
    }
    if (resolved === '') return yield* Effect.fail('Profile name must not be empty.');
    const slug = PiProfiles.slugify(resolved);
    if (!PiProfiles.isValidName(slug)) {
      return yield* Effect.fail(`Invalid profile name '${resolved}'.`);
    }
    const description = yield* Effect.promise(() => ui.input('Description'));
    if (description === undefined) return yield* Effect.fail(CANCELLED);
    if (description.trim() === '') return yield* Effect.fail('Description must not be empty.');
    return yield* PiProfiles.decodeUnknown({
      name: slug,
      description,
      model: '',
      skills: [],
      instructions: '',
      checklist: [],
    }).pipe(Effect.mapError(() => `Invalid profile name '${resolved}'.`));
  });

/**
 * Resolve the modify target: use the named profile when given, else pick
 * from the list via dialog.
 * @param ui - Pi ui dialogs
 * @param profiles - profiles to search
 * @param name - profile name, if already given
 * @returns Effect resolving to the target profile, failing on cancel or unknown names
 */
export const resolveModifyTarget = (
  ui: InteractiveUi,
  profiles: readonly PiProfiles.Profile[],
  name: string | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    let resolved = name;
    if (resolved === undefined) {
      if (profiles.length === 0) return yield* Effect.fail('No profiles yet — create one first.');
      const chosen = yield* Effect.promise(() =>
        ui.select(
          'Modify profile',
          profiles.map((profile) => profile.name),
        ),
      );
      if (chosen === undefined) return yield* Effect.fail(CANCELLED);
      resolved = chosen;
    }
    const profile = profiles.find((candidate) => candidate.name === resolved);
    if (profile === undefined) return yield* Effect.fail(`Unknown profile '${resolved}'.`);
    return profile;
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
        yield* Effect.sync(() => ui.notify(`${verb} profile with the session model…`, 'info'));
      return undefined;
    }
    if (modelPicker !== undefined) {
      const picked = yield* Effect.promise(() => modelPicker(models));
      if (picked === undefined) return yield* Effect.fail(CANCELLED);
      if (!silent) yield* Effect.sync(() => ui.notify(`${verb} profile with ${picked}…`, 'info'));
      return picked;
    }
    const picked = yield* pickModel(ui, models);
    yield* Effect.sync(() => ui.notify(`${verb} profile with ${picked}…`, 'info'));
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
  ...new Set([...PiProfiles.GENERATION_REQUIREMENTS, ...PiProfiles.MODIFICATION_REQUIREMENTS]),
];

/**
 * Presence of one required skill. Pure data for checklist UIs.
 */
export interface RequirementStatus {
  readonly name: string;
  readonly present: boolean;
}

/**
 * Check required skills against the installed set. Pure — adapters
 * (interactive, RPC, web) render the statuses however they present.
 * @param skills - installed skills
 * @param required - required skill names
 * @returns one status per required name, in order
 */
export const checkRequirements = (
  skills: readonly InstalledSkill[],
  required: readonly string[],
): ReadonlyArray<RequirementStatus> =>
  required.map((name) => ({
    name,
    present: skills.some((skill) => skill.id === name || skill.name === name),
  }));

/**
 * Names from a status list that are not installed.
 * @param statuses - statuses from {@link checkRequirements}
 * @returns missing names, in order
 */
export const missingRequirements = (
  statuses: readonly RequirementStatus[],
): ReadonlyArray<string> =>
  statuses.filter((status) => !status.present).map((status) => status.name);

/**
 * Resolve names to installed skills for agent injection: dependencies
 * first (transitive), deduplicated, missing names skipped.
 * @param skills - installed skills
 * @param names - skill names to inject
 * @returns installed skills in injection order
 */
export const resolveInjection = (
  skills: readonly InstalledSkill[],
  names: readonly string[],
): ReadonlyArray<InstalledSkill> => {
  const ordered: Array<InstalledSkill> = [];
  const seen = new Set<string>();
  const visit = (name: string): void => {
    const found = skills.find((skill) => skill.id === name || skill.name === name);
    if (found === undefined || seen.has(found.id)) return;
    seen.add(found.id);
    for (const dependency of found.dependencies) visit(dependency);
    ordered.push(found);
  };
  for (const name of names) visit(name);
  return ordered;
};

/**
 * Main-menu info-panel line: generic dependency state without naming
 * each skill. Rendered in the `Batch.box` panel, verdict first.
 * @param statuses - statuses from {@link checkRequirements}
 * @returns one generic status line for the panel
 */
export const menuInfoLine = (statuses: ReadonlyArray<RequirementStatus>): string => {
  const missing = missingRequirements(statuses);
  if (missing.length === 0) return '✓ dependencies installed';
  return '✗ dependencies missing';
};

/** Display row for one required skill: checked when it will inject. */
export const requirementRow = (status: RequirementStatus, selected: boolean): string => {
  if (!status.present) return `✗ ${status.name} — not installed`;
  if (selected) return `✓ ${status.name} — installed, will inject`;
  return `○ ${status.name} — installed, skip`;
};

/**
 * Requirements gate for an agentic run: checklist every required skill
 * (checked = will inject, toggle by picking), installing the missing
 * ones on request. Present skills start checked; the check itself is the
 * pure {@link checkRequirements} — this flow only presents it.
 * @param ui - Pi ui dialogs
 * @param store - injected skill inventory port
 * @param installer - injected skill installer port
 * @param required - required skill names (from `PiProfiles.*_REQUIREMENTS`)
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
): Effect.Effect<ReadonlyArray<InstalledSkill>, string> =>
  Effect.gen(function* () {
    const installed = yield* store.list();
    const statuses = checkRequirements(installed, required);
    const checked =
      selected ?? new Set(statuses.filter((status) => status.present).map((status) => status.name));
    const missing = missingRequirements(statuses);
    const rows = [
      REQUIREMENTS_CONTINUE,
      ...statuses.map((status) => requirementRow(status, checked.has(status.name))),
      ...(missing.length > 0 ? [REQUIREMENTS_INSTALL] : []),
    ];
    const picked = yield* Effect.promise(() => ui.select(`Options — ${purpose}`, rows));
    if (picked === undefined) return yield* Effect.fail(CANCELLED);
    if (picked === REQUIREMENTS_CONTINUE) {
      return resolveInjection(installed, [...checked]);
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
 * Manual modify flow: pick the profile (when unnamed) then enter a new
 * description. Persists nothing itself — the caller saves the returned
 * descriptor.
 * @param ui - Pi ui dialogs
 * @param profiles - profiles to search
 * @param name - profile name, if already given
 * @returns Effect resolving to the updated descriptor, failing on cancel or unknown names
 */
export const modifyManual = (
  ui: InteractiveUi,
  profiles: readonly PiProfiles.Profile[],
  name: string | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const profile = yield* resolveModifyTarget(ui, profiles, name);
    const description = yield* Effect.promise(() =>
      ui.input(`Description for '${profile.name}'`, profile.description),
    );
    if (description === undefined) return yield* Effect.fail(CANCELLED);
    if (description.trim() === '') return yield* Effect.fail('Description must not be empty.');
    return yield* PiProfiles.decodeUnknown({ ...PiProfiles.encode(profile), description }).pipe(
      Effect.mapError(() => `Invalid description for profile '${profile.name}'.`),
    );
  });

/**
 * Agentic modify flow: pick the profile (when unnamed), pass the
 * requirements gate, describe the change, pick the authoring model
 * (current session model first), then run the injected modifier behind
 * the loading modal when available. Uses the injected TUI widget when
 * provided, else the menu-driven `pickModel` — same picker as
 * {@link createAgentic}.
 * @param ui - Pi ui dialogs
 * @param profiles - profiles to search
 * @param name - profile name, if already given
 * @param models - picker options from {@link modelOptions}
 * @param modify - injected agentic modification port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect resolving to the modified profile, failing on cancel or agent errors
 */
export const modifyAgentic = (
  ui: InteractiveUi,
  profiles: readonly PiProfiles.Profile[],
  name: string | undefined,
  models: ReadonlyArray<ModelOption>,
  modify: ProfileModifier,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const profile = yield* resolveModifyTarget(ui, profiles, name);
    const inject = yield* ensureRequirements(
      ui,
      store,
      installer,
      PiProfiles.MODIFICATION_REQUIREMENTS,
      'agentic profile modification',
    );
    const entered = yield* Effect.promise(() =>
      ui.input(`How should the agent change '${profile.name}'?`),
    );
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const instruction = entered.trim();
    if (instruction === '') return yield* Effect.fail('Instruction must not be empty.');
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Modifying', loading);
    const message =
      modelLabel === undefined
        ? `Modifying profile '${profile.name}' with the session model…`
        : `Modifying profile '${profile.name}' with ${modelLabel}…`;
    return yield* runWithLoading(
      loading,
      message,
      modify({ profile, instruction, modelLabel, inject }),
    );
  });

/**
 * Modify flow entry: manual vs agentic choice, then the chosen flow.
 * Persists nothing itself — the caller saves the returned descriptor.
 * @param ui - Pi ui dialogs
 * @param profiles - profiles to search
 * @param name - profile name, if already given
 * @param models - picker options from {@link modelOptions}
 * @param modify - injected agentic modification port
 * @param modelPicker - TUI widget port, if available
 * @returns Effect resolving to the updated descriptor, failing on cancel or unknown names
 */
export const modifyProfile = (
  ui: InteractiveUi,
  profiles: readonly PiProfiles.Profile[],
  name: string | undefined,
  models: ReadonlyArray<ModelOption>,
  modify: ProfileModifier,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const mode = yield* Effect.promise(() =>
      ui.select('Modify profile', ['Modify with agent', 'Modify manually']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Modify with agent')
      return yield* modifyAgentic(
        ui,
        profiles,
        name,
        models,
        modify,
        store,
        installer,
        modelPicker,
        loading,
      );
    return yield* modifyManual(ui, profiles, name);
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
 * order (not necessarily consecutive). Case-insensitive.
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
 * Agentic create flow: pass the requirements gate, describe the profile,
 * pick the authoring model (current session model first), then run the
 * injected generator behind the loading modal when available. Uses the
 * injected TUI widget when provided, else the menu-driven `pickModel`.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link modelOptions}
 * @param generate - injected agentic generation port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect resolving to the generated profile, failing on cancel or agent errors
 */
export const createAgentic = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: ProfileGenerator,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const inject = yield* ensureRequirements(
      ui,
      store,
      installer,
      PiProfiles.GENERATION_REQUIREMENTS,
      'agentic profile creation',
    );
    const entered = yield* Effect.promise(() => ui.input('Describe the profile'));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const description = entered.trim();
    if (description === '') return yield* Effect.fail('Description must not be empty.');
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Generating', loading);
    const message =
      modelLabel === undefined
        ? 'Generating profile with the session model…'
        : `Generating profile with ${modelLabel}…`;
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
 * @returns Effect resolving to the new profile, failing on cancel or blank input
 */
export const createProfile = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: ProfileGenerator,
  store: SkillStore,
  installer: SkillInstaller,
  name: string | undefined,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const mode = yield* Effect.promise(() =>
      ui.select('Create profile', ['Create with agent', 'Create manually']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Create with agent')
      return yield* createAgentic(ui, models, generate, store, installer, modelPicker, loading);
    return yield* createManual(ui, name);
  });

/**
 * Finish a create: announce the saved file, then land on the new profile's
 * detail menu (Show / Modify / Delete / Back) so it can be inspected
 * right away.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @param profile - the saved profile
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @param installer - injected skill installer port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect completing once the detail menu exits
 */
export const completeCreate = (
  ui: InteractiveUi,
  store: ProfileStore,
  profile: PiProfiles.Profile,
  models: ReadonlyArray<ModelOption>,
  modify: ProfileModifier,
  skills: SkillStore,
  installer: SkillInstaller,
  modelPicker: ModelPickerFn | undefined,
  loading: LoadingFn | undefined,
  menu?: MenuFn | undefined,
  fix?: ProfileModifier | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    yield* Effect.sync(() =>
      ui.notify(
        `Saved profile '${profile.name}' — .agents/@montflow/pi-profiles/${profile.name}/PROFILE.md`,
        'info',
      ),
    );
    yield* detailFrom(
      ui,
      store,
      profile.name,
      models,
      modify,
      fix ?? modify,
      skills,
      installer,
      modelPicker,
      loading,
      menu,
    );
  });

/**
 * Delete flow: pick the profile (when unnamed), confirm, then delete.
 * Returns nothing itself — the caller notifies.
 * @param ui - Pi ui dialogs
 * @param profiles - profiles to search
 * @param store - injected persistence port
 * @param name - profile name, if already given
 * @returns Effect resolving to the deleted name, failing on cancel or unknown names
 */
export const deleteProfile = (
  ui: InteractiveUi,
  profiles: readonly PiProfiles.Profile[],
  store: ProfileStore,
  name: string | undefined,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    let resolved = name;
    if (resolved === undefined) {
      if (profiles.length === 0) return yield* Effect.fail('No profiles yet — create one first.');
      const chosen = yield* Effect.promise(() =>
        ui.select(
          'Delete profile',
          profiles.map((profile) => profile.name),
        ),
      );
      if (chosen === undefined) return yield* Effect.fail(CANCELLED);
      resolved = chosen;
    }
    const profile = profiles.find((candidate) => candidate.name === resolved);
    if (profile === undefined) return yield* Effect.fail(`Unknown profile '${resolved}'.`);
    const confirmed = yield* Effect.promise(() =>
      ui.confirm(
        `Delete profile '${profile.name}'?`,
        'This removes its PROFILE.md and cannot be undone.',
      ),
    );
    if (!confirmed) return yield* Effect.fail(CANCELLED);
    yield* store.delete(profile.name);
    return profile.name;
  });

/**
 * Browse loop: pick a profile, then loop its detail menu until Back or Delete.
 * The list refreshes after every mutation. An empty list offers creation
 * inline (`Create profile` first, `← Back` second) instead of failing.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @param models - picker options from {@link resolveModelOptions}
 * @param generate - injected agentic generation port (empty-list creates)
 * @param modify - injected agentic modification port
 * @param installer - injected skill installer port
 * @param modelPicker - TUI widget port, if available
 * @returns Effect completing on Back or cancel, failing with displayable message
 */
export const browse = (
  ui: InteractiveUi,
  store: ProfileStore,
  models: ReadonlyArray<ModelOption>,
  generate: ProfileGenerator,
  modify: ProfileModifier,
  skills: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
  menu?: MenuFn | undefined,
  fix?: ProfileModifier | undefined,
): Effect.Effect<void, string> =>
  browseFrom(
    ui,
    store,
    models,
    generate,
    modify,
    fix ?? modify,
    skills,
    installer,
    modelPicker,
    loading,
    menu,
  );

/**
 * Detail loop for one profile: Show / Modify / Delete / Back until Back,
 * Delete, or cancel. Show and Modify return to this menu; Delete and Back
 * return to the browse list.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @param name - picked profile name
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @param installer - injected skill installer port
 * @param modelPicker - TUI widget port, if available
 * @param loading - TUI loading-modal port, if available
 * @returns Effect completing once the menu exits, failing with displayable message
 */
/** Detail-menu entry re-running mechanical verification on the file. */
export const DETAIL_REVERIFY = 'Re-verify';

/** Detail-menu entry fixing an unverified profile to the standard shape. */
export const DETAIL_FIX = 'Fix to standard';

/**
 * Detail-menu options for a verify result: the fix entry appears
 * near the bottom only while the profile is unverified.
 * @param result - result from {@link PiProfiles.verifyProfileFile}
 * @returns menu choices in display order
 */
export const detailOptions = (result: PiProfiles.VerifyResult): ReadonlyArray<string> =>
  result.valid
    ? ['Show', 'Modify', DETAIL_REVERIFY, 'Delete', 'Back']
    : ['Show', 'Modify', DETAIL_REVERIFY, 'Delete', DETAIL_FIX, 'Back'];

/**
 * Verify one profile against the standard shape by reading its raw file.
 * @param store - injected persistence port
 * @param name - picked profile name
 * @returns Effect resolving to the mechanical result, failing on unknown names
 */
export const verifyProfile = (
  store: ProfileStore,
  name: string,
): Effect.Effect<PiProfiles.VerifyResult, string> => {
  if (store.readRaw !== undefined) {
    return store.readRaw(name).pipe(Effect.map((raw) => PiProfiles.verifyProfileFile(name, raw)));
  }
  return store.list().pipe(
    Effect.flatMap((profiles) => {
      const found = profiles.find((profile) => profile.name === name);
      if (found === undefined) return Effect.fail(`Unknown profile '${name}'.`);
      return Effect.succeed(
        PiProfiles.verifyProfileFile(name, PiProfiles.encodeProfileFile(found)),
      );
    }),
  );
};

/**
 * Notify a verify outcome: one line when valid, the issue list otherwise.
 * @param ui - Pi ui dialogs
 * @param name - verified profile name
 * @param result - result from {@link verifyProfile}
 * @returns Effect completing once notified
 */
export const notifyVerifyResult = (
  ui: InteractiveUi,
  name: string,
  result: PiProfiles.VerifyResult,
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (result.valid) {
      ui.notify(`✓ '${name}' matches the standard format.`, 'info');
      return;
    }
    ui.notify(
      `✗ '${name}' has ${result.issues.length} issue${result.issues.length === 1 ? '' : 's'}:\n${result.issues.map((found) => `• [${found.field}] ${found.message}`).join('\n')}`,
      'info',
    );
  });

/** Fixed agent instruction for the format-fix run: keep the role, fix the shape. */
export const FIX_INSTRUCTION =
  'Bring this profile into the standard profile format without changing what it teaches: ' +
  'ensure frontmatter has name (matching the directory), description (one line: role and job), ' +
  'plus model/skills when non-empty; ' +
  'ensure the body has `# Title`, `## Instructions`, and `## Review Checklist` with at least one item. ' +
  'Do not rename the profile directory. Do not touch anything outside that profile directory.';

/**
 * Agentic fix flow with model picker and optional extra prompt.
 * @param ui - Pi ui dialogs
 * @param profile - profile to fix
 * @param models - picker options
 * @param fix - injected agentic fix port
 * @returns Effect resolving to the fixed profile
 */
export const fixAgentic = (
  ui: InteractiveUi,
  profile: PiProfiles.Profile,
  models: ReadonlyArray<ModelOption>,
  fix: ProfileModifier,
  store: SkillStore,
  installer: SkillInstaller,
  modelPicker?: ModelPickerFn | undefined,
  loading?: LoadingFn | undefined,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const inject = yield* ensureRequirements(
      ui,
      store,
      installer,
      PiProfiles.TRANSFORM_REQUIREMENTS,
      'profile format fix',
    );
    const extra = yield* Effect.promise(() =>
      ui.input('Extra details for the fix agent (optional)', ''),
    );
    if (extra === undefined) return yield* Effect.fail(CANCELLED);
    const instruction =
      extra.trim() === ''
        ? FIX_INSTRUCTION
        : `${FIX_INSTRUCTION}\n\nExtra context: ${extra.trim()}`;
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Fixing', loading);
    const message =
      modelLabel === undefined
        ? `Fixing profile '${profile.name}' with the session model…`
        : `Fixing profile '${profile.name}' with ${modelLabel}…`;
    return yield* runWithLoading(
      loading,
      message,
      fix({ profile, instruction, modelLabel, inject }),
    );
  });

const detailFrom = (
  ui: InteractiveUi,
  store: ProfileStore,
  name: string,
  models: ReadonlyArray<ModelOption>,
  modify: ProfileModifier,
  fix: ProfileModifier,
  skills: SkillStore,
  installer: SkillInstaller,
  modelPicker: ModelPickerFn | undefined,
  loading: LoadingFn | undefined,
  menu: MenuFn | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const result = yield* verifyProfile(store, name).pipe(Effect.orElseSucceed(() => undefined));
    if (result === undefined) return;
    const title = `Profile '${name}'`;
    const info = [PiProfiles.verifyInfoLine(result)];
    const options = detailOptions(result);
    let detail: string | undefined;
    if (menu !== undefined) {
      detail = yield* menu(title, info, options);
    } else {
      yield* Effect.sync(() => ui.notify(info.join('\n'), 'info'));
      detail = yield* Effect.promise(() => ui.select(title, [...options]));
    }
    if (detail === undefined || detail === 'Back') return;
    const again = (next: string): Effect.Effect<void, string> =>
      detailFrom(
        ui,
        store,
        next,
        models,
        modify,
        fix,
        skills,
        installer,
        modelPicker,
        loading,
        menu,
      );
    if (detail === 'Show') {
      const fresh = yield* store.list();
      if (!fresh.some((profile) => profile.name === name)) return;
      yield* showProfile(ui, fresh, name);
      return yield* again(name);
    }
    if (detail === 'Modify') {
      const fresh = yield* store.list();
      const profile = yield* modifyProfile(
        ui,
        fresh,
        name,
        models,
        modify,
        skills,
        installer,
        modelPicker,
        loading,
      );
      yield* store.save(profile);
      yield* Effect.sync(() => ui.notify(`Saved profile '${profile.name}'.`, 'info'));
      return yield* again(profile.name);
    }
    if (detail === DETAIL_REVERIFY) {
      const reverified = yield* verifyProfile(store, name);
      yield* notifyVerifyResult(ui, name, reverified);
      return yield* again(name);
    }
    if (detail === DETAIL_FIX) {
      const fresh = yield* store.list();
      const target = fresh.find((profile) => profile.name === name);
      if (target === undefined) return;
      const fixed = yield* fixAgentic(
        ui,
        target,
        models,
        fix,
        skills,
        installer,
        modelPicker,
        loading,
      );
      yield* store.save(fixed);
      yield* Effect.sync(() => ui.notify(`Saved profile '${fixed.name}'.`, 'info'));
      return yield* again(fixed.name);
    }
    if (detail === 'Delete') {
      const fresh = yield* store.list();
      const deleted = yield* deleteProfile(ui, fresh, store, name);
      yield* Effect.sync(() => ui.notify(`Deleted profile '${deleted}'.`, 'info'));
      return;
    }
    return yield* Effect.fail(`Unknown detail choice '${detail}'.`);
  });

const browseFrom = (
  ui: InteractiveUi,
  store: ProfileStore,
  models: ReadonlyArray<ModelOption>,
  generate: ProfileGenerator,
  modify: ProfileModifier,
  fix: ProfileModifier,
  skills: SkillStore,
  installer: SkillInstaller,
  modelPicker: ModelPickerFn | undefined,
  loading: LoadingFn | undefined,
  menu: MenuFn | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const profiles = yield* store.list();
    if (profiles.length === 0) {
      const chosen = yield* Effect.promise(() =>
        ui.select('No profiles yet', ['Create profile', '← Back']),
      );
      if (chosen === 'Create profile') {
        const profile = yield* createProfile(
          ui,
          models,
          generate,
          skills,
          installer,
          undefined,
          modelPicker,
          loading,
        );
        yield* store.save(profile);
        yield* Effect.sync(() => ui.notify(`Saved profile '${profile.name}'.`, 'info'));
        return yield* browseFrom(
          ui,
          store,
          models,
          generate,
          modify,
          fix,
          skills,
          installer,
          modelPicker,
          loading,
          menu,
        );
      }
      return;
    }
    const search = ui.searchSelect;
    const picked = yield* Effect.promise(() =>
      search !== undefined
        ? search(
            'Browse profiles',
            profiles.map((profile) => profile.name),
          )
        : ui.select('Browse profiles', [...profiles.map((profile) => profile.name), 'Back']),
    );
    if (picked === undefined || picked === 'Back') return;
    yield* detailFrom(
      ui,
      store,
      picked,
      models,
      modify,
      fix,
      skills,
      installer,
      modelPicker,
      loading,
      menu,
    );
    return yield* browseFrom(
      ui,
      store,
      models,
      generate,
      modify,
      fix,
      skills,
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
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  env: CommandEnv,
  store: ProfileStore,
  skills: SkillStore,
  generate: ProfileGenerator,
  modify: ProfileModifier,
  transform?: ProfileModifier | undefined,
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
        yield* browse(
          ui,
          store,
          models,
          generate,
          modify,
          skills,
          installer,
          modelPicker,
          loading,
          env.menu,
          fixer,
        );
        return;
      }
      case 'List': {
        yield* store.list().pipe(Effect.flatMap((profiles) => listProfiles(ui, profiles)));
        return;
      }
      case 'Create': {
        const profile = yield* createProfile(
          ui,
          models,
          generate,
          skills,
          installer,
          action.name,
          modelPicker,
          loading,
        );
        yield* store.save(profile);
        yield* completeCreate(
          ui,
          store,
          profile,
          models,
          modify,
          skills,
          installer,
          modelPicker,
          loading,
          env.menu,
          fixer,
        );
        return;
      }
      case 'Show': {
        const profiles = yield* store.list();
        yield* showProfile(ui, profiles, action.name);
        return;
      }
      case 'Modify': {
        const profiles = yield* store.list();
        const profile = yield* modifyProfile(
          ui,
          profiles,
          action.name,
          models,
          modify,
          skills,
          installer,
          modelPicker,
          loading,
        );
        yield* store.save(profile);
        yield* Effect.sync(() => ui.notify(`Saved profile '${profile.name}'.`, 'info'));
        return;
      }
      case 'Delete': {
        const profiles = yield* store.list();
        const name = yield* deleteProfile(ui, profiles, store, action.name);
        yield* Effect.sync(() => ui.notify(`Deleted profile '${name}'.`, 'info'));
        return;
      }
      case 'Menu': {
        const installed = yield* skills.list().pipe(Effect.orElseSucceed(() => [] as const));
        const menuStatuses = checkRequirements(installed, MENU_REQUIREMENTS);
        const menuMissing = missingRequirements(menuStatuses);
        const options =
          menuMissing.length === 0
            ? ['Browse profiles', 'Create profile', 'Exit']
            : ['Browse profiles', 'Create profile', MENU_INSTALL, 'Exit'];
        const menuTitle = 'Profiles';
        const menuInfo = [menuInfoLine(menuStatuses)];
        const menu = env.menu;
        const chosen =
          menu !== undefined
            ? yield* menu(menuTitle, menuInfo, options)
            : yield* Effect.promise(() => ui.select(menuTitle, options));
        if (chosen === undefined) return yield* Effect.fail(CANCELLED);
        switch (chosen) {
          case 'Browse profiles': {
            yield* browse(
              ui,
              store,
              models,
              generate,
              modify,
              skills,
              installer,
              modelPicker,
              loading,
              menu,
              fixer,
            );
            return;
          }
          case MENU_INSTALL: {
            yield* ensureRequirements(ui, skills, installer, MENU_REQUIREMENTS, 'profiles setup');
            return yield* run('', env, store, skills, generate, modify, fixer);
          }
          case 'Create profile': {
            const profile = yield* createProfile(
              ui,
              models,
              generate,
              skills,
              installer,
              undefined,
              modelPicker,
              loading,
            );
            yield* store.save(profile);
            yield* completeCreate(
              ui,
              store,
              profile,
              models,
              modify,
              skills,
              installer,
              modelPicker,
              loading,
              menu,
              fixer,
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
 * Register the `/mf-profiles` slash command on a Pi API. Failures notify;
 * user cancellation notifies as info instead of an error.
 * @param api - Pi extension API
 * @param storeFor - persistence port for the command's working directory
 * @param skillsFor - skill inventory port for the command's working directory
 * @param generateFor - agentic generation port for the command's working directory
 * @param modifyFor - agentic modification port for the command's working directory
 * @param installerFor - skill installer port for the command's working directory
 * @param searchFor - TUI filter picker factory, if available
 * @param modelPickerFor - TUI model picker factory, if available
 * @param loadingFor - TUI loading-modal factory, if available
 * @param menuFor - TUI main-menu factory, if available
 * @returns Nothing
 */
export const register = (
  api: CommandApi,
  storeFor: (cwd: string) => ProfileStore,
  skillsFor: (cwd: string) => SkillStore,
  generateFor: (cwd: string) => ProfileGenerator,
  modifyFor: (cwd: string) => ProfileModifier,
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
  transformFor?: (cwd: string) => ProfileModifier,
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
            transform: (transformFor ?? modifyFor)(ctx.cwd),
          },
          storeFor(ctx.cwd),
          skillsFor(ctx.cwd),
          generateFor(ctx.cwd),
          modifyFor(ctx.cwd),
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
