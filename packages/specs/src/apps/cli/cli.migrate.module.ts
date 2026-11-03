import { Console, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';

import { parseMarkdown } from '../../modules/frontmatter/index.js';
import {
  PHASE_FILE,
  PHASE_MEMORY_FILE,
  derivePhaseStatus,
  parsePhaseGateStages,
  renderPhaseFile,
  renderPhaseMemory,
} from '../../modules/phase/index.js';
import {
  SPEC_STANDARD_VERSION,
  SPEC_VERSION_FIELD,
  PHASE_PATTERN,
  parseSpecFile,
  readSpecVersion,
} from '../../modules/spec/index.js';
import {
  type SpecFileEntry,
  type SpecSnapshot,
  NO_REVIEW,
  isV2Transformed,
  verifySpecTree,
} from '../../modules/structure/index.js';
import {
  type TaskStatus,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
  phaseRank,
} from '../../modules/task/index.js';
import { type Issue, issue } from '../../modules/verify/index.js';

import { SpecStore } from '../../services/index.js';

import {
  type SizingDiagnostic,
  SurfaceError,
  diagnostic,
  dirFlag,
  opt,
  runDiagnosed,
  storeDirOf,
  verboseFlag,
  SURFACE_CODES,
} from './cli.shared.module.js';

/** One task-directory move: flat root directory → phase-prefixed directory. */
export interface MigrationMove {
  readonly from: string;
  readonly to: string;
}

/** A migration plan for one spec. */
export type MigrationPlan =
  | { readonly kind: 'migrate'; readonly moves: ReadonlyArray<MigrationMove> }
  | { readonly kind: 'upgrade' }
  | { readonly kind: 'already' }
  | { readonly kind: 'frozen' }
  | { readonly kind: 'refused'; readonly reason: string };

/** The upgrade pass for a phase tree: files to write and its own refusal. */
export type UpgradePlan =
  | { readonly kind: 'upgrade'; readonly writes: ReadonlyArray<SpecFileEntry> }
  | { readonly kind: 'already' }
  | { readonly kind: 'refused'; readonly reason: string };

/** Every root-level directory, declared or implied by a file path. */
const rootDirsOf = (snapshot: SpecSnapshot): ReadonlyArray<string> => {
  const dirs = new Set<string>();
  for (const entry of snapshot.files) {
    const slash = entry.path.indexOf('/');
    if (slash !== -1) dirs.add(entry.path.slice(0, slash));
  }
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'directory' || entry.path.includes('/')) continue;
    dirs.add(entry.path);
  }
  return [...dirs].toSorted();
};

/** The parsed version of a snapshot's SPEC.md. */
const versionOf = (snapshot: SpecSnapshot) => {
  const specFile = snapshot.files.find((file) => file.path === 'SPEC.md');
  const parsed = specFile === undefined ? null : parseMarkdown(specFile.content);
  return parsed === null ? undefined : readSpecVersion(parsed.fields);
};

/** A version finding that makes migration refuse rather than guess. */
const versionRefusal = (snapshot: SpecSnapshot): string | undefined => {
  const version = versionOf(snapshot);
  if (version === undefined) return 'SPEC.md has no readable frontmatter.';
  const error = version.issues.find((found) => (found.severity ?? 'error') === 'error');
  return error?.message;
};

/**
 * Plan the version upgrade for a phase tree: every missing `PHASE.md` and
 * phase `MEMORY.md`, then the single `SPEC.md` version line, last. Migration
 * never invents a waiver, prose, or a review task. Pure — the caller writes.
 * @param snapshot - the spec directory listing
 * @returns the writes, an already-upgraded marker, or a refusal
 */
