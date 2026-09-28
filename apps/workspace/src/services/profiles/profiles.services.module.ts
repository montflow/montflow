// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/@montflow/profiles; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for profile files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: shells out to the pi CLI for the session probe; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the session probe shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import type { Interactive as ProfilesInteractive, PiProfiles } from '@montflow/pi-profiles';
import type { RunDetail as EngineRunDetail } from '@montflow/pi-runs';
import { Data, Effect } from 'effect';
import * as Runs from '../runs/index.js';
import * as Skills from '../skills/index.js';

/**
 * Lazy handle to the profiles extension runtime. Static imports from
 * `@montflow/pi-profiles` are type-only (erased at build) — the runtime
 * resolves here, on first flow use, never at dashboard boot. A broken
 * or missing extension therefore cannot crash the TUI; the failing
 * flow surfaces the load error as a toast instead.
 */
type PiProfilesLib = typeof import('@montflow/pi-profiles');

/** Failure loading the profiles extension runtime. `cause` classifies the import rejection. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/ProfilesExtensionLoadError')<{
  readonly message: string;
  readonly cause: 'network' | 'missing' | 'unknown';
}> {}

/** Substrings marking a failed module fetch (offline registry, dropped connection). */
const NETWORK_SIGNALS = [
  'failed to fetch',
  'fetch failed',
  'network',
  'econnreset',
  'etimedout',
  'enotfound',
];

/** Substrings marking a runtime that is not on disk (never installed, pruned). */
const MISSING_SIGNALS = [
  'cannot find',
  'err_module_not_found',
  'failed to resolve',
  'no such file',
  'enoent',
];

/** One-line copy per load-failure cause, toasted by the caller. */
export const loadErrorMessage = (cause: ExtensionLoadError['cause']): string => {
  switch (cause) {
    case 'network':
      return 'Profiles extension download failed (network) — check the connection, then retry.';
    case 'missing':
      return 'Profiles extension not found — reinstall the workspace dependencies, then retry.';
    default:
      return 'Profiles extension failed to load — reinstall the workspace dependencies, then retry.';
  }
};

/**
 * Classify an import rejection into a typed load error. Dynamic imports
 * reject with plain Errors (or strings) — the message decides whether
 * the user should retry the network, reinstall, or just retry.
 * @param cause - import rejection payload
 * @returns typed load error
 */
export const classifyLoadError = (cause: unknown): ExtensionLoadError => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const lowered = message.toLowerCase();
  const kind: ExtensionLoadError['cause'] = NETWORK_SIGNALS.some((signal) =>
    lowered.includes(signal),
  )
    ? 'network'
    : MISSING_SIGNALS.some((signal) => lowered.includes(signal))
      ? 'missing'
      : 'unknown';
  return new ExtensionLoadError({ message: loadErrorMessage(kind), cause: kind });
};

/** Cached extension module promise. Cleared on failure so retrying reloads it. */
let cachedLib: Promise<PiProfilesLib> | undefined;

/** The resolved extension runtime, once a flow has loaded it. Backs the synchronous picker matcher below. */
let liveLib: PiProfilesLib | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<PiProfilesLib> => {
  cachedLib ??= import('@montflow/pi-profiles').then(
    (libs) => {
      liveLib = libs;
      return libs;
    },
    (cause: unknown) => {
      cachedLib = undefined;
      throw cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause);
    },
  );
  return cachedLib;
};

/** Test hook: drop the cached runtime so the next load re-imports. */
export const resetExtensionCache = (): void => {
  cachedLib = undefined;
  liveLib = undefined;
};

/**
 * Load the profiles extension runtime as an Effect, caching the module
 * across flows. The dynamic import is the only Promise in the chain —
 * every rejection is classified (network vs missing vs unknown) into
 * an `ExtensionLoadError`, and failures clear the cache so a retry
 * re-imports.
 * @returns Effect resolving to the extension module namespace
 */
export const loadPiProfiles = (): Effect.Effect<PiProfilesLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => importOnce(),
    catch: (cause) => (cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause)),
  });

/**
 * The loaded extension runtime, if any flow has loaded it yet.
 * @returns the extension module namespace, or undefined before first load
 */
export const loadedPiProfiles = (): PiProfilesLib | undefined => liveLib;

/**
 * The shared subsequence matcher for the TUI filter picker, once a flow
 * has loaded the extension. The picker only opens mid-flow (after a
 * successful load), so callers fall back to unfiltered rows before that.
 * @returns matcher, or undefined before first load
 */
export const loadedMatcher = (): ((label: string, query: string) => boolean) | undefined =>
  liveLib?.Interactive.matchesFilter;

/**
 * Require the extension runtime inside flows: load failures become
 * string errors the TUI toasts (install, then retry).
 * @returns Effect resolving to the extension module namespace
 */
const loadLibs = (): Effect.Effect<PiProfilesLib, string> =>
  loadPiProfiles().pipe(Effect.mapError((error) => error.message));

/** One profile row for the dashboard list and detail views. Mirrors `PiProfiles.Profile` with an `id` alias (the slug). */
export interface ProfileSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly skills: ReadonlyArray<string>;
  readonly instructions: string;
  readonly checklist: ReadonlyArray<string>;
}

