// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/@montflow/profiles; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for profile files; both go away with the FileSystem migration.
import { join } from 'node:path';
import type { Changes } from '@montflow/opencode';
import type { Interactive as ProfilesInteractive, Profiles } from '@montflow/profiles';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Data, Effect, Fiber, Layer, Stream } from 'effect';
import * as Skills from '../skills/index.js';

/**
 * Lazy handle to the profiles extension runtime. Static imports from
 * `@montflow/profiles` are type-only (erased at build) — the runtime
 * resolves here, on first flow use, never at dashboard boot. A broken
 * or missing extension therefore cannot crash the TUI; the failing
 * flow surfaces the load error as a toast instead.
 */
type ProfilesLib = typeof import('@montflow/profiles');

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
let cachedLib: Promise<ProfilesLib> | undefined;

/** The resolved extension runtime, once a flow has loaded it. Backs the synchronous picker matcher below. */
let liveLib: ProfilesLib | undefined;

/** Single import attempt: resolves the runtime, or rejects with a classified load error. */
const importOnce = (): Promise<ProfilesLib> => {
  cachedLib ??= import('@montflow/profiles').then(
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
export const loadProfiles = (): Effect.Effect<ProfilesLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => importOnce(),
    catch: (cause) => (cause instanceof ExtensionLoadError ? cause : classifyLoadError(cause)),
  });

/**
 * The loaded extension runtime, if any flow has loaded it yet.
 * @returns the extension module namespace, or undefined before first load
 */
export const loadedProfiles = (): ProfilesLib | undefined => liveLib;

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
const loadLibs = (): Effect.Effect<ProfilesLib, string> =>
  loadProfiles().pipe(Effect.mapError((error) => error.message));

/** One profile row for the dashboard list and detail views. Mirrors `Profiles.Profile` with an `id` alias (the slug). */
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
 * Bridge a `Profiles.Profile` into a dashboard row. Total — the
 * profile already carries every field.
 * @param profile - profiles Profile
 * @returns dashboard row
 */
export const fromProfile = (profile: Profiles.Profile): ProfileSummary => ({
  id: profile.name,
  name: profile.name,
  description: profile.description,
  model: profile.model,
  skills: [...profile.skills],
  instructions: profile.instructions,
  checklist: [...profile.checklist],
});

/**
 * Bridge a dashboard row back into a `Profiles.Profile` for the shared
 * interactive flows. Takes the lazily loaded runtime — no static extension
 * dependency.
 * @param libs - loaded extension runtime
 * @param row - dashboard profile row
 * @returns Effect resolving to the Profile, failing on invalid rows
 */
export const toProfile = (
  libs: ProfilesLib,
  row: ProfileSummary,
): Effect.Effect<Profiles.Profile, string> =>
  libs.Profiles.decodeUnknown({
    name: row.name,
    description: row.description,
    model: row.model,
    skills: [...row.skills],
    instructions: row.instructions,
    checklist: [...row.checklist],
  }).pipe(Effect.mapError(() => `Invalid profile '${row.id}'.`));

/** Directory segments (under the workspace root) owning the profile store. */
const PROFILES_DIR = ['.agents', '@montflow', 'profiles'] as const;

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. Mirrors `Profiles.SLUG_PATTERN` without loading the runtime. */
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
              libs.Profiles.encodeProfileFile(profile),
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
export type ProfileVerify = Profiles.VerifyResult;

/**
 * Verify one workspace profile: read its raw `PROFILE.md` and delegate
 * the mechanical check to the loaded extension runtime's
 * `Profiles.verifyProfileFile`. The check itself stays in
 * `@montflow/profiles` — this host only supplies the bytes. Fails on
 * unknown, unsafe, or unreadable ids.
 * @param root - workspace root (profile store owner)
 * @param id - profile directory name
 * @returns Effect resolving to the verify result, failing with a displayable message
 */
