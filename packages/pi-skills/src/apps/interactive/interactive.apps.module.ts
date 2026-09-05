import { Effect } from 'effect';
import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import * as Skill from '../../modules/skill/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-skills`). */
export const COMMAND_NAME = 'mf-skills';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Browse, create (manually or with an agent), show, modify, and delete workspace skills.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-skills [browse | list | create [name] | show <name> | modify [name] | delete [name] | help]';

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
export interface SkillStore {
  readonly list: () => Effect.Effect<readonly Skill.Skill[], string>;
  readonly save: (skill: Skill.Skill) => Effect.Effect<void, string>;
  readonly delete: (id: string) => Effect.Effect<void, string>;
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
}

export type SkillGenerator = (input: GenerateInput) => Effect.Effect<Skill.Skill, string>;

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

/** Command environment: dialogs, cwd, and resolved picker options. */
export interface CommandEnv {
  readonly ui: InteractiveUi;
  readonly cwd: string;
  readonly models: ReadonlyArray<ModelOption>;
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
 * Interactive modify flow: pick the skill (when unnamed) then enter a new
 * description. Persists nothing itself — the caller saves the returned
 * descriptor.
 * @param ui - Pi ui dialogs
 * @param skills - skills to search
 * @param name - skill id or name, if already given
 * @returns Effect resolving to the updated descriptor, failing on cancel or unknown names
 */
export const modifySkill = (
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
 * Model picker: menu with the current model first and a bottom
 * `Pick another model…` entry. The filter step uses the live
 * search dialog when provided, else input-then-select.
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
 * (current session model first), then run the injected generator.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link modelOptions}
 * @param generate - injected agentic generation port
 * @returns Effect resolving to the generated skill, failing on cancel or agent errors
 */
export const createAgentic = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: SkillGenerator,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const entered = yield* Effect.promise(() => ui.input('Describe the skill'));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const description = entered.trim();
    if (description === '') return yield* Effect.fail('Description must not be empty.');
    let modelLabel: string | undefined;
    if (models.length > 0) {
      modelLabel = yield* pickModel(ui, models);
      yield* Effect.sync(() => ui.notify(`Generating skill with ${modelLabel}…`, 'info'));
    } else {
      yield* Effect.sync(() => ui.notify('Generating skill with the session model…', 'info'));
    }
    return yield* generate({ description, modelLabel });
  });

/**
 * Create flow entry: manual vs agentic choice, then the chosen flow.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link modelOptions}
 * @param generate - injected agentic generation port
 * @param name - initial manual name, if already given
 * @returns Effect resolving to the new skill, failing on cancel or blank input
 */
