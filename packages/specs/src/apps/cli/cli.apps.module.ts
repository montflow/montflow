import {
  Cause,
  Clock,
  Console,
  Data,
  Effect,
  FileSystem,
  Match,
  Option,
  Result as EffectResult,
} from 'effect';
import { CliError, Command, Flag } from 'effect/cli';
import { PromptStore } from '@montflow/prompts';
import {
  type LoadedPrompt,
  MODE_FLAG,
  MODE_HINT,
  type ModeRefusal,
  PromptError,
  load as loadPrompt,
  parseMode,
} from '../../modules/prompt/index.js';
import { type Spec, PHASE_PATTERN, isValidName, parseSpecFile } from '../../modules/spec/index.js';
import {
  type Analysis,
  type State,
  STATES,
  analyze as analyzeLifecycle,
} from '../../modules/lifecycle/index.js';
import {
  SCAFFOLD_TASK_TYPES,
  isScaffoldTaskSize,
  isScaffoldTaskType,
  renderSpecScaffold,
} from '../../modules/scaffold/index.js';
import type { ScaffoldTask } from '../../modules/scaffold/index.js';
import {
  CODES,
  CONFIG_FILE,
  type ConfigSet,
  DEFAULT_SIZE,
  INHERIT,
  LAYERS,
  type Layer,
  SIZES,
  type Size,
  type SizeMap,
  type SizingConfig,
  SizingError,
  parse as parseSizing,
  phaseReviewBudget,
  resolve as resolveSizing,
  reviewCycles,
  targetOf,
  verifyText as verifySizingText,
} from '../../modules/sizing/index.js';
import { type SpecSnapshot, verifySpecTree } from '../../modules/structure/index.js';
import * as Catalogue from '../../modules/catalogue/index.js';
import {
  SLUG_PATTERN,
  type Task,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
  sizeOf,
  verifyTaskSize,
} from '../../modules/task/index.js';
import {
  type Issue,
  type LayerTrace,
  type Result,
  errorCount,
  isError,
  isWarning,
  noErrors,
  promoteWarnings,
  warningCount,
} from '../../modules/verify/index.js';
import {
  SPEC_FILE,
  type BranchSource,
  type WhichMatch,
  type WhichMiss,
  parseGitFile,
  parseHead,
  resolve as resolveWhich,
} from '../../modules/which/index.js';
import { SpecStore } from '../../services/index.js';
import { repairableStatus, resolveRepoRoot, runDoctorAt } from '../doctor/index.js';
import type { DoctorError, DoctorOptions, DoctorResult, PayloadInstall } from '../doctor/index.js';

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
export interface SizingDiagnostic {
  /** Stable, greppable failure class. */
  readonly code: string;
  /** File, spec, or `spec/task` that carries the failure. */
  readonly path: string;
  /** Field inside that path. */
  readonly field: string;
  /** What is wrong. */
  readonly problem: string;
  /** What the contract requires, when naming it helps. */
  readonly expected?: string;
  /** What the file actually holds, when naming it helps. */
  readonly actual?: string;
  /** Concrete edit or command that repairs the failure. */
  readonly fix?: string;
  /** Preserved cause, rendered as a chain when the failure wrapped one. */
  readonly cause?: unknown;
  /** Precedence layers a sizing finding consulted. */
  readonly layers?: LayerTrace;
  /** Stack of an unexpected defect; rendered only under `--verbose`. */
  readonly stack?: string;
  /** True when the finding is advisory rather than fatal. */
  readonly warning?: boolean;
  /** Command to re-run once the failure is repaired. */
  readonly next: string;
}

/** Fields a {@link SizingDiagnostic} is built from. */
interface DiagnosticInput {
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
interface MutableDiagnostic {
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
const diagnostic = (input: DiagnosticInput): SizingDiagnostic => {
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
const NESTED_FIELD_SEPARATOR = ': ';

/** Split a nested `path: field` finding into its path and field. */
const splitField = (field: string, base: string) => {
  const separator = field.indexOf(NESTED_FIELD_SEPARATOR);
  if (separator === -1) return { path: base, field };
  const head = field.slice(0, separator);
  return {
    path: base === '' ? head : `${base}/${head}`,
    field: field.slice(separator + NESTED_FIELD_SEPARATOR.length),
  };
};

/** One link of a cause chain, as text, or undefined when it has no message. */
const causeMessage = (cause: unknown): string | undefined => {
  if (cause instanceof Error) return cause.message === '' ? undefined : cause.message;
  if (cause === undefined || cause === null) return undefined;
  const text = String(cause);
  return text === '' ? undefined : text;
};

/** The wrapped cause followed by each nested `cause`, linked with ` <- `. */
const causeChain = (cause: unknown): string => {
  const messages: Array<string> = [];
  const seen = new Set<unknown>();
  let current: unknown = cause;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    const message = causeMessage(current);
    if (message !== undefined) messages.push(message);
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.length === 0 ? String(cause) : messages.join(' <- ');
};

/** Render a layer trace: which layers were consulted, and which supplied the finding. */
const layerText = (trace: LayerTrace): string => {
  const parts = [`consulted ${trace.consulted.join(',')}`];
  if (trace.layer !== undefined) parts.push(`layer ${trace.layer}`);
  if (trace.phase !== undefined) parts.push(`phase ${trace.phase}`);
  return parts.join(' \u00b7 ');
};

/** Build a diagnostic from a coded `Issue`. */
const diagnosticOfIssue = (
  base: string,
  found: Issue,
  rerun: string,
  detail = true,
): SizingDiagnostic => {
  const split = splitField(found.field, base);
  const built = diagnostic({
    code: found.code ?? 'unspecified',
    path: split.path,
    field: split.field,
    problem: found.message,
    rerun,
    expected: found.expected,
    actual: found.actual,
    fix: found.fix,
    cause: detail ? found.cause : undefined,
    layers: detail ? found.layers : undefined,
    warning: isWarning(found),
  });
  return built;
};

/** Build a diagnostic from an engine-level {@link SizingError}. */
const diagnosticOfSizingError = (error: SizingError, rerun: string): SizingDiagnostic =>
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
const diagnosticOfStoreError = (
  error: SpecStore.StoreError,
  path: string,
  rerun: string,
): SizingDiagnostic =>
  diagnostic({
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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught `Cause` failure value is untyped by construction; this function is the rendering boundary.
const diagnosticOfUnhandled = (error: unknown, path: string, rerun: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.unhandled,
    path,
    field: 'root',
    problem: `Unhandled failure: ${causeMessage(error) ?? String(error)}`,
    rerun,
    fix: 'Treat this as a validation failure: report the command and its arguments.',
  });

/** Build a diagnostic from a prompt-load failure, keeping its coded contract. */
const diagnosticOfPromptError = (error: PromptError, rerun: string): SizingDiagnostic =>
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
const modeRefusalDiagnostic = (refusal: ModeRefusal, rerun: string): SizingDiagnostic =>
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
const diagnosticOfDefect = (
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

/** Pairs of label and value a diagnostic prints, in canonical order. */
const diagnosticRows = (
  found: SizingDiagnostic,
  verbose: boolean,
): ReadonlyArray<readonly [string, string]> => {
  const rows: Array<readonly [string, string]> = [
    ['code', found.warning === true ? `! ${found.code}` : found.code],
    ['path', found.path],
    ['field', found.field],
    ['problem', found.problem],
  ];
  if (found.expected !== undefined) rows.push(['expected', found.expected]);
  if (found.actual !== undefined) rows.push(['actual', found.actual]);
  if (found.fix !== undefined) rows.push(['fix', found.fix]);
  if (found.cause !== undefined) rows.push(['cause', causeChain(found.cause)]);
  if (verbose && found.layers !== undefined) rows.push(['layers', layerText(found.layers)]);
  if (verbose && found.stack !== undefined) rows.push(['stack', found.stack]);
  rows.push(['next', found.next]);
  return rows;
};

/** Label column width across every diagnostic field. */
const DIAGNOSTIC_LABEL_WIDTH = 8;

/**
 * Render one diagnostic, one labelled line per field. A labelled block stays
 * greppable and never echoes a thrown exception or raw JSON.
 * @param found - the diagnostic
 * @param verbose - include the stack of an internal defect
 * @returns the display text
 */
export const renderDiagnostic = (found: SizingDiagnostic, verbose = false): string =>
  diagnosticRows(found, verbose)
    .map(([label, value]) => `${label.padEnd(DIAGNOSTIC_LABEL_WIDTH)} ${value}`)
    .join('\n');

/**
 * Render several diagnostics, separated by a blank line.
 * @param diagnostics - the diagnostics, in discovery order
 * @param verbose - include stacks
 * @returns the display text
 */
export const renderDiagnostics = (
  diagnostics: ReadonlyArray<SizingDiagnostic>,
  verbose = false,
): string => diagnostics.map((found) => renderDiagnostic(found, verbose)).join('\n\n');

/** Indent every line of a rendered block. */
const indentBlock = (text: string, indent: string): string =>
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
const nestConfig = (path: string, issues: ReadonlyArray<Issue>): ReadonlyArray<Issue> =>
  issues.map((found) => ({ ...found, field: `${path}${NESTED_FIELD_SEPARATOR}${found.field}` }));

/** A finding being filled in, so absent optional fields stay absent. */
interface SizingIssue {
  code: string;
  field: string;
  message: string;
  expected?: string;
  actual?: string;
  fix?: string;
  cause?: unknown;
}

/** Build an `Issue` from an engine failure that verification should have caught. */
const issueOfSizingError = (error: SizingError): Issue => {
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
interface LoadedLayer {
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
const loadRepoLayer = (
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
export interface ModelsOptions {
  /** Keep one provider; a miss is a diagnostic, not an empty table. */
  readonly provider?: string | undefined;
  /** Print the stable JSON document instead of the table. */
  readonly json?: boolean | undefined;
  /** Read a catalogue file instead of the host port. */
  readonly catalog?: string | undefined;
  /** Cross-check config entries instead of listing the catalogue. */
  readonly verify?: boolean | undefined;
  /** Spec whose config is verified; omitted verifies the repo config only. */
  readonly name?: string | undefined;
}

/** One model-catalogue run: text to print and the exit code it implies. */
export interface ModelsRun {
  readonly output: string;
  readonly exitCode: number;
}

/** Diagnostic for a models run outside a host with no `--catalog`. */
const modelsUnavailableDiagnostic = (): SizingDiagnostic =>
  diagnostic({
    code: Catalogue.CODES.unavailable,
    path: 'models',
    field: 'catalog',
    problem: 'No host model catalogue is available.',
    rerun: 'mf-specs models --catalog <path>',
    expected: '--catalog <path>, or the host model port',
    actual: 'no catalogue source',
    fix: 'Pass --catalog <path> with the output of `mf-specs models --json` from a host, or run /specs models.',
  });

/** Diagnostic for a catalogue file that is unreadable or malformed. */
const malformedCatalogueDiagnostic = (path: string, found: Issue): SizingDiagnostic =>
  diagnostic({
    code: found.code ?? Catalogue.CODES.malformedCatalog,
    path,
    field: found.field,
    problem: found.message,
    rerun: 'mf-specs models --catalog <path>',
    expected: found.expected,
    actual: found.actual,
    fix: found.fix,
    cause: found.cause,
  });

/** Diagnostic for a `--provider` filter that matches nothing. */
const unknownProviderDiagnostic = (
  provider: string,
  catalogue: Catalogue.Catalogue,
): SizingDiagnostic => {
  const providers = Catalogue.providersOf(catalogue);
  const expected =
    providers.length === 0 ? 'a provider the host reports' : `one of ${providers.join(', ')}`;
  return diagnostic({
    code: Catalogue.CODES.unknownProvider,
    path: 'models',
    field: 'provider',
    problem: `Provider '${provider}' has no models.`,
    rerun: 'mf-specs models',
    expected,
    actual: provider,
    fix:
      providers.length === 0
        ? 'Run `mf-specs models` to see the providers this host reports.'
        : `Pass --provider with one of ${providers.join(', ')}, or omit --provider.`,
  });
};

/** Read the catalogue from `--catalog`, the host port, or fail unavailable. */
const readCatalogue = (
  catalog: string | undefined,
  source: Catalogue.ModelSource | undefined,
): Effect.Effect<Catalogue.Catalogue, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (catalog !== undefined && catalog !== '') {
      const fs = yield* FileSystem.FileSystem;
      const text = yield* fs.readFileString(catalog).pipe(
        Effect.mapError(
          (cause) =>
            new SurfaceError({
              operation: 'SpecsModels',
              diagnostics: [
                diagnostic({
                  code: Catalogue.CODES.malformedCatalog,
                  path: catalog,
                  field: 'file',
                  problem: `Cannot read catalogue file '${catalog}'.`,
                  rerun: 'mf-specs models --catalog <path>',
                  expected: 'a readable JSON catalogue',
                  actual: 'unreadable file',
                  fix: 'Pass --catalog with a readable file path, or generate one with `mf-specs models --json`.',
                  cause,
                }),
              ],
            }),
        ),
      );
      const decoded = Catalogue.decode(text, catalog);
      if (EffectResult.isFailure(decoded)) {
        return yield* Effect.fail(
          new SurfaceError({
            operation: 'SpecsModels',
            diagnostics: [malformedCatalogueDiagnostic(catalog, decoded.failure)],
          }),
        );
      }
      return decoded.success;
    }
    if (source !== undefined) {
      const models = yield* source.list();
      const defaultModel = yield* source.default();
      return Catalogue.normalize(models, defaultModel);
    }
    return yield* Effect.fail(
      new SurfaceError({
        operation: 'SpecsModels',
        diagnostics: [modelsUnavailableDiagnostic()],
      }),
    );
  });

/** Load and filter the catalogue; a provider miss fails with a diagnostic. */
export const loadCatalogue = (
  options: Pick<ModelsOptions, 'catalog' | 'provider'>,
  source?: Catalogue.ModelSource,
): Effect.Effect<Catalogue.Catalogue, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const catalogue = yield* readCatalogue(options.catalog, source);
    const provider = options.provider;
    const filtered =
      provider === undefined || provider.trim() === ''
        ? catalogue
        : Catalogue.filterProvider(catalogue, provider);
    if (provider !== undefined && provider.trim() !== '' && filtered.models.length === 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecsModels',
          diagnostics: [unknownProviderDiagnostic(provider, catalogue)],
        }),
      );
    }
    return filtered;
  });

/** A catalogued listing: the filtered catalogue and its rendered document. */
export interface ModelsListReport {
  readonly catalogue: Catalogue.Catalogue;
  readonly output: string;
}

/**
 * List the catalogue as the stable JSON document or the one-line-per-model
 * table. No host state, no store, no dates.
 */
export const listModels = (
  options: ModelsOptions,
  source?: Catalogue.ModelSource,
): Effect.Effect<ModelsListReport, SurfaceError, FileSystem.FileSystem> =>
  loadCatalogue(options, source).pipe(
    Effect.map((catalogue) => ({
      catalogue,
      output:
        options.json === true ? Catalogue.toJson(catalogue) : Catalogue.renderTable(catalogue),
    })),
  );

/** Repo-level config only: the same load `models --verify` uses without a name. */
const loadRepoSizing = (
  root: string,
): Effect.Effect<SizingLoad, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const layer = yield* loadRepoLayer(root);
    if (layer.file === undefined) return NO_SIZING;
    return { files: [layer.file], repo: layer.config, spec: undefined, issues: layer.issues };
  });