export const planUpgrade = (snapshot: SpecSnapshot): UpgradePlan => {
  const version = versionOf(snapshot);
  if (version === undefined) {
    return { kind: 'refused', reason: 'SPEC.md has no readable frontmatter.' };
  }
  const refusal = versionRefusal(snapshot);
  if (refusal !== undefined) return { kind: 'refused', reason: refusal };

  const rootDirs = rootDirsOf(snapshot);
  const phaseDirs = rootDirs.filter((dir) => PHASE_PATTERN.test(dir));
  if (phaseDirs.length === 0) {
    return { kind: 'refused', reason: `Spec '${snapshot.name}' has no phase directories.` };
  }

  const files = snapshot.files.filter((entry) => (entry.kind ?? 'file') === 'file');
  const fileAt = (path: string): string | undefined =>
    files.find((entry) => entry.path === path)?.content;

  const tasks = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => parseTaskFile(file.content))
    .filter((task) => task !== undefined);
  const statusesByPhase = new Map<string, Array<TaskStatus>>();
  for (const task of tasks) {
    const phase = phaseOf(task.id);
    const bucket = statusesByPhase.get(phase) ?? [];
    bucket.push(task.status);
    statusesByPhase.set(phase, bucket);
  }

  const writes: Array<SpecFileEntry> = [];
  for (const phase of phaseDirs.toSorted((a, b) => phaseRank(a) - phaseRank(b))) {
    const phasePath = `${phase}/${PHASE_FILE}`;
    if (fileAt(phasePath) === undefined) {
      const gateText = fileAt(`${phase}/GATES.md`);
      let gate: 'none' | 'mechanical' | 'subjective' = 'none';
      if (gateText !== undefined) {
        const stages = parsePhaseGateStages(gateText);
        const kinds = new Set(stages.map((stage) => stage.kind));
        if (stages.length === 0 || stages.some((stage) => stage.kind === undefined)) {
          return {
            kind: 'refused',
            reason: `Phase '${phase}' GATES.md has an unclassified stage; decide its kind by hand before migrating.`,
          };
        }
        if (kinds.size > 1) {
          return {
            kind: 'refused',
            reason: `Phase '${phase}' GATES.md mixes stage kinds; split it or decide one kind by hand before migrating.`,
          };
        }
        gate = (stages[0]?.kind ?? 'mechanical') satisfies 'mechanical' | 'subjective';
      }
      const status = derivePhaseStatus(statusesByPhase.get(phase) ?? []);
      writes.push({
        path: phasePath,
        content: renderPhaseFile({
          id: phase,
          objective: `TODO: state what phase ${phase} must achieve.`,
          status,
          review: 'required',
          gate,
          notes: 'Migrated to the v2 phase record; the owner replaces this objective.',
        }),
      });
    }
    if (fileAt(`${phase}/${PHASE_MEMORY_FILE}`) === undefined) {
      writes.push({
        path: `${phase}/${PHASE_MEMORY_FILE}`,
        content: renderPhaseMemory(),
      });
    }
  }

  if (version.version !== SPEC_STANDARD_VERSION) {
    const specFile = snapshot.files.find((file) => file.path === 'SPEC.md');
    if (specFile !== undefined) {
      writes.push({
        path: 'SPEC.md',
        content: withSpecVersion(specFile.content, SPEC_STANDARD_VERSION),
      });
    }
  }

  if (writes.length === 0) {
    const transformed = isV2Transformed(snapshot);
    return transformed.ok
      ? { kind: 'already' }
      : { kind: 'refused', reason: transformed.reason ?? 'the tree is not v2' };
  }
  return { kind: 'upgrade', writes };
};

/**
 * Plan a flat-to-phase migration from a snapshot: one move per root task
 * directory, phases in rank order. A complete spec is frozen unless the caller
 * explicitly includes it. Pure — the caller applies the plan.
 * @param snapshot - the spec directory listing
 * @param options - `includeComplete` opts a complete spec into the upgrade
 * @returns the plan, an already-migrated marker, a frozen marker, or a refusal
 */
