import { Crypto, Effect, FileSystem, Match, Option, Path, Schema } from 'effect';

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
  | { readonly status: 'corrupt' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'unsupported'; readonly schemaVersion: number }
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
  schemaVersion: Schema.Int,
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

/** Read just the schema version, so a future shape is not mistaken for corruption. */
const schemaVersionOf = (text: string): number | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    return Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.Struct({ schemaVersion: Schema.Int }))(parsed),
    )?.schemaVersion;
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
 * (`unmanaged`, the pre-manifest install), corrupt, written by a newer schema,
 * or managed with a decoded manifest.
 *
 * A corrupt or future manifest is reported as its own state, never folded into
 * `unmanaged`: the caller can keep the workspace usable (byte comparison) while
 * telling the reader why the manifest is not authoritative.
 * @param root - workspace root owning `.agents/skills`
 * @returns the store state, never a failure
 */
export const read = Effect.fn('Store.read')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = dir(path, root);
  const presence = yield* fs.stat(store).pipe(
    Effect.map(() => 'present' as const),
    Effect.catch((error) =>
      Effect.succeed(
        Match.value(error.reason).pipe(
          Match.when({ _tag: 'NotFound' }, () => 'absent' as const),
          Match.orElse(() => 'unreadable' as const),
        ),
      ),
    ),
  );
  if (presence === 'absent') return { status: 'absent' } as const;
  if (presence === 'unreadable') return { status: 'unreadable' } as const;
  const readResult = yield* fs.readFileString(file(path, root)).pipe(
    Effect.map((text) => ({ status: 'text', text }) as const),
    Effect.catch((error) =>
      Effect.succeed(
        Match.value(error.reason).pipe(
          Match.when({ _tag: 'NotFound' }, () => ({ status: 'absent' }) as const),
          Match.orElse(() => ({ status: 'unreadable' }) as const),
        ),
      ),
    ),
  );
  if (readResult.status === 'absent') return { status: 'unmanaged' } as const;
  if (readResult.status === 'unreadable') return { status: 'unreadable' } as const;

  const version = schemaVersionOf(readResult.text);
  if (version === undefined) return { status: 'corrupt' } as const;
  if (version !== SCHEMA_VERSION) {
    return { status: 'unsupported', schemaVersion: version } as const;
  }
  const manifest = decode(readResult.text);
  return manifest === undefined
    ? ({ status: 'corrupt' } as const)
    : ({ status: 'managed', manifest } as const);
});

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** SHA-256 of one byte array, as lowercase hex. */
export const digest = (bytes: Uint8Array): Effect.Effect<string, string, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const value = yield* crypto
      .digest('SHA-256', bytes)
      .pipe(Effect.mapError((cause) => `store: cannot hash skill bytes: ${String(cause)}`));
    return hex(value);
  });

/**
 * Hash one skill directory deterministically.
 *
 * Each file is hashed individually for D002's per-file report; the skill hash
 * is the SHA-256 of the sorted `path:digest` lines, so directory order,
 * timestamps, and filesystem metadata cannot change the result.
 * @param files - bytes keyed by path relative to the skill directory
 * @returns per-file digests and the combined skill digest
 */
export const hashSkill = (
  files: Readonly<Record<string, Uint8Array>>,
): Effect.Effect<
  { readonly sha256: string; readonly files: Record<string, string> },
  string,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    const names = Object.keys(files).toSorted();
    const hashes: Record<string, string> = {};
    for (const name of names) {
      const bytes = files[name];
      if (bytes === undefined) continue;
      hashes[name] = yield* digest(bytes);
    }
    const canonical = names.map((name) => `${name}:${hashes[name] ?? ''}`).join('\n');
    return { sha256: yield* digest(new TextEncoder().encode(canonical)), files: hashes };
  });

interface SerializedSkill {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
  files?: Record<string, string>;
  removed?: boolean;
}

/** Stable serialization: sorted skills and file keys, two-space JSON. */
export const serialize = (manifest: SyncManifest): string => {
  const skills = manifest.skills
    .map((skill) => {
      const entry: SerializedSkill = {
        name: skill.name,
        version: skill.version,
        sha256: skill.sha256,
      };
      if (skill.files !== undefined) {
        entry.files = Object.fromEntries(
          Object.entries(skill.files).toSorted(([a], [b]) => a.localeCompare(b)),
        );
      }
      if (skill.removed === true) entry.removed = true;
      return entry;
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return `${JSON.stringify(
    {
      schemaVersion: manifest.schemaVersion,
      source: {
        path: manifest.source.path,
        remote: manifest.source.remote,
        commit: manifest.source.commit,
        ref: manifest.source.ref,
        version: manifest.source.version,
      },
      syncedAt: manifest.syncedAt,
      skills,
    },
    null,
    2,
  )}\n`;
};

/** Same manifest apart from `syncedAt`, so an untouched sync writes nothing. */
export const same = (left: SyncManifest, right: SyncManifest): boolean =>
  serialize({ ...left, syncedAt: '' }) === serialize({ ...right, syncedAt: '' });

/** Write a manifest under `<workspace>/.agents/skills`. */
export const write = Effect.fn('Store.write')(function* (root: string, manifest: SyncManifest) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs
    .makeDirectory(dir(path, root), { recursive: true })
    .pipe(
      Effect.mapError((cause) => `store: cannot create '${dir(path, root)}': ${String(cause)}`),
    );
  yield* fs
    .writeFileString(file(path, root), serialize(manifest))
    .pipe(
      Effect.mapError((cause) => `store: cannot write '${file(path, root)}': ${String(cause)}`),
    );
});
