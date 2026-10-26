import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Option, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import * as Git from '../../modules/git/index.js';
import * as Reference from '../../modules/reference/index.js';
import * as Verifier from '../../modules/verifier/index.js';
import { CloneProbe, ReferenceStore } from '../../services/index.js';
import * as DoctorApp from '../doctor/index.js';

/**
 * The operations `mf-references` offers, as plain Effect functions over the
 * reference store and the git lifecycle.
 *
 * Free of argv, of a UI, and of any notion of a "front end": the binary
 * (`binary.apps.module.ts`) and the `/mf-references` slash command
 * (`slash.apps.module.ts`) are thin adapters over this module, so the two
 * surfaces cannot drift. Every engine fails with a displayable string.
 */

/** Where a reference store lives: a workspace root, or an explicit `--dir`. */
export interface StoreScope {
  /** Project working directory. */
  readonly cwd: string;
  /** Explicit workspace root, resolved against `cwd` when set. */
  readonly dir?: string | undefined;
}

/** The workspace root one scope names. */
export const rootOf = (scope: StoreScope): string => scope.dir ?? scope.cwd;

/** Every service an engine may need. */
export type EngineDeps =
  | FileSystem.FileSystem
  | Path.Path
  | ReferenceStore.ReferenceStore
  | CloneProbe.CloneProbe
  | Git.GitPort
  | Git.GitLifecycle;

/** Default invocation named by actionable messages. */
export const DEFAULT_INVOCATION = Git.DEFAULT_INVOCATION;

/** Workspace-relative clone path, as reports print it. */
const relativeClone = (slug: string): string => `${Reference.CLONE_DIR}/${slug}`;

const isStoreError = (
  error: ReferenceStore.StoreError | PlatformError,
): error is ReferenceStore.StoreError => error instanceof ReferenceStore.StoreError;

const storeError = (error: ReferenceStore.StoreError | PlatformError): string =>
  isStoreError(error) ? `failed: ${error.reason}` : `failed: ${error.message}`;

const lifecycleError = (error: Git.LifecycleError): string =>
  isStoreError(error) ? `failed: ${error.reason}` : `failed: ${error.message}`;

const unknownReference = (name: string, invocation: string): string =>
  `refused: unknown reference '${name}'; run '${invocation} list'`;

/** B001's slug rule, enforced on every name a CLI or slash surface accepts. */
const invalidName = (name: string): string | undefined =>
  !Reference.isValidName(name) || name.length > 64
    ? `refused: invalid name '${name}': must match ^[a-z0-9]+(-[a-z0-9]+)*$`
    : undefined;

const storeRootMissing = (invocation: string): string =>
  `Store root ${Reference.STORE_DIR}/ is missing; run '${invocation} doctor'.`;

/** True when anything exists at one clone path, including a symlink. */
const installedAt = (fs: FileSystem.FileSystem, clone: string): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(clone).pipe(Effect.option);
    if (Option.isSome(link)) return true;
    const info = yield* fs.stat(clone).pipe(Effect.orElseSucceed(() => undefined));
    return info !== undefined;
  });

/** One `list` row. */
export interface ReferenceRow {
  readonly slug: string;
  readonly purpose: string;
  readonly url: string;
  readonly ref?: string | undefined;
  readonly installed: boolean;
  readonly entryPath: string;
  readonly path: string;
}

/** `list` options. Unknown `--status` values are refused. */
export interface ListOptions {
  readonly status?: string | undefined;
  readonly invocation?: string | undefined;
}

/**
 * Every store entry with its clone presence, slug-sorted.
 * @param scope - store scope
 * @param options - optional `installed`/`missing` filter
 * @returns one row per matching entry
 */
