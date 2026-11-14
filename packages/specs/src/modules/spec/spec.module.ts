import { Schema } from 'effect';
import { fieldString, parseMarkdown } from '../frontmatter/index.js';
import type { FieldValue } from '../frontmatter/index.js';
import { type Issue, type Result, finding, hasSection, issue, noErrors } from '../verify/index.js';

// ─── Patterns ─────────────────────────────────────────────────────────

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Phase id: one or two uppercase letters (`A`…`Z`, then `AA`, `AB`, …). */
export const PHASE_PATTERN = /^[A-Z]{1,2}$/;

/** Creation date stamped in SPEC.md frontmatter. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── Enums ────────────────────────────────────────────────────────────

/** Spec lifecycle status. */
export const SPEC_STATUSES = ['in-progress', 'complete'] as const;

/** Spec lifecycle status. */
export const SpecStatus = Schema.Literals(SPEC_STATUSES);

/** Spec lifecycle status. */
export type SpecStatus = typeof SpecStatus.Type;

/** How the spec work is isolated from the main workspace. */
export const WORKSPACE_TYPES = ['worktree', 'in-place'] as const;

/** How the spec work is isolated from the main workspace. */
export const WorkspaceType = Schema.Literals(WORKSPACE_TYPES);

/** How the spec work is isolated from the main workspace. */
export type WorkspaceType = typeof WorkspaceType.Type;

// ─── Standard version ─────────────────────────────────────────────────

/** SPEC.md frontmatter field naming the artifact-contract version. */
export const SPEC_VERSION_FIELD = 'spec-version';

/** Current spec-standard version: the contract this package verifies. */
export const SPEC_STANDARD_VERSION = 2;

/** Previous spec-standard version, still accepted with a warning. */
export const SPEC_STANDARD_PREVIOUS = 1;

/** Every accepted standard version, current and previous. */
export const SPEC_STANDARD_VERSIONS = [SPEC_STANDARD_PREVIOUS, SPEC_STANDARD_VERSION] as const;

/** Stable codes for the `spec-version` rules. */
export const SPEC_VERSION_CODES = {
  /** The declared value is not a positive decimal integer. */
  invalid: 'spec.version-invalid',
  /** A real older standard: accepted, warned. */
  outdated: 'spec.version-outdated',
  /** Above the supported standard: an error, never downgraded. */
  future: 'spec.version-future',
  /** Declares v2+ while the tree is still the v1 shape. */
  untransformed: 'spec.version-untransformed',
} as const;

/** One read of SPEC.md's `spec-version`, with its findings. */
export interface SpecVersion {
  /** Effective version: the fallback (1) when the field is invalid. */
  readonly version: number;
  /** The value as written, when the field was present and decimal. */
  readonly declared: number | undefined;
  /** Findings the read produced; absent field is a warning, not an error. */
  readonly issues: ReadonlyArray<Issue>;
}

const VERSION_OUTDATED_FIX =
  'Run mf-specs migrate --name <spec>, or leave it as a frozen v1 record.';

/**
 * Read and verify SPEC.md's `spec-version` field.
 *
 * Absent reads as the previous standard and warns; the previous standard warns;
 * the current standard passes; a value above current errors; a non-decimal,
 * zero, or negative value is invalid and falls back to the previous standard.
 * @param fields - parsed SPEC.md frontmatter
 * @returns the effective version, the declared value, and any findings
 */
export const readSpecVersion = (fields: Record<string, FieldValue>): SpecVersion => {
  const raw = fieldString(fields, SPEC_VERSION_FIELD);
  if (raw === undefined || raw.trim() === '') {
    return {
      version: SPEC_STANDARD_PREVIOUS,
      declared: undefined,
      issues: [
        finding({
          code: SPEC_VERSION_CODES.outdated,
          severity: 'warning',
          field: SPEC_VERSION_FIELD,
          message: `Spec declares no standard version; it reads as version ${SPEC_STANDARD_PREVIOUS} and the current standard is ${SPEC_STANDARD_VERSION}.`,
          expected: `${SPEC_VERSION_FIELD}: ${SPEC_STANDARD_VERSION}`,
          actual: 'missing',
          fix: VERSION_OUTDATED_FIX,
        }),
      ],
    };
  }
  const trimmed = raw.trim();
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
  if (parsed === undefined || parsed < 1) {
    return {
      version: SPEC_STANDARD_PREVIOUS,
      declared: parsed,
      issues: [
        finding({
          code: SPEC_VERSION_CODES.invalid,
          field: SPEC_VERSION_FIELD,
          message: `Spec standard version '${trimmed}' is not a positive decimal integer.`,
          expected: `${SPEC_VERSION_FIELD}: ${SPEC_STANDARD_VERSION}`,
          actual: trimmed,
          fix: `Set \`${SPEC_VERSION_FIELD}: ${SPEC_STANDARD_VERSION}\`, or run mf-specs migrate --name <spec>.`,
        }),
      ],
    };
  }
  if (parsed > SPEC_STANDARD_VERSION) {
    return {
      version: parsed,
      declared: parsed,
      issues: [
        finding({
          code: SPEC_VERSION_CODES.future,
          field: SPEC_VERSION_FIELD,
          message: `Spec declares standard version ${parsed}, above the supported ${SPEC_STANDARD_VERSION}.`,
          expected: `${SPEC_VERSION_FIELD}: ${SPEC_STANDARD_VERSION}`,
          actual: String(parsed),
          fix: `Set ${SPEC_VERSION_FIELD} to ${SPEC_STANDARD_VERSION}, or upgrade mf-specs.`,
        }),
      ],
    };
  }
  if (parsed === SPEC_STANDARD_PREVIOUS) {
    return {
      version: parsed,
      declared: parsed,
      issues: [
        finding({
          code: SPEC_VERSION_CODES.outdated,
          severity: 'warning',
          field: SPEC_VERSION_FIELD,
          message: `Spec declares standard version ${parsed}; the current standard is ${SPEC_STANDARD_VERSION}.`,
          expected: `${SPEC_VERSION_FIELD}: ${SPEC_STANDARD_VERSION}`,
          actual: String(parsed),
          fix: VERSION_OUTDATED_FIX,
        }),
      ],
    };
  }
  return { version: parsed, declared: parsed, issues: [] };
};

