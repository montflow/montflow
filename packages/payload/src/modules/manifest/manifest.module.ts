import { Result, Schema } from 'effect';

/**
 * One payload manifest per package, and the one reader every doctor uses.
 *
 * A manifest names each artifact the package ships by `kind`, `name`, `source`
 * (package-relative) and `target` (workspace-relative), so no package carries a
 * hardcoded `*_NAMES` array and no second path table can drift. The JSON module
 * is imported by the package's doctor, which is what makes the compiled binary
 * carry its manifest.
 */

/** Every artifact kind doctor knows how to install. */
export const PAYLOAD_KINDS = ['skill', 'profile', 'prompt', 'tier', 'rigor'] as const;

/** One artifact kind. Closed union: adding a kind is a code change. */
export type PayloadKind = (typeof PAYLOAD_KINDS)[number];

/** A tree is a directory of files; a file is one artifact. */
export type PayloadForm = 'tree' | 'file';

/** One shipped artifact. */
export interface PayloadEntry {
  /** Artifact kind. */
  readonly kind: PayloadKind;
  /** Directory name (tree) or file stem (file). */
  readonly name: string;
  /** Package-relative source path. */
  readonly source: string;
  /** Workspace-relative install path. */
  readonly target: string;
}

/** A package's complete payload set. */
export interface PayloadManifest {
  readonly schema: 1;
  readonly package: string;
  readonly payloads: ReadonlyArray<PayloadEntry>;
}

/** A manifest that passed validation, or why it did not. */
export type LoadedManifest =
  | { readonly ok: true; readonly manifest: PayloadManifest }
  | { readonly ok: false; readonly problem: string };

/** Form of each kind: trees carry required files, files are single artifacts. */
export const PAYLOAD_FORMS = {
  skill: 'tree',
  profile: 'tree',
  prompt: 'file',
  tier: 'file',
  rigor: 'file',
} satisfies Record<PayloadKind, PayloadForm>;

/** The file a tree kind must ship, or undefined for file kinds. */
export const REQUIRED_TREE_FILE = {
  skill: 'SKILL.md',
  profile: 'PROFILE.md',
  prompt: undefined,
  tier: undefined,
  rigor: undefined,
} satisfies Record<PayloadKind, string | undefined>;

/** The extension a file kind installs with, or undefined for tree kinds. */
export const FILE_EXTENSION = {
  skill: undefined,
  profile: undefined,
  prompt: '.json',
  tier: '.md',
  rigor: '.md',
} satisfies Record<PayloadKind, string | undefined>;

/** The workspace directory each kind installs under. */
export const INSTALL_ROOT = {
  skill: '.agents/skills',
  profile: '.agents/@montflow/profiles',
  prompt: '.agents/@montflow/prompts',
  tier: '.agents/@montflow/tiers',
  rigor: '.agents/@montflow/rigors',
} satisfies Record<PayloadKind, string>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The JSON shape a package manifest must decode as. */
const ManifestSchema = Schema.Struct({
  schema: Schema.Literal(1),
  package: Schema.String,
  payloads: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(PAYLOAD_KINDS),
      name: Schema.String,
      source: Schema.String,
      target: Schema.String,
    }),
  ),
});

/** A decoded but not yet path-validated manifest. */
type DecodedManifest = typeof ManifestSchema.Type;

/** A safe relative path: no absolute root, no traversal, no backslashes. */
export const isSafeRelativePath = (value: string): boolean => {
  if (value === '' || value.startsWith('/') || value.includes('\\')) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
};

/** The install path a kind and name must resolve to. */
export const expectedTarget = (kind: PayloadKind, name: string): string => {
  const root = INSTALL_ROOT[kind];
  const extension = FILE_EXTENSION[kind];
  return extension === undefined ? `${root}/${name}` : `${root}/${name}${extension}`;
};