/** Every model entry a loaded config defines, with its file and field. */
const configEntries = (
  load: SizingLoad,
  name: string | undefined,
): ReadonlyArray<Catalogue.ConfigEntry> => {
  const entries: Array<Catalogue.ConfigEntry> = [];
  const pushSizes = (path: string, prefix: string, sizes: SizeMap): void => {
    for (const size of SIZES) {
      const entry = sizes[size];
      if (entry === undefined) continue;
      entries.push(
        entry.effort === undefined
          ? { path, field: `${prefix}.${size}`, model: entry.model }
          : { path, field: `${prefix}.${size}`, model: entry.model, effort: entry.effort },
      );
    }
  };
  if (load.repo !== undefined) pushSizes(CONFIG_FILE, 'sizes', load.repo.sizes);
  if (load.spec !== undefined && name !== undefined) {
    const path = `${name}/${CONFIG_FILE}`;
    pushSizes(path, 'sizes', load.spec.sizes);
    const phases = load.spec.phases ?? {};
    for (const phase of Object.keys(phases).toSorted()) {
      const config = phases[phase];
      if (config !== undefined) pushSizes(path, `phases.${phase}.sizes`, config.sizes);
    }
  }
  return entries;
};

/** Render catalogue findings through the same agent-first diagnostic shape. */
export const renderModelFindings = (
  findings: ReadonlyArray<Catalogue.ConfigFinding>,
  rerun: string,
): string => {
  if (findings.length === 0) return '\u2713 no model or effort findings';
  const diagnostics = findings.map((found) =>
    diagnostic({
      code: found.code,
      path: found.path,
      field: found.field,
      problem: found.message,
      rerun,
      expected: found.expected,
      actual: found.actual,
      fix: found.fix,
      warning: true,
    }),
  );
  const unknownModels = findings.filter(
    (found) => found.code === Catalogue.CODES.unknownModel,
  ).length;
  const unknownEfforts = findings.filter(
    (found) => found.code === Catalogue.CODES.unknownEffort,
  ).length;
  const counts = [
    `${findings.length} warning${findings.length === 1 ? '' : 's'}`,
    ...(unknownModels === 0
      ? []
      : [`${unknownModels} unknown model${unknownModels === 1 ? '' : 's'}`]),
    ...(unknownEfforts === 0
      ? []
      : [`${unknownEfforts} unknown effort${unknownEfforts === 1 ? '' : 's'}`]),
  ];
  return `${renderDiagnostics(diagnostics)}\n\n${counts.join(' \u00b7 ')}`;
};

/** A verification run: the catalogue, its warnings, and the rendered report. */
export interface ModelsVerifyReport {
  readonly catalogue: Catalogue.Catalogue;
  readonly findings: ReadonlyArray<Catalogue.ConfigFinding>;
  readonly output: string;
  readonly exitCode: number;
}

/**
 * Cross-check the repo config and, when named, the spec config including every
 * phase override. Warnings never fail the run; malformed catalogues and
 * invalid config files do.
 */
export const verifyModels = (
  root: string,
  options: Pick<ModelsOptions, 'name' | 'catalog' | 'provider'>,
  source?: Catalogue.ModelSource,
): Effect.Effect<
  ModelsVerifyReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const catalogue = yield* loadCatalogue(
      { catalog: options.catalog, provider: options.provider },
      source,
    );
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecsModelsVerify',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    const name = options.name === undefined || options.name === '' ? undefined : options.name;
    if (name !== undefined && !(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecsModelsVerify',
          diagnostics: [unknownSpecDiagnostic(name)],
        }),
      );
    }
    const load =
      name === undefined
        ? yield* loadRepoSizing(root)
        : yield* Effect.gen(function* () {
            const snapshot = yield* store.snapshot(root, name);
            return yield* loadSizing(root, name, snapshot);
          });
    const errors = load.issues.filter(isError);
    const rerun =
      name === undefined ? 'mf-specs models --verify' : `mf-specs models --verify --name ${name}`;
    if (errors.length > 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecsModelsVerify',
          diagnostics: errors.map((found) => diagnosticOfIssue('', found, rerun)),
        }),
      );
    }
    const provider = options.provider?.trim();
    const entries = configEntries(load, name).filter(
      (entry) =>
        provider === undefined || provider === '' || entry.model.startsWith(`${provider}/`),
    );
    const findings = Catalogue.verify(catalogue, entries);
    return {
      catalogue,
      findings,
      output: renderModelFindings(findings, rerun),
      exitCode: 0,
    };
  });

/** Diagnostic for `--json`, which only the listing path can produce. */
const verifyJsonDiagnostic = (options: ModelsOptions): SizingDiagnostic => {
  const flags = ['mf-specs models --verify'];
  if (options.provider !== undefined && options.provider.trim() !== '') {
    flags.push(`--provider ${options.provider.trim()}`);
  }
  if (options.catalog !== undefined && options.catalog !== '') {
    flags.push(`--catalog ${options.catalog}`);
  }
  if (options.name !== undefined && options.name.trim() !== '') {
    flags.push(`--name ${options.name.trim()}`);
  }
  return diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: 'models',
    field: '--json',
    problem: '--json has no meaning with --verify.',
    rerun: flags.join(' '),
    expected: '--json on the listing path, or --verify without it',
    actual: '--json --verify',
    fix: `Drop --json to verify: ${flags.join(' ')}.`,
  });
};

/**
 * `mf-specs models`: list the catalogue or verify config entries. The binary
 * has no host port, so it must receive `--catalog`; the slash form and the
 * `spec_models` tool pass the host's model port instead.
 */
export const models = (
  root: string,
  options: ModelsOptions,
  source?: Catalogue.ModelSource,
): Effect.Effect<
  ModelsRun,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    if (options.verify === true) {
      if (options.json === true) {
        return yield* Effect.fail(
          new SurfaceError({
            operation: 'SpecsModels',
            diagnostics: [verifyJsonDiagnostic(options)],
          }),
        );
      }
      const report = yield* verifyModels(
        root,
        { name: options.name, catalog: options.catalog, provider: options.provider },
        source,
      );
      return { output: report.output, exitCode: report.exitCode };
    }
    const report = yield* listModels(options, source);
    return { output: report.output, exitCode: 0 };
  });

/** One task's declared size and resolved dispatch target. */
export interface TaskTarget {
  readonly size: Size | undefined;
  /** `provider/model#effort`, or `inherit`. */
  readonly target: string;
  /** Winning layer; absent when the target is `inherit`. */
  readonly source?: Layer;
}

/** The config layers that apply to a task in `phase`. */
const configSet = (load: SizingLoad, phase: string): ConfigSet => ({
  repo: load.repo,
  spec: load.spec,
  phase,
});

/**
 * Resolve one task's target from its declared size and its phase's overrides.
 * A task with no declared size, or with one the contract does not know,
 * inherits; the dispatch surfaces fail before printing a target in that case.
 * @param load - the loaded config layers
 * @param task - parsed task
 * @returns the size, target, and winning layer
 */
const taskTarget = (load: SizingLoad, task: Task): TaskTarget => {
  const size = sizeOf(task);
  if (size === undefined) return { size: undefined, target: INHERIT };
  const resolved = resolveSizing(configSet(load, phaseOf(task.id)), size);
  const base = { size, target: resolved.target };
  return resolved.source === undefined ? base : { ...base, source: resolved.source };
};

/** Render the size, target, and source columns of a task line. */
const targetColumns = (target: TaskTarget | undefined): string => {
  if (target === undefined) return '';
  const source = target.source === undefined ? '' : `  ${target.source}`;
  return `  ${target.size ?? '-'}  ${target.target}${source}`;
};

/** The distinct sizes of a phase's own tasks, in canonical order. */
const phaseSizes = (tasks: ReadonlyArray<Task>): ReadonlyArray<Size> =>
  SIZES.filter((size) => tasks.some((task) => task.type !== 'review' && task.size === size));

/** Task-size error findings inside a verified tree. */
const taskSizeErrorsOf = (verify: Result): ReadonlyArray<Issue> =>
  verify.issues.filter((found) => isError(found) && isTaskSizeCode(found.code));

/**
 * Every error a dispatch surface must not paper over: config findings plus
 * task-size findings. `next` / `status` gate their targets and exit code on
 * these, so both agree with `check` about a tree that cannot be dispatched.
 */
const dispatchErrors = (load: SizingLoad, verify: Result): ReadonlyArray<Issue> => [
  ...load.issues.filter(isError),
  ...taskSizeErrorsOf(verify),
];

/** Render the dispatch-blocking errors as agent-first diagnostics. */
export const dispatchErrorText = (load: SizingLoad, verify: Result, name: string): string => {
  const rerun = `mf-specs check --name ${name}`;
  return renderDiagnostics(
    dispatchErrors(load, verify).map((found) =>
      diagnosticOfIssue(isSizingCode(found.code) ? '' : name, found, rerun),
    ),
  );
};

/**
 * Exit code a `status` / `next` report implies: `1` when a config or task-size
 * error blocks dispatch, else `0`. Both surfaces share it so they agree with
 * each other and with `check` about the same tree.
 */
export const dispatchExitCode = (load: SizingLoad, verify: Result): number =>
  dispatchErrors(load, verify).length === 0 ? 0 : VALIDATION_EXIT_CODE;

/** Diagnostic for a spec that does not exist. */
const unknownSpecDiagnostic = (name: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.unknownSpec,
    path: name,
    field: 'name',
    problem: `Spec '${name}' not found.`,
    rerun: 'mf-specs list',
    fix: 'Pass a spec directory name that exists under the specs root.',
  });

/** Diagnostic for a task id that a spec does not hold. */
const unknownTaskDiagnostic = (name: string, taskId: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.unknownTask,
    path: `${name}/${taskId}`,
    field: 'id',
    problem: `Task '${taskId}' not found in spec '${name}'.`,
    rerun: `mf-specs status --name ${name}`,
    fix: `Pass a task id listed under Phase in \`mf-specs status --name ${name}\`.`,
  });

/** Review cycles one task contributes to its phase, or `0` when it cannot. */
const contribution = (task: Task): number => {
  const size = sizeOf(task);
  return task.type === 'review' || size === undefined ? 0 : reviewCycles(size);
};

/** Review-budget input for a task: its type plus the size a resolver can act on. */
const budgetInput = (task: Task) => ({ type: task.type, size: sizeOf(task) });

/** One task's sizing picture: target, provenance, and review budgets. */
export interface SizingReport {
  readonly name: string;
  readonly task: Task;
  readonly phase: string;
  readonly target: TaskTarget;
  /** Review cycles the task's own size buys. */
  readonly budget: number;
  /** Review budget of the task's whole phase. */
  readonly phaseBudget: number;
  readonly load: SizingLoad;
}

/** Parse every task under a spec snapshot, in id order. */
const tasksOf = (snapshot: SpecSnapshot): ReadonlyArray<Task> => {
  const tasks: Array<Task> = [];
  for (const file of snapshot.files) {
    if (!file.path.endsWith('/TASK.md')) continue;
    const task = parseTaskFile(file.content);
    if (task !== undefined) tasks.push(task);
  }
  return tasks.toSorted((a, b) => a.id.localeCompare(b.id));
};