/**
 * Bridge a `PiProfiles.Profile` into a dashboard row. Total — the
 * profile already carries every field.
 * @param profile - pi-profiles Profile
 * @returns dashboard row
 */
export const fromProfile = (profile: PiProfiles.Profile): ProfileSummary => ({
  id: profile.name,
  name: profile.name,
  description: profile.description,
  model: profile.model,
  skills: [...profile.skills],
  instructions: profile.instructions,
  checklist: [...profile.checklist],
});

/**
 * Bridge a dashboard row back into a `PiProfiles.Profile` for the shared
 * interactive flows. Takes the lazily loaded runtime — no static extension
 * dependency.
 * @param libs - loaded extension runtime
 * @param row - dashboard profile row
 * @returns Effect resolving to the Profile, failing on invalid rows
 */
export const toProfile = (
  libs: PiProfilesLib,
  row: ProfileSummary,
): Effect.Effect<PiProfiles.Profile, string> =>
  libs.PiProfiles.decodeUnknown({
    name: row.name,
    description: row.description,
    model: row.model,
    skills: [...row.skills],
    instructions: row.instructions,
    checklist: [...row.checklist],
  }).pipe(Effect.mapError(() => `Invalid profile '${row.id}'.`));

/**
 * Parse `pi list` stdout. True when the pi-profiles extension is registered
 * in the pi session — the package name (or path segment) shows on its
 * own line in the project/user package list. Mirrors the skills session
 * probe so both panels stage their boot identically.
 * @param stdout - raw command stdout
 * @returns true when pi-profiles is listed
 */
export const parseListOutput = (stdout: string): boolean =>
  stdout.split(/\r?\n/).some((line) => line.includes('pi-profiles'));

/**
 * True when pi-profiles is installed in the pi session (`pi list` registers
 * it). The probe runs in the workspace root so project-local packages
 * resolve — from anywhere else `pi list` reports nothing. Slow or
 * failing probes read as missing — without the extension the dashboard
 * has no profile runtime to run flows against. Stage one of the panel
 * boot (`extension`); the list read follows it, so the Loader narrates
 * the same two stages with the same timing profile as the skills panel.
 * @param root - workspace root (pi project directory)
 * @returns installed flag, never fails
 */
export const isExtensionInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    promisify(execFile)('pi', ['list'], { cwd: root, timeout: 8000 }).then(
      ({ stdout }) => parseListOutput(stdout.toString()),
      () => false,
    ),
  );

/** Directory segments (under the workspace root) owning the profile store. */
const PROFILES_DIR = ['.agents', '@montflow', 'profiles'] as const;

/** Failure when the profiles CLI install (directory seed) fails. Carries the reason. */
export class InstallError extends Data.TaggedError('@montflow/ProfilesInstallError')<{
  readonly message: string;
}> {}

/**
 * True when the profiles store directory exists.
 * @param root - workspace root
 * @returns installed flag, never fails
 */
export const isStoreInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(join(root, ...PROFILES_DIR)).then(
      () => true,
      () => false,
    ),
  );

/**
 * Seed the profiles store directory (`<root>/.agents/@montflow/profiles/`).
 * The file store writes its `TEMPLATE.md` on first save — install only
 * ensures the directory exists.
 * @param root - workspace root (install target)
 * @returns Effect completing once installed, failing with the reason
 */
export const installProfiles = (root: string): Effect.Effect<void, InstallError> =>
  Effect.tryPromise({
    try: () => mkdir(join(root, ...PROFILES_DIR), { recursive: true }).then(() => undefined),
    catch: (cause) =>
      new InstallError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
  });

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. Mirrors `PiProfiles.SLUG_PATTERN` without loading the runtime. */
export const PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * True when `id` is a safe profile directory name (no traversal, no blanks).
 * @param id - candidate profile slug
 * @returns true for safe ids
 */
export const isValidProfileId = (id: string): boolean =>
  id.length >= 1 && id.length <= 64 && PROFILE_SLUG_PATTERN.test(id);

/** Failure when deleting a profile directory fails. Carries the reason. */
export class DeleteError extends Data.TaggedError('@montflow/ProfilesDeleteError')<{
  readonly message: string;
}> {}

/**
 * Delete a workspace profile by removing its directory under
 * `<root>/.agents/@montflow/profiles/`. Refuses blank or traversing
 * ids so a bad keybind target can never escape the store.
 * @param root - workspace root (profile store owner)
 * @param id - profile directory name
 * @returns Effect completing once removed, failing with the reason
 */
export const deleteProfile = (root: string, id: string): Effect.Effect<void, DeleteError> => {
  if (!isValidProfileId(id))
    return Effect.fail(
      new DeleteError({ message: `Refusing to delete unsafe profile id '${id}'.` }),
    );
  return Effect.tryPromise({
    try: () => rm(join(root, ...PROFILES_DIR, id), { recursive: true }).then(() => undefined),
    catch: (cause) =>
      new DeleteError({
        message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
      }),
  });
};

