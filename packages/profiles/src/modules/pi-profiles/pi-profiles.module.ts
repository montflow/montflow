import { Effect, Schema } from 'effect';

/**
 * A named agent profile. Stored as
 * `.agents/@montflow/profiles/<name>/PROFILE.md`.
 *
 * Frontmatter holds machine-readable metadata (name, description,
 * preferred model, skills); the body holds the human-readable definition
 * (`# Title`, `## Instructions`, `## Review Checklist`). The one-line
 * `description` is the single concept describing the agent — its role
 * and what it does.
 */
export class Profile extends Schema.Class<Profile>('Profile')({
  /** Slug name — matches the profile directory. */
  name: Schema.NonEmptyString,
  /** One-line description of the agent — its role and what it does. */
  description: Schema.String,
  /** Preferred model as `provider/model-id`, or '' when unset. */
  model: Schema.String,
  /** Skill names (SKILL.md frontmatter `name:`) this profile must load. */
  skills: Schema.Array(Schema.NonEmptyString),
  /** Custom system-prompt instructions. */
  instructions: Schema.String,
  /** Items a reviewer must verify. */
  checklist: Schema.Array(Schema.NonEmptyString),
}) {}

/**
 * Decode untrusted input (PROFILE.md frontmatter, RPC payloads) into
 * a `Profile`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Profile);

/**
 * Encode a `Profile` for persistence (PROFILE.md frontmatter).
 */
export const encode = Schema.encodeSync(Profile);

/** Minimal descriptor of an agent profile (legacy alias of {@link Profile}). */
export type PiProfile = Profile;

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Create a new profile descriptor with empty model, skills,
 * instructions, and checklist.
 * @param name - slug name matching the profile directory
 * @param description - one-line summary of the agent's role
 * @returns the new profile descriptor
 */
export const make = (name: string, description: string): Profile =>
  Profile.make({
    name,
    description,
    model: '',
    skills: [],
    instructions: '',
    checklist: [],
  });

/**
 * True when `name` is a valid profile slug (lowercase, hyphen-separated).
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

/**
 * Derives a display title from a slug, e.g. `code-reviewer` -> `Code Reviewer`.
 * @param name - profile slug
 * @returns display title
 */
export const titleFromName = (name: string): string =>
  name
    .split('-')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/** Skills an agentic creation session needs injected to author well. */
export const GENERATION_REQUIREMENTS: ReadonlyArray<string> = ['montflow-create-profiles'];

/** Skills an agentic modification session needs injected to edit well. */
export const MODIFICATION_REQUIREMENTS: ReadonlyArray<string> = ['montflow-modify-profiles'];

/** Skills an agentic format-fix session needs injected to fix well. */
export const TRANSFORM_REQUIREMENTS: ReadonlyArray<string> = [
  'montflow-create-profiles',
  'montflow-modify-profiles',
];

/**
 * Severity of a mechanical issue. An `error` fails verification; a `warning`
 * is surfaced but never fails it, so a finding that may not apply to every
 * checkout (e.g. a skill that only exists locally) does not red-out CI.
 */
export type IssueSeverity = 'error' | 'warning';

/** One mechanical check failure: which field broke, why, and how hard. */
export interface VerifyIssue {
  readonly field: string;
  readonly message: string;
  /** Defaults to `error` when absent, preserving pre-severity callers. */
  readonly severity?: IssueSeverity;
}

/** Mechanical verification outcome for one `PROFILE.md` file. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/** True when an issue fails verification; absent severity reads as `error`. */
const isError = (issue: VerifyIssue): boolean => (issue.severity ?? 'error') === 'error';

/** Number of findings that fail verification; absent severity reads as `error`. */
export const errorCount = (issues: ReadonlyArray<VerifyIssue>): number =>
  issues.filter(isError).length;

/** Number of advisory findings that never fail verification. */
export const warningCount = (issues: ReadonlyArray<VerifyIssue>): number =>
  issues.length - errorCount(issues);

