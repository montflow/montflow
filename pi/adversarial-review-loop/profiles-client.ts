import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  DEFAULT_REVIEWER_MODEL,
  makeReviewerProfile,
  type ReviewerProfile,
  type ThinkingLevel,
} from './config';
import { REVIEWER_SKILL_PATH } from './skill-paths';
import { formatDuration } from './format';

/**
 * Event-bus client for the @montflow/profiles extension.
 *
 * Reviewers in this extension are **profiles** — named agent definitions stored
 * by the profiles extension at `.agents/profiles/<name>/PROFILE.md`. This
 * module reads them over Pi's shared event bus using the raw protocol
 * documented in the profiles extension (`profiles:get` / `profiles:list`), so
 * no import from the profiles package is needed and both extensions only
 * couple through the bus.
 *
 * The profiles extension is a hard dependency of this extension whenever the
 * roster is built from profiles (interactive mode / profile reviewer ids).
 * The single built-in `generic` reviewer is the only roster entry that does
 * not require profiles.
 */

/** Profile data shape as stored by the profiles extension (see its model.ts). */
export interface Profile {
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly skills: readonly string[];
  readonly instructions: string;
  readonly checklist: readonly string[];
}

export const PROFILES_GET_CHANNEL = 'profiles:get';
export const PROFILES_GET_RESULT_CHANNEL = 'profiles:get:result';
export const PROFILES_LIST_CHANNEL = 'profiles:list';
export const PROFILES_LIST_RESULT_CHANNEL = 'profiles:list:result';

/** Default time the client waits for a profile response before timing out. */
export const DEFAULT_PROFILES_TIMEOUT_MS = 5000;

/** Short timeout used by availability probes (no hanging on missing extension). */
export const PROFILES_AVAILABILITY_TIMEOUT_MS = 1200;

/** Human-readable install hint shown when the profiles extension is missing. */
export const PROFILES_INSTALL_HINT =
  'The @montflow/profiles extension is required for profile-based reviewers but is not loaded. ' +
  'Install it (e.g. `ln -s <pi>/pi/profiles .pi/extensions/profiles` in this project, or in the ' +
  'global ~/.pi/agent/extensions/) and run /reload.';

/** Request for a single profile; `id` correlates the response. */
export interface ProfilesGetRequest {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
}

export type ProfilesGetResult =
  | { readonly id: string; readonly ok: true; readonly profile: Profile }
  | { readonly id: string; readonly ok: false; readonly error: string };

/** Request for the list of profile names; `id` correlates the response. */
export interface ProfilesListRequest {
  readonly id: string;
  readonly cwd: string;
}

export type ProfilesListResult =
  | { readonly id: string; readonly ok: true; readonly names: readonly string[] }
  | { readonly id: string; readonly ok: false; readonly error: string };

const newId = (): string =>
  typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── Client helpers (raw event-bus protocol) ─────────────────────────

/**
 * Requests a single parsed profile over the event bus.
 * Resolves with the result whose correlation id matches, or a timeout error
 * when the profiles extension is not loaded.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {string} name Profile name
 * @param {string} cwd Working directory (profiles are project-local)
 * @param {number} [timeoutMs] Response timeout
 * @returns The profile result
 */
export const getProfileViaBus = (
  pi: ExtensionAPI,
  name: string,
  cwd: string,
  timeoutMs: number = DEFAULT_PROFILES_TIMEOUT_MS,
): Promise<ProfilesGetResult> => {
  const id = newId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve({
        id,
        ok: false,
        error: `profiles:get timed out after ${formatDuration(timeoutMs)} (profiles extension not loaded?)`,
      });
    }, timeoutMs);
    const off = pi.events.on(PROFILES_GET_RESULT_CHANNEL, (data) => {
      const result = data as ProfilesGetResult;
      if (result.id === id) {
        clearTimeout(timer);
        off();
        resolve(result);
      }
    });
    const request: ProfilesGetRequest = { id, name, cwd };
    pi.events.emit(PROFILES_GET_CHANNEL, request);
  });
};

/**
 * Requests the list of profile names over the event bus.
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {string} cwd Working directory
 * @param {number} [timeoutMs] Response timeout
 * @returns The names result
 */
export const listProfilesViaBus = (
  pi: ExtensionAPI,
  cwd: string,
  timeoutMs: number = DEFAULT_PROFILES_TIMEOUT_MS,
): Promise<ProfilesListResult> => {
  const id = newId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve({
        id,
        ok: false,
        error: `profiles:list timed out after ${formatDuration(timeoutMs)} (profiles extension not loaded?)`,
      });
    }, timeoutMs);
    const off = pi.events.on(PROFILES_LIST_RESULT_CHANNEL, (data) => {
      const result = data as ProfilesListResult;
      if (result.id === id) {
        clearTimeout(timer);
        off();
        resolve(result);
      }
    });
    const request: ProfilesListRequest = { id, cwd };
    pi.events.emit(PROFILES_LIST_CHANNEL, request);
  });
};

// ─── Availability ────────────────────────────────────────────────────

/**
 * True when the profiles extension's `/profiles` command is registered,
 * i.e. the profiles extension is loaded in this pi session. Synchronous —
 * used before any bus request so a missing extension fails fast with a clear
 * install hint instead of a timeout.
 * @param {ExtensionAPI} pi The Pi extension API
 * @returns True when the profiles extension is loaded
 */
export const isProfilesExtensionLoaded = (pi: ExtensionAPI): boolean =>
  pi.getCommands().some(
    (command) => command.name === 'profiles' && command.source === 'extension',
  );

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
 * Maps a profiles-extension profile to a loop reviewer profile.
 * The bundled adversarial-review skill is always used as the skill source;
 * the profile contributes the id/label, preferred model, and objective lens.
 * @param {Profile} profile The profile from the profiles extension
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

export const listProfilesWithDetails = async (
  pi: ExtensionAPI,
  cwd: string,
): Promise<readonly Profile[]> => {
  const list = await listProfilesViaBus(pi, cwd);
  if (!list.ok || list.names.length === 0) return [];
  const results = await Promise.all(
    list.names.map((name) => getProfileViaBus(pi, name, cwd)),
  );
  return results.flatMap((result) => (result.ok ? [result.profile] : []));
};