export const list = (
  scope: StoreScope,
  options: ListOptions = {},
): Effect.Effect<ReadonlyArray<ReferenceRow>, string, EngineDeps> =>
  Effect.gen(function* () {
    const invocation = options.invocation ?? DEFAULT_INVOCATION;
    const filter = options.status;
    if (filter !== undefined && filter !== 'installed' && filter !== 'missing') {
      return yield* Effect.fail(`refused: unknown status '${filter}'; use installed or missing`);
    }
    const store = yield* ReferenceStore.ReferenceStore;
    const fs = yield* FileSystem.FileSystem;
    const snapshot = yield* store.scan(rootOf(scope)).pipe(Effect.mapError(storeError));
    if (!snapshot.present) return yield* Effect.fail(storeRootMissing(invocation));

    const rows: Array<ReferenceRow> = [];
    for (const entry of snapshot.entries) {
      const document =
        entry.raw === undefined ? undefined : Reference.decodeReferenceFile(entry.raw);
      const installed = yield* installedAt(fs, Reference.clonePath(rootOf(scope), entry.slug));
      if (filter === 'installed' && !installed) continue;
      if (filter === 'missing' && installed) continue;
      const row: ReferenceRow = {
        slug: entry.slug,
        purpose: document?.reference.purpose ?? '(no REFERENCE.md)',
        url: document?.reference.url ?? '',
        installed,
        entryPath: Reference.entryPath(entry.slug),
        path: relativeClone(entry.slug),
      };
      rows.push(
        document?.reference.ref === undefined ? row : { ...row, ref: document.reference.ref },
      );
    }
    return rows;
  });

/**
 * One entry's raw `REFERENCE.md` bytes.
 * @param scope - store scope
 * @param name - entry slug
 * @param invocation - caller form used in fix-it text
 * @returns the file contents, byte for byte
 */
export const show = (
  scope: StoreScope,
  name: string,
  invocation: string = DEFAULT_INVOCATION,
): Effect.Effect<string, string, EngineDeps> =>
  Effect.gen(function* () {
    const bad = invalidName(name);
    if (bad !== undefined) return yield* Effect.fail(bad);
    const store = yield* ReferenceStore.ReferenceStore;
    const exists = yield* store.exists(rootOf(scope), name).pipe(Effect.mapError(storeError));
    if (!exists) return yield* Effect.fail(unknownReference(name, invocation));
    return yield* store
      .readRaw(rootOf(scope), name)
      .pipe(
        Effect.mapError(
          (error) => `failed: could not read ${Reference.entryPath(name)}: ${error.reason}`,
        ),
      );
  });

/** One verified file in a report. */
export interface VerifyEntryReport {
  readonly path: string;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Verifier.Issue>;
}

/** One `verify` run: files, counts, and whether the store root was absent. */
export interface VerifyReport {
  readonly entries: ReadonlyArray<VerifyEntryReport>;
  /** Committed packaged-skill findings, one block per shipped skill. */
  readonly skills: ReadonlyArray<VerifyEntryReport>;
  readonly issueCount: number;
  readonly warningCount: number;
  readonly storeMissing: boolean;
}

/** `verify` options; `--clones` is the only git-reading path. */
export interface VerifyOptions {
  readonly name?: string | undefined;
  readonly all?: boolean | undefined;
  readonly clones?: boolean | undefined;
  readonly invocation?: string | undefined;
  /** Packaged-skills directory override; the shipped `skills/` by default. */
  readonly skillsDir?: string | undefined;
}

/** A whole-store verification report, shaped like a single-entry one. */
export type VerifyAllReport = VerifyReport;

/**
 * CI-safe registry verification. Plain reads committed store bytes only; with
 * `--clones` it adds local clone truth through {@link CloneProbe}.
 * @param scope - store scope
 * @param options - name, `--all`, and `--clones`
 * @returns the report; `issueCount` counts error-severity findings
 */
