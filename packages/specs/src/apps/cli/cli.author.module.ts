import { Console, Effect, FileSystem } from 'effect';
import { Command, Flag } from 'effect/cli';
import { PromptStore } from '@montflow/prompts';
import {
  type LoadedPrompt,
  MODE_FLAG,
  MODE_HINT,
  PromptError,
  parseMode,
  load as loadPrompt,
} from '../../modules/prompt/index.js';

import { type State } from '../../modules/lifecycle/index.js';

import { phaseOf } from '../../modules/task/index.js';

import { SpecStore } from '../../services/index.js';

import {
  storeDirOf,
  SURFACE_CODES,
  type SizingDiagnostic,
  diagnostic,
  SurfaceError,
  diagnosticOfStoreError,
  modeRefusalDiagnostic,
  GUARD_RERUN,
  guardSpecName,
  guardPhase,
  phaseRequestOf,
  guardFailure,
  runDiagnosed,
  verboseFlag,
  nameFlag,
  opt,
  workspaceRoot,
  workspaceDirFlag,
} from './cli.shared.module.js';
import {
  which,
  type StatusReport,
  dispatchDiagnostics,
  stateOf,
  nextOf,
  renderState,
  renderNext,
  renderWhich,
  status,
} from './cli.apps.module.js';
/** Spec store directory, relative to the workspace root. */

export interface AuthorOptions {
  /** The user's request, as typed; required by the prompt. */
  readonly request: string;
  /** Extra constraints to carry into the authoring session. */
  readonly notes?: string | undefined;
}

/**
 * Load and render the shipped authoring prompt. The binary stays model-free:
 * this returns text to print, and the host tool is what dispatches it.
 * @param workspace - workspace root that owns `.agents/@montflow/prompts/`
 * @param options - the request and optional notes
 * @returns the rendered prompt and the skills it declares
 */
export const author = (
  workspace: string,
  options: AuthorOptions,
): Effect.Effect<LoadedPrompt, PromptError, PromptStore.PromptStore> => {
  const values =
    options.notes === undefined || options.notes === ''
      ? { request: options.request }
      : { request: options.request, notes: options.notes };
  return loadPrompt(workspace, 'spec-create', values);
};

/** What `execute` renders from. */
export interface ExecuteOptions {
  /** Explicit spec name; wins over branch detection. */
  readonly name?: string | undefined;
  /** Restrict the session to one phase id. */
  readonly phase?: string | undefined;
  /** Extra direction to steer into every worker. */
  readonly focus?: string | undefined;
  /** Public interaction mode; the loader rejects anything but guided/autonomous. */
  readonly mode?: string | undefined;
  /** Branch to resolve when `name` is absent (tests and CI). */
  readonly branch?: string | undefined;
  /** Workspace root that holds `.git`; defaults to the working directory. */
  readonly workspace?: string | undefined;
}

/** Everything the execute surface derived before rendering. */
export interface ExecuteReport {
  /** The spec that will be driven. */
  readonly name: string;
  /** Phase the session is restricted to, when one was requested. */
  readonly phase: string | undefined;
  /**
   * Review-cycle budget of the active phase, which is the only phase this
   * session may start. Later phases carry their own budget in `next`.
   */
  readonly budget: number;
  /** Rendered `mf-specs state` line fed to the template. */
  readonly state: string;
  /** Rendered `mf-specs next` ready set fed to the template. */
  readonly next: string;
  /** The rendered execution prompt and its declared skills. */
  readonly prompt: LoadedPrompt;
}

/** Diagnostic for a phase id no task in the spec belongs to. */
export const unknownPhaseDiagnostic = (
  name: string,
  phase: string,
  known: ReadonlyArray<string>,
  rerun: string,
): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.unknownPhase,
    path: name,
    field: 'phase',
    problem: `Phase '${phase}' not found in spec '${name}'.`,
    rerun,
    expected:
      known.length === 0 ? 'a phase id present in the task table' : `one of ${known.join(', ')}`,
    actual: phase,
    fix:
      known.length === 0
        ? `Add a task to '${name}' or omit --phase.`
        : `Pass --phase ${known.join(' or --phase ')}.`,
  });

