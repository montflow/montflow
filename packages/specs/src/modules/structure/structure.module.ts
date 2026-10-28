import {
  type TaskRow,
  PHASE_PATTERN,
  parseSpecFile,
  parseTaskTable,
  verifySpecFile,
} from '../spec/index.js';
import { parseMarkdown } from '../frontmatter/index.js';
import { verifyGatesFile } from '../gates/index.js';
import { verify as verifyLifecycle } from '../lifecycle/index.js';
import { verifyMemoryFile } from '../memory/index.js';
import {
  type ReviewTaskEntry,
  type SeriesSnapshot,
  verify as verifyReviewLink,
} from '../review-link/index.js';
import {
  type Task,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
  phaseRank,
  verifyTaskFile,
} from '../task/index.js';
import { type Issue, type Result, issue, noErrors } from '../verify/index.js';

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
const TASK_DIR_FILES = new Set(['TASK.md', 'MEMORY.md', 'GATES.md']);

/** Files every task directory must contain. */
const TASK_DIR_REQUIRED = ['TASK.md', 'MEMORY.md'] as const;

/** The one file allowed directly at the spec root. */
const SPEC_ROOT_FILE = 'SPEC.md';

/** Helpful placement hints for spec files found at the wrong level. */
const SPEC_FILE_PLACEMENT = new Map<string, string>([
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
 * Mechanically verify the whole on-disk structure of a spec: the
 * phase-directory layout (`SPEC.md`, one directory per phase, one directory per
 * task) with a strict allowlist at every level, plus task-directory naming and
 * id/name agreement, unique ids, task-table agreement (type/status/gates),
 * `TASK.md` / `GATES.md` / `MEMORY.md` content, dependency existence + phase
 * ordering + cycles, a `review` task per phase, and `locked-phases` pointing at
 * real phase directories. Pure — no IO.
 *
 * A task directory at the spec root is an error naming its target path.
 *
 * When `review` is supplied, the tree's review tasks are additionally
 * checked against the convention link (`ReviewLink`): each complete `review`
 * task must have a round attributed to its phase in every expected series.
 * Omitting it skips the cross-store check, so a caller without review-store
 * access is unaffected.
 * @param snapshot - the spec directory listing
 * @param review - the linked review series, when the caller has them
 * @returns the result; `valid` is true only with zero issues
 */
export const verifySpecTree = (
  snapshot: SpecSnapshot,
  review?: ReadonlyArray<SeriesSnapshot>,
): Result => {
  const issues: Array<Issue> = [];

  const files = snapshot.files.filter((entry) => kindOf(entry) === 'file');
  const dirs = directoryPaths(snapshot.files);
  const childrenOf = (dir: string): ReadonlyArray<string> =>
    [...dirs].filter((path) => parentOf(path) === dir);

  // ── Root ── only SPEC.md and phase directories may live here.
  for (const file of files) {
    if (parentOf(file.path) !== '' || file.path === SPEC_ROOT_FILE) continue;
    issues.push(
      issue(file.path, SPEC_FILE_PLACEMENT.get(file.path) ?? 'Unexpected file at the spec root.'),
    );
  }
  for (const file of files) {
    if (file.path.split('/').length > 3) {
      issues.push(issue(file.path, 'Path is deeper than <phase>/<task>/<file>.'));
    }
  }

  const specFile = files.find((file) => file.path === SPEC_ROOT_FILE);
  if (specFile === undefined) {
    issues.push(issue(SPEC_ROOT_FILE, 'Required file is missing.'));
    return { valid: false, issues };
  }
  issues.push(...nest(SPEC_ROOT_FILE, verifySpecFile(snapshot.name, specFile.content)));

  const parsedSpec = parseMarkdown(specFile.content);
  const spec = parseSpecFile(specFile.content);
  const rows: ReadonlyArray<TaskRow> = parsedSpec === null ? [] : parseTaskTable(parsedSpec.body);

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
    if (taskFile !== undefined) {
      issues.push(...nest(`${dir}/TASK.md`, verifyTaskFile(leaf, taskFile.content)));
      const task = parseTaskFile(taskFile.content);
      if (task !== undefined) {
        if (tasks.has(task.id))
          issues.push(issue(`${dir}/TASK.md`, `Duplicate task id '${task.id}'.`));
        tasks.set(task.id, task);
      }
    }

    const gatesFile = dirFiles.find((file) => file.path === `${dir}/GATES.md`);
    if (gatesFile !== undefined) {
      issues.push(...nest(`${dir}/GATES.md`, verifyGatesFile(gatesFile.content)));
    }
    const memoryFile = dirFiles.find((file) => file.path === `${dir}/MEMORY.md`);
    if (memoryFile !== undefined) {
      issues.push(...nest(`${dir}/MEMORY.md`, verifyMemoryFile(memoryFile.content)));
    }
  };

  for (const phase of phaseDirs) {
    const taskDirs = childrenOf(phase);
    if (taskDirs.length === 0) {
      issues.push(issue(phase, 'Phase directory has no task directories.'));
    }
    for (const file of files) {
      if (parentOf(file.path) !== phase) continue;
      issues.push(
        issue(
          file.path,
          SPEC_FILE_PLACEMENT.get(baseOf(file.path)) ??
            'Unexpected file in a phase directory; files live in a task directory.',
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

  for (const phase of phaseDirs) {
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
      if (!phaseDirs.includes(phase))
        issues.push(issue('locked-phases', `Locked phase '${phase}' has no phase directory.`));
    }
  }

  if (review !== undefined) {
    const reviewTasks: ReadonlyArray<ReviewTaskEntry> = Array.from(tasks.values())
      .filter((task) => task.type === 'review')
      .map((task) => ({
        phase: phaseOf(task.id),
        profiles: task.reviewerProfiles,
        complete: task.status === 'complete',
      }));
    issues.push(...verifyReviewLink(snapshot.name, reviewTasks, review).issues);
  }

  return { valid: noErrors(issues), issues };
};