export const verify = (
  scope: StoreScope,
  options: VerifyOptions = {},
): Effect.Effect<VerifyReport, string, EngineDeps> =>
  Effect.gen(function* () {
    const invocation = options.invocation ?? DEFAULT_INVOCATION;
    if (options.name !== undefined && options.all === true) {
      return yield* Effect.fail('usage: pass either <name> or --all, not both');
    }
    if (options.name !== undefined) {
      const bad = invalidName(options.name);
      if (bad !== undefined) return yield* Effect.fail(bad);
    }
    const store = yield* ReferenceStore.ReferenceStore;
    const root = rootOf(scope);
    const snapshot = yield* store.scan(root).pipe(Effect.mapError(storeError));

    let selected = snapshot;
    if (snapshot.present && options.name !== undefined) {
      const name = options.name;
      const entry = snapshot.entries.find((candidate) => candidate.slug === name);
      if (entry === undefined) return yield* Effect.fail(unknownReference(name, invocation));
      selected = { present: true, entries: [entry] };
    }

    const verified = Verifier.verifyStore(selected, { root, invocation });
    const issuesByPath = new Map<string, Array<Verifier.Issue>>(
      verified.entries.map((entry) => [entry.entry, [...entry.issues]]),
    );

    if (options.clones === true && selected.present) {
      const probe = yield* CloneProbe.CloneProbe;
      for (const source of selected.entries) {
        const document =
          source.raw === undefined ? undefined : Reference.decodeReferenceFile(source.raw);
        if (document === undefined) continue;
        const observation = yield* probe.probe(root, document.reference);
        const cloneResult = Verifier.verifyClone(observation, document.reference, {
          root,
          invocation,
        });
        issuesByPath.get(Reference.entryPath(source.slug))?.push(...cloneResult.issues);
      }
    }

    const entries: Array<VerifyEntryReport> = verified.entries.map((entry) => {
      const issues = issuesByPath.get(entry.entry) ?? [];
      return { path: entry.entry, valid: Verifier.noErrors(issues), issues };
    });
    const skills = yield* DoctorApp.verifyPackagedSkills(
      options.skillsDir === undefined ? {} : { skillsDir: options.skillsDir },
    );
    const allIssues = [...entries, ...skills].flatMap((entry) => entry.issues);
    return {
      entries,
      skills,
      issueCount: Verifier.errorCount(allIssues),
      warningCount: Verifier.warningCount(allIssues),
      storeMissing: !snapshot.present,
    };
  });

/**
 * Whole-store verification, the `--all` form of {@link verify}.
 * @param scope - store scope
 * @param options - `--clones` and invocation text
 * @returns the whole-store report
 */
export const verifyAll = (
  scope: StoreScope,
  options: Omit<VerifyOptions, 'name' | 'all'> = {},
): Effect.Effect<VerifyAllReport, string, EngineDeps> =>
  verify(scope, { ...options, all: true, name: undefined });

/** `add` options; the URL is the positional argument. */
export interface AddOptions {
  readonly name?: string | undefined;
  readonly ref?: string | undefined;
  readonly purpose?: string | undefined;
  readonly invocation?: string | undefined;
}

/**
 * Register and clone one https URL. A registered URL routes to `update`.
 * @param scope - store scope
 * @param url - the https URL argument
 * @param options - slug, ref, purpose, invocation
 * @returns the created or routed result, or a refusal
 */
export const add = (
  scope: StoreScope,
  url: string,
  options: AddOptions = {},
): Effect.Effect<Git.AddResult, string, EngineDeps> =>
  Effect.gen(function* () {
    const lifecycle = yield* Git.GitLifecycle;
    return yield* lifecycle
      .add(rootOf(scope), {
        url,
        name: options.name,
        ref: options.ref,
        purpose: options.purpose,
        invocation: options.invocation,
      })
      .pipe(Effect.mapError(lifecycleError));
  });

/** `update` options. */
export interface UpdateOptions {
  readonly force?: boolean | undefined;
  readonly invocation?: string | undefined;
}

/**
 * Refresh one entry addressed by name or URL.
 * @param scope - store scope
 * @param target - a slug or an https URL
 * @param options - `--force` and invocation text
 * @returns the update result, or a refusal
 */