// ─── Branded ids ──────────────────────────────────────────────────────

/**
 * Directory-safe phase id. Matches one or two uppercase letters.
 * Scoped: use as `Spec.PhaseId`. Scalar brand, not a Class.
 */
export const PhaseId = Schema.String.check(Schema.isPattern(PHASE_PATTERN)).pipe(
  Schema.brand('SpecPhaseId'),
);

/** Branded phase id. */
export type PhaseId = typeof PhaseId.Type;

// ─── Descriptor ───────────────────────────────────────────────────────

/**
 * SPEC.md frontmatter — the machine contract for one spec.
 * The markdown body (description, requirements, task table) is parsed
 * separately by {@link parseTaskTable}; this is the metadata only.
 */
export class Spec extends Schema.Class<Spec>('Spec')({
  /** Slug name — matches the spec directory. */
  name: Schema.String.check(Schema.isPattern(SLUG_PATTERN)),
  /** Lifecycle status. */
  status: SpecStatus,
  /** How the work is isolated. */
  workspaceType: WorkspaceType,
  /** Author name. */
  author: Schema.NonEmptyString,
  /** ISO creation date (`YYYY-MM-DD`). */
  created: Schema.String.check(Schema.isPattern(ISO_DATE_PATTERN)),
}) {}

/** Normalized spec frontmatter input, before schema validation. */
const specInput = (fields: Record<string, FieldValue>) => ({
  name: fieldString(fields, 'name') ?? '',
  status: fieldString(fields, 'status') ?? '',
  workspaceType: fieldString(fields, 'workspace-type') ?? '',
  author: fieldString(fields, 'author') ?? '',
  created: fieldString(fields, 'created') ?? '',
});

/**
 * Parse and schema-validate a SPEC.md document.
 * @param markdown - raw SPEC.md contents
 * @returns the spec descriptor, or undefined when invalid
 */
export const parseSpecFile = (markdown: string): Spec | undefined => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) return undefined;
  try {
    return Schema.decodeUnknownSync(Spec)(specInput(parsed.fields));
  } catch {
    return undefined;
  }
};

// ─── Task table ───────────────────────────────────────────────────────

/** One row of the SPEC.md task table. */
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
 * Extract the task table rows from a SPEC.md body. Header and
 * separator rows never match because the last column must be `Yes`/`No`.
 * @param body - SPEC.md body after the frontmatter block
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

/** Required `## <heading>` sections of a SPEC.md body. */
const SPEC_SECTIONS = ['Description', 'Requirements', 'Tasks'] as const;

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
 * Mechanically verify a SPEC.md file against the spec contract
 * standard: required frontmatter (`name`, `status`, `workspace-type`,
 * `author`, `created`; `name` matching the directory)
 * plus the body shape and a well-formed task table. Pure — no IO; the
 * caller supplies the raw file contents.
 * @param dirName - spec directory slug
 * @param markdown - raw SPEC.md contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifySpecFile = (dirName: string, markdown: string): Result => {
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
      issues.push(issue('name', `Must match the spec directory name '${dirName}'.`));
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

  issues.push(...readSpecVersion(fields).issues);

  for (const heading of SPEC_SECTIONS) {
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

  return { valid: noErrors(issues), issues };
};

// ─── Identifier helpers ───────────────────────────────────────────────

/**
 * True when `name` is a valid spec slug (lowercase, hyphen-separated).
 * @param name - candidate slug
 * @returns true for valid slugs
 */
export const isValidName = (name: string): boolean => SLUG_PATTERN.test(name);

/**
 * True when `phase` is a valid phase id (one or two uppercase letters).
 * @param phase - candidate phase id
 * @returns true for valid phase ids
 */
export const isValidPhase = (phase: string): boolean => PHASE_PATTERN.test(phase);

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