/**
 * Diagnostic for a spec with no phase a session may start. A complete spec has
 * nothing left to dispatch, and an inconsistent one must be repaired first, so
 * neither names `--phase` as a way out: every existing phase is either locked
 * or unreachable.
 */
export const noActivePhaseDiagnostic = (name: string, derived: State): SizingDiagnostic => {
  const complete = derived === 'complete';
  const inconsistent = derived === 'inconsistent';
  return diagnostic({
    code: SURFACE_CODES.noActivePhase,
    path: name,
    field: 'phase',
    problem: complete
      ? `Spec '${name}' has no active phase: every phase is locked and complete.`
      : `Spec '${name}' has no active phase to execute (state ${derived}).`,
    rerun: `mf-specs status --name ${name}`,
    expected: 'a spec with an unlocked phase that still has unfinished work',
    actual: derived,
    fix: complete
      ? `Nothing to dispatch. Report '${name}' complete.`
      : inconsistent
        ? `Repair the bookkeeping with 'mf-specs status --name ${name}', then re-run mf-specs execute.`
        : `Repair or resume '${name}' until a phase is active, then re-run mf-specs execute.`,
  });
};

/**
 * Diagnostic for a `--phase` that exists but cannot be driven: a locked phase,
 * a phase after the active one, or any phase while another is active. The
 * session always renders the active phase's state and ready set, so accepting
 * another id would hand the orchestrator two contradicting truths.
 */
export const phaseNotActiveDiagnostic = (
  name: string,
  phase: string,
  active: string,
  locked: boolean,
  rerun: string,
): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.phaseNotActive,
    path: name,
    field: 'phase',
    problem: `Phase '${phase}' is not the active phase of spec '${name}'${locked ? ' (it is locked)' : ''}.`,
    rerun,
    expected: `phase ${active}`,
    actual: phase,
    fix: `Omit --phase to drive active phase ${active}, or pass --phase ${active}.`,
  });

/**
 * Load a spec, derive its state and ready set, and render the shipped
 * execution prompt. The spec is resolved mechanically: an explicit `name`
 * always wins, otherwise `which` reads the branch. A failed resolution is
 * returned as a coded diagnostic with `next ask the user`, so the caller must
 * ask instead of picking a spec. The mode is parsed before any spec read, so a
 * typo never hides behind unrelated spec state. The review budget comes from
 * the sizing module, never from the caller or the model.
 *
 * `--phase` is a restriction, not a selector: the state and ready set the
 * session must treat as truth are always the active phase's, so any other id —
 * a locked phase, a later phase, or every phase of a complete spec — is
 * refused with `spec.phase-not-active` or `spec.no-active-phase` instead of a
 * contradictory session.
 * @param root - spec root directory
 * @param options - name/phase/focus/mode plus the workspace and branch override
 * @returns the derived context plus the rendered prompt
 */
export const execute = (
  root: string,
  options: ExecuteOptions = {},
): Effect.Effect<
  ExecuteReport,
  SurfaceError | SpecStore.StoreError | PromptError,
  SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore
