import { Schema } from 'effect';
import { fieldList, fieldString, parseMarkdown } from '../frontmatter/index.js';
import type { FieldValue } from '../frontmatter/index.js';
import { type Issue, type Result, issue } from '../verify/index.js';

// ─── Patterns ─────────────────────────────────────────────────────────

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Task id: phase letters plus a zero-padded three-digit number (`A001`, `AA012`). */
export const TASK_ID_PATTERN = /^[A-Z]{1,2}\d{3}$/;

/** Task directory: `<PHASE_LETTERS><NNN>-<kebab-name>` (`A001-explore-auth`). */
export const TASK_DIR_PATTERN = /^[A-Z]{1,2}\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Who created a task: `user`, `defect:<task-id>`, or `planner:<task-id>`. */
export const ORIGINATOR_PATTERN = /^(?:user|(?:defect|planner):[A-Z]{1,2}\d{3})$/;

/** Adversarial-review finding id referenced by a `defect` task (`F1`, `F12`). */
export const FINDING_REF_PATTERN = /^F\d+$/;

// ─── Enums ────────────────────────────────────────────────────────────

/** Executor behavior for a task. `defect` is a type, never a status. */
export const TASK_TYPES = [
  'exploratory',
  'execution',
  'planning',
  'interruptor',
  'defect',
  'review',
] as const;

/** Executor behavior for a task. */
export const TaskType = Schema.Literals(TASK_TYPES);

/** Executor behavior for a task. */
export type TaskType = typeof TaskType.Type;

/** Canonical task status enum — the single source of truth across skills. */
export const TASK_STATUSES = ['pending', 'in-progress', 'complete', 'blocked'] as const;

/** Canonical task status. */
export const TaskStatus = Schema.Literals(TASK_STATUSES);

/** Canonical task status. */
export type TaskStatus = typeof TaskStatus.Type;

/** True when `value` is a known task type. */
export const isTaskType = (value: string): value is TaskType =>
  TASK_TYPES.some((type) => type === value);

/** True when `value` is a canonical task status. */
export const isTaskStatus = (value: string): value is TaskStatus =>
  TASK_STATUSES.some((status) => status === value);

/** True when a task type is the phase-end adversarial review. */
export const isReview = (type: string): boolean => type === 'review';

// ─── Branded ids ──────────────────────────────────────────────────────

/**
 * Directory-safe task id. Matches `<PHASE_LETTERS><NNN>`.
 * Scoped: use as `Task.TaskId`. Scalar brand, not a Class.
 */
export const TaskId = Schema.String.check(Schema.isPattern(TASK_ID_PATTERN)).pipe(
  Schema.brand('FeatureTaskId'),
);

/** Branded task id. */
export type TaskId = typeof TaskId.Type;

// ─── Descriptor ───────────────────────────────────────────────────────

/**
 * TASK.md frontmatter — the machine contract for one task.
 * `defect` is a task type; the canonical status vocabulary is
 * {@link TaskStatus}.
 */
export class Task extends Schema.Class<Task>('FeatureTask')({
  /** Task id — matches the directory prefix. */
  id: TaskId,
  /** Short kebab-case name — matches the directory suffix. */
  name: Schema.String.check(Schema.isPattern(SLUG_PATTERN)),
  /** Executor behavior. */
  type: TaskType,
  /** Who created the task. */
  originator: Schema.String.check(Schema.isPattern(ORIGINATOR_PATTERN)),
  /** Task ids this task blocks on (same or earlier phase only). */
  dependsOn: Schema.Array(TaskId),
  /** Task ids this task fixes or cross-references. */
  relatedTasks: Schema.Array(TaskId),
  /** Adversarial-review finding this task addresses (`F<n>`), if any. */
  findingRef: Schema.optionalKey(Schema.String.check(Schema.isPattern(FINDING_REF_PATTERN))),
  /** Current task state. */
  status: TaskStatus,
}) {}

/**
 * Decode untrusted input (TASK.md frontmatter, RPC payloads) into a `Task`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Task);

/** Normalized task frontmatter input, before schema validation. */
interface TaskInput {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly originator: string;
  readonly dependsOn: ReadonlyArray<string>;
  readonly relatedTasks: ReadonlyArray<string>;
  readonly status: string;
  readonly findingRef?: string;
}

const taskInput = (fields: Record<string, FieldValue>): TaskInput => {
  const findingRef = fieldString(fields, 'finding-ref');
  const base: TaskInput = {
    id: fieldString(fields, 'id') ?? '',
    name: fieldString(fields, 'name') ?? '',
    type: fieldString(fields, 'type') ?? '',
    originator: fieldString(fields, 'originator') ?? '',
    dependsOn: fieldList(fields, 'depends-on'),
    relatedTasks: fieldList(fields, 'related-tasks'),
    status: fieldString(fields, 'status') ?? '',
  };
  if (findingRef === undefined || findingRef === '') return base;
  return { ...base, findingRef };
};

/**
 * Parse and schema-validate a TASK.md document.
 * @param markdown - raw TASK.md contents
 * @returns the task descriptor, or undefined when invalid
 */
export const parseTaskFile = (markdown: string): Task | undefined => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) return undefined;
  try {
    return Schema.decodeUnknownSync(Task)(taskInput(parsed.fields));
  } catch {
    return undefined;
  }
};

// ─── Directory name ───────────────────────────────────────────────────