/** Failure when persisting a profile file fails. Carries the reason. */
export class SaveError extends Data.TaggedError('@montflow/ProfilesSaveError')<{
  readonly message: string;
}> {}

/**
 * Persist a profile row to `<root>/.agents/@montflow/profiles/<id>/PROFILE.md`,
 * creating the directory as needed. Encodes through the lazily loaded
 * runtime so both hosts produce identical files.
 * @param root - workspace root (profile store owner)
 * @param row - profile row to persist
 * @returns Effect completing once written, failing with the reason
 */
export const saveProfile = (root: string, row: ProfileSummary): Effect.Effect<void, SaveError> =>
  Effect.gen(function* () {
    const libs = yield* loadLibs().pipe(Effect.mapError((message) => new SaveError({ message })));
    const profile = yield* toProfile(libs, row).pipe(
      Effect.mapError((message) => new SaveError({ message })),
    );
    yield* Effect.tryPromise({
      try: () =>
        mkdir(join(root, ...PROFILES_DIR, row.id), { recursive: true })
          .then(() =>
            writeFile(
              join(root, ...PROFILES_DIR, row.id, 'PROFILE.md'),
              libs.PiProfiles.encodeProfileFile(profile),
              'utf8',
            ),
          )
          .then(() => undefined),
      catch: (cause) =>
        new SaveError({
          message: cause instanceof Error ? cause.message.slice(-2000) : String(cause),
        }),
    });
  });

/**
 * Read one raw `PROFILE.md` file. Fails on unknown names.
 * @param root - workspace root (profile store owner)
 * @param id - profile directory name
 * @returns Effect resolving to the raw file contents
 */
export const readRawProfile = (root: string, id: string): Effect.Effect<string, string> => {
  if (!isValidProfileId(id)) return Effect.fail(`Unknown profile '${id}'.`);
  return Effect.promise(() =>
    readFile(join(root, ...PROFILES_DIR, id, 'PROFILE.md'), 'utf8').then(
      (raw) => raw,
      () => undefined,
    ),
  ).pipe(
    Effect.flatMap((raw) =>
      raw === undefined ? Effect.fail(`Unknown profile '${id}'.`) : Effect.succeed(raw),
    ),
  );
};

/**
 * Mechanical verification outcome for one profile. Alias of the
 * extension's `VerifyResult` so the reported shape never drifts from
 * the check that produced it.
 */
export type ProfileVerify = PiProfiles.VerifyResult;

/**
 * Verify one workspace profile: read its raw `PROFILE.md` and delegate
 * the mechanical check to the loaded extension runtime's
 * `PiProfiles.verifyProfileFile`. The check itself stays in
 * `@montflow/pi-profiles` — this host only supplies the bytes. Fails on
 * unknown, unsafe, or unreadable ids.
 * @param root - workspace root (profile store owner)
 * @param id - profile directory name
 * @returns Effect resolving to the verify result, failing with a displayable message
 */
export const verifyProfile = (root: string, id: string): Effect.Effect<ProfileVerify, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      readRawProfile(root, id).pipe(
        Effect.map((raw) => libs.PiProfiles.verifyProfileFile(id, raw)),
      ),
    ),
  );

/** Staged boot phase behind the profiles-panel Loader: extension import, then the profile-list read. */
export type ProfilesPhase = 'extension' | 'profiles';

/**
 * Profile rows for the TUI boot through the loaded profile module: load
 * the extension runtime, then list the store via file reads decoded with
 * `PiProfiles.decodeProfileFile` (sorted by name). Malformed files skip
 * so the list stays usable. The caller sets the Loader variant per
 * stage — `extension` while the import runs, `profiles` while the list
 * reads — so boot narrates step by step.
 * @param root - workspace root (profile store owner)
 * @returns Effect resolving to sorted summary rows, failing with displayable message
 */
/** Directory read outcome: names when the store exists, empty when it vanished mid-flight. */
interface DirEntries {
  readonly installed: boolean;
  readonly names: ReadonlyArray<string>;
}

/**
 * Read the store directory, never failing: a missing directory reads as
 * not-installed with no names (the caller owns the missing message).
 * @param root - workspace root (profile store owner)
 * @returns Effect resolving to the install flag plus entry names
 */
const readEntries = (root: string): Effect.Effect<DirEntries> =>
  Effect.promise(() =>
    readdir(join(root, ...PROFILES_DIR)).then(
      (names): DirEntries => ({ installed: true, names }),
      (): DirEntries => ({ installed: false, names: [] }),
    ),
  );

export const fetchProfiles = (root: string): Effect.Effect<ProfileSummary[], string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      readEntries(root).pipe(
        Effect.flatMap((entries) => {
          if (!entries.installed) {
            const none: Array<ProfileSummary> = [];
            return Effect.succeed(none);
          }
          return Effect.forEach(entries.names, (entry) =>
            Effect.promise(() =>
              readFile(join(root, ...PROFILES_DIR, entry, 'PROFILE.md'), 'utf8').then(
                (raw) => raw,
                () => undefined,
              ),
            ).pipe(
              Effect.flatMap((raw) =>
                raw === undefined
                  ? Effect.succeed(undefined)
                  : libs.PiProfiles.decodeProfileFile(entry, raw).pipe(
                      Effect.map(fromProfile),
                      Effect.orElseSucceed(() => undefined),
                    ),
              ),
            ),
          ).pipe(
            Effect.map((rows) =>
              rows
                .filter((row): row is ProfileSummary => row !== undefined)
                .toSorted((a, b) => a.name.localeCompare(b.name)),
            ),
          );
        }),
      ),
    ),
  );