export const planMigration = (
  snapshot: SpecSnapshot,
  options: { readonly includeComplete?: boolean | undefined } = {},
): MigrationPlan => {
  const refusal = versionRefusal(snapshot);
  if (refusal !== undefined) return { kind: 'refused', reason: refusal };

  const specFile = snapshot.files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : parseSpecFile(specFile.content);
  if (spec?.status === 'complete' && options.includeComplete !== true) {
    return { kind: 'frozen' };
  }

  const rootDirs = rootDirsOf(snapshot);
  const phaseDirs = rootDirs.filter((dir) => PHASE_PATTERN.test(dir));
  const flat = rootDirs.filter((dir) => parseTaskDirName(dir) !== undefined);

  if (phaseDirs.length > 0 && flat.length > 0) {
    return {
      kind: 'refused',
      reason: `Spec '${snapshot.name}' mixes task directories at the root with phase directories; resolve it by hand.`,
    };
  }
  const unparsable = rootDirs.filter(
    (dir) => !PHASE_PATTERN.test(dir) && parseTaskDirName(dir) === undefined,
  );
  if (phaseDirs.length === 0 && unparsable.length > 0) {
    return {
      kind: 'refused',
      reason: `Spec '${snapshot.name}' has an unexpected root directory '${unparsable[0]}'; expected a task directory or a phase directory.`,
    };
  }
  const strayFiles = snapshot.files.filter(
    (file) =>
      (file.kind ?? 'file') === 'file' &&
      file.path !== 'SPEC.md' &&
      file.path !== 'sizing.json' &&
      !file.path.includes('/'),
  );
  if (phaseDirs.length === 0 && strayFiles.length > 0) {
    return {
      kind: 'refused',
      reason: `Spec '${snapshot.name}' has an unexpected root file '${strayFiles[0]?.path}'; move or remove it before migrating.`,
    };
  }
  if (phaseDirs.length > 0) {
    const upgrade = planUpgrade(snapshot);
    if (upgrade.kind === 'already') return { kind: 'already' };
    if (upgrade.kind === 'refused') return { kind: 'refused', reason: upgrade.reason };
    return { kind: 'upgrade' };
  }
  if (flat.length === 0) {
    return {
      kind: 'refused',
      reason: `Spec '${snapshot.name}' has no task directories to migrate.`,
    };
  }

  const moves = flat
    .map((dir) => {
      const phase = parseTaskDirName(dir)?.phase ?? '';
      return { from: dir, to: `${phase}/${dir}`, phase };
    })
    .toSorted((a, b) => phaseRank(a.phase) - phaseRank(b.phase) || a.from.localeCompare(b.from))
    .map(({ from, to }) => ({ from, to }));
  return { kind: 'migrate', moves };
};

/** Insert or replace exactly one `spec-version` line, before the closing fence. */
export const withSpecVersion = (markdown: string, version: number): string => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(newline);
  if ((lines[0] ?? '').trim() !== '---') return markdown;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closing === -1) return markdown;
  const frontmatter = lines.slice(1, closing);
  const line = `${SPEC_VERSION_FIELD}: ${version}`;
  const index = frontmatter.findIndex((entry) => /^spec-version\s*:/.test(entry.trim()));
  if (index === -1) frontmatter.push(line);
  else frontmatter[index] = line;
  return [lines[0] ?? '---', ...frontmatter, ...lines.slice(closing)].join(newline);
};

/** Outcome for one spec in a migration run. */
export interface MigrateSpecResult {
  readonly name: string;
  readonly status:
    | 'migrated'
    | 'upgraded'
    | 'already'
    | 'frozen'
    | 'planned'
    | 'refused'
    | 'failed';
  readonly moves: ReadonlyArray<MigrationMove>;
  /** Paths this run wrote, or would write under `--dry-run`. */
  readonly writes: ReadonlyArray<string>;
  readonly issues: ReadonlyArray<Issue>;
}

/** Whole-run migration result. */
export interface MigrateReport {
  readonly root: string;
  readonly specs: ReadonlyArray<MigrateSpecResult>;
}