/** Parsed task directory name: id, phase prefix, and kebab name. */
export interface TaskDirName {
  /** Full task id, e.g. `A001`. */
  readonly id: string;
  /** Phase prefix, e.g. `A`. */
  readonly phase: string;
  /** Kebab-case task name after the id, e.g. `explore-auth`. */
  readonly name: string;
}

/** Phase prefix of a task id, e.g. `AA012` → `AA`. */
export const phaseOf = (id: string): string => id.replace(/\d+$/, '');

/** Rank of a phase id: `A` → 1, `Z` → 26, `AA` → 27, `AB` → 28. */
export const phaseRank = (phase: string): number => {
  let rank = 0;
  for (const char of phase) rank = rank * 26 + (char.charCodeAt(0) - 64);
  return rank;
};

/**
 * Parse a task directory name of the form `<PHASE_LETTERS><NNN>-<name>`.
 * @param dir - directory name relative to the feature root
 * @returns the parsed parts, or undefined when malformed
 */
export const parseTaskDirName = (dir: string): TaskDirName | undefined => {
  if (!TASK_DIR_PATTERN.test(dir)) return undefined;
  const separator = dir.indexOf('-');
  const id = dir.slice(0, separator);
  return { id, phase: id.replace(/\d+$/, ''), name: dir.slice(separator + 1) };
};

// ─── Mechanical verification ──────────────────────────────────────────

/** Required sections of a TASK.md body; `Type:` is a prefixed heading. */
const TASK_SECTIONS = [
  { label: '## Type:', pattern: /^## Type:\s*\S/m },
  { label: '## Description', pattern: /^## Description\s*$/m },
  { label: '## Requirements', pattern: /^## Requirements\s*$/m },
  { label: '## Completion', pattern: /^## Completion\s*$/m },
] as const;

/**
 * Mechanically verify a TASK.md file against the authoring-feature-spec
 * standard: required frontmatter (`id`, `name`, `type`, `originator`,
 * `depends-on`, `related-tasks`, `status`; `id`/`name` matching the
 * directory) plus the body shape. Pure — no IO.
 * @param dirName - task directory name (`A001-explore-auth`)
 * @param markdown - raw TASK.md contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyTaskFile = (dirName: string, markdown: string): Result => {
  const issues: Array<Issue> = [];
  const parsed = parseMarkdown(markdown);
  if (parsed === null) {
    return { valid: false, issues: [issue('frontmatter', 'Missing frontmatter block.')] };
  }
  const { fields, body } = parsed;
  const dir = parseTaskDirName(dirName);

  const id = fieldString(fields, 'id');
  if (id === undefined || id.trim() === '') {
    issues.push(issue('id', 'Required frontmatter field is missing or empty.'));
  } else if (!TASK_ID_PATTERN.test(id)) {
    issues.push(issue('id', 'Must be <PHASE_LETTERS><NNN> (e.g. A001, AA001).'));
  } else if (dir !== undefined && id !== dir.id) {
    issues.push(issue('id', `Must match the task directory id '${dir.id}'.`));
  }
  if (dir === undefined && dirName !== '') {
    issues.push(issue('directory', 'Task directory must match <PHASE_LETTERS><NNN>-<kebab-name>.'));
  }

  const name = fieldString(fields, 'name');
  if (name === undefined || name.trim() === '') {
    issues.push(issue('name', 'Required frontmatter field is missing or empty.'));
  } else {
    if (!SLUG_PATTERN.test(name)) {
      issues.push(issue('name', 'Must be lowercase alphanumeric groups joined by single hyphens.'));
    }
    if (dir !== undefined && name !== dir.name) {
      issues.push(issue('name', `Must match the task directory name '${dir.name}'.`));
    }
  }

  const type = fieldString(fields, 'type');
  if (type === undefined || type.trim() === '') {
    issues.push(issue('type', 'Required frontmatter field is missing or empty.'));
  } else if (!isTaskType(type)) {
    issues.push(issue('type', `Must be one of: ${TASK_TYPES.join(', ')}.`));
  }

  const originator = fieldString(fields, 'originator');
  if (originator === undefined || originator.trim() === '') {
    issues.push(issue('originator', 'Required frontmatter field is missing or empty.'));
  } else if (!ORIGINATOR_PATTERN.test(originator)) {
    issues.push(issue('originator', 'Must be `user`, `defect:<task-id>`, or `planner:<task-id>`.'));
  }

  for (const dep of fieldList(fields, 'depends-on')) {
    if (!TASK_ID_PATTERN.test(dep)) issues.push(issue('depends-on', `'${dep}' is not a task id.`));
  }
  for (const related of fieldList(fields, 'related-tasks')) {
    if (!TASK_ID_PATTERN.test(related)) {
      issues.push(issue('related-tasks', `'${related}' is not a task id.`));
    }
  }

  const findingRef = fieldString(fields, 'finding-ref');
  if (findingRef !== undefined && findingRef !== '' && !FINDING_REF_PATTERN.test(findingRef)) {
    issues.push(issue('finding-ref', 'Must be a finding id like `F1`.'));
  }

  const status = fieldString(fields, 'status');
  if (status === undefined || status.trim() === '') {
    issues.push(issue('status', 'Required frontmatter field is missing or empty.'));
  } else if (!isTaskStatus(status)) {
    issues.push(issue('status', `Must be one of: ${TASK_STATUSES.join(', ')}.`));
  }

  for (const section of TASK_SECTIONS) {
    if (!section.pattern.test(body)) {
      issues.push(issue('body', `Missing \`${section.label}\` section.`));
    }
  }

  return { valid: issues.length === 0, issues };
};