/**
 * File-backed `ProfileStore` port for the shared interactive flows:
 * the workspace host behind `Interactive.createProfile` /
 * `modifyProfile`. Lists skip malformed files (dashboard convention);
 * saves and deletes carry string errors.
 * @param root - workspace root (profile store owner)
 * @returns store port for the interactive flows
 */
export const storeFor = (root: string): ProfilesInteractive.ProfileStore => ({
  list: () =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        readEntries(root).pipe(
          Effect.flatMap((entries) => {
            if (!entries.installed) {
              const none: ReadonlyArray<PiProfiles.Profile> = [];
              return Effect.succeed(none);
            }
            return Effect.forEach(entries.names, (entry) =>
              Effect.promise(() =>
                readFile(join(root, ...PROFILES_DIR, entry, 'PROFILE.md'), 'utf8').then(
                  (raw) => raw,
                  () => undefined,
                ),
              ).pipe(
                Effect.flatMap((raw) =>
                  raw === undefined
                    ? Effect.succeed(undefined)
                    : libs.PiProfiles.decodeProfileFile(entry, raw).pipe(
                        Effect.orElseSucceed(() => undefined),
                      ),
                ),
              ),
            ).pipe(
              Effect.map((all) =>
                all.filter((profile): profile is PiProfiles.Profile => profile !== undefined),
              ),
            );
          }),
        ),
      ),
    ),
  save: (profile) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        Effect.tryPromise({
          try: () =>
            mkdir(join(root, ...PROFILES_DIR, profile.name), { recursive: true })
              .then(() =>
                writeFile(
                  join(root, ...PROFILES_DIR, profile.name, 'PROFILE.md'),
                  libs.PiProfiles.encodeProfileFile(profile),
                  'utf8',
                ),
              )
              .then(() => undefined),
          catch: (cause) => (cause instanceof Error ? cause.message.slice(-2000) : String(cause)),
        }),
      ),
    ),
  delete: (name) => deleteProfile(root, name).pipe(Effect.mapError((error) => error.message)),
  readRaw: (name) => readRawProfile(root, name),
});

/**
 * Skill inventory port for the requirements gate behind agentic runs:
 * installed workspace skills as `InstalledSkill` rows. Never fails —
 * an unreadable store reads as empty.
 * @param root - workspace root (skill store owner)
 * @returns inventory port for the interactive flows
 */
export const skillInventoryFor = (root: string): ProfilesInteractive.SkillStore => ({
  list: () =>
    Skills.getSkills(root).pipe(
      Effect.map(({ skills }) =>
        skills.map((skill): ProfilesInteractive.InstalledSkill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          dependencies: [...skill.dependencies],
          body: skill.body,
        })),
      ),
    ),
});

/**
 * Skill installer port for the shared interactive flows (the
 * requirements gate): named installs via the skills CLI.
 * @param root - workspace root (install target)
 * @returns installer port for the interactive flows
 */
export const installerFor =
  (root: string): ProfilesInteractive.SkillInstaller =>
  (names) =>
    Skills.installSkillNames(root, names).pipe(Effect.mapError((error) => error.message));

/**
 * Instructions before the user description: the child agent authors
 * exactly one profile, then stops. Mirrors `AUTHOR_PREPROMPT` in
 * `@montflow/pi-profiles`'s extension (not exported through the package
 * index, so the workspace host carries this copy for its dispatched
 * author runs).
 */
export const AUTHOR_PREPROMPT = `You are a profile author for a pi coding agent.

Create exactly one new agent profile following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

---
name: <kebab-case-name>
description: <one line: the agent's role and what it does>
model: <provider/model-id, or blank when unset>
skills:
  - <skill-name>
---

# <Profile Name>

## Instructions

<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>

## Review Checklist

- [ ] <What the reviewer must verify before the work is done>
- [ ] <What the reviewer must verify before the work is done>

Rules:
- Write the new profile at .agents/@montflow/profiles/<name>/PROFILE.md (choose a
  kebab-case <name> that fits the description), with the frontmatter block exactly as
  shown (name/description required; model/skills optional, blank model when unset).
- The description must say WHAT the agent is (its role and job — it drives profile selection).
- List .agents/skills/ and read each SKILL.md frontmatter 'name:' before
  listing a skill — reference existing skills only, otherwise leave skills
  empty (or omit the key).
- If .agents/skills/authoring-profiles/SKILL.md exists, follow its standards.
- The Instructions section holds the custom system prompt; the Review Checklist
  holds at least one verifiable item.
- If a profile with that name already exists, pick a fresh name instead.
- Post short progress with the 'update_status' tool as you work (e.g. "scouting skills",
  "writing PROFILE.md") so the run's row shows what it is doing.
- Do not touch anything outside .agents/@montflow/profiles/.`;

