import {
  PHASE_PATTERN,
  type TaskRow,
  parseSpecFile,
  parseTaskTable,
  verifySpecFile,
} from '../spec/index.js';
import { parseMarkdown } from '../frontmatter/index.js';
import { verifyGateProgress, verifyGatesFile } from '../gates/index.js';
import { verify as verifyLifecycle } from '../lifecycle/index.js';
import { verifyMemoryFile } from '../memory/index.js';
import {
  type PhaseBudget,
  type ReviewTaskEntry,
  type SeriesSnapshot,
  seriesNames,
  verify as verifyReviewLink,
  verifyBudgets as verifyReviewBudgets,
} from '../review-link/index.js';
import {
  type Task,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
  phaseRank,
  sizeOf,
  verifyTaskFile,
} from '../task/index.js';
import {
  CODES,
  CONFIG_FILE,
  type ConfigSource,
  phaseReviewBudget,
  verifyText,
} from '../sizing/index.js';
import { type Issue, type Result, issue, noErrors } from '../verify/index.js';

/**
 * One file inside a spec directory, as seen by the verifier.
 * `path` is POSIX-relative to the spec root (e.g. `A001-explore/TASK.md`).
 * The verifier never touches disk — the caller supplies the snapshot.
 */
export interface SpecFileEntry {
  /** POSIX-relative path from the spec root. */
  readonly path: string;
  /** Raw file contents. */
  readonly content: string;
}

/** In-memory listing of a spec directory, supplied by the caller. */
export interface SpecSnapshot {
  /** Spec directory slug (matches SPEC.md `name`). */
  readonly name: string;
  /** Every file under the spec root. */
  readonly files: ReadonlyArray<SpecFileEntry>;
}

/** Files a task directory may contain. */
const TASK_DIR_FILES = new Set(['TASK.md', 'MEMORY.md', 'GATES.md']);

/** Files every task directory must contain. */
const TASK_DIR_REQUIRED = ['TASK.md', 'MEMORY.md'] as const;

/** Root files a spec directory may contain; everything else is stray. */
const SPEC_ROOT_FILES = new Set(['SPEC.md', CONFIG_FILE]);

/** Helpful placement hints for files that belong inside a task directory. */
const ROOT_STRAY_HINT = new Map<string, string>([
  ['TASK.md', 'TASK.md must live inside a task directory: A001-<kebab-name>/TASK.md.'],
  ['MEMORY.md', 'MEMORY.md must live inside a task directory: A001-<kebab-name>/MEMORY.md.'],
  ['GATES.md', 'GATES.md must live inside a task directory: A001-<kebab-name>/GATES.md.'],
]);

/** A leading task id with no `-<name>` yet, e.g. `A001`. */
const TASK_ID_PREFIX = /^[A-Z]{1,2}\d{3}/;

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
   * phase in every expected series. A disk-driven `check` passes false: a
   * historical spec may predate the review store, and its absence must not turn
   * `check` red. The budget check still applies to every series that exists.
   */
  readonly requireRounds: boolean;
}

/**
 * The review input for a caller that holds no review store: no series, no
 * round-presence requirement. Structure-only verification and a store that has
 * no review directory pass this explicitly, so omitting the review input can
 * never silently disable the budget check.
 */
export const NO_REVIEW: ReviewInput = { series: [], requireRounds: false };

/**
 * Mechanically verify the whole on-disk structure of a spec:
 * required files, task-directory naming and placement, id/name agreement,
 * unique ids, task-table agreement (type/status/gates), `TASK.md` /
 * `GATES.md` / `MEMORY.md` content, the record checks (a complete task's
 * completion checklist and gate progress), an optional spec-root `sizing.json`,
 * dependency existence + phase ordering + cycles, a `review` task per phase,
 * and `locked-phases` pointing at real phases. Pure — no IO.
 *
 * The tree's review tasks are additionally checked against the convention link
 * (`ReviewLink`): each expected series may hold no more rounds attributed to a
 * phase than that phase's size-derived review budget, and — only when
 * `review.requireRounds` is set — each complete `review` task must have a round
 * attributed to its phase in every expected series. Every caller supplies the
 * input, so one snapshot yields one verdict for `check`, `status`, `next`, and
 * `execute`; a caller with no review store passes {@link NO_REVIEW}.
 * @param snapshot - the spec directory listing
 * @param review - the linked review series and round-presence rule
 * @returns the result; `valid` is true only with zero issues
 */