/** Options for {@link migrate}. */
export interface MigrateOptions {
  /** Migrate one spec; omitted with `all` migrates the whole store. */
  readonly name?: string | undefined;
  /** Migrate every spec under the root. */
  readonly all?: boolean | undefined;
  /** Print the plan without writing anything. */
  readonly dryRun?: boolean | undefined;
  /** Upgrade a `status: complete` spec instead of freezing it. */
  readonly includeComplete?: boolean | undefined;
}

/**
 * Reverse the moves a migration applied, newest first, then remove every phase
 * directory the moves created. Used on a failed move and on a failed post-move
 * verification, so a run that does not report success leaves no half-migrated
 * tree behind.
 * @param store - the spec store
 * @param root - spec root directory
 * @param name - spec name
 * @param applied - moves that succeeded, in application order
 * @returns true when any reverse move or directory removal failed
 */
const rollbackMoves = (
  store: SpecStore.Service,
  root: string,
  name: string,
  applied: ReadonlyArray<MigrationMove>,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    let rollbackFailed = false;
    for (const done of applied.toReversed()) {
      yield* store.move(root, name, done.to, done.from).pipe(
        Effect.matchEffect({
          onFailure: () => {
            rollbackFailed = true;
            return Effect.void;
          },
          onSuccess: () => Effect.void,
        }),
      );
    }
    const phases = new Set(applied.map((move) => move.to.slice(0, move.to.indexOf('/'))));
    for (const phase of phases) {
      yield* store.removeDirectory(root, name, phase).pipe(
        Effect.matchEffect({
          onFailure: () => {
            rollbackFailed = true;
            return Effect.void;
          },
          onSuccess: () => Effect.void,
        }),
      );
    }
    return rollbackFailed;
  });

/**
 * Remove the files an upgrade created and restore the original `SPEC.md`. Only
 * files this run created are removed; a pre-existing phase record is never
 * touched.
 */
const rollbackUpgrade = (
  store: SpecStore.Service,
  root: string,
  name: string,
  created: ReadonlyArray<string>,
  specBefore: string | undefined,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    let rollbackFailed = false;
    if (specBefore !== undefined) {
      yield* store.write(root, name, [{ path: 'SPEC.md', content: specBefore }]).pipe(
        Effect.matchEffect({
          onFailure: () => {
            rollbackFailed = true;
            return Effect.void;
          },
          onSuccess: () => Effect.void,
        }),
      );
    }
    for (const path of created.toReversed()) {
      yield* store.removeFile(root, name, path).pipe(
        Effect.matchEffect({
          onFailure: () => {
            rollbackFailed = true;
            return Effect.void;
          },
          onSuccess: () => Effect.void,
        }),
      );
    }
    return rollbackFailed;
  });

/**
 * Migrate a spec (or every spec) into the v2 phase tree: move flat task
 * directories, write any missing `PHASE.md`/phase `MEMORY.md`, and add the
 * single `spec-version` line last. A move never edits a file. On the first
 * failed move, and on a failed post-write verification, every applied change is
 * reversed, so the store is never left half-migrated.
 * @param root - spec root directory
 * @param options - one spec or all, dry-run, and complete-spec inclusion
 * @returns one result per spec
 */