/**
 * The installed-skill store a `skills:` list is resolved against: the
 * workspace root searched plus the skill names it holds. Built by the caller
 * (which owns the IO), never by the pure verifier.
 */
export interface SkillResolution {
  /** Workspace root whose `.agents/skills` store was searched (the resolved `--dir`). */
  readonly root: string;
  /** Names of the skills installed in that store. */
  readonly names: ReadonlySet<string>;
}

/** Options for {@link verifyProfileFile}. */
export interface VerifyOptions {
  /** Installed skills to resolve `skills:` names against. Absent skips resolution. */
  readonly skills?: SkillResolution | undefined;
  /** Promote warnings (e.g. an unresolved skill) to fatal errors. */
  readonly strict?: boolean | undefined;
}

const verifyIssue = (field: string, message: string): VerifyIssue => ({ field, message });

/**
 * Append extra issues (e.g. from declared-skill verification) to a
 * mechanical result. Zero extra issues returns the result unchanged.
 * @param result - base result from {@link verifyProfileFile}
 * @param extra - additional issues to fold in
 * @returns the combined result; `valid` is false when any error issue remains
 */
export const withIssues = (
  result: VerifyResult,
  extra: ReadonlyArray<VerifyIssue>,
): VerifyResult => {
  if (extra.length === 0) return result;
  const issues = [...result.issues, ...extra];
  return { valid: !issues.some(isError), issues };
};

/**
 * Skill names declared in a `PROFILE.md` `skills:` list. Pure; a file
 * with no frontmatter block declares none.
 * @param markdown - raw PROFILE.md contents
 * @returns non-blank skill names, in listed order
 */
export const declaredSkills = (markdown: string): ReadonlyArray<string> => {
  const parsed = parseProfileFile(markdown);
  if (parsed === null) return [];
  return fieldStrings(parsed.fields, 'skills');
};

/**
 * Mechanically verify a `PROFILE.md` file against the montflow-create-profiles
 * standard: frontmatter `name` (valid slug, matching the directory) +
 * non-empty `description`, plus body `# Title`, `## Instructions`, and
 * `## Review Checklist` with at least one item. When `options.skills` is
 * supplied, every `skills:` name is resolved against that store; an
 * unresolved name is reported by its exact name — a warning unless
 * `options.strict`. Pure — the caller supplies any store resolution.
 * @param dirName - profile directory slug
 * @param markdown - raw PROFILE.md contents
 * @param options - optional skill resolution and strict promotion
 * @returns the result; `valid` is true only with zero error issues
 */
export const verifyProfileFile = (
  dirName: string,
  markdown: string,
  options: VerifyOptions = {},
): VerifyResult => {
  const issues: Array<VerifyIssue> = [];
  const parsed = parseProfileFile(markdown);
  if (parsed === null) {
    return { valid: false, issues: [verifyIssue('frontmatter', 'Missing frontmatter block.')] };
  }
  const { fields, body } = parsed;
  const name = fieldString(fields, 'name') ?? dirName;
  if (!isValidName(name))
    issues.push(
      verifyIssue('name', 'Must be lowercase alphanumeric groups joined by single hyphens.'),
    );
  if (name !== dirName)
    issues.push(verifyIssue('name', `Must match the directory name '${dirName}'.`));
  const description = fieldString(fields, 'description') ?? '';
  if (description.trim() === '')
    issues.push(verifyIssue('description', 'Required frontmatter field is missing or empty.'));
  const sections = parseBody(body);
  if (sections.title === '') issues.push(verifyIssue('body', 'Missing `# Title` heading.'));
  if (sections.instructions === '')
    issues.push(verifyIssue('body', 'Missing `## Instructions` section.'));
  if (sections.checklist.length === 0)
    issues.push(verifyIssue('body', 'Missing `## Review Checklist` items.'));
  const skills = options.skills;
  if (skills !== undefined) {
    const severity: IssueSeverity = options.strict === true ? 'error' : 'warning';
    for (const skill of fieldStrings(fields, 'skills')) {
      if (skills.names.has(skill)) continue;
      issues.push({
        field: 'skills',
        message: `Skill '${skill}' is not installed under ${skills.root}/.agents/skills/.`,
        severity,
      });
    }
  }
  return { valid: !issues.some(isError), issues };
};

