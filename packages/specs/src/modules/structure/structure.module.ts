import {
  PHASE_PATTERN,
  type TaskRow,
  parseSpecFile,
  parseTaskTable,
  readSpecVersion,
  verifySpecFile,
  SPEC_VERSION_CODES,
  SPEC_VERSION_FIELD,
} from '../spec/index.js';
import { fieldString, parseMarkdown } from '../frontmatter/index.js';
import { tierOfSpec } from '../creation/index.js';
import {
  GATE_CODES,
  GATE_RESULTS_FILE,
  verifyGateProgress,
  verifyGateResults,
  verifyGatesFile,
  parseGates,
  stageScope,
} from '../gates/index.js';
import {
  type GateStageEntry,
  isNoneScope,
  scopeContains,
  unfinished,
  verifyGateStageDuplicates,
  verifyPhaseParallelism,
  verifyTaskWriteScopes,
} from './structure.parallel.module.js';
import { verify as verifyLifecycle } from '../lifecycle/index.js';
import { verifyMemoryFile } from '../memory/index.js';
import { MAILBOX_FILE, type ChannelKind, verifyChannel } from '../channel/index.js';
import {
  PHASE_BOARD_FILE,
  PHASE_CODES,
  PHASE_DIR_FILES,
  PHASE_FILE,
  PHASE_GATES_FILE,
  PHASE_MEMORY_FILE,
  phaseEvidence,
  parsePhaseFile,
  verifyPhaseFile,
} from '../phase/index.js';
import {
  type PhaseBudget,
  type ReviewTaskEntry,
  type SeriesSnapshot,
  passedPhases,
  seriesNames,
  verify as verifyReviewLink,
  verifyBudgets as verifyReviewBudgets,
  verifyDeferrals as verifyReviewDeferrals,
} from '../review-link/index.js';
import {
  type PhaseReviewInput,
  REVIEW_NOT_PASSED_CODE,
  REVIEW_REASONS,
  passedReviewPhases,
  reviewVerdict,
} from '../review-policy/index.js';
import {
  type Task,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
  phaseRank,
  sizeOf,
  verifyTaskFile,
  writeScopeTokens,
} from '../task/index.js';
import { REPO_SCOPE } from '../scheduler/index.js';
import {
  CODES,
  CONFIG_FILE,
  type ConfigSource,
  phaseReviewBudget,
  verifyText,
} from '../sizing/index.js';
import { type Issue, type Result, finding, issue, noErrors } from '../verify/index.js';

/**
 * One entry inside a spec directory, as seen by the verifier.
 * `path` is POSIX-relative to the spec root (e.g. `A/A001-explore/TASK.md`).
 * The verifier never touches disk — the caller supplies the snapshot.
 */
export interface SpecFileEntry {
  /** POSIX-relative path from the spec root. */
  readonly path: string;
  /** Raw file contents. Empty for directories. */
  readonly content: string;
  /**
   * Whether the entry is a file or a directory. Optional so a caller may
   * supply a file-only listing; a missing kind means `file`.
   */
  readonly kind?: 'file' | 'directory';
}

/** In-memory listing of a spec directory, supplied by the caller. */
export interface SpecSnapshot {
  /** Spec directory slug (matches SPEC.md `name`). */
  readonly name: string;
  /** Every file and, optionally, directory under the spec root. */
  readonly files: ReadonlyArray<SpecFileEntry>;
}

/** Files a task directory may contain. */
const TASK_DIR_FILES = new Set([
  'TASK.md',
  'MEMORY.md',
  'GATES.md',
  'MAILBOX.md',
  GATE_RESULTS_FILE,
]);

/** Files every task directory must contain. */
const TASK_DIR_REQUIRED = ['TASK.md', 'MEMORY.md'] as const;

/** Root files a spec directory may contain; everything else is stray. */
const SPEC_ROOT_FILES = new Set(['SPEC.md', CONFIG_FILE]);

/** Helpful placement hints for files that belong inside a task directory. */
const ROOT_STRAY_HINT = new Map<string, string>([
  ['TASK.md', 'TASK.md must live inside a task directory: <phase>/A001-<kebab-name>/TASK.md.'],
  [
    'MEMORY.md',
    'MEMORY.md must live inside a task directory: <phase>/A001-<kebab-name>/MEMORY.md.',
  ],
  ['GATES.md', 'GATES.md must live inside a task directory: <phase>/A001-<kebab-name>/GATES.md.'],
]);

/** A leading task id with no `-<name>` yet, e.g. `A001`. */
const TASK_ID_PREFIX = /^[A-Z]{1,2}\d{3}/;

/** Normalize an entry's kind, treating a missing kind as a file. */
const kindOf = (entry: SpecFileEntry): 'file' | 'directory' => entry.kind ?? 'file';

/** Parent directory path, or `''` for a top-level entry. */
const parentOf = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
};

/** Final path segment. */
const baseOf = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
};