/** Instructions after the user description: the reply shape. Mirrors the extension's `AUTHOR_POSTPROMPT`. */
export const AUTHOR_POSTPROMPT =
  'When done, call `notify_user` with a short completion message, then reply with one short line: the profile name and what it does.';

/**
 * Instructions before the change request: the child agent edits the single
 * named profile, then stops. Mirrors `MODIFY_PREPROMPT` in
 * `@montflow/pi-profiles`'s extension.
 */
export const MODIFY_PREPROMPT = `You are a profile editor for a pi coding agent.

Modify the single profile named in the request, keeping the PROFILE.md schema valid
(frontmatter name/description/model/skills plus # Title, ## Instructions,
## Review Checklist), then stop. Do not ask follow-up questions — work from
the change as given.

Rules:
- Edit only the named profile under .agents/@montflow/profiles/.
- Do not rename the profile directory and do not change the 'name' field.
  Do not touch anything else.
- Keep the description saying WHAT the agent is (its role and job).
- Reference existing skills only (check .agents/skills/ SKILL.md frontmatter
  'name:' values); drop unknown names instead of inventing them.
- If .agents/skills/authoring-profiles/SKILL.md exists, follow its standards.
- Keep at least one Review Checklist item.`;

/** Instructions after the change request: the reply shape. Mirrors the extension's `MODIFY_POSTPROMPT`. */
export const MODIFY_POSTPROMPT = 'When done, reply with one short line: what changed.';

/**
 * TUI callbacks for a dispatched editor run's completion: the named
 * profile was found and persisted (refresh + toast), or the run settled
 * without a usable change (surface the reason). Absent in headless tests.
 */
export interface ModifyFlowHooks {
  /** Named profile found after the editor run settled. */
  readonly onProfileModified?: ((profile: ProfileSummary, runId: string) => void) | undefined;
  /** Editor run settled without updating the profile. */
  readonly onProfileFailed?: ((message: string, runId: string) => void) | undefined;
}

/**
 * Completion hook for a dispatched editor run: re-read the named profile,
 * refuse a no-op settle by comparing the raw file to the dispatch
 * snapshot, persist it canonically through the loaded runtime's
 * decode+encode path, and notify the hooks. Exported so a resumed editor
 * run can re-attach the same hook through `Runs.resumeRun` after an app
 * restart.
 * @param root - workspace root (profile store owner)
 * @param libs - loaded extension runtime
 * @param runId - the editor run id
 * @param profileId - profile directory name under edit
 * @param beforeRaw - raw `PROFILE.md` snapshotted at dispatch, or undefined when unreadable
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const modifyCompletion =
  (
    root: string,
    libs: PiProfilesLib,
    runId: string,
    profileId: string,
    beforeRaw: string | undefined,
    hooks?: ModifyFlowHooks,
  ): ((detail: EngineRunDetail) => Effect.Effect<void>) =>
  (_detail) =>
    Effect.gen(function* () {
      const { valid, invalid } = yield* readFreshProfiles(libs, root, [profileId]);
      const updated = valid.find((profile) => profile.name === profileId);
      if (updated === undefined) {
        hooks?.onProfileFailed?.(
          invalid.length > 0
            ? `Run '${runId}' wrote an invalid profile '${profileId}' — check its PROFILE.md and retry.`
            : `Run '${runId}' finished without updating profile '${profileId}' — try describing the change differently.`,
          runId,
        );
        return;
      }
      const afterRaw = yield* readRawProfile(root, profileId).pipe(
        Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }),
      );
      if (beforeRaw !== undefined && afterRaw === beforeRaw) {
        hooks?.onProfileFailed?.(
          `Run '${runId}' finished without updating profile '${profileId}' — try describing the change differently.`,
          runId,
        );
        return;
      }
      const row = fromProfile(updated);
      const failure = yield* saveProfile(root, row).pipe(
        Effect.match({ onFailure: (error) => error.message, onSuccess: () => undefined }),
      );
      if (failure !== undefined) {
        hooks?.onProfileFailed?.(
          `Run '${runId}' updated '${profileId}' but it could not be saved: ${failure}`,
          runId,
        );
        return;
      }
      hooks?.onProfileModified?.(row, runId);
    });

/**
 * TUI callbacks for a dispatched author run's completion: the fresh
 * profile was found (refresh + open its detail), or the run settled
 * without one (surface the reason). The run id lets the TUI clear only
 * the matching dispatched-run keybind target. Absent in headless tests.
 */
export interface CreateFlowHooks {
  /** Fresh profile found after the author run settled. */
  readonly onProfileCreated?: ((profile: ProfileSummary, runId: string) => void) | undefined;
  /** Author run settled without creating a profile. */
  readonly onProfileFailed?: ((message: string, runId: string) => void) | undefined;
}

/**
 * Raw profile directory names under the store, regardless of decode
 * validity. Used to snapshot the store at dispatch and to distinguish
 * "nothing written" from "written but invalid" after a run settles.
 * @param root - workspace root (profile store owner)
 * @returns Effect resolving to directory names (empty when the store is missing)
 */
