import { Changes } from '@montflow/pi-effect';
import { Context, Effect, FileSystem, Layer, Path, Schema, Stream } from 'effect';
import * as PiProfiles from '../../modules/pi-profiles/index.js';

/** Failure when a profile file cannot be read or written. */
export class StoreError extends Schema.TaggedError<StoreError>()('ProfileStore.StoreError', {
  message: Schema.String,
}) {}

const PROFILES_DIR = ['.agents', '@montflow', 'profiles'] as const;
const PROFILE_FILE = 'PROFILE.md';
const TEMPLATE_FILE = 'TEMPLATE.md';

/** Coalescing window for a burst of profile writes, in millis. */
const WATCH_DEBOUNCE_MILLIS = 100;

/** Canonical `PROFILE.md` skeleton seeded as `TEMPLATE.md` on first use. */
const TEMPLATE = `---
name: <profile-name>
description: <one-line description of the agent: its role and what it does>
# Preferred model: provider/model-id, e.g. anthropic/claude-sonnet-4-5 (optional)
model: <provider>/<model-id>
# Skills this profile must load (names from SKILL.md frontmatter)
skills:
  - <skill-name>
---

# <Profile Name>

## Instructions

<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>

## Review Checklist

- [ ] <What the reviewer must verify before the work is done>
- [ ] <What the reviewer must verify before the work is done>
`;

/** Profiles root for a working directory: `<cwd>/.agents/@montflow/profiles`. */
const profilesRoot = (path: Path.Path, cwd: string): string => path.join(cwd, ...PROFILES_DIR);

/**
 * The profile directory a watched path belongs to, or undefined when the path
 * is not a profile entry — the root itself, `TEMPLATE.md`, or something
 * outside the store. Accepts the relative paths Node's watcher reports and
 * absolute paths from other backends.
 * @param path - platform path service
 * @param root - profiles root directory
 * @param eventPath - path reported by the filesystem watcher
 * @returns the profile slug, or undefined to ignore the event
 */
