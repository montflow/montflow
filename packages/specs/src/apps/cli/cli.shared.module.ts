import { Cause, Console, Data, Effect, Match, Option, Result as EffectResult } from 'effect';
import { CliError, Command, Flag } from 'effect/cli';

import { MODE_FLAG, type ModeRefusal, PromptError } from '../../modules/prompt/index.js';
import { PHASE_PATTERN, isValidName, isValidPhase } from '../../modules/spec/index.js';
import {
  CONFIG_FILE,
  type SizingConfig,
  SizingError,
  parse as parseSizing,
  verifyText as verifySizingText,
} from '../../modules/sizing/index.js';
import { type SpecSnapshot } from '../../modules/structure/index.js';

import { SLUG_PATTERN } from '../../modules/task/index.js';
import { type Issue, type LayerTrace, isWarning } from '../../modules/verify/index.js';
import {
  type DiagnosticBlock,
  causeMessage,
  renderDiagnostic,
  renderDiagnostics,
} from '../../modules/diagnostic/index.js';
import type {
  DoctorError,
  DoctorOptions,
  DoctorResult,
  PayloadInstall,
} from '../../modules/doctor/index.js';
import { SpecStore } from '../../services/index.js';
import { repairableStatus, resolveRepoRoot, runDoctorAt } from '../../modules/doctor/index.js';

/** Fix text for a failed review-store read. */
export const reviewStoreFix =
  'Check that the review store beside the specs store is readable; every round must expose a readable REVIEW.md.';

/** Print a diagnosed result and set the exit code. */
export const finish = (output: string, exitCode: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (output !== '') yield* Console.log(output);
    if (exitCode !== 0) {
      yield* Effect.sync(() => {
        process.exitCode = exitCode;
      });
    }
  });

/** `--dir` flag for commands that default to the repo root. */
export const workspaceDirFlag = Flag.optional(
  Flag.String('dir').pipe(
    Flag.withDescription('Workspace root. Defaults to the nearest repository root.'),
  ),
);

/** Spec store directory, relative to the workspace root. */
export const DEFAULT_ROOT = '.agents/@montflow/specs';

/**
 * Resolve the spec store directory from a workspace-root argument. `.` (the
 * default) reads the store directly under the working directory.
 * @param root - workspace root passed via `--dir`
 * @returns the store directory
 */
export const storeDirOf = (root: string): string =>
  root === '.' ? DEFAULT_ROOT : `${root.replace(/\/+$/, '')}/${DEFAULT_ROOT}`;

/**
 * Recover the workspace root a store directory belongs to. The server hands
 * `runSlash` an absolute `<workspace>/.agents/@montflow/specs`, and git
 * detection needs the workspace side to find `.git`.
 * @param root - spec store directory
 * @returns the workspace root, or `root` itself when it is not a store path
 */
export const workspaceOf = (root: string): string => {
  if (root === DEFAULT_ROOT) return '.';
  const suffix = `/${DEFAULT_ROOT}`;
  return root.endsWith(suffix) ? root.slice(0, -suffix.length) : root;
};

/** How many specs are verified in parallel by default. */
export const DEFAULT_CONCURRENCY = 8;

// ─── Diagnostics ──────────────────────────────────────────────────────

/** Exit code a validation failure implies: `1`. */
export const VALIDATION_EXIT_CODE = 1;

/** Exit code an unexpected defect surfaced from `Cause` implies: `2`. */
export const INTERNAL_EXIT_CODE = 2;

/** Exit code an interrupted run implies (the shell's conventional value): `130`. */
export const INTERRUPT_EXIT_CODE = 130;

/** Stable codes for surfacing failures that are not config-contract violations. */
export const SURFACE_CODES = {
  unknownSpec: 'spec.not-found',
  unknownTask: 'task.not-found',
  unknownPhase: 'spec.phase-not-found',
  phaseNotActive: 'spec.phase-not-active',
  noActivePhase: 'spec.no-active-phase',
  invalidArgument: 'cli.invalid-argument',
  store: 'store.error',
  unhandled: 'failure.unhandled',
  internal: 'internal',
} as const;

