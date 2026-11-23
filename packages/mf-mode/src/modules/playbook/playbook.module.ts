import { Effect, Schema } from 'effect';
import { type FieldValue, fieldString, parseMarkdown } from '../frontmatter/index.js';

/**
 * A playbook: a procedure an agent runs end to end. Stored as
 * `.agents/@montflow/playbooks/<name>/PLAYBOOK.md`.
 *
 * Frontmatter holds `name`, `description`, and three optional reference lists:
 * `skills` (directories under `.agents/skills`), `principles` (entries in the
 * principles store), and `playbooks` (other playbooks this one runs). The body
 * is one `# Title`, a framing paragraph, the steps or rules as a list, and an
 * optional `## Reply` section naming what the final reply must contain.
 */
export class Playbook extends Schema.Class<Playbook>('Playbook')({
  /** Slug name — matches the playbook directory. */
  name: Schema.NonEmptyString,
  /** One-line summary of what the playbook does. */
  description: Schema.String,
  /** The single `# Title` heading, or '' when absent. */
  title: Schema.String,
  /** Skill directory names under `.agents/skills`. */
  skills: Schema.Array(Schema.NonEmptyString),
  /** Principle names in `.agents/@montflow/principles`. */
  principles: Schema.Array(Schema.NonEmptyString),
  /** Other playbooks this one runs. */
  playbooks: Schema.Array(Schema.NonEmptyString),
}) {}

/** Decode untrusted input into a `Playbook`. */
export const decodeUnknown = Schema.decodeUnknownEffect(Playbook);

/** The file every playbook directory holds. */
export const FILE = 'PLAYBOOK.md';

/** The store, relative to the workspace root. */
export const STORE_DIR = ['.agents', '@montflow', 'playbooks'] as const;

/** The principles store a `principles:` entry resolves against. */
export const PRINCIPLES_DIR = ['.agents', '@montflow', 'principles'] as const;

/** The file a principle directory holds. */
export const PRINCIPLE_FILE = 'PRINCIPLE.md';

/** The skills store a `skills:` entry resolves against. */
export const SKILLS_DIR = ['.agents', 'skills'] as const;

/** The file a skill directory holds. */
export const SKILL_FILE = 'SKILL.md';

/** The optional section naming what the final reply must contain. */
export const REPLY_HEADING = 'Reply';

/** The frontmatter lists that reference other stores. */
export const REFERENCE_FIELDS = ['skills', 'principles', 'playbooks'] as const;

/** One reference list. */
export type ReferenceField = (typeof REFERENCE_FIELDS)[number];

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * True when `name` is a valid playbook slug (lowercase, hyphen-separated).
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

/** Mechanical verification outcome for one `PLAYBOOK.md` file. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/**
 * The names each reference list resolves against, gathered by the caller
 * (which owns the IO) from the same workspace root. A field left out skips
 * its resolution.
 */
export interface References {
  /** Workspace root the stores were read from, named in findings. */
  readonly root: string;
  /** Directories under `.agents/skills` that hold a `SKILL.md`. */
  readonly skills?: ReadonlySet<string> | undefined;
  /** Directories under `.agents/@montflow/principles` that hold a `PRINCIPLE.md`. */
  readonly principles?: ReadonlySet<string> | undefined;
  /** Directories under `.agents/@montflow/playbooks` that hold a `PLAYBOOK.md`. */
  readonly playbooks?: ReadonlySet<string> | undefined;
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
 * Body lines outside fenced code blocks, so a `#` comment or a numbered line
 * in a code sample is never read as structure.
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
 * True when the body holds at least one list item, ordered (`1.`) or not (`-`),
 * outside fenced code.
 * @param body - markdown after the frontmatter block
 * @returns whether a list item exists
 */
export const hasListItem = (body: string): boolean =>
  proseLines(body).some((line) => /^\s*(?:\d+[.)]|[-*+])\s+\S/.test(line));

/**
 * The `## Reply` section's text, up to the next `#`/`##` heading.
 * @param body - markdown after the frontmatter block
 * @returns the trimmed section text, '' when empty, or undefined when absent
 */
export const replyOf = (body: string): string | undefined => {
  const lines = proseLines(body);
  const at = lines.findIndex((line) => new RegExp(`^##\\s+${REPLY_HEADING}\\s*$`).test(line));
  if (at === -1) return undefined;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
};

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
 * Read one reference list. A scalar reads as undefined so the caller can
 * report the shape; a missing key reads as empty.
 * @param fields - parsed frontmatter fields
 * @param key - reference field name
 * @returns non-blank names, or undefined for a scalar value
 */
