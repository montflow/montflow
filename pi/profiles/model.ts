import { Schema } from 'effect';

/**
 * A named agent profile. Stored as `.agents/profiles/<name>/PROFILE.md`.
 *
 * Frontmatter holds machine-readable metadata (name, preferred model, skills);
 * the body holds the human-readable definition (instructions, review checklist).
 * The one-line `description` is the single concept describing the agent — its
 * role and what it does (the job). There is no separate purpose field.
 */
export interface Profile {
  /** Slug name — matches the profile directory. */
  readonly name: string;
  /** One-line description of the agent — its role and what it does. */
  readonly description: string;
  /** Preferred model as `provider/model-id`, or '' when unset. */
  readonly model: string;
  /** Skill names (SKILL.md frontmatter `name:`) this profile must load. */
  readonly skills: readonly string[];
  /** Custom system-prompt instructions. */
  readonly instructions: string;
  /** Items a reviewer must verify. */
  readonly checklist: readonly string[];
}

/** Schema-validated profile shape. Used for CLI-flag constructed profiles. */
export const ProfileSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  model: Schema.optionalKey(Schema.String),
  skills: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  instructions: Schema.optionalKey(Schema.String),
  checklist: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
});

/** Input for CLI-constructed profiles; validated by {@link validateProfileFields}. */
export interface ProfileFieldsInput {
  readonly name: string;
  readonly description: string;
  readonly model?: string;
  readonly skills?: readonly string[];
  readonly instructions?: string;
  readonly checklist?: readonly string[];
}

/**
 * Validates profile fields with the Effect Schema, normalizing optionals to
 * concrete defaults. Returns undefined when validation fails.
 */
export const validateProfileFields = (input: ProfileFieldsInput): Profile | undefined => {
  try {
    const decoded = Schema.decodeUnknownSync(ProfileSchema)(input);
    return {
      name: decoded.name,
      description: decoded.description,
      model: decoded.model ?? '',
      skills: decoded.skills ?? [],
      instructions: decoded.instructions ?? '',
      checklist: decoded.checklist ?? [],
    };
  } catch {
    return undefined;
  }
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when `name` is a valid profile slug (lowercase, hyphen-separated). */
export const isValidProfileName = (name: string): boolean => SLUG_PATTERN.test(name);

/** Lowercases and converts any run of non-alphanumeric characters into a single hyphen. */
export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Derives a display title from a slug, e.g. `code-reviewer` -> `Code Reviewer`. */
export const titleFromName = (name: string): string =>
  name
    .split('-')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

// ─── Frontmatter parsing ──────────────────────────────────────────────

interface ParsedFrontmatter {
  readonly fields: Record<string, unknown>;
  readonly body: string;
}

const FRONTMATTER_DELIMITER = '---';

/**
 * Splits a markdown document into frontmatter fields + body.
 * Tolerant parser: supports `key: value` scalars (optionally quoted) and
 * `key:` followed by indented `- item` list lines. Returns null when the
 * document has no `---`-delimited frontmatter block.
 */
export const parseFrontmatter = (markdown: string): ParsedFrontmatter | null => {
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

  const fields: Record<string, unknown> = {};
  const fmLines = lines.slice(1, endIndex);

  let index = 0;
  while (index < fmLines.length) {
    const line = fmLines[index] ?? '';
    const trimmed = line.trim();
    index++;

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);
    if (match === null) continue;

    const key = match[1] ?? '';
    const rawValue = (match[2] ?? '').trim();

    if (rawValue === '') {
      // Collect an indented list.
      const items: string[] = [];
      while (index < fmLines.length) {
        const listMatch = /^[ \t]+-\s+(.+)$/.exec(fmLines[index] ?? '');
        if (listMatch === null) break;
        items.push(unquote(listMatch[1] ?? '').trim());
        index++;
      }
      fields[key] = items;
    } else {
      fields[key] = unquote(rawValue);
    }
  }

  return { fields, body: lines.slice(endIndex + 1).join('\n') };
};

/** Strips one layer of matching single/double quotes around a scalar value. */
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

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
};

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// ─── Body section parsing ─────────────────────────────────────────────

interface ParsedBody {
  readonly title: string;
  /** Kept for legacy files: a `## Purpose` section feeds the description fallback. */
  readonly purpose: string;
  readonly instructions: string;
  readonly checklist: string[];
}

/** Extracts `# Title`, `## Purpose`, `## Instructions`, `## Review Checklist` from the body. */
export const parseBody = (body: string): ParsedBody => {
  const lines = body.split(/\r?\n/);
  let title = '';
  let current: 'purpose' | 'instructions' | 'checklist' | null = null;
  const sections: Record<'purpose' | 'instructions', string[]> = { purpose: [], instructions: [] };
  const checklist: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      current =
        trimmed.startsWith('## Purpose') ? 'purpose'
        : trimmed.startsWith('## Instructions') ? 'instructions'
        : trimmed.startsWith('## Review Checklist') ? 'checklist'
        : null;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      title = trimmed.slice(2).trim();
      current = null;
      continue;
    }
    if (current === 'purpose' || current === 'instructions') {
      sections[current].push(line);
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
    purpose: sections.purpose.join('\n').trim(),
    instructions: sections.instructions.join('\n').trim(),
    checklist,
  };
};