export const createSkill = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: SkillGenerator,
  name: string | undefined,
): Effect.Effect<Skill.Skill, string> =>
  Effect.gen(function* () {
    const mode = yield* Effect.promise(() =>
      ui.select('Create skill', ['Create manually', 'Create with agent']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Create with agent') return yield* createAgentic(ui, models, generate);
    return yield* createManual(ui, name);
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
 * Browse loop: pick a skill, then Show / Modify / Delete / Back until Back.
 * The list refreshes after every mutation. An empty list fails on entry
 * (hint to create) but exits quietly once deletions drain it.
 * @param ui - Pi ui dialogs
 * @param store - injected persistence port
 * @returns Effect completing on Back or cancel, failing with displayable message
 */
export const browse = (ui: InteractiveUi, store: SkillStore): Effect.Effect<void, string> =>
  browseFrom(ui, store, true);

const browseFrom = (
  ui: InteractiveUi,
  store: SkillStore,
  first: boolean,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const skills = yield* store.list();
    if (skills.length === 0) {
      if (first) return yield* Effect.fail('No skills yet — create one first.');
      return;
    }
    const picked = yield* Effect.promise(() =>
      ui.select('Browse skills', [...skills.map((skill) => skill.id), 'Back']),
    );
    if (picked === undefined || picked === 'Back') return;
    const detail = yield* Effect.promise(() =>
      ui.select(`Skill '${picked}'`, ['Show', 'Modify', 'Delete', 'Back']),
    );
    if (detail === undefined || detail === 'Back') return yield* browseFrom(ui, store, false);
    if (detail === 'Show') {
      const fresh = yield* store.list();
      yield* showSkill(ui, fresh, picked);
      return yield* browseFrom(ui, store, false);
    }
    if (detail === 'Modify') {
      const fresh = yield* store.list();
      const skill = yield* modifySkill(ui, fresh, picked);
      yield* store.save(skill);
      yield* Effect.sync(() => ui.notify(`Saved skill '${skill.id}'.`, 'info'));
      return yield* browseFrom(ui, store, false);
    }
    const fresh = yield* store.list();
    const id = yield* deleteSkill(ui, fresh, store, picked);
    yield* Effect.sync(() => ui.notify(`Deleted skill '${id}'.`, 'info'));
    return yield* browseFrom(ui, store, false);
  });

/**
 * Run one parsed args string end to end: parse, load, flow, save, notify.
 * @param args - raw slash-command args
 * @param env - command environment (dialogs, cwd, models)
 * @param store - injected persistence port
 * @param generate - injected agentic generation port
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  env: CommandEnv,
  store: SkillStore,
  generate: SkillGenerator,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const ui = env.ui;
    const models = env.models;
    const action = parseAction(args);
    switch (action.kind) {
      case 'Help': {
        yield* Effect.sync(() => ui.notify(USAGE, 'info'));
        return;
      }
      case 'Browse': {
        yield* browse(ui, store);
        return;
      }
      case 'List': {
        yield* store.list().pipe(Effect.flatMap((skills) => listSkills(ui, skills)));
        return;
      }
      case 'Create': {
        const skill = yield* createSkill(ui, models, generate, action.name);
        yield* store.save(skill);
        yield* Effect.sync(() => ui.notify(`Saved skill '${skill.id}'.`, 'info'));
        return;
      }
      case 'Show': {
        const skills = yield* store.list();
        yield* showSkill(ui, skills, action.name);
        return;
      }
      case 'Modify': {
        const skills = yield* store.list();
        const skill = yield* modifySkill(ui, skills, action.name);
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
        const skills = yield* store.list();
        const options = [
          'Browse skills',
          'Create skill',
          'List skills',
          'Show skill',
          'Modify skill',
          'Delete skill',
        ] as const;
        const chosen = yield* Effect.promise(() => ui.select('Skills', [...options]));
        if (chosen === undefined) return yield* Effect.fail(CANCELLED);
        switch (chosen) {
          case 'List skills': {
            yield* listSkills(ui, skills);
            return;
          }
          case 'Browse skills': {
            yield* browse(ui, store);
            return;
          }
          case 'Create skill': {
            const skill = yield* createSkill(ui, models, generate, undefined);
            yield* store.save(skill);
            yield* Effect.sync(() => ui.notify(`Saved skill '${skill.id}'.`, 'info'));
            return;
          }
          case 'Show skill':
          case 'Modify skill':
          case 'Delete skill': {
            if (skills.length === 0) return yield* Effect.fail('No skills yet — create one first.');
            const name = yield* Effect.promise(() =>
              ui.select(
                chosen,
                skills.map((skill) => skill.id),
              ),
            );
            if (name === undefined) return yield* Effect.fail(CANCELLED);
            if (chosen === 'Show skill') {
              yield* showSkill(ui, skills, name);
              return;
            }
            if (chosen === 'Modify skill') {
              const skill = yield* modifySkill(ui, skills, name);
              yield* store.save(skill);
              yield* Effect.sync(() => ui.notify(`Saved skill '${skill.id}'.`, 'info'));
              return;
            }
            const id = yield* deleteSkill(ui, skills, store, name);
            yield* Effect.sync(() => ui.notify(`Deleted skill '${id}'.`, 'info'));
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
 * @returns Nothing
 */
export const register = (
  api: CommandApi,
  storeFor: (cwd: string) => SkillStore,
  generateFor: (cwd: string) => SkillGenerator,
  searchFor?: (ctx: {
    readonly ui: FilterUi;
    readonly mode: string;
  }) => InteractiveUi['searchSelect'],
): void => {
  api.registerCommand(COMMAND_NAME, {
    description: COMMAND_DESCRIPTION,
    handler: (args, ctx) =>
      Effect.runPromise(
        Effect.matchEffect(
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
            return run(
              args,
              {
                ui,
                cwd: ctx.cwd,
                models: resolveModelOptions(ctx),
              },
              storeFor(ctx.cwd),
              generateFor(ctx.cwd),
            );
          }).pipe(Effect.flatMap((effect) => effect)),
          {
            onFailure: (error) =>
              Effect.sync(() => ctx.ui.notify(error, error === CANCELLED ? 'info' : 'error')),
            onSuccess: () => Effect.void,
          },
        ),
      ),
  });
};
