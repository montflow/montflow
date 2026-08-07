import fs from 'node:fs';
import path from 'node:path';
import { Effect, Option, Result } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { NodeServices } from '@effect/platform-node';
import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  type SelectItem,
  SelectList,
  Text,
} from '@earendil-works/pi-tui';
import {
  BUILTIN_REVIEWERS,
  DEFAULT_REVIEWER_MODEL,
  defaultLoopConfig,
  genericReviewer,
  type LoopConfig,
  type ReviewerProfile,
} from './config';
import type { LoopOptions } from './graph';
import { getUnstagedChanges } from './git';
import { ensureStateDirs, isStoredConfig, loopStatePath, stateDirForReviewFile } from './loop-state';
import { parseSummaryText, type SummaryCounts } from './parse-summary';
import type {
  PresetLoopConfigDecoded,
  ReviewPresetDecoded,
  ReviewerRefDecoded,
} from './preset-schema';
import { resolvePresetConfig } from './preset-resolve';
import {
  deletePreset as deleteStoredPreset,
  isValidPresetName,
  listPresets,
  presetExists,
  readPreset,
  writePreset,
  type PresetError,
} from './preset-store';
import { resolveReviewFile } from './resolve-review-file';
import {
  isProfilesExtensionLoaded,
  listProfilesWithDetails,
  profileToReviewerProfile,
  PROFILES_INSTALL_HINT,
  type Profile,
} from './profiles-client';
import {
  currentModelId,
  listModelChoices,
  modelSelectItems,
  resolveInitialModel,
} from './models-client';

/**
 * Interactive setup for the adversarial review loop.
 *
 * `/adversarial-review-loop` walks the user through:
 *   1. Action menu — "New review", or "Preset" for stored configurations
 *      (create / list / use / modify / delete).
 *   2. Scope — git unstaged changes, or a picked place (files/directories
 *      with file autocomplete, a focus prompt, or `.` for the whole
 *      directory).
 *   3. Reviewer roster — starts with the built-in `generic` reviewer and lets
 *      the user add stored profiles (searched from `.agents/profiles/` via the
 *      profiles extension), change per-reviewer models (searchable list of the
 *      session's available models, preselected with the current model), and
 *      remove reviewers.
 *   4. Settings — max loops (independent reviewer sets), max cycles per loop,
 *      fixer model, supervisor model, deadlock threshold. The supervisor
 *      itself is always on (brief + aggregate).
 *   5. Run — the confirmed scope + roster + settings become the loop options.
 */

/** How the user scoped this review run. */
export type ScopeMode = 'git-unstaged' | 'files' | 'directory';

/** The scope of a review run: what the reviewers should look at. */
export interface ReviewScope {
  readonly mode: ScopeMode;
  /** Human-readable scope description injected into reviewer tasks. */
  readonly scope: string;
  /** Files/directories in scope (when known). */
  readonly files: readonly string[];
  /** Absolute path to a materialized diff file (git-unstaged mode). */
  readonly diffPath?: string;
}

/** Top-level action chosen from the setup menu. */
export type SetupAction = 'new' | 'resume' | 'preset';

/** Action chosen from the preset submenu. */
export type PresetAction = 'create' | 'list' | 'modify' | 'delete' | 'back';

/**
 * Result of a single wizard step: ok with a value, back to the previous step,
 * or cancel (abort the setup).
 */
export type StepResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'back' }
  | { readonly status: 'cancel' };

/** Result of a full wizard flow: run the loop, go back, or cancel. */
export type FlowResult =
  | { readonly status: 'run'; readonly opts: LoopOptions }
  | { readonly status: 'back' }
  | { readonly status: 'cancel' };

/** A preset that was just saved by the create flow. */
interface PresetCreated {
  readonly name: string;
  readonly config: PresetLoopConfigDecoded;
}

/** Loop settings the user can edit before running. */
export interface ReviewSettings {
  readonly maxLoops: number;
  readonly maxCycles: number;
  readonly fixerModel: string;
  readonly supervisorModel: string;
  readonly deadlockFlipThreshold: number;
  readonly agentConcurrency: number;
}

export interface InteractiveSetupResult {
  readonly opts: LoopOptions;
}

/** Runs an effect against the real Node FileSystem/Path services. */
const runFx = <A>(effect: Effect.Effect<A, never, FileSystem | Path>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

// ─── Pure settings helpers (unit-testable) ───────────────────────────

/**
 * Default editable settings, sourced from the default loop config.
 * @returns The default settings
 */
export const defaultSettings = (): ReviewSettings => {
  const base = defaultLoopConfig();
  return {
    maxLoops: base.maxLoops,
    maxCycles: base.maxCycles,
    fixerModel: base.fixerModel,
    supervisorModel: base.supervisor.model,
    deadlockFlipThreshold: base.deadlock.flipThreshold,
    agentConcurrency: base.agentConcurrency,
  };
};

/**
 * Parses a positive integer from raw user input (max loops / deadlock threshold).
 * @param {string} value Raw input
 * @returns The parsed integer, or undefined when invalid
 */
export const parsePositiveInt = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Builds the settings menu options with each entry's current value. The final
 * confirm entry is flow-specific ("start review" vs "create/update preset").
 * @param {ReviewSettings} settings Current settings
 * @param {string} [doneLabel] Confirm entry label (defaults to start review)
 * @returns The selectable menu options
 */
export const settingsMenuItems = (
  settings: ReviewSettings,
  doneLabel: string = '✓ Done — start review',
): readonly string[] => [
  `Max loops (independent reviewer sets) [${settings.maxLoops}]`,
  `Max cycles (per loop)            [${settings.maxCycles}]`,
  `Fixer model                      [${settings.fixerModel}]`,
  `Supervisor model                 [${settings.supervisorModel}]`,
  `Deadlock flip threshold          [${settings.deadlockFlipThreshold}]`,
  `Fixer concurrency (parallel)     [${settings.agentConcurrency}]`,
  doneLabel,
];

// ─── Pure scope parsing (unit-testable) ──────────────────────────────

/**
 * Parses a free-form input into a review scope. Whitespace/comma-separated
 * tokens that resolve to existing paths become `files`; the remaining text is
 * folded into the scope description. When NO token resolves to a path, the
 * whole input is treated as a free-form focus prompt. The literal `.` selects
 * the whole directory.
 * @param {string} cwd Working directory (paths resolve against it)
 * @param {string} input Raw user input
 * @returns The parsed scope
 */
export const parseFilesInput = (cwd: string, input: string): ReviewScope => {
  const trimmed = input.trim();
  if (trimmed === '.') {
    return { mode: 'directory', scope: 'Review the entire directory.', files: [] };
  }

  const tokens = trimmed
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token !== '');
  if (tokens.length === 0) {
    return { mode: 'files', scope: '', files: [] };
  }

  const existing = tokens.filter((token) => fs.existsSync(path.join(cwd, token)));
  if (existing.length > 0) {
    const rest = tokens.filter((token) => !existing.includes(token));
    const scope =
      `Focus on these files/directories: ${existing.join(', ')}` +
      (rest.length > 0 ? ` — ${rest.join(' ')}` : '');
    return { mode: 'files', scope, files: existing };
  }

  // No token resolved to a path — treat the whole input as a focus prompt.
  return { mode: 'files', scope: trimmed, files: [] };
};