> =>
  Effect.gen(function* () {
    // Validate the flag at the boundary: a bad mode is an input error, not a
    // property of the spec tree or the prompt file, and it must not cost a
    // spec read or mask an unrelated failure.
    const parsedMode = parseMode(options.mode);
    if (!parsedMode.ok) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecExecute',
          diagnostics: [modeRefusalDiagnostic(parsedMode, `mf-specs execute ${MODE_FLAG} guided`)],
        }),
      );
    }

    // Validate the identifiers at the boundary: a malformed name or phase is
    // a usage error, never a path, and it must not cost a spec read or a
    // prompt render. A blank or whitespace-only phase is normalised to absent
    // once; a padded phase is refused as supplied, never trimmed into `A`.
    const requested = phaseRequestOf(options.phase);
    yield* guardFailure(
      'SpecExecute',
      options.name === undefined ? undefined : guardSpecName(options.name, GUARD_RERUN.execute),
    );
    yield* guardFailure(
      'SpecExecute',
      requested === undefined ? undefined : guardPhase(requested, GUARD_RERUN.executePhase),
    );

    const workspace = options.workspace ?? '.';
    const name =
      options.name === undefined
        ? (yield* which(root, { branch: options.branch, workspace })).name
        : options.name;

    const rerun = `mf-specs check --name ${name}`;

    const report = yield* status(root, name).pipe(
      // The review-store finding names the spec the failed read belongs to, not
      // the `--dir` the command was given: `execute` knows the name, so it
      // renders the same `path <spec>/review-series` every other surface does.
      Effect.catchTag(
        '@montflow/SpecStoreError',
        (
          error,
        ): Effect.Effect<StatusReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
          error.origin === 'reviews'
            ? Effect.fail(
                new SurfaceError({
                  operation: 'SpecExecute',
                  diagnostics: [diagnosticOfStoreError(error, name, rerun)],
                }),
              )
            : Effect.fail(error),
      ),
    );

    // An undispatchable tree is refused before a prompt is rendered: the worker
    // would otherwise act on a spec the verifier already rejects. The list is
    // `dispatchDiagnostics`, the same one `status` / `next` print, so a spec
    // config error is de-duped and keeps its `<name>/sizing.json` path.
    const errors = dispatchDiagnostics(report.sizing, report.verify, name);
    if (errors.length > 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecExecute',
          diagnostics: errors,
        }),
      );
    }

    const stateReport = stateOf(report);
    const nextReport = nextOf(report);
    const active = nextReport.phase;
    const budget = nextReport.budget;

    // No active phase means nothing is dispatchable. This covers a complete
    // spec, an inconsistent one, and any state whose phases are all locked;
    // `--phase` cannot manufacture work, so the diagnostic never recommends it.
    if (budget === undefined || active === undefined) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecExecute',
          diagnostics: [noActivePhaseDiagnostic(name, stateReport.state)],
        }),
      );
    }

    let phase: string | undefined;
    if (requested !== undefined) {
      const inPhase = report.tasks.filter((task) => phaseOf(task.id) === requested);
      if (inPhase.length === 0) {
        const known = [...new Set(report.tasks.map((task) => phaseOf(task.id)))].toSorted();
        return yield* Effect.fail(
          new SurfaceError({
            operation: 'SpecExecute',
            diagnostics: [unknownPhaseDiagnostic(name, requested, known, rerun)],
          }),
        );
      }
      // The rendered state and ready set belong to the active phase, so any
      // other id — locked or merely later — would contradict them.
      if (requested !== active) {
        const locked =
          report.state?.phases.find((summary) => summary.phase === requested)?.locked === true;
        return yield* Effect.fail(
          new SurfaceError({
            operation: 'SpecExecute',
            diagnostics: [phaseNotActiveDiagnostic(name, requested, active, locked, rerun)],
          }),
        );
      }
      phase = requested;
    }

    const stateLine = renderState(stateReport);
    const ready = renderNext(nextReport);
    const base = {
      name,
      state: stateLine,
      next: ready,
      reviewBudget: String(budget),
    };
    const withPhase = phase === undefined ? base : { ...base, phase };
    const withFocus =
      options.focus === undefined || options.focus === ''
        ? withPhase
        : { ...withPhase, focus: options.focus };
    const values = options.mode === undefined ? withFocus : { ...withFocus, mode: options.mode };

    const prompt = yield* loadPrompt(workspace, 'spec-execute', values);
    return { name, phase, budget, state: stateLine, next: ready, prompt };
  });

// ─── Sizing config ────────────────────────────────────────────────────

/** Config layers `sizing-config` can size, least to most specific. */
export const SIZING_SCOPES = ['repo', 'spec', 'phase'] as const;

/** One dispatch-config layer the sizing wizard can generate. */
export type SizingScope = (typeof SIZING_SCOPES)[number];

/** The layer a run will size; `scope` is absent when the caller left it open. */
export interface SizingScopeRequest {
  /** Fixed layer; absent means the prompt must ask. */
  readonly scope?: SizingScope | undefined;
  /** Spec the layer belongs to; absent for repo and open scope. */
  readonly name?: string | undefined;
  /** Phase whose sizes are overridden; present only for phase scope. */
  readonly phase?: string | undefined;
}