/**
 * One generic verify status line for the detail-menu info panel.
 * @param result - result from {@link verifyProfileFile}
 * @returns one status line for the panel
 */
export const verifyInfoLine = (result: VerifyResult): string => {
  const errors = errorCount(result.issues);
  const warnings = warningCount(result.issues);
  if (errors === 0)
    return warnings === 0
      ? '✓ verified'
      : `✓ verified — ${warnings} warning${warnings === 1 ? '' : 's'}`;
  const warningClause = warnings === 0 ? '' : ` · ${warnings} warning${warnings === 1 ? '' : 's'}`;
  return `✗ not verified — ${errors} issue${errors === 1 ? '' : 's'}${warningClause}`;
};

/**
 * Rename a profile, failing when the new name is not a valid slug.
 * @param profile - profile descriptor
 * @param name - new slug name
 * @returns Effect resolving to the renamed profile, failing on invalid slugs
 */
export const rename = (profile: Profile, name: string): Effect.Effect<Profile, string> => {
  if (!isValidName(name)) {
    return Effect.fail(`invalid profile name '${name}'`);
  }
  return Effect.succeed(Profile.make({ ...encode(profile), name }));
};

const FRONTMATTER_DELIMITER = '---';

/** One frontmatter value: a scalar `key: value` line or a `- item` list. */
type FieldValue = string | Array<string>;

/** Parsed frontmatter fields plus the markdown body after the block. */
export interface ParsedProfileFile {
  readonly fields: Record<string, FieldValue>;
  readonly body: string;
}

/**
 * Read one scalar field. Lists and missing keys read as undefined so the
 * caller falls back (empty string).
 * @param fields - parsed frontmatter fields
 * @param key - field name
 * @returns the scalar value, if present
 */