/** One agent-first diagnostic: what failed, where, and how to repair it. */
export type SizingDiagnostic = DiagnosticBlock;

/** Fields a {@link SizingDiagnostic} is built from. */
export interface DiagnosticInput {
  readonly code: string;
  readonly path: string;
  readonly field: string;
  readonly problem: string;
  readonly rerun: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly fix?: string | undefined;
  readonly cause?: unknown;
  readonly layers?: LayerTrace | undefined;
  readonly warning?: boolean;
}

/** A diagnostic being filled in, so absent optional fields stay absent. */
export interface MutableDiagnostic {
  code: string;
  path: string;
  field: string;
  problem: string;
  next: string;
  expected?: string;
  actual?: string;
  fix?: string;
  cause?: unknown;
  layers?: LayerTrace;
  stack?: string;
  warning?: boolean;
}

/** Build one diagnostic, omitting absent optional fields. */
export const diagnostic = (input: DiagnosticInput): SizingDiagnostic => {
  const found: MutableDiagnostic = {
    code: input.code,
    path: input.path,
    field: input.field,
    problem: input.problem,
    next: input.rerun,
  };
  if (input.expected !== undefined) found.expected = input.expected;
  if (input.actual !== undefined) found.actual = input.actual;
  if (input.fix !== undefined) found.fix = input.fix;
  if (input.cause !== undefined) found.cause = input.cause;
  if (input.layers !== undefined) found.layers = input.layers;
  if (input.warning === true) found.warning = true;
  return found;
};

/** A sizing failure the CLI renders as agent-first diagnostics. */
export class SurfaceError extends Data.TaggedError('@montflow/SurfaceError')<{
  readonly operation: string;
  readonly diagnostics: ReadonlyArray<SizingDiagnostic>;
}> {}

/** Separator the structure verifier uses between a file path and its field. */
export const NESTED_FIELD_SEPARATOR = ': ';

/** The field a failed review-store read reports on: the linked series entry. */
export const REVIEW_SERIES_FIELD = 'review-series';

/**
 * The one locator a failed review-store read reports: `<spec>/review-series`,
 * spec-relative and never machine-absolute. `check`, `status`, `next`, `state`,
 * `list`, and `execute` all name the same thing for the same failure, so an agent
 * that parses `path` gets one answer it can paste into a report or a repair.
 * @param name - spec directory name
 * @returns the canonical review-store locator
 */
export const reviewSeriesPath = (name: string): string => `${name}/${REVIEW_SERIES_FIELD}`;

/**
 * Finding field for a review-store failure. It nests so the renderer prefixes
 * the spec name to {@link reviewSeriesPath}: `path <spec>/review-series`,
 * `field review-series`.
 */
export const REVIEW_SERIES_ISSUE_FIELD = `${REVIEW_SERIES_FIELD}${NESTED_FIELD_SEPARATOR}${REVIEW_SERIES_FIELD}`;

/** Split a nested `path: field` finding into its path and field. */
export const splitField = (field: string, base: string) => {
  const separator = field.indexOf(NESTED_FIELD_SEPARATOR);
  if (separator === -1) return { path: base, field };
  const head = field.slice(0, separator);
  return {
    path: base === '' ? head : `${base}/${head}`,
    field: field.slice(separator + NESTED_FIELD_SEPARATOR.length),
  };
};

/** Build a diagnostic from a coded `Issue`. */
export const diagnosticOfIssue = (base: string, found: Issue, rerun: string): SizingDiagnostic => {
  const split = splitField(found.field, base);
  return diagnostic({
    code: found.code ?? 'unspecified',
    path: split.path,
    field: split.field,
    problem: found.message,
    rerun,
    expected: found.expected,
    actual: found.actual,
    fix: found.fix,
    cause: found.cause,
    layers: found.layers,
    warning: isWarning(found),
  });
};