/** What `sizing-config` renders from. */
export interface SizingConfigOptions {
  /** Explicit layer; wins over the `--name` / `--phase` implication. */
  readonly scope?: string | undefined;
  /** Spec slug; alone it implies spec scope. */
  readonly name?: string | undefined;
  /** Phase id; with a spec it implies phase scope. */
  readonly phase?: string | undefined;
  /** Extra direction to steer the sizing run. */
  readonly focus?: string | undefined;
  /** Public interaction mode; the loader rejects anything but guided/autonomous. */
  readonly mode?: string | undefined;
}

/** A derived scope, or the usage diagnostic the caller must report. */
export type SizingScopeResolution =
  | { readonly ok: true; readonly request: SizingScopeRequest }
  | { readonly ok: false; readonly diagnostic: SizingDiagnostic };

/** True when a flag value is absent or blank, so it carries no instruction. */
export const blankValue = (value: string | undefined): boolean =>
  value === undefined || value.trim() === '';

/** The corrected command for a supplied but blank `--name`, per the chosen scope. */
export const blankNameRepair = (scope: SizingScope | undefined): string => {
  if (scope === 'repo') return 'mf-specs sizing-config --scope repo';
  if (scope === 'phase') {
    return 'mf-specs sizing-config --scope phase --name <spec> --phase <id>';
  }
  if (scope === 'spec') return 'mf-specs sizing-config --scope spec --name <spec>';
  return 'mf-specs sizing-config --name <spec>';
};

/** A {@link SizingScopeRequest} being filled in, so absent keys stay absent. */
export interface MutableSizingScopeRequest {
  scope?: SizingScope;
  name?: string;
  phase?: string;
}

/** The mistake, the corrected command, and the flags that produced it. */
export interface ScopeRefusalInput {
  /** Flag the refusal is reported against. */
  readonly field: string;
  readonly problem: string;
  readonly expected: string;
  readonly actual: string;
  readonly fix: string;
  /** Corrected command the caller re-runs. */
  readonly next: string;
}

/** Build one scope usage refusal as a coded agent-first diagnostic. */
export const scopeRefusal = (input: ScopeRefusalInput): SizingScopeResolution => ({
  ok: false,
  diagnostic: diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: input.field,
    field: input.field,
    problem: input.problem,
    rerun: input.next,
    expected: input.expected,
    actual: input.actual,
    fix: input.fix,
  }),
});

/** True when `value` names a config layer. */
export const isSizingScope = (value: string): value is SizingScope =>
  SIZING_SCOPES.some((scope) => scope === value);

/** The flags supplied alongside one scope, for a refusal's `actual` row. */
export const suppliedFlags = (name: string | undefined, phase: string | undefined): string =>
  [
    name === undefined ? undefined : `--name ${name}`,
    phase === undefined ? undefined : `--phase ${phase}`,
  ]
    .filter((flag): flag is string => flag !== undefined)
    .join(' ');

/**
 * Derive the layer a sizing run targets. No flags leave the scope open, so the
 * prompt asks. `--name` alone implies spec, `--name` with `--phase` implies
 * phase, and an explicit `--scope` wins over that implication. Every
 * inconsistent combination is refused with the corrected command instead of
 * rendering a prompt that would size the wrong layer; a supplied but blank
 * `--name` is a usage error, while an omitted one leaves the scope open. A
 * blank `--phase` is treated as absent, never as an empty identifier.
 *
 * The identifier grammar is checked here, on the same values the request
 * carries, so a padded name or phase is refused as supplied — the rule
 * `execute` applies — instead of being trimmed into a valid identifier.
 * @param options - raw scope, name, and phase flags
 * @returns the derived scope, or the usage diagnostic naming the fix
 */
