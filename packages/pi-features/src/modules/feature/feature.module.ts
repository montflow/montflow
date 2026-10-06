import { Schema } from 'effect';
import { fieldList, fieldString, parseMarkdown } from '../frontmatter/index.js';
import type { FieldValue } from '../frontmatter/index.js';
import { type Issue, type Result, hasSection, issue } from '../verify/index.js';

// ─── Patterns ─────────────────────────────────────────────────────────

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Phase id: one or two uppercase letters (`A`…`Z`, then `AA`, `AB`, …). */
export const PHASE_PATTERN = /^[A-Z]{1,2}$/;

/** Creation date stamped in FEATURE.md frontmatter. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── Enums ────────────────────────────────────────────────────────────

/** Feature lifecycle status. */
export const FEATURE_STATUSES = ['in-progress', 'complete'] as const;

/** Feature lifecycle status. */
export const FeatureStatus = Schema.Literals(FEATURE_STATUSES);

/** Feature lifecycle status. */
export type FeatureStatus = typeof FeatureStatus.Type;

/** How the feature work is isolated from the main workspace. */
export const WORKSPACE_TYPES = ['worktree', 'in-place'] as const;

/** How the feature work is isolated from the main workspace. */
export const WorkspaceType = Schema.Literals(WORKSPACE_TYPES);

/** How the feature work is isolated from the main workspace. */
export type WorkspaceType = typeof WorkspaceType.Type;

// ─── Branded ids ──────────────────────────────────────────────────────

/**
 * Directory-safe phase id. Matches one or two uppercase letters.
 * Scoped: use as `Feature.PhaseId`. Scalar brand, not a Class.
 */
export const PhaseId = Schema.String.check(Schema.isPattern(PHASE_PATTERN)).pipe(
  Schema.brand('FeaturePhaseId'),
);

/** Branded phase id. */
export type PhaseId = typeof PhaseId.Type;

// ─── Descriptor ───────────────────────────────────────────────────────

/**
 * FEATURE.md frontmatter — the machine contract for one feature spec.
 * The markdown body (description, requirements, task table) is parsed
 * separately by {@link parseTaskTable}; this is the metadata only.
 */
export class Feature extends Schema.Class<Feature>('Feature')({
  /** Slug name — matches the feature directory. */
  name: Schema.String.check(Schema.isPattern(SLUG_PATTERN)),
  /** Lifecycle status. */
  status: FeatureStatus,
  /** How the work is isolated. */
  workspaceType: WorkspaceType,
  /** Author name. */
  author: Schema.NonEmptyString,
  /** ISO creation date (`YYYY-MM-DD`). */
  created: Schema.String.check(Schema.isPattern(ISO_DATE_PATTERN)),
  /** Phase letters committed and locked; empty until the first phase commit. */
  lockedPhases: Schema.Array(PhaseId),
}) {}

/** Normalized feature frontmatter input, before schema validation. */
const featureInput = (fields: Record<string, FieldValue>) => ({
  name: fieldString(fields, 'name') ?? '',
  status: fieldString(fields, 'status') ?? '',
  workspaceType: fieldString(fields, 'workspace-type') ?? '',
  author: fieldString(fields, 'author') ?? '',
  created: fieldString(fields, 'created') ?? '',
  lockedPhases: fieldList(fields, 'locked-phases'),
});

/**
 * Parse and schema-validate a FEATURE.md document.
 * @param markdown - raw FEATURE.md contents
 * @returns the feature descriptor, or undefined when invalid
 */
export const parseFeatureFile = (markdown: string): Feature | undefined => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) return undefined;
  try {
    return Schema.decodeUnknownSync(Feature)(featureInput(parsed.fields));
  } catch {
    return undefined;
  }
};

// ─── Task table ───────────────────────────────────────────────────────

/** One row of the FEATURE.md task table. */
export interface TaskRow {
  /** Task id, e.g. `A001`. */
  readonly id: string;
  /** Short task name. */
  readonly name: string;
  /** Declared task type. */
  readonly type: string;
  /** Declared task status. */
  readonly status: string;
  /** Whether the task has a per-task GATES.md. */
  readonly gates: boolean;
}

const TASK_TABLE_ROW =
  /^\|\s*([A-Z]{1,2}\d{3})\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(Yes|No)\s*\|$/;

/**
 * Extract the task table rows from a FEATURE.md body. Header and
 * separator rows never match because the last column must be `Yes`/`No`.
 * @param body - FEATURE.md body after the frontmatter block
 * @returns one entry per task row, in file order
 */