/** Build a diagnostic from an engine-level {@link SizingError}. */
export const diagnosticOfSizingError = (error: SizingError, rerun: string): SizingDiagnostic =>
  diagnostic({
    code: error.code,
    path: error.path,
    field: error.field,
    problem: error.message,
    rerun,
    expected: error.expected,
    actual: error.actual,
    fix: error.fix,
    cause: error.cause,
  });

/** Build a diagnostic from a store failure. */
export const diagnosticOfStoreError = (
  error: SpecStore.StoreError,
  path: string,
  rerun: string,
): SizingDiagnostic =>
  error.origin === 'reviews'
    ? diagnostic({
        code: SURFACE_CODES.store,
        path: reviewSeriesPath(path),
        field: REVIEW_SERIES_FIELD,
        problem: error.reason,
        rerun,
        expected: 'a readable review store',
        cause: error.cause,
        fix: reviewStoreFix,
      })
    : diagnostic({
        code: SURFACE_CODES.store,
        path: error.path ?? path,
        field: 'root',
        problem: error.reason,
        rerun,
        cause: error.cause,
        fix:
          error.cause === undefined
            ? 'Pass --dir <repo root> (the directory holding .agents/@montflow/specs) and re-run the command.'
            : 'Check --dir and that the file is readable.',
      });

/** Build a diagnostic for an expected failure the surface has no arm for. */
export const diagnosticOfUnhandled = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught `Cause` failure value is untyped by construction; this function is the rendering boundary.
  error: unknown,
  path: string,
  rerun: string,
): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.unhandled,
    path,
    field: 'root',
    problem: `Unhandled failure: ${causeMessage(error) ?? String(error)}`,
    rerun,
    fix: 'Treat this as a validation failure: report the command and its arguments.',
  });

/** Build a diagnostic from a prompt-load failure, keeping its coded contract. */
export const diagnosticOfPromptError = (error: PromptError, rerun: string): SizingDiagnostic =>
  diagnostic({
    code: error.code,
    path: error.path,
    field: error.field,
    problem: error.problem,
    rerun,
    expected: error.expected,
    actual: error.actual,
    fix: error.fix,
    cause: error.cause,
  });

/** Build the usage diagnostic for a refused `--mode`, shared by every prompt verb. */
export const modeRefusalDiagnostic = (refusal: ModeRefusal, rerun: string): SizingDiagnostic =>
  diagnostic({
    code: refusal.code,
    path: MODE_FLAG,
    field: MODE_FLAG,
    problem: refusal.problem,
    rerun,
    expected: refusal.expected,
    actual: refusal.actual,
    fix: refusal.fix,
  });

/** Build an internal diagnostic from an unexpected defect's message and stack. */
export const diagnosticOfDefect = (
  message: string,
  stack: string | undefined,
  path: string,
  rerun: string,
  verbose: boolean,
): SizingDiagnostic => {
  const found = diagnostic({
    code: SURFACE_CODES.internal,
    path,
    field: 'root',
    problem: `Internal defect: ${message}`,
    rerun,
    fix: 'Re-run the same command with --verbose and report the defect with its stack.',
  });
  if (!verbose || stack === undefined) return found;
  return { ...found, stack };
};

// The one agent-first block renderer lives in `modules/diagnostic`, so the
// prompt loader's skill advisories and every CLI diagnostic share one shape.
export { renderDiagnostic, renderDiagnostics };

/** Indent every line of a rendered block. */
export const indentBlock = (text: string, indent: string): string =>
  text
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');

/** What a caught `Cause` renders as: the diagnostic text plus its exit code. */
export interface CauseReport {
  readonly output: string;
  readonly exitCode: number;
}

/** Options for {@link diagnoseCause}. */
export interface DiagnoseOptions {
  /** Path named when a store or engine failure carries none. */
  readonly path: string;
  /** Command to re-run after a repair. */
  readonly rerun: string;
  readonly verbose: boolean;
}