// ─── Roster state ────────────────────────────────────────────────────

interface RosterEntry {
  readonly reviewer: ReviewerProfile;
  /**
   * How this reviewer entered the roster: the bundled builtin (generic) or a
   * stored profile. Presets persist this as a reference so the profile stays
   * the source of truth for objective/skill/label.
   */
  readonly source: 'builtin' | 'profile';
}

/** The default roster: a single built-in generic reviewer (no profile needed). */
const defaultRoster = (): RosterEntry[] => [
  {
    reviewer: genericReviewer(),
    source: 'builtin',
  },
];

// ─── Interactive flow ────────────────────────────────────────────────

/**
 * Runs the interactive setup wizard. Loops the action menu until the user
 * runs a review, or cancels.
 * @param {ExtensionAPI} pi The Pi extension API (event bus for profiles)
 * @param {ExtensionContext} ctx The command context
 * @returns The confirmed loop options, or null on cancel
 */
export const runInteractiveSetup = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<InteractiveSetupResult | null> => {
  for (;;) {
    const action = await pickAction(ctx);
    if (action === null) return null;

    const outcome =
      action === 'preset'
        ? await runPresetFlow(pi, ctx)
        : action === 'resume'
          ? await runResumeFlow(pi, ctx)
          : await runNewFlow(pi, ctx);
    if (outcome.status === 'run') return { opts: outcome.opts };
    if (outcome.status === 'cancel') return null;
    // 'back' → re-show the action menu.
  }
};

/**
 * "New review": every review starts from a stored preset — pick one, then pick
 * the scope and run. The roster + settings always come from the preset (see
 * the Preset submenu to create/modify them).
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @returns The flow outcome
 */
const runNewFlow = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<FlowResult> => usePreset(pi, ctx);

/**
 * Step 1: the action menu. "New review" requires a stored preset — it is
 * hidden when none exist. "Resume review" continues an interrupted loop from
 * an existing review file (hidden when none exist). "Preset" opens the
 * stored-configuration submenu (create / list / modify / delete / back).
 * @param {ExtensionContext} ctx The command context
 * @returns The chosen action, or null on cancel
 */
const pickAction = async (ctx: ExtensionContext): Promise<SetupAction | null> => {
  const names = await runPresetOp(ctx, listPresets(ctx.cwd));
  const hasPresets = names !== null && names.length > 0;
  const hasReviews = listReviews(ctx.cwd).length > 0;

  const options: string[] = [];
  if (hasPresets) options.push('New review');
  if (hasPresets && hasReviews) options.push('Resume review');
  options.push('Preset');

  const pick = await ctx.ui.select(
    'adversarial-review-loop — what would you like to do?',
    options,
  );
  if (pick === 'New review') return 'new';
  if (pick === 'Resume review') return 'resume';
  if (pick === 'Preset') return 'preset';
  return null;
};

/**
 * Step 2: pick what the reviewers will look at — git unstaged changes, or a
 * picked place (files/directories, a focus prompt, or `.` for the whole dir).
 * "← Back" steps up to the previous menu.
 * @param {ExtensionContext} ctx The command context
 * @returns The chosen scope step result
 */
const pickScope = async (ctx: ExtensionContext): Promise<StepResult<ReviewScope>> => {
  for (;;) {
    const pick = await ctx.ui.select('What should be reviewed?', [
      'Git unstaged changes (tracked + untracked)',
      'Pick — files/directories or a focus prompt',
      '← Back',
    ]);

    if (pick === undefined) return { status: 'cancel' };
    if (pick === '← Back') return { status: 'back' };

    if (pick === 'Git unstaged changes (tracked + untracked)') {
      const changes = getUnstagedChanges(ctx.cwd);
      if (changes.files.length === 0) {
        ctx.ui.notify(
          'No unstaged changes found — falling back to the whole directory.',
          'warning',
        );
        return {
          status: 'ok',
          value: { mode: 'directory', scope: 'Review the entire directory.', files: [] },
        };
      }
      return {
        status: 'ok',
        value: {
          mode: 'git-unstaged',
          scope:
            `Review ONLY the unstaged working-tree changes in these files: ` +
            `${changes.files.join(', ')}. Do not audit the whole codebase.`,
          files: changes.files,
        },
      };
    }

    const input = await inputScopeWithAutocomplete(
      ctx,
      "Files/directories (space-separated), a focus prompt, or '.' for the whole directory:",
    );
    if (input === null) return { status: 'cancel' };
    const parsed = parseFilesInput(ctx.cwd, input);
    if (parsed.scope === '') {
      ctx.ui.notify('No scope given.', 'warning');
      continue;
    }
    return { status: 'ok', value: parsed };
  }
};

/**
 * Free-text input with file/directory autocomplete: path suggestions appear as
 * you type (Tab or Enter applies a suggestion; a second Esc after the list is
 * closed cancels). Free-form focus prompts and '.' still work as plain text.
 * @param {ExtensionContext} ctx The command context
 * @param {string} title Dialog title
 * @returns The raw input string, or null on cancel
 */
const inputScopeWithAutocomplete = async (
  ctx: ExtensionContext,
  title: string,
): Promise<string | null> =>
  ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
    container.addChild(new Text(theme.fg('accent', theme.bold(title)), 1, 0));

    const editor = new Editor(
      tui,
      {
        borderColor: (s: string) => theme.fg('accent', s),
        selectList: {
          selectedPrefix: (t) => theme.fg('accent', t),
          selectedText: (t) => theme.fg('accent', t),
          description: (t) => theme.fg('muted', t),
          scrollInfo: (t) => theme.fg('dim', t),
          noMatch: (t) => theme.fg('warning', t),
        },
      },
      { paddingX: 1, autocompleteMaxVisible: 10 },
    );
    editor.setAutocompleteProvider(new CombinedAutocompleteProvider(undefined, ctx.cwd));
    editor.onSubmit = (text: string) => done(text);
    container.addChild(editor);

    container.addChild(
      new Text(
        theme.fg('dim', 'type a path — suggestions appear • tab/enter complete • esc cancel'),
        1,
        0,
      ),
    );
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

    return {
      render: (w) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        // First Esc closes an open suggestion list (handled by the editor);
        // with no list open, Esc cancels the dialog.
        if (data === '\x1b' && !editor.isShowingAutocomplete()) {
          done(null);
          return;
        }
        editor.handleInput(data);
      },
    };
  });

