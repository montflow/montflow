import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Roles from '../../modules/roles/index.js';

/**
 * The per-user roles file, `<root>/.agents/@montflow/mode/roles.json`.
 *
 * The store directory carries its own `.gitignore` (`*`), written with the
 * first save, so roles never reach a commit.
 */

export class StoreError extends Schema.TaggedError<StoreError>()('RolesStore.StoreError', {
  message: Schema.String,
}) {}

/** What is on disk: nothing yet, or the raw bytes. */
export type Raw = { readonly exists: false } | { readonly exists: true; readonly raw: string };

const ABSENT: Raw = { exists: false };
const present = (raw: string): Raw => ({ exists: true, raw });

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const dirOf = (root: string): string => path.join(root, ...Roles.STORE_DIR);

  /**
   * Path of the roles file under a workspace root.
   * @param root - workspace root
   */
  const fileOf = (root: string): string => path.join(dirOf(root), Roles.FILE);

  /**
   * The file's bytes, or that there is no file.
   * @param root - workspace root
   */
  const readRaw = Effect.fn('RolesStore.readRaw')(function* (root: string) {
    const file = fileOf(root);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return ABSENT;
    const raw = yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError(
          (cause) => new StoreError({ message: `Cannot read '${file}': ${cause.message}` }),
        ),
      );
    return present(raw);
  });

  /**
   * Write the file, creating the git-ignored store directory first.
   * @param root - workspace root
   * @param file - the verified roles file
   */
  const write = Effect.fn('RolesStore.write')(function* (root: string, file: Roles.RolesFile) {
    const dir = dirOf(root);
    const fail = (cause: { readonly message: string }) =>
      new StoreError({ message: `Cannot write '${dir}': ${cause.message}` });
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.mapError(fail));
    yield* fs.writeFileString(path.join(dir, '.gitignore'), '*\n').pipe(Effect.mapError(fail));
    yield* fs.writeFileString(fileOf(root), Roles.encode(file)).pipe(Effect.mapError(fail));
  });

  /**
   * Read a profile's instructions from the installed profile store.
   * @param root - workspace root
   * @param name - profile name
   */
  const readProfile = Effect.fn('RolesStore.readProfile')(function* (root: string, name: string) {
    const file = path.join(root, '.agents', '@montflow', 'profiles', name, 'PROFILE.md');
    return yield* fs.readFileString(file).pipe(
      Effect.mapError(
        () =>
          new StoreError({
            message: `No profile '${name}' at ${file}. Run \`mf-profiles doctor\` to install the shipped profiles.`,
          }),
      ),
    );
  });

  /**
   * Read a brief file.
   * @param file - path, absolute or relative to the working directory
   */
  const readBrief = Effect.fn('RolesStore.readBrief')(function* (file: string) {
    return yield* fs
      .readFileString(file)
      .pipe(Effect.mapError(() => new StoreError({ message: `Cannot read brief '${file}'.` })));
  });

  return { fileOf, readRaw, write, readProfile, readBrief } as const;
});

export const Id = '@montflow/RolesStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class RolesStore extends Context.Service<RolesStore, Impl>()(Id) {}

export const Default = Layer.effect(RolesStore, make);