export const parseTaskTable = (body: string): ReadonlyArray<TaskRow> => {
  const rows: Array<TaskRow> = [];
  for (const line of body.split(/\r?\n/)) {
    const match = TASK_TABLE_ROW.exec(line.trim());
    if (match === null) continue;
    rows.push({
      id: match[1] ?? '',
      name: match[2] ?? '',
      type: match[3] ?? '',
      status: match[4] ?? '',
      gates: match[5] === 'Yes',
    });
  }
  return rows;
};

// ─── Mechanical verification ──────────────────────────────────────────

/** Required `## <heading>` sections of a FEATURE.md body. */
const FEATURE_SECTIONS = ['Description', 'Requirements', 'Tasks'] as const;

/** Known task types, duplicated here only to validate the table column. */
const TASK_TYPE_VALUES = new Set([
  'exploratory',
  'execution',
  'planning',
  'interruptor',
  'defect',
  'review',
]);

/** Known task statuses, duplicated here only to validate the table column. */
const TASK_STATUS_VALUES = new Set(['pending', 'in-progress', 'complete', 'blocked']);

/**
 * Mechanically verify a FEATURE.md file against the pi-features contract
 * standard: required frontmatter (`name`, `status`, `workspace-type`,
 * `author`, `created`, `locked-phases`; `name` matching the directory)
 * plus the body shape and a well-formed task table. Pure — no IO; the
 * caller supplies the raw file contents.
 * @param dirName - feature directory slug
 * @param markdown - raw FEATURE.md contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyFeatureFile = (dirName: string, markdown: string): Result => {
  const issues: Array<Issue> = [];
  const parsed = parseMarkdown(markdown);
  if (parsed === null) {
    return { valid: false, issues: [issue('frontmatter', 'Missing frontmatter block.')] };
  }
  const { fields, body } = parsed;

  const name = fieldString(fields, 'name');
  if (name === undefined || name.trim() === '') {
    issues.push(issue('name', 'Required frontmatter field is missing or empty.'));
  } else {
    if (!SLUG_PATTERN.test(name)) {
      issues.push(issue('name', 'Must be lowercase alphanumeric groups joined by single hyphens.'));
    }
    if (name !== dirName) {
      issues.push(issue('name', `Must match the feature directory name '${dirName}'.`));
    }
  }

  const status = fieldString(fields, 'status');
  if (status === undefined || status.trim() === '') {
    issues.push(issue('status', 'Required frontmatter field is missing or empty.'));
  } else if (status !== 'in-progress' && status !== 'complete') {
    issues.push(issue('status', "Must be 'in-progress' or 'complete'."));
  }

  const workspaceType = fieldString(fields, 'workspace-type');
  if (workspaceType === undefined || workspaceType.trim() === '') {
    issues.push(issue('workspace-type', 'Required frontmatter field is missing or empty.'));
  } else if (workspaceType !== 'worktree' && workspaceType !== 'in-place') {
    issues.push(issue('workspace-type', "Must be 'worktree' or 'in-place'."));
  }

  const author = fieldString(fields, 'author');
  if (author === undefined || author.trim() === '') {
    issues.push(issue('author', 'Required frontmatter field is missing or empty.'));
  }

  const created = fieldString(fields, 'created');
  if (created === undefined || created.trim() === '') {
    issues.push(issue('created', 'Required frontmatter field is missing or empty.'));
  } else if (!ISO_DATE_PATTERN.test(created)) {
    issues.push(issue('created', 'Must be an ISO date (YYYY-MM-DD).'));
  }

  for (const phase of fieldList(fields, 'locked-phases')) {
    if (!PHASE_PATTERN.test(phase))
      issues.push(issue('locked-phases', `'${phase}' is not a phase id.`));
  }

  for (const heading of FEATURE_SECTIONS) {
    if (!hasSection(body, heading))
      issues.push(issue('body', `Missing \`## ${heading}\` section.`));
  }

  const rows = parseTaskTable(body);
  if (rows.length === 0) issues.push(issue('tasks', 'Task table has no rows.'));
  for (const row of rows) {
    if (!TASK_TYPE_VALUES.has(row.type)) {
      issues.push(issue('tasks', `Task '${row.id}' has unknown type '${row.type}'.`));
    }
    if (!TASK_STATUS_VALUES.has(row.status)) {
      issues.push(issue('tasks', `Task '${row.id}' has unknown status '${row.status}'.`));
    }
  }

  return { valid: issues.length === 0, issues };
};

// ─── Slug helpers ─────────────────────────────────────────────────────

/**
 * True when `name` is a valid feature slug (lowercase, hyphen-separated).
 * @param name - candidate slug
 * @returns true for valid slugs
 */
export const isValidName = (name: string): boolean => SLUG_PATTERN.test(name);

/**
 * Lowercases and converts any run of non-alphanumeric characters into a
 * single hyphen, trimming leading/trailing hyphens.
 * @param name - raw display name
 * @returns slugified name
 */
export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
