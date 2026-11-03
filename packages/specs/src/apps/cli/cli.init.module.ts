import { Clock, Console, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';

import {
  INIT_CODES,
  MICRO_WAIVER_REASON,
  type InitPhasePlan,
  type InitPlan,
  type InitTaskPlan,
  defaultReview,
  phaseIdAt,
  renderInitTree,
  validateInitPlan,
} from '../../modules/init/index.js';
import { DEFAULT_SIZE, type Size, SIZES, isSize } from '../../modules/sizing/index.js';
import { isValidName, isValidPhase } from '../../modules/spec/index.js';
import {
  type TaskType,
  SLUG_PATTERN,
  TASK_TYPES,
  isTaskType,
  phaseRank,
} from '../../modules/task/index.js';
import { isScopeList } from '../../modules/scheduler/index.js';
import { type Tier, isTier } from '../../modules/tier/index.js';
import { SpecStore } from '../../services/index.js';

import { authoringFailure } from './cli.authoring.helpers.js';
import {
  SURFACE_CODES,
  SurfaceError,
  diagnostic,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
} from './cli.shared.module.js';

// ─── init ─────────────────────────────────────────────────────────────

/** Raw `--phase` value: one ordered phase objective. */
export interface InitPhaseFlag {
  readonly objective: string;
}

/** Raw `--task` value split into its fields. */
export interface ParsedInitTask {
  readonly phase: string;
  readonly task: InitTaskPlan;
}

/**
 * Parse one `--task <PHASE>:<name>:<type>[:<size>][:after=<a,b>][:scope=<paths>]`
 * value. A `scope=` token is recognized by prefix anywhere after the type; any
 * other trailing token must be a size or an `after=` list.
 * @param raw - one raw value
 * @returns the parsed task, or a diagnostic describing the token error
 */
export const parseInitTaskFlag = (
  raw: string,
):
  | { readonly ok: true; readonly value: ParsedInitTask }
  | { readonly ok: false; readonly error: string } => {
  const tokens = raw.split(':');
  if (tokens.length < 3) {
    return {
      ok: false,
      error: `'${raw}' must be PHASE:name:type[:size][:after=name,name][:scope=path,path]`,
    };
  }
  const [phase = '', name = '', type = '', ...rest] = tokens;
  const scopeTokens = rest.filter((token) => token.startsWith('scope='));
  if (scopeTokens.length > 1) {
    return { ok: false, error: `'${raw}' declares scope= more than once.` };
  }
  const declaredScope = scopeTokens[0]?.slice('scope='.length) ?? '';
  let declaredSize: Size | undefined;
  let afterNames: Array<string> | undefined;
  for (const token of rest.filter((entry) => !entry.startsWith('scope='))) {
    if (token === '') continue;
    if (token.startsWith('after=')) {
      if (afterNames !== undefined) {
        return { ok: false, error: `'${raw}' declares after= more than once.` };
      }
      afterNames = token
        .slice('after='.length)
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');
      continue;
    }
    if (!isSize(token)) {
      return {
        ok: false,
        error: `'${token}' is not a known task token — use a size (${SIZES.join(', ')}), after=<name,name>, or scope=<path[,path]>.`,
      };
    }
    if (declaredSize !== undefined) {
      return { ok: false, error: `'${raw}' declares a size more than once.` };
    }
    declaredSize = token;
  }
  if (!isValidPhase(phase)) return { ok: false, error: `'${phase}' is not a phase id.` };
  if (!isValidName(name)) return { ok: false, error: `'${name}' is not a kebab-case task name.` };
  if (!isTaskType(type)) {
    return { ok: false, error: `'${type}' is not one of: ${TASK_TYPES.join(', ')}.` };
  }
  const size = declaredSize === undefined ? DEFAULT_SIZE : declaredSize;
  if (declaredScope !== '' && !isScopeList(declaredScope) && declaredScope !== 'none') {
    return {
      ok: false,
      error: `'${declaredScope}' must be comma-separated repo-root-relative paths or 'none'.`,
    };
  }
  const base = { name, type, size, after: afterNames ?? [] };
  return {
    ok: true,
    value: {
      phase,
      task: declaredScope === '' ? base : { ...base, writeScope: declaredScope },
    },
  };
};

/** Options for {@link init}. */
export interface InitOptions {
  readonly root: string;
  readonly name: string;
  readonly tier?: string | undefined;
  readonly author?: string | undefined;
  readonly description?: string | undefined;
  readonly workspaceType?: string | undefined;
  readonly phaseObjectives?: ReadonlyArray<string> | undefined;
  readonly taskFlags?: ReadonlyArray<string> | undefined;
  readonly reviewFlags?: ReadonlyArray<string> | undefined;
  readonly reasonFlags?: ReadonlyArray<string> | undefined;
  readonly reviewerProfiles?: ReadonlyArray<string> | undefined;
}

/** What {@link init} wrote. */
export interface InitReport {
  readonly name: string;
  readonly tier: Tier;
  readonly phases: ReadonlyArray<string>;
  readonly tasks: number;
  readonly files: ReadonlyArray<string>;
}

/** Parse repeated `PHASE:value` flags into a map, refusing a malformed token. */
const phaseValueMap = (
  flags: ReadonlyArray<string> | undefined,
  field: string,
):
  | { readonly ok: true; readonly values: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly error: string } => {
  const values = new Map<string, string>();
  for (const raw of flags ?? []) {
    const separator = raw.indexOf(':');
    if (separator === -1) {
      return { ok: false, error: `'${raw}' must read ${field} <PHASE>:<value>.` };
    }
    const phase = raw.slice(0, separator);
    const value = raw.slice(separator + 1);
    if (!isValidPhase(phase)) return { ok: false, error: `'${phase}' is not a phase id.` };
    values.set(phase, value);
  }
  return { ok: true, values };
};

/** Build the plan from CLI flags, applying tier defaults before validation. */
const buildPlan = (
  options: InitOptions,
  tier: Tier,
  created: string,
):
  | { readonly ok: true; readonly plan: InitPlan }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> } => {
  const errors: Array<string> = [];
  const objectives = options.phaseObjectives ?? [];
  const declaredPhases =
    objectives.length > 0 ? objectives.map((objective, index) => phaseIdAt(index + 1)) : [];
  const parsedTasks: Array<ParsedInitTask> = [];
  for (const raw of options.taskFlags ?? []) {
    const parsed = parseInitTaskFlag(raw);
    if (!parsed.ok) errors.push(parsed.error);
    else parsedTasks.push(parsed.value);
  }
  const reviewOverrides = phaseValueMap(options.reviewFlags, '--review');
  if (!reviewOverrides.ok) errors.push(reviewOverrides.error);
  const reasons = phaseValueMap(options.reasonFlags, '--review-reason');
  if (!reasons.ok) errors.push(reasons.error);
  if (errors.length > 0) return { ok: false, errors };

  const reviewFor = (phase: string): 'required' | 'waived' => {
    const raw = reviewOverrides.ok ? reviewOverrides.values.get(phase) : undefined;
    if (raw === undefined) return defaultReview(tier);
    if (raw === 'required' || raw === 'waived') return raw;
    errors.push(`--review ${phase} must be 'required' or 'waived'.`);
    return defaultReview(tier);
  };
  const reasonFor = (review: 'required' | 'waived', phase: string): string | undefined => {
    const reason = reasons.ok ? reasons.values.get(phase) : undefined;
    if (reason !== undefined) return reason;
    return review === 'waived' && tier === 'micro' ? MICRO_WAIVER_REASON : undefined;
  };

  let phases: Array<InitPhasePlan>;
  if (declaredPhases.length > 0) {
    phases = declaredPhases.map((phase, index) => {
      const objective = objectives[index] ?? '';
      const review = reviewFor(phase);
      const reason = reasonFor(review, phase);
      const tasks = parsedTasks
        .filter((parsed) => parsed.phase === phase)
        .map((parsed) => parsed.task);
      const phasePlan: InitPhasePlan = {
        objective,
        review,
        tasks:
          tasks.length > 0
            ? tasks
            : [
                {
                  name: index === 0 && tier === 'full' ? 'explore' : 'implement',
                  type: index === 0 && tier === 'full' ? 'exploratory' : 'execution',
                  size: 'medium',
                  after: [],
                },
              ],
      };
      return reason === undefined ? phasePlan : { ...phasePlan, reviewReason: reason };
    });
    for (const parsed of parsedTasks) {
      if (!declaredPhases.includes(parsed.phase)) {
        errors.push(`--task names undeclared phase '${parsed.phase}'.`);
      }
    }
  } else {
    const defaults: ReadonlyArray<{
      objective: string;
      type: TaskType;
      name: string;
      after: string[];
    }> =
      tier === 'full'
        ? [
            {
              objective: 'Explore the problem and record what the implementation must satisfy.',
              type: 'exploratory',
              name: 'explore',
              after: [],
            },
            {
              objective: 'Implement the spec to the explored contract.',
              type: 'execution',
              name: 'implement',
              after: ['explore'],
            },
          ]
        : [{ objective: 'Implement the spec.', type: 'execution', name: 'implement', after: [] }];
    phases = defaults.map((entry, index) => {
      const phase = phaseIdAt(index + 1);
      const declared = parsedTasks.filter((parsed) => parsed.phase === phase);
      const review = reviewFor(phase);
      const reason = reasonFor(review, phase);
      const phasePlan: InitPhasePlan = {
        objective: entry.objective,
        review,
        tasks:
          declared.length > 0
            ? declared.map((parsed) => parsed.task)
            : [{ name: entry.name, type: entry.type, size: 'medium', after: entry.after }],
      };
      return reason === undefined ? phasePlan : { ...phasePlan, reviewReason: reason };
    });
    for (const parsed of parsedTasks) {
      if (!phases[phaseRank(parsed.phase) - 1]) {
        errors.push(`--task names undeclared phase '${parsed.phase}'.`);
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  for (const phase of reviewOverrides.ok ? reviewOverrides.values.keys() : []) {
    if (!phases[phaseRank(phase) - 1]) errors.push(`--review names undeclared phase '${phase}'.`);
  }
  for (const phase of reasons.ok ? reasons.values.keys() : []) {
    if (!phases[phaseRank(phase) - 1]) {
      errors.push(`--review-reason names undeclared phase '${phase}'.`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const author = options.author?.trim() || 'spec-init';
  const workspaceType = options.workspaceType ?? 'in-place';
  if (workspaceType !== 'in-place' && workspaceType !== 'worktree') {
    errors.push(`Unknown workspace type '${workspaceType}' — use 'in-place' or 'worktree'.`);
  }
  for (const profile of options.reviewerProfiles ?? []) {
    if (!SLUG_PATTERN.test(profile)) errors.push(`'${profile}' is not a reviewer profile slug.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const resolvedWorkspaceType: 'in-place' | 'worktree' =
    workspaceType === 'worktree' ? 'worktree' : 'in-place';
  return {
    ok: true,
    plan: {
      name: options.name,
      tier,
      author,
      created,
      workspaceType: resolvedWorkspaceType,
      description: options.description,
      reviewerProfiles: options.reviewerProfiles ?? [],
      phases,
    },
  };
};

/**
 * Create a whole v2 tree from a tier plan. Every tier-contract violation is
 * rejected before a single file is written; ids are allocated from the plan
 * order, never caller arithmetic.
 * @param options - spec metadata and the ordered phase/task plan
 * @returns what was written
 */
export const init = (
  options: InitOptions,
): Effect.Effect<InitReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecInit';
    if (!isValidName(options.name)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: SURFACE_CODES.invalidArgument,
          path: '--name',
          field: '--name',
          problem: `Spec name '${options.name}' is not a slug.`,
          rerun: 'mf-specs init --name <slug> --tier <tier>',
        }),
      );
    }
    if (options.tier === undefined || !isTier(options.tier)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'tier.unknown',
          path: options.tier ?? '--tier',
          field: '--tier',
          problem: `Tier '${options.tier ?? ''}' is not a tier.`,
          rerun: 'mf-specs init --name <slug> --tier <tier>',
          expected: 'micro, standard, full',
          actual: options.tier ?? 'missing',
          fix: 'Pass one of micro, standard, full.',
        }),
      );
    }
    const tier = options.tier;
    const store = yield* SpecStore.SpecStore;
    if (yield* store.exists(options.root, options.name)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: INIT_CODES.exists,
          path: options.name,
          field: '--name',
          problem: `Spec '${options.name}' already exists under ${options.root}.`,
          rerun: 'mf-specs list',
          fix: 'Choose a new spec name.',
        }),
      );
    }
    const now = yield* Clock.currentTimeMillis;
    const created = new Date(now).toISOString().slice(0, 10);
    const built = buildPlan(options, tier, created);
    if (!built.ok) {
      return yield* Effect.fail(
        new SurfaceError({
          operation,
          diagnostics: built.errors.map((problem) =>
            diagnostic({
              code: SURFACE_CODES.invalidArgument,
              path: '--task/--phase',
              field: 'plan',
              problem,
              rerun: 'mf-specs init --name <slug> --tier <tier>',
              fix: 'Correct the plan tokens.',
            }),
          ),
        }),
      );
    }
    const issues = validateInitPlan(built.plan);
    if (issues.length > 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation,
          diagnostics: issues.map((found) =>
            diagnostic({
              code: found.code ?? SURFACE_CODES.invalidArgument,
              path: options.name,
              field: found.field,
              problem: found.message,
              rerun: 'mf-specs init --name <slug> --tier <tier>',
              expected: found.expected,
              actual: found.actual,
              fix: found.fix,
            }),
          ),
        }),
      );
    }
    const files = renderInitTree(built.plan);
    yield* store.write(options.root, options.name, files);
    return {
      name: options.name,
      tier,
      phases: built.plan.phases.map((_, index) => phaseIdAt(index + 1)),
      tasks: files.filter((file) => file.path.endsWith('/TASK.md')).length,
      files: files.map((file) => file.path),
    };
  });

/** Render an init report. */
export const renderInit = (report: InitReport): string =>
  [
    `✓ created '${report.name}' · tier ${report.tier} · phases ${report.phases.join(',')} · ${report.tasks} task${report.tasks === 1 ? '' : 's'}`,
    ...report.files.map((file) => `  ${file}`),
  ].join('\n');

// ─── Commands ─────────────────────────────────────────────────────────

/** One repeated string flag. */
const repeated = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.atLeast(0));

/** `init`: tier -> a whole valid v2 tree. */
export const initCommand = Command.make(
  'init',
  {
    dir: dirFlag,
    name: nameFlag,
    tier: Flag.String('tier'),
    author: Flag.optional(Flag.String('author')),
    description: Flag.optional(Flag.String('description')),
    workspaceType: Flag.optional(Flag.String('workspace-type')),
    phase: repeated('phase', 'One ordered phase objective. Repeat for A, B, C.'),
    task: repeated(
      'task',
      'One task as PHASE:name:type[:size][:after=name,name][:scope=path,path].',
    ),
    review: repeated('review', 'One phase decision as PHASE:required|waived.'),
    reviewReason: repeated('review-reason', 'One phase reason as PHASE:<one line>.'),
    reviewerProfiles: Flag.optional(Flag.String('reviewer-profiles')),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* init({
          root: storeDirOf(config.dir),
          name: config.name,
          tier: config.tier,
          author: opt(config.author),
          description: opt(config.description),
          workspaceType: opt(config.workspaceType),
          phaseObjectives: config.phase,
          taskFlags: config.task,
          reviewFlags: config.review,
          reasonFlags: config.reviewReason,
          reviewerProfiles: (opt(config.reviewerProfiles) ?? '')
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part !== ''),
        });
        yield* Console.log(renderInit(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs init --name ${config.name} --tier ${config.tier}`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Create a whole v2 spec tree from a validated tier plan.'),
  Command.provide(SpecStore.Default),
);