/**
 * Render a caught `Cause`: expected failures become their own diagnostic and
 * exit `1`; a pure interruption is not a failure at all and exits `130`; an
 * unexpected defect is labelled internal and exits `2`. A stack appears only
 * under `verbose`, so a defect never dumps a raw trace by default.
 * @param cause - the caught cause
 * @param options - fallback path, re-run command, and verbosity
 * @returns the rendered text and the exit code it implies
 */
export const diagnoseCause = (
  cause: Cause.Cause<unknown>,
  options: DiagnoseOptions,
): CauseReport => {
  const failure = Cause.findErrorOption(cause);
  if (Option.isSome(failure)) {
    return Match.value(failure.value).pipe(
      Match.when(Match.instanceOf(SurfaceError), (error) => ({
        output: renderDiagnostics(error.diagnostics, options.verbose),
        exitCode: VALIDATION_EXIT_CODE,
      })),
      Match.when(Match.instanceOf(SizingError), (error) => ({
        output: renderDiagnostic(diagnosticOfSizingError(error, options.rerun), options.verbose),
        exitCode: VALIDATION_EXIT_CODE,
      })),
      Match.when(Match.instanceOf(SpecStore.StoreError), (error) => ({
        output: renderDiagnostic(
          diagnosticOfStoreError(error, options.path, options.rerun),
          options.verbose,
        ),
        exitCode: VALIDATION_EXIT_CODE,
      })),
      Match.when(Match.instanceOf(PromptError), (error) => ({
        output: renderDiagnostic(diagnosticOfPromptError(error, options.rerun), options.verbose),
        exitCode: VALIDATION_EXIT_CODE,
      })),
      Match.when(Match.instanceOf(CliError.UserError), (error) => ({
        output: error.userMessage ?? error.message,
        exitCode: VALIDATION_EXIT_CODE,
      })),
      Match.orElse((error) => ({
        output: renderDiagnostic(
          diagnosticOfUnhandled(error, options.path, options.rerun),
          options.verbose,
        ),
        exitCode: VALIDATION_EXIT_CODE,
      })),
    );
  }
  if (Cause.hasInterruptsOnly(cause)) return { output: '', exitCode: INTERRUPT_EXIT_CODE };
  const defect = Cause.findDefect(cause);
  const value: unknown = EffectResult.isSuccess(defect) ? defect.success : cause;
  const message = value instanceof Error && value.message !== '' ? value.message : String(value);
  const stack = value instanceof Error ? value.stack : undefined;
  return {
    output: renderDiagnostic(
      diagnosticOfDefect(message, stack, options.path, options.rerun, options.verbose),
      options.verbose,
    ),
    exitCode: INTERNAL_EXIT_CODE,
  };
};

// ─── Identifier guards ────────────────────────────────────────────────

/** The slug rule, stated as a diagnostic's `expected` row. */
export const NAME_RULE = `a slug matching ${SLUG_PATTERN.source} (e.g. 'ship-login')`;

/** The phase rule, stated as a diagnostic's `expected` row. */
export const PHASE_RULE = `a phase id matching ${PHASE_PATTERN.source} (e.g. 'A' or 'AB')`;

/** Render a rejected flag value so a blank or whitespace value stays visible. */
export const rejectedValue = (value: string): string =>
  value === '' ? 'empty string' : `'${value}'`;

/** Build the usage diagnostic for a `--name` that is not a slug. */
export const invalidNameDiagnostic = (name: string, rerun: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: '--name',
    field: '--name',
    problem: `Spec name ${rejectedValue(name)} is not a slug.`,
    rerun,
    expected: NAME_RULE,
    actual: rejectedValue(name),
    fix: "Pass a lowercase kebab-case spec slug such as 'ship-login'.",
  });

/** Build the usage diagnostic for a `--phase` that is not a phase id. */
export const invalidPhaseDiagnostic = (phase: string, rerun: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: '--phase',
    field: '--phase',
    problem: `Phase id ${rejectedValue(phase)} is not a phase id.`,
    rerun,
    expected: PHASE_RULE,
    actual: rejectedValue(phase),
    fix: "Pass a phase id such as 'A' or 'AB'.",
  });