/**
 * Every directory path implied by the snapshot: the declared directory entries
 * plus the parents of every file path. The union lets a file-only snapshot keep
 * verifying while a declared empty directory stays observable.
 */
const directoryPaths = (entries: ReadonlyArray<SpecFileEntry>): Set<string> => {
  const dirs = new Set<string>();
  for (const entry of entries) {
    if (kindOf(entry) !== 'directory') continue;
    let declared = entry.path;
    while (declared !== '') {
      dirs.add(declared);
      declared = parentOf(declared);
    }
  }
  for (const entry of entries) {
    if (kindOf(entry) !== 'file') continue;
    let parent = parentOf(entry.path);
    while (parent !== '') {
      dirs.add(parent);
      parent = parentOf(parent);
    }
  }
  return dirs;
};

/**
 * Find the first `depends-on` cycle, if any. Returns the offending ids in
 * cycle order (the repeated id closes the cycle).
 */
const findCycle = (tasks: ReadonlyMap<string, Task>): ReadonlyArray<string> | undefined => {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: Array<string> = [];
  let cycle: Array<string> | undefined;

  const visit = (id: string): void => {
    if (cycle !== undefined) return;
    const current = state.get(id);
    if (current === 'done') return;
    if (current === 'visiting') {
      cycle = stack.slice(stack.indexOf(id)).concat(id);
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    const task = tasks.get(id);
    if (task !== undefined) {
      for (const dep of task.dependsOn) visit(dep);
    }
    stack.pop();
    state.set(id, 'done');
  };

  for (const id of tasks.keys()) visit(id);
  return cycle;
};

/**
 * Prefix a nested file's issues with its path so output is actionable, keeping
 * each finding's severity, fix, and line intact.
 */
const nest = (path: string, result: Result): ReadonlyArray<Issue> =>
  result.issues.map((found) => ({ ...found, field: `${path}: ${found.field}` }));

/**
 * Verify an optional spec-root `sizing.json` against the contract, given the
 * phase ids the spec actually holds. A phase override with a well-formed id
 * but no task in this spec is an unused override (warning), not a broken
 * config; a malformed phase key stays an error.
 */
const verifySpecConfig = (name: string, phases: ReadonlyArray<string>, text: string): Result => {
  const source: ConfigSource = { path: `${name}/${CONFIG_FILE}`, kind: 'spec', phases };
  const found = verifyText(source, text).issues.map((issueFound) =>
    issueFound.code === CODES.unknownPhase &&
    issueFound.actual !== undefined &&
    PHASE_PATTERN.test(issueFound.actual)
      ? {
          ...issueFound,
          severity: 'warning' as const,
          message: `Phase '${issueFound.actual}' has no tasks in this spec; the override is unused.`,
          expected: 'a phase with at least one task',
          fix: `Remove '${issueFound.field}' from ${CONFIG_FILE}, or add a task in phase ${issueFound.actual}.`,
        }
      : issueFound,
  );
  return { valid: noErrors(found), issues: found };
};

/** Review-store input for the cross-store checks. */
export interface ReviewInput {
  /** The spec's review series, as the review store supplies them. */
  readonly series: ReadonlyArray<SeriesSnapshot>;
  /**
   * True when every complete `review` task must have a round attributed to its
   * phase in every expected series, regardless of the spec version. A v2 tree
   * already requires this whenever the review store is available; the flag is
   * for a caller (the workspace dashboard) that wants the rule even where the
   * version check would not apply. The budget check still applies to every
   * series that exists.
   */
  readonly requireRounds: boolean;
  /**
   * True when the caller actually consulted the review store. A caller with no
   * review store (`NO_REVIEW`) leaves this false, so a v2 tree is not required
   * to carry rounds it was never asked to read.
   */
  readonly available?: boolean | undefined;
}

/**
 * The review input for a caller that holds no review store: no series, no
 * round-presence requirement. Structure-only verification and a store that has
 * no review directory pass this explicitly, so omitting the review input can
 * never silently disable the budget check.
 */
export const NO_REVIEW: ReviewInput = { series: [], requireRounds: false, available: false };

/** Result of the v2-transformation predicate. */
export interface TransformResult {
  /** True when the tree is the v2 shape. */
  readonly ok: boolean;
  /** First failing reason, when `ok` is false. */
  readonly reason?: string;
}

/**
 * The version-independent v2 tree predicate. True iff every phase directory
 * holds a `PHASE.md` whose id equals the directory, no task directory sits at
 * the spec root, and every file in a phase or task directory is on its v2
 * allowlist. The declared `spec-version` is checked separately; a record cannot
 * relabel itself v2 while keeping the v1 shape.
 * @param snapshot - the spec directory listing
 * @returns whether the tree is transformed, and the first reason it is not
 */
export const isV2Transformed = (snapshot: SpecSnapshot): TransformResult => {
  const files = snapshot.files.filter((entry) => kindOf(entry) === 'file');
  const dirs = directoryPaths(snapshot.files);
  const childrenOf = (dir: string): ReadonlyArray<string> =>
    [...dirs].filter((path) => parentOf(path) === dir);

  for (const dir of childrenOf('')) {
    if (parseTaskDirName(dir) !== undefined) {
      return { ok: false, reason: `task directory '${dir}' sits at the spec root` };
    }
  }

  for (const phase of childrenOf('').filter((dir) => PHASE_PATTERN.test(dir))) {
    const phaseFile = files.find((file) => file.path === `${phase}/${PHASE_FILE}`);
    if (phaseFile === undefined) {
      return { ok: false, reason: `phase '${phase}' has no PHASE.md` };
    }
    const parsed = parsePhaseFile(phaseFile.content);
    if (parsed === undefined) {
      return { ok: false, reason: `phase '${phase}' has an unreadable PHASE.md` };
    }
    if (parsed.id !== phase) {
      return { ok: false, reason: `phase '${phase}' PHASE.md id is '${parsed.id}'` };
    }
    for (const file of files) {
      if (parentOf(file.path) !== phase) continue;
      const name = baseOf(file.path);
      if (!PHASE_DIR_FILES.has(name)) {
        return { ok: false, reason: `phase '${phase}' holds unexpected file '${name}'` };
      }
    }
    for (const taskDir of childrenOf(phase)) {
      for (const file of files) {
        if (parentOf(file.path) !== taskDir) continue;
        if (!TASK_DIR_FILES.has(baseOf(file.path))) {
          return { ok: false, reason: `task directory '${taskDir}' holds an unexpected file` };
        }
      }
    }
  }

  return { ok: true };
};

/**
 * Every phase's inputs to the shared review-pass predicate, derived from a
 * snapshot: the profiles its review task declares, its own task-derived
 * budget, and whether its waiver is effective. A phase with no task is not a
 * phase the lifecycle rolls up, so it contributes nothing.
 * @param snapshot - the spec directory listing
 * @returns one entry per phase that holds a task, in phase order
 */
export const phaseReviewInputs = (snapshot: SpecSnapshot): ReadonlyArray<PhaseReviewInput> => {
  const tasks: Array<Task> = [];
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'file' || !entry.path.endsWith('/TASK.md')) continue;
    const task = parseTaskFile(entry.content);
    if (task !== undefined) tasks.push(task);
  }
  const evidence = phaseEvidence(snapshot);
  const phases = [...new Set(tasks.map((task) => phaseOf(task.id)))].toSorted(
    (a, b) => phaseRank(a) - phaseRank(b),
  );
  return phases.map((phase) => {
    const inPhase = tasks.filter((task) => phaseOf(task.id) === phase);
    return {
      phase,
      profiles: [
        ...new Set(
          inPhase.filter((task) => task.type === 'review').flatMap((task) => task.reviewerProfiles),
        ),
      ],
      budget: phaseReviewBudget(inPhase.map((task) => ({ type: task.type, size: sizeOf(task) }))),
      waived: evidence.waived.includes(phase),
    };
  });
};

