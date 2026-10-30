import { Console, Effect, FileSystem, Option, Result as EffectResult } from 'effect';
import { Command, Flag } from 'effect/cli';

import { PHASE_PATTERN, parseSpecFile } from '../../modules/spec/index.js';

import {
  CODES,
  CONFIG_FILE,
  LAYERS,
  verifyText as verifySizingText,
} from '../../modules/sizing/index.js';
import { verifySpecTree } from '../../modules/structure/index.js';

import * as Catalogue from '../../modules/catalogue/index.js';
import {
  parseTaskDirName,
  parseTaskFile,
  REVIEWER_PROFILES_FIELD,
} from '../../modules/task/index.js';
import {
  type Issue,
  type LayerTrace,
  errorCount,
  isWarning,
  noErrors,
  promoteWarnings,
  warningCount,
} from '../../modules/verify/index.js';
import { renderDiagnostic } from '../../modules/diagnostic/index.js';

import { SpecStore } from '../../services/index.js';

import {
  storeDirOf,
  DEFAULT_CONCURRENCY,
  VALIDATION_EXIT_CODE,
  SURFACE_CODES,
  SurfaceError,
  NESTED_FIELD_SEPARATOR,
  REVIEW_SERIES_ISSUE_FIELD,
  diagnosticOfIssue,
  indentBlock,
  GUARD_RERUN,
  guardSpecName,
  guardFailure,
  NO_SIZING,
  nestConfig,
  loadSizing,
  runDiagnosed,
  dirFlag,
  nameFlag,
  reviewStoreFix,
} from './cli.shared.module.js';
import { configEntries, loadRepoSizing } from './cli.apps.module.js';
/** Spec store directory, relative to the workspace root. */

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
  /** Read a catalogue file and cross-check config entries against it. */
  readonly catalog?: string;
  /** Fail a spec whose SPEC.md status is not complete. */
  readonly requireComplete?: boolean;
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
export const TASK_SIZE_CODES: ReadonlySet<string> = new Set([
  CODES.missingSize,
  CODES.unknownTaskSize,
]);

/** A phase id inside a config field, e.g. `phases.A.sizes`. */
export const CONFIG_PHASE_KEY = /phases\.([^.\s:]+)/;

export const isSizingCode = (code: string | undefined): boolean =>
  code !== undefined && code.startsWith('sizing.');

export const isTaskSizeCode = (code: string | undefined): boolean =>
  code !== undefined && TASK_SIZE_CODES.has(code);

/** Nested field of a finding that concerns a config file's root. */
export const nestedRootField = (path: string): string => `${path}${NESTED_FIELD_SEPARATOR}root`;

/**
 * Path of a failing file relative to its spec directory, so a per-spec read
 * failure names the file instead of repeating the spec name. Falls back to the
 * spec name when the store did not report a path.
 */
export const specRelativePath = (root: string, name: string, path: string | undefined): string => {
  if (path === undefined) return name;
  const absolute = `${root}/${name}/`;
  if (path.startsWith(absolute)) return path.slice(absolute.length);
  if (path.startsWith(`${name}/`)) return path.slice(name.length + 1);
  return path;
};

/** Repair for a failed review-store read. */
/**
 * Build the finding a failed review-store read becomes. The review store lives
 * outside the spec directory, so the finding names it the way a reader can act
 * on — `path <spec>/review-series`, `field review-series`, the same shape
 * `status`, `next`, and `execute` print — and keeps the platform message in the
 * cause instead of embedding a machine-absolute path in `path`.
 */
export const reviewStoreIssue = (error: SpecStore.StoreError, layers: LayerTrace): Issue => {
  const found: Issue = {
    code: SURFACE_CODES.store,
    field: REVIEW_SERIES_ISSUE_FIELD,
    message: error.reason,
    expected: 'a readable review store',
    fix: reviewStoreFix,
    layers,
  };
  return error.cause === undefined ? found : { ...found, cause: error.cause };
};

/**
 * Build the finding a failed per-spec read becomes. A failure reading the spec
 * directory itself reports the spec as the path; a failure on one file reports
 * that file relative to the spec, so `path` names the file exactly once. A
 * review-store failure keeps its own shape instead of masquerading as the spec
 * root.
 */