/**
 * The command each guarded surface tells the caller to re-run once the value is
 * repaired. One entry per surface whose row is flag-independent, so a refusal
 * names the command that failed instead of an unrelated verb. `models --verify`
 * is absent because its row carries the caller's flags and is built by
 * {@link modelsVerifyGuardCommand}.
 */
export const GUARD_RERUN = {
  status: 'mf-specs status --name <spec>',
  next: 'mf-specs next --name <spec>',
  state: 'mf-specs state --name <spec>',
  check: 'mf-specs check --name <spec>',
  sizing: 'mf-specs sizing --name <spec> --task <id>',
  resolve: 'mf-specs resolve --name <spec> --task <id>',
  execute: 'mf-specs execute --name <spec>',
  executePhase: 'mf-specs execute --name <spec> --phase <id>',
  create: 'mf-specs create --name <slug>',
  sizingConfig: 'mf-specs sizing-config --name <spec>',
  sizingConfigPhase: 'mf-specs sizing-config --name <spec> --phase <id>',
} as const;

/**
 * The one spec-name guard. Every surface that accepts a spec name runs this
 * before its first store read or prompt render, so a malformed identifier can
 * never address a path outside the specs root. The value is validated exactly
 * as supplied — a supplied-but-blank name is a usage error, never "absent", and
 * padding is refused instead of being trimmed into a valid slug.
 * @param name - the raw `--name` value
 * @param rerun - the command that re-runs this surface after the repair
 * @returns the refusal to render, or undefined when the name is a valid slug
 */
export const guardSpecName = (name: string, rerun: string): SizingDiagnostic | undefined =>
  isValidName(name) ? undefined : invalidNameDiagnostic(name, rerun);

/**
 * The one phase guard. Every surface that accepts a phase runs this before its
 * first store read or prompt render; a blank phase is the caller's decision
 * (some verbs treat it as absent), so only a supplied non-blank id is checked.
 * A supplied id is validated exactly as supplied, so `' A '` is refused rather
 * than silently becoming `A`.
 * @param phase - the phase id to validate, already normalised by
 *   {@link phaseRequestOf}
 * @param rerun - the command that re-runs this surface after the repair
 * @returns the refusal to render, or undefined when the phase is a valid id
 */
export const guardPhase = (phase: string, rerun: string): SizingDiagnostic | undefined =>
  isValidPhase(phase) ? undefined : invalidPhaseDiagnostic(phase, rerun);

/**
 * Normalise a supplied `--phase` once: a blank or whitespace-only value means
 * "absent" for every verb that accepts one, and a non-blank value is kept
 * exactly as given so the grammar guard sees what the caller passed. No verb
 * trims a non-blank id into a valid one.
 * @param phase - the raw `--phase` value
 * @returns the phase id to validate, or undefined when none was supplied
 */
export const phaseRequestOf = (phase: string | undefined): string | undefined => {
  if (phase === undefined) return undefined;
  return phase.trim() === '' ? undefined : phase;
};

/** Turn a guard's refusal into the failure a command boundary renders. */
export const guardFailure = (
  operation: string,
  refusal: SizingDiagnostic | undefined,
): Effect.Effect<void, SurfaceError> =>
  refusal === undefined
    ? Effect.void
    : Effect.fail(new SurfaceError({ operation, diagnostics: [refusal] }));

// ─── Sizing ───────────────────────────────────────────────────────────

/** Config layers loaded for one spec, plus the files the loader found. */
export interface SizingLoad {
  /** Display paths of the config files present, least to most specific. */
  readonly files: ReadonlyArray<string>;
  /** Repo-level layer; absent when the file is missing or invalid. */
  readonly repo: SizingConfig | undefined;
  /** Spec-level layer; absent when the file is missing or invalid. */
  readonly spec: SizingConfig | undefined;
  /** Every verification finding from both files. */
  readonly issues: ReadonlyArray<Issue>;
}

