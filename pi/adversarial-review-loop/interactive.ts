import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { NodeServices } from '@effect/platform-node';
import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Container, type SelectItem, SelectList, Text } from '@earendil-works/pi-tui';
import {
  DEFAULT_REVIEWER_MODEL,
  defaultLoopConfig,
  genericReviewer,
  SUPERVISOR_MODES,
  type LoopConfig,
  type ReconcileMode,
  type ReviewerProfile,
  type SupervisorMode,
} from './config';
import type { LoopOptions } from './graph';
import { getUnstagedChanges } from './git';
import { ensureStateDirs, stateDirForReviewFile } from './loop-state';
import { resolveReviewFile } from './resolve-review-file';
import {
  isProfilesExtensionLoaded,
  listProfilesWithDetails,
  profileToReviewerProfile,
  PROFILES_INSTALL_HINT,
  type Profile,
} from './profiles-client';

/**
 * Interactive setup for the adversarial review loop.
 *
 * `/adversarial-review-loop` walks the user through:
 *   1. Action menu — "New review" (resume / history slots come later).
 *   2. Scope — git unstaged changes, or a picked place (files/directories,
 *      a focus prompt, or `.` for the whole directory).
 *   3. Reviewer roster — starts with the built-in `generic` reviewer and lets
 *      the user add stored profiles (searched from `.agents/profiles/` via the
 *      profiles extension), change per-reviewer models, and remove reviewers.
 *   4. Settings — max loops, fixer model, supervisor mode/model, reconcile
 *      mode, deadlock threshold.
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
export type SetupAction = 'new';

/** Loop settings the user can edit before running. */
export interface ReviewSettings {
  readonly maxLoops: number;
  readonly fixerModel: string;
  readonly supervisorMode: SupervisorMode;
  readonly supervisorModel: string;
  readonly reconcileMode: ReconcileMode;
  readonly deadlockFlipThreshold: number;
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
    fixerModel: base.fixerModel,
    supervisorMode: base.supervisor.mode,
    supervisorModel: base.supervisor.model,
    reconcileMode: base.reconciliator.mode,
    deadlockFlipThreshold: base.deadlock.flipThreshold,
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
 * Builds the settings menu options with each entry's current value.
 * @param {ReviewSettings} settings Current settings
 * @returns The selectable menu options
 */
export const settingsMenuItems = (settings: ReviewSettings): readonly string[] => [
  `Max loops (review cycles)      [${settings.maxLoops}]`,
  `Fixer model                    [${settings.fixerModel}]`,
  `Supervisor mode                [${settings.supervisorMode}]`,
  `Supervisor model               [${settings.supervisorModel}]`,
  `Reconcile mode                 [${settings.reconcileMode}]`,
  `Deadlock flip threshold        [${settings.deadlockFlipThreshold}]`,
  '✓ Done — start review',
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
}

/** The default roster: a single built-in generic reviewer (no profile needed). */
const defaultRoster = (): RosterEntry[] => [
  {
    reviewer: genericReviewer(),
  },
];

// ─── Interactive flow ────────────────────────────────────────────────

/**
 * Runs the interactive setup wizard. Returns the loop options to run, or null
 * when the user cancels.
 * @param {ExtensionAPI} pi The Pi extension API (event bus for profiles)
 * @param {ExtensionContext} ctx The command context
 * @returns The confirmed loop options, or null on cancel
 */
export const runInteractiveSetup = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<InteractiveSetupResult | null> => {
  const action = await pickAction(ctx);
  if (action === null) return null;

  const scope = await pickScope(ctx);
  if (scope === null) return null;

  const effectiveScope = await materializeScopeDiff(ctx, scope);
  const roster = await buildRoster(pi, ctx);
  if (roster === null) return null;

  const settings = await editSettings(ctx, defaultSettings());
  if (settings === null) return null;

  return { opts: optsFromSetup(ctx, roster, effectiveScope, settings) };
};

/**
 * Step 1: the action menu. Currently offers "New review"; future entries
 * (resume, history, …) plug in here.
 * @param {ExtensionContext} ctx The command context
 * @returns The chosen action, or null on cancel
 */
const pickAction = async (ctx: ExtensionContext): Promise<SetupAction | null> => {
  const pick = await ctx.ui.select(
    'adversarial-review-loop — what would you like to do?',
    ['New review'],
  );
  return pick === 'New review' ? 'new' : null;
};

/**
 * Step 2: pick what the reviewers will look at — git unstaged changes, or a
 * picked place (files/directories, a focus prompt, or `.` for the whole dir).
 * @param {ExtensionContext} ctx The command context
 * @returns The chosen scope, or null on cancel
 */
const pickScope = async (ctx: ExtensionContext): Promise<ReviewScope | null> => {
  for (;;) {
    const pick = await ctx.ui.select('What should be reviewed?', [
      'Git unstaged changes (tracked + untracked)',
      'Pick — files/directories or a focus prompt',
    ]);

    if (pick === undefined) return null;

    if (pick === 'Git unstaged changes (tracked + untracked)') {
      const changes = getUnstagedChanges(ctx.cwd);
      if (changes.files.length === 0) {
        ctx.ui.notify(
          'No unstaged changes found — falling back to the whole directory.',
          'warning',
        );
        return { mode: 'directory', scope: 'Review the entire directory.', files: [] };
      }
      return {
        mode: 'git-unstaged',
        scope:
          `Review ONLY the unstaged working-tree changes in these files: ` +
          `${changes.files.join(', ')}. Do not audit the whole codebase.`,
        files: changes.files,
      };
    }

    const input = await ctx.ui.input(
      "Files/directories (space-separated), a focus prompt, or '.' for the whole directory:",
      '',
    );
    if (input === undefined) return null;
    const parsed = parseFilesInput(ctx.cwd, input);
    if (parsed.scope === '') {
      ctx.ui.notify('No scope given.', 'warning');
      continue;
    }
    return parsed;
  }
};

/**
 * For git-unstaged scope, materializes the diff next to the review file so the
 * (bash-less) reviewer agents can read exactly what changed. Best-effort: when
 * the diff is empty or writing fails, the scope still lists the changed files.
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
    const reviewFile = await runFx(resolveReviewFile(ctx.cwd, 'adversarial', true));
    await runFx(ensureStateDirs(reviewFile));
    const diffPath = path.join(stateDirForReviewFile(reviewFile), 'scope.diff');
    fs.writeFileSync(diffPath, `${diff}\n`);
    return { ...scope, diffPath };
  } catch {
    return scope;
  }
};

/**
 * Step 3: build the reviewer roster. Starts with the built-in generic reviewer
 * and lets the user add stored profiles (searchable), change per-reviewer
 * models, and remove reviewers.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionContext} ctx The command context
 * @returns The confirmed roster, or null on cancel
 */
const buildRoster = async (
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<RosterEntry[] | null> => {
  const roster: RosterEntry[] = defaultRoster();

  for (;;) {
    const summary = roster
      .map((entry) => `${entry.reviewer.label} (${entry.reviewer.model})`)
      .join(', ');
    const pick = await ctx.ui.select(
      `Reviewers [${roster.length}]: ${summary}`,
      [
        '+ Add reviewer (profile)',
        '~ Change model of a reviewer',
        '− Remove reviewer',
        '✓ Done — choose settings',
      ],
    );

    if (pick === undefined) {
      const cancel = await ctx.ui.confirm('Cancel setup', 'Cancel the review setup?');
      if (cancel) return null;
      continue;
    }

    if (pick === '+ Add reviewer (profile)') {
      const added = await addProfileReviewer(pi, ctx, roster);
      if (added !== null) {
        ctx.ui.notify(`Added reviewer: ${added.label} (${added.model})`, 'info');
      }
      continue;
    }
    if (pick === '~ Change model of a reviewer') {
      await changeReviewerModel(ctx, roster);
      continue;
    }
    if (pick === '− Remove reviewer') {
      if (roster.length <= 1) {
        ctx.ui.notify('At least one reviewer is required.', 'warning');
        continue;
      }
      const labels = roster.map(
        (entry) => `${entry.reviewer.label} (${entry.reviewer.model})`,
      );
      const target = await ctx.ui.select('Remove which reviewer?', labels);
      const index = target === undefined ? -1 : labels.indexOf(target);
      if (index >= 0) roster.splice(index, 1);
      continue;
    }
    if (pick === '✓ Done — choose settings') {
      return roster;
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
 * Asks for the model of a profile reviewer, prefilled with the profile's
 * preferred model (or the loop default). Returns null on cancel.
 * @param {ExtensionContext} ctx The command context
 * @param {Profile} profile The chosen profile
 * @returns The reviewer profile with the chosen model, or null on cancel
 */
const pickModelForProfile = async (
  ctx: ExtensionContext,
  profile: Profile,
): Promise<ReviewerProfile | null> => {
  const prefill = profile.model || DEFAULT_REVIEWER_MODEL;
  const model = await ctx.ui.input(
    `Model for '${profile.name}' (provider/model-id):`,
    prefill,
  );
  if (model === undefined) return null;
  return profileToReviewerProfile(profile, model.trim() === '' ? undefined : model.trim());
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

  const model = await ctx.ui.input(
    `Model for '${entry.reviewer.label}' (provider/model-id):`,
    entry.reviewer.model,
  );
  if (model === undefined || model.trim() === '') return;

  roster[index] = {
    ...entry,
    reviewer: { ...entry.reviewer, model: model.trim() },
  };
  ctx.ui.notify(`${entry.reviewer.label} → ${model.trim()}`, 'info');
};

/**
 * Step 4: edit the loop settings (max loops, fixer model, supervisor mode /
 * model, reconcile mode, deadlock threshold). Loops until the user finishes.
 * @param {ExtensionContext} ctx The command context
 * @param {ReviewSettings} initial Starting settings
 * @returns The confirmed settings, or null on cancel
 */
const editSettings = async (
  ctx: ExtensionContext,
  initial: ReviewSettings,
): Promise<ReviewSettings | null> => {
  const current: {
    maxLoops: number;
    fixerModel: string;
    supervisorMode: SupervisorMode;
    supervisorModel: string;
    reconcileMode: ReconcileMode;
    deadlockFlipThreshold: number;
  } = { ...initial };

  for (;;) {
    const pick = await ctx.ui.select('Review settings', [...settingsMenuItems(current)]);
    if (pick === undefined) {
      const cancel = await ctx.ui.confirm('Cancel setup', 'Cancel the review setup?');
      if (cancel) return null;
      continue;
    }

    if (pick.startsWith('Max loops')) {
      const value = await ctx.ui.input('Max review cycles:', String(current.maxLoops));
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
    if (pick.startsWith('Fixer model')) {
      const value = await ctx.ui.input('Fixer model (provider/model-id):', current.fixerModel);
      if (value === undefined) continue;
      const model = value.trim();
      if (model === '') {
        ctx.ui.notify('Fixer model must not be empty.', 'warning');
        continue;
      }
      current.fixerModel = model;
      ctx.ui.notify(`Fixer model → ${model}`, 'info');
      continue;
    }
    if (pick.startsWith('Supervisor mode')) {
      const mode = await ctx.ui.select(
        `Supervisor mode (current: ${current.supervisorMode})`,
        [...SUPERVISOR_MODES],
      );
      if (mode === undefined || !SUPERVISOR_MODES.includes(mode as SupervisorMode)) continue;
      current.supervisorMode = mode as SupervisorMode;
      ctx.ui.notify(`Supervisor mode → ${mode}`, 'info');
      continue;
    }
    if (pick.startsWith('Supervisor model')) {
      const value = await ctx.ui.input(
        'Supervisor model (provider/model-id):',
        current.supervisorModel,
      );
      if (value === undefined) continue;
      const model = value.trim();
      if (model === '') {
        ctx.ui.notify('Supervisor model must not be empty.', 'warning');
        continue;
      }
      current.supervisorModel = model;
      ctx.ui.notify(`Supervisor model → ${model}`, 'info');
      continue;
    }
    if (pick.startsWith('Reconcile mode')) {
      const mode = await ctx.ui.select(
        `Reconcile mode (current: ${current.reconcileMode})`,
        [...RECONCILE_MODES],
      );
      if (mode === undefined || !isReconcileMode(mode)) continue;
      current.reconcileMode = mode;
      ctx.ui.notify(`Reconcile mode → ${mode}`, 'info');
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
    if (pick === '✓ Done — start review') {
      return {
        maxLoops: current.maxLoops,
        fixerModel: current.fixerModel,
        supervisorMode: current.supervisorMode,
        supervisorModel: current.supervisorModel,
        reconcileMode: current.reconcileMode,
        deadlockFlipThreshold: current.deadlockFlipThreshold,
      };
    }
  }
};

const RECONCILE_MODES: readonly ReconcileMode[] = ['on-conflict', 'always', 'never'];

/**
 * Narrows a string to a reconcile mode.
 * @param {string} value Candidate mode
 * @returns True when the value is a valid reconcile mode
 */
const isReconcileMode = (value: string): value is ReconcileMode =>
  RECONCILE_MODES.includes(value as ReconcileMode);
/**
 * Searchable select dialog (SelectList with incremental type-to-filter),
 * following the profiles extension's custom-component pattern.
 * @param {ExtensionContext} ctx The command context
 * @param {string} title Dialog title
 * @param {SelectItem[]} items Selectable items (value/label/description)
 * @returns The selected value, or null on cancel
 */
const selectProfileWithSearch = async (
  ctx: ExtensionContext,
  title: string,
  items: SelectItem[],
): Promise<string | null> =>
  ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
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

// ─── Options assembly ────────────────────────────────────────────────

/**
 * Builds the loop options from the confirmed scope + roster + settings.
 * Interactive runs always allocate a fresh review code (`fresh: true`) and
 * target the current directory.
 * @param {ExtensionContext} ctx The command context
 * @param {RosterEntry[]} roster The confirmed roster
 * @param {ReviewScope} scope The confirmed scope
 * @param {ReviewSettings} settings The confirmed settings
 * @returns The loop options
 */
const optsFromSetup = (
  ctx: ExtensionContext,
  roster: RosterEntry[],
  scope: ReviewScope,
  settings: ReviewSettings,
): LoopOptions => {
  const base = defaultLoopConfig();
  const reviewers = roster.map((entry) => entry.reviewer);
  const config: LoopConfig = {
    ...base,
    reviewers,
    fixerModel: settings.fixerModel,
    maxLoops: settings.maxLoops,
    supervisor: {
      ...base.supervisor,
      model: settings.supervisorModel,
      mode: settings.supervisorMode,
    },
    reconciliator: {
      ...base.reconciliator,
      mode: settings.reconcileMode,
    },
    deadlock: {
      ...base.deadlock,
      flipThreshold: settings.deadlockFlipThreshold,
    },
  };
  return {
    reviewerModel: reviewers[0]?.model ?? DEFAULT_REVIEWER_MODEL,
    fixerModel: settings.fixerModel,
    maxLoops: settings.maxLoops,
    targetDir: ctx.cwd,
    reviewName: 'adversarial',
    fresh: true,
    featureSpec: false,
    specName: '',
    config,
    reviewScope: scope.scope,
    scopeFiles: scope.files,
    scopeDiffPath: scope.diffPath,
  };
};