/**
 * The phases a spec's review has passed, version-aware. A v2 record reads the
 * shared `review decide` predicate every lock surface uses; a frozen v1 record
 * keeps the closed-round rule it shipped with.
 * @param snapshot - the spec directory listing
 * @param review - the linked review series and round-presence rule
 * @returns the phases that may lock on their review, in phase order
 */
export const reviewedPhasesOf = (
  snapshot: SpecSnapshot,
  review: ReviewInput,
): ReadonlyArray<string> => {
  const specFile = snapshot.files.find(
    (entry) => entry.path === 'SPEC.md' && (entry.kind ?? 'file') === 'file',
  );
  const parsed = specFile === undefined ? null : parseMarkdown(specFile.content);
  const version = parsed === null ? undefined : readSpecVersion(parsed.fields);
  return version !== undefined && version.version >= 2 && review.available !== false
    ? passedReviewPhases(snapshot.name, phaseReviewInputs(snapshot), review.series)
    : passedPhases(review.series);
};

import {
  EXECUTION_BRIEF_ELEMENTS,
  EXECUTION_BRIEF_MISSING_CODE,
  EXECUTION_BRIEF_SECTION,
  executionBriefStatus,
} from './structure.brief.module.js';

export {
  EXECUTION_BRIEF_ELEMENTS,
  EXECUTION_BRIEF_MISSING_CODE,
  EXECUTION_BRIEF_SECTION,
  executionBriefStatus,
  type ExecutionBriefStatus,
} from './structure.brief.module.js';

/** Stable code for a v2 task type that must carry `GATES.md` but does not. */
export const TASK_GATES_REQUIRED_CODE = 'task.gates-required';

export {
  PHASE_SERIAL_CHAIN_UNEXPLAINED_CODE,
  PHASE_WRITE_SCOPE_OVERLAP_CODE,
  TASK_WRITE_SCOPE_MISSING_CODE,
  scopeContains,
  verifyGateStageDuplicates,
  verifyPhaseParallelism,
  verifyTaskWriteScopes,
  type GateStageEntry,
} from './structure.parallel.module.js';