export const rawProfileIds = (root: string): Effect.Effect<ReadonlyArray<string>> =>
  Effect.promise((): Promise<ReadonlyArray<string>> =>
    readdir(join(root, ...PROFILES_DIR)).then(
      (names) => names.filter((name) => !name.startsWith('.')),
      () => [],
    ),
  );

/** Fresh profile directories decoded after a run settled: valid profiles plus ids that failed to decode. */
export interface FreshProfiles {
  readonly valid: ReadonlyArray<PiProfiles.Profile>;
  /** Directory ids with a missing or malformed `PROFILE.md`. */
  readonly invalid: ReadonlyArray<string>;
}

/** One decoded fresh directory: a profile, or undefined when it failed to decode. */
interface FreshEntry {
  readonly id: string;
  readonly profile: PiProfiles.Profile | undefined;
}

/**
 * Decode the fresh profile directories a settled run added, splitting
 * valid profiles from ids whose `PROFILE.md` is missing or malformed.
 * @param libs - loaded extension runtime
 * @param root - workspace root (profile store owner)
 * @param ids - fresh directory ids to read
 * @returns Effect resolving to the valid profiles and invalid ids
 */
export const readFreshProfiles = (
  libs: PiProfilesLib,
  root: string,
  ids: ReadonlyArray<string>,
): Effect.Effect<FreshProfiles> =>
  Effect.forEach(ids, (id): Effect.Effect<FreshEntry> =>
    Effect.promise(() =>
      readFile(join(root, ...PROFILES_DIR, id, 'PROFILE.md'), 'utf8').then(
        (raw) => raw,
        () => undefined,
      ),
    ).pipe(
      Effect.flatMap((raw): Effect.Effect<FreshEntry> =>
        raw === undefined
          ? Effect.succeed({ id, profile: undefined })
          : libs.PiProfiles.decodeProfileFile(id, raw).pipe(
              Effect.match({
                onFailure: (): FreshEntry => ({ id, profile: undefined }),
                onSuccess: (profile): FreshEntry => ({ id, profile }),
              }),
            ),
      ),
    ),
  ).pipe(
    Effect.map((entries) => ({
      valid: entries.flatMap((entry) => (entry.profile === undefined ? [] : [entry.profile])),
      invalid: entries.flatMap((entry) => (entry.profile === undefined ? [entry.id] : [])),
    })),
  );

/** One transcript line, shared by the engine detail and the dashboard row. */
interface TranscriptLine {
  readonly role: string;
  readonly text: string;
}

/**
 * Final assistant text from a settled run's transcript, or undefined when
 * the run produced no assistant turn.
 * @param events - stored transcript events
 * @returns last assistant text, if any
 */
export const finalAssistantText = (events: ReadonlyArray<TranscriptLine>): string | undefined =>
  events.findLast((event) => event.role === 'assistant')?.text;

/** How a settled author run's profile was resolved. */
export type CreatedProfilePick =
  | { readonly kind: 'one'; readonly profile: PiProfiles.Profile }
  | { readonly kind: 'ambiguous'; readonly names: ReadonlyArray<string> }
  | { readonly kind: 'none' };

/**
 * Resolve the profile a settled author run authored. Prefers the fresh
 * profile named in the run's final reply — correlating concurrent creates
 * to their own run — and falls back to the name diff only when exactly one
 * fresh profile exists (unambiguous).
 * @param reply - final assistant text from the run, if any
 * @param fresh - profiles added since the run was dispatched
 * @returns the chosen profile, an ambiguity, or none
 */
export const pickCreatedProfile = (
  reply: string | undefined,
  fresh: ReadonlyArray<PiProfiles.Profile>,
): CreatedProfilePick => {
  if (fresh.length === 0) return { kind: 'none' };
  const named = reply === undefined ? [] : fresh.filter((profile) => reply.includes(profile.name));
  if (named.length === 1) {
    const profile = named[0];
    if (profile !== undefined) return { kind: 'one', profile };
  }
  if (fresh.length === 1) {
    const profile = fresh[0];
    if (profile !== undefined) return { kind: 'one', profile };
  }
  return { kind: 'ambiguous', names: fresh.map((profile) => profile.name) };
};

