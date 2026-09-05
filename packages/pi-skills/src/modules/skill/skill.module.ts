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