export const migrate = (
  root: string,
  options: MigrateOptions,
): Effect.Effect<MigrateReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const operation = 'SpecMigrate';
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({ operation, reason: `Specs directory not found: ${root}` }),
      );
    }
    const names = options.name === undefined ? yield* store.names(root) : [options.name];
    if (options.name !== undefined && !(yield* store.exists(root, options.name))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation,
          reason: `Spec '${options.name}' not found under ${root}.`,
        }),
      );
    }

    const results: Array<MigrateSpecResult> = [];
    for (const name of names) {
      const snapshot = yield* store.snapshot(root, name);
      const plan = planMigration(snapshot, { includeComplete: options.includeComplete });
      if (plan.kind === 'refused') {
        results.push({
          name,
          status: 'refused',
          moves: [],
          writes: [],
          issues: [issue(name, plan.reason)],
        });
        continue;
      }
      if (plan.kind === 'frozen') {
        results.push({ name, status: 'frozen', moves: [], writes: [], issues: [] });
        continue;
      }

      const applied: Array<MigrationMove> = [];
      if (plan.kind === 'migrate') {
        if (options.dryRun === true) {
          results.push({ name, status: 'planned', moves: plan.moves, writes: [], issues: [] });
          continue;
        }
        let failure: string | undefined;
        for (const move of plan.moves) {
          const outcome = yield* store.move(root, name, move.from, move.to).pipe(Effect.result);
          if ('failure' in outcome) {
            failure = outcome.failure.reason;
            break;
          }
          applied.push(move);
        }
        if (failure !== undefined) {
          const rollbackFailed = yield* rollbackMoves(store, root, name, applied);
          results.push({
            name,
            status: 'failed',
            moves: [],
            writes: [],
            issues: [
              issue(
                name,
                rollbackFailed
                  ? `Rollback incomplete after '${failure}'; inspect the tree before retrying.`
                  : `Migration rolled back: ${failure}`,
              ),
            ],
          });
          continue;
        }
      }

      const afterMoves = yield* store.snapshot(root, name);
      const upgrade = planUpgrade(afterMoves);
      if (upgrade.kind === 'refused') {
        const rollbackFailed = yield* rollbackMoves(store, root, name, applied);
        results.push({
          name,
          status: 'failed',
          moves: [],
          writes: [],
          issues: [
            issue(name, upgrade.reason),
            ...(applied.length === 0
              ? []
              : [
                  issue(
                    name,
                    rollbackFailed
                      ? 'Rollback incomplete; inspect the tree before retrying.'
                      : 'Migration rolled back.',
                  ),
                ]),
          ],
        });
        continue;
      }
      if (upgrade.kind === 'already') {
        const verified = verifySpecTree(afterMoves, NO_REVIEW);
        if (!verified.valid) {
          results.push({ name, status: 'failed', moves: [], writes: [], issues: verified.issues });
        } else {
          results.push({
            name,
            status: plan.kind === 'migrate' ? 'migrated' : 'already',
            moves: plan.kind === 'migrate' ? plan.moves : [],
            writes: [],
            issues: [],
          });
        }
        continue;
      }

      if (options.dryRun === true) {
        results.push({
          name,
          status: 'planned',
          moves: plan.kind === 'migrate' ? plan.moves : [],
          writes: upgrade.writes.map((write) => write.path),
          issues: [],
        });
        continue;
      }

      const specBefore = snapshot.files.find((file) => file.path === 'SPEC.md')?.content;
      const existing = new Set(
        snapshot.files
          .filter((entry) => (entry.kind ?? 'file') === 'file')
          .map((entry) => entry.path),
      );
      const created: Array<string> = [];
      for (const write of upgrade.writes) {
        yield* store.write(root, name, [write]);
        if (!existing.has(write.path)) created.push(write.path);
      }

      const after = yield* store.snapshot(root, name);
      const verified = verifySpecTree(after, NO_REVIEW);
      if (!verified.valid) {
        const upgradeRollbackFailed = yield* rollbackUpgrade(
          store,
          root,
          name,
          created,
          specBefore,
        );
        const moveRollbackFailed = yield* rollbackMoves(store, root, name, applied);
        results.push({
          name,
          status: 'failed',
          moves: [],
          writes: [],
          issues: [
            ...verified.issues,
            issue(
              name,
              upgradeRollbackFailed || moveRollbackFailed
                ? 'Rollback incomplete after the upgraded tree failed verification; inspect the tree before retrying.'
                : 'Migration rolled back: the upgraded tree failed verification.',
            ),
          ],
        });
        continue;
      }

      results.push({
        name,
        status: plan.kind === 'migrate' ? 'migrated' : 'upgraded',
        moves: plan.kind === 'migrate' ? plan.moves : [],
        writes: upgrade.writes.map((write) => write.path),
        issues: [],
      });
    }
    return { root, specs: results };
  });