/** The task directory a snapshot holds for `id`, when one parses. */
const taskDirOf = (snapshot: SpecSnapshot, id: string): string | undefined => {
  for (const file of snapshot.files) {
    if (!file.path.endsWith('/TASK.md')) continue;
    const dir = file.path.slice(0, file.path.indexOf('/'));
    if (parseTaskDirName(dir)?.id === id) return dir;
  }
  return undefined;
};

/** The `TASK.md` path a spec's task lives at, for a diagnostic's `path` row. */
const taskFileOf = (name: string, dir: string | undefined): string =>
  dir === undefined ? name : `${name}/${dir}/TASK.md`;

/** Error findings the size rule reports for one parsed task. */
const taskSizeErrors = (task: Task): ReadonlyArray<Issue> =>
  verifyTaskSize(task.size, task.status).filter(isError);

/**
 * Inspect one task's sizing: its declared size, resolved target, winning
 * layer, and review budgets. Fails with diagnostics for an unknown spec, an
 * unknown task, an invalid config, or a task whose own size is missing or
 * unknown — the same rule `check` applies, so `resolve`/`sizing` can never
 * hand an orchestrator a target for an undispatchable task.
 * @param root - spec root directory
 * @param name - spec directory name
 * @param taskId - task id to inspect
 * @returns the sizing picture
 */
export const sizingOf = (
  root: string,
  name: string,
  taskId: string,
): Effect.Effect<SizingReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecSizing';
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({ operation, reason: `Specs directory not found: ${root}` }),
      );
    }
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({ operation, diagnostics: [unknownSpecDiagnostic(name)] }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const load = yield* loadSizing(root, name, snapshot);
    const tasks = tasksOf(snapshot);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (task === undefined) {
      return yield* Effect.fail(
        new SurfaceError({ operation, diagnostics: [unknownTaskDiagnostic(name, taskId)] }),
      );
    }
    const rerun = `mf-specs check --name ${name}`;
    const errors = load.issues.filter(isError);
    if (errors.length > 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation,
          diagnostics: errors.map((found) => diagnosticOfIssue('', found, rerun)),
        }),
      );
    }
    const sizeErrors = taskSizeErrors(task);
    if (sizeErrors.length > 0) {
      const base = taskFileOf(name, taskDirOf(snapshot, task.id));
      return yield* Effect.fail(
        new SurfaceError({
          operation,
          diagnostics: sizeErrors.map((found) => diagnosticOfIssue(base, found, rerun)),
        }),
      );
    }
    const phase = phaseOf(task.id);
    const size = sizeOf(task);
    return {
      name,
      task,
      phase,
      target: taskTarget(load, task),
      budget: size === undefined ? 0 : reviewCycles(size),
      phaseBudget: phaseReviewBudget(
        tasks.filter((candidate) => phaseOf(candidate.id) === phase).map(budgetInput),
      ),
      load,
    };
  });

/**
 * Render the compact `sizing` line: task id, declared size, target, and the
 * winning layer when the target is not `inherit`.
 * @param report - report from {@link sizingOf}
 * @returns one line
 */
export const renderSizing = (report: SizingReport): string => {
  const source = report.target.source === undefined ? '' : `  ${report.target.source}`;
  return `${report.task.id}  ${report.target.size ?? '-'}  ${report.target.target}${source}`;
};

/** One size's target in one layer, or a marker for an absent layer or size. */
const layerEntryCell = (config: { readonly sizes: SizeMap } | undefined, size: Size): string => {
  if (config === undefined) return 'absent';
  const entry = config.sizes[size];
  return entry === undefined ? '-' : targetOf(entry);
};

/** One cell of the provenance matrix. */
const layerCell = (load: SizingLoad, size: Size, layer: Layer, phase: string): string =>
  Match.value(layer).pipe(
    Match.when('repo', () => layerEntryCell(load.repo, size)),
    Match.when('spec', () => layerEntryCell(load.spec, size)),
    Match.when('phase', () => layerEntryCell(load.spec?.phases?.[phase], size)),
    Match.exhaustive,
  );

/**
 * Render the detailed `sizing` report: the declared size, selected target and
 * layer, the review budgets, then a size-by-layer provenance matrix covering
 * all four sizes and every config layer.
 * @param report - report from {@link sizingOf}
 * @returns the multi-line report
 */
export const renderSizingReport = (report: SizingReport): string => {
  const { target, task } = report;
  const source = target.source === undefined ? '' : ` · source ${target.source}`;
  const head = `${task.id} · declared ${target.size ?? 'none'} · target ${target.target}${source}`;
  const budget = `budget ${report.budget} · contributes ${contribution(task)} · phase ${report.phase} budget ${report.phaseBudget}`;
  const header: ReadonlyArray<string> = ['size', ...LAYERS, 'winner'];
  const rows: ReadonlyArray<ReadonlyArray<string>> = SIZES.map((size) => [
    size,
    layerCell(report.load, size, 'repo', report.phase),
    layerCell(report.load, size, 'spec', report.phase),
    layerCell(report.load, size, 'phase', report.phase),
    resolveSizing(configSet(report.load, report.phase), size).source ?? INHERIT,
  ]);
  const widths = header.map((label, index) =>
    Math.max(label.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const line = (cells: ReadonlyArray<string>): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd();
  return [head, budget, '', line(header), ...rows.map(line)].join('\n');
};

/** Render `sizing`, selecting the detailed report for `--verbose` / `--human`. */
export const renderSizingMode = (report: SizingReport, detailed: boolean): string =>
  detailed ? renderSizingReport(report) : renderSizing(report);

/** Which file paths a load found, marking an absent layer explicitly. */
const configFilesLine = (load: SizingLoad): string => {
  if (load.files.length === 0) return 'sizing none';
  const repo = load.files.find((file) => file === CONFIG_FILE) ?? 'none';
  const spec = load.files.find((file) => file !== CONFIG_FILE) ?? 'none';
  return `sizing repo ${repo} · spec ${spec}`;
};

// ─── Check ────────────────────────────────────────────────────────────

/** Verification outcome for one spec. */
export interface CheckSpec {
  readonly name: string;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Issue>;
}

/** Whole-run check result. */
export interface CheckReport {
  readonly root: string;
  readonly specs: ReadonlyArray<CheckSpec>;
  /** Findings from the repo-level `sizing.json`, verified once for the run. */
  readonly rootIssues: ReadonlyArray<Issue>;
  /** Specs with at least one error-severity issue (warnings never count here). */
  readonly failed: number;
  /** Total error-severity findings across the root config and every spec. */
  readonly issueCount: number;
  /** Total warning-severity findings, counted apart from issues. */
  readonly warningCount: number;
}

/** Options for {@link check}. */
export interface CheckOptions {
  /** Check only this spec directory instead of the whole root. */
  readonly name?: string;
  /** Specs verified concurrently. */
  readonly concurrency?: number;
  /** Promote warnings to errors, so an advisory finding fails the check. */
  readonly strict?: boolean;
}

/** One spec's findings, before reduction into a report. */
export interface CheckEntry {
  readonly name: string;
  readonly issues: ReadonlyArray<Issue>;
}

/**
 * Reduce per-spec findings into a {@link CheckReport}. `strict` promotes every
 * warning to an error first, so a warning fails the run only under `--strict`.
 * Pure — the caller supplies the findings.
 * @param root - spec root directory
 * @param entries - one entry per spec, in output order
 * @param strict - promote warnings to errors
 * @param rootIssues - findings from the repo-level config
 * @returns the aggregated report
 */
export const reduceCheck = (
  root: string,
  entries: ReadonlyArray<CheckEntry>,
  strict: boolean,
  rootIssues: ReadonlyArray<Issue> = [],
): CheckReport => {
  const effectiveRoot = strict ? promoteWarnings(rootIssues) : rootIssues;
  const specs = entries.map(({ name, issues }): CheckSpec => {
    const effective = strict ? promoteWarnings(issues) : issues;
    return { name, valid: noErrors(effective), issues: effective };
  });
  return {
    root,
    specs,
    rootIssues: effectiveRoot,
    failed: specs.filter((spec) => !spec.valid).length,
    issueCount:
      specs.reduce((sum, spec) => sum + errorCount(spec.issues), 0) + errorCount(effectiveRoot),
    warningCount:
      specs.reduce((sum, spec) => sum + warningCount(spec.issues), 0) + warningCount(effectiveRoot),
  };
};

/** Process exit code a check report implies: `0` when nothing failed, else `1`. */
export const checkExitCode = (report: CheckReport): number =>
  report.failed > 0 || errorCount(report.rootIssues) > 0 ? VALIDATION_EXIT_CODE : 0;

/** Finding codes whose resolution depends on the task's phase overrides. */
const TASK_SIZE_CODES: ReadonlySet<string> = new Set([CODES.missingSize, CODES.unknownTaskSize]);

/** A phase id inside a config field, e.g. `phases.A.sizes`. */
const CONFIG_PHASE_KEY = /phases\.([^.\s:]+)/;

const isSizingCode = (code: string | undefined): boolean =>
  code !== undefined && code.startsWith('sizing.');

const isTaskSizeCode = (code: string | undefined): boolean =>
  code !== undefined && TASK_SIZE_CODES.has(code);

/** Nested field of a finding that concerns a config file's root. */
const nestedRootField = (path: string): string => `${path}${NESTED_FIELD_SEPARATOR}root`;

/**
 * Path of a failing file relative to its spec directory, so a per-spec read
 * failure names the file instead of repeating the spec name. Falls back to the
 * spec name when the store did not report a path.
 */
const specRelativePath = (root: string, name: string, path: string | undefined): string => {
  if (path === undefined) return name;
  const absolute = `${root}/${name}/`;
  if (path.startsWith(absolute)) return path.slice(absolute.length);
  if (path.startsWith(`${name}/`)) return path.slice(name.length + 1);
  return path;
};

/**
 * Build the finding a failed per-spec read becomes. A failure reading the spec
 * directory itself reports the spec as the path; a failure on one file reports
 * that file relative to the spec, so `path` names the file exactly once.
 */
const specReadIssue = (
  root: string,
  name: string,
  error: SpecStore.StoreError,
  layers: LayerTrace,
): Issue => {
  if (error.path === `${root}/${name}`) {
    const found: Issue = {
      code: SURFACE_CODES.store,
      field: 'root',
      message: error.reason,
      fix: 'Check --dir and that the spec directory is readable.',
      layers,
    };
    return error.cause === undefined ? found : { ...found, cause: error.cause };
  }
  return storeIssue(specRelativePath(root, name, error.path), error, layers);
};

/**
 * Build the finding a failed config read becomes, so `check` can keep
 * aggregating instead of aborting on a permission or mount problem.
 */ const storeIssue = (
  path: string,
  error: SpecStore.StoreError,
  layers: LayerTrace = { consulted: ['repo'], layer: 'repo' },
): Issue => {
  const found: Issue = {
    code: SURFACE_CODES.store,
    field: nestedRootField(path),
    message: error.reason,
    fix: 'Check --dir and that the file is readable.',
    layers,
  };
  return error.cause === undefined ? found : { ...found, cause: error.cause };
};

/**
 * Attach the repo config layer trace to a finding. A repo config is the least
 * specific layer; it has no phase overrides.
 */
const withRepoLayers = (found: Issue): Issue =>
  isSizingCode(found.code) ? { ...found, layers: { consulted: ['repo'], layer: 'repo' } } : found;

/**
 * Attach the layer trace to a spec finding: config findings name the file's
 * layer (spec, or phase for a nested override), task-size findings name every
 * layer consulted plus the task's phase.
 */
const withSpecLayers = (found: Issue): Issue => {
  if (isSizingCode(found.code)) {
    const key = CONFIG_PHASE_KEY.exec(found.field)?.[1];
    const phase = key !== undefined && PHASE_PATTERN.test(key) ? key : undefined;
    return phase === undefined
      ? { ...found, layers: { consulted: ['repo', 'spec'], layer: 'spec' } }
      : {
          ...found,
          layers: { consulted: LAYERS, layer: 'phase', phase },
        };
  }
  if (isTaskSizeCode(found.code)) {
    const phase = taskPhaseInField(found.field);
    return {
      ...found,
      layers: phase === undefined ? { consulted: LAYERS } : { consulted: LAYERS, phase },
    };
  }
  return found;
};

/** Phase of the task a nested `TASK.md` field belongs to, e.g. `A001-build`. */
const taskPhaseInField = (field: string): string | undefined => {
  const slash = field.indexOf('/');
  return slash === -1 ? undefined : parseTaskDirName(field.slice(0, slash))?.phase;
};

/**
 * Mechanically verify every spec under `root` (or one `name`). Each
 * spec is a pure `verifySpecTree` over its snapshot, so the
 * specs run concurrently. Never fails on a bad spec — bad specs
 * become failing entries; only IO failures fail. Warnings are advisory
 * unless `strict` promotes them.
 * @param root - spec root directory
 * @param options - optional single-spec, concurrency, and strictness controls
 * @returns the aggregated report
 */
export const check = (
  root: string,
  options: CheckOptions = {},
): Effect.Effect<CheckReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const strict = options.strict ?? false;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecCheck',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    const repoText = yield* store.readRootFile(root, CONFIG_FILE).pipe(
      Effect.matchEffect({
        onFailure: (error) => Effect.succeed({ text: undefined, error }),
        onSuccess: (text) => Effect.succeed({ text, error: undefined }),
      }),
    );
    const rootIssues: Array<Issue> =
      repoText.error !== undefined
        ? [storeIssue(CONFIG_FILE, repoText.error)]
        : repoText.text === undefined
          ? []
          : nestConfig(
              CONFIG_FILE,
              verifySizingText({ path: CONFIG_FILE, kind: 'repo' }, repoText.text).issues,
            ).map(withRepoLayers);
    if (options.name !== undefined && !(yield* store.exists(root, options.name))) {
      const issues: ReadonlyArray<Issue> = [
        { field: options.name, message: `Spec directory not found under ${root}.` },
      ];
      return reduceCheck(root, [{ name: options.name, issues }], strict, rootIssues);
    }
    const names = options.name !== undefined ? [options.name] : yield* store.names(root);
    const entries = yield* Effect.forEach(
      names,
      (name) =>
        store.snapshot(root, name).pipe(
          Effect.map((snapshot): CheckEntry => {
            const result = verifySpecTree(snapshot);
            return { name, issues: result.issues.map(withSpecLayers) };
          }),
          Effect.catchTag('@montflow/SpecStoreError', (error): Effect.Effect<CheckEntry> =>
            Effect.succeed({
              name,
              issues: [specReadIssue(root, name, error, { consulted: LAYERS })],
            }),
          ),
        ),
      { concurrency: options.concurrency ?? DEFAULT_CONCURRENCY },
    );
    return reduceCheck(root, entries, strict, rootIssues);
  });