// ─── Profile parse/serialize ──────────────────────────────────────────

/**
 * Parses a PROFILE.md document into a profile.
 * `fallbackName` supplies the name when frontmatter omits it (the directory
 * name is authoritative, e.g. after a rename inside the editor).
 */
export const parseProfile = (markdown: string, fallbackName: string): Profile => {
  const fm = parseFrontmatter(markdown);
  const fields = fm?.fields ?? {};
  const body = parseBody(fm?.body ?? markdown);

  return {
    name: asString(fields['name']) !== '' ? asString(fields['name']) : fallbackName,
    // Legacy profiles carry the job description in a `## Purpose` body section;
    // it feeds the description fallback so the single description concept still
    // covers role + job for files created before the merge.
    description: asString(fields['description']) || body.purpose.slice(0, 120),
    model: asString(fields['model']),
    skills: asStringArray(fields['skills']),
    instructions: asString(fields['instructions']) || body.instructions,
    checklist: body.checklist.length > 0 ? body.checklist : asStringArray(fields['checklist']),
  };
};

/** Escapes a scalar for safe single-line frontmatter output. */
const escapeScalar = (value: string): string => value.replace(/\r?\n/g, ' ').trim();

/** Serializes a profile to canonical PROFILE.md. */
export const serializeProfile = (profile: Profile): string => {
  const lines: string[] = [];
  lines.push(FRONTMATTER_DELIMITER);
  lines.push(`name: ${profile.name}`);
  lines.push(`description: ${escapeScalar(profile.description)}`);
  lines.push(`model: ${profile.model}`);
  if (profile.skills.length > 0) {
    lines.push('skills:');
    for (const skill of profile.skills) lines.push(`  - ${skill}`);
  }
  lines.push(FRONTMATTER_DELIMITER);
  lines.push('');
  lines.push(`# ${titleFromName(profile.name)}`);
  lines.push('');
  lines.push('## Instructions');
  lines.push('');
  lines.push(profile.instructions.trim());
  lines.push('');
  lines.push('## Review Checklist');
  lines.push('');
  if (profile.checklist.length === 0) {
    lines.push('- [ ] ');
  } else {
    for (const item of profile.checklist) lines.push(`- [ ] ${item}`);
  }
  lines.push('');
  return lines.join('\n');
};

// ─── Template rendering ───────────────────────────────────────────────

/**
 * Returns a replacer that emits the joined `list` once, then '' for any
 * further matches (used to replace multiple identical placeholder lines).
 */
const firstOnly = (list: readonly string[], format: (item: string) => string): () => string => {
  let replaced = false;
  return () => {
    if (replaced) return '';
    replaced = true;
    return list.map(format).join('\n');
  };
};

/**
 * Fills the well-known placeholders of TEMPLATE.md with profile data.
 * Placeholders not present in the template are left untouched.
 */
export const renderProfileFromTemplate = (template: string, profile: Profile): string => {
  let output = template;

  // Simple string placeholders.
  output = output.replaceAll('<profile-name>', profile.name);
  output = output.replaceAll('# <Profile Name>', `# ${titleFromName(profile.name)}`);
  output = output.replaceAll('<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>', profile.instructions.trim());

  // Description placeholder line.
  const descriptionLine = /^[ \t]*description:.*<one-line description[^>]*>.*$/m;
  if (descriptionLine.test(output)) {
    output = output.replace(descriptionLine, `description: ${escapeScalar(profile.description)}`);
  }

  // Model placeholder line (kept empty when no preferred model).
  const modelLine = /^[ \t]*model:[ \t]*<provider>\/<model-id>.*$/m;
  if (modelLine.test(output)) {
    output = output.replace(modelLine, profile.model === '' ? 'model:' : `model: ${profile.model}`);
  }

  // Skills placeholder line(s) — the first is replaced by the actual list,
  // remaining placeholder lines are dropped. Empty lists drop all lines.
  const skillLine = /^[ \t]*-[ \t]*<skill-name>.*$/gm;
  if (skillLine.test(output)) {
    output = output.replace(
      skillLine,
      profile.skills.length > 0 ? firstOnly(profile.skills, (skill) => `  - ${skill}`) : () => '',
    );
  }

  // Checklist placeholder line(s) — same rule as skills.
  const checklistLine = /^[ \t]*-[ \t]*\[[ xX]\]\s*<What the reviewer must verify[^>]*>.*$/gm;
  if (checklistLine.test(output)) {
    output = output.replace(
      checklistLine,
      profile.checklist.length > 0 ? firstOnly(profile.checklist, (item) => `- [ ] ${item}`) : () => '',
    );
  }

  return output;
};
