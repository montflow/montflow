import { Effect, Schema } from 'effect';
import { type FieldValue, fieldString, parseMarkdown } from '../frontmatter/index.js';

/**
 * A principle: a short conditional rule an agent applies in one situation.
 * Stored as `.agents/@montflow/principles/<name>/PRINCIPLE.md`.
 *
 * Frontmatter holds `name` and `description`; the description is the index
 * line agents read from `mf-principles list`, so it opens with the condition
 * (`Apply when …`). The body is one `# Title`, a statement paragraph, and the
 * rules as a list. Principles are meant to be short.
 */
export class Principle extends Schema.Class<Principle>('Principle')({
  /** Slug name — matches the principle directory. */
  name: Schema.NonEmptyString,
  /** One-line `Apply when …` condition and rule. */
  description: Schema.String,
  /** The single `# Title` heading, or '' when absent. */
  title: Schema.String,
}) {}

/** Decode untrusted input into a `Principle`. */
export const decodeUnknown = Schema.decodeUnknownEffect(Principle);

/** The file every principle directory holds. */
export const FILE = 'PRINCIPLE.md';

/** The store, relative to the workspace root. */
export const STORE_DIR = ['.agents', '@montflow', 'principles'] as const;

/** Every description opens with its trigger: `Apply when …`, `Apply before …`, `Apply to …`. */
export const DESCRIPTION_PREFIX = 'Apply';

const TRIGGER_PATTERN = new RegExp(`^${DESCRIPTION_PREFIX}\\b`);

/** A body longer than this many lines draws a warning: principles are meant to be short. */
export const MAX_BODY_LINES = 60;

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * True when `name` is a valid principle slug (lowercase, hyphen-separated).
 * @param name - candidate slug
 * @returns true for valid slugs
 */
export const isValidName = (name: string): boolean => SLUG_PATTERN.test(name);

/**
 * Severity of a mechanical issue. An `error` fails verification; a `warning`
 * is surfaced but never fails it.
 */
export type IssueSeverity = 'error' | 'warning';

/** One mechanical check failure: which field broke, why, and how hard. */
export interface VerifyIssue {
  readonly field: string;
  readonly message: string;
  /** Defaults to `error` when absent. */
  readonly severity?: IssueSeverity;
}

/** Mechanical verification outcome for one `PRINCIPLE.md` file. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/**
 * True when an issue fails verification; absent severity reads as `error`.
 * @param issue - one finding
 * @returns true for error-severity findings
 */
export const isError = (issue: VerifyIssue): boolean => (issue.severity ?? 'error') === 'error';

/**
 * Number of findings that fail verification.
 * @param issues - findings to count
 * @returns the error count
 */
export const errorCount = (issues: ReadonlyArray<VerifyIssue>): number =>
  issues.filter(isError).length;

/**
 * Number of advisory findings that never fail verification.
 * @param issues - findings to count
 * @returns the warning count
 */
export const warningCount = (issues: ReadonlyArray<VerifyIssue>): number =>
  issues.length - errorCount(issues);

const error = (field: string, message: string): VerifyIssue => ({ field, message });

/**
 * Body lines outside fenced code blocks, so a `#` comment in a code sample is
 * never read as a heading.
 * @param body - markdown after the frontmatter block
 * @returns the lines outside fences, fence markers dropped
 */
const proseLines = (body: string): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) lines.push(line);
  }
  return lines;
};

/**
 * The `# ` headings in a body, outside fenced code.
 * @param body - markdown after the frontmatter block
 * @returns heading texts, in order
 */