/**
 * The `(…)` count suffix on a check spec line, naming errors and warnings apart.
 */
const checkCounts = (errors: number, warnings: number): string => {
  if (warnings === 0) return errors === 0 ? '' : ` (${errors})`;
  const parts: Array<string> = [];
  if (errors > 0) parts.push(`${errors} issue${errors === 1 ? '' : 's'}`);
  parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  return ` (${parts.join(' \u00b7 ')})`;
};

/**
 * Render findings for one file or spec: coded sizing findings as the full
 * agent-first diagnostic, legacy findings as the terse `field: message` line.
 * The compact form omits the cause chain and layer trace; `verbose` adds them.
 * @param base - spec name for nested paths, or `''` when the field already
 * carries the full path
 * @param issues - findings in discovery order
 * @param rerun - command to name in each coded finding
 * @param verbose - add the cause chain and the sizing layer trace
 * @returns the display lines
 */
const renderIssueBlocks = (
  base: string,
  issues: ReadonlyArray<Issue>,
  rerun: string,
  verbose: boolean,
): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  for (const found of issues) {
    if (found.code === undefined) {
      lines.push(`${isWarning(found) ? '  ! ' : '  '}${found.field}: ${found.message}`);
      if (found.fix !== undefined) lines.push(`    Fix: ${found.fix}`);
      continue;
    }
    const full = diagnosticOfIssue(base, found, rerun, verbose);
    lines.push(...indentBlock(renderDiagnostic(full, verbose), '  ').split('\n'));
  }
  return lines;
};

/**
 * Render a check report. Token-lean by default — failures and warnings, plus a
 * one-line summary. `verbose` also lists passing specs and the root, and adds
 * each sizing finding's cause chain and layer trace. Warnings render with a `!`
 * mark, counted apart from issues, and never fail a spec. The repo-level
 * `sizing.json` is reported first, then each spec.
 * @param report - report from {@link check}
 * @param verbose - include passing specs, the root path, causes, and layer traces
 * @returns the display text
 */
export const renderCheck = (report: CheckReport, verbose: boolean): string => {
  const lines: Array<string> = [];
  if (verbose) lines.push(`root ${report.root}`);
  if (report.rootIssues.length > 0) {
    const errors = errorCount(report.rootIssues);
    const warnings = warningCount(report.rootIssues);
    lines.push(
      `${errors === 0 ? '\u2713' : '\u2717'} ${CONFIG_FILE}${checkCounts(errors, warnings)}`,
    );
    lines.push(...renderIssueBlocks('', report.rootIssues, 'mf-specs check', verbose));
  }
  for (const spec of report.specs) {
    const errors = errorCount(spec.issues);
    const warnings = warningCount(spec.issues);
    if (spec.valid && warnings === 0 && !verbose) continue;
    lines.push(`${spec.valid ? '\u2713' : '\u2717'} ${spec.name}${checkCounts(errors, warnings)}`);
    lines.push(
      ...renderIssueBlocks(spec.name, spec.issues, `mf-specs check --name ${spec.name}`, verbose),
    );
  }
  if (lines.length > 0) lines.push('');
  const specCount = report.specs.length;
  const rootErrors = errorCount(report.rootIssues);
  const rootWarnings = warningCount(report.rootIssues);
  const units = [`${specCount} spec${specCount === 1 ? '' : 's'}`];
  if (rootErrors > 0 || rootWarnings > 0) units.push('1 config');
  const failed = report.failed + (rootErrors > 0 ? 1 : 0);
  const warningSuffix =
    report.warningCount === 0
      ? ''
      : ` \u00b7 ${report.warningCount} warning${report.warningCount === 1 ? '' : 's'}`;
  lines.push(
    `${units.join(' \u00b7 ')} \u00b7 ${failed} failed \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}${warningSuffix}`,
  );
  return lines.join('\n');
};

// ─── Status ───────────────────────────────────────────────────────────

/** Status report for one spec. */
export interface StatusReport {
  readonly name: string;
  readonly spec: Spec | undefined;
  readonly tasks: ReadonlyArray<Task>;
  /** Derived lifecycle analysis; undefined when SPEC.md does not parse. */
  readonly state: Analysis | undefined;
  readonly verify: Result;
  /** Loaded sizing layers and the config files found. */
  readonly sizing: SizingLoad;
}

/**
 * Reduce one spec snapshot to a {@link StatusReport}. Pure over the
 * snapshot, so both `status` and `list` share the same summarizer.
 * `spec` / `state` are undefined when SPEC.md is missing or unparsable.
 * @param name - spec directory name
 * @param snapshot - every file under the spec root
 * @param sizing - loaded config layers; defaults to no config files
 * @returns the status report
 */
const summarize = (
  name: string,
  snapshot: SpecSnapshot,
  sizing: SizingLoad = NO_SIZING,
): StatusReport => {
  const specFile = snapshot.files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : parseSpecFile(specFile.content);
  const ordered = tasksOf(snapshot);
  return {
    name,
    spec,
    tasks: ordered,
    state:
      spec === undefined
        ? undefined
        : analyzeLifecycle({
            status: spec.status,
            lockedPhases: spec.lockedPhases,
            tasks: ordered.map((task) => ({ id: task.id, status: task.status })),
          }),
    verify: verifySpecTree(snapshot),
    sizing,
  };
};

/**
 * Read one spec and summarize it. Fails on IO, on a missing root, and with the
 * coded `spec.not-found` diagnostic when the spec does not exist.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the status report
 */
export const status = (
  root: string,
  name: string,
): Effect.Effect<StatusReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecStatus',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({ operation: 'SpecStatus', diagnostics: [unknownSpecDiagnostic(name)] }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const sizing = yield* loadSizing(root, name, snapshot);
    return summarize(name, snapshot, sizing);
  });

/** Per-status display mark, kept terse for token efficiency. */
const STATUS_MARK = {
  complete: '\u2713',
  'in-progress': '\u2022',
  pending: '\u25cb',
  blocked: '\u2717',
} satisfies Record<string, string>;