export const resolveSizingScope = (options: SizingConfigOptions): SizingScopeResolution => {
  const name = blankValue(options.name) ? undefined : options.name;
  const phase = phaseRequestOf(options.phase);
  // `--scope` is a word from a closed set, not an identifier that addresses a
  // path, so it is trimmed before the set is checked. The identifier flags keep
  // padding visible and are refused with it.
  const supplied = blankValue(options.scope) ? undefined : options.scope?.trim();

  // Grammar first, so a malformed identifier is reported as the usage error it
  // is even when another flag is also wrong.
  const refused =
    (name === undefined ? undefined : guardSpecName(name, GUARD_RERUN.sizingConfig)) ??
    (phase === undefined ? undefined : guardPhase(phase, GUARD_RERUN.sizingConfigPhase));
  if (refused !== undefined) return { ok: false, diagnostic: refused };

  if (supplied !== undefined && !isSizingScope(supplied)) {
    return scopeRefusal({
      field: '--scope',
      problem: `Unknown sizing scope '${supplied}'.`,
      expected: `one of ${SIZING_SCOPES.join(', ')}`,
      actual: supplied,
      fix: 'Pass --scope repo, --scope spec --name <spec>, --scope phase --name <spec> --phase <id>, or omit --scope for the open scope.',
      next: 'mf-specs sizing-config --scope repo',
    });
  }

  if (options.name !== undefined && name === undefined) {
    return scopeRefusal({
      field: '--name',
      problem: '--name requires a spec name: a blank value selects no spec.',
      expected: 'a non-empty --name <spec>',
      actual: options.name === '' ? 'empty string' : `'${options.name}'`,
      fix: 'Pass --name with a spec directory slug, or omit --name for the open scope.',
      next: blankNameRepair(supplied),
    });
  }

  if (supplied === 'repo' && (name !== undefined || phase !== undefined)) {
    return scopeRefusal({
      field: '--scope',
      problem: `--scope repo sizes the repo config, but ${suppliedFlags(name, phase)} was supplied.`,
      expected: 'no --name or --phase with --scope repo',
      actual: `--scope repo ${suppliedFlags(name, phase)}`,
      fix: 'Drop the spec and phase flags to size the repo config: mf-specs sizing-config --scope repo.',
      next: 'mf-specs sizing-config --scope repo',
    });
  }

  if (supplied === 'spec' && phase !== undefined) {
    return scopeRefusal({
      field: '--scope',
      problem: `--scope spec sizes one spec config, but --phase ${phase} was supplied.`,
      expected: 'no --phase with --scope spec',
      actual: `--scope spec ${suppliedFlags(name, phase)}`,
      fix:
        name === undefined
          ? `Drop --phase and pass the spec to size: mf-specs sizing-config --scope spec --name <spec>, or pass --scope phase to size one phase.`
          : `Drop --phase to size the spec config, or pass --scope phase to size one phase: mf-specs sizing-config --scope spec --name ${name}.`,
      next:
        name === undefined
          ? 'mf-specs sizing-config --scope spec --name <spec>'
          : `mf-specs sizing-config --scope spec --name ${name}`,
    });
  }

  if (supplied === 'spec' && name === undefined) {
    return scopeRefusal({
      field: '--scope',
      problem: '--scope spec requires --name <spec>.',
      expected: '--name <spec>',
      actual: '--scope spec',
      fix: 'Pass --name with the spec config to size: mf-specs sizing-config --scope spec --name <spec>.',
      next: 'mf-specs sizing-config --scope spec --name <spec>',
    });
  }

  if (supplied === 'phase' && name === undefined) {
    return scopeRefusal({
      field: '--scope',
      problem: '--scope phase requires --name <spec> and --phase <id>.',
      expected: '--name <spec> and --phase <id>',
      actual: '--scope phase',
      fix: 'Pass the spec and phase to size: mf-specs sizing-config --scope phase --name <spec> --phase <id>.',
      next: 'mf-specs sizing-config --scope phase --name <spec> --phase <id>',
    });
  }

  if (supplied === 'phase' && phase === undefined && name !== undefined) {
    return scopeRefusal({
      field: '--scope',
      problem: '--scope phase requires --phase <id>.',
      expected: '--phase <id>',
      actual: `--scope phase --name ${name}`,
      fix: `Pass the phase to size: mf-specs sizing-config --scope phase --name ${name} --phase <id>.`,
      next: `mf-specs sizing-config --scope phase --name ${name} --phase <id>`,
    });
  }

  if (supplied === undefined && phase !== undefined && name === undefined) {
    return scopeRefusal({
      field: '--phase',
      problem: `--phase requires --name <spec>: '${phase}' belongs to no spec in this command.`,
      expected: '--name <spec> alongside --phase',
      actual: `--phase ${phase}`,
      fix: `Pass --name with the spec holding phase '${phase}': mf-specs sizing-config --name <spec> --phase ${phase}.`,
      next: `mf-specs sizing-config --name <spec> --phase ${phase}`,
    });
  }

  const implied: SizingScope | undefined =
    name === undefined ? undefined : phase === undefined ? 'spec' : 'phase';
  const scope = supplied ?? implied;
  const request: MutableSizingScopeRequest = {};
  if (scope !== undefined) request.scope = scope;
  if (name !== undefined) request.name = name;
  if (phase !== undefined) request.phase = phase;
  return { ok: true, request };
};

