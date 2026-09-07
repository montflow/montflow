import { Schema } from 'effect';

/**
 * Directory-safe identifier. Matches the skill directory name under
 * `.agents/skills/`.
 * Scoped: use as `Skill.Id`. Scalar brand, not a Class (Class models structs).
 */
export const Id = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
).pipe(Schema.brand('SkillId'));

/** Branded skill identifier. */
export type Id = typeof Id.Type;

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A single workspace skill. One skill equals one `SKILL.md` file;
 * consumers reference skills by `id` (directory) or `name` (frontmatter).
 *
 * `body` holds the markdown instructions after the frontmatter — the text
 * a consumer loads into agent context.
 */
export class Skill extends Schema.Class<Skill>('Skill')({
  id: Id,
  name: Schema.String,
  description: Schema.String,
  groups: Schema.Array(Schema.String),
  dependencies: Schema.Array(Schema.String),
  body: Schema.String,
}) {}

/**
 * Decode untrusted input (SKILL.md frontmatter, RPC payloads) into a `Skill`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Skill);

/**
 * Encode a `Skill` for persistence (`SKILL.md` frontmatter).
 */
export const encode = Schema.encodeSync(Skill);

/**
 * True when `name` is a valid skill slug (lowercase, hyphen-separated).
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

/** Skills an agentic creation run needs injected to author well. */
export const GENERATION_REQUIREMENTS: ReadonlyArray<string> = ['authoring-skills'];

/** Skills an agentic modification run needs injected to edit well. */
export const MODIFICATION_REQUIREMENTS: ReadonlyArray<string> = ['modifying-skills'];

/** Skills an agentic format-transform run needs injected to fix well. */
export const TRANSFORM_REQUIREMENTS: ReadonlyArray<string> = [
  'authoring-skills',
  'modifying-skills',
];

/** One frontmatter value: a scalar `key: value` line or a `- item` list. */
export type FieldValue = string | Array<string>;

/** Parsed frontmatter fields plus the markdown body after the block. */
export interface ParsedSkillFile {
  readonly fields: Record<string, FieldValue>;
  readonly body: string;
}

/**
 * Read one scalar field. Lists and missing keys read as undefined so the
 * caller falls back (directory name, empty string).
 * @param fields - parsed frontmatter fields
 * @param key - field name
 * @returns the scalar value, if present
 */
export const fieldString = (
  fields: Record<string, FieldValue>,
  key: string,
): string | undefined => {
  const value = fields[key];
  if (value === undefined || Array.isArray(value)) return undefined;
  return value;
};

/**
 * Read one list field. Scalars and missing keys read as empty.
 * @param fields - parsed frontmatter fields
 * @param key - field name
 * @returns non-blank items
 */
export const fieldStrings = (
  fields: Record<string, FieldValue>,
  key: string,
): ReadonlyArray<string> => {
  const value = fields[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item.trim() !== '');
};

/**
 * Parse the frontmatter subset the stores write: scalar `key: value` lines
 * plus blank-value keys followed by `  - item` list lines. `#` comment
 * lines skip. Returns null when no `---` block opens the file.
 * @param markdown - raw SKILL.md contents
 * @returns frontmatter fields plus body, or null
 */
export const parseSkillFile = (markdown: string): ParsedSkillFile | null => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return null;
  let endIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === '---') {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) return null;
  const fields: Record<string, FieldValue> = {};
  const fmLines = lines.slice(1, endIndex);
  let index = 0;
  while (index < fmLines.length) {
    const trimmed = (fmLines[index] ?? '').trim();
    index++;
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);
    if (match === null) continue;
    const key = match[1] ?? '';
    const rawValue = (match[2] ?? '').trim();
    if (rawValue === '') {
      const items: Array<string> = [];
      while (index < fmLines.length) {
        const listMatch = /^[ \t]+-\s+(.+)$/.exec(fmLines[index] ?? '');
        if (listMatch === null) break;
        items.push((listMatch[1] ?? '').trim());
        index++;
      }
      fields[key] = items;
    } else {
      fields[key] = rawValue;
    }
  }
  return {
    fields,
    body: lines
      .slice(endIndex + 1)
      .join('\n')
      .trim(),
  };
};

/** Slug pattern for skill directory names and the `name` field. */
export const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `id` is exactly 16 lowercase hex chars (immutable, cross-referenceable). */
export const SKILL_ID_PATTERN = /^[0-9a-f]{16}$/;

/** Loose SemVer: `major.minor.patch` with optional prerelease/build. */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** One mechanical check failure: which field broke, and why. */
export interface VerifyIssue {
  readonly field: string;
  readonly message: string;
}