const fieldString = (fields: Record<string, FieldValue>, key: string): string | undefined => {
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
const fieldStrings = (fields: Record<string, FieldValue>, key: string): ReadonlyArray<string> => {
  const value = fields[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item.trim() !== '');
};

/**
 * Strips one layer of matching single/double quotes around a scalar value.
 * @param value - raw frontmatter scalar
 * @returns unquoted value
 */
const unquote = (value: string): string => {
  if (value.length >= 2) {
    const first = value.charAt(0);
    const last = value.charAt(value.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
};

/**
 * Parse the PROFILE.md frontmatter subset: scalar `key: value` lines plus
 * blank-value keys followed by `  - item` list lines. `#` comment lines
 * skip. Returns null when no `---` block opens the file.
 * @param markdown - raw PROFILE.md contents
 * @returns frontmatter fields plus body, or null
 */
export const parseProfileFile = (markdown: string): ParsedProfileFile | null => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== FRONTMATTER_DELIMITER) return null;
  let endIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === FRONTMATTER_DELIMITER) {
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
    const rawValue = unquote((match[2] ?? '').trim());
    if (rawValue === '') {
      const items: Array<string> = [];
      while (index < fmLines.length) {
        const listMatch = /^[ \t]+-\s+(.+)$/.exec(fmLines[index] ?? '');
        if (listMatch === null) break;
        items.push(unquote((listMatch[1] ?? '').trim()));
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

/** Parsed body sections: title, instructions, and checklist items. */
export interface ParsedBody {
  readonly title: string;
  /** Kept for legacy files: a `## Purpose` section feeds the description fallback. */
  readonly purpose: string;
  readonly instructions: string;
  readonly checklist: ReadonlyArray<string>;
}

/**
 * Extracts `# Title`, `## Purpose`, `## Instructions`,
 * `## Review Checklist` from the body.
 * @param body - markdown after the frontmatter block
 * @returns parsed sections
 */
export const parseBody = (body: string): ParsedBody => {
  const lines = body.split(/\r?\n/);
  let title = '';
  let current: 'purpose' | 'instructions' | 'checklist' | null = null;
  const purposeLines: Array<string> = [];
  const instructionLines: Array<string> = [];
  const checklist: Array<string> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      current = trimmed.startsWith('## Purpose')
        ? 'purpose'
        : trimmed.startsWith('## Instructions')
          ? 'instructions'
          : trimmed.startsWith('## Review Checklist')
            ? 'checklist'
            : null;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      title = trimmed.slice(2).trim();
      current = null;
      continue;
    }
    if (current === 'purpose') {
      purposeLines.push(line);
    } else if (current === 'instructions') {
      instructionLines.push(line);
    } else if (current === 'checklist') {
      const itemMatch = /^-\s+(?:\[[ xX]\]\s*)?(.*)$/.exec(trimmed);
      if (itemMatch !== null) {
        const item = (itemMatch[1] ?? '').trim();
        if (item !== '') checklist.push(item);
      }
    }
  }
  return {
    title,
    purpose: purposeLines.join('\n').trim(),
    instructions: instructionLines.join('\n').trim(),
    checklist,
  };
};

/**
 * Decode one `PROFILE.md` file into a `Profile`. The directory name is
 * the id; frontmatter `name` falls back to it. Malformed files fail.
 * Legacy `## Purpose` sections feed the description fallback; body
 * `## Instructions` fills `instructions` when frontmatter omits it.
 * @param dirName - profile directory slug
 * @param markdown - raw PROFILE.md contents
 * @returns Effect resolving to the profile, failing on malformed input
 */
export const decodeProfileFile = (
  dirName: string,
  markdown: string,
): Effect.Effect<Profile, string> => {
  const parsed = parseProfileFile(markdown);
  if (parsed === null) return Effect.fail(`Malformed PROFILE.md in '${dirName}'.`);
  const { fields, body } = parsed;
  const sections = parseBody(body);
  const rawName = fieldString(fields, 'name');
  const name = rawName === undefined || rawName === '' ? dirName : rawName;
  const rawDescription = fieldString(fields, 'description') ?? '';
  const description = rawDescription !== '' ? rawDescription : sections.purpose.slice(0, 120);
  const model = fieldString(fields, 'model') ?? '';
  const skills = [...fieldStrings(fields, 'skills')];
  const rawInstructions = fieldString(fields, 'instructions') ?? '';
  const instructions = rawInstructions !== '' ? rawInstructions : sections.instructions;
  const checklist =
    sections.checklist.length > 0
      ? [...sections.checklist]
      : [...fieldStrings(fields, 'checklist')];
  return decodeUnknown({
    name,
    description,
    model,
    skills,
    instructions,
    checklist,
  }).pipe(Effect.mapError(() => `Invalid profile '${dirName}'.`));
};

/** Escapes a scalar for safe single-line frontmatter output. */
const escapeScalar = (value: string): string => value.replace(/\r?\n/g, ' ').trim();

/**
 * Serialize a `Profile` to canonical `PROFILE.md` contents: frontmatter
 * plus `# Title` / `## Instructions` / `## Review Checklist` body.
 * Empty `skills` drop their key; an empty checklist keeps one blank item
 * so the section stays editable.
 * @param profile - profile to persist
 * @returns file contents
 */
export const encodeProfileFile = (profile: Profile): string => {
  const lines = [
    '---',
    `name: ${profile.name}`,
    `description: ${escapeScalar(profile.description)}`,
    `model: ${profile.model}`,
  ];
  if (profile.skills.length > 0) {
    lines.push('skills:');
    for (const skill of profile.skills) lines.push(`  - ${skill}`);
  }
  lines.push('---', '', `# ${titleFromName(profile.name)}`, '', '## Instructions', '');
  lines.push(profile.instructions.trim(), '', '## Review Checklist', '');
  if (profile.checklist.length === 0) {
    lines.push('- [ ] ');
  } else {
    for (const item of profile.checklist) lines.push(`- [ ] ${item}`);
  }
  lines.push('');
  return lines.join('\n');
};
