import { Effect } from 'effect';
import * as PiProfiles from '../../modules/pi-profiles/index.js';
import * as SkillCheck from '../../modules/skill-check/index.js';
import { ProfileStore } from '../../services/index.js';

/**
 * Headless verification engine for the profiles store.
 *
 * The `/mf-profiles-cli verify [<name>...]` action needs a Pi session. This
 * module verifies profiles as a plain Effect so the binary (and the CI gate)
 * can run it with no session — the whole store, or only the named profiles.
 * It reads the raw files directly rather than going through
 * `ProfileStore.list`, which silently drops any file it cannot decode.
 *
 * Each profile's declared `skills:` are also verified through the pi-skills
 * engine (resolved in the workspace `.agents/skills/` folder). If that engine
 * cannot be loaded the skill check is skipped and a warning is attached
 * instead of failing the run.
 */

/** One profile's verification result, paired with its name. */
export interface ProfileVerifyEntry {
  readonly name: string;
  readonly result: PiProfiles.VerifyResult;
}

/** A verification report: the whole store, or the named profiles. */
export interface ProfileVerifyReport {
  readonly entries: ReadonlyArray<ProfileVerifyEntry>;
  readonly issueCount: number;
  /** Non-fatal problems (e.g. the skills engine was unavailable). */
  readonly warnings: ReadonlyArray<string>;
}

/** A requested-but-absent profile, reported rather than dropped. */
const profileNotFound: PiProfiles.VerifyResult = {
  valid: false,
  issues: [{ field: 'profile', message: 'Profile not found.' }],
};

/**
 * Mechanically verify profile files under `<cwd>/.agents/@montflow/profiles`,
 * including files the store cannot decode, plus each declared skill. Pass
 * `names` to verify only those profiles; a requested name with no file is
 * reported as not found. Omit `names` to verify the whole store.
 * @param cwd - workspace root owning the profiles and skills stores
 * @param names - profile names to verify, or undefined for every profile
 * @returns Effect resolving to the report, failing when the store is unreadable
 */
export const verifyAll = (
  cwd: string,
  names?: ReadonlyArray<string>,
): Effect.Effect<ProfileVerifyReport, string, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const raws = yield* store
      .readAllRaw(cwd)
      .pipe(Effect.mapError((error: ProfileStore.StoreError) => error.message));
    const byName = new Map(raws.map(({ name, raw }) => [name, raw] as const));
    const selected: ReadonlyArray<{ readonly name: string; readonly raw: string | undefined }> =
      names === undefined
        ? raws.map(({ name, raw }) => ({ name, raw }))
        : names.map((name) => ({ name, raw: byName.get(name) }));
    const present = selected.filter(
      (profile): profile is { readonly name: string; readonly raw: string } =>
        profile.raw !== undefined,
    );
    const check = yield* SkillCheck.checkSkills(
      cwd,
      present.flatMap((profile) => PiProfiles.declaredSkills(profile.raw)),
    );
    const issueByName = new Map<string, PiProfiles.VerifyIssue>();
    for (const verdict of check.verdicts) {
      if (verdict.issue !== undefined) issueByName.set(verdict.name, verdict.issue);
    }
    const entries = selected.map(({ name, raw }): ProfileVerifyEntry => {
      if (raw === undefined) return { name, result: profileNotFound };
      const base = PiProfiles.verifyProfileFile(name, raw);
      const skillIssues = PiProfiles.declaredSkills(raw)
        .map((skill) => issueByName.get(skill))
        .filter((issue): issue is PiProfiles.VerifyIssue => issue !== undefined);
      return { name, result: PiProfiles.withIssues(base, skillIssues) };
    });
    const issueCount = entries.reduce((count, entry) => count + entry.result.issues.length, 0);
    return {
      entries,
      issueCount,
      warnings: check.warning === undefined ? [] : [check.warning],
    };
  });

/** Verification states accepted by `list --status`. */
export const LIST_STATUSES = ['valid', 'invalid'] as const;

/** A verification state `list --status` accepts. */
export type ListStatus = (typeof LIST_STATUSES)[number];

const isListStatus = (value: string): value is ListStatus =>
  LIST_STATUSES.some((status) => status === value);

/**
 * Resolve a raw `--status` value to a {@link ListStatus}. Absent or empty
 * means "no filter"; anything else must name a state.
 * @param value - raw flag value, if any
 * @returns the status, or a refusal naming the accepted values
 */
export const resolveListStatus = (
  value: string | undefined,
): Effect.Effect<ListStatus | undefined, string> => {
  if (value === undefined || value === '') return Effect.succeed(undefined);
  return isListStatus(value)
    ? Effect.succeed(value)
    : Effect.fail(`Unknown status '${value}'. Use one of: ${LIST_STATUSES.join(', ')}.`);
};

/** Optional fields for `create` / `modify`. Absent means default (create) or keep (modify). */
export interface ProfileFields {
  readonly description: string | undefined;
  readonly model: string | undefined;
  readonly skills: readonly string[] | undefined;
  readonly instructions: string | undefined;
  readonly checklist: readonly string[] | undefined;
}