/**
 * Completion hook for a dispatched author run: resolve the profile the run
 * authored (reply-correlated, name-diff fallback), persist it canonically
 * through the loaded runtime's decode+encode path, and notify the hooks.
 * Exported so a resumed author run can re-attach the same hook through
 * `Runs.resumeRun` after an app restart.
 * @param root - workspace root (profile store owner)
 * @param libs - loaded extension runtime
 * @param runId - the author run id
 * @param beforeIds - raw store directory ids snapshotted at dispatch, or undefined after a restart
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const authorCompletion =
  (
    root: string,
    libs: PiProfilesLib,
    runId: string,
    beforeIds: ReadonlyArray<string> | undefined,
    hooks?: CreateFlowHooks,
  ): ((detail: EngineRunDetail) => Effect.Effect<void>) =>
  (detail) =>
    Effect.gen(function* () {
      const afterIds = yield* rawProfileIds(root);
      const freshIds = afterIds.filter((id) => !(beforeIds ?? []).includes(id));
      const { valid, invalid } = yield* readFreshProfiles(libs, root, freshIds);
      const pick = pickCreatedProfile(finalAssistantText(detail.events), valid);
      if (pick.kind === 'one') {
        const row = fromProfile(pick.profile);
        const failure = yield* saveProfile(root, row).pipe(
          Effect.match({ onFailure: (error) => error.message, onSuccess: () => undefined }),
        );
        if (failure !== undefined) {
          hooks?.onProfileFailed?.(
            `Run '${runId}' created '${row.id}' but it could not be saved: ${failure}`,
            runId,
          );
          return;
        }
        hooks?.onProfileCreated?.(row, runId);
        return;
      }
      if (pick.kind === 'ambiguous') {
        hooks?.onProfileFailed?.(
          `Run '${runId}' created several profiles (${pick.names.join(', ')}) — open the one you want from the list.`,
          runId,
        );
        return;
      }
      if (invalid.length > 0) {
        hooks?.onProfileFailed?.(
          `Run '${runId}' wrote an invalid profile (${invalid.join(', ')}) — check its PROFILE.md and retry.`,
          runId,
        );
        return;
      }
      hooks?.onProfileFailed?.(
        `Run '${runId}' finished without creating a profile — try describing it differently.`,
        runId,
      );
    });

/** Result of a create flow: persisted manually, or dispatched as a run. */
export type CreateFlowResult =
  | { readonly kind: 'saved'; readonly profile: ProfileSummary }
  | { readonly kind: 'dispatched'; readonly runId: string };

/** Result of a modify flow: persisted manually, or dispatched as a run. */
export type ModifyFlowResult =
  | { readonly kind: 'saved'; readonly profile: ProfileSummary }
  | { readonly kind: 'dispatched'; readonly runId: string };

/** Run id dispatched by the most recent agentic create, consumed by {@link runCreateFlow}. */
let dispatchedRunId: string | undefined;

/** Run id dispatched by the most recent agentic modify, consumed by {@link runModifyFlow}. */
let dispatchedModifyRunId: string | undefined;

/** Test seam: forget the dispatched-run ref so a fresh create flow starts clean. */
export const resetDispatchedRun = (): void => {
  dispatchedRunId = undefined;
};

/** Test seam: forget the dispatched-modify-run ref so a fresh modify flow starts clean. */
export const resetDispatchedModifyRun = (): void => {
  dispatchedModifyRunId = undefined;
};

/**
 * Agentic generation port for the shared interactive flows: gate on the
 * runs extension, snapshot the profile store, dispatch an author run
 * through the pi-runs engine, then unwind the shared `createProfile`
 * flow with `CANCELLED` (the run, not this flow, writes the profile).
 * The run id lands in a module-level ref that {@link runCreateFlow}
 * reads to distinguish a dispatch from a real cancel. When the run
 * settles, {@link authorCompletion} correlates the fresh profile to this
 * run's final reply, so concurrent creates never cross wires.
 * @param root - workspace root (profile store owner)
 * @param libs - loaded extension runtime
 * @param hooks - TUI completion callbacks, if any
 * @returns generator port for the interactive flows
 */
export const generateFor =
  (
    root: string,
    libs: PiProfilesLib,
    hooks?: CreateFlowHooks,
  ): ProfilesInteractive.ProfileGenerator =>
  (input) =>
    Effect.gen(function* () {
      const installed = yield* Runs.runsExtensionInstalled(root);
      if (!installed) return yield* Effect.fail(Runs.RUNS_EXTENSION_INSTALL_HINT);
      const beforeIds = yield* rawProfileIds(root);
      const id = yield* Runs.newRunId('create-profile');
      const name = `Create profile: ${input.description.trim().slice(0, 80)}`;
      yield* Runs.startRun(root, {
        id,
        name,
        prompt: Skills.buildHeadlessPrompt(
          AUTHOR_PREPROMPT + libs.Interactive.formatInjectedSkills(input.inject),
          `Profile description: ${input.description}`,
          AUTHOR_POSTPROMPT,
        ),
        model: input.modelLabel,
        tools: [...Runs.DEFAULT_RUN_TOOLS],
        onSettled: authorCompletion(root, libs, id, beforeIds, hooks),
      });
      dispatchedRunId = id;
      return yield* Effect.fail(libs.Interactive.CANCELLED);
    });

/**
 * Agentic modification port for the shared interactive flows: gate on the
 * runs extension, snapshot the named profile's raw file, dispatch an
 * editor run through the pi-runs engine, then unwind the shared
 * `modifyProfile` flow with `CANCELLED` (the run, not this flow, writes
 * the profile). The run id lands in a module-level ref that
 * {@link runModifyFlow} reads to distinguish a dispatch from a real
 * cancel. When the run settles, {@link modifyCompletion} re-reads and
 * persists the named profile.
 * @param root - workspace root (profile store owner)
 * @param hooks - TUI completion callbacks, if any
 * @returns modifier port for the interactive flows
 */