export const titlesOf = (body: string): ReadonlyArray<string> =>
  proseLines(body)
    .filter((line) => /^#\s+\S/.test(line))
    .map((line) => line.replace(/^#\s+/, '').trim());

/**
 * The body text after the first `# ` heading.
 * @param body - markdown after the frontmatter block
 * @returns the trimmed text after the title, or '' when there is no title
 */
const afterTitle = (body: string): string => {
  const lines = body.split(/\r?\n/);
  const at = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (at === -1) return '';
  return lines
    .slice(at + 1)
    .join('\n')
    .trim();
};

/**
 * Lines a body spans once trimmed of leading and trailing blank lines.
 * @param body - markdown after the frontmatter block
 * @returns the line count
 */
const bodyLineCount = (body: string): number => {
  const trimmed = body.trim();
  return trimmed === '' ? 0 : trimmed.split(/\r?\n/).length;
};

/**
 * Mechanically verify a `PRINCIPLE.md` file: frontmatter present and readable,
 * `name` a slug equal to the directory, a non-empty `description` opening with
 * `Apply when`, exactly one `# Title`, and a non-empty body after it. A body
 * longer than {@link MAX_BODY_LINES} lines is a warning. Pure.
 * @param dirName - principle directory slug
 * @param markdown - raw PRINCIPLE.md contents
 * @returns the result; `valid` is true only with zero error issues
 */
export const verifyFile = (dirName: string, markdown: string): VerifyResult => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) {
    return {
      valid: false,
      issues: [error('frontmatter', 'Missing or unterminated `---` frontmatter block.')],
    };
  }
  const issues: Array<VerifyIssue> = [];
  for (const line of parsed.invalidLines) {
    issues.push(error('frontmatter', `Line ${line} is not a \`key: value\` pair or list item.`));
  }
  const name = fieldString(parsed.fields, 'name') ?? '';
  if (name.trim() === '') {
    issues.push(error('name', 'Required frontmatter field is missing or empty.'));
  } else {
    if (!isValidName(name))
      issues.push(error('name', 'Must be lowercase alphanumeric groups joined by single hyphens.'));
    if (name !== dirName) issues.push(error('name', `Must match the directory name '${dirName}'.`));
  }
  const description = (fieldString(parsed.fields, 'description') ?? '').trim();
  if (description === '') {
    issues.push(error('description', 'Required frontmatter field is missing or empty.'));
  } else if (!TRIGGER_PATTERN.test(description)) {
    issues.push(
      error(
        'description',
        `Must open with its trigger ('${DESCRIPTION_PREFIX} when …', '${DESCRIPTION_PREFIX} before …').`,
      ),
    );
  }
  const titles = titlesOf(parsed.body);
  if (titles.length === 0) issues.push(error('body', 'Missing `# Title` heading.'));
  if (titles.length > 1)
    issues.push(error('body', `Expected one \`# Title\` heading, found ${titles.length}.`));
  if (titles.length > 0 && afterTitle(parsed.body) === '')
    issues.push(error('body', 'Empty body after the `# Title` heading.'));
  const lines = bodyLineCount(parsed.body);
  if (lines > MAX_BODY_LINES)
    issues.push({
      field: 'body',
      message: `Body is ${lines} lines; principles are meant to stay within ${MAX_BODY_LINES}.`,
      severity: 'warning',
    });
  return { valid: !issues.some(isError), issues };
};

/**
 * Decode one `PRINCIPLE.md` file. The directory name is the id; frontmatter
 * `name` falls back to it. A file with no frontmatter block fails.
 * @param dirName - principle directory slug
 * @param markdown - raw PRINCIPLE.md contents
 * @returns Effect resolving to the principle, failing on malformed input
 */
export const decodeFile = (dirName: string, markdown: string): Effect.Effect<Principle, string> => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) return Effect.fail(`Malformed ${FILE} in '${dirName}'.`);
  const fields: Record<string, FieldValue> = parsed.fields;
  const rawName = fieldString(fields, 'name') ?? '';
  return decodeUnknown({
    name: rawName === '' ? dirName : rawName,
    description: fieldString(fields, 'description') ?? '',
    title: titlesOf(parsed.body)[0] ?? '',
  }).pipe(Effect.mapError(() => `Invalid principle '${dirName}'.`));
};
