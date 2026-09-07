import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as PiProfiles from '../../modules/pi-profiles/index.js';

/** Failure when a profile file cannot be read or written. */
export class StoreError extends Schema.TaggedError<StoreError>()('ProfileStore.StoreError', {
  message: Schema.String,
}) {}

const PROFILES_DIR = ['.agents', '@montflow', 'pi-profiles'] as const;
const PROFILE_FILE = 'PROFILE.md';
const TEMPLATE_FILE = 'TEMPLATE.md';

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

/** Profiles root for a working directory: `<cwd>/.agents/@montflow/pi-profiles`. */
const profilesRoot = (path: Path.Path, cwd: string): string => path.join(cwd, ...PROFILES_DIR);

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

  return { list, read, save, remove, readRaw } as const;
});

export const Id = '@montflow/ProfileStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class ProfileStore extends Context.Service<ProfileStore, Impl>()(Id) {}

export const Default = Layer.effect(ProfileStore, make);