export const verifySpecTree = (snapshot: SpecSnapshot, review: ReviewInput): Result => {
  const issues: Array<Issue> = [];

  for (const file of snapshot.files) {
    if (file.path.includes('/') || SPEC_ROOT_FILES.has(file.path)) continue;
    issues.push(
      issue(file.path, ROOT_STRAY_HINT.get(file.path) ?? 'Unexpected file at the spec root.'),
    );
  }

  const specFile = snapshot.files.find((file) => file.path === 'SPEC.md');
  if (specFile === undefined) {
    issues.push(issue('SPEC.md', 'Required file is missing.'));
    return { valid: false, issues };
  }
  issues.push(...nest('SPEC.md', verifySpecFile(snapshot.name, specFile.content)));

  const parsedSpec = parseMarkdown(specFile.content);
  const spec = parseSpecFile(specFile.content);
  const rows: ReadonlyArray<TaskRow> = parsedSpec === null ? [] : parseTaskTable(parsedSpec.body);

  const dirs = new Map<string, Array<SpecFileEntry>>();
  for (const file of snapshot.files) {
    const slash = file.path.indexOf('/');
    if (slash === -1) continue;
    const dir = file.path.slice(0, slash);
    const rest = file.path.slice(slash + 1);
    if (rest.includes('/')) {
      issues.push(
        issue(file.path, 'Nested path inside a task directory — task files are one level deep.'),
      );
      continue;
    }
    const bucket = dirs.get(dir) ?? [];
    bucket.push(file);
    dirs.set(dir, bucket);
  }

  const tasks = new Map<string, Task>();
  const gates = new Map<string, boolean>();
  for (const [dir, files] of dirs) {
    const dirName = parseTaskDirName(dir);
    if (dirName === undefined) {
      issues.push(
        issue(
          dir,
          TASK_ID_PREFIX.test(dir)
            ? `Task directory '${dir}' is missing its kebab name; expected <PHASE_LETTERS><NNN>-<kebab-name>.`
            : 'Task directory must match <PHASE_LETTERS><NNN>-<kebab-name>.',
        ),
      );
      continue;
    }
    const names = new Set(files.map((file) => file.path.slice(dir.length + 1)));
    for (const required of TASK_DIR_REQUIRED) {
      if (!names.has(required))
        issues.push(issue(`${dir}/${required}`, 'Required file is missing.'));
    }
    for (const name of names) {
      if (!TASK_DIR_FILES.has(name)) {
        issues.push(issue(`${dir}/${name}`, 'Unexpected file in a task directory.'));
      }
    }
    gates.set(dirName.id, names.has('GATES.md'));

    const taskFile = files.find((file) => file.path === `${dir}/TASK.md`);
    const parsedTask = taskFile === undefined ? undefined : parseTaskFile(taskFile.content);
    if (taskFile !== undefined) {
      issues.push(...nest(`${dir}/TASK.md`, verifyTaskFile(dir, taskFile.content)));
      if (parsedTask !== undefined) {
        if (tasks.has(parsedTask.id))
          issues.push(issue(`${dir}/TASK.md`, `Duplicate task id '${parsedTask.id}'.`));
        tasks.set(parsedTask.id, parsedTask);
      }
    }

    const gatesFile = files.find((file) => file.path === `${dir}/GATES.md`);
    if (gatesFile !== undefined) {
      issues.push(...nest(`${dir}/GATES.md`, verifyGatesFile(gatesFile.content)));
      issues.push(
        ...nest(
          `${dir}/GATES.md`,
          verifyGateProgress(gatesFile.content, parsedTask?.status === 'complete'),
        ),
      );
    }
    const memoryFile = files.find((file) => file.path === `${dir}/MEMORY.md`);
    if (memoryFile !== undefined) {
      issues.push(...nest(`${dir}/MEMORY.md`, verifyMemoryFile(memoryFile.content)));
    }
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
  for (const phase of phases) {
    const hasReview = Array.from(tasks.values()).some(
      (task) => phaseOf(task.id) === phase && task.type === 'review',
    );
    if (!hasReview) issues.push(issue(`phase ${phase}`, 'Phase has no `review` task.'));
  }

  if (spec !== undefined) {
    issues.push(
      ...verifyLifecycle({
        status: spec.status,
        lockedPhases: spec.lockedPhases,
        tasks: Array.from(tasks.values()).map((task) => ({ id: task.id, status: task.status })),
      }).issues,
    );
    for (const phase of spec.lockedPhases) {
      if (!phases.has(phase))
        issues.push(issue('locked-phases', `Locked phase '${phase}' has no tasks.`));
    }
  }

  const reviewTasks: ReadonlyArray<ReviewTaskEntry> = Array.from(tasks.values())
    .filter((task) => task.type === 'review')
    .map((task) => ({
      phase: phaseOf(task.id),
      profiles: task.reviewerProfiles,
      complete: task.status === 'complete',
    }));
  if (review.requireRounds) {
    issues.push(...verifyReviewLink(snapshot.name, reviewTasks, review.series).issues);
  }
  const expectedSeries = [
    ...new Set(reviewTasks.flatMap((task) => seriesNames(snapshot.name, task.profiles))),
  ];
  issues.push(...verifyReviewBudgets(expectedSeries, phaseBudgets, review.series).issues);

  return { valid: noErrors(issues), issues };
};
