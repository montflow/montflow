/**
 * Severity of a verification finding. An `error` fails the check; a
 * `warning` is advisory and never fails it on its own.
 */
export type Severity = 'error' | 'warning';

/**
 * Precedence layers a sizing finding consulted, least to most specific. The
 * `cause` of a finding might be a raw value; this trace is plain data.
 */
export interface LayerTrace {
  /** Layers consulted, least to most specific (`repo`, `spec`, `phase`). */
  readonly consulted: ReadonlyArray<string>;
  /** Layer whose file or entry carries the finding, when one does. */
  readonly layer?: string;
  /** Phase whose overrides were considered, when relevant. */
  readonly phase?: string;
}

/** One mechanical check finding: which field broke, why, and how to fix it. */
export interface Issue {
  /**
   * Stable, greppable identifier for the failure class (e.g.
   * `sizing.unknown-size`). Optional so existing findings keep working.
   */
  readonly code?: string;
  readonly field: string;
  readonly message: string;
  /** `error` unless set. A `warning` is advisory and does not fail a result by itself. */
  readonly severity?: Severity;
  /** Concrete instruction for whoever authored the file. Omitted when none applies. */
  readonly fix?: string;
  /** What the contract requires, when naming it helps. */
  readonly expected?: string;
  /** What the file actually holds, when naming it helps. */
  readonly actual?: string;
  /** 1-based line, for findings located in the file body. */
  readonly line?: number;
  /**
   * Original failure the finding wrapped (a decode error, `SyntaxError`, or
   * engine error), preserved whole until a renderer stringifies its chain.
   */
  readonly cause?: unknown;
  /** Precedence layers a sizing finding consulted, when it depends on them. */
  readonly layers?: LayerTrace;
}

/** Mechanical verification outcome for one file or tree. */
export interface Result {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Issue>;
}

/** Full input for {@link finding}; absent optional fields stay absent. */
export interface FindingInput {
  readonly field: string;
  readonly message: string;
  /** `error` unless set. */
  readonly severity?: Severity;
  readonly code?: string;
  readonly fix?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly line?: number;
  readonly cause?: unknown;
  readonly layers?: LayerTrace;
}

/** An `Issue` being filled in, so optional fields stay absent rather than `undefined`. */
interface MutableIssue {
  code?: string;
  field: string;
  message: string;
  severity?: Severity;
  fix?: string;
  expected?: string;
  actual?: string;
  line?: number;
  cause?: unknown;
  layers?: LayerTrace;
}

/** Build one finding at `severity`, omitting absent optional fields. */
const buildIssue = (severity: Severity, input: FindingInput): Issue => {
  const found: MutableIssue = { field: input.field, message: input.message };
  if (severity !== 'error') found.severity = severity;
  if (input.code !== undefined) found.code = input.code;
  if (input.fix !== undefined) found.fix = input.fix;
  if (input.expected !== undefined) found.expected = input.expected;
  if (input.actual !== undefined) found.actual = input.actual;
  if (input.line !== undefined) found.line = input.line;
  if (input.cause !== undefined) found.cause = input.cause;
  if (input.layers !== undefined) found.layers = input.layers;
  return found;
};

/**
 * Build one finding from a full description — the shape coded, agent-first
 * diagnostics use. Absent optional fields stay absent.
 * @param input - the finding
 * @returns the issue
 */
export const finding = (input: FindingInput): Issue => buildIssue(input.severity ?? 'error', input);

/**
 * Build one error-severity issue — a finding that fails the check.
 * @param field - the field, path, or pseudo-key that failed
 * @param message - what is wrong and what the correct shape is
 * @param fix - concrete instruction for the author, when one applies
 * @param line - 1-based line, when the finding is in the file body
 * @returns the issue
 */
export const issue = (field: string, message: string, fix?: string, line?: number): Issue => {
  const found: MutableIssue = { field, message };
  if (fix !== undefined) found.fix = fix;
  if (line !== undefined) found.line = line;
  return found;
};

/**
 * Build one warning-severity issue — advisory, counted apart from errors and
 * never fatal unless a strict consumer promotes it.
 * @param field - the field, path, or pseudo-key the finding concerns
 * @param message - what is wrong and what the consequence is
 * @param fix - concrete instruction for the author, when one applies
 * @param line - 1-based line, when the finding is in the file body
 * @returns the warning
 */
export const warning = (field: string, message: string, fix?: string, line?: number): Issue => {
  const found = finding({ field, message, severity: 'warning' });
  const withFix = fix === undefined ? found : { ...found, fix };
  return line === undefined ? withFix : { ...withFix, line };
};

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
  issues.map((found) => (isWarning(found) ? buildIssue('error', found) : found));

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