/** Find a profile by name, or fail with a displayable message. */
const findOrFail = (
  profiles: ReadonlyArray<PiProfiles.Profile>,
  name: string,
): Effect.Effect<PiProfiles.Profile, string> => {
  const profile = profiles.find((candidate) => candidate.name === name);
  return profile === undefined
    ? Effect.fail(`Unknown profile '${name}'.`)
    : Effect.succeed(profile);
};

/** List every profile in the store. */
export const list = (
  cwd: string,
): Effect.Effect<ReadonlyArray<PiProfiles.Profile>, never, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    return yield* store.list(cwd);
  });

/**
 * Load one profile by name.
 * @param cwd - workspace root owning the profiles store
 * @param name - profile name
 * @returns Effect resolving to the profile, failing on unknown names
 */
export const show = (
  cwd: string,
  name: string,
): Effect.Effect<PiProfiles.Profile, string, ProfileStore.ProfileStore> =>
  list(cwd).pipe(Effect.flatMap((profiles) => findOrFail(profiles, name)));

/**
 * Create a profile from explicit fields. Requires a description and a valid slug.
 * @param cwd - workspace root owning the profiles store
 * @param name - profile name
 * @param fields - profile fields
 * @returns Effect resolving to the saved profile
 */
export const create = (
  cwd: string,
  name: string,
  fields: ProfileFields,
): Effect.Effect<PiProfiles.Profile, string, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    if (fields.description === undefined) {
      return yield* Effect.fail('create requires --description "text".');
    }
    if (!PiProfiles.isValidName(name)) {
      return yield* Effect.fail(
        `Invalid profile name '${name}' — use kebab-case (lowercase, hyphen-separated).`,
      );
    }
    const profile = yield* PiProfiles.decodeUnknown({
      name,
      description: fields.description,
      model: fields.model ?? '',
      skills: fields.skills ?? [],
      instructions: fields.instructions ?? '',
      checklist: fields.checklist ?? [],
    }).pipe(Effect.mapError(() => `Invalid profile fields for '${name}'.`));
    yield* store.save(cwd, profile).pipe(Effect.mapError((error) => error.message));
    return profile;
  });

/**
 * Update a profile in place. Absent fields keep the stored value.
 * @param cwd - workspace root owning the profiles store
 * @param name - profile name
 * @param fields - fields to change
 * @returns Effect resolving to the saved profile, failing on unknown names
 */
export const modify = (
  cwd: string,
  name: string,
  fields: ProfileFields,
): Effect.Effect<PiProfiles.Profile, string, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const profiles = yield* store.list(cwd);
    const profile = yield* findOrFail(profiles, name);
    const encoded = PiProfiles.encode(profile);
    const updated = yield* PiProfiles.decodeUnknown({
      ...encoded,
      description: fields.description ?? encoded.description,
      model: fields.model ?? encoded.model,
      skills: fields.skills ?? encoded.skills,
      instructions: fields.instructions ?? encoded.instructions,
      checklist: fields.checklist ?? encoded.checklist,
    }).pipe(Effect.mapError(() => `Invalid profile fields for '${name}'.`));
    yield* store.save(cwd, updated).pipe(Effect.mapError((error) => error.message));
    return updated;
  });

/**
 * Delete a profile by name.
 * @param cwd - workspace root owning the profiles store
 * @param name - profile name
 * @returns Effect resolving to the deleted profile, failing on unknown names
 */
export const remove = (
  cwd: string,
  name: string,
): Effect.Effect<PiProfiles.Profile, string, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const profiles = yield* store.list(cwd);
    const profile = yield* findOrFail(profiles, name);
    yield* store.remove(cwd, profile.name).pipe(Effect.mapError((error) => error.message));
    return profile;
  });

/**
 * Keep only profiles whose file passes (`valid`) or fails (`invalid`)
 * mechanical verification. An unreadable file counts as invalid.
 * @param cwd - workspace root owning the profiles store
 * @param profiles - profiles to filter
 * @param status - verification state to keep
 * @returns Effect resolving to the matching profiles
 */
export const filterByStatus = (
  cwd: string,
  profiles: ReadonlyArray<PiProfiles.Profile>,
  status: ListStatus,
): Effect.Effect<ReadonlyArray<PiProfiles.Profile>, never, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const wanted = status === 'valid';
    const verdicts = yield* Effect.forEach(profiles, (profile) =>
      store.readRaw(cwd, profile.name).pipe(
        Effect.map((raw) => ({
          profile,
          valid: PiProfiles.verifyProfileFile(profile.name, raw).valid,
        })),
        Effect.orElseSucceed(() => ({ profile, valid: false })),
      ),
    );
    return verdicts.filter((entry) => entry.valid === wanted).map((entry) => entry.profile);
  });

/** Re-exported so existing callers keep reading the render from the engines module. */
export { renderVerifyAll } from './renderers.apps.module.js';