const referenceList = (
  fields: Record<string, FieldValue>,
  key: ReferenceField,
): ReadonlyArray<string> | undefined => {
  const value = fields[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item) => item.trim() !== '');
};

/** Where each reference list resolves, for the finding text. */
const STORE_OF = {
  skills: `${SKILLS_DIR.join('/')}/<name>/${SKILL_FILE}`,
  principles: `${PRINCIPLES_DIR.join('/')}/<name>/${PRINCIPLE_FILE}`,
  playbooks: `${STORE_DIR.join('/')}/<name>/${FILE}`,
} satisfies Record<ReferenceField, string>;

/** The singular noun for each reference list, for the finding text. */
const NOUN_OF = {
  skills: 'Skill',
  principles: 'Principle',
  playbooks: 'Playbook',
} satisfies Record<ReferenceField, string>;

/**
 * Mechanically verify a `PLAYBOOK.md` file: frontmatter present and readable,
 * `name` a slug equal to the directory, a non-empty `description`, exactly one
 * `# Title`, a non-empty body after it, a non-empty `## Reply` when one is
 * present, and every `skills`/`principles`/`playbooks` entry resolved against
 * `references`. A body with no list item is a warning: most playbooks number
 * their steps, but some are prose. Pure — the caller gathers the references.
 * @param dirName - playbook directory slug
 * @param markdown - raw PLAYBOOK.md contents
 * @param references - names each reference list resolves against
 * @returns the result; `valid` is true only with zero error issues
 */
export const verifyFile = (
  dirName: string,
  markdown: string,
  references?: References,
): VerifyResult => {
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
  if (description === '')
    issues.push(error('description', 'Required frontmatter field is missing or empty.'));
  for (const key of REFERENCE_FIELDS) {
    const names = referenceList(parsed.fields, key);
    if (names === undefined) {
      issues.push(error(key, 'Must be a YAML list of names.'));
      continue;
    }
    if (references === undefined) continue;
    const known = references[key];
    if (known === undefined) continue;
    for (const entry of names) {
      if (known.has(entry)) continue;
      issues.push(
        error(
          key,
          `${NOUN_OF[key]} '${entry}' does not exist at ${references.root}/${STORE_OF[key].replace('<name>', entry)}.`,
        ),
      );
    }
  }
  const titles = titlesOf(parsed.body);
  if (titles.length === 0) issues.push(error('body', 'Missing `# Title` heading.'));
  if (titles.length > 1)
    issues.push(error('body', `Expected one \`# Title\` heading, found ${titles.length}.`));
  if (titles.length > 0 && afterTitle(parsed.body) === '')
    issues.push(error('body', 'Empty body after the `# Title` heading.'));
  if (replyOf(parsed.body) === '')
    issues.push(error('body', `Empty \`## ${REPLY_HEADING}\` section.`));
  if (titles.length > 0 && afterTitle(parsed.body) !== '' && !hasListItem(parsed.body))
    issues.push({
      field: 'body',
      message: 'No list item: number the steps (`1.`) or list the rules (`-`).',
      severity: 'warning',
    });
  return { valid: !issues.some(isError), issues };
};

/**
 * Decode one `PLAYBOOK.md` file. The directory name is the id; frontmatter
 * `name` falls back to it. A file with no frontmatter block fails.
 * @param dirName - playbook directory slug
 * @param markdown - raw PLAYBOOK.md contents
 * @returns Effect resolving to the playbook, failing on malformed input
 */
export const decodeFile = (dirName: string, markdown: string): Effect.Effect<Playbook, string> => {
  const parsed = parseMarkdown(markdown);
  if (parsed === null) return Effect.fail(`Malformed ${FILE} in '${dirName}'.`);
  const fields = parsed.fields;
  const rawName = fieldString(fields, 'name') ?? '';
  return decodeUnknown({
    name: rawName === '' ? dirName : rawName,
    description: fieldString(fields, 'description') ?? '',
    title: titlesOf(parsed.body)[0] ?? '',
    skills: referenceList(fields, 'skills') ?? [],
    principles: referenceList(fields, 'principles') ?? [],
    playbooks: referenceList(fields, 'playbooks') ?? [],
  }).pipe(Effect.mapError(() => `Invalid playbook '${dirName}'.`));
};