export const specReadIssue = (
  root: string,
  name: string,
  error: SpecStore.StoreError,
  layers: LayerTrace,
): Issue => {
  if (error.origin === 'reviews') return reviewStoreIssue(error, layers);
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
export const withRepoLayers = (found: Issue): Issue =>
  isSizingCode(found.code) ? { ...found, layers: { consulted: ['repo'], layer: 'repo' } } : found;

/**
 * Attach the layer trace to a spec finding: config findings name the file's
 * layer (spec, or phase for a nested override), task-size findings name every
 * layer consulted plus the task's phase.
 */
export const withSpecLayers = (found: Issue): Issue => {
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
export const taskPhaseInField = (field: string): string | undefined => {
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
export type OptionalIssueFields = { expected?: string; actual?: string; fix?: string };

export const check = (
  root: string,
  options: CheckOptions = {},
): Effect.Effect<
  CheckReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    yield* guardFailure(
      'SpecCheck',
      options.name === undefined ? undefined : guardSpecName(options.name, GUARD_RERUN.check),
    );
    const store = yield* SpecStore.SpecStore;
    const strict = options.strict ?? false;
    const fs = yield* FileSystem.FileSystem;
    const parent = root.includes('/') ? root.slice(0, root.lastIndexOf('/')) : '.';
    const profilesRoot = `${parent}/profiles`;
    const profilesRootExists = yield* fs
      .exists(profilesRoot)
      .pipe(Effect.orElseSucceed(() => false));
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecCheck',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    // Optional catalogue cross-check. Read and decode it first; a malformed
    // file becomes a root issue and disables cross-checking rather than
    // aborting the whole run.
    let catalogue: Catalogue.Catalogue | undefined;
    const catalogIssues: Array<Issue> = [];
    if (options.catalog !== undefined && options.catalog !== '') {
      const text = yield* fs.readFileString(options.catalog).pipe(
        Effect.matchEffect({
          onFailure: (cause) => Effect.succeed({ text: undefined, error: cause }),
          onSuccess: (contents) => Effect.succeed({ text: contents, error: undefined }),
        }),
      );
      if (text.error !== undefined) {
        catalogIssues.push({
          code: Catalogue.CODES.malformedCatalog,
          field: options.catalog,
          message: "Cannot read catalogue file '" + options.catalog + "'.",
          expected: 'a readable JSON catalogue',
          actual: 'unreadable file',
          fix: 'Pass --catalog with a readable file path.',
          cause: text.error,
        });
      } else if (text.text !== undefined) {
        const decoded = Catalogue.decode(text.text, options.catalog);
        if (EffectResult.isFailure(decoded)) {
          catalogIssues.push(decoded.failure);
        } else {
          catalogue = decoded.success;
        }
      }
    }

    const repoText = yield* store.readRootFile(root, CONFIG_FILE).pipe(
      Effect.matchEffect({
        onFailure: (error) => Effect.succeed({ text: undefined, error }),
        onSuccess: (text) => Effect.succeed({ text, error: undefined }),
      }),
    );
    const rootIssues: Array<Issue> =
      repoText.error !== undefined
        ? [storeIssue(CONFIG_FILE, repoText.error), ...catalogIssues]
        : repoText.text === undefined
          ? [...catalogIssues]
          : [
              ...nestConfig(
                CONFIG_FILE,
                verifySizingText({ path: CONFIG_FILE, kind: 'repo' }, repoText.text).issues,
              ).map(withRepoLayers),
              ...catalogIssues,
            ];
    // Cross-check repo config entries against the catalogue when provided.
    if (catalogue !== undefined) {
      const load = yield* loadRepoSizing(root).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(NO_SIZING),
          onSuccess: (value) => Effect.succeed(value),
        }),
      );
      const tagged = configEntries(load, undefined);
      const entries = tagged.map((item) => item.entry);
      const findings = Catalogue.verify(catalogue, entries);
      for (const found of findings) {
        const optional: OptionalIssueFields = {};
        if (found.expected !== undefined) optional.expected = found.expected;
        if (found.actual !== undefined) optional.actual = found.actual;
        if (found.fix !== undefined) optional.fix = found.fix;
        rootIssues.push({
          code: found.code,
          field: CONFIG_FILE + ': ' + found.field,
          message: found.message,
          severity: 'error',
          ...optional,
        });
      }
    }

    if (options.name !== undefined && !(yield* store.exists(root, options.name))) {
      const issues: ReadonlyArray<Issue> = [
        { field: options.name, message: `Spec directory not found under ${root}.` },
      ];
      return reduceCheck(root, [{ name: options.name, issues }], strict, rootIssues);
    }
    const names = options.name !== undefined ? [options.name] : yield* store.names(root);
    const loadSpec = (
      name: string,
    ): Effect.Effect<CheckEntry, never, SpecStore.SpecStore | FileSystem.FileSystem> =>
      Effect.gen(function* () {
        const snapshot = yield* store.snapshot(root, name);
        const review = yield* store.reviewSeries(root, name);
        const result = verifySpecTree(snapshot, { series: review, requireRounds: false });
        const issues: Array<Issue> = result.issues.map(withSpecLayers);
        if (options.requireComplete === true) {
          const specFile = snapshot.files.find((entry) => entry.path === 'SPEC.md');
          const spec = specFile === undefined ? undefined : parseSpecFile(specFile.content);
          if (spec?.status !== 'complete') {
            const status = spec?.status ?? 'unreadable';
            issues.push({
              code: 'spec.incomplete',
              severity: 'error',
              field: 'status',
              message: `Spec '${snapshot.name}' is not complete (status: '${status}'); finish it or drop the 'Spec: ${snapshot.name}' trailer.`,
            });
          }
        }
        if (profilesRootExists) {
          for (const file of snapshot.files) {
            if (!file.path.endsWith('TASK.md')) continue;
            const task = parseTaskFile(file.content);
            if (task === undefined || task.type !== 'review') continue;
            for (const profile of new Set(task.reviewerProfiles)) {
              const profileFile = `${profilesRoot}/${profile}/PROFILE.md`;
              const exists = yield* fs.exists(profileFile).pipe(Effect.orElseSucceed(() => false));
              if (exists) continue;
              issues.push({
                code: 'reviewer-profile.unknown',
                severity: 'warning',
                field: `${file.path}: ${REVIEWER_PROFILES_FIELD}`,
                message: `Declared reviewer profile '${profile}' was not found under .agents/@montflow/profiles.`,
                actual: profile,
                fix: `Create .agents/@montflow/profiles/${profile}/PROFILE.md or remove '${profile}' from reviewer-profiles.`,
              });
            }
          }
        }
        if (catalogue !== undefined) {
          const load = yield* loadSizing(root, name, snapshot).pipe(
            Effect.matchEffect({
              onFailure: () => Effect.succeed(NO_SIZING),
              onSuccess: (value) => Effect.succeed(value),
            }),
          );
          const tagged = configEntries(load, name).filter((item) => item.layer !== 'repo');
          const entries = tagged.map((item) => item.entry);
          const findings = Catalogue.verify(catalogue, entries);
          for (const found of findings) {
            const optional: OptionalIssueFields = {};
            if (found.expected !== undefined) optional.expected = found.expected;
            if (found.actual !== undefined) optional.actual = found.actual;
            if (found.fix !== undefined) optional.fix = found.fix;
            issues.push({
              code: found.code,
              field: CONFIG_FILE + ': ' + found.field,
              message: found.message,
              severity: 'error',
              ...optional,
            });
          }
        }
        return { name, issues };
      }).pipe(
        Effect.catchTag('@montflow/SpecStoreError', (error): Effect.Effect<CheckEntry> =>
          Effect.succeed({
            name,
            issues: [specReadIssue(root, name, error, { consulted: LAYERS })],
          }),
        ),
      );
    const entries = yield* Effect.forEach(names, loadSpec, {
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    });
    return reduceCheck(root, entries, strict, rootIssues);
  });