export const verifyProfile = (root: string, id: string): Effect.Effect<ProfileVerify, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      readRawProfile(root, id).pipe(Effect.map((raw) => libs.Profiles.verifyProfileFile(id, raw))),
    ),
  );

/** Node platform layers for building the extension's `ProfileStore` service. */
const ProfileStoreLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Bridge one extension profile change into a dashboard-row change. */
const toSummaryChange = (
  change: Changes.Change<Profiles.Profile>,
): Changes.Change<ProfileSummary> =>
  change.value === undefined
    ? { kind: change.kind, id: change.id }
    : { kind: change.kind, id: change.id, value: fromProfile(change.value) };

/**
 * Subscribe to the profile store's change stream and forward each change as a
 * dashboard row. Resolves to a canceller the caller uses on teardown; fails
 * only when the extension runtime cannot load. A missing store simply yields
 * no events, so this is safe to start before the store is installed.
 * @param root - workspace root (profile store owner)
 * @param onChange - receives each profile change
 * @returns Effect resolving to a subscription canceller
 */
export const watchProfileChanges = (
  root: string,
  onChange: (change: Changes.Change<ProfileSummary>) => void,
): Effect.Effect<() => void, string> =>
  Effect.gen(function* () {
    const libs = yield* loadLibs();
    const store = yield* libs.ProfileStore.ProfileStore.pipe(
      Effect.provide(Layer.provide(libs.ProfileStore.Default, ProfileStoreLive)),
    );
    const fiber = Stream.runForEach(store.watch(root), (change) =>
      Effect.sync(() => onChange(toSummaryChange(change))),
    ).pipe(Effect.runFork);
    return () => {
      Fiber.interrupt(fiber).pipe(Effect.runFork);
    };
  });

/** Cached profile-list shape the change bridge patches (mirrors `Query.ProfilesList`). */
export interface ProfilesSnapshot {
  readonly installed: boolean;
  readonly rows: ReadonlyArray<ProfileSummary>;
}

/**
 * Apply one profile change to a cached list snapshot: insert/replace on
 * created/updated, drop on removed, leave untouched when the change carries no
 * value (the caller then refetches). Sorts by name so the list order matches
 * `fetchProfiles`.
 * @param previous - cached snapshot, or undefined before first load
 * @param change - profile change to apply
 * @returns the patched snapshot
 */
export const applyProfileChange = (
  previous: ProfilesSnapshot | undefined,
  change: Changes.Change<ProfileSummary>,
): ProfilesSnapshot | undefined => {
  if (previous === undefined) return previous;
  if (change.kind === 'removed') {
    return { ...previous, rows: previous.rows.filter((row) => row.id !== change.id) };
  }
  if (change.value === undefined) return previous;
  const value = change.value;
  const rows = previous.rows.filter((row) => row.id !== change.id);
  return {
    ...previous,
    rows: [...rows, value].toSorted((a, b) => a.name.localeCompare(b.name)),
  };
};

/** Staged boot phase behind the profiles-panel Loader: extension import, then the profile-list read. */
export type ProfilesPhase = 'extension' | 'profiles';

/**
 * Profile rows for the TUI boot through the loaded profile module: load
 * the extension runtime, then list the store via file reads decoded with
 * `Profiles.decodeProfileFile` (sorted by name). Malformed files skip
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
                  : libs.Profiles.decodeProfileFile(entry, raw).pipe(
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
              const none: ReadonlyArray<Profiles.Profile> = [];
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
                    : libs.Profiles.decodeProfileFile(entry, raw).pipe(
                        Effect.orElseSucceed(() => undefined),
                      ),
                ),
              ),
            ).pipe(
              Effect.map((all) =>
                all.filter((profile): profile is Profiles.Profile => profile !== undefined),
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
                  libs.Profiles.encodeProfileFile(profile),
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
 * Skill inventory port for the requirements gate behind agentic sessions:
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