/**
 * For git-unstaged scope, materializes the diff next to the review file so the
 * (bash-less) reviewer agents can read exactly what changed. The diff includes
 * both tracked hunks and untracked-file content (see `getUnstagedChanges`).
 * Best-effort: when the diff is empty or writing fails, the scope still lists
 * the changed files.
 * @param {ExtensionContext} ctx The command context
 * @param {ReviewScope} scope The chosen scope
 * @returns The scope, possibly with a diffPath attached
 */
const materializeScopeDiff = async (
  ctx: ExtensionContext,
  scope: ReviewScope,
): Promise<ReviewScope> => {
  if (scope.mode !== 'git-unstaged' || scope.files.length === 0) return scope;
  try {
    const diff = getUnstagedChanges(ctx.cwd).diff;
    if (diff.trim() === '') return scope;
    // 'adversarial' is a hardcoded constant and always a valid review name, so
    // the ReviewPathError failure is unreachable; orDie converts it to a defect
    // which the best-effort try/catch above turns into an unchanged scope.
    const reviewFile = await runFx(
      resolveReviewFile(ctx.cwd, 'adversarial', true).pipe(Effect.orDie),
    );
    await runFx(ensureStateDirs(reviewFile));
    const diffPath = path.join(stateDirForReviewFile(reviewFile), 'scope.diff');
    fs.writeFileSync(diffPath, `${diff}\n`);
    return { ...scope, diffPath };
  } catch {
    return scope;
  }
};

/**
 * Step 3: build the reviewer roster. Starts from the built-in generic reviewer
 * (or the initial roster of an existing config, when modifying a preset) and
 * lets the user add stored profiles (searchable), change per-reviewer models,
 * and remove reviewers.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @param {readonly RosterEntry[]} [initial] Starting roster (defaults to the built-in generic reviewer)
 * @returns The roster step result
 */
const buildRoster = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  initial: readonly RosterEntry[] = defaultRoster(),
): Promise<StepResult<RosterEntry[]>> => {
  const roster: RosterEntry[] = initial.map((entry) => ({
    reviewer: { ...entry.reviewer },
    source: entry.source,
  }));

  for (;;) {
    const summary = roster
      .map((entry) => `${entry.reviewer.label} (${entry.reviewer.model})`)
      .join(', ');
    const menuOptions: string[] = [
      '+ Add reviewer (profile)',
      '~ Change model of a reviewer',
    ];
    // Removing the last reviewer would leave an empty roster — hide the option.
    if (roster.length > 1) menuOptions.push('− Remove reviewer');
    menuOptions.push('✓ Done — choose settings');
    menuOptions.push('← Back');
    const pick = await ctx.ui.select(
      `Reviewers [${roster.length}]: ${summary}`,
      menuOptions,
    );

    if (pick === undefined) {
      const cancel = await ctx.ui.confirm('Cancel setup', 'Cancel the review setup?');
      if (cancel) return { status: 'cancel' };
      continue;
    }

    if (pick === '← Back') return { status: 'back' };

    if (pick === '+ Add reviewer (profile)') {
      const added = await addProfileReviewer(pi, ctx, roster);
      if (added !== null) {
        roster.push({ reviewer: added, source: 'profile' });
        ctx.ui.notify(`Added reviewer: ${added.label} (${added.model})`, 'info');
      }
      continue;
    }
    if (pick === '~ Change model of a reviewer') {
      await changeReviewerModel(ctx, roster);
      continue;
    }
    if (pick === '− Remove reviewer') {
      const labels = roster.map(
        (entry) => `${entry.reviewer.label} (${entry.reviewer.model})`,
      );
      const target = await ctx.ui.select('Remove which reviewer?', labels);
      const index = target === undefined ? -1 : labels.indexOf(target);
      if (index >= 0) roster.splice(index, 1);
      continue;
    }
    if (pick === '✓ Done — choose settings') {
      return { status: 'ok', value: roster };
    }
  }
};

/**
 * Adds a stored profile as a reviewer: lists profiles over the profiles
 * extension bus with descriptions (searchable), lets the user pick one and a
 * model, and appends it to the roster.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @param {RosterEntry[]} roster The current roster (mutable, for dup checks)
 * @returns The added reviewer profile, or null when nothing was added
 */
const addProfileReviewer = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  roster: readonly RosterEntry[],
): Promise<ReviewerProfile | null> => {
  if (!isProfilesExtensionLoaded(pi)) {
    ctx.ui.notify(PROFILES_INSTALL_HINT, 'error');
    return null;
  }

  const profiles = await listProfilesWithDetails(pi, ctx.cwd);
  if (profiles.length === 0) {
    ctx.ui.notify(
      'No profiles in .agents/profiles/. Create one with /profiles --new.',
      'info',
    );
    return null;
  }

  const items: SelectItem[] = profiles.map((profile) => ({
    value: profile.name,
    label: profile.name,
    description: profile.description || '(no description)',
  }));

  const picked = await selectProfileWithSearch(
    ctx,
    'Add reviewer — search or navigate profiles',
    items,
  );
  if (picked === null) return null;

  const profile = profiles.find((candidate) => candidate.name === picked);
  if (profile === undefined) return null;

  if (roster.some((entry) => entry.reviewer.id === profile.name)) {
    ctx.ui.notify(`Reviewer already in roster: ${profile.name}`, 'warning');
    return null;
  }

  const reviewer = await pickModelForProfile(ctx, profile);
  if (reviewer === null) return null;
  return reviewer;
};

/**
 * Asks for the model of a profile reviewer via a searchable list of every
 * model available in this session, preselected with the profile's preferred
 * model when it is pickable (bare ids are resolved to their registered
 * `provider/model-id` form), otherwise with the currently active model.
 * Returns null on cancel.
 * @param {ExtensionContext} ctx The command context
 * @param {Profile} profile The chosen profile
 * @returns The reviewer profile with the chosen model, or null on cancel
 */
const pickModelForProfile = async (
  ctx: ExtensionContext,
  profile: Profile,
): Promise<ReviewerProfile | null> => {
  const model = await pickModel(
    ctx,
    `Model for '${profile.name}' (provider/model-id):`,
    profile.model,
  );
  if (model === null) return null;
  return profileToReviewerProfile(profile, model);
};

/**
 * Changes the model of one roster member.
 * @param {ExtensionContext} ctx The command context
 * @param {RosterEntry[]} roster The current roster (mutable)
 * @returns Nothing
 */
const changeReviewerModel = async (
  ctx: ExtensionContext,
  roster: RosterEntry[],
): Promise<void> => {
  const labels = roster.map((entry) => `${entry.reviewer.label} (${entry.reviewer.model})`);
  const target = await ctx.ui.select('Change model of which reviewer?', labels);
  const index = target === undefined ? -1 : labels.indexOf(target);
  if (index < 0) return;
  const entry = roster[index];
  if (entry === undefined) return;

  // Preselect the reviewer's current model; the session's active model is the
  // fallback when that id is not pickable.
  const model = await pickModel(
    ctx,
    `Model for '${entry.reviewer.label}' (provider/model-id):`,
    entry.reviewer.model,
  );
  if (model === null) return;

  roster[index] = {
    ...entry,
    reviewer: { ...entry.reviewer, model },
  };
  ctx.ui.notify(`${entry.reviewer.label} → ${model}`, 'info');
};