export const update = (
  scope: StoreScope,
  target: string,
  options: UpdateOptions = {},
): Effect.Effect<Git.UpdateResult, string, EngineDeps> =>
  Effect.gen(function* () {
    const lifecycle = yield* Git.GitLifecycle;
    return yield* lifecycle
      .update(rootOf(scope), target, { force: options.force, invocation: options.invocation })
      .pipe(Effect.mapError(lifecycleError));
  });

/** One `update --all` row. */
export interface UpdateAllEntry {
  readonly slug: string;
  readonly result: Git.UpdateResult;
}

/** A whole `update --all` run. */
export interface UpdateAllReport {
  readonly entries: ReadonlyArray<UpdateAllEntry>;
  readonly summary: string;
  readonly failed: boolean;
}

/**
 * Refresh every entry in slug order, sequentially, continuing past failures.
 * @param scope - store scope
 * @param options - `--force` and invocation text
 * @returns every entry's result plus a summary line
 */
export const updateAll = (
  scope: StoreScope,
  options: UpdateOptions = {},
): Effect.Effect<UpdateAllReport, string, EngineDeps> =>
  Effect.gen(function* () {
    const store = yield* ReferenceStore.ReferenceStore;
    const lifecycle = yield* Git.GitLifecycle;
    const slugs = yield* store.list(rootOf(scope)).pipe(Effect.mapError(storeError));
    const entries: Array<UpdateAllEntry> = [];
    for (const slug of slugs) {
      const result = yield* lifecycle
        .update(rootOf(scope), slug, {
          force: options.force,
          invocation: options.invocation,
        })
        .pipe(Effect.mapError(lifecycleError));
      entries.push({ slug, result });
    }
    const present = entries.filter(
      (entry) =>
        entry.result.kind === 'created' ||
        entry.result.kind === 'present' ||
        entry.result.kind === 'updated',
    ).length;
    const failed = entries.length - present;
    return {
      entries,
      summary: `summary total=${entries.length} present=${present} failed=${failed}`,
      failed: failed > 0,
    };
  });

/** `sync` options; exactly one of `name` or `all` must be set. */
export interface SyncOptions {
  readonly name?: string | undefined;
  readonly all?: boolean | undefined;
  readonly invocation?: string | undefined;
}

/**
 * Materialize missing clones or repair local checkouts. Never writes the store.
 * @param scope - store scope
 * @param options - name xor all, plus invocation text
 * @returns one row per selected entry, or a usage/selection refusal
 */
export const sync = (
  scope: StoreScope,
  options: SyncOptions = {},
): Effect.Effect<Git.SyncResult, string, EngineDeps> =>
  Effect.gen(function* () {
    const lifecycle = yield* Git.GitLifecycle;
    return yield* lifecycle
      .sync(rootOf(scope), {
        name: options.name,
        all: options.all,
        invocation: options.invocation,
      })
      .pipe(Effect.mapError(lifecycleError));
  });

/** `status` options; no name means every entry. */
export interface StatusOptions {
  readonly name?: string | undefined;
  readonly fetch?: boolean | undefined;
  readonly invocation?: string | undefined;
}

/**
 * Report local clone state for one entry or every entry.
 * @param scope - store scope
 * @param options - optional name, `--fetch`, invocation text
 * @returns one row per selected entry plus the summary line
 */
export const status = (
  scope: StoreScope,
  options: StatusOptions = {},
): Effect.Effect<Git.StatusResult, string, EngineDeps> =>
  Effect.gen(function* () {
    const lifecycle = yield* Git.GitLifecycle;
    return yield* lifecycle
      .status(rootOf(scope), {
        name: options.name,
        fetch: options.fetch,
        invocation: options.invocation,
      })
      .pipe(Effect.mapError(lifecycleError));
  });

/** `remove` options. */
export interface RemoveOptions {
  readonly keepClone?: boolean | undefined;
  readonly invocation?: string | undefined;
}