const statusCounts = (tasks: ReadonlyArray<Task>): string =>
  (['complete', 'in-progress', 'pending', 'blocked'] as const)
    .map((taskStatus) => ({
      status: taskStatus,
      count: tasks.filter((task) => task.status === taskStatus).length,
    }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.status}`)
    .join(' \u00b7 ');

/**
 * Render a human-readable status panel for one spec.
 * @param report - report from {@link status}
 * @returns the display text
 */
export const renderStatus = (report: StatusReport): string => {
  const lines: Array<string> = [];
  const spec = report.spec;
  if (spec === undefined) {
    lines.push(`${report.name} \u00b7 unreadable SPEC.md`);
  } else {
    lines.push(`${spec.name} \u00b7 ${spec.status} \u00b7 ${spec.workspaceType}`);
    if (report.state !== undefined) lines.push(`state ${report.state.state}`);
    const locked =
      spec.lockedPhases.length > 0 ? ` \u00b7 locked ${spec.lockedPhases.join(',')}` : '';
    lines.push(`author ${spec.author} \u00b7 created ${spec.created}${locked}`);
  }
  lines.push(
    `tasks ${report.tasks.length}${report.tasks.length > 0 ? ` \u00b7 ${statusCounts(report.tasks)}` : ''}`,
  );
  const errors = errorCount(report.verify.issues);
  const warnings = warningCount(report.verify.issues);
  const warningSuffix =
    warnings === 0 ? '' : ` \u00b7 ${warnings} warning${warnings === 1 ? '' : 's'}`;
  lines.push(
    `verify ${errors === 0 ? '\u2713 verified' : `\u2717 ${errors} issue${errors === 1 ? '' : 's'}`}${warningSuffix}`,
  );
  for (const found of report.verify.issues) {
    if (!isWarning(found)) continue;
    if (found.code === undefined) {
      lines.push(`  ! ${found.field}: ${found.message}`);
      if (found.fix !== undefined) lines.push(`    Fix: ${found.fix}`);
      continue;
    }
    lines.push(
      ...indentBlock(
        renderDiagnostic(
          diagnosticOfIssue(report.name, found, `mf-specs check --name ${report.name}`),
        ),
        '  ',
      ).split('\n'),
    );
  }
  if (report.state !== undefined && report.state.state === 'inconsistent') {
    for (const found of report.state.issues) lines.push(`  ${found.field}: ${found.message}`);
  }

  const sizingErrors = errorCount(report.sizing.issues);
  const configOk = sizingErrors === 0;
  lines.push(
    configOk
      ? configFilesLine(report.sizing)
      : `sizing \u2717 ${sizingErrors} issue${sizingErrors === 1 ? '' : 's'}`,
  );

  const phases = new Map<string, Array<Task>>();
  for (const task of report.tasks) {
    const phase = phaseOf(task.id);
    const bucket = phases.get(phase) ?? [];
    bucket.push(task);
    phases.set(phase, bucket);
  }
  for (const [phase, tasks] of phases) {
    const locked = report.state?.phases.find((summary) => summary.phase === phase)?.locked === true;
    const sizes = phaseSizes(tasks);
    lines.push('');
    lines.push(
      `Phase ${phase}${locked ? ' \u00b7 locked' : ''} \u00b7 budget ${phaseReviewBudget(tasks.map(budgetInput))}${sizes.length === 0 ? '' : ` \u00b7 sizes ${sizes.join(',')}`}`,
    );
    if (configOk) {
      lines.push(
        `  sizes ${SIZES.map((size) => `${size} ${resolveSizing(configSet(report.sizing, phase), size).target}`).join(' \u00b7 ')}`,
      );
    }
    for (const task of tasks) {
      // A task whose own size is missing or unknown gets no target, while a
      // valid sibling in the same phase keeps its columns.
      const target =
        configOk && taskSizeErrors(task).length === 0 ? taskTarget(report.sizing, task) : undefined;
      lines.push(
        `  ${STATUS_MARK[task.status] ?? '?'} ${task.id}  ${task.name.padEnd(24)} ${task.type}${targetColumns(target)}`,
      );
    }
  }
  return lines.join('\n');
};

// ─── State / Next ─────────────────────────────────────────────────────

/** Compact derived-state report the orchestrator reads before acting. */
export interface StateReport {
  readonly name: string;
  readonly declared: string;
  readonly state: State;
  /** Active phase: the first unlocked phase with unfinished work, if any. */
  readonly phase: string | undefined;
  readonly lockedPhases: ReadonlyArray<string>;
}

/**
 * Reduce one status report to the compact state an orchestrator acts on:
 * the declared status, the derived lifecycle state, the active phase, and the
 * locked phases. `inconsistent` means the bookkeeping contradicts itself,
 * which the caller repairs before dispatching anything.
 * @param report - status report for one spec
 * @returns the compact state report
 */
export const stateOf = (report: StatusReport): StateReport => ({
  name: report.name,
  declared: report.spec?.status ?? 'unreadable',
  state: report.state?.state ?? 'inconsistent',
  phase: activePhaseOf(report),
  lockedPhases: report.spec?.lockedPhases ?? [],
});

/**
 * Reduce one spec to the derived state an orchestrator acts on.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the compact state report
 */
export const state = (
  root: string,
  name: string,
): Effect.Effect<StateReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  status(root, name).pipe(Effect.map(stateOf));

/** The active phase from a status report: first unlocked phase with unfinished work. */
const activePhaseOf = (report: StatusReport): string | undefined =>
  report.state?.phases.find((phase) => !phase.locked && phase.complete < phase.total)?.phase;

/**
 * Render the compact state line the orchestrator reads.
 * @param report - report from {@link state}
 * @returns one status line
 */
export const renderState = (report: StateReport): string => {
  const phase = report.phase === undefined ? 'none' : report.phase;
  const locked = report.lockedPhases.length === 0 ? 'none' : report.lockedPhases.join(',');
  return `${report.name} · ${report.declared} · state ${report.state} · phase ${phase} · locked ${locked}`;
};

/** One task the orchestrator may start now. */
export interface ReadyTask {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** True when the task carries a per-task `GATES.md` that must pass first. */
  readonly gates: boolean;
  /** Declared size, resolved target, and winning layer. */
  readonly sizing: TaskTarget;
}

/** The ready set for the active phase, plus the state it was derived from. */
export interface NextReport {
  readonly name: string;
  readonly state: State;
  readonly phase: string | undefined;
  /** Review budget of the active phase; absent when there is no active phase. */
  readonly budget: number | undefined;
  /** Tasks ready to start: pending, dependencies complete, review last. */
  readonly ready: ReadonlyArray<ReadyTask>;
  /** Tree verification, so a task-size error can block dispatch. */
  readonly verify: Result;
  /** Loaded sizing layers for target resolution. */
  readonly sizing: SizingLoad;
}

/** Task ids carrying a `GATES.md`, read from the snapshot. */
const gatedTaskIds = (snapshot: SpecSnapshot): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const file of snapshot.files) {
    const slash = file.path.indexOf('/');
    if (slash === -1) continue;
    const dir = file.path.slice(0, slash);
    if (file.path !== `${dir}/GATES.md`) continue;
    const parsed = parseTaskDirName(dir);
    if (parsed !== undefined) ids.add(parsed.id);
  }
  return ids;
};

/**
 * Compute the ready set for a spec's active phase: pending tasks whose
 * `depends-on` targets are all complete, in id order. A `review` task is
 * ready only once every other task in its phase is complete. An
 * `inconsistent` or `complete` spec has no ready set — the caller repairs or
 * stops rather than guessing.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the ready set plus the derived state
 */
export const next = (
  root: string,
  name: string,
): Effect.Effect<NextReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecNext',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({ operation: 'SpecNext', diagnostics: [unknownSpecDiagnostic(name)] }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const sizing = yield* loadSizing(root, name, snapshot);
    const report = summarize(name, snapshot, sizing);
    const derived = report.state?.state ?? 'inconsistent';
    const phase = activePhaseOf(report);
    if (derived === 'inconsistent' || derived === 'complete' || phase === undefined) {
      return {
        name,
        state: derived,
        phase: undefined,
        budget: undefined,
        ready: [],
        verify: report.verify,
        sizing,
      };
    }
    const byId = new Map(report.tasks.map((task) => [task.id, task]));
    const gates = gatedTaskIds(snapshot);
    const inPhase = report.tasks.filter((task) => phaseOf(task.id) === phase);
    const ready: Array<ReadyTask> = [];
    for (const task of inPhase) {
      if (task.status !== 'pending') continue;
      const entry: ReadyTask = {
        id: task.id,
        name: task.name,
        type: task.type,
        gates: gates.has(task.id),
        sizing: taskTarget(sizing, task),
      };
      if (task.type === 'review') {
        const open = inPhase.some(
          (other) => other.type !== 'review' && other.status !== 'complete',
        );
        if (!open) ready.push(entry);
        continue;
      }
      if (task.dependsOn.every((dep) => byId.get(dep)?.status === 'complete')) ready.push(entry);
    }
    ready.sort((a, b) => a.id.localeCompare(b.id));
    return {
      name,
      state: derived,
      phase,
      budget: phaseReviewBudget(inPhase.map(budgetInput)),
      ready,
      verify: report.verify,
      sizing,
    };
  });

/**
 * Render the ready set for an orchestrator. A gated task is marked `gated`
 * so the caller runs its `GATES.md` before marking it complete. Each task
 * carries its declared size, resolved target, and winning layer, unless a
 * config or task-size error makes the phase undispatchable — then the targets
 * are omitted rather than guessed.
 * @param report - report from {@link next}
 * @returns the phase header plus one line per ready task
 */
export const renderNext = (report: NextReport): string => {
  const budget = report.budget === undefined ? '' : ` · budget ${report.budget}`;
  const head = `state ${report.state}${report.phase === undefined ? '' : ` · phase ${report.phase}`}${budget}`;
  if (report.ready.length === 0) return `${head}\nready none`;
  const configOk = noErrors(report.sizing.issues);
  return [
    head,
    ...report.ready.map((task) => {
      // A ready task with a missing or unknown size gets no target; its
      // siblings still carry theirs, and the command prints the diagnostic.
      const sized = configOk && task.sizing.size !== undefined;
      return `${task.id}  ${task.gates ? 'gated  ' : ''}${task.type}  ${task.name}${sized ? targetColumns(task.sizing) : ''}`;
    }),
  ].join('\n');
};

// ─── Which ────────────────────────────────────────────────────────────

/** Options for {@link which}. */
export interface WhichOptions {
  /** Branch to resolve instead of reading `.git`/`HEAD` (tests and CI). */
  readonly branch?: string | undefined;
  /** Workspace root that holds `.git`; defaults to the working directory. */
  readonly workspace?: string | undefined;
}

/** Drop trailing slashes so store paths join predictably. */
const trimTrailingSlash = (value: string): string =>
  value === '/' ? '' : value.replace(/\/+$/, '');

/** Read a file, reporting an unreadable or absent one as `undefined`. */
const readFileOrNone = (
  fs: FileSystem.FileSystem,
  target: string,
): Effect.Effect<string | undefined> =>
  fs.readFileString(target).pipe(
    Effect.matchEffect({
      onFailure: () => Effect.succeed(undefined),
      onSuccess: (text) => Effect.succeed(text),
    }),
  );

/** Read `<gitdir>/HEAD`, or report why no branch could be read. */
const readHead = (fs: FileSystem.FileSystem, gitDir: string): Effect.Effect<BranchSource> =>
  Effect.gen(function* () {
    const target = `${trimTrailingSlash(gitDir)}/HEAD`;
    const text = yield* readFileOrNone(fs, target);
    if (text === undefined) {
      return { kind: 'none', reason: 'unreadable-head', detail: `Cannot read '${target}'.` };
    }
    return parseHead(text);
  });

/** Read a `.git` file that names a worktree's git directory, then its `HEAD`. */
const readWorktreeHead = (
  fs: FileSystem.FileSystem,
  git: string,
  workspace: string,
): Effect.Effect<BranchSource> =>
  Effect.gen(function* () {
    const text = yield* readFileOrNone(fs, git);
    if (text === undefined) {
      return { kind: 'none', reason: 'unreadable-head', detail: `Cannot read '${git}'.` };
    }
    const gitDir = parseGitFile(text, workspace);
    if (gitDir === undefined) {
      return {
        kind: 'none',
        reason: 'unreadable-head',
        detail: `'${git}' has no 'gitdir:' line.`,
      };
    }
    return yield* readHead(fs, gitDir);
  });

/**
 * Detect the checked-out branch without assuming a checkout form: `.git` may
 * be a directory or a file naming a worktree's git directory, and that
 * directory is what holds `HEAD`. A missing `.git` and an unreadable `HEAD`
 * resolve to no branch instead of failing the command.
 * @param workspace - workspace root to inspect
 * @returns the branch, or why there is none
 */
const detectBranch = (
  workspace: string,
): Effect.Effect<BranchSource, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const git = `${trimTrailingSlash(workspace)}/.git`;
    const kind = yield* fs.stat(git).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(undefined),
        onSuccess: (info) => Effect.succeed(info.type),
      }),
    );
    return yield* Match.value(kind).pipe(
      Match.when(undefined, () =>
        Effect.succeed<BranchSource>({
          kind: 'none',
          reason: 'missing-git',
          detail: `No .git directory or file under '${workspace}'.`,
        }),
      ),
      Match.when('Directory', () => readHead(fs, git)),
      Match.when('File', () => readWorktreeHead(fs, git, workspace)),
      Match.orElse(() =>
        Effect.succeed<BranchSource>({
          kind: 'none',
          reason: 'missing-git',
          detail: `'${git}' is neither a directory nor a file.`,
        }),
      ),
    );
  });

/**
 * Every spec directory name under `root` that holds a `SPEC.md`. One targeted
 * existence check per candidate: detection must not read every file of every
 * spec, and an unreadable file in an unrelated spec must not abort the match.
 */
const specNames = (
  root: string,
): Effect.Effect<ReadonlyArray<string>, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const names = yield* store.names(root);
    const held: Array<string> = [];
    for (const name of names) {
      if (yield* store.hasFile(root, name, SPEC_FILE)) held.push(name);
    }
    return held;
  });

/** Build the one diagnostic a failed resolution renders. */
const whichDiagnostic = (root: string, miss: WhichMiss): SizingDiagnostic => {
  const fix =
    miss.candidates.length === 0
      ? `Add a spec under ${root}, then set the branch to '<prefix>/<spec-name>'.`
      : `Pass ${miss.candidates.map((name) => `--name ${name}`).join(' or ')}.`;
  return diagnostic({
    code: miss.code,
    path: root,
    field: 'branch',
    problem: miss.problem,
    rerun: 'ask the user',
    expected: miss.expected,
    actual: miss.actual,
    fix,
  });
};

/**
 * Resolve the one spec the current branch names. Reads the branch from the
 * workspace's git metadata unless `branch` overrides it, then matches it
 * through `modules/which`, the single resolver `execute` and the host tool
 * share. Fails with one agent-first diagnostic listing the candidates.
 * @param root - spec root directory
 * @param options - branch override and the workspace that holds `.git`
 * @returns the one match, failing instead of guessing
 */
export const which = (
  root: string,
  options: WhichOptions = {},
): Effect.Effect<
  WhichMatch,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecWhich',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    const names = yield* specNames(root);
    const source: BranchSource =
      options.branch === undefined
        ? yield* detectBranch(options.workspace ?? '.')
        : { kind: 'branch', branch: options.branch };
    const resolution = resolveWhich({ source, names });
    if (resolution.ok) return resolution.match;
    return yield* Effect.fail(
      new SurfaceError({
        operation: 'SpecWhich',
        diagnostics: [whichDiagnostic(root, resolution.miss)],
      }),
    );
  });

/**
 * Render `which`: exactly one spec name and nothing else.
 * @param report - match from {@link which}
 * @returns the spec directory name
 */
export const renderWhich = (report: WhichMatch): string => report.name;

// ─── Author / Execute ─────────────────────────────────────────────────

/** What `author` renders from. */
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
const unknownPhaseDiagnostic = (
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
const noActivePhaseDiagnostic = (name: string, derived: State): SizingDiagnostic => {
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
const phaseNotActiveDiagnostic = (
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

    const workspace = options.workspace ?? '.';
    const explicit = options.name?.trim();
    const name =
      explicit === undefined || explicit === ''
        ? (yield* which(root, { branch: options.branch, workspace })).name
        : explicit;

    const report = yield* status(root, name);
    const rerun = `mf-specs check --name ${name}`;

    // An undispatchable tree is refused before a prompt is rendered: the
    // worker would otherwise act on a spec the verifier already rejects.
    const specErrors = report.verify.issues.filter(isError);
    const sizingErrors = report.sizing.issues.filter(isError);
    const errors = [...sizingErrors, ...specErrors];
    if (errors.length > 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecExecute',
          diagnostics: errors.map((found) =>
            diagnosticOfIssue(isSizingCode(found.code) ? '' : name, found, rerun),
          ),
        }),
      );
    }

    const stateReport = stateOf(report);
    const nextReport = yield* next(root, name);
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

    const requested = options.phase?.trim();
    let phase: string | undefined;
    if (requested !== undefined && requested !== '') {
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
const blankValue = (value: string | undefined): boolean =>
  value === undefined || value.trim() === '';

/** The corrected command for a supplied but blank `--name`, per the chosen scope. */
const blankNameRepair = (scope: SizingScope | undefined): string => {
  if (scope === 'repo') return 'mf-specs sizing-config --scope repo';
  if (scope === 'phase') {
    return 'mf-specs sizing-config --scope phase --name <spec> --phase <id>';
  }
  if (scope === 'spec') return 'mf-specs sizing-config --scope spec --name <spec>';
  return 'mf-specs sizing-config --name <spec>';
};

/** A {@link SizingScopeRequest} being filled in, so absent keys stay absent. */
interface MutableSizingScopeRequest {
  scope?: SizingScope;
  name?: string;
  phase?: string;
}

/** The mistake, the corrected command, and the flags that produced it. */
interface ScopeRefusalInput {
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
const scopeRefusal = (input: ScopeRefusalInput): SizingScopeResolution => ({
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
const isSizingScope = (value: string): value is SizingScope =>
  SIZING_SCOPES.some((scope) => scope === value);

/** The flags supplied alongside one scope, for a refusal's `actual` row. */
const suppliedFlags = (name: string | undefined, phase: string | undefined): string =>
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
 * @param options - raw scope, name, and phase flags
 * @returns the derived scope, or the usage diagnostic naming the fix
 */
export const resolveSizingScope = (options: SizingConfigOptions): SizingScopeResolution => {
  const name = blankValue(options.name) ? undefined : options.name?.trim();
  const phase = blankValue(options.phase) ? undefined : options.phase?.trim();
  const supplied = blankValue(options.scope) ? undefined : options.scope?.trim();

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
interface SizingConfigValues {
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
export const LIST_STATUSES: ReadonlyArray<State> = STATES;

const isSpecState = (value: string): value is State =>
  LIST_STATUSES.some((candidate) => candidate === value);

/** Options for {@link list}. */
export interface ListOptions {
  /** Derived lifecycle states to keep; empty keeps every state. */
  readonly statuses?: ReadonlyArray<State> | undefined;
  /** Keep only unfinished specs (`state !== 'complete'`). */
  readonly pending?: boolean | undefined;
}

/** Listing result over a spec root. */
export interface ListReport {
  readonly root: string;
  /** Matched specs, in directory order. */
  readonly specs: ReadonlyArray<StatusReport>;
  /** Every spec under the root, before filtering. */
  readonly total: number;
  /** Specs that matched the filter. */
  readonly matched: number;
}

const matchesList = (report: StatusReport, options: ListOptions): boolean => {
  const derived = report.state?.state;
  if (options.pending === true && derived === 'complete') return false;
  const statuses = options.statuses;
  if (statuses !== undefined && statuses.length > 0) {
    if (derived === undefined || !statuses.includes(derived)) return false;
  }
  return true;
};

/**
 * List every spec under `root`, reduced to its derived lifecycle state
 * and task counts, optionally filtered by state. Reads each spec once
 * and reuses the {@link status} summarizer. Fails only on IO.
 * @param root - spec root directory
 * @param options - optional state filters
 * @returns the matched specs plus total/matched counts
 */
export const list = (
  root: string,
  options: ListOptions = {},
): Effect.Effect<ListReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecList',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    const names = yield* store.names(root);
    const reports = yield* Effect.forEach(
      names,
      (name) =>
        store.snapshot(root, name).pipe(Effect.map((snapshot) => summarize(name, snapshot))),
      { concurrency: DEFAULT_CONCURRENCY },
    );
    const specs = reports.filter((report) => matchesList(report, options));
    return { root, specs, total: reports.length, matched: specs.length };
  });

/** Listing state mark, aligned with {@link STATUS_MARK}. */
const LIST_MARK = {
  complete: '\u2713',
  'in-progress': '\u2022',
  pending: '\u25cb',
  blocked: '\u2717',
  inconsistent: '\u2717',
} satisfies Record<State, string>;

/**
 * Render a listing report: one line per matched spec, then a
 * matched-of-total summary. Token-lean; `verbose` prepends the root.
 * @param report - report from {@link list}
 * @param verbose - include the root path
 * @returns the display text
 */
export const renderList = (report: ListReport, verbose: boolean): string => {
  const lines: Array<string> = [];
  if (verbose) lines.push(`root ${report.root}`);
  for (const spec of report.specs) {
    const derived = spec.state?.state;
    const mark = derived === undefined ? '\u2717' : LIST_MARK[derived];
    const declared = spec.spec?.status ?? 'unreadable';
    const counts = statusCounts(spec.tasks) || `${spec.tasks.length} tasks`;
    const errors = errorCount(spec.verify.issues);
    const warnings = warningCount(spec.verify.issues);
    const parts: Array<string> = [];
    if (errors > 0) parts.push(`\u2717 ${errors}`);
    if (warnings > 0) parts.push(`! ${warnings} warning${warnings === 1 ? '' : 's'}`);
    const verdict = parts.length === 0 ? '' : ` \u00b7 ${parts.join(' \u00b7 ')}`;
    lines.push(
      `${mark} ${spec.name}  ${declared} \u00b7 ${derived ?? 'unreadable'} \u00b7 ${counts}${verdict}`,
    );
  }
  if (lines.length > 0) lines.push('');
  lines.push(
    `${report.total} spec${report.total === 1 ? '' : 's'} \u00b7 ${report.matched} matched`,
  );
  return lines.join('\n');
};

/** Parsed listing filter: options, or a user-facing error. */
export type ListFilter = { readonly options: ListOptions } | { readonly error: string };

/**
 * Turn raw `--status`/`--pending` inputs into {@link ListOptions}.
 * `--pending` is shorthand for every unfinished state and cannot combine
 * with `--status`; `completed` is accepted as an alias for `complete`.
 * @param rawStatuses - comma-separated `--status` value, if given
 * @param pending - whether `--pending` was set
 * @returns the options or an error message
 */
export const resolveListOptions = (
  rawStatuses: string | undefined,
  pending: boolean,
): ListFilter => {
  const trimmed = rawStatuses?.trim() ?? '';
  if (pending && trimmed !== '') {
    return { error: 'Use --pending or --status, not both.' };
  }
  if (pending) return { options: { pending: true } };
  if (trimmed === '') return { options: {} };
  const states: Array<State> = [];
  for (const token of trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')) {
    const canonical = token === 'completed' ? 'complete' : token;
    if (!isSpecState(canonical)) {
      return {
        error: `Unknown status '${token}'. Use one of: ${LIST_STATUSES.join(', ')}.`,
      };
    }
    states.push(canonical);
  }
  return { options: { statuses: states } };
};

// ─── Create ───────────────────────────────────────────────────────────

/** Default task name when no `--tasks` value is supplied. */
export const DEFAULT_SCAFFOLD_TASK = 'implement';

/** Options for {@link scaffold}. */
export interface ScaffoldOptions {
  /** Spec slug; also the directory name. */
  readonly name: string;
  /** Author stamped into `SPEC.md`; defaults to `spec-scaffold`. */
  readonly author?: string | undefined;
  readonly description?: string | undefined;
  /** `in-place` (default) or `worktree`. */
  readonly workspaceType?: string | undefined;
  /** Raw tasks, each `name[:type[:gates[:size]]]`; defaults to one `implement` task. */
  readonly taskSpecs?: ReadonlyArray<string> | undefined;
  /** Ordered reviewer profile slugs emitted on the phase's review task. */
  readonly reviewerProfiles?: ReadonlyArray<string> | undefined;
}

/** What {@link scaffold} wrote. */
export interface ScaffoldReport {
  readonly name: string;
  /** Spec directory, POSIX-joined from the store root. */
  readonly dir: string;
  readonly phase: string;
  readonly taskCount: number;
  /** Spec-relative file paths written, in write order. */
  readonly files: ReadonlyArray<string>;
}

/** Parsed task spec: the task, or a user-facing error. */
export type ScaffoldTaskParse =
  | { readonly ok: true; readonly task: ScaffoldTask }
  | { readonly ok: false; readonly error: string };

/** Most tokens a task spec accepts: `name[:type[:gates[:size]]]`. */
const SCAFFOLD_TASK_TOKENS = 4;

/**
 * Parse one `name[:type[:gates[:size]]]` task spec. The type defaults to
 * `execution`, the gates token is `gates` or `true` to request a `GATES.md`,
 * and the size defaults to `medium` — including when the size token is present
 * but blank, so a trailing colon means "no size here". A fifth token is
 * rejected rather than dropped.
 * @param raw - one raw task spec
 * @returns the task, or a user-facing error
 */
export const parseScaffoldTask = (raw: string): ScaffoldTaskParse => {
  const tokens = raw.split(':');
  if (tokens.length > SCAFFOLD_TASK_TOKENS) {
    return {
      ok: false,
      error: `'${raw}' has ${tokens.length} fields — use name[:type[:gates[:size]]] with at most ${SCAFFOLD_TASK_TOKENS}.`,
    };
  }
  const [name = '', type = 'execution', gates = '', declaredSize] = tokens;
  const size = declaredSize === undefined || declaredSize === '' ? DEFAULT_SIZE : declaredSize;
  if (!isValidName(name)) {
    return {
      ok: false,
      error: `'${name}' is not a valid task name — use a kebab-case slug such as 'build-login'.`,
    };
  }
  if (!isScaffoldTaskType(type)) {
    return {
      ok: false,
      error: `Unknown task type '${type}' — use one of: ${SCAFFOLD_TASK_TYPES.join(', ')}.`,
    };
  }
  if (!isScaffoldTaskSize(size)) {
    return {
      ok: false,
      error: `Unknown task size '${size}' — use one of: ${SIZES.join(', ')}.`,
    };
  }
  return {
    ok: true,
    task: { name, type, gates: gates === 'gates' || gates === 'true', size },
  };
};

/**
 * Scaffold a mechanically valid spec tree under `root/<name>`: `SPEC.md`,
 * one task directory per task, and the phase's review task. Deterministic
 * and model-free — the mechanical half of `mf-specs create`. Refuses to
 * touch an existing spec directory.
 * @param root - spec root directory
 * @param options - spec name, metadata, and task specs
 * @returns what was written, failing with a displayable reason
 */
export const scaffold = (
  root: string,
  options: ScaffoldOptions,
): Effect.Effect<ScaffoldReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecCreate';
    const refuse = (reason: string) => Effect.fail(new SpecStore.StoreError({ operation, reason }));
    if (!isValidName(options.name)) {
      return yield* refuse(
        `'${options.name}' is not a valid spec name — use a kebab-case slug such as 'ship-login'.`,
      );
    }
    const workspaceType = options.workspaceType ?? 'in-place';
    if (workspaceType !== 'in-place' && workspaceType !== 'worktree') {
      return yield* refuse(
        `Unknown workspace type '${workspaceType}' — use 'in-place' or 'worktree'.`,
      );
    }
    const store = yield* SpecStore.SpecStore;
    if (yield* store.exists(root, options.name)) {
      return yield* refuse(`Spec '${options.name}' already exists under ${root}.`);
    }
    const seenProfiles = new Set<string>();
    for (const profile of options.reviewerProfiles ?? []) {
      if (!SLUG_PATTERN.test(profile)) {
        return yield* refuse(
          `'${profile}' is not a valid reviewer profile — use a kebab-case slug such as 'effect-reviewer'.`,
        );
      }
      if (seenProfiles.has(profile)) {
        return yield* refuse(`Reviewer profile '${profile}' is listed more than once.`);
      }
      seenProfiles.add(profile);
    }
    const rawTasks =
      options.taskSpecs === undefined || options.taskSpecs.length === 0
        ? [DEFAULT_SCAFFOLD_TASK]
        : options.taskSpecs;
    const tasks: Array<ScaffoldTask> = [];
    for (const raw of rawTasks) {
      const parsed = parseScaffoldTask(raw);
      if (!parsed.ok) return yield* refuse(parsed.error);
      tasks.push(parsed.task);
    }
    const now = yield* Clock.currentTimeMillis;
    const created = new Date(now).toISOString().slice(0, 10);
    const rendered = renderSpecScaffold({
      name: options.name,
      author: options.author?.trim() || 'spec-scaffold',
      created,
      description: options.description,
      workspaceType,
      reviewerProfiles: options.reviewerProfiles,
      tasks,
    });
    yield* store.write(root, options.name, rendered.files);
    return {
      name: options.name,
      dir: `${root.replace(/\/+$/, '')}/${options.name}`,
      phase: rendered.phase,
      taskCount: rendered.taskCount,
      files: rendered.files.map((file) => file.path),
    };
  });

/**
 * Render a scaffold report: one header line, the directory, and the files.
 * @param report - report from {@link scaffold}
 * @returns the display text
 */
export const renderScaffold = (report: ScaffoldReport): string =>
  [
    `\u2713 created '${report.name}' \u00b7 phase ${report.phase} \u00b7 ${report.taskCount} task${report.taskCount === 1 ? '' : 's'}`,
    report.dir,
    ...report.files.map((file) => `  ${file}`),
  ].join('\n');

// ─── Commands ─────────────────────────────────────────────────────────

const dirFlag = Flag.String('dir').pipe(
  Flag.withDescription('Workspace root. Defaults to the working directory.'),
  Flag.withDefault('.'),
);

const nameFlag = Flag.String('name').pipe(Flag.withDescription('Spec directory name.'));

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/**
 * The workspace root the prompt commands read. An explicit `--dir` always
 * wins; otherwise the nearest repository root is used, so the package scripts
 * (`bun run --cwd packages/specs cli author …`) still read the repo's
 * `.agents/@montflow/prompts/` instead of the package directory.
 */
const workspaceRoot = (dir: string | undefined): Effect.Effect<string> =>
  dir === undefined || dir === '' ? resolveRepoRoot(process.cwd()) : Effect.succeed(dir);

/** Comma-separated values; blank or absent reads as an empty list. */
const csv = (value: string | undefined): ReadonlyArray<string> =>
  value === undefined || value.trim() === ''
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');

/** Render a caught `Cause` as a failed slash report. */
const slashFailure = (cause: Cause.Cause<unknown>, options: DiagnoseOptions): SlashReport => {
  const diagnosed = diagnoseCause(cause, options);
  return { output: diagnosed.output, ok: false };
};

/** Print output and set the process exit code when the outcome is not `0`. */
const finish = (output: string, exitCode: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (output !== '') yield* Console.log(output);
    if (exitCode !== 0) {
      yield* Effect.sync(() => {
        process.exitCode = exitCode;
      });
    }
  });

/**
 * Run a command body, catching `Cause` so no command can swallow one. An
 * expected failure renders its own coded diagnostic and exits `1`; a pure
 * interruption exits `130`; an unexpected defect is labelled internal and exits
 * `2`, with a stack only under `verbose`.
 * @param body - the command body
 * @param options - fallback path, re-run command, and verbosity, read lazily
 * @returns the body's outcome, rendered
 */
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
const verboseFlag = Flag.Boolean('verbose').pipe(
  Flag.withDescription('Detailed output: provenance matrix, cause chain, and stack.'),
  Flag.withDefault(false),
);

const checkCommand = Command.make(
  'check',
  {
    dir: dirFlag,
    name: Flag.optional(nameFlag),
    verbose: Flag.Boolean('verbose').pipe(
      Flag.withDescription('Show passing specs and the root path.'),
      Flag.withDefault(false),
    ),
    concurrency: Flag.Int('concurrency').pipe(
      Flag.withDescription('Specs verified in parallel.'),
      Flag.withDefault(DEFAULT_CONCURRENCY),
    ),
    strict: Flag.Boolean('strict').pipe(
      Flag.withDescription('Treat warnings as errors.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const name = Option.isSome(config.name) ? config.name.value : undefined;
        const options: CheckOptions =
          name === undefined
            ? { concurrency: config.concurrency, strict: config.strict }
            : { name, concurrency: config.concurrency, strict: config.strict };
        const report = yield* check(storeDirOf(config.dir), options);
        yield* Console.log(renderCheck(report, config.verbose));
        const exit = checkExitCode(report);
        if (exit !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = exit;
          });
        }
      }),
      () => ({
        path: storeDirOf(config.dir),
        rerun: 'mf-specs check',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Mechanically verify spec files and structure.'),
  Command.provide(SpecStore.Default),
);

const statusCommand = Command.make(
  'status',
  { dir: dirFlag, name: nameFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* status(storeDirOf(config.dir), config.name);
        yield* Console.log(renderStatus(report));
        const exit = dispatchExitCode(report.sizing, report.verify);
        const blockers = dispatchErrorText(report.sizing, report.verify, config.name);
        if (blockers !== '') yield* Console.log(`\n${blockers}`);
        if (!report.verify.valid || exit !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = VALIDATION_EXIT_CODE;
          });
        }
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Show the status of one spec (--name required).'),
  Command.provide(SpecStore.Default),
);

const createCommand = Command.make(
  'create',
  {
    dir: dirFlag,
    name: nameFlag,
    author: Flag.String('author').pipe(
      Flag.withDescription('Author stamped into SPEC.md.'),
      Flag.optional,
    ),
    description: Flag.String('description').pipe(
      Flag.withDescription('One-line spec description.'),
      Flag.optional,
    ),
    workspaceType: Flag.String('workspace-type').pipe(
      Flag.withDescription("How work is isolated: 'in-place' (default) or 'worktree'."),
      Flag.optional,
    ),
    tasks: Flag.String('tasks').pipe(
      Flag.withDescription(
        'Comma-separated tasks, each name[:type[:gates[:size]]]. Default: implement.',
      ),
      Flag.optional,
    ),
    reviewerProfiles: Flag.String('reviewer-profiles').pipe(
      Flag.withDescription('Comma-separated reviewer profiles for the phase review task.'),
      Flag.optional,
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const taskSpecs = csv(opt(config.tasks));
        for (const raw of taskSpecs) {
          const parsed = parseScaffoldTask(raw);
          if (!parsed.ok) {
            return yield* Effect.fail(
              new SurfaceError({
                operation: 'SpecsCreate',
                diagnostics: [
                  diagnostic({
                    code: SURFACE_CODES.invalidArgument,
                    path: config.name,
                    field: '--tasks',
                    problem: parsed.error,
                    fix: 'Pass each task as name[:type[:gates[:size]]].',
                    rerun: `mf-specs create --name ${config.name}`,
                  }),
                ],
              }),
            );
          }
        }
        const report = yield* scaffold(storeDirOf(config.dir), {
          name: config.name,
          author: opt(config.author),
          description: opt(config.description),
          workspaceType: opt(config.workspaceType),
          taskSpecs,
          reviewerProfiles: csv(opt(config.reviewerProfiles)),
        });
        yield* Console.log(renderScaffold(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs create --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Scaffold a spec tree: SPEC.md, task directories, and the phase review task. Model-free.',
  ),
  Command.provide(SpecStore.Default),
);

const stateCommand = Command.make(
  'state',
  { dir: dirFlag, name: nameFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* state(storeDirOf(config.dir), config.name);
        yield* Console.log(renderState(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs state --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Print a spec derived state: status, state, active phase, locks.'),
  Command.provide(SpecStore.Default),
);

const nextCommand = Command.make(
  'next',
  { dir: dirFlag, name: nameFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* next(storeDirOf(config.dir), config.name);
        yield* Console.log(renderNext(report));
        const blockers = dispatchErrorText(report.sizing, report.verify, config.name);
        if (blockers !== '') {
          yield* Console.log(`\n${blockers}`);
        }
        if (dispatchExitCode(report.sizing, report.verify) !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = VALIDATION_EXIT_CODE;
          });
        }
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Print the ready task set for a spec active phase.'),
  Command.provide(SpecStore.Default),
);

/** `resolve` and `sizing` share the required task selector. */
const taskFlag = Flag.String('task').pipe(Flag.withDescription('Task id, e.g. A001.'));

const resolveCommand = Command.make(
  'resolve',
  { dir: dirFlag, name: nameFlag, task: taskFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* sizingOf(storeDirOf(config.dir), config.name, config.task);
        yield* Console.log(report.target.target);
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Print one task dispatch target: provider/model#effort, or inherit. Nothing else.',
  ),
  Command.provide(SpecStore.Default),
);

const sizingCommand = Command.make(
  'sizing',
  {
    dir: dirFlag,
    name: nameFlag,
    task: taskFlag,
    verbose: verboseFlag,
    human: Flag.Boolean('human').pipe(
      Flag.withDescription('Alias for --verbose: the full provenance matrix.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* sizingOf(storeDirOf(config.dir), config.name, config.task);
        yield* Console.log(renderSizingMode(report, config.verbose || config.human));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Inspect one task size, target, and provenance (--verbose/--human for the matrix).',
  ),
  Command.provide(SpecStore.Default),
);

const modelsCommand = Command.make(
  'models',
  {
    dir: dirFlag,
    provider: Flag.optional(
      Flag.String('provider').pipe(
        Flag.withDescription('Keep one provider id; a miss is a diagnostic.'),
      ),
    ),
    json: Flag.Boolean('json').pipe(
      Flag.withDescription('Print the stable JSON document (also valid --catalog input).'),
      Flag.withDefault(false),
    ),
    catalog: Flag.optional(
      Flag.String('catalog').pipe(
        Flag.withDescription('Read a catalogue file instead of the host model port.'),
      ),
    ),
    verify: Flag.Boolean('verify').pipe(
      Flag.withDescription('Cross-check sizing config entries; warnings exit 0.'),
      Flag.withDefault(false),
    ),
    name: Flag.optional(nameFlag),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* models(storeDirOf(config.dir), {
          provider: opt(config.provider),
          json: config.json,
          catalog: opt(config.catalog),
          verify: config.verify,
          name: opt(config.name),
        });
        yield* Console.log(report.output);
        if (report.exitCode !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = report.exitCode;
          });
        }
      }),
      () => ({
        path: storeDirOf(config.dir),
        rerun: config.verify
          ? 'mf-specs models --verify --dir <repo root>'
          : 'mf-specs models --dir <repo root>',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'List the host model catalogue with its effort variants, or verify config entries against it.',
  ),
  Command.provide(SpecStore.Default),
);

/**
 * `which`, `author`, and `execute` default to the nearest repository root, not
 * the process directory.
 */
const workspaceDirFlag = Flag.optional(
  Flag.String('dir').pipe(
    Flag.withDescription('Workspace root. Defaults to the nearest repository root.'),
  ),
);

const whichCommand = Command.make(
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

const authorCommand = Command.make(
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

const executeCommand = Command.make(
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

const sizingConfigCommand = Command.make(
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

const listCommand = Command.make(
  'list',
  {
    dir: dirFlag,
    status: Flag.optional(
      Flag.String('status').pipe(
        Flag.withDescription(`Comma-separated states to keep: ${LIST_STATUSES.join(', ')}.`),
      ),
    ),
    pending: Flag.Boolean('pending').pipe(
      Flag.withDescription('Keep only unfinished specs (state is not `complete`).'),
      Flag.withDefault(false),
    ),
    verbose: Flag.Boolean('verbose').pipe(
      Flag.withDescription('Show the root path.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const filter = resolveListOptions(
          Option.isSome(config.status) ? config.status.value : undefined,
          config.pending,
        );
        if ('error' in filter) {
          return yield* Effect.fail(
            new SurfaceError({
              operation: 'SpecsList',
              diagnostics: [
                diagnostic({
                  code: SURFACE_CODES.invalidArgument,
                  path: storeDirOf(config.dir),
                  field: '--status',
                  problem: filter.error,
                  fix: `Pass --status with one of: ${LIST_STATUSES.join(', ')}.`,
                  rerun: 'mf-specs list',
                }),
              ],
            }),
          );
        }
        const report = yield* list(storeDirOf(config.dir), filter.options);
        yield* Console.log(renderList(report, config.verbose));
      }),
      () => ({
        path: storeDirOf(config.dir),
        rerun: 'mf-specs list',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('List specs with their derived lifecycle states.'),
  Command.provide(SpecStore.Default),
);

/**
 * The mark a doctor payload line leads with: `✓` for a current copy, `+` for
 * one doctor wrote, `✗` for one that needs attention.
 * @param payload - one skill or prompt outcome
 * @returns the leading mark
 */
const doctorMark = (payload: PayloadInstall): string =>
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
const doctorNote = (payload: PayloadInstall): string =>
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
const doctorLine = (payload: PayloadInstall): string => {
  const origin = Match.value(payload.status).pipe(
    Match.whenOr('missing', 'stale', () => ` (from ${payload.source})`),
    Match.orElse(() => ''),
  );
  return `${doctorMark(payload)} ${payload.name}: ${doctorNote(payload)} \u2192 ${payload.target}${origin}`;
};

/** Build a diagnostic from a blocked payload's coded failure. */
const diagnosticOfDoctorFailure = (payload: PayloadInstall): SizingDiagnostic | undefined => {
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
const doctorCommand = Command.make(
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
export const rootCommand = Command.make('mf-specs').pipe(
  Command.withDescription('List, verify, scaffold, inspect, and render montflow spec prompts.'),
  Command.withSubcommands([
    checkCommand,
    statusCommand,
    stateCommand,
    nextCommand,
    resolveCommand,
    sizingCommand,
    modelsCommand,
    whichCommand,
    listCommand,
    createCommand,
    authorCommand,
    executeCommand,
    sizingConfigCommand,
    doctorCommand,
  ]),
);

// ─── Slash-command form ───────────────────────────────────────────────

/** Result of the slash-command form: rendered output plus a success flag. */
export interface SlashReport {
  readonly output: string;
  readonly ok: boolean;
}

/**
 * Every slash head that names a command explicitly. This is the one list: it
 * types {@link SlashArgs}, decides whether the first token is a command, and
 * therefore what the remaining tokens mean. Anything else runs `check`.
 */
const SLASH_COMMANDS = [
  'check',
  'status',
  'state',
  'next',
  'resolve',
  'sizing',
  'models',
  'which',
  'list',
  'create',
  'author',
  'execute',
  'sizing-config',
] as const;

/** A slash command name. */
type SlashCommand = (typeof SLASH_COMMANDS)[number];

/** True when `value` names a slash command. */
const isSlashCommand = (value: string | undefined): value is SlashCommand =>
  value !== undefined && SLASH_COMMANDS.some((command) => command === value);

/** Parsed slash args: a command plus its flags. */
interface SlashArgs {
  readonly command: SlashCommand;
  readonly name: string | undefined;
  readonly dir: string | undefined;
  readonly task: string | undefined;
  readonly branch: string | undefined;
  readonly provider: string | undefined;
  readonly catalog: string | undefined;
  readonly verbose: boolean;
  readonly human: boolean;
  readonly strict: boolean;
  readonly json: boolean;
  readonly verify: boolean;
  readonly statusFilter: string | undefined;
  readonly pending: boolean;
  readonly description: string | undefined;
  readonly author: string | undefined;
  readonly workspaceType: string | undefined;
  readonly tasks: ReadonlyArray<string>;
  readonly reviewerProfiles: ReadonlyArray<string>;
  readonly request: string | undefined;
  readonly notes: string | undefined;
  readonly scope: string | undefined;
  readonly phase: string | undefined;
  readonly focus: string | undefined;
  readonly mode: string | undefined;
}

/** Flags the slash parser accepts as `--key value` or `--key=value`. */
const SLASH_VALUE_FLAGS = new Set([
  'name',
  'dir',
  'task',
  'branch',
  'provider',
  'catalog',
  'status',
  'description',
  'author',
  'workspace-type',
  'tasks',
  'reviewer-profiles',
  'request',
  'notes',
  'scope',
  'phase',
  'focus',
  'mode',
]);

/**
 * Value flags whose value may be prose. Their tokens are joined up to the next
 * `--flag`, so `/specs author --request Ship login` keeps its spaces without
 * requiring quotes the slash parser cannot see.
 */
const SLASH_PROSE_FLAGS = new Set(['request', 'notes', 'focus']);

const parseSlashArgs = (args: string): SlashArgs => {
  const tokens = args.split(/\s+/).filter((token) => token !== '');
  const head = tokens[0];
  const known = isSlashCommand(head);
  const command: SlashCommand = isSlashCommand(head) ? head : 'check';
  const rest = known ? tokens.slice(1) : tokens;
  let tasks: ReadonlyArray<string> = [];
  let reviewerProfiles: ReadonlyArray<string> = [];
  let verbose = false;
  let human = false;
  let pending = false;
  let strict = false;
  let json = false;
  let verify = false;
  // Every value flag without a bespoke reader lands here by its flag name, so
  // adding a flag means one entry in SLASH_VALUE_FLAGS, never another arm.
  const values: Record<string, string> = {};
  const assign = (key: string, value: string): void => {
    if (key === 'tasks') tasks = csv(value);
    else if (key === 'reviewer-profiles') reviewerProfiles = csv(value);
    else values[key] = value;
  };
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index] ?? '';
    if (token === '--verbose' || token === '-v') {
      verbose = true;
      continue;
    }
    if (token === '--human') {
      human = true;
      continue;
    }
    if (token === '--pending') {
      pending = true;
      continue;
    }
    if (token === '--strict') {
      strict = true;
      continue;
    }
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--verify') {
      verify = true;
      continue;
    }
    const inline = /^--([\w-]+)=(.*)$/.exec(token);
    if (inline !== null) {
      if (SLASH_VALUE_FLAGS.has(inline[1] ?? '')) assign(inline[1] ?? '', inline[2] ?? '');
      continue;
    }
    if (token.startsWith('--') && SLASH_VALUE_FLAGS.has(token.slice(2))) {
      const key = token.slice(2);
      const value = rest[index + 1];
      if (value !== undefined && !value.startsWith('--')) {
        if (SLASH_PROSE_FLAGS.has(key)) {
          const parts: Array<string> = [value];
          while (index + 2 < rest.length && !(rest[index + 2] ?? '').startsWith('--')) {
            parts.push(rest[index + 2] ?? '');
            index++;
          }
          assign(key, parts.join(' '));
          index++;
        } else {
          assign(key, value);
          index++;
        }
      }
    }
  }
  return {
    command,
    name: values.name,
    dir: values.dir,
    task: values.task,
    branch: values.branch,
    provider: values.provider,
    catalog: values.catalog,
    verbose,
    human,
    strict,
    json,
    verify,
    statusFilter: values.status,
    pending,
    description: values.description,
    author: values.author,
    workspaceType: values['workspace-type'],
    tasks,
    reviewerProfiles,
    request: values.request,
    notes: values.notes,
    scope: values.scope,
    phase: values.phase,
    focus: values.focus,
    mode: values.mode,
  };
};

/**
 * Resolve a `--dir` value against the caller's workspace. The CLI runs from the
 * workspace, so it passes nothing; the server plugin supplies one that joins
 * relative values onto the plugin directory and leaves absolute ones alone.
 */
export type ResolveSlashDir = (dir: string) => string;

/**
 * Everything one slash arm reads: parsed flags, resolved roots, and the host
 * model source.
 */
interface SlashContext {
  readonly parsed: SlashArgs;
  readonly dir: string;
  readonly workspace: string;
  readonly catalog: string | undefined;
  readonly source: Catalogue.ModelSource | undefined;
}

/** What every slash arm returns: a rendered report or a coded failure. */
type SlashEffect = Effect.Effect<
  SlashReport,
  SpecStore.StoreError | SurfaceError,
  SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore
>;

/**
 * Render one arm outcome. Any failure becomes a coded report, so an arm states
 * its outcome and its failure context once instead of repeating the catch.
 */
const slashOutcome = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  render: (value: A) => SlashReport,
  context: DiagnoseOptions,
): Effect.Effect<SlashReport, never, R> =>
  effect.pipe(
    Effect.map(render),
    Effect.catchCause((cause) => Effect.succeed(slashFailure(cause, context))),
  );

/** `/specs author --request <text>`. */
const slashAuthor = (context: SlashContext): SlashEffect => {
  const { parsed, workspace } = context;
  if (parsed.request === undefined || parsed.request.trim() === '') {
    return Effect.fail(
      new SurfaceError({
        operation: 'SpecAuthor',
        diagnostics: [
          diagnostic({
            code: SURFACE_CODES.invalidArgument,
            path: workspace,
            field: '--request',
            problem: 'author requires --request <text>.',
            rerun: 'mf-specs author --request <text>',
            expected: 'a non-empty --request value',
            actual: 'missing',
            fix: 'Pass --request with the text the spec should accomplish.',
          }),
        ],
      }),
    );
  }
  const request = parsed.request;
  return slashOutcome(
    author(workspace, { request, notes: parsed.notes }),
    (loaded): SlashReport => ({ output: loaded.text, ok: true }),
    { path: workspace, rerun: 'mf-specs author', verbose: parsed.verbose },
  );
};

/** `/specs execute`, optionally named, phased, focused, or autonomous. */
const slashExecute = (context: SlashContext): SlashEffect => {
  const { parsed, dir, workspace } = context;
  return slashOutcome(
    execute(dir, {
      name: parsed.name,
      phase: parsed.phase,
      focus: parsed.focus,
      mode: parsed.mode,
      workspace,
    }),
    (report): SlashReport => ({ output: report.prompt.text, ok: true }),
    { path: dir, rerun: 'mf-specs execute', verbose: parsed.verbose },
  );
};

/** `/specs sizing-config`, the sizing prompt for one scope. */
const slashSizingConfig = (context: SlashContext): SlashEffect => {
  const { parsed, workspace } = context;
  return slashOutcome(
    sizingConfig(workspace, {
      scope: parsed.scope,
      name: parsed.name,
      phase: parsed.phase,
      focus: parsed.focus,
      mode: parsed.mode,
    }),
    (report): SlashReport => ({ output: report.prompt.text, ok: true }),
    { path: workspace, rerun: 'mf-specs sizing-config', verbose: parsed.verbose },
  );
};

/** `/specs which`, resolving the spec from the branch. */
const slashWhich = (context: SlashContext): SlashEffect => {
  const { parsed, dir, workspace } = context;
  return slashOutcome(
    which(dir, { branch: parsed.branch, workspace }),
    (report): SlashReport => ({ output: renderWhich(report), ok: true }),
    { path: dir, rerun: 'mf-specs which', verbose: parsed.verbose },
  );
};

/** `/specs create --name <spec>`, scaffolding a new spec directory. */
const slashCreate = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined || parsed.name === '') {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecCreate',
        reason: 'create requires --name <spec>.',
      }),
    );
  }
  return slashOutcome(
    scaffold(dir, {
      name: parsed.name,
      author: parsed.author,
      description: parsed.description,
      workspaceType: parsed.workspaceType,
      taskSpecs: parsed.tasks,
      reviewerProfiles: parsed.reviewerProfiles,
    }),
    (report): SlashReport => ({ output: renderScaffold(report), ok: true }),
    {
      path: parsed.name,
      rerun: `mf-specs create --name ${parsed.name}`,
      verbose: parsed.verbose,
    },
  );
};

/** `/specs status --name <spec>`. */
const slashStatus = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined || parsed.name === '') {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecStatus',
        reason: 'status requires --name <spec>.',
      }),
    );
  }
  const name = parsed.name;
  return slashOutcome(
    status(dir, name),
    (report): SlashReport => {
      const blockers = dispatchErrorText(report.sizing, report.verify, name);
      const output =
        blockers === '' ? renderStatus(report) : `${renderStatus(report)}\n\n${blockers}`;
      return {
        output,
        ok: report.verify.valid && dispatchExitCode(report.sizing, report.verify) === 0,
      };
    },
    { path: name, rerun: `mf-specs check --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs state --name <spec>`. */
const slashState = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined || parsed.name === '') {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecState',
        reason: 'state requires --name <spec>.',
      }),
    );
  }
  const name = parsed.name;
  return slashOutcome(
    state(dir, name),
    (report): SlashReport => ({
      output: renderState(report),
      ok: report.state !== 'inconsistent',
    }),
    { path: name, rerun: `mf-specs state --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs next --name <spec>`. */
const slashNext = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined || parsed.name === '') {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecNext',
        reason: 'next requires --name <spec>.',
      }),
    );
  }
  const name = parsed.name;
  return slashOutcome(
    next(dir, name),
    (report): SlashReport => {
      const blockers = dispatchErrorText(report.sizing, report.verify, name);
      const output = blockers === '' ? renderNext(report) : `${renderNext(report)}\n\n${blockers}`;
      return {
        output,
        ok: report.state !== 'inconsistent' && dispatchExitCode(report.sizing, report.verify) === 0,
      };
    },
    { path: name, rerun: `mf-specs check --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs resolve` and `/specs sizing`, the two views of one task resolution. */
const slashResolveOrSizing = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  const taskId = parsed.task;
  if (name === undefined || name === '' || taskId === undefined || taskId === '') {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: parsed.command === 'resolve' ? 'SpecResolve' : 'SpecSizing',
        reason: `${parsed.command} requires --name <spec> and --task <id>.`,
      }),
    );
  }
  return slashOutcome(
    sizingOf(dir, name, taskId),
    (report): SlashReport => ({
      output:
        parsed.command === 'resolve'
          ? report.target.target
          : renderSizingMode(report, parsed.verbose || parsed.human),
      ok: true,
    }),
    { path: name, rerun: `mf-specs check --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs list`, optionally filtered by status or pending state. */
const slashList = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const filter = resolveListOptions(parsed.statusFilter, parsed.pending);
  if ('error' in filter) {
    return Effect.fail(new SpecStore.StoreError({ operation: 'SpecList', reason: filter.error }));
  }
  return slashOutcome(
    list(dir, filter.options),
    (report): SlashReport => ({
      output: renderList(report, parsed.verbose),
      ok: true,
    }),
    { path: dir, rerun: 'mf-specs list', verbose: parsed.verbose },
  );
};

/** `/specs models`, the catalogue table, the JSON document, or the verify pass. */
const slashModels = (context: SlashContext): SlashEffect => {
  const { parsed, dir, catalog, source } = context;
  return slashOutcome(
    models(
      dir,
      {
        provider: parsed.provider,
        json: parsed.json,
        catalog,
        verify: parsed.verify,
        name: parsed.name,
      },
      source,
    ),
    (report): SlashReport => ({ output: report.output, ok: report.exitCode === 0 }),
    { path: dir, rerun: 'mf-specs models', verbose: parsed.verbose },
  );
};

/** `/specs check`, the fall-through command. */
const slashCheck = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const options: CheckOptions =
    parsed.name === undefined
      ? { concurrency: DEFAULT_CONCURRENCY, strict: parsed.strict }
      : { name: parsed.name, concurrency: DEFAULT_CONCURRENCY, strict: parsed.strict };
  return slashOutcome(
    check(dir, options),
    (report): SlashReport => ({
      output: renderCheck(report, parsed.verbose),
      ok: checkExitCode(report) === 0,
    }),
    { path: dir, rerun: 'mf-specs check', verbose: parsed.verbose },
  );
};

/**
 * Run the slash-command form registered as the OpenCode `/specs` command
 * (`src/server.ts`, through `ports.command.register`). Never renders through
 * the CLI; returns the report for the caller to log — the server writes
 * `report.output` with `Effect.logInfo` and any failure with `Effect.logError`.
 * Dispatch is exhaustive over {@link SLASH_COMMANDS}: a new command fails to
 * typecheck until it gets an arm, so it cannot silently fall through to `check`.
 * @param args - raw slash-command args
 * @param root - default spec root, already resolved against the plugin directory
 * @param resolveDir - resolver for a `--dir` value (identity by default)
 * @param source - host model source for `models`; the binary passes none
 * @returns rendered output plus success flag
 */
export const runSlash = (
  args: string,
  root: string,
  resolveDir: ResolveSlashDir = (dir) => dir,
  source?: Catalogue.ModelSource,
): Effect.Effect<
  SlashReport,
  SpecStore.StoreError | SurfaceError,
  SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore
> =>
  Effect.gen(function* () {
    const parsed = parseSlashArgs(args);
    const workspace = parsed.dir === undefined ? workspaceOf(root) : resolveDir(parsed.dir);
    const dir = parsed.dir === undefined ? root : storeDirOf(workspace);
    const context: SlashContext = {
      parsed,
      dir,
      workspace,
      catalog: parsed.catalog === undefined ? undefined : resolveDir(parsed.catalog),
      source,
    };
    return yield* Match.value(parsed.command).pipe(
      Match.when('author', () => slashAuthor(context)),
      Match.when('execute', () => slashExecute(context)),
      Match.when('sizing-config', () => slashSizingConfig(context)),
      Match.when('which', () => slashWhich(context)),
      Match.when('create', () => slashCreate(context)),
      Match.when('status', () => slashStatus(context)),
      Match.when('state', () => slashState(context)),
      Match.when('next', () => slashNext(context)),
      Match.whenOr('resolve', 'sizing', () => slashResolveOrSizing(context)),
      Match.when('list', () => slashList(context)),
      Match.when('models', () => slashModels(context)),
      Match.when('check', () => slashCheck(context)),
      Match.exhaustive,
    );
  });