/** Mechanical verification outcome for one `SKILL.md` file. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

const issue = (field: string, message: string): VerifyIssue => ({ field, message });

/**
 * Mechanically verify a `SKILL.md` file against the authoring-skills
 * standard: required frontmatter (`name`, `description`, `id`, `author`,
 * `version`; `name` matching the directory) plus the expected body shape
 * (`# When To Use`, `# Pipeline`, `# Reference`). Pure — no IO; the
 * caller supplies the raw file contents. Style (third person, trigger
 * terms, no filler) stays a human/agent review concern.
 * @param dirName - skill directory slug (the skill id)
 * @param markdown - raw SKILL.md contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifySkillFile = (dirName: string, markdown: string): VerifyResult => {
  const issues: Array<VerifyIssue> = [];
  const parsed = parseSkillFile(markdown);
  if (parsed === null) {
    return { valid: false, issues: [issue('frontmatter', 'Missing frontmatter block.')] };
  }
  const { fields, body } = parsed;
  const name = fieldString(fields, 'name');
  if (name === undefined || name.trim() === '') {
    issues.push(issue('name', 'Required frontmatter field is missing or empty.'));
  } else {
    if (name.length > 64) issues.push(issue('name', 'Must be 1-64 chars.'));
    if (!NAME_PATTERN.test(name))
      issues.push(issue('name', 'Must be lowercase alphanumeric groups joined by single hyphens.'));
    if (name !== dirName) issues.push(issue('name', `Must match the directory name '${dirName}'.`));
  }
  const description = fieldString(fields, 'description');
  if (description === undefined || description.trim() === '') {
    issues.push(issue('description', 'Required frontmatter field is missing or empty.'));
  } else if (description.length > 1024) {
    issues.push(issue('description', 'Must be 1-1024 chars.'));
  }
  const id = fieldString(fields, 'id');
  if (id === undefined || id.trim() === '') {
    issues.push(issue('id', 'Required frontmatter field is missing or empty.'));
  } else if (!SKILL_ID_PATTERN.test(id)) {
    issues.push(issue('id', 'Must be exactly 16 lowercase hex chars.'));
  }
  const author = fieldString(fields, 'author');
  if (author === undefined || author.trim() === '') {
    issues.push(issue('author', 'Required frontmatter field is missing or empty.'));
  }
  const version = fieldString(fields, 'version');
  if (version === undefined || version.trim() === '') {
    issues.push(issue('version', 'Required frontmatter field is missing or empty.'));
  } else if (!VERSION_PATTERN.test(version)) {
    issues.push(issue('version', 'Must be a SemVer string starting at 1.0.0.'));
  }
  for (const key of ['groups', 'dependencies'] as const) {
    const raw = fields[key];
    if (raw !== undefined && !Array.isArray(raw)) {
      issues.push(issue(key, 'Must be a YAML list.'));
    }
  }
  if (body === '') {
    issues.push(issue('body', 'Body instructions are missing or empty.'));
  } else {
    if (!/^#\s+When To Use\s*$/m.test(body))
      issues.push(issue('body', 'Missing `# When To Use` section.'));
    if (!/^#\s+Pipeline\s*$/m.test(body))
      issues.push(issue('body', 'Missing `# Pipeline` section.'));
    if (!/^#\s+Reference\s*$/m.test(body))
      issues.push(issue('body', 'Missing `# Reference` section.'));
  }
  return { valid: issues.length === 0, issues };
};

/**
 * One generic verify status line for the detail-menu info panel, verdict
 * first — same `✓`/`✗` standard as {@link menuInfoLine} in the
 * interactive app.
 * @param result - result from {@link verifySkillFile}
 * @returns one status line for the panel
 */
export const verifyInfoLine = (result: VerifyResult): string => {
  if (result.valid) return '\u2713 verified';
  const count = result.issues.length;
  return `\u2717 not verified \u2014 ${count} issue${count === 1 ? '' : 's'}`;
};

/** Presence of one required skill. Pure data for checklist UIs. */
export interface RequirementStatus {
  readonly name: string;
  readonly present: boolean;
}

/**
 * Find an installed skill by directory id, then frontmatter name.
 * @param skills - installed skills
 * @param name - skill id or name
 * @returns the match, if installed
 */
export const findInstalled = (skills: readonly Skill[], name: string): Skill | undefined =>
  skills.find((skill) => skill.id === name || skill.name === name);

/**
 * Check required skills against the installed set. Pure — adapters
 * (interactive, RPC, web) render the statuses however they present.
 * @param skills - installed skills
 * @param required - required skill names
 * @returns one status per required name, in order
 */
export const checkRequirements = (
  skills: readonly Skill[],
  required: readonly string[],
): ReadonlyArray<RequirementStatus> =>
  required.map((name) => ({ name, present: findInstalled(skills, name) !== undefined }));

/**
 * Names from a status list that are not installed.
 * @param statuses - statuses from {@link checkRequirements}
 * @returns missing names, in order
 */
export const missingRequirements = (
  statuses: readonly RequirementStatus[],
): ReadonlyArray<string> =>
  statuses.filter((status) => !status.present).map((status) => status.name);

/**
 * Resolve names to installed skills for agent injection: dependencies
 * first (transitive), deduplicated, missing names skipped.
 * @param skills - installed skills
 * @param names - skill names to inject
 * @returns installed skills in injection order
 */
export const resolveInjection = (
  skills: readonly Skill[],
  names: readonly string[],
): ReadonlyArray<Skill> => {
  const ordered: Array<Skill> = [];
  const seen = new Set<string>();
  const visit = (name: string): void => {
    const found = findInstalled(skills, name);
    if (found === undefined || seen.has(found.id)) return;
    seen.add(found.id);
    for (const dependency of found.dependencies) visit(dependency);
    ordered.push(found);
  };
  for (const name of names) visit(name);
  return ordered;
};

/**
 * Render injected skills as child-agent prompt context. Empty when none.
 * @param skills - skills to inject (from {@link resolveInjection})
 * @returns prompt section, or empty
 */
export const formatInjectedSkills = (skills: readonly Skill[]): string => {
  if (skills.length === 0) return '';
  const sections = skills.map((skill) => `### ${skill.id} — ${skill.description}\n\n${skill.body}`);
  return `\n\n## Injected skill context\n\nFollow these loaded skills while you work.\n\n${sections.join('\n\n')}`;
};