export const nameOf = (path: Path.Path, root: string, eventPath: string): string | undefined => {
  const relative = path.isAbsolute(eventPath) ? path.relative(root, eventPath) : eventPath;
  if (relative === '' || relative.startsWith('..')) return undefined;
  const first = relative.split(/[\\/]/)[0] ?? '';
  return first !== '' && PiProfiles.isValidName(first) ? first : undefined;
};

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const ensureDir = Effect.fn('ProfileStore.ensureDir')(function* (cwd: string) {
    const root = profilesRoot(path, cwd);
    yield* fs.makeDirectory(root, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
    const templatePath = path.join(root, TEMPLATE_FILE);
    const hasTemplate = yield* fs.exists(templatePath).pipe(Effect.orElseSucceed(() => false));
    if (!hasTemplate) {
      yield* fs.writeFileString(templatePath, TEMPLATE).pipe(Effect.orElseSucceed(() => undefined));
    }
  });

  const list = Effect.fn('ProfileStore.list')(function* (cwd: string) {
    const root = profilesRoot(path, cwd);
    const entries = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => [] as const));
    const profiles = yield* Effect.forEach(entries, (entry) =>
      fs.readFileString(path.join(root, entry, PROFILE_FILE)).pipe(
        Effect.flatMap((raw) => PiProfiles.decodeProfileFile(entry, raw)),
        Effect.catch(() => Effect.succeed(undefined)),
      ),
    );
    return profiles
      .filter((profile): profile is PiProfiles.Profile => profile !== undefined)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  });

  const read = Effect.fn('ProfileStore.read')(function* (cwd: string, name: string) {
    if (!PiProfiles.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Invalid profile name '${name}'.` }));
    }
    const file = path.join(profilesRoot(path, cwd), name, PROFILE_FILE);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new StoreError({ message: `Profile not found: '${name}'.` }));
    }
    const raw = yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError(
          (error) => new StoreError({ message: `Failed to read ${file}: ${error.message}` }),
        ),
      );
    return yield* PiProfiles.decodeProfileFile(name, raw).pipe(
      Effect.mapError((message) => new StoreError({ message })),
    );
  });

  const save = Effect.fn('ProfileStore.save')(function* (cwd: string, profile: PiProfiles.Profile) {
    if (!PiProfiles.isValidName(profile.name)) {
      return yield* Effect.fail(
        new StoreError({ message: `Invalid profile name '${profile.name}'.` }),
      );
    }
    yield* ensureDir(cwd);
    const dir = path.join(profilesRoot(path, cwd), profile.name);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
    const file = path.join(dir, PROFILE_FILE);
    yield* fs
      .writeFileString(file, PiProfiles.encodeProfileFile(profile))
      .pipe(
        Effect.mapError(
          (error) => new StoreError({ message: `Failed to write ${file}: ${error.message}` }),
        ),
      );
  });

  const remove = Effect.fn('ProfileStore.remove')(function* (cwd: string, name: string) {
    if (!PiProfiles.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Unknown profile '${name}'.` }));
    }
    const dir = path.join(profilesRoot(path, cwd), name);
    const exists = yield* fs
      .exists(path.join(dir, PROFILE_FILE))
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new StoreError({ message: `Unknown profile '${name}'.` }));
    }
    yield* fs
      .remove(dir, { recursive: true })
      .pipe(
        Effect.mapError(
          (error) => new StoreError({ message: `Failed to delete '${name}': ${error.message}` }),
        ),
      );
  });

  const readRaw = Effect.fn('ProfileStore.readRaw')(function* (cwd: string, name: string) {
    if (!PiProfiles.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Unknown profile '${name}'.` }));
    }
    const file = path.join(profilesRoot(path, cwd), name, PROFILE_FILE);
    const raw = yield* fs
      .readFileString(file)
      .pipe(Effect.mapError(() => new StoreError({ message: `Unknown profile '${name}'.` })));
    return raw;
  });

  /**
   * Every profile file in the store as `{ name, raw }`, without decoding.
   * Unlike {@link list}, this never drops a file the store cannot decode, so a
   * caller (e.g. `verify --all`) can report a corrupt file instead of missing
   * it. Only the known non-profile `TEMPLATE.md` is excluded; an invalid-slug
   * directory is passed through so verification can flag it. An unreadable
   * file yields empty raw bytes, which verification rejects.
   * @param cwd - working directory
   * @returns every profile's name and raw contents, name-sorted
   */
  const readAllRaw = Effect.fn('ProfileStore.readAllRaw')(function* (cwd: string) {
    const root = profilesRoot(path, cwd);
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(
        new StoreError({ message: `Profiles store not found at '${root}'.` }),
      );
    }
    const entries = yield* fs
      .readDirectory(root)
      .pipe(
        Effect.mapError(
          (cause) => new StoreError({ message: `Cannot read '${root}': ${cause.message}` }),
        ),
      );
    const names = entries.filter((entry) => entry !== TEMPLATE_FILE).toSorted();
    return yield* Effect.forEach(names, (name) =>
      fs.readFileString(path.join(root, name, PROFILE_FILE)).pipe(
        Effect.map((raw) => ({ name, raw })),
        Effect.catch(() => Effect.succeed({ name, raw: '' })),
      ),
    );
  });

  /**
   * Read one filesystem event into a profile change. Non-profile paths are
   * dropped; a removed profile reports its id only; a created/updated one
   * carries the decoded profile when it reads back, or just the id when it
   * does not (the consumer then refetches).
   */
  const resolveChange =
    (cwd: string) =>
    (
      event: FileSystem.WatchEvent,
    ): Effect.Effect<ReadonlyArray<Changes.Change<PiProfiles.Profile>>> =>
      Effect.gen(function* () {
        const root = profilesRoot(path, cwd);
        const name = nameOf(path, root, event.path);
        if (name === undefined) return [];
        const kind = Changes.kindOf(event);
        if (kind === 'removed') return [{ kind, id: name }];
        const raw = yield* fs
          .readFileString(path.join(root, name, PROFILE_FILE))
          .pipe(Effect.orElseSucceed(() => undefined));
        if (raw === undefined) return [{ kind, id: name }];
        const value = yield* PiProfiles.decodeProfileFile(name, raw).pipe(
          Effect.orElseSucceed(() => undefined),
        );
        return [{ kind, id: name, value }];
      });

  /**
   * Watch the profiles directory for changes. Shared across hosts: the
   * workspace subscribes and patches its cache; the Pi extension may too.
   * A missing store yields an empty stream rather than failing.
   */
  const watch = (cwd: string): Stream.Stream<Changes.Change<PiProfiles.Profile>, never> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const root = profilesRoot(path, cwd);
        const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return Stream.empty;
        return Changes.changesFrom(
          fs.watch(root, { recursive: true }).pipe(Stream.ignore),
          resolveChange(cwd),
          WATCH_DEBOUNCE_MILLIS,
        );
      }),
    );

  return { list, read, save, remove, readRaw, readAllRaw, watch } as const;
});

export const Id = '@montflow/ProfileStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class ProfileStore extends Context.Service<ProfileStore, Impl>()(Id) {}

export const Default = Layer.effect(ProfileStore, make);