/**
 * Render a migration report: one header and planned changes per spec, findings
 * under a failure, then a summary line.
 * @param report - report from {@link migrate}
 * @returns the display text
 */
export const renderMigrate = (report: MigrateReport): string => {
  const lines: Array<string> = [];
  for (const spec of report.specs) {
    if (spec.status === 'already') {
      lines.push(`• ${spec.name} is already on the v2 phase tree — nothing to migrate.`);
      continue;
    }
    if (spec.status === 'frozen') {
      lines.push(`• ${spec.name} is complete and stays frozen at v1.`);
      continue;
    }
    if (spec.status === 'refused' || spec.status === 'failed') {
      lines.push(`✗ ${spec.name}`);
      for (const move of spec.moves) lines.push(`  moved '${move.from}' -> '${move.to}'`);
      for (const found of spec.issues) lines.push(`  ${found.field}: ${found.message}`);
      continue;
    }
    const verb = spec.status === 'planned' ? 'would move' : 'moved';
    const wrote = spec.status === 'planned' ? 'would write' : 'wrote';
    lines.push(
      spec.status === 'upgraded'
        ? `✓ ${spec.name} (upgraded)`
        : `✓ ${spec.name} (${spec.moves.length})`,
    );
    for (const move of spec.moves) lines.push(`  ${verb} '${move.from}' -> '${move.to}'`);
    for (const path of spec.writes) lines.push(`  ${wrote} '${path}'`);
  }
  const migrated = report.specs.filter((spec) => spec.status === 'migrated').length;
  const upgraded = report.specs.filter((spec) => spec.status === 'upgraded').length;
  const planned = report.specs.filter((spec) => spec.status === 'planned').length;
  const frozen = report.specs.filter((spec) => spec.status === 'frozen').length;
  const bad = report.specs.filter(
    (spec) => spec.status === 'refused' || spec.status === 'failed',
  ).length;
  lines.push('');
  lines.push(
    `${report.specs.length} spec${report.specs.length === 1 ? '' : 's'} · ${migrated} migrated · ${upgraded} upgraded · ${planned} planned · ${frozen} frozen · ${bad} failed`,
  );
  return lines.join('\n');
};

/** Diagnostic for `migrate` called without `--name` or `--all`. */
export const migrateSelectorDiagnostic = (): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: 'migrate',
    field: '--name',
    problem: 'migrate requires --name <spec> or --all.',
    rerun: 'mf-specs migrate --all --dry-run',
    expected: '--name <spec> or --all',
    actual: 'neither',
    fix: 'Pass --name <spec> for one spec, or --all for the whole store.',
  });

/** True when a run left at least one spec refused or failed. */
export const migrateFailed = (report: MigrateReport): boolean =>
  report.specs.some((spec) => spec.status === 'refused' || spec.status === 'failed');

export const migrateCommand = Command.make(
  'migrate',
  {
    dir: dirFlag,
    name: Flag.optional(Flag.String('name').pipe(Flag.withDescription('Spec directory name.'))),
    all: Flag.Boolean('all').pipe(
      Flag.withDescription('Migrate every spec under the root.'),
      Flag.withDefault(false),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDescription('Print the plan without writing anything.'),
      Flag.withDefault(false),
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        if (config.name === undefined && !config.all) {
          return yield* Effect.fail(
            new SurfaceError({
              operation: 'SpecMigrate',
              diagnostics: [migrateSelectorDiagnostic()],
            }),
          );
        }
        const report = yield* migrate(storeDirOf(config.dir), {
          name: opt(config.name),
          all: config.all,
          dryRun: config.dryRun,
        });
        yield* Console.log(renderMigrate(report));
        if (migrateFailed(report)) {
          yield* Effect.sync(() => {
            process.exitCode = 1;
          });
        }
      }),
      () => ({
        path: storeDirOf(config.dir),
        rerun: 'mf-specs migrate --all',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Move flat task directories under their phase directories and upgrade a v1 tree to the v2 phase record.',
  ),
  Command.provide(SpecStore.Default),
);