/** Stable code for a surviving v2 `locked-phases` field. */
export const LOCKED_PHASES_PRESENT_CODE = 'spec.locked-phases';

/** Task types whose tier contract requires a mechanical proof file. */
const GATED_TASK_TYPES = new Set(['execution', 'defect', 'interruptor']);

/**
 * Mechanically verify the whole on-disk structure of a spec: the
 * phase-directory layout (`SPEC.md` plus one directory per phase, one directory
 * per task) with a strict allowlist at every level, plus task-directory naming
 * and id/name agreement, unique ids, task-table agreement (type/status/gates),
 * `TASK.md` / `GATES.md` / `MEMORY.md` content, the channel grammar for every
 * phase `BOARD.md` and task `MAILBOX.md`, the record checks (a complete
 * task's completion checklist and gate progress are errors when unchecked and
 * silent while the task is unfinished), an optional spec-root
 * `sizing.json`, dependency existence + phase ordering + cycles, the review
 * budget, and the review link when the caller supplies series. Pure — no IO.
 *
 * There is no stored lock list and no required review task: a phase is complete
 * when every task under it is complete, and its lock is derived from a passed
 * review round attributed to it (see {@link passedPhases}).
 * @param snapshot - the spec directory listing
 * @param review - the linked review series and round-presence rule
 * @returns the result; `valid` is true only with zero issues
 */