/** A load with no config files: every size resolves to `inherit`. */
export const NO_SIZING: SizingLoad = {
  files: [],
  repo: undefined,
  spec: undefined,
  issues: [],
};

/** Prefix a config file's findings with its display path. */
export const nestConfig = (path: string, issues: ReadonlyArray<Issue>): ReadonlyArray<Issue> =>
  issues.map((found) => ({ ...found, field: `${path}${NESTED_FIELD_SEPARATOR}${found.field}` }));

/** A finding being filled in, so absent optional fields stay absent. */
export interface SizingIssue {
  code: string;
  field: string;
  message: string;
  expected?: string;
  actual?: string;
  fix?: string;
  cause?: unknown;
}

/** Build an `Issue` from an engine failure that verification should have caught. */
export const issueOfSizingError = (error: SizingError): Issue => {
  const found: SizingIssue = {
    code: error.code,
    field: `${error.path}${NESTED_FIELD_SEPARATOR}${error.field}`,
    message: error.message,
  };
  if (error.expected !== undefined) found.expected = error.expected;
  if (error.actual !== undefined) found.actual = error.actual;
  if (error.fix !== undefined) found.fix = error.fix;
  if (error.cause !== undefined) found.cause = error.cause;
  return found;
};

/** One loaded config file: where it came from, its config, and its findings. */
export interface LoadedLayer {
  readonly file: string | undefined;
  readonly config: SizingConfig | undefined;
  readonly issues: ReadonlyArray<Issue>;
}

/**
 * Read, verify, and parse the repo-level `sizing.json`. A missing file is no
 * layer; an invalid one yields findings without a config, so callers can report
 * every finding instead of stopping at the first.
 * @param root - spec root directory
 * @returns the repo layer, with `file` absent when the file is missing
 */
export const loadRepoLayer = (
  root: string,
): Effect.Effect<LoadedLayer, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const text = yield* store.readRootFile(root, CONFIG_FILE);
    if (text === undefined) return { file: undefined, config: undefined, issues: [] };
    const found = verifySizingText({ path: CONFIG_FILE, kind: 'repo' }, text);
    const issues = [...nestConfig(CONFIG_FILE, found.issues)];
    if (!found.valid) return { file: CONFIG_FILE, config: undefined, issues };
    const config = yield* parseSizing({ path: CONFIG_FILE, kind: 'repo' }, text).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.sync(() => {
            issues.push(issueOfSizingError(error));
            return undefined;
          }),
        onSuccess: (parsed) => Effect.succeed(parsed),
      }),
    );
    return { file: CONFIG_FILE, config, issues };
  });

/**
 * Load the repo-level and spec-level `sizing.json` for one spec. Both files
 * are verified in full; a file is parsed only when it verifies, so the CLI can
 * report every finding instead of stopping at the first.
 * @param root - spec root directory
 * @param name - spec directory name
 * @param snapshot - every file under the spec root
 * @returns the parsed layers, the files found, and every finding
 */
export const loadSizing = (
  root: string,
  name: string,
  snapshot: SpecSnapshot,
): Effect.Effect<SizingLoad, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const repoLayer = yield* loadRepoLayer(root);
    const issues: Array<Issue> = [...repoLayer.issues];
    const files: Array<string> = repoLayer.file === undefined ? [] : [repoLayer.file];
    let spec: SizingConfig | undefined;

    const specFile = snapshot.files.find((file) => file.path === CONFIG_FILE);
    if (specFile !== undefined) {
      const path = `${name}/${CONFIG_FILE}`;
      files.push(path);
      const found = verifySizingText({ path, kind: 'spec' }, specFile.content);
      issues.push(...nestConfig(path, found.issues));
      if (found.valid) {
        spec = yield* parseSizing({ path, kind: 'spec' }, specFile.content).pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.sync(() => {
                issues.push(issueOfSizingError(error));
                return undefined;
              }),
            onSuccess: (parsed) => Effect.succeed(parsed),
          }),
        );
      }
    }

    return { files, repo: repoLayer.config, spec, issues };
  });