/** One successful `remove` run. */
export interface RemoveResult {
  readonly kind: 'removed';
  readonly slug: string;
  readonly keptClone: boolean;
  readonly path: string;
  readonly message: string;
}

/**
 * Unregister one entry and, unless `--keep-clone`, a proven clean clone.
 * @param scope - store scope
 * @param name - entry slug
 * @param options - `--keep-clone` and invocation text
 * @returns the removal result
 */
export const remove = (
  scope: StoreScope,
  name: string,
  options: RemoveOptions = {},
): Effect.Effect<RemoveResult, string, EngineDeps> =>
  Effect.gen(function* () {
    const invocation = options.invocation ?? DEFAULT_INVOCATION;
    const bad = invalidName(name);
    if (bad !== undefined) return yield* Effect.fail(bad);
    const root = rootOf(scope);
    const store = yield* ReferenceStore.ReferenceStore;
    const probe = yield* CloneProbe.CloneProbe;
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* store.exists(root, name).pipe(Effect.mapError(storeError));
    if (!exists) return yield* Effect.fail(unknownReference(name, invocation));

    const reference = yield* store
      .readOne(root, name)
      .pipe(Effect.mapError((error) => `failed: ${error.reason}`));
    const clone = Reference.clonePath(root, name);
    const relative = relativeClone(name);
    const keepClone = options.keepClone === true;

    if (!keepClone) {
      const observation = yield* probe.probe(root, reference);
      if (observation.dirtyError !== undefined) {
        return yield* Effect.fail(`failed ${name} status: ${observation.dirtyError}`);
      }
      if (observation.present) {
        if (!observation.isDirectory || !observation.gitWorkTree || !observation.matchesOrigin) {
          return yield* Effect.fail(
            `refused: ${name} at ${relative} is not a clone of ${reference.url}; rerun with --keep-clone to unregister and keep it`,
          );
        }
        if (observation.dirtyPaths > 0) {
          return yield* Effect.fail(
            `refused: ${name} clone is dirty (${observation.dirtyPaths} changed paths); rerun with --keep-clone to unregister and keep it`,
          );
        }
        yield* fs
          .remove(clone, { recursive: true })
          .pipe(
            Effect.mapError((error) => `failed: could not remove ${relative}: ${error.message}`),
          );
      }
    }

    yield* store
      .remove(root, name)
      .pipe(
        Effect.mapError(
          (error) => `failed: could not remove ${Reference.entryPath(name)}: ${error.reason}`,
        ),
      );

    return {
      kind: 'removed',
      slug: name,
      keptClone: keepClone,
      path: relative,
      message: keepClone ? `removed ${name} clone=kept` : `removed ${name}`,
    };
  });

/**
 * Check the workspace scaffolding, registry, and packaged skills, repairing
 * unless `--check` is set. No clone is read, so zero-clone checkouts are fine.
 * @param root - workspace root
 * @param options - `--check` and the caller's invocation form
 * @returns one outcome per check plus the aggregate status
 */
export const doctor = (
  root: string,
  options: DoctorApp.DoctorOptions = {},
): Effect.Effect<DoctorApp.DoctorResult, string, EngineDeps> => DoctorApp.runDoctor(root, options);

/** File-backed services with their platform dependencies hidden. */
const NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.provide(ReferenceStore.Default, NodeLive);

const GitLive = Git.Default;

const ProbeLive = Layer.provide(CloneProbe.Default, Layer.mergeAll(GitLive, NodeLive));

const LifecycleLive = Layer.provide(
  Git.GitLifecycleDefault,
  Layer.mergeAll(GitLive, StoreLive, ProbeLive, NodeLive),
);

/** Every service the CLI's engines need, over the real filesystem and git. */
export const Live: Layer.Layer<EngineDeps> = Layer.mergeAll(
  NodeLive,
  StoreLive,
  GitLive,
  ProbeLive,
  LifecycleLive,
);