/** Why one decoded entry is not a valid manifest entry, if it is not. */
const entryProblem = (
  entry: DecodedManifest['payloads'][number],
  index: number,
): string | undefined => {
  if (!SLUG_PATTERN.test(entry.name)) {
    return `payloads[${index}].name is not a slug`;
  }
  if (!isSafeRelativePath(entry.source)) {
    return `payloads[${index}].source is not a safe package-relative path`;
  }
  if (!isSafeRelativePath(entry.target)) {
    return `payloads[${index}].target is not a safe workspace-relative path`;
  }
  const expected = expectedTarget(entry.kind, entry.name);
  if (entry.target !== expected) {
    return `payloads[${index}].target must be '${expected}' for ${entry.kind} '${entry.name}'`;
  }
  const extension = FILE_EXTENSION[entry.kind];
  if (extension !== undefined) {
    const basename = entry.source.split('/').at(-1) ?? '';
    if (basename !== `${entry.name}${extension}`) {
      return `payloads[${index}].source must be named '${entry.name}${extension}' for ${entry.kind} '${entry.name}'`;
    }
  }
  return undefined;
};

/**
 * Validate the JSON module a package imported from its `payload.json`.
 *
 * Returns a discriminated union rather than throwing so a doctor can report a
 * broken package as `blocked` instead of crashing or, worse, reading an empty
 * manifest as "nothing to install".
 * @param raw - the imported JSON value
 * @param expectedPackage - the package name the manifest must declare
 * @returns the manifest, or the first validation problem
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- imported JSON is an external boundary decoded by Schema on the next statement.
export const loadManifest = (raw: unknown, expectedPackage: string): LoadedManifest => {
  const decoded = Result.try(() => Schema.decodeUnknownSync(ManifestSchema)(raw));
  if (Result.isFailure(decoded)) {
    return { ok: false, problem: `payload.json does not decode: ${String(decoded.failure)}` };
  }
  const manifest = decoded.success;
  if (manifest.package !== expectedPackage) {
    return {
      ok: false,
      problem: `payload.json declares package '${manifest.package}', expected '${expectedPackage}'`,
    };
  }
  if (manifest.payloads.length === 0) {
    return { ok: false, problem: 'payload.json must declare at least one payload' };
  }
  const entries: Array<PayloadEntry> = [];
  const seen = new Set<string>();
  for (const [index, entry] of manifest.payloads.entries()) {
    const problem = entryProblem(entry, index);
    if (problem !== undefined) return { ok: false, problem };
    const key = `${entry.kind}:${entry.name}`;
    if (seen.has(key)) return { ok: false, problem: `payload.json declares ${key} twice` };
    seen.add(key);
    entries.push({
      kind: entry.kind,
      name: entry.name,
      source: entry.source,
      target: entry.target,
    });
  }
  return { ok: true, manifest: { schema: 1, package: manifest.package, payloads: entries } };
};

/**
 * The names a manifest declares for one kind, in manifest order.
 * @param loaded - a validated or rejected manifest
 * @param kind - artifact kind
 * @returns installed names; empty when the manifest could not be loaded
 */
export const namesOf = (loaded: LoadedManifest, kind: PayloadKind): ReadonlyArray<string> =>
  loaded.ok
    ? loaded.manifest.payloads.filter((entry) => entry.kind === kind).map((entry) => entry.name)
    : [];

/**
 * One name by position, for packages whose CLI names a specific artifact.
 * A manifest that does not carry the entry is a build error, not a runtime one.
 * @param loaded - a validated or rejected manifest
 * @param kind - artifact kind
 * @param index - position in manifest order
 * @returns the name
 */
export const nameAt = (loaded: LoadedManifest, kind: PayloadKind, index: number): string => {
  const name = namesOf(loaded, kind)[index];
  if (name === undefined) {
    throw new Error(`payload.json does not declare ${kind} #${index}`);
  }
  return name;
};

/**
 * The manifest's entries for one kind.
 * @param loaded - a validated or rejected manifest
 * @param kind - artifact kind
 * @returns matching entries in manifest order
 */
export const entriesOf = (
  loaded: LoadedManifest,
  kind: PayloadKind,
): ReadonlyArray<PayloadEntry> =>
  loaded.ok ? loaded.manifest.payloads.filter((entry) => entry.kind === kind) : [];
