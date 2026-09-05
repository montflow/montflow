import { Effect } from 'effect';

/** Minimal descriptor of an agent profile. */
export interface PiProfile {
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly skills: readonly string[];
}

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Create a new profile descriptor with empty model and skills.
 * @param name - slug name matching the profile directory
 * @param description - one-line summary of the agent's role
 * @returns the new profile descriptor
 */
export const make = (name: string, description: string): PiProfile => ({
  name,
  description,
  model: '',
  skills: [],
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
 * Rename a profile, failing when the new name is not a valid slug.
 * @param profile - profile descriptor
 * @param name - new slug name
 * @returns Effect resolving to the renamed profile, failing on invalid slugs
 */
export const rename = (profile: PiProfile, name: string): Effect.Effect<PiProfile, string> => {
  if (!isValidName(name)) {
    return Effect.fail(`invalid profile name '${name}'`);
  }
  return Effect.succeed({ ...profile, name });
};