/**
 * Step 4: edit the loop settings (max loops, fixer model, supervisor model,
 * deadlock threshold). "← Back" returns to the roster step. Loops until the
 * user finishes. The confirm entry is flow-specific via `doneLabel`.
 * @param {ExtensionContext} ctx The command context
 * @param {ReviewSettings} initial Starting settings
 * @param {string} [doneLabel] Confirm entry label (defaults to start review)
 * @returns The settings step result
 */
const editSettings = async (
  ctx: ExtensionContext,
  initial: ReviewSettings,
  doneLabel: string = '✓ Done — start review',
): Promise<StepResult<ReviewSettings>> => {
  const current: {
    maxLoops: number;
    maxCycles: number;
    fixerModel: string;
    supervisorModel: string;
    deadlockFlipThreshold: number;
    agentConcurrency: number;
  } = { ...initial };

  for (;;) {
    const pick = await ctx.ui.select('Review settings', [
      ...settingsMenuItems(current, doneLabel),
      '← Back',
    ]);
    if (pick === undefined) {
      const cancel = await ctx.ui.confirm('Cancel setup', 'Cancel the review setup?');
      if (cancel) return { status: 'cancel' };
      continue;
    }

    if (pick === '← Back') return { status: 'back' };

    if (pick.startsWith('Max loops')) {
      const value = await ctx.ui.input(
        'Max loops (independent reviewer sets):',
        String(current.maxLoops),
      );
      if (value === undefined) continue;
      const parsed = parsePositiveInt(value);
      if (parsed === undefined) {
        ctx.ui.notify(`'${value}' is not a positive integer.`, 'warning');
        continue;
      }
      current.maxLoops = parsed;
      ctx.ui.notify(`Max loops → ${parsed}`, 'info');
      continue;
    }
    if (pick.startsWith('Max cycles')) {
      const value = await ctx.ui.input(
        'Max cycles per loop (same reviewers re-review up to this):',
        String(current.maxCycles),
      );
      if (value === undefined) continue;
      const parsed = parsePositiveInt(value);
      if (parsed === undefined) {
        ctx.ui.notify(`'${value}' is not a positive integer.`, 'warning');
        continue;
      }
      current.maxCycles = parsed;
      ctx.ui.notify(`Max cycles per loop → ${parsed}`, 'info');
      continue;
    }
    if (pick.startsWith('Fixer model')) {
      const model = await pickModel(ctx, 'Fixer model (provider/model-id):', current.fixerModel);
      if (model === null) continue;
      current.fixerModel = model;
      ctx.ui.notify(`Fixer model → ${model}`, 'info');
      continue;
    }
    if (pick.startsWith('Supervisor model')) {
      const model = await pickModel(
        ctx,
        'Supervisor model (provider/model-id):',
        current.supervisorModel,
      );
      if (model === null) continue;
      current.supervisorModel = model;
      ctx.ui.notify(`Supervisor model → ${model}`, 'info');
      continue;
    }
    if (pick.startsWith('Deadlock flip threshold')) {
      const value = await ctx.ui.input(
        'Deadlock flip threshold (status flips before escalation):',
        String(current.deadlockFlipThreshold),
      );
      if (value === undefined) continue;
      const parsed = parsePositiveInt(value);
      if (parsed === undefined) {
        ctx.ui.notify(`'${value}' is not a positive integer.`, 'warning');
        continue;
      }
      current.deadlockFlipThreshold = parsed;
      ctx.ui.notify(`Deadlock flip threshold → ${parsed}`, 'info');
      continue;
    }
    if (pick.startsWith('Agent concurrency')) {
      const value = await ctx.ui.input(
        'Agent concurrency (parallel reviewers/fixers, 1 = sequential):',
        String(current.agentConcurrency),
      );
      if (value === undefined) continue;
      const parsed = parsePositiveInt(value);
      if (parsed === undefined) {
        ctx.ui.notify(`'${value}' is not a positive integer.`, 'warning');
        continue;
      }
      current.agentConcurrency = parsed;
      ctx.ui.notify(`Agent concurrency → ${parsed}`, 'info');
      continue;
    }
    if (pick === doneLabel) {
      return {
        status: 'ok',
        value: {
          maxLoops: current.maxLoops,
          maxCycles: current.maxCycles,
          fixerModel: current.fixerModel,
          supervisorModel: current.supervisorModel,
          deadlockFlipThreshold: current.deadlockFlipThreshold,
          agentConcurrency: current.agentConcurrency,
        },
      };
    }
  }
};

// ─── Preset flows ────────────────────────────────────────────────────

/**
 * Runs the preset submenu: Create / List / Modify / Delete, plus "← Back" to
 * the action menu. Each operation returns to the submenu on completion;
 * cancelling exits the setup. Running a review happens via "New review" in
 * the action menu, which starts from a stored preset.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @returns The flow outcome
 */
const runPresetFlow = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<FlowResult> => {
  for (;;) {
    const action = await pickPresetAction(ctx);
    if (action === null) return { status: 'cancel' };
    if (action === 'back') return { status: 'back' }; // → action menu

    if (action === 'create') {
      const created = await createPreset(pi, ctx);
      if (created === null) continue;
      ctx.ui.notify(
        `Preset '${created.name}' created — ${presetSummary(created.config)}.`,
        'info',
      );
      const exit = await askExitOrContinue(ctx);
      if (exit) return { status: 'cancel' };
      continue;
    }
    if (action === 'list') {
      await listPresetsFlow(pi, ctx);
      continue;
    }
    if (action === 'modify') {
      const name = await modifyPreset(pi, ctx);
      if (name !== null) ctx.ui.notify(`Preset updated: ${name}`, 'info');
      continue;
    }
    if (action === 'delete') {
      const name = await removePreset(ctx);
      if (name !== null) ctx.ui.notify(`Preset deleted: ${name}`, 'info');
      continue;
    }
  }
};

/**
 * The preset submenu action picker, with "← Back" to the action menu. When
 * no presets are stored, only "Create preset" is offered — List / Modify /
 * Delete all need an existing preset. (Running a review from a preset happens
 * via "New review" in the action menu.)
 * @param {ExtensionContext} ctx The command context
 * @returns The chosen preset action, or null on cancel
 */
const pickPresetAction = async (ctx: ExtensionContext): Promise<PresetAction | null> => {
  const names = await runPresetOp(ctx, listPresets(ctx.cwd));
  const hasPresets = names !== null && names.length > 0;

  const options = ['Create preset'];
  if (hasPresets) options.push('List presets', 'Modify preset', 'Delete preset');
  options.push('← Back');

  const pick = await ctx.ui.select('Preset — what would you like to do?', options);
  if (pick === 'Create preset') return 'create';
  if (pick === 'List presets') return 'list';
  if (pick === 'Modify preset') return 'modify';
  if (pick === 'Delete preset') return 'delete';
  if (pick === '← Back') return 'back';
  return null;
};