/**
 * The `(…)` count suffix on a check spec line, naming errors and warnings apart.
 */
export const checkCounts = (errors: number, warnings: number): string => {
  if (warnings === 0) return errors === 0 ? '' : ` (${errors})`;
  const parts: Array<string> = [];
  if (errors > 0) parts.push(`${errors} issue${errors === 1 ? '' : 's'}`);
  parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  return ` (${parts.join(' \u00b7 ')})`;
};

/**
 * Render one finding: the full agent-first block when it carries a code, the
 * terse `field: message` line for a legacy finding that carries none.
 * @param base - spec name for nested paths, or `''` when the field already
 * carries the full path
 * @param found - the finding
 * @param rerun - command to name in the coded diagnostic
 * @param verbose - add the cause chain and the sizing layer trace
 * @returns the display lines
 */
export const renderIssueBlock = (
  base: string,
  found: Issue,
  rerun: string,
  verbose: boolean,
): ReadonlyArray<string> => {
  if (found.code === undefined) {
    const line = `${isWarning(found) ? '  ! ' : '  '}${found.field}: ${found.message}`;
    return found.fix === undefined ? [line] : [line, `    Fix: ${found.fix}`];
  }
  return indentBlock(renderDiagnostic(diagnosticOfIssue(base, found, rerun), verbose), '  ').split(
    '\n',
  );
};

/**
 * Summarize one file's or spec's warnings: a single line carrying every code
 * with its count and the lexicographically first path it appeared at, plus the
 * existing terse line for a legacy warning with no code. Codes render sorted and
 * each path is its group's lexicographic minimum, so the whole line is a
 * property of the findings, never of discovery or filesystem order. Grouping by
 * code but rendering them together keeps a spec's record codes one line in
 * total, and `--verbose` replaces the summary with each finding's full block.
 * @param base - spec name for nested paths, or `''` when the field already
 * carries the full path
 * @param issues - warning findings in discovery order
 * @param rerun - command to name in each coded finding
 * @returns the display lines, in first-appearance order
 */