// ─── Models ───────────────────────────────────────────────────────────

/** Options shared by the model catalogue surfaces. */
export const runDiagnosed = <A, E, R>(
  body: Effect.Effect<A, E, R>,
  options: () => DiagnoseOptions,
): Effect.Effect<void, never, R> =>
  body.pipe(
    Effect.asVoid,
    Effect.catchCause((cause) => {
      const diagnosed = diagnoseCause(cause, options());
      return finish(diagnosed.output, diagnosed.exitCode);
    }),
  );

/** Detailed mode includes the cause chain and the stack of an internal defect. */
export const verboseFlag = Flag.Boolean('verbose').pipe(
  Flag.withDescription('Detailed output: provenance matrix, cause chain, and stack.'),
  Flag.withDefault(false),
);

export const dirFlag = Flag.String('dir').pipe(
  Flag.withDescription('Workspace root. Defaults to the working directory.'),
  Flag.withDefault('.'),
);

export const nameFlag = Flag.String('name').pipe(Flag.withDescription('Spec directory name.'));

/** Collapse an optional flag to `string | undefined`. */
export const opt = (value: Option.Option<string>): string | undefined =>
  Option.getOrUndefined(value);

/**
 * The workspace root the prompt commands read. An explicit `--dir` always
 * wins; otherwise the nearest repository root is used, so the package scripts
 * (`bun run --cwd packages/specs cli author …`) still read the repo's
 * `.agents/@montflow/prompts/` instead of the package directory.
 */
export const workspaceRoot = (dir: string | undefined): Effect.Effect<string> =>
  dir === undefined || dir === '' ? resolveRepoRoot(process.cwd()) : Effect.succeed(dir);

/** Comma-separated values; blank or absent reads as an empty list. */
export const csv = (value: string | undefined): ReadonlyArray<string> =>
  value === undefined || value.trim() === ''
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');

/** Render a caught `Cause` as a failed slash report. */
export const doctorMark = (payload: PayloadInstall): string =>
  Match.value(payload.status).pipe(
    Match.whenOr('ok', 'present', () => '\u2713'),
    Match.whenOr('installed', 'repaired', () => '+'),
    Match.whenOr('missing', 'stale', 'blocked', () => '\u2717'),
    Match.exhaustive,
  );

/**
 * What a doctor payload line says after the mark. `present` reads "already
 * installed", never "installed", so a no-op is not mistaken for a write.
 * @param payload - one skill or prompt outcome
 * @returns the outcome note
 */
export const doctorNote = (payload: PayloadInstall): string =>
  Match.value(payload.status).pipe(
    Match.when('ok', () => 'up to date'),
    Match.when('present', () => 'already installed'),
    Match.when('installed', () => 'installed'),
    Match.when('repaired', () => `repaired (${payload.detail ?? 'rewritten from the package'})`),
    Match.when('missing', () => payload.detail ?? 'not installed'),
    Match.when('stale', () => payload.detail ?? 'differs from the package'),
    Match.when('blocked', () => {
      const code = payload.failure?.code ?? 'doctor.blocked';
      return `blocked [${code}]: ${payload.failure?.problem ?? payload.detail ?? 'cannot repair'}`;
    }),
    Match.exhaustive,
  );

/**
 * One rendered doctor payload line: its mark, outcome, and target. A drifted
 * payload also names the package source it comes from.
 * @param payload - one skill or prompt outcome
 * @returns human-readable line
 */
export const doctorLine = (payload: PayloadInstall): string => {
  const origin = Match.value(payload.status).pipe(
    Match.whenOr('missing', 'stale', () => ` (from ${payload.source})`),
    Match.orElse(() => ''),
  );
  return `${doctorMark(payload)} ${payload.name}: ${doctorNote(payload)} \u2192 ${payload.target}${origin}`;
};