/**
 * Runs a preset-store effect, notifying the user on PresetError and returning
 * null so the caller can stay in the preset menu.
 * @param {ExtensionContext} ctx The command context
 * @param {Effect.Effect<A, PresetError, FileSystem | Path>} effect The store effect
 * @returns The success value, or null on failure
 */
const runPresetOp = async <A>(
  ctx: ExtensionContext,
  effect: Effect.Effect<A, PresetError, FileSystem | Path>,
): Promise<A | null> => {
  const outcome = await Effect.runPromise(
    effect.pipe(Effect.provide(NodeServices.layer), Effect.result),
  );
  if (Result.isFailure(outcome)) {
    ctx.ui.notify(`Preset error: ${outcome.failure.message}`, 'error');
    return null;
  }
  return outcome.success;
};

/**
 * Asks for a preset name, validated and retried until valid or cancelled.
 * @param {ExtensionContext} ctx The command context
 * @param {string} initial Prefill for the input (modify keeps the same name)
 * @returns The validated name, or null on cancel
 */
const askPresetName = async (
  ctx: ExtensionContext,
  initial: string,
): Promise<string | null> => {
  for (;;) {
    const input = await ctx.ui.input(
      'Preset name (letters, digits, dots, underscores, dashes):',
      initial,
    );
    if (input === undefined) return null;
    const trimmed = input.trim();
    if (!isValidPresetName(trimmed)) {
      ctx.ui.notify(
        `Invalid preset name '${trimmed}' — use letters, digits, '.', '_', '-'.`,
        'warning',
      );
      continue;
    }
    return trimmed;
  }
};

/**
 * Asks whether to keep managing presets after a create, or leave the wizard.
 * @param {ExtensionContext} ctx The command context
 * @returns True when the user chose Exit (leave the wizard)
 */
const askExitOrContinue = async (ctx: ExtensionContext): Promise<boolean> => {
  const pick = await ctx.ui.select(
    'Preset created — continue managing presets, or exit?',
    ['Continue', 'Exit'],
  );
  return pick === 'Exit';
};

/**
 * One-line summary of a stored (reference-based) config — used in the preset
 * picker descriptions and the post-create log.
 * @param {PresetLoopConfigDecoded} config The stored config
 * @returns The summary text
 */
const presetSummary = (config: PresetLoopConfigDecoded): string => {
  const roster = config.reviewers
    .map((ref) => (ref.type === 'builtin' ? ref.id : ref.name))
    .join(', ');
  const cycles =
    config.maxCycles !== undefined ? ` · cycles ${config.maxCycles}/loop` : '';
  return `reviewers: ${roster} · loops ${config.maxLoops}${cycles} · fixer ${config.fixerModel}`;
};

/**
 * Converts one roster entry to its stored reviewer reference. Builtin entries
 * become `{ type: 'builtin', id }` (model omitted when it equals the default);
 * profile entries become `{ type: 'profile', name, model }` — the profile
 * stays the source of truth for objective/skill/label.
 * @param {RosterEntry} entry The roster entry
 * @returns The stored reference
 */
const reviewerToStoredRef = (entry: RosterEntry): ReviewerRefDecoded => {
  if (entry.source === 'builtin') {
    return {
      type: 'builtin',
      id: entry.reviewer.id,
      model:
        entry.reviewer.model === DEFAULT_REVIEWER_MODEL ? undefined : entry.reviewer.model,
    };
  }
  return { type: 'profile', name: entry.reviewer.id, model: entry.reviewer.model };
};

/**
 * Builds the stored (reference-based) config from the confirmed roster +
 * settings — what actually gets written to the preset file.
 * @param {RosterEntry[]} roster The confirmed roster
 * @param {ReviewSettings} settings The confirmed settings
 * @returns The stored config
 */
const storedConfigFrom = (
  roster: RosterEntry[],
  settings: ReviewSettings,
): PresetLoopConfigDecoded => {
  const base = defaultLoopConfig();
  return {
    reviewers: roster.map((entry) => reviewerToStoredRef(entry)),
    supervisor: { model: settings.supervisorModel },
    fixerModel: settings.fixerModel,
    maxLoops: settings.maxLoops,
    maxCycles: settings.maxCycles,
    agentConcurrency: settings.agentConcurrency,
    deadlock: { ...base.deadlock, flipThreshold: settings.deadlockFlipThreshold },
  };
};

/**
 * "Create preset": like a new review but skips the scope — roster + settings
 * only — then persists the configuration to `.agents/review-presets/`.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @returns The saved preset (name + config), or null when cancelled/failed
 */
const createPreset = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<PresetCreated | null> => {
  const name = await askPresetName(ctx, '');
  if (name === null) return null;

  const exists = await runPresetOp(ctx, presetExists(ctx.cwd, name));
  if (exists) {
    ctx.ui.notify(
      `Preset '${name}' already exists — use Modify preset to change it.`,
      'warning',
    );
    return null;
  }

  let roster: RosterEntry[] | null = null;
  for (;;) {
    if (roster === null) {
      const step = await buildRoster(pi, ctx);
      if (step.status === 'cancel') return null;
      if (step.status === 'back') return null; // back from roster → preset submenu
      roster = step.value;
      continue;
    }

    const step = await editSettings(ctx, defaultSettings(), '✓ Done — create preset');
    if (step.status === 'cancel') return null;
    if (step.status === 'back') {
      roster = null; // → re-build roster
      continue;
    }
    const settings = step.value;
    const config = storedConfigFrom(roster, settings);

    const saved = await runPresetOp(ctx, writePreset(ctx.cwd, name, config));
    return saved === null ? null : { name, config };
  }
};

/**
 * Runs a review from a stored preset: pick one, resolve its reviewer
 * references, pick the scope (presets store no path), and run. This is the
 * backing flow for the action menu's "New review".
 * @param {ExtensionAPI} pi The Pi extension API (event bus for profiles)
 * @param {ExtensionContext} ctx The command context
 * @returns The flow outcome
 */
const usePreset = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<FlowResult> => {
  const picked = await pickPreset(ctx);
  if (picked === null) return { status: 'back' }; // → action menu

  const preset = await runPresetOp(ctx, readPreset(ctx.cwd, picked));
  if (preset === null) return { status: 'cancel' };

  const config = await resolvePresetConfig(pi, ctx, preset.config);
  if (config === null) return { status: 'cancel' };

  for (;;) {
    const step = await pickScope(ctx);
    if (step.status === 'cancel') return { status: 'cancel' };
    if (step.status === 'back') return { status: 'back' }; // → action menu
    const effectiveScope = await materializeScopeDiff(ctx, step.value);
    return { status: 'run', opts: optsFromConfig(ctx, config, effectiveScope) };
  }
};