/** The shipped prompt every sizing run renders. */
export const SIZING_CONFIG_PROMPT = 'spec-sizing';

/** Everything a sizing-config run derived before rendering. */
export interface SizingConfigReport {
  /** Layer this run sizes; absent means the prompt asks. */
  readonly scope: SizingScope | undefined;
  /** Spec the layer belongs to, when one was named. */
  readonly name: string | undefined;
  /** Phase being overridden, when the scope is phase. */
  readonly phase: string | undefined;
  /** The rendered sizing prompt and its declared skills. */
  readonly prompt: LoadedPrompt;
}

/** Values handed to the sizing template; absent keys stay absent. */
export interface SizingConfigValues {
  /** Public mode the loader folds into `unsupervised`. */
  mode: string;
  scope?: string;
  name?: string;
  phase?: string;
  focus?: string;
}

/**
 * Load and render the shipped sizing prompt for one config layer. The command
 * writes no file and dispatches no session: the printed wizard asks, proposes,
 * confirms, and only then writes through the agent that runs it. Input is
 * validated before the prompt gate, so a usage mistake never hides behind a
 * missing template, and `--scope` wins over the `--name` / `--phase`
 * implication.
 * @param workspace - workspace root that owns `.agents/@montflow/prompts/`
 * @param options - scope/name/phase/focus/mode flags
 * @returns the derived layer plus the rendered prompt
 */
export const sizingConfig = (
  workspace: string,
  options: SizingConfigOptions = {},
): Effect.Effect<SizingConfigReport, SurfaceError | PromptError, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const parsedMode = parseMode(options.mode);
    if (!parsedMode.ok) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecSizingConfig',
          diagnostics: [
            modeRefusalDiagnostic(parsedMode, `mf-specs sizing-config ${MODE_FLAG} guided`),
          ],
        }),
      );
    }

    // Both identifiers are validated inside `resolveSizingScope`, on the exact
    // values the request will carry, before any prompt is loaded. A malformed
    // value can therefore never reach a write target, a blank `--name` keeps
    // its scope-aware usage error, and a blank `--phase` stays absent.
    const resolved = resolveSizingScope(options);
    if (!resolved.ok) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecSizingConfig',
          diagnostics: [resolved.diagnostic],
        }),
      );
    }

    const { request } = resolved;
    const values: SizingConfigValues = { mode: parsedMode.mode };
    if (request.scope !== undefined) values.scope = request.scope;
    if (request.name !== undefined) values.name = request.name;
    if (request.phase !== undefined) values.phase = request.phase;
    if (!blankValue(options.focus)) values.focus = options.focus ?? '';
    const prompt = yield* loadPrompt(workspace, SIZING_CONFIG_PROMPT, { ...values });
    return { scope: request.scope, name: request.name, phase: request.phase, prompt };
  });

// ─── List ─────────────────────────────────────────────────────────────

