import { Data, Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { readTemplateSync } from './paths.ts';

/** Error raised by profile store operations. */
export class ProfilesError extends Data.TaggedError('ProfilesError')<{
  readonly message: string;
}> {}

const PROFILES_DIR = ['.agents', 'profiles'];
const PROFILE_FILE = 'PROFILE.md';
const TEMPLATE_FILE = 'TEMPLATE.md';

/** Path service helpers: `path.join(cwd, '.agents', 'profiles')`. */
const profilesRoot = (path: Path, cwd: string): string => path.join(cwd, ...PROFILES_DIR);

/**
 * Ensures `.agents/profiles/` exists, and seeds `TEMPLATE.md` into it when
 * missing so the project carries a copy of the canonical structure.
 */
export const ensureProfilesDir = (cwd: string): Effect.Effect<void, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const root = profilesRoot(path, cwd);

    yield* fileSystem.makeDirectory(root, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));

    const templatePath = path.join(root, TEMPLATE_FILE);
    const hasTemplate = yield* fileSystem.exists(templatePath).pipe(Effect.orElseSucceed(() => false));
    if (!hasTemplate) {
      yield* fileSystem
        .writeFileString(templatePath, readTemplateSync())
        .pipe(Effect.orElseSucceed(() => undefined));
    }
  });

/** Lists profile names: directories under `.agents/profiles/` that contain PROFILE.md. */
export const listProfiles = (cwd: string): Effect.Effect<string[], never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const root = profilesRoot(path, cwd);

    const exists = yield* fileSystem.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return [];

    const entries = yield* fileSystem.readDirectory(root, { recursive: false }).pipe(
      Effect.orElseSucceed(() => []),
    );

    const names: string[] = [];
    for (const entry of entries) {
      const hasProfile = yield* fileSystem
        .exists(path.join(root, entry, PROFILE_FILE))
        .pipe(Effect.orElseSucceed(() => false));
      if (hasProfile) names.push(entry);
    }
    return names.sort();
  });

/** True when a profile directory with PROFILE.md exists. */
export const profileExists = (cwd: string, name: string): Effect.Effect<boolean, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    return yield* fileSystem
      .exists(path.join(profilesRoot(path, cwd), name, PROFILE_FILE))
      .pipe(Effect.orElseSucceed(() => false));
  });

/** Reads a profile's PROFILE.md. */
export const readProfileFile = (cwd: string, name: string): Effect.Effect<string, ProfilesError, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const target = path.join(profilesRoot(path, cwd), name, PROFILE_FILE);

    const exists = yield* fileSystem.exists(target).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new ProfilesError({ message: `Profile not found: ${name}` }));
    }
    return yield* fileSystem.readFileString(target, 'utf8').pipe(
      Effect.mapError((error) => new ProfilesError({ message: `Failed to read ${target}: ${error.message}` })),
    );
  });

/** Writes a profile's PROFILE.md, creating the directory as needed. */
export const writeProfileFile = (
  cwd: string,
  name: string,
  content: string,
): Effect.Effect<void, ProfilesError, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    yield* ensureProfilesDir(cwd);
    const dir = path.join(profilesRoot(path, cwd), name);

    yield* fileSystem.makeDirectory(dir, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
    yield* fileSystem.writeFileString(path.join(dir, PROFILE_FILE), content).pipe(
      Effect.mapError((error) => new ProfilesError({ message: `Failed to write ${path.join(dir, PROFILE_FILE)}: ${error.message}` })),
    );
  });

/** Deletes a profile directory (and the active marker when it points at it). */
export const deleteProfileDir = (cwd: string, name: string): Effect.Effect<void, ProfilesError, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const root = profilesRoot(path, cwd);

    const exists = yield* fileSystem
      .exists(path.join(root, name))
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new ProfilesError({ message: `Profile not found: ${name}` }));
    }

    yield* fileSystem.remove(path.join(root, name), { recursive: true }).pipe(
      Effect.mapError((error) => new ProfilesError({ message: `Failed to delete ${name}: ${error.message}` })),
    );
  });
