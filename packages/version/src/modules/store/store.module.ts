import { Effect, FileSystem, Option, Path, Schema } from 'effect';

/**
 * The sync manifest written by `mf-skills sync` and read by every command that
 * reports what a workspace actually received.
 *
 * The schema is versioned because an installed workspace outlives this
 * checkout: a reader must be able to tell an unknown manifest from a corrupt
 * one without guessing.
 */

/** Manifest file name inside `<workspace>/.agents/skills`. */
export const MANIFEST_FILE = '.montflow-sync.json';

/** Current manifest schema version. */
export const SCHEMA_VERSION = 1;

/** One skill as recorded at sync time. */
export interface ManifestSkill {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
  /** Per-file hashes, keyed by path relative to the skill directory. */
  readonly files?: Readonly<Record<string, string>> | undefined;
  /** True when the skill was installed once and has since left the source. */
  readonly removed?: boolean | undefined;
}

/** Where a store was synced from. */
export interface ManifestSource {
  readonly path: string;
  readonly remote?: string | undefined;
  readonly commit?: string | undefined;
  readonly ref?: string | undefined;
  readonly version?: string | undefined;
}

/** `.agents/skills/.montflow-sync.json`. */
export interface SyncManifest {
  readonly schemaVersion: number;
  readonly source: ManifestSource;
  /** ISO-8601 instant of the sync that wrote this manifest. */
  readonly syncedAt: string;
  readonly skills: ReadonlyArray<ManifestSkill>;
}

/** What a workspace store looks like from the outside. */
export type StoreState =
  | { readonly status: 'absent' }
  | { readonly status: 'unmanaged' }
  | { readonly status: 'managed'; readonly manifest: SyncManifest };

const ManifestSkillSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  sha256: Schema.String,
  files: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  removed: Schema.optional(Schema.Boolean),
});

const ManifestSourceSchema = Schema.Struct({
  path: Schema.String,
  remote: Schema.optional(Schema.String),
  commit: Schema.optional(Schema.String),
  ref: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
});

const SyncManifestSchema = Schema.Struct({
  schemaVersion: Schema.Number,
  source: ManifestSourceSchema,
  syncedAt: Schema.String,
  skills: Schema.Array(ManifestSkillSchema),
});

/** Decode a manifest document, or `undefined` when it does not match. */
export const decode = (text: string): SyncManifest | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    return Option.getOrUndefined(Schema.decodeUnknownOption(SyncManifestSchema)(parsed));
  } catch {
    return undefined;
  }
};

/** `<workspace>/.agents/skills`. */
export const dir = (path: Path.Path, root: string): string => path.join(root, '.agents', 'skills');

/** `<workspace>/.agents/skills/.montflow-sync.json`. */
export const file = (path: Path.Path, root: string): string =>
  path.join(dir(path, root), MANIFEST_FILE);

/**
 * Read what `root`'s skill store is: absent, present without a manifest
 * (`unmanaged`, the pre-manifest install), or managed with a decoded manifest.
 *
 * A corrupt manifest reads as `unmanaged`, not as a failure: the workspace is
 * still usable, and every caller's fallback is the byte comparison that
 * predates manifests.
 * @param root - workspace root owning `.agents/skills`
 * @returns the store state, never a failure
 */
export const read = (
  root: string,
): Effect.Effect<StoreState, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const store = dir(path, root);
    const exists = yield* fs.exists(store).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return { status: 'absent' } as const;
    const text = yield* fs
      .readFileString(file(path, root))
      .pipe(Effect.orElseSucceed(() => undefined));
    if (text === undefined) return { status: 'unmanaged' } as const;
    const manifest = decode(text);
    return manifest === undefined
      ? ({ status: 'unmanaged' } as const)
      : ({ status: 'managed', manifest } as const);
  });
