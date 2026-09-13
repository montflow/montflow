// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: reads .agents/@montflow/pi-profiles; migrate to FileSystem when the app moves onto the platform layer graph.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for profile files; both go away with the FileSystem migration.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: shells out to the pi CLI for the session probe; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the session probe shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import type { Interactive as ProfilesInteractive, PiProfiles } from '@montflow/pi-profiles';
import { Data, Effect } from 'effect';
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
const PROFILES_DIR = ['.agents', '@montflow', 'pi-profiles'] as const;

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
 * Seed the profiles store directory (`<root>/.agents/@montflow/pi-profiles/`).
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
 * `<root>/.agents/@montflow/pi-profiles/`. Refuses blank or traversing
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
 * Persist a profile row to `<root>/.agents/@montflow/pi-profiles/<id>/PROFILE.md`,
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
 * index, so the workspace host carries this copy for its headless
 * `pi -p` runs).
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
- Write the new profile at .agents/@montflow/pi-profiles/<name>/PROFILE.md (choose a
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
- Do not touch anything outside .agents/@montflow/pi-profiles/.`;

/** Instructions after the user description: the reply shape. Mirrors the extension's `AUTHOR_POSTPROMPT`. */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the profile name and what it does.';

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
- Edit only the named profile under .agents/@montflow/pi-profiles/.
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
 * Agentic profile generation for the workspace host: snapshot the store,
 * run the shared author prompt headless, return the fresh profile.
 * New profiles are detected by name diff so agent chatter never parses.
 * @param libs - loaded extension runtime
 * @param root - workspace root (profile store owner)
 * @param description - profile description from the TUI input
 * @param modelLabel - `provider/model-id` pin, if any
 * @param inject - requirement skills to inject into the author prompt
 * @returns Effect resolving to the generated Profile, failing with the reason
 */
export const generateAgentic = (
  libs: PiProfilesLib,
  root: string,
  description: string,
  modelLabel: string | undefined,
  inject: ReadonlyArray<ProfilesInteractive.InstalledSkill>,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const before = yield* storeFor(root).list();
    const beforeNames = new Set(before.map((profile) => profile.name));
    yield* Skills.runHeadlessAgent(
      root,
      Skills.buildHeadlessPrompt(
        AUTHOR_PREPROMPT + libs.Interactive.formatInjectedSkills(inject),
        `Profile description: ${description}`,
        AUTHOR_POSTPROMPT,
      ),
      modelLabel,
    ).pipe(Effect.mapError((error) => error.message));
    const after = yield* storeFor(root).list();
    const fresh = after.find((profile) => !beforeNames.has(profile.name));
    if (fresh === undefined)
      return yield* Effect.fail(
        'The agent finished without creating a profile — try describing it differently.',
      );
    return fresh;
  });

/**
 * Agentic profile modification for the workspace host: run the shared
 * editor prompt headless scoped to the profile name, re-read that profile.
 * @param libs - loaded extension runtime
 * @param root - workspace root (profile store owner)
 * @param profile - profile under edit
 * @param instruction - change request from the TUI input
 * @param modelLabel - `provider/model-id` pin, if any
 * @param inject - requirement skills to inject into the editor prompt
 * @returns Effect resolving to the updated Profile, failing with the reason
 */
export const modifyAgentic = (
  libs: PiProfilesLib,
  root: string,
  profile: PiProfiles.Profile,
  instruction: string,
  modelLabel: string | undefined,
  inject: ReadonlyArray<ProfilesInteractive.InstalledSkill>,
): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    yield* Skills.runHeadlessAgent(
      root,
      Skills.buildHeadlessPrompt(
        MODIFY_PREPROMPT +
          '\n\nProfile to edit: ' +
          profile.name +
          libs.Interactive.formatInjectedSkills(inject),
        `Change request: ${instruction}`,
        MODIFY_POSTPROMPT,
      ),
      modelLabel,
    ).pipe(Effect.mapError((error) => error.message));
    const after = yield* storeFor(root).list();
    const updated = after.find((candidate) => candidate.name === profile.name);
    if (updated === undefined)
      return yield* Effect.fail(
        'The agent finished without updating the profile — try describing the change differently.',
      );
    return updated;
  });

/**
 * Agentic generation port for the shared interactive flows: headless
 * `pi -p` over the shared author prompt.
 * @param root - workspace root (profile store owner)
 * @returns generator port for the interactive flows
 */
export const generateFor =
  (root: string): ProfilesInteractive.ProfileGenerator =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        generateAgentic(libs, root, input.description, input.modelLabel, input.inject),
      ),
    );

/**
 * Agentic modification port for the shared interactive flows: headless
 * `pi -p` over the shared editor prompt.
 * @param root - workspace root (profile store owner)
 * @returns modifier port for the interactive flows
 */
export const modifyFor =
  (root: string): ProfilesInteractive.ProfileModifier =>
  (input) =>
    loadLibs().pipe(
      Effect.flatMap((libs) =>
        modifyAgentic(libs, root, input.profile, input.instruction, input.modelLabel, input.inject),
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
 * the overlays), persist. Cancellations resolve undefined so the TUI
 * needs no `CANCELLED` knowledge — only real failures reject.
 * @param root - workspace root (profile store owner)
 * @param ports - TUI overlay ports
 * @returns Effect resolving to the saved row, or undefined on cancel
 */
export const runCreateFlow = (
  root: string,
  ports: FlowPorts,
): Effect.Effect<ProfileSummary | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        const profile = yield* libs.Interactive.createProfile(
          ports.ui,
          libs.Interactive.modelOptions(fallback, refs),
          generateFor(root),
          skillInventoryFor(root),
          installerFor(root),
          undefined,
          ports.modelPicker,
          ports.loading,
        );
        const row = fromProfile(profile);
        yield* saveProfile(root, row).pipe(Effect.mapError((failure) => failure.message));
        return row;
      }).pipe(
        Effect.catch((error) =>
          error === libs.Interactive.CANCELLED ? Effect.succeed(undefined) : Effect.fail(error),
        ),
      ),
    ),
  );

/**
 * Workspace host for the shared modify flow for one profile: load the
 * extension, run `modifyProfile` (manual description edit or agentic
 * rewrite), persist. Cancellations resolve undefined; the detail stays
 * open on the updated row.
 * @param root - workspace root (profile store owner)
 * @param id - profile name under edit
 * @param ports - TUI overlay ports
 * @returns Effect resolving to the saved row, or undefined on cancel
 */
export const runModifyFlow = (
  root: string,
  id: string,
  ports: FlowPorts,
): Effect.Effect<ProfileSummary | undefined, string> =>
  loadLibs().pipe(
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const profiles = yield* storeFor(root).list();
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        const profile = yield* libs.Interactive.modifyProfile(
          ports.ui,
          profiles,
          id,
          libs.Interactive.modelOptions(fallback, refs),
          modifyFor(root),
          skillInventoryFor(root),
          installerFor(root),
          ports.modelPicker,
          ports.loading,
        );
        const row = fromProfile(profile);
        yield* saveProfile(root, row).pipe(Effect.mapError((failure) => failure.message));
        return row;
      }).pipe(
        Effect.catch((error) =>
          error === libs.Interactive.CANCELLED ? Effect.succeed(undefined) : Effect.fail(error),
        ),
      ),
    ),
  );