// ─── Resume flow ────────────────────────────────────────────────────

/** An existing review file that can be resumed. */
interface ReviewEntry {
  readonly name: string;
  readonly code: number;
  readonly file: string;
  /** 0-based loop index from loop-state. */
  readonly loop: number;
  readonly cycle: number;
  readonly summary: SummaryCounts | undefined;
  /** Reviewer ids from the review's locked-in config, when snapshot exists. */
  readonly reviewers: readonly string[];
}

/**
 * Reads the locked-in config snapshot from a review's loop-state, or undefined
 * for legacy states that predate config snapshots.
 * @param {string} reviewFile Absolute path to the review file
 * @returns The stored config, or undefined
 */
const readStoredConfig = (reviewFile: string): LoopConfig | undefined => {
  try {
    const statePath = loopStatePath(reviewFile);
    if (!fs.existsSync(statePath)) return undefined;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { config?: unknown };
    return isStoredConfig(state.config) ? state.config : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Lists the existing review files under `.agents/reviews/adversarial/`
 * (numeric codes only), newest first, annotated with their loop-state cycle
 * and summary counts.
 * @param {string} cwd Working directory
 * @returns The review entries
 */
const listReviews = (cwd: string): readonly ReviewEntry[] => {
  const dir = path.join(cwd, '.agents/reviews', 'adversarial');
  if (!fs.existsSync(dir)) return [];

  const entries: ReviewEntry[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const match = entry.match(/^(\d+)[^.]*\.md$/);
    if (match === null) continue;
    const file = path.join(dir, entry);
    entries.push({
      name: entry,
      code: parseInt(match[1] ?? '0', 10),
      file,
      loop: readLoopState(file).loop,
      cycle: readLoopState(file).cycle,
      summary: readReviewSummary(file),
      reviewers: readStoredConfig(file)?.reviewers.map((reviewer) => reviewer.id) ?? [],
    });
  }
  return entries.sort((left, right) => right.code - left.code);
};

/** Loop/cycle counters persisted in loop-state.json (0 when absent). */
const readLoopState = (reviewFile: string): { readonly loop: number; readonly cycle: number } => {
  try {
    const statePath = loopStatePath(reviewFile);
    if (!fs.existsSync(statePath)) return { loop: 0, cycle: 0 };
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      loop?: number;
      cycle?: number;
    };
    return {
      loop: typeof state.loop === 'number' ? state.loop : 0,
      cycle: typeof state.cycle === 'number' ? state.cycle : 0,
    };
  } catch {
    return { loop: 0, cycle: 0 };
  }
};

/** Parses the summary counts from a review file, or undefined. */
const readReviewSummary = (reviewFile: string): SummaryCounts | undefined => {
  try {
    return Option.getOrUndefined(parseSummaryText(fs.readFileSync(reviewFile, 'utf8')));
  } catch {
    return undefined;
  }
};

/** One-line description for a review entry. */
const reviewDescription = (review: ReviewEntry): string => {
  const parts: string[] = [];
  if (review.reviewers.length > 0) parts.push(review.reviewers.join(', '));
  if (review.loop > 0 || review.cycle > 0) {
    parts.push(`loop ${review.loop + 1} · cycle ${review.cycle + 1}`);
  }
  if (review.summary !== undefined) {
    parts.push(
      `open ${review.summary.open} · in-review ${review.summary.inReview} · ` +
        `resolved ${review.summary.resolved} · escalated ${review.summary.escalated}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : 'no loop state yet';
};

/**
 * Searchable picker over the existing reviews to resume.
 * @param {ExtensionContext} ctx The command context
 * @returns The chosen review entry, or null on cancel / none
 */
const pickReview = async (ctx: ExtensionContext): Promise<ReviewEntry | null> => {
  const reviews = listReviews(ctx.cwd);
  if (reviews.length === 0) {
    ctx.ui.notify('No reviews in .agents/reviews/adversarial/ to resume.', 'info');
    return null;
  }
  const items = reviews.map((review) => ({
    value: review.name,
    label: review.name,
    description: reviewDescription(review),
  }));
  const picked = await selectWithSearch(ctx, 'Resume which review?', items);
  if (picked === null) return null;
  return reviews.find((review) => review.name === picked) ?? null;
};

/**
 * "Resume review": pick an existing review (interrupted loop) and re-run it in
 * place (`fresh: false`, targeting the chosen file) so the loop continues from
 * where it stopped. The config is **locked in** — the review's stored snapshot
 * is used verbatim (no preset pick); legacy reviews without a snapshot fall
 * back to picking a preset (which then becomes their snapshot).
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @returns The flow outcome
 */
const runResumeFlow = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<FlowResult> => {
  const review = await pickReview(ctx);
  if (review === null) return { status: 'back' }; // → action menu

  const stored = readStoredConfig(review.file);
  if (stored !== undefined) {
    return { status: 'run', opts: optsForResume(ctx, stored, review.file) };
  }

  // Legacy review without a config snapshot → fall back to a preset pick.
  const presetName = await pickPreset(ctx);
  if (presetName === null) return { status: 'back' }; // → action menu
  const preset = await runPresetOp(ctx, readPreset(ctx.cwd, presetName));
  if (preset === null) return { status: 'cancel' };
  const config = await resolvePresetConfig(pi, ctx, preset.config);
  if (config === null) return { status: 'cancel' };

  return { status: 'run', opts: optsForResume(ctx, config, review.file) };
};

/**
 * "Modify preset": pick a stored preset (or use an already-picked name from
 * the list view), re-edit roster + settings seeded from its config, and write
 * the result back under the same name.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @param {string} [name] Preset to modify (skips the picker when given)
 * @returns The modified preset name, or null when cancelled/failed
 */
const modifyPreset = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  name?: string,
): Promise<string | null> => {
  const picked = name ?? (await pickPreset(ctx));
  if (picked === null) return null;

  const preset = await runPresetOp(ctx, readPreset(ctx.cwd, picked));
  if (preset === null) return null;

  const config = await resolvePresetConfig(pi, ctx, preset.config);
  if (config === null) return null;

  let roster: RosterEntry[] | null = null;
  for (;;) {
    if (roster === null) {
      const step = await buildRoster(pi, ctx, rosterFromConfig(config));
      if (step.status === 'cancel') return null;
      if (step.status === 'back') return null; // back from roster → preset submenu
      roster = step.value;
      continue;
    }

    const step = await editSettings(ctx, settingsFromConfig(config), '✓ Done — update preset');
    if (step.status === 'cancel') return null;
    if (step.status === 'back') {
      roster = null; // → re-build roster
      continue;
    }

    const saved = await runPresetOp(
      ctx,
      writePreset(ctx.cwd, picked, storedConfigFrom(roster, step.value)),
    );
    return saved === null ? null : picked;
  }
};

/**
 * "Delete preset": pick a stored preset (or use an already-picked name from
 * the list view), confirm, and remove its file.
 * @param {ExtensionContext} ctx The command context
 * @param {string} [name] Preset to delete (skips the picker when given)
 * @returns The deleted preset name, or null when cancelled/failed
 */
const removePreset = async (ctx: ExtensionContext, name?: string): Promise<string | null> => {
  const picked = name ?? (await pickPreset(ctx));
  if (picked === null) return null;

  const confirmed = await ctx.ui.confirm('Delete preset', `Delete preset '${picked}'?`);
  if (!confirmed) return null;

  const done = await runPresetOp(ctx, deleteStoredPreset(ctx.cwd, picked));
  return done === null ? null : picked;
};

// ─── Preset list / detail view ──────────────────────────────────────

/**
 * Renders a small boxed ASCII graphic of a preset's configuration, e.g.:
 *
 * ```
 * ┌─ preset: security-audit ─────────────────┐
 * │ reviewers : generic, security-auditor    │
 * │ supervisor: deepseek-v4-pro              │
 * │ fixer     : deepseek-v4-flash-free       │
 * │ max loops : 5                            │
 * │ deadlock  : flip 2 → escalate            │
 * └──────────────────────────────────────────┘
 * ```
 * @param {ReviewPresetDecoded} preset The stored preset
 * @returns The boxed graphic text
 */
export const renderPresetGraphic = (preset: ReviewPresetDecoded): string => {
  const { name, config } = preset;
  const roster = config.reviewers
    .map((ref) => (ref.type === 'builtin' ? ref.id : ref.name))
    .join(', ');
  const rows = [
    `preset   : ${name}`,
    `reviewers: ${roster}`,
    `supervisor: ${config.supervisor.model}`,
    `fixer    : ${config.fixerModel}`,
    `max loops: ${config.maxLoops}`,
    `max cycles/loop: ${config.maxCycles ?? config.maxLoops}`,
    `deadlock : flip ${config.deadlock.flipThreshold} → ${config.deadlock.action}`,
  ];
  const inner = Math.max(...rows.map((row) => row.length));
  const pad = (row: string): string => row + ' '.repeat(inner - row.length);
  // Body rows are `│ ` + inner + ` │` = inner+4 chars, so the border needs
  // inner+2 dashes to line up (box-drawing chars are 1 column in modern terms).
  const border = '─'.repeat(inner + 2);
  return [
    `┌${border}┐`,
    ...rows.map((row) => `│ ${pad(row)} │`),
    `└${border}┘`,
  ].join('\n');
};

/**
 * Shows the preset's ASCII graphic in a dismissible dialog (enter/esc).
 * @param {ExtensionContext} ctx The command context
 * @param {ReviewPresetDecoded} preset The stored preset
 * @returns A promise resolving when the dialog is dismissed
 */
const showPresetGraphic = async (
  ctx: ExtensionContext,
  preset: ReviewPresetDecoded,
): Promise<void> =>
  ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
    container.addChild(
      new Text(theme.fg('accent', theme.bold(`Preset: ${preset.name}`)), 1, 1),
    );
    container.addChild(new Text(theme.fg('accent', renderPresetGraphic(preset)), 1, 1));
    container.addChild(new Text(theme.fg('dim', 'press enter or esc to continue'), 1, 1));
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

    return {
      render: (w) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        if (data === '\r' || data === '\n' || data === '\x1b') done(undefined);
      },
    };
  });

/**
 * "List presets": pick a stored preset, view its ASCII graphic, and act on it
 * (modify / delete / back) directly from the view.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @returns A promise completing when the list view is left
 */
const listPresetsFlow = async (pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> => {
  const picked = await pickPreset(ctx);
  if (picked === null) return;
  await presetDetailFlow(pi, ctx, picked);
};

/**
 * Preset detail view: render the config graphic, then offer Modify / Delete /
 * ← Back. After a successful modify the graphic is re-rendered with the
 * updated config; delete (success or cancel) leaves the view.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @param {string} name The preset being viewed
 * @returns A promise completing when the view is left
 */
const presetDetailFlow = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  name: string,
): Promise<void> => {
  for (;;) {
    const preset = await runPresetOp(ctx, readPreset(ctx.cwd, name));
    if (preset === null) return;
    await showPresetGraphic(ctx, preset);

    const action = await ctx.ui.select(`Preset '${name}' — what would you like to do?`, [
      'Modify preset',
      'Delete preset',
      '← Back',
    ]);
    if (action === undefined || action === '← Back') return;

    if (action === 'Modify preset') {
      const modified = await modifyPreset(pi, ctx, name);
      if (modified !== null) ctx.ui.notify(`Preset updated: ${modified}`, 'info');
      continue; // re-render the updated graphic
    }

    if (action === 'Delete preset') {
      const deleted = await removePreset(ctx, name);
      if (deleted !== null) ctx.ui.notify(`Preset deleted: ${deleted}`, 'info');
      return;
    }
  }
};

/**
 * Searchable picker over the stored presets, each annotated with its
 * configuration summary. Returns null on cancel, no presets, or store errors.
 * @param {ExtensionContext} ctx The command context
 * @returns The chosen preset name, or null
 */
const pickPreset = async (ctx: ExtensionContext): Promise<string | null> => {
  const names = await runPresetOp(ctx, listPresets(ctx.cwd));
  if (names === null) return null;

  if (names.length === 0) {
    ctx.ui.notify(
      'No presets stored in .agents/review-presets/. Create one first.',
      'info',
    );
    return null;
  }

  const items: SelectItem[] = [];
  for (const name of names) {
    const preset = await runPresetOp(ctx, readPreset(ctx.cwd, name));
    const description =
      preset === null ? `.agents/review-presets/${name}.json` : presetSummary(preset.config);
    items.push({ value: name, label: name, description });
  }
  return selectWithSearch(ctx, 'Choose a preset', items);
};

/**
 * Searchable select dialog (SelectList with incremental type-to-filter),
 * following the profiles extension's custom-component pattern. When
 * `initialValue` matches an item, that item is preselected.
 * @param {ExtensionContext} ctx The command context
 * @param {string} title Dialog title
 * @param {SelectItem[]} items Selectable items (value/label/description)
 * @param {string} [initialValue] Value to preselect (defaults to the first item)
 * @returns The selected value, or null on cancel
 */
export const selectWithSearch = async (
  ctx: ExtensionContext,
  title: string,
  items: SelectItem[],
  initialValue?: string,
): Promise<string | null> => {
  const initialIndex = Math.max(
    0,
    items.findIndex((item) => item.value === initialValue),
  );

  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
    container.addChild(new Text(theme.fg('accent', theme.bold(title)), 1, 0));

    const list = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (t) => theme.fg('accent', t),
      selectedText: (t) => theme.fg('accent', t),
      description: (t) => theme.fg('muted', t),
      scrollInfo: (t) => theme.fg('dim', t),
      noMatch: (t) => theme.fg('warning', t),
    });
    if (items.length > 0) list.setSelectedIndex(initialIndex);
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(null);
    container.addChild(list);

    container.addChild(
      new Text(theme.fg('dim', 'type to search • ↑↓ navigate • enter select • esc cancel'), 1, 0),
    );
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

    let query = '';
    const isPrintable = (data: string): boolean =>
      data.length === 1 && data >= ' ' && data !== '\x7f' && data !== '\n' && data !== '\r';

    return {
      render: (w) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        if (isPrintable(data)) {
          query += data;
          list.setFilter(query);
        } else if (data === '\x7f' || data === '\b') {
          query = query.slice(0, -1);
          list.setFilter(query);
        } else {
          list.handleInput(data);
        }
        tui.requestRender();
      },
    };
  });
};

/**
 * Searchable profile picker (delegates to the generic search dialog).
 * @param {ExtensionContext} ctx The command context
 * @param {string} title Dialog title
 * @param {SelectItem[]} items Selectable profile items
 * @returns The selected profile name, or null on cancel
 */
const selectProfileWithSearch = async (
  ctx: ExtensionContext,
  title: string,
  items: SelectItem[],
): Promise<string | null> => selectWithSearch(ctx, title, items);

/**
 * Sentinel value for the "(type a custom model id…)" entry at the bottom of
 * the model picker. Model ids are always `provider/model-id` (contain a `/`),
 * so a slash-free sentinel can never collide with a registered choice.
 */
export const CUSTOM_MODEL_ID_ENTRY = '__type-a-custom-model-id__';

/**
 * Free-text model prompt: accepts any string — a bare id, a custom
 * `provider/model-id`, an OpenRouter/local/self-hosted model id, or a model
 * whose catalog entry is stale or not yet fetched. Used when the session
 * registry is empty and when the user picks the "(type a custom model id…)"
 * entry in the list. Returns null on cancel/empty input.
 * @param {ExtensionContext} ctx The command context
 * @param {string} title Prompt title
 * @param {Array<string | undefined>} preferred Candidate ids to prefill, in priority order
 * @returns The entered model id, or null on cancel/empty input
 */
const promptModelText = async (
  ctx: ExtensionContext,
  title: string,
  preferred: Array<string | undefined>,
): Promise<string | null> => {
  const prefill =
    preferred.find((candidate) => candidate !== undefined && candidate.trim() !== '') ??
    currentModelId(ctx) ??
    DEFAULT_REVIEWER_MODEL;
  const input = await ctx.ui.input(title, prefill);
  if (input === undefined) return null;
  const trimmed = input.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Model picker for reviewers/settings: a searchable list of every model
 * available in this session, preselected with the first pickable preferred id
 * (or the session's currently active model, or the first entry). A persistent
 * "(type a custom model id…)" entry at the bottom of the list routes to the
 * free-text prompt, so models outside the session catalogue (bare ids, custom
 * `provider/model-id`, OpenRouter/local/self-hosted ids) stay selectable.
 * When no models are registered at all, the free-text prompt is shown
 * directly. Returns the picked id, or null on cancel/empty input.
 * @param {ExtensionContext} ctx The command context
 * @param {string} title Dialog title
 * @param {Array<string | undefined>} preferred Candidate ids to preselect, in priority order
 * @returns The picked `provider/model-id`, or null on cancel
 */
export const pickModel = async (
  ctx: ExtensionContext,
  title: string,
  ...preferred: Array<string | undefined>
): Promise<string | null> => {
  const choices = listModelChoices(ctx);
  if (choices.length === 0) {
    return promptModelText(ctx, title, preferred);
  }
  const items: SelectItem[] = [
    ...modelSelectItems(choices),
    {
      value: CUSTOM_MODEL_ID_ENTRY,
      label: '(type a custom model id…)',
      description: 'any provider/model-id — even if not in this session',
    },
  ];
  const initial = resolveInitialModel(ctx, ...preferred);
  const picked = await selectWithSearch(ctx, title, items, initial);
  if (picked === CUSTOM_MODEL_ID_ENTRY) {
    return promptModelText(ctx, title, preferred);
  }
  return picked;
};

// ─── Options assembly ────────────────────────────────────────────────

/**
 * The roster entries for an existing config (used by Modify preset to seed
 * the roster editor).
 * @param {LoopConfig} config The loop config
 * @returns The roster entries
 */
const rosterFromConfig = (config: LoopConfig): RosterEntry[] =>
  config.reviewers.map((reviewer) => ({
    reviewer,
    // Resolved reviewers are either the builtin generic or profile-derived
    // (id = profile name) — a builtin catalog hit means the builtin.
    source: BUILTIN_REVIEWERS[reviewer.id] !== undefined ? 'builtin' : 'profile',
  }));

/**
 * The editable settings for an existing config (used by Modify preset).
 * @param {LoopConfig} config The loop config
 * @returns The review settings
 */
const settingsFromConfig = (config: LoopConfig): ReviewSettings => ({
  maxLoops: config.maxLoops,
  maxCycles: config.maxCycles,
  fixerModel: config.fixerModel,
  supervisorModel: config.supervisor.model,
  deadlockFlipThreshold: config.deadlock.flipThreshold,
  agentConcurrency: config.agentConcurrency,
});

/**
 * Builds the loop options from a confirmed config + scope. Interactive runs
 * always allocate a fresh review code (`fresh: true`) and target the current
 * directory.
 * @param {ExtensionContext} ctx The command context
 * @param {LoopConfig} config The loop config
 * @param {ReviewScope} scope The confirmed scope
 * @returns The loop options
 */
const optsFromConfig = (
  ctx: ExtensionContext,
  config: LoopConfig,
  scope: ReviewScope,
): LoopOptions => ({
  reviewerModel: config.reviewers[0]?.model ?? DEFAULT_REVIEWER_MODEL,
  fixerModel: config.fixerModel,
  maxLoops: config.maxLoops,
  maxCycles: config.maxCycles,
  targetDir: ctx.cwd,
  reviewName: 'adversarial',
  fresh: true,
  config,
  reviewScope: scope.scope,
  scopeFiles: scope.files,
  scopeDiffPath: scope.diffPath,
});

/**
 * Builds the loop options for resuming an existing review: re-run in place
 * (`fresh: false`) against the chosen review file, no scope pick (the
 * re-review pass targets the existing findings).
 * @param {ExtensionContext} ctx The command context
 * @param {LoopConfig} config The loop config (from a preset)
 * @param {string} reviewFile Absolute path to the review to resume
 * @returns The loop options
 */
const optsForResume = (
  ctx: ExtensionContext,
  config: LoopConfig,
  reviewFile: string,
): LoopOptions => ({
  reviewerModel: config.reviewers[0]?.model ?? DEFAULT_REVIEWER_MODEL,
  fixerModel: config.fixerModel,
  maxLoops: config.maxLoops,
  maxCycles: config.maxCycles,
  targetDir: ctx.cwd,
  reviewName: 'adversarial',
  fresh: false,
  reviewFile,
  config,
});