export const renderWarningSummary = (
  base: string,
  issues: ReadonlyArray<Issue>,
  rerun: string,
): ReadonlyArray<string> => {
  const groups = new Map<string, { count: number; path: string }>();
  for (const found of issues) {
    if (found.code === undefined) continue;
    const { code, path } = diagnosticOfIssue(base, found, rerun);
    const group = groups.get(code);
    groups.set(code, {
      count: (group?.count ?? 0) + 1,
      // Lexicographic minimum, not first in discovery: a spec's files are read
      // concurrently, so "first" would make the summary line change per run.
      path: group === undefined || path < group.path ? path : group.path,
    });
  }
  const lines: Array<string> = [];
  let groupAt = -1;
  for (const found of issues) {
    if (found.code === undefined) {
      lines.push(`  ! ${found.field}: ${found.message}`);
      if (found.fix !== undefined) lines.push(`    Fix: ${found.fix}`);
      continue;
    }
    // The coded groups keep the position of the first coded warning, so an
    // uncoded legacy warning stays in discovery order around them.
    if (groupAt === -1) groupAt = lines.length;
  }
  if (groups.size === 0) return lines;
  const parts = [...groups]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([code, group]) => `${code} \u00d7 ${group.count} \u00b7 ${group.path}`);
  lines.splice(Math.max(groupAt, 0), 0, `  ! ${parts.join(' \u00b7 ')}`);
  return lines;
};

/**
 * Render findings for one file or spec. Errors always render in full, so a
 * failing tree never hides a finding behind a count. Warnings keep their exact
 * terse or full block under `verbose`; the compact form groups coded ones by
 * code — count, code, and one path — on a single line, so a screenful of
 * advisory findings costs one line instead of a screen each.
 * @param base - spec name for nested paths, or `''` when the field already
 * carries the full path
 * @param issues - findings in discovery order
 * @param rerun - command to name in each coded finding
 * @param verbose - expand every warning into its full block, with cause and layers
 * @returns the display lines
 */
export const renderIssueBlocks = (
  base: string,
  issues: ReadonlyArray<Issue>,
  rerun: string,
  verbose: boolean,
): ReadonlyArray<string> => {
  const rendered = verbose ? issues : issues.filter((found) => !isWarning(found));
  const lines = rendered.flatMap((found) => renderIssueBlock(base, found, rerun, verbose));
  if (verbose) return lines;
  const warnings = issues.filter(isWarning);
  return [...lines, ...renderWarningSummary(base, warnings, rerun)];
};

/**
 * Render a check report. Token-lean by default — every error in its full block,
 * warning groups as one line per spec, plus a one-line summary. `verbose` also
 * lists passing specs and the root, expands each warning group back into its
 * full block, and adds each sizing finding's cause chain and layer trace.
 * Warnings render with a `!` mark, counted apart from issues, and never fail a
 * spec. The repo-level `sizing.json` is reported first, then each spec.
 * @param report - report from {@link check}
 * @param verbose - include passing specs, the root path, expanded warnings,
 *   causes, and layer traces
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
export const checkCommand = Command.make(
  'check',
  {
    dir: dirFlag,
    name: Flag.optional(nameFlag),
    verbose: Flag.Boolean('verbose').pipe(
      Flag.withDescription('Show passing specs, the root path, and every grouped warning in full.'),
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
    catalog: Flag.optional(
      Flag.String('catalog').pipe(
        Flag.withDescription('Read a catalogue file and cross-check config entries against it.'),
      ),
    ),
    requireComplete: Flag.Boolean('require-complete').pipe(
      Flag.withDescription('Fail unless every checked spec status is complete.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const name = Option.isSome(config.name) ? config.name.value : undefined;
        const catalog = Option.isSome(config.catalog) ? config.catalog.value : undefined;
        const options: CheckOptions =
          name === undefined
            ? catalog === undefined
              ? {
                  concurrency: config.concurrency,
                  strict: config.strict,
                  requireComplete: config.requireComplete,
                }
              : {
                  concurrency: config.concurrency,
                  strict: config.strict,
                  catalog,
                  requireComplete: config.requireComplete,
                }
            : catalog === undefined
              ? {
                  name,
                  concurrency: config.concurrency,
                  strict: config.strict,
                  requireComplete: config.requireComplete,
                }
              : {
                  name,
                  concurrency: config.concurrency,
                  strict: config.strict,
                  catalog,
                  requireComplete: config.requireComplete,
                };
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
  Command.withDescription('Mechanically verify spec files, task records, and structure.'),
  Command.provide(SpecStore.Default),
);