export const modifyFor =
  (root: string, hooks?: ModifyFlowHooks): ProfilesInteractive.ProfileModifier =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        Effect.gen(function* () {
          const installed = yield* Runs.runsExtensionInstalled(root);
          if (!installed) return yield* Effect.fail(Runs.RUNS_EXTENSION_INSTALL_HINT);
          const beforeRaw = yield* readRawProfile(root, input.profile.name).pipe(
            Effect.match({ onFailure: () => undefined, onSuccess: (raw) => raw }),
          );
          const id = yield* Runs.newRunId('modify-profile');
          yield* Runs.startRun(root, {
            id,
            name: `Modify profile: ${input.profile.name}`,
            prompt: Skills.buildHeadlessPrompt(
              MODIFY_PREPROMPT +
                '\n\nProfile to edit: ' +
                input.profile.name +
                libs.Interactive.formatInjectedSkills(input.inject),
              `Change request: ${input.instruction}`,
              MODIFY_POSTPROMPT,
            ),
            model: input.modelLabel,
            tools: [...Runs.DEFAULT_RUN_TOOLS],
            onSettled: modifyCompletion(root, libs, id, input.profile.name, beforeRaw, hooks),
          });
          dispatchedModifyRunId = id;
          return yield* Effect.fail(libs.Interactive.CANCELLED);
        }),
      ),
    );

/**
 * Overlay ports the TUI injects into the flow runners: dialogs plus the
 * model picker and working overlay. All `Interactive` references are
 * type positions — the runtime stays behind the lazy loader.
 */
export interface FlowPorts {
  readonly ui: ProfilesInteractive.InteractiveUi;
  readonly modelPicker: ProfilesInteractive.ModelPickerFn;
  readonly loading: ProfilesInteractive.LoadingFn;
}

/**
 * Workspace host for the shared create flow: load the extension,
 * resolve picker models, run `createProfile` (manual or agentic behind
 * the overlays). Manual creates persist and resolve `saved`; agentic
 * creates dispatch a run and resolve `dispatched`; real cancels resolve
 * undefined. The TUI needs no `CANCELLED` knowledge — only real
 * failures reject.
 * @param root - workspace root (profile store owner)
 * @param ports - TUI overlay ports
 * @param hooks - completion callbacks for a dispatched author run
 * @returns Effect resolving to the create outcome, or undefined on cancel
 */
export const runCreateFlow = (
  root: string,
  ports: FlowPorts,
  hooks?: CreateFlowHooks,
): Effect.Effect<CreateFlowResult | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        dispatchedRunId = undefined;
        const profile = yield* libs.Interactive.createProfile(
          ports.ui,
          libs.Interactive.modelOptions(fallback, refs),
          generateFor(root, libs, hooks),
          skillInventoryFor(root),
          installerFor(root),
          undefined,
          ports.modelPicker,
          ports.loading,
        );
        const row = fromProfile(profile);
        yield* saveProfile(root, row).pipe(Effect.mapError((failure) => failure.message));
        return { kind: 'saved', profile: row } satisfies CreateFlowResult;
      }).pipe(
        Effect.catch((error) => {
          if (error !== libs.Interactive.CANCELLED) return Effect.fail(error);
          const runId = dispatchedRunId;
          dispatchedRunId = undefined;
          return Effect.succeed(
            runId === undefined
              ? undefined
              : ({ kind: 'dispatched', runId } satisfies CreateFlowResult),
          );
        }),
      ),
    ),
  );

/**
 * Workspace host for the shared modify flow for one profile: load the
 * extension, run `modifyProfile` (manual description edit or agentic
 * rewrite). Manual edits persist and resolve `saved`; agentic edits
 * dispatch an editor run and resolve `dispatched`; real cancels resolve
 * undefined. The TUI needs no `CANCELLED` knowledge — only real failures
 * reject.
 * @param root - workspace root (profile store owner)
 * @param id - profile name under edit
 * @param ports - TUI overlay ports
 * @param hooks - completion callbacks for a dispatched editor run
 * @returns Effect resolving to the modify outcome, or undefined on cancel
 */
export const runModifyFlow = (
  root: string,
  id: string,
  ports: FlowPorts,
  hooks?: ModifyFlowHooks,
): Effect.Effect<ModifyFlowResult | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const profiles = yield* storeFor(root).list();
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        dispatchedModifyRunId = undefined;
        const profile = yield* libs.Interactive.modifyProfile(
          ports.ui,
          profiles,
          id,
          libs.Interactive.modelOptions(fallback, refs),
          modifyFor(root, hooks),
          skillInventoryFor(root),
          installerFor(root),
          ports.modelPicker,
          ports.loading,
        );
        const row = fromProfile(profile);
        yield* saveProfile(root, row).pipe(Effect.mapError((failure) => failure.message));
        return { kind: 'saved', profile: row } satisfies ModifyFlowResult;
      }).pipe(
        Effect.catch((error) => {
          if (error !== libs.Interactive.CANCELLED) return Effect.fail(error);
          const runId = dispatchedModifyRunId;
          dispatchedModifyRunId = undefined;
          return Effect.succeed(
            runId === undefined
              ? undefined
              : ({ kind: 'dispatched', runId } satisfies ModifyFlowResult),
          );
        }),
      ),
    ),
  );