/** Derived spec states accepted by `--status`, with `completed` as an alias. */
export const whichCommand = Command.make(
  'which',
  {
    dir: workspaceDirFlag,
    branch: Flag.optional(
      Flag.String('branch').pipe(
        Flag.withDescription('Branch to resolve instead of reading .git/HEAD (tests and CI).'),
      ),
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = yield* workspaceRoot(opt(config.dir));
        const report = yield* which(storeDirOf(workspace), {
          branch: opt(config.branch),
          workspace,
        });
        yield* Console.log(renderWhich(report));
      }),
      () => ({
        path: opt(config.dir) ?? '.',
        rerun: 'mf-specs which',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Print the one spec the current branch names. Nothing else.'),
  Command.provide(SpecStore.Default),
);

export const authorCommand = Command.make(
  'author',
  {
    dir: workspaceDirFlag,
    request: Flag.String('request').pipe(
      Flag.withDescription('What the spec should accomplish, as the user asked it.'),
    ),
    notes: Flag.optional(
      Flag.String('notes').pipe(Flag.withDescription('Extra constraints for the authoring run.')),
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = yield* workspaceRoot(opt(config.dir));
        const loaded = yield* author(workspace, {
          request: config.request,
          notes: opt(config.notes),
        });
        yield* Console.log(loaded.text);
      }),
      () => ({
        path: opt(config.dir) ?? '.',
        rerun: 'mf-specs author',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Render the spec-create prompt for dispatch: the prompt text and nothing else. Model-free.',
  ),
  Command.provide(PromptStore.Default),
);

export const executeCommand = Command.make(
  'execute',
  {
    dir: workspaceDirFlag,
    name: Flag.optional(nameFlag),
    phase: Flag.optional(
      Flag.String('phase').pipe(
        Flag.withDescription('Restrict the session to one phase id (default: the active phase).'),
      ),
    ),
    focus: Flag.optional(
      Flag.String('focus').pipe(
        Flag.withDescription('Extra direction to steer into every worker this session.'),
      ),
    ),
    mode: Flag.optional(
      Flag.String('mode').pipe(
        Flag.withDescription(`Interaction mode: ${MODE_HINT}. Default: guided.`),
      ),
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = yield* workspaceRoot(opt(config.dir));
        const report = yield* execute(storeDirOf(workspace), {
          name: opt(config.name),
          phase: opt(config.phase),
          focus: opt(config.focus),
          mode: opt(config.mode),
          workspace,
        });
        yield* Console.log(report.prompt.text);
      }),
      () => ({
        path: opt(config.dir) ?? '.',
        rerun: 'mf-specs execute',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Render the spec-execute prompt for the resolved spec: state, ready set, review budget, and mode. Model-free.',
  ),
  Command.provide(SpecStore.Default),
  Command.provide(PromptStore.Default),
);

export const sizingConfigCommand = Command.make(
  'sizing-config',
  {
    dir: workspaceDirFlag,
    scope: Flag.optional(
      Flag.String('scope').pipe(
        Flag.withDescription(
          `Config layer to size: ${SIZING_SCOPES.join(', ')}. Omit to let the prompt ask.`,
        ),
      ),
    ),
    name: Flag.optional(nameFlag),
    phase: Flag.optional(
      Flag.String('phase').pipe(
        Flag.withDescription('Phase whose sizes are overridden (requires --name).'),
      ),
    ),
    focus: Flag.optional(
      Flag.String('focus').pipe(
        Flag.withDescription('Extra direction to steer into the sizing run.'),
      ),
    ),
    mode: Flag.optional(
      Flag.String('mode').pipe(
        Flag.withDescription(`Interaction mode: ${MODE_HINT}. Default: guided.`),
      ),
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = yield* workspaceRoot(opt(config.dir));
        const report = yield* sizingConfig(workspace, {
          scope: opt(config.scope),
          name: opt(config.name),
          phase: opt(config.phase),
          focus: opt(config.focus),
          mode: opt(config.mode),
        });
        yield* Console.log(report.prompt.text);
      }),
      () => ({
        path: opt(config.dir) ?? '.',
        rerun: 'mf-specs sizing-config',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Render the spec-sizing prompt for the repo, one spec, one phase, or the open scope. Writes nothing, dispatches nothing.',
  ),
  Command.provide(PromptStore.Default),
);
