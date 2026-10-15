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
  /** Error-severity findings across every profile. */
  readonly issueCount: number;
  /** Warning-severity findings across every profile, counted apart from issues. */
  readonly warningCount: number;
  /** Non-fatal problems (e.g. the skills engine was unavailable). */
  readonly warnings: ReadonlyArray<string>;
}

/** Options for {@link verifyAll}. */
export interface VerifyOptions {
  /** Treat unresolved skill references as errors instead of warnings. */
  readonly strict?: boolean | undefined;
}

/**
 * The warning to attach when declared skills went unchecked because the
 * skills engine could not load. {@link SkillCheck.resolveSkills} returns
 * undefined both when no store exists (a silent skip) and when the engine is
 * unavailable (a skipped check the reader must hear about); this names the
 * rule so only the latter warns, and only when a skill was declared.
 * @param resolution - the skill resolution, or undefined when it did not resolve
 * @param declaredCount - distinct skills the profiles declared
 * @param engineAvailable - whether the pi-skills runtime loaded
 * @returns the warning, or undefined when no check was actually skipped
 */
export const skillsEngineWarning = (
  resolution: PiProfiles.SkillResolution | undefined,
  declaredCount: number,
  engineAvailable: boolean,
): string | undefined =>
  resolution === undefined && declaredCount > 0 && !engineAvailable
    ? SkillCheck.SKILLS_ENGINE_WARNING
    : undefined;

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
 *
 * Declared skills are resolved against `<cwd>/.agents/skills`: an unresolved
 * name is a warning (an error under `options.strict`), and an installed
 * montflow skill that fails its standard is an error. A missing skill store
 * skips resolution entirely rather than reporting every name as missing.
 * @param cwd - workspace root owning the profiles and skills stores
 * @param names - profile names to verify, or undefined for every profile
 * @param options - strict promotion for unresolved skill references
 * @returns Effect resolving to the report, failing when the store is unreadable
 */
export const verifyAll = (
  cwd: string,
  names?: ReadonlyArray<string>,
  options: VerifyOptions = {},
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
    const resolution = yield* SkillCheck.resolveSkills(cwd);
    const installed = resolution?.names ?? new Set<string>();
    const declared = present.flatMap((profile) => PiProfiles.declaredSkills(profile.raw));
    // Only skills that exist reach the standard check: an unresolved name is
    // the pure verifier's warning, and would be a duplicate error here.
    const check = yield* SkillCheck.checkSkills(
      cwd,
      declared.filter((name) => installed.has(name)),
    );
    // `resolveSkills` collapses "no store to resolve" (a silent skip) and
    // "engine unavailable" into undefined; only the latter skipped a check the
    // reader asked for, so surface its warning — but only when a declared
    // skill was actually left unchecked.
    const engineWarning = skillsEngineWarning(
      resolution,
      declared.length,
      yield* SkillCheck.engineAvailable(),
    );
    const issueByName = new Map<string, PiProfiles.VerifyIssue>();
    for (const verdict of check.verdicts) {
      if (verdict.issue !== undefined) issueByName.set(verdict.name, verdict.issue);
    }
    const entries = selected.map(({ name, raw }): ProfileVerifyEntry => {
      if (raw === undefined) return { name, result: profileNotFound };
      const base = PiProfiles.verifyProfileFile(name, raw, {
        skills: resolution,
        strict: options.strict,
      });
      const skillIssues = PiProfiles.declaredSkills(raw)
        .map((skill) => issueByName.get(skill))
        .filter((issue): issue is PiProfiles.VerifyIssue => issue !== undefined);
      return { name, result: PiProfiles.withIssues(base, skillIssues) };
    });
    const allIssues = entries.flatMap((entry) => entry.result.issues);
    const issueCount = allIssues.filter((issue) => (issue.severity ?? 'error') === 'error').length;
    return {
      entries,
      issueCount,
      warningCount: allIssues.length - issueCount,
      warnings: engineWarning === undefined ? [] : [engineWarning],
    };
  });

/** Verification states accepted by `list --status`. */
export const LIST_STATUSES = ['valid', 'invalid'] as const;

/** A verification state `list --status` accepts. */
export type ListStatus = (typeof LIST_STATUSES)[number];

/**
 * One listed profile plus the number of warning-severity findings it carries.
 * The list surface owns the warning count so `list --status valid` can mark an
 * entry that passes (`valid`) only because its finding is advisory — otherwise
 * a warning-bearing profile would be indistinguishable from a clean one.
 */
export interface ProfileListEntry {
  readonly profile: PiProfiles.Profile;
  /** Warning-severity findings for this profile; zero when it has none. */
  readonly warningCount: number;
}

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
 * mechanical verification, each paired with its warning count. An unreadable
 * file counts as invalid. The warning count is carried through so the list
 * surface can mark an entry whose only finding is advisory rather than
 * silently dropping it as clean.
 * @param cwd - workspace root owning the profiles store
 * @param profiles - profiles to filter
 * @param status - verification state to keep
 * @returns Effect resolving to the matching entries with their warning counts
 */
export const filterByStatus = (
  cwd: string,
  profiles: ReadonlyArray<PiProfiles.Profile>,
  status: ListStatus,
): Effect.Effect<ReadonlyArray<ProfileListEntry>, never, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const wanted = status === 'valid';
    const resolution = yield* SkillCheck.resolveSkills(cwd);
    const verdicts = yield* Effect.forEach(profiles, (profile) =>
      store.readRaw(cwd, profile.name).pipe(
        Effect.map((raw) => {
          const result = PiProfiles.verifyProfileFile(profile.name, raw, { skills: resolution });
          return {
            profile,
            valid: result.valid,
            warningCount: PiProfiles.warningCount(result.issues),
          };
        }),
        Effect.orElseSucceed(() => ({ profile, valid: false, warningCount: 0 })),
      ),
    );
    return verdicts
      .filter((entry) => entry.valid === wanted)
      .map((entry) => ({ profile: entry.profile, warningCount: entry.warningCount }));
  });

/** Re-exported so existing callers keep reading the render from the engines module. */
export { renderVerifyAll } from './renderers.apps.module.js';
