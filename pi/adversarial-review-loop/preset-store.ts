import { Data, Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import {
  ReviewPresetFromJson,
  type PresetLoopConfigDecoded,
  type ReviewPresetDecoded,
} from './preset-schema';

/** Error raised by preset store operations. */
export class PresetError extends Data.TaggedError('PresetError')<{
  readonly message: string;
}> {}

const PRESET_DIR = ['.agents', 'review-presets'];
const PRESET_EXT = '.json';

/**
 * Validates a preset name for use as a file name: starts with a letter or
 * digit, then letters/digits/dots/underscores/dashes only. Blocks path
 * traversal (`..`, `/`) and hidden files.
 * @param {string} name Candidate preset name
 * @returns True when the name is safe to use as a file name
 */
export const isValidPresetName = (name: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);

/** `path.join(cwd, '.agents', 'review-presets')`. */
const presetRoot = (path: Path, cwd: string): string => path.join(cwd, ...PRESET_DIR);

/** Absolute path to a preset file. */
const presetFilePath = (path: Path, cwd: string, name: string): string =>
  path.join(presetRoot(path, cwd), `${name}${PRESET_EXT}`);

const fail = (message: string): Effect.Effect<never, PresetError> =>
  Effect.fail(new PresetError({ message }));

/**
 * Ensures `.agents/review-presets/` exists.
 * @param {string} cwd Working directory
 * @returns An effect creating the directory
 */
export const ensurePresetDir = (
  cwd: string,
): Effect.Effect<void, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    yield* fileSystem
      .makeDirectory(presetRoot(path, cwd), { recursive: true })
      .pipe(Effect.orElseSucceed(() => undefined));
  });

/**
 * Lists stored preset names (the `*.json` file names, sorted). Non-JSON files
 * and names that fail {@link isValidPresetName} are ignored.
 * @param {string} cwd Working directory
 * @returns The sorted preset names
 */
export const listPresets = (
  cwd: string,
): Effect.Effect<readonly string[], never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const root = presetRoot(path, cwd);

    const exists = yield* fileSystem
      .exists(root)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return [];

    const entries = yield* fileSystem
      .readDirectory(root)
      .pipe(Effect.orElseSucceed((): readonly string[] => []));
    return entries
      .filter((entry) => entry.endsWith(PRESET_EXT))
      .map((entry) => entry.slice(0, -PRESET_EXT.length))
      .filter(isValidPresetName)
      .sort();
  });

/**
 * True when a preset with the given name exists. Invalid names count as
 * missing (never fail the caller).
 * @param {string} cwd Working directory
 * @param {string} name Preset name
 * @returns An effect resolving to the existence check
 */
export const presetExists = (
  cwd: string,
  name: string,
): Effect.Effect<boolean, never, FileSystem | Path> =>
  Effect.gen(function* () {
    if (!isValidPresetName(name)) return false;
    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    return yield* fileSystem
      .exists(presetFilePath(path, cwd, name))
      .pipe(Effect.orElseSucceed(() => false));
  });

/**
 * Reads and validates a preset file. The decoded preset's `config` is the
 * stored reference-based configuration — resolve it with `resolvePresetConfig`
 * (preset-resolve.ts) to expand reviewer references for a run.
 * @param {string} cwd Working directory
 * @param {string} name Preset name
 * @returns The decoded preset, or PresetError
 */
export const readPreset = (
  cwd: string,
  name: string,
): Effect.Effect<ReviewPresetDecoded, PresetError, FileSystem | Path> =>
  Effect.gen(function* () {
    if (!isValidPresetName(name)) return yield* fail(`Invalid preset name: ${name}`);
    yield* ensurePresetDir(cwd);

    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const target = presetFilePath(path, cwd, name);

    const exists = yield* fileSystem
      .exists(target)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return yield* fail(`Preset not found: ${name}`);

    const text = yield* fileSystem
      .readFileString(target, 'utf8')
      .pipe(
        Effect.mapError((error) =>
          new PresetError({ message: `Failed to read ${target}: ${error.message}` }),
        ),
      );

    const decoded = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(ReviewPresetFromJson)(text),
      catch: (error) =>
        new PresetError({
          message: `Invalid preset JSON in ${target}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
    });
    return decoded;
  });

/**
 * Writes a preset file (creating/overwriting `<name>.json`), encoding the
 * stored (reference-based) loop config through the preset schema.
 * @param {string} cwd Working directory
 * @param {string} name Preset name
 * @param {PresetLoopConfigDecoded} config Stored configuration to persist
 * @returns An effect writing the file, or PresetError
 */
export const writePreset = (
  cwd: string,
  name: string,
  config: PresetLoopConfigDecoded,
): Effect.Effect<void, PresetError, FileSystem | Path> =>
  Effect.gen(function* () {
    if (!isValidPresetName(name)) return yield* fail(`Invalid preset name: ${name}`);
    yield* ensurePresetDir(cwd);

    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const target = presetFilePath(path, cwd, name);
    const preset = { version: 1 as const, name, config };

    const json = yield* Effect.try({
      try: () => Schema.encodeUnknownSync(ReviewPresetFromJson)(preset),
      catch: (error) =>
        new PresetError({
          message: `Failed to encode preset '${name}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
    });

    yield* fileSystem.writeFileString(target, `${json}\n`).pipe(
      Effect.mapError((error) =>
        new PresetError({ message: `Failed to write ${target}: ${error.message}` }),
      ),
    );
  });

/**
 * Deletes a preset file.
 * @param {string} cwd Working directory
 * @param {string} name Preset name
 * @returns An effect removing the file, or PresetError
 */
export const deletePreset = (
  cwd: string,
  name: string,
): Effect.Effect<void, PresetError, FileSystem | Path> =>
  Effect.gen(function* () {
    if (!isValidPresetName(name)) return yield* fail(`Invalid preset name: ${name}`);

    const fileSystem = yield* FileSystem;
    const path = yield* Path;
    const target = presetFilePath(path, cwd, name);

    const exists = yield* fileSystem
      .exists(target)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return yield* fail(`Preset not found: ${name}`);

    yield* fileSystem.remove(target).pipe(
      Effect.mapError((error) =>
        new PresetError({ message: `Failed to delete ${target}: ${error.message}` }),
      ),
    );
  });
