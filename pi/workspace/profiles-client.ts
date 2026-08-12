import {
  DEFAULT_REVIEWER_MODEL,
  makeReviewerProfile,
  type ReviewerProfile,
  type ThinkingLevel,
} from './config';
import { REVIEWER_SKILL_PATH } from './skill-paths';
import * as Model from './profiles/model';
import { runStore } from './profiles/runtime';
import * as Store from './profiles/store';

/**
 * Profile access for the review loop — the `@montflow/profiles` feature is
 * merged into this extension, so profiles are read **directly** from the
 * store (no event bus, no separate extension). Profiles live at
 * `.agents/@montflow/profiles/<name>/PROFILE.md`.
 *
 * External extensions that want profile context can still use the event-bus
 * API in `profiles/api.ts` (`profiles:get` / `profiles:list`), which the
 * workspace extension registers at load time.
 */

/** Profile data shape as stored by the profiles store (see profiles/model.ts). */
export type Profile = Model.Profile;

/** Result of a single-profile read: parsed profile, or a failure message. */
export type GetProfileResult =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly error: string };

/** Result of a profile-name listing. */
export type ListProfilesResult =
  | { readonly ok: true; readonly names: readonly string[] }
  | { readonly ok: false; readonly error: string };

/**
 * Reads + parses one profile directly from the store. Never throws —
 * failures become `{ ok: false, error }` (missing profile, bad file, I/O).
 * @param {string} name Profile name
 * @param {string} cwd Working directory (profiles are project-local)
 * @returns The profile result
 */
export const getProfile = async (name: string, cwd: string): Promise<GetProfileResult> => {
  try {
    const markdown = await runStore(Store.readProfileFile(cwd, name));
    return { ok: true, profile: Model.parseProfile(markdown, name) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Lists profile names directly from the store. Never throws.
 * @param {string} cwd Working directory
 * @returns The names result
 */
export const listProfiles = async (cwd: string): Promise<ListProfilesResult> => {
  try {
    const names = await runStore(Store.listProfiles(cwd));
    return { ok: true, names };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

// ─── Mapping profiles → reviewers ────────────────────────────────────

/**
 * Derives a display title from a profile slug, e.g. `security-auditor`
 * → `Security Auditor`.
 * @param {string} name Profile slug name
 * @returns The title-cased label
 */
export const titleFromProfileName = (name: string): string =>
  name
    .split('-')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * Composes the reviewer objective (lens) from a profile's data: description,
 * instructions, and review checklist. The objective is embedded in the
 * reviewer system prompt so the profile's intent actually steers the
 * adversarial pass.
 * @param {Profile} profile The profile
 * @returns The objective text
 */
export const objectiveFromProfile = (profile: Profile): string => {
  const parts = [
    profile.description.trim(),
    profile.instructions.trim(),
    profile.checklist.length > 0
      ? `Review checklist: ${profile.checklist.join('; ')}`
      : '',
  ].filter((part) => part !== '');
  return parts.join(' — ');
};

/**
 * Maps a stored profile to a loop reviewer profile.
 * The bundled adversarial-review skill is always used as the skill source;
 * the profile contributes the id/label, preferred model, and objective lens.
 * @param {Profile} profile The profile from the profiles store
 * @param {string} [model] Model override (takes precedence over profile.model)
 * @param {readonly string[]} [fallbackModels] Ordered fallback models
 * @param {ThinkingLevel} [thinkingLevel] Extended-thinking level override
 * @returns The reviewer profile
 */
export const profileToReviewerProfile = (
  profile: Profile,
  model?: string,
  fallbackModels?: readonly string[],
  thinkingLevel?: ThinkingLevel,
): ReviewerProfile =>
  makeReviewerProfile({
    id: profile.name,
    label: titleFromProfileName(profile.name),
    model: pickModel(profile, model),
    fallbackModels,
    thinkingLevel,
    skillPath: REVIEWER_SKILL_PATH,
    objective:
      objectiveFromProfile(profile) || `adversarial review focused on ${profile.name}`,
  });

/**
 * Resolves the effective reviewer model: explicit override → profile's
 * preferred model → the loop default. Empty strings count as unset.
 * @param {Profile} profile The profile
 * @param {string | undefined} model Explicit model override
 * @returns The effective model
 */
const pickModel = (profile: Profile, model: string | undefined): string => {
  if (model !== undefined && model.trim() !== '') return model.trim();
  if (profile.model !== undefined && profile.model.trim() !== '') return profile.model.trim();
  return DEFAULT_REVIEWER_MODEL;
};

/**
 * Lists every stored profile, parsed, with descriptions — for the wizard's
 * "+ Add reviewer" search list.
 * @param {string} cwd Working directory
 * @returns The parsed profiles
 */
export const listProfilesWithDetails = async (cwd: string): Promise<readonly Profile[]> => {
  const list = await listProfiles(cwd);
  if (!list.ok || list.names.length === 0) return [];
  const results = await Promise.all(list.names.map((name) => getProfile(name, cwd)));
  return results.flatMap((result) => (result.ok ? [result.profile] : []));
};