export const verifySpecTree = (snapshot: SpecSnapshot, review: ReviewInput): Result => {
  const issues: Array<Issue> = [];

  const files = snapshot.files.filter((entry) => kindOf(entry) === 'file');
  const dirs = directoryPaths(snapshot.files);
  const childrenOf = (dir: string): ReadonlyArray<string> =>
    [...dirs].filter((path) => parentOf(path) === dir);

  // ── Root ── only SPEC.md, sizing.json, and phase directories may live here.
  for (const file of files) {
    if (parentOf(file.path) !== '' || SPEC_ROOT_FILES.has(file.path)) continue;
    issues.push(
      issue(file.path, ROOT_STRAY_HINT.get(file.path) ?? 'Unexpected file at the spec root.'),
    );
  }
  for (const file of files) {
    if (file.path.split('/').length > 3) {
      issues.push(issue(file.path, 'Path is deeper than <phase>/<task>/<file>.'));
    }
  }

  const specFile = files.find((file) => file.path === 'SPEC.md');
  if (specFile === undefined) {
    issues.push(issue('SPEC.md', 'Required file is missing.'));
    return { valid: false, issues };
  }
  issues.push(...nest('SPEC.md', verifySpecFile(snapshot.name, specFile.content)));

  const parsedSpec = parseMarkdown(specFile.content);
  const spec = parseSpecFile(specFile.content);
  const rows: ReadonlyArray<TaskRow> = parsedSpec === null ? [] : parseTaskTable(parsedSpec.body);
  const version = parsedSpec === null ? undefined : readSpecVersion(parsedSpec.fields);
  const tier = tierOfSpec(specFile.content);
  if (version !== undefined && version.version >= 2) {
    const transformed = isV2Transformed(snapshot);
    if (!transformed.ok) {
      issues.push(
        finding({
          code: SPEC_VERSION_CODES.untransformed,
          field: `SPEC.md: ${SPEC_VERSION_FIELD}`,
          message: `Spec declares standard version ${version.version} but its tree is not v2: ${transformed.reason ?? 'unknown reason'}.`,
          expected: 'every phase holds PHASE.md and every file is on the v2 allowlist',
          actual: transformed.reason ?? 'untransformed tree',
          fix: 'Run mf-specs migrate --name <spec>; a version bump must land with its transformation.',
        }),
      );
    }
    if (parsedSpec !== null && parsedSpec.fields['locked-phases'] !== undefined) {
      issues.push(
        finding({
          code: LOCKED_PHASES_PRESENT_CODE,
          severity: 'warning',
          field: 'SPEC.md: locked-phases',
          message: `Spec declares standard version ${version.version} but still carries the deleted 'locked-phases' field.`,
          expected: 'no stored lock list; v2 derives the lock from the review round',
          actual: 'locked-phases present',
          fix: 'Remove the `locked-phases` line; `mf-specs lock` derives the lock.',
        }),
      );
    }
  }

  // ── Phases ── every root directory is a phase directory or a finding.
  const phaseDirs: Array<string> = [];
  for (const dir of childrenOf('')) {
    if (PHASE_PATTERN.test(dir)) {
      phaseDirs.push(dir);
      continue;
    }
    const taskDir = parseTaskDirName(dir);
    if (taskDir !== undefined) {
      const target = `${taskDir.phase}/${dir}`;
      issues.push(
        issue(
          dir,
          `Task directory '${dir}' must live inside a phase directory: ${target}/.`,
          `Move it to ${target}/.`,
        ),
      );
      continue;
    }
    issues.push(issue(dir, 'Unexpected directory at the spec root.'));
  }
  phaseDirs.sort((a, b) => phaseRank(a) - phaseRank(b));

  // ── Tasks ── one reader per task directory.
  const tasks = new Map<string, Task>();
  const gates = new Map<string, boolean>();
  /** Mechanical stages collected across every gate file of this spec. */
  const gateStages: Array<GateStageEntry> = [];
  /** Channel files await the complete task id set before they are verified. */
  const channels: Array<{
    readonly kind: ChannelKind;
    readonly path: string;
    readonly content: string;
    readonly owner?: string | undefined;
  }> = [];
  const readTaskDir = (dir: string, leaf: string): void => {
    const dirFiles = files.filter((file) => parentOf(file.path) === dir);
    const names = new Set(dirFiles.map((file) => baseOf(file.path)));
    for (const required of TASK_DIR_REQUIRED) {
      if (!names.has(required))
        issues.push(issue(`${dir}/${required}`, 'Required file is missing.'));
    }
    for (const name of names) {
      if (!TASK_DIR_FILES.has(name)) {
        issues.push(issue(`${dir}/${name}`, 'Unexpected file in a task directory.'));
      }
    }
    for (const sub of childrenOf(dir)) {
      issues.push(issue(sub, 'Unexpected directory inside a task directory.'));
    }
    const dirName = parseTaskDirName(leaf);
    if (dirName !== undefined) gates.set(dirName.id, names.has('GATES.md'));

    const taskFile = dirFiles.find((file) => file.path === `${dir}/TASK.md`);
    const parsedTask = taskFile === undefined ? undefined : parseTaskFile(taskFile.content);
    if (taskFile !== undefined) {
      issues.push(...nest(`${dir}/TASK.md`, verifyTaskFile(leaf, taskFile.content)));
      if (parsedTask !== undefined) {
        if (tasks.has(parsedTask.id))
          issues.push(issue(`${dir}/TASK.md`, `Duplicate task id '${parsedTask.id}'.`));
        tasks.set(parsedTask.id, parsedTask);
      }
    }

    const gatesFile = dirFiles.find((file) => file.path === `${dir}/GATES.md`);
    if (gatesFile !== undefined) {
      const resultsFile = dirFiles.find((file) => file.path === `${dir}/${GATE_RESULTS_FILE}`);
      const complete = parsedTask?.status === 'complete';
      const requireClassified =
        version !== undefined && version.version >= 2 && parsedTask?.status !== 'complete';
      issues.push(
        ...nest(`${dir}/GATES.md`, verifyGatesFile(gatesFile.content, { requireClassified })),
      );
      issues.push(
        ...nest(
          `${dir}/GATES.md`,
          verifyGateProgress(gatesFile.content, complete, resultsFile?.content),
        ),
      );
      issues.push(
        ...nest(
          dir,
          verifyGateResults({
            gates: gatesFile.content,
            results: resultsFile?.content,
            complete,
            owner: `Task '${parsedTask?.id ?? leaf}'`,
          }),
        ),
      );
      const v2 = version !== undefined && version.version >= 2;
      const writeScope = parsedTask === undefined ? undefined : writeScopeTokens(parsedTask);
      for (const stage of parseGates(gatesFile.content)) {
        if (stage.kind !== 'mechanical' || stage.command === undefined) continue;
        const declared = stageScope(stage);
        const ownerScopes =
          writeScope !== undefined && !isNoneScope(writeScope) ? writeScope : undefined;
        const scopes = declared ?? ownerScopes;
        if (v2 && parsedTask !== undefined && unfinished(parsedTask) && scopes === undefined) {
          issues.push(
            finding({
              code: GATE_CODES.scopeMissing,
              severity: 'warning',
              field: `${dir}/GATES.md`,
              message: `Task '${parsedTask.id}' stage ${stage.stage ?? '?'} has no resolvable scope.`,
              expected: 'a `scope:` line, or a task `write-scope:`',
              actual: 'no scope',
              line: stage.line,
              fix: 'Declare `scope: <path[,path]>` on the stage, or give the task a `write-scope:` field.',
            }),
          );
        }
        if (
          declared !== undefined &&
          writeScope !== undefined &&
          !scopeContains(writeScope, declared)
        ) {
          issues.push(
            finding({
              code: GATE_CODES.sharedCheckInTask,
              field: `${dir}/GATES.md`,
              message: `Task '${parsedTask?.id ?? leaf}' stage ${stage.stage ?? '?'} covers '${declared.join(',')}', outside its write-scope '${writeScope.join(',')}'.`,
              expected: 'a task stage scoped inside the task `write-scope:`',
              actual: `scope ${declared.join(',')}`,
              line: stage.line,
              fix: 'Move a phase-shared or repo-wide check to the phase GATES.md, or narrow the stage scope.',
            }),
          );
        }
        if (scopes !== undefined) {
          gateStages.push({
            path: `${dir}/GATES.md`,
            stage: stage.stage ?? 0,
            command: stage.command,
            scopes,
          });
        }
      }
    }
    const memoryFile = dirFiles.find((file) => file.path === `${dir}/MEMORY.md`);
    if (memoryFile !== undefined) {
      issues.push(...nest(`${dir}/MEMORY.md`, verifyMemoryFile(memoryFile.content)));
    }
    const mailboxFile = dirFiles.find((file) => file.path === `${dir}/${MAILBOX_FILE}`);
    if (mailboxFile !== undefined) {
      channels.push({
        kind: 'mailbox',
        path: mailboxFile.path,
        content: mailboxFile.content,
        owner: dirName?.id,
      });
    }
  };

  for (const phase of phaseDirs) {
    const taskDirs = childrenOf(phase);
    if (taskDirs.length === 0) {
      issues.push(issue(phase, 'Phase directory has no task directories.'));
    }
    const phaseFiles = files.filter((file) => parentOf(file.path) === phase);
    for (const file of phaseFiles) {
      if (PHASE_DIR_FILES.has(baseOf(file.path))) continue;
      issues.push(
        issue(
          file.path,
          ROOT_STRAY_HINT.get(baseOf(file.path)) ??
            'Unexpected file in a phase directory; a phase holds PHASE.md, MEMORY.md, GATES.md, GATE-RESULTS.jsonl, and BOARD.md.',
        ),
      );
    }

    for (const dir of taskDirs) {
      const leaf = baseOf(dir);
      const dirName = parseTaskDirName(leaf);
      if (dirName === undefined) {
        issues.push(
          issue(
            dir,
            TASK_ID_PREFIX.test(leaf)
              ? `Task directory '${leaf}' is missing its kebab name; expected <PHASE_LETTERS><NNN>-<kebab-name>.`
              : 'Unexpected directory in a phase directory; a phase holds task directories only.',
          ),
        );
        continue;
      }
      if (dirName.phase !== phase) {
        issues.push(
          issue(
            dir,
            `Task id '${dirName.id}' belongs to phase '${dirName.phase}', but lives under '${phase}/'.`,
          ),
        );
      }
      readTaskDir(dir, leaf);
    }

    const phaseFile = phaseFiles.find((file) => file.path === `${phase}/${PHASE_FILE}`);
    const memoryFile = phaseFiles.find((file) => file.path === `${phase}/${PHASE_MEMORY_FILE}`);
    const gateFile = phaseFiles.find((file) => file.path === `${phase}/${PHASE_GATES_FILE}`);
    const boardFile = phaseFiles.find((file) => file.path === `${phase}/${PHASE_BOARD_FILE}`);
    if (boardFile !== undefined) {
      channels.push({ kind: 'board', path: boardFile.path, content: boardFile.content });
    }
    if (phaseFile === undefined) {
      if ((version?.version ?? 1) >= 2) {
        issues.push(
          finding({
            code: PHASE_CODES.missing,
            field: `${phase}/${PHASE_FILE}`,
            message: `Phase '${phase}' has no PHASE.md; the v2 standard requires one.`,
            expected: `${phase}/${PHASE_FILE}`,
            actual: 'missing',
            fix: 'Run mf-specs migrate --name <spec>, or author the phase record.',
          }),
        );
      }
    } else {
      const inPhase = [...tasks.values()].filter((task) => phaseOf(task.id) === phase);
      issues.push(
        ...nest(
          `${phase}/${PHASE_FILE}`,
          verifyPhaseFile(phase, phaseFile.content, {
            taskStatuses: inPhase.map((task) => task.status),
            taskTypes: inPhase.map((task) => task.type),
            gateText: gateFile?.content,
          }),
        ),
      );
    }
    if (gateFile !== undefined) {
      const resultsFile = phaseFiles.find((file) => file.path === `${phase}/${GATE_RESULTS_FILE}`);
      const inPhase = [...tasks.values()].filter((task) => phaseOf(task.id) === phase);
      issues.push(
        ...nest(
          phase,
          verifyGateResults({
            gates: gateFile.content,
            results: resultsFile?.content,
            complete: inPhase.length > 0 && inPhase.every((task) => task.status === 'complete'),
            owner: `Phase '${phase}'`,
          }),
        ),
      );
      for (const stage of parseGates(gateFile.content)) {
        if (stage.kind !== 'mechanical' || stage.command === undefined) continue;
        gateStages.push({
          path: `${phase}/${PHASE_GATES_FILE}`,
          stage: stage.stage ?? 0,
          command: stage.command,
          scopes: stageScope(stage) ?? [REPO_SCOPE],
        });
      }
    }
    // C1/C2: a v2 phase is a ready set. A serial chain is a stated decision,
    // and two overlapping write scopes must be separated by a real edge.
    const phaseTasks = [...tasks.values()].filter((task) => phaseOf(task.id) === phase);
    const phaseFields =
      phaseFile === undefined ? undefined : parseMarkdown(phaseFile.content)?.fields;
    const reason =
      phaseFields === undefined ? undefined : fieldString(phaseFields, 'serial-reason');
    issues.push(
      ...verifyPhaseParallelism({
        phase,
        v2: (version?.version ?? 1) >= 2,
        tasks: phaseTasks,
        allTasks: tasks,
        serialReason: reason?.trim() ?? undefined,
      }),
    );
    if (memoryFile === undefined) {
      if ((version?.version ?? 1) >= 2) {
        issues.push(
          finding({
            code: PHASE_CODES.memoryMissing,
            field: `${phase}/${PHASE_MEMORY_FILE}`,
            message: `Phase '${phase}' has no MEMORY.md; the v2 standard requires one.`,
            expected: `${phase}/${PHASE_MEMORY_FILE}`,
            actual: 'missing',
            fix: 'Run mf-specs migrate --name <spec>, or author the phase memory.',
          }),
        );
      }
    } else {
      issues.push(...nest(`${phase}/${PHASE_MEMORY_FILE}`, verifyMemoryFile(memoryFile.content)));
      const phaseStatus =
        phaseFile === undefined ? undefined : parsePhaseFile(phaseFile.content)?.status;
      const brief = executionBriefStatus(memoryFile.content);
      if ((version?.version ?? 1) >= 2 && phaseStatus === 'in-progress' && !brief.valid) {
        issues.push(
          finding({
            code: EXECUTION_BRIEF_MISSING_CODE,
            severity: 'warning',
            field: `${phase}/${PHASE_MEMORY_FILE}`,
            message: brief.present
              ? `Phase '${phase}' is in progress but its '## ${EXECUTION_BRIEF_SECTION}' section does not name: ${brief.missing.join(', ')}.`
              : `Phase '${phase}' is in progress but its MEMORY.md has no '## ${EXECUTION_BRIEF_SECTION}' section.`,
            expected: `## ${EXECUTION_BRIEF_SECTION} naming the five elements: ${EXECUTION_BRIEF_ELEMENTS.join(', ')}`,
            actual: brief.present ? `missing ${brief.missing.join(', ')}` : 'missing',
            fix: 'Write the phase execution brief with the five labelled bullets; every new phase gets one from the montflow-create-specs skill, and a complete phase is exempt.',
          }),
        );
      }
    }
  }

  issues.push(...verifyTaskWriteScopes(tasks.values()));

  issues.push(...verifyGateStageDuplicates(gateStages));

  const taskIds = new Set(tasks.keys());
  for (const channel of channels) {
    issues.push(
      ...nest(
        channel.path,
        verifyChannel(channel.kind, channel.content, { taskIds, owner: channel.owner }),
      ),
    );
  }

  const rowById = new Map<string, TaskRow>();
  for (const row of rows) {
    if (rowById.has(row.id)) issues.push(issue('SPEC.md', `Duplicate task table row '${row.id}'.`));
    rowById.set(row.id, row);
  }
  for (const row of rows) {
    const task = tasks.get(row.id);
    if (task === undefined) {
      issues.push(issue('SPEC.md', `Task table row '${row.id}' has no task directory.`));
      continue;
    }
    if (row.name !== task.name) {
      issues.push(
        issue(
          'SPEC.md',
          `Task '${row.id}' name is '${row.name}' in the table but '${task.name}' in TASK.md.`,
        ),
      );
    }
    if (row.type !== task.type) {
      issues.push(
        issue(
          'SPEC.md',
          `Task '${row.id}' type is '${row.type}' in the table but '${task.type}' in TASK.md.`,
        ),
      );
    }
    if (row.status !== task.status) {
      issues.push(
        issue(
          'SPEC.md',
          `Task '${row.id}' status is '${row.status}' in the table but '${task.status}' in TASK.md.`,
        ),
      );
    }
    const hasGates = gates.get(row.id) ?? false;
    if (row.gates !== hasGates) {
      issues.push(
        issue(
          'SPEC.md',
          `Task '${row.id}' Gates column is '${row.gates ? 'Yes' : 'No'}' but GATES.md ${hasGates ? 'exists' : 'is missing'}.`,
        ),
      );
    }
  }
  for (const id of tasks.keys()) {
    if (!rowById.has(id))
      issues.push(issue('SPEC.md', `Task '${id}' is missing from the task table.`));
  }
  if (version !== undefined && version.version >= 2 && tier !== undefined) {
    for (const [id, task] of tasks) {
      if (!GATED_TASK_TYPES.has(task.type) || gates.get(id) === true) continue;
      issues.push(
        finding({
          code: TASK_GATES_REQUIRED_CODE,
          field: `task ${id}`,
          message: `Task '${id}' is '${task.type}' but has no GATES.md; a v2 execution, defect, or interruptor task carries its own proof.`,
          expected: 'a GATES.md with at least one classified stage',
          actual: 'no GATES.md',
          fix: `Add a GATES.md to the task's directory, or create the task with mf-specs new-task --gates.`,
        }),
      );
    }
  }

  for (const [id, task] of tasks) {
    for (const dep of task.dependsOn) {
      const depTask = tasks.get(dep);
      if (depTask === undefined) {
        issues.push(issue(`task ${id}`, `depends-on '${dep}' has no task directory.`));
        continue;
      }
      if (dep === id) {
        issues.push(issue(`task ${id}`, 'depends-on must not reference the task itself.'));
        continue;
      }
      if (phaseRank(phaseOf(dep)) > phaseRank(phaseOf(id))) {
        issues.push(issue(`task ${id}`, `depends-on '${dep}' points to a later phase.`));
      }
    }
  }
  const cycle = findCycle(tasks);
  if (cycle !== undefined)
    issues.push(issue('depends-on', `Dependency cycle: ${cycle.join(' -> ')}.`));

  const phases = new Set<string>();
  for (const id of tasks.keys()) phases.add(phaseOf(id));
  const phaseBudgets: ReadonlyArray<PhaseBudget> = [...phases]
    .toSorted((a, b) => phaseRank(a) - phaseRank(b))
    .map((phase) => ({
      phase,
      budget: phaseReviewBudget(
        Array.from(tasks.values())
          .filter((task) => phaseOf(task.id) === phase)
          .map((task) => ({ type: task.type, size: sizeOf(task) })),
      ),
    }));
  const configFile = snapshot.files.find((file) => file.path === CONFIG_FILE);
  if (configFile !== undefined) {
    issues.push(
      ...nest(CONFIG_FILE, verifySpecConfig(snapshot.name, [...phases], configFile.content)),
    );
  }

  const evidence = phaseEvidence(snapshot);
  issues.push(...evidence.issues);

  const current = version !== undefined && version.version >= 2;
  const reviewAware = current && review.available !== false;
  const reviewInputs: ReadonlyArray<PhaseReviewInput> = phaseBudgets.map(({ phase, budget }) => ({
    phase,
    budget,
    profiles: [
      ...new Set(
        Array.from(tasks.values())
          .filter((task) => task.type === 'review' && phaseOf(task.id) === phase)
          .flatMap((task) => task.reviewerProfiles),
      ),
    ],
    waived: evidence.waived.includes(phase),
  }));
  const reviewedPhases = reviewAware
    ? passedReviewPhases(snapshot.name, reviewInputs, review.series)
    : passedPhases(review.series);

  if (spec !== undefined) {
    issues.push(
      ...verifyLifecycle({
        status: spec.status,
        reviewedPhases,
        waivedPhases: evidence.waived,
        provenPhases: evidence.proven,
        tasks: Array.from(tasks.values()).map((task) => ({ id: task.id, status: task.status })),
        // Every v2 record completes through a lock, including a v1 record
        // migrated without a `## Creation` tier. A frozen v1 record keeps the
        // status-only rule it shipped with.
        requireLocks: reviewAware,
      }).issues,
    );
  }

  const reviewTasks: ReadonlyArray<ReviewTaskEntry> = Array.from(tasks.values())
    .filter((task) => task.type === 'review')
    .map((task) => ({
      phase: phaseOf(task.id),
      profiles: task.reviewerProfiles,
      complete: task.status === 'complete',
    }));
  if (review.requireRounds || reviewAware) {
    issues.push(...verifyReviewLink(snapshot.name, reviewTasks, review.series).issues);
  }
  for (const task of reviewTasks) {
    if (!reviewAware || !task.complete) continue;
    const entry = reviewInputs.find((candidate) => candidate.phase === task.phase);
    if (entry === undefined) continue;
    const verdict = reviewVerdict(snapshot.name, entry, review.series);
    if (verdict.passed || verdict.reason === REVIEW_REASONS.roundMissing) continue;
    issues.push(
      finding({
        code: REVIEW_NOT_PASSED_CODE,
        field: `task ${task.phase}`,
        message: `Phase '${task.phase}' review task is complete but its review has not passed (decision '${verdict.decision}', reason '${verdict.reason}').`,
        expected: 'a passing review round in every expected series',
        actual: `decision ${verdict.decision}`,
        fix: `Run mf-specs review decide --name ${snapshot.name} --phase ${task.phase} and follow it; close the review task only after the decision is 'pass'.`,
      }),
    );
  }
  issues.push(...verifyReviewDeferrals(snapshot.name, reviewTasks, review.series).issues);
  const expectedSeries = [
    ...new Set(reviewTasks.flatMap((task) => seriesNames(snapshot.name, task.profiles))),
  ];
  issues.push(...verifyReviewBudgets(expectedSeries, phaseBudgets, review.series).issues);

  return { valid: noErrors(issues), issues };
};
