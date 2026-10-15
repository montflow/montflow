/**
 * Severity of a verification finding. An `error` fails the check; a
 * `warning` is advisory and never fails it on its own.
 */
export type Severity = 'error' | 'warning';

/** One mechanical check finding: which field broke, why, and how to fix it. */
export interface Issue {
  readonly field: string;
  readonly message: string;
  /** `error` unless set. A `warning` is advisory and does not fail a result by itself. */
  readonly severity?: Severity;
  /** Concrete instruction for whoever authored the file. Omitted when none applies. */
  readonly fix?: string;
  /** 1-based line, for findings located in the file body. */
  readonly line?: number;
}

/** Mechanical verification outcome for one file or tree. */
export interface Result {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Issue>;
}

/** An `Issue` being filled in, so optional fields stay absent rather than `undefined`. */
interface MutableIssue {
  field: string;
  message: string;
  severity?: Severity;
  fix?: string;
  line?: number;
}

/** Build one finding at `severity`, omitting absent optional fields. */
const buildIssue = (
  severity: Severity,
  field: string,
  message: string,
  fix?: string,
  line?: number,
): Issue => {
  const found: MutableIssue = { field, message };
  if (severity !== 'error') found.severity = severity;
  if (fix !== undefined) found.fix = fix;
  if (line !== undefined) found.line = line;
  return found;
};

/**
 * Build one error-severity issue — a finding that fails the check.
 * @param field - the field, path, or pseudo-key that failed
 * @param message - what is wrong and what the correct shape is
 * @param fix - concrete instruction for the author, when one applies
 * @param line - 1-based line, when the finding is in the file body
 * @returns the issue
 */
export const issue = (field: string, message: string, fix?: string, line?: number): Issue =>
  buildIssue('error', field, message, fix, line);

/**
 * Build one warning-severity issue — advisory, counted apart from errors and
 * never fatal unless a strict consumer promotes it.
 * @param field - the field, path, or pseudo-key the finding concerns
 * @param message - what is wrong and what the consequence is
 * @param fix - concrete instruction for the author, when one applies
 * @param line - 1-based line, when the finding is in the file body
 * @returns the warning
 */
export const warning = (field: string, message: string, fix?: string, line?: number): Issue =>
  buildIssue('warning', field, message, fix, line);

/** The severity of a finding; an absent severity reads as `error`. */
export const severityOf = (found: Issue): Severity => found.severity ?? 'error';

/** True when `found` is an error-severity finding. */
export const isError = (found: Issue): boolean => severityOf(found) === 'error';

/** True when `found` is a warning-severity finding. */
export const isWarning = (found: Issue): boolean => severityOf(found) === 'warning';

/** How many findings in `issues` are error severity. */
export const errorCount = (issues: ReadonlyArray<Issue>): number => issues.filter(isError).length;

/** How many findings in `issues` are warning severity. */
export const warningCount = (issues: ReadonlyArray<Issue>): number =>
  issues.filter(isWarning).length;

/** True when `issues` holds no error-severity finding — the condition `Result.valid` encodes. */
export const noErrors = (issues: ReadonlyArray<Issue>): boolean => errorCount(issues) === 0;

/**
 * Promote every warning-severity finding to error severity, so a strict
 * consumer fails on warnings too. Errors pass through unchanged.
 * @param issues - findings to promote
 * @returns the findings with every warning now an error
 */
export const promoteWarnings = (issues: ReadonlyArray<Issue>): ReadonlyArray<Issue> =>
  issues.map((found) =>
    isWarning(found)
      ? buildIssue('error', found.field, found.message, found.fix, found.line)
      : found,
  );

/**
 * True when `body` has a level-2 heading exactly equal to `heading`.
 * @param body - markdown body (frontmatter already stripped)
 * @param heading - heading text without the `## `
 * @returns true when the heading is present
 */
export const hasSection = (body: string, heading: string): boolean =>
  new RegExp(`^## ${heading}\\s*$`, 'm').test(body);

/**
 * One generic verify status line for a detail panel, verdict first. Warnings
 * ride alongside a verified verdict because they never flip it.
 * @param result - a verification result
 * @returns one status line
 */
export const infoLine = (result: Result): string => {
  const errors = errorCount(result.issues);
  const warnings = warningCount(result.issues);
  if (errors === 0) {
    return warnings === 0
      ? '\u2713 verified'
      : `\u2713 verified \u2014 ${warnings} warning${warnings === 1 ? '' : 's'}`;
  }
  return `\u2717 not verified \u2014 ${errors} issue${errors === 1 ? '' : 's'}`;
};