/** Build a diagnostic from a blocked payload's coded failure. */
export const diagnosticOfDoctorFailure = (
  payload: PayloadInstall,
): SizingDiagnostic | undefined => {
  const failure: DoctorError | undefined = payload.failure;
  if (failure === undefined) return undefined;
  return diagnostic({
    code: failure.code,
    path: failure.path,
    field: failure.operation,
    problem: failure.problem,
    rerun: 'mf-specs doctor',
    fix: failure.fix,
    cause: failure.cause,
  });
};

/**
 * Render a doctor run: the aggregate line, one line per skill and prompt, a
 * diagnostic block for each payload doctor could not repair, and the repair
 * hint when anything is repairable. The hint is withheld when no unhealthy
 * payload is repairable: re-running doctor cannot fix those, and the
 * diagnostic's `fix` line says what can.
 * @param result - doctor outcome
 * @returns human-readable report
 */
export const renderDoctor = (result: DoctorResult): string => {
  const head = Match.value(result.status).pipe(
    Match.when('ok', () => '\u2713 spec skills and prompts are installed and up to date.'),
    Match.when('present', () => '\u2713 spec skills and prompts are already installed.'),
    Match.when('installed', () => '+ spec skills and prompts installed or repaired.'),
    Match.when('drifted', () => '\u2717 spec skills and prompts are not current.'),
    Match.exhaustive,
  );
  const payloads = [...result.skills, ...result.prompts];
  const lines = payloads.map((payload) => doctorLine(payload));
  const failures = payloads.flatMap((payload) => {
    const found = diagnosticOfDoctorFailure(payload);
    return found === undefined ? [] : [found];
  });
  const repairable = payloads.some((payload) => repairableStatus(payload.status));
  return [
    head,
    ...lines,
    ...(failures.length === 0 ? [] : ['', renderDiagnostics(failures)]),
    ...(repairable ? ['Run: mf-specs doctor'] : []),
  ].join('\n');
};

/**
 * Exit code a doctor run implies: `0` when healthy, `1` when anything is
 * missing, stale, or blocked. Extracted from the command body so the drift gate
 * can be tested without spawning a process.
 * @param result - doctor outcome
 * @returns the process exit code
 */
export const doctorExitCode = (result: DoctorResult): number =>
  result.healthy ? 0 : VALIDATION_EXIT_CODE;

/** A rendered doctor run plus the exit code its command body would set. */
export interface DoctorRun {
  readonly report: string;
  readonly exitCode: number;
}

/**
 * Run doctor and render it, returning the exit code instead of mutating
 * `process.exitCode`. The command body is the only caller that sets the global,
 * so tests can assert the same decision without side effects.
 * @param root - repo root that owns `.agents/`
 * @param options - set `check` to report without writing
 * @returns the rendered report and the exit code it implies
 */
export const runDoctorRun = (root: string, options: DoctorOptions = {}): Effect.Effect<DoctorRun> =>
  runDoctorAt(root, options).pipe(
    Effect.map((result) => ({ report: renderDoctor(result), exitCode: doctorExitCode(result) })),
  );

/**
 * `doctor` command: install (or, with `--check`, verify) the packaged spec
 * skills in the repo's `.agents/skills/` and prompts in
 * `.agents/@montflow/prompts/`. Resolves the repo root from `--dir`.
 */
export const doctorCommand = Command.make(
  'doctor',
  {
    dir: workspaceDirFlag,
    check: Flag.Boolean('check').pipe(
      Flag.withDescription(
        'Report only; never write. Exits non-zero when a skill or prompt is not current.',
      ),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const workspace = yield* workspaceRoot(opt(config.dir));
      const { report, exitCode } = yield* runDoctorRun(workspace, { check: config.check });
      yield* Console.log(report);
      if (exitCode !== 0) {
        yield* Effect.sync(() => {
          process.exitCode = exitCode;
        });
      }
    }),
).pipe(
  Command.withDescription('Install or verify the packaged spec skills and prompts in .agents/.'),
);

/** Root command: `mf-specs <check|status|state|next|resolve|sizing|models|which|list|create|author|execute|sizing-config|doctor>`. */
