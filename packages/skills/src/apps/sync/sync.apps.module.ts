import { NodeServices } from '@effect/platform-node';
import { BuildInfo, Store } from '@montflow/version';
import { Clock, Effect, FileSystem, Path } from 'effect';
import { fieldString, parseSkillFile } from '../../modules/skill/index.js';

/**
 * `mf-skills sync` — copy this checkout's public skills into a workspace
 * `.agents/skills/` store.
 *
 * Structured options in, data out: the binary and the `/mf-skills sync` slash
 * command render the outcomes, this engine only decides them. Nothing here
 * reads argv, resolves the working directory, or writes to the console.
 *
 * Public means a `SKILL.md` frontmatter without `metadata.internal: true`.
 * Internal skills are reported as `skipped` and never copied.
 */

const NodeLive = NodeServices.layer;

/** The default way a caller reaches `sync` when it does not say. */
export const DEFAULT_SYNC_INVOCATION = '/mf-skills sync';

/**
 * Root of the montflow checkout this package runs from. The module lives at
 * `<checkout>/packages/skills/src/apps/sync`, so the checkout is five levels
 * up.
 * @param path - path service
 * @returns absolute checkout root
 */
export const checkoutRoot = (path: Path.Path): string =>
  path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');

/**
 * Skills store under a checkout or workspace root:
 * `<root>/.agents/skills`.
 * @param path - path service
 * @param root - checkout or workspace root
 * @returns absolute store directory
 */
export const skillsStoreDir = (path: Path.Path, root: string): string =>
  path.join(root, '.agents', 'skills');

/** A flag value that is set, or undefined when it is absent or empty. */
const given = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

/**
 * Resolve the source checkout when the caller gave no `--source`.
 *
 * The package-relative checkout wins because a source checkout must read its
 * own skills. A compiled binary has no source directory, so the caller's
 * working directory is accepted as a fallback — but only when it looks like a
 * montflow checkout, never merely because it has a `.agents/skills` store.
 * @param options - package-relative checkout and the caller's cwd, if any
 * @returns the checkout root to read from, or a displayable refusal
 */
export const resolveDefaultSource = (options: {
  readonly packageCheckout: string;
  readonly cwd?: string | undefined;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const exists = (candidate: string) =>
      fs.exists(candidate).pipe(Effect.orElseSucceed(() => false));
    const hasStore = (root: string) => exists(skillsStoreDir(path, root));

    if (yield* hasStore(options.packageCheckout)) return options.packageCheckout;

    const cwd = given(options.cwd);
    if (cwd !== undefined) {
      const caller = path.resolve(cwd);
      const looksLikeCheckout =
        (yield* hasStore(caller)) &&
        (yield* exists(path.join(caller, 'packages', 'skills', 'package.json')));
      if (looksLikeCheckout) return caller;
    }

    const attempted =
      cwd === undefined
        ? `'${options.packageCheckout}'`
        : `'${options.packageCheckout}' and '${path.resolve(cwd)}'`;
    return yield* Effect.fail(
      `sync: cannot find a montflow checkout to read skills from — tried ${attempted} and found no skills store; pass '--source <checkout>' naming a montflow checkout`,
    );
  }).pipe(Effect.provide(NodeLive));

/** Fate of one skill in a sync run. */
export type SyncOutcome = 'added' | 'updated' | 'unchanged' | 'skipped' | 'refused';

/** Drift between one skill on disk, its manifest entry, and the source. */
export type SkillDrift = 'current' | 'stale' | 'diverged' | 'unmanaged';

/** Fate of one file inside a synced skill. */
export type SyncFileOutcome = 'added' | 'updated' | 'unchanged';

/** One file's fate, for a `--verbose` renderer. Path is relative to the skill. */
export interface SyncFileStatus {
  readonly file: string;
  readonly outcome: SyncFileOutcome;
}

/** One skill's outcome plus the paths it came from and went to. */
export interface SyncSkillStatus {
  readonly name: string;
  readonly outcome: SyncOutcome;
  /** The skill's directory in the source checkout. */
  readonly source: string;
  /** The skill's directory in the workspace store. */
  readonly target: string;
  /** Why a skill was skipped; absent for every outcome but `skipped`. */
  readonly reason?: string | undefined;
  /** One entry per source file; empty for an internal (`skipped`) skill. */
  readonly files: ReadonlyArray<SyncFileStatus>;
  /** Drift against the previous manifest; `unmanaged` when the store has none. */
  readonly drift?: SkillDrift | undefined;
  /** Commit the skill was installed from, for a diverged report. */
  readonly manifestCommit?: string | undefined;
  /** Files whose bytes differ from the manifest, for a diverged skill. */
  readonly differingFiles?: ReadonlyArray<string> | undefined;
}

/** Outcome of a sync run across every skill in the source store. */
export interface SyncResult {
  /** Source checkout root: the `--source` value. */
  readonly sourceRoot: string;
  /** Target workspace root: the `--target` value. */
  readonly targetRoot: string;
  /** Source store: `<sourceRoot>/.agents/skills`. */
  readonly source: string;
  /** Target store: `<targetRoot>/.agents/skills`. */
  readonly target: string;
  /** True when the run only reported and wrote nothing. */
  readonly check: boolean;
  /** How the caller reaches `sync`, so refusals name a typeable command. */
  readonly invocation: string;
  readonly skills: ReadonlyArray<SyncSkillStatus>;
  /** Names that were added or updated; empty when the target is current. */
  readonly changed: ReadonlyArray<string>;
  /** Names refused because they diverged and `--force` was not given. */
  readonly refused: ReadonlyArray<string>;
  /** True when the target is behind the source or locally diverged. */
  readonly drifted: boolean;
}

/** How to run: where to read, where to write, and whether to write. */
export interface SyncOptions {
  /**
   * Checkout to copy from (`--source`; `--from` is an alias). Defaults to the
   * checkout this package runs from.
   */
  readonly from?: string | undefined;
  /**
   * Workspace root owning `.agents/skills` (`--target`; `--dir` is an alias).
   * Defaults to the working directory; the caller passes `--target` or
   * `process.cwd()` in.
   */
  readonly dir?: string | undefined;
  /** Report only — compute the same outcomes, write nothing. */
  readonly check?: boolean;
  /** Overwrite a skill whose target bytes diverged from its manifest. */
  readonly force?: boolean;
  /**
   * Caller's working directory. Used only as a last-resort source checkout
   * when the package-relative one is not a checkout; the engine never reads
   * `process.cwd()` itself.
   */
  readonly cwd?: string | undefined;
  /**
   * How the caller reaches `sync`, used in refusals so the fix is typeable.
   * The binary passes `mf-skills sync`; the slash command keeps the default.
   */
  readonly invocation?: string | undefined;
}

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Frontmatter lines between the opening and closing `---`, or undefined. */
const frontmatterLines = (markdown: string): ReadonlyArray<string> | undefined => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return end === -1 ? undefined : lines.slice(1, end);
};

/** Normalise a YAML scalar: strip one layer of quotes and surrounding space. */
const scalar = (value: string): string =>
  value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .toLowerCase();

/** True when a scalar reads as YAML `true` regardless of spelling. */
const isTrue = (value: string): boolean => scalar(value) === 'true';

/** Indentation width of a frontmatter line. */
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** The `internal` value in a YAML flow mapping body, if present. */
const flowInternal = (body: string): string | undefined => {
  for (const part of body.replace(/^\{|\}$/g, '').split(',')) {
    const match = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(part);
    if (match !== null && (match[1] ?? '').toLowerCase() === 'internal') return match[2] ?? '';
  }
  return undefined;
};

/**
 * True when a `SKILL.md` frontmatter carries `metadata.internal: true`.
 *
 * The nested `metadata` mapping is read directly: `Skill.parseSkillFile`
 * flattens indented keys, so a sibling top-level `internal` must not be
 * mistaken for the nested flag. Block mappings, flow mappings, and quoted or
 * whitespace-padded scalars all count.
 * @param markdown - raw SKILL.md contents
 * @returns true when the skill is internal
 */
export const isInternalSkill = (markdown: string): boolean => {
  const lines = frontmatterLines(markdown);
  if (lines === undefined) return false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const topLevel = /^([\w-]+):(.*)$/.exec(line);
    if (topLevel === null || (topLevel[1] ?? '').toLowerCase() !== 'metadata') continue;

    const value = (topLevel[2] ?? '').trim();
    if (value.startsWith('{')) {
      const internal = flowInternal(value);
      if (internal !== undefined && isTrue(internal)) return true;
      continue;
    }
    if (value !== '') continue;

    // Block mapping: only the first child indentation is `metadata`'s own
    // level, so a deeper `internal` belongs to some nested mapping.
    let childIndent: number | undefined;
    for (let child = index + 1; child < lines.length; child++) {
      const nestedLine = lines[child] ?? '';
      const trimmed = nestedLine.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (indentOf(nestedLine) === 0) break;
      childIndent ??= indentOf(nestedLine);
      if (indentOf(nestedLine) !== childIndent) continue;
      const nested = /^([\w-]+):(.*)$/.exec(trimmed);
      if (nested !== null && (nested[1] ?? '').toLowerCase() === 'internal') {
        if (isTrue(nested[2] ?? '')) return true;
      }
    }
  }
  return false;
};

/** True when two byte arrays hold the same bytes. */
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index++) {
    if (a[index] !== b[index]) return false;
  }
  return true;
};

/** A file's bytes, or undefined when it cannot be read. */
const readIfPresent = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<Uint8Array | undefined> =>
  fs.readFile(file).pipe(Effect.orElseSucceed(() => undefined));

/** A file's text, or undefined when it cannot be read. */
const readTextIfPresent = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<string | undefined> =>
  fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));

/** Sorted relative entries of one kind under `dir`, recursing when asked. */
const entriesUnder = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  options: { readonly type: 'File' | 'Directory'; readonly recursive?: boolean },
): Effect.Effect<ReadonlyArray<string>, string> =>
  fs.readDirectory(dir, options.recursive === true ? { recursive: true } : undefined).pipe(
    Effect.mapError((cause) => `sync: cannot read '${dir}': ${reasonOf(cause)}`),
    Effect.flatMap((entries) =>
      Effect.forEach(entries, (entry) =>
        fs.stat(path.join(dir, entry)).pipe(
          Effect.map((info) => (info.type === options.type ? entry : undefined)),
          Effect.orElseSucceed(() => undefined),
        ),
      ),
    ),
    Effect.map((entries) =>
      entries.filter((entry): entry is string => entry !== undefined).toSorted(),
    ),
  );

/** Sorted directory names directly under `dir`, or a displayable refusal. */
const directoryNames = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<ReadonlyArray<string>, string> =>
  entriesUnder(fs, path, dir, { type: 'Directory' });

/** Sorted relative paths of every file under `dir`, recursively. */
const filesUnder = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<ReadonlyArray<string>, string> =>
  entriesUnder(fs, path, dir, { type: 'File', recursive: true });

/**
 * A path's canonical location, or a marker for absent and dangling paths.
 * `realPath` both follows symlinks and detects a broken one, and `readLink`
 * separates a dangling link from a path that simply does not exist.
 */
type ResolvedPath =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present'; readonly real: string }
  | { readonly kind: 'dangling' };

const resolvePathIfPresent = (
  fs: FileSystem.FileSystem,
  candidate: string,
): Effect.Effect<ResolvedPath> =>
  fs.realPath(candidate).pipe(
    Effect.matchEffect({
      onSuccess: (real): Effect.Effect<ResolvedPath> => Effect.succeed({ kind: 'present', real }),
      onFailure: () =>
        fs.readLink(candidate).pipe(
          Effect.map((): ResolvedPath => ({ kind: 'dangling' })),
          Effect.orElseSucceed((): ResolvedPath => ({ kind: 'absent' })),
        ),
    }),
  );

/** True when `real` is the store itself or a descendant of it. */
const within = (path: Path.Path, storeRoot: string, real: string): boolean =>
  real === storeRoot || real.startsWith(`${storeRoot}${path.sep}`);

/** A target store: the path the caller named and its canonical location. */
interface StoreRoot {
  /** Unresolved `<root>/.agents/skills`; the containment walk stops here. */
  readonly path: string;
  /** Canonical store directory every target must live under. */
  readonly real: string;
}

/**
 * The canonical store root: a symlinked store is allowed, and its real path
 * becomes the containment root for every target beneath it.
 */
const storeRootOf = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<StoreRoot, string> =>
  Effect.gen(function* () {
    const resolved = yield* resolvePathIfPresent(fs, target);
    if (resolved.kind === 'present') return { path: path.resolve(target), real: resolved.real };
    if (resolved.kind === 'dangling') {
      return yield* Effect.fail(
        `sync: target store '${target}' is a symbolic link that does not resolve`,
      );
    }
    return { path: path.resolve(target), real: path.resolve(target) };
  });

/**
 * Refuse any target path that leaves the store through the path itself or
 * through an existing ancestor.
 *
 * Walking up to the nearest existing ancestor is what a symlinked
 * subdirectory needs: a destination file that does not exist yet has no
 * `realPath` of its own, but the link that would create it does. The walk
 * stops at the store path, so a store that does not exist yet is ours to
 * create.
 */
const assertInsideStore = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  candidate: string,
  store: StoreRoot,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const floor = store.path;
    let current = path.resolve(candidate);
    while (true) {
      const resolved = yield* resolvePathIfPresent(fs, current);
      if (resolved.kind === 'dangling') {
        return yield* Effect.fail(
          `sync: refusing to write '${candidate}' — '${current}' is a symbolic link that does not resolve (target store '${store.real}')`,
        );
      }
      if (resolved.kind === 'present') {
        if (within(path, store.real, resolved.real)) return;
        return yield* Effect.fail(
          `sync: refusing to write '${candidate}' — '${current}' resolves to '${resolved.real}', outside the target store '${store.real}'`,
        );
      }
      // The store itself is absent: every component down to it is ours.
      if (current === floor) return;
      const parent = path.dirname(current);
      if (parent === current) return;
      current = parent;
    }
  });

/** Distinguishes sibling paths created by one process. */
let tempCounter = 0;

/**
 * A fresh sibling path beside `to`, so a rename never crosses a filesystem.
 * @param path - path service
 * @param to - destination path
 * @param stamp - run timestamp
 * @param suffix - `tmp` for staged bytes, `bak` for a copy of a destination
 * @returns a sibling path unique to this process
 */
const siblingPath = (path: Path.Path, to: string, stamp: number, suffix: 'tmp' | 'bak'): string => {
  tempCounter += 1;
  return path.join(
    path.dirname(to),
    `.${path.basename(to)}.${process.pid}.${stamp}.${tempCounter}.${suffix}`,
  );
};

/** A fresh temp path beside `to`, holding the bytes about to be published. */
const siblingTemp = (path: Path.Path, to: string, stamp: number): string =>
  siblingPath(path, to, stamp, 'tmp');

/** A fresh backup path beside `to`, holding a copy of the bytes it replaces. */
const siblingBackup = (path: Path.Path, to: string, stamp: number): string =>
  siblingPath(path, to, stamp, 'bak');

/** One destination copied aside so it can be restored if a later rename fails. */
interface Backup {
  readonly to: string;
  readonly path: string;
}

/** Remove one path, ignoring a path that is already gone or still non-empty. */
const discard = (fs: FileSystem.FileSystem, target: string): Effect.Effect<void> =>
  fs.remove(target, { force: true }).pipe(Effect.ignore);

/**
 * Remove a directory this run created, including anything left inside it.
 *
 * `remove` without `recursive` refuses a directory outright (`EISDIR`), so a
 * cleanup that only removed files would leave every created level behind.
 */
const discardTree = (fs: FileSystem.FileSystem, target: string): Effect.Effect<void> =>
  fs.remove(target, { recursive: true, force: true }).pipe(Effect.ignore);

/**
 * Remove every path, one failure at a time.
 *
 * Each removal is ignored on its own, so one path that is already gone or
 * still non-empty cannot abort the rest of the cleanup.
 */
const discardEach = (
  fs: FileSystem.FileSystem,
  paths: ReadonlyArray<string>,
  remove: (fs: FileSystem.FileSystem, target: string) => Effect.Effect<void> = discard,
): Effect.Effect<void> =>
  Effect.forEach(paths, (target) => remove(fs, target), { discard: true, concurrency: 1 });

/** Path depth by separator, used to remove children before their parents. */
const depthOf = (candidate: string): number => candidate.split(/[\\/]/u).length;

/**
 * Directories ordered child-first.
 *
 * `ensureDirectory` records each call's levels deepest-first, but calls happen
 * in source order: a skill's `alpha` may be created before its `alpha/docs`.
 * Sorting by depth keeps a parent from being attempted while a child remains.
 */
const deepestFirst = (directories: ReadonlyArray<string>): ReadonlyArray<string> =>
  directories.toSorted((a, b) => depthOf(b) - depthOf(a));

/**
 * Create `directory` if needed, recording the levels this call added
 * deepest-first.
 *
 * A failed skill must not even leave empty directories behind, so the caller
 * can remove exactly what it created. Removal stays child-first: the caller
 * orders the accumulated list by depth, because later calls can add a child of
 * a directory an earlier call created.
 */
const ensureDirectory = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  directory: string,
  created: Array<string>,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const missing: Array<string> = [];
    let current = directory;
    while (true) {
      const exists = yield* fs.exists(current).pipe(Effect.orElseSucceed(() => true));
      if (exists) break;
      missing.push(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    yield* fs
      .makeDirectory(directory, { recursive: true })
      .pipe(Effect.mapError((cause) => `sync: cannot create '${directory}': ${reasonOf(cause)}`));
    created.push(...missing);
  });

/**
 * Write `bytes` to a fresh sibling temp beside `to`.
 *
 * Staging only: the caller renames once every file of the skill is staged, so
 * a failure part way through a skill leaves the target byte-identical.
 */
const stageFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  to: string,
  bytes: Uint8Array,
  stamp: number,
  created: Array<string>,
): Effect.Effect<StagedFile, string> =>
  Effect.gen(function* () {
    const directory = path.dirname(to);
    yield* ensureDirectory(fs, path, directory, created);
    const temp = siblingTemp(path, to, stamp);
    yield* fs
      .writeFile(temp, bytes)
      .pipe(Effect.mapError((cause) => `sync: cannot write '${to}': ${reasonOf(cause)}`));
    return { to, temp };
  });

/** One staged file: bytes in `temp`, destined for `to`. */
interface StagedFile {
  readonly to: string;
  readonly temp: string;
}

/** Bytes to publish for one target path. */
interface PlannedWrite {
  readonly to: string;
  readonly bytes: Uint8Array;
}

/**
 * Publish one skill's changed files, all or nothing per skill.
 *
 * Every file is staged as a sibling temp first; only when all of them exist is
 * any destination touched. Existing destinations are then copied to sibling
 * backups, the temps renamed over them, and the backups removed on success. A
 * staging failure removes every temp and directory it created and leaves the
 * target untouched. A backup or rename failure removes whatever this run has
 * already published, restores the backups, and clears the remaining temps, so
 * the skill keeps its previous bytes and no `.tmp`/`.bak` survives.
 *
 * The backup is a copy, never a rename: the destination stays at its path for
 * the whole publish window, so a process death between backup and publish
 * leaves the old bytes in place instead of a missing file and an orphaned
 * `.bak`.
 */
const writeStaged = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  files: ReadonlyArray<PlannedWrite>,
  stamp: number,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const staged: Array<StagedFile> = [];
    const created: Array<string> = [];
    const backups: Array<Backup> = [];
    const applied: Array<string> = [];

    /** Drop the staged temps and every directory staging created. */
    const discardStaging = Effect.suspend(() =>
      Effect.gen(function* () {
        yield* discardEach(
          fs,
          staged.map((file) => file.temp),
        );
        // Child before parent: a parent only becomes removable once its
        // children are gone.
        yield* discardEach(fs, deepestFirst(created), discardTree);
      }),
    );

    yield* Effect.forEach(
      files,
      (file) =>
        stageFile(fs, path, file.to, file.bytes, stamp, created).pipe(
          Effect.tap((stagedFile) =>
            Effect.sync(() => {
              staged.push(stagedFile);
            }),
          ),
          Effect.tapError(() => discardStaging),
        ),
      { discard: true, concurrency: 1 },
    );

    /**
     * Undo the publish phase: remove the destinations this run created, put
     * every copied destination back with an atomic rename, then clear temps
     * and directories. A destination that existed before stays present for the
     * whole rollback — the backup is renamed over it, not to it.
     */
    const rollback = Effect.suspend(() =>
      Effect.gen(function* () {
        const backedUp = new Set(backups.map((backup) => backup.to));
        yield* discardEach(
          fs,
          applied.filter((to) => !backedUp.has(to)),
        );
        for (const backup of backups.toReversed()) {
          yield* fs.rename(backup.path, backup.to).pipe(
            // A rename within one directory should not fail; if it does, copy
            // the bytes back so the destination still holds the old content.
            Effect.catch(() =>
              fs.copyFile(backup.path, backup.to).pipe(Effect.andThen(discard(fs, backup.path))),
            ),
            Effect.ignore,
          );
        }
        yield* discardStaging;
      }),
    );

    // Copy every existing destination aside before touching any of them, so a
    // later rename failure can restore the whole skill. Copying, not renaming,
    // keeps each destination present until its own atomic rename replaces it.
    // A directory is left in place: it is a pre-existing collision, and the
    // rename must refuse rather than overwrite it.
    yield* Effect.forEach(
      staged,
      (file) =>
        Effect.gen(function* () {
          const existing = yield* fs.stat(file.to).pipe(Effect.orElseSucceed(() => undefined));
          if (existing === undefined || existing.type === 'Directory') return;
          const backup = siblingBackup(path, file.to, stamp);
          yield* fs
            .copyFile(file.to, backup)
            .pipe(
              Effect.mapError((cause) => `sync: cannot write '${file.to}': ${reasonOf(cause)}`),
            );
          backups.push({ to: file.to, path: backup });
        }).pipe(Effect.tapError(() => rollback)),
      { discard: true, concurrency: 1 },
    );

    yield* Effect.forEach(
      staged,
      (file) =>
        fs.rename(file.temp, file.to).pipe(
          Effect.mapError((cause) => `sync: cannot write '${file.to}': ${reasonOf(cause)}`),
          Effect.tap(() =>
            Effect.sync(() => {
              applied.push(file.to);
            }),
          ),
          Effect.tapError(() => rollback),
        ),
      { discard: true, concurrency: 1 },
    );

    // Published: the replaced bytes are no longer needed.
    yield* discardEach(
      fs,
      backups.map((backup) => backup.path),
    );
  });

/** Remove files the source no longer has, so an update cannot stay diverged. */
const pruneExtraFiles = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  sourceFiles: ReadonlySet<string>,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const present = yield* filesUnder(fs, path, target).pipe(Effect.orElseSucceed(() => []));
    for (const file of present) {
      if (sourceFiles.has(file)) continue;
      yield* fs
        .remove(path.join(target, file), { force: true })
        .pipe(
          Effect.mapError(
            (cause) => `sync: cannot remove '${path.join(target, file)}': ${reasonOf(cause)}`,
          ),
        );
    }
  });

/** Copy one public skill's files, writing only the bytes that differ. */
const syncSkill = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
  sourceRoot: string,
  targetRoot: string,
  store: StoreRoot,
  check: boolean,
  manifest: Store.SyncManifest | undefined,
  sourceCommit: string | undefined,
  force: boolean,
) =>
  Effect.gen(function* () {
    const source = path.join(sourceRoot, name);
    const target = path.join(targetRoot, name);
    const markdown = yield* readTextIfPresent(fs, path.join(source, 'SKILL.md'));
    if (markdown === undefined) return undefined;
    if (isInternalSkill(markdown)) {
      return {
        name,
        outcome: 'skipped' as const,
        source,
        target,
        reason: 'internal',
        files: [],
      };
    }

    const files = yield* filesUnder(fs, path, source);
    yield* assertInsideStore(fs, path, target, store);
    const targetPresent = (yield* resolvePathIfPresent(fs, target)).kind === 'present';

    // One pass decides every outcome and holds the bytes that differ, so the
    // whole skill can be staged before any of it is published.
    const plan = yield* Effect.forEach(files, (file) =>
      Effect.gen(function* () {
        const from = path.join(source, file);
        const to = path.join(target, file);
        yield* assertInsideStore(fs, path, to, store);
        const bytes = yield* fs
          .readFile(from)
          .pipe(Effect.mapError((cause) => `sync: cannot read '${from}': ${reasonOf(cause)}`));
        const existing = yield* readIfPresent(fs, to);
        const outcome: SyncFileOutcome =
          existing === undefined ? 'added' : sameBytes(existing, bytes) ? 'unchanged' : 'updated';
        return { file, outcome, to, bytes } satisfies SyncFileStatus & PlannedWrite;
      }),
    );

    const sourceHash = yield* Store.hashSkill(
      Object.fromEntries(plan.map((file) => [file.file, file.bytes])),
    );
    const entry = manifest?.skills.find((skill) => skill.name === name && skill.removed !== true);
    let drift: SkillDrift = 'unmanaged';
    let differingFiles: ReadonlyArray<string> | undefined;
    if (manifest !== undefined) {
      if (entry === undefined || !targetPresent) {
        drift = 'stale';
      } else {
        const targetBytes = targetPresent ? yield* skillBytes(fs, path, target) : undefined;
        const targetHash =
          targetBytes === undefined ? undefined : yield* Store.hashSkill(targetBytes);
        if (targetHash !== undefined && targetHash.sha256 !== entry.sha256) {
          const names = new Set([
            ...Object.keys(targetHash.files),
            ...Object.keys(entry.files ?? {}),
          ]);
          differingFiles = [...names]
            .filter((file) => targetHash.files[file] !== (entry.files ?? {})[file])
            .toSorted();
          drift = 'diverged';
        } else if (
          sourceHash.sha256 !== entry.sha256 ||
          (manifest.source.commit !== undefined &&
            sourceCommit !== undefined &&
            manifest.source.commit !== sourceCommit)
        ) {
          drift = 'stale';
        } else {
          drift = 'current';
        }
      }
    }

    const refused = drift === 'diverged' && !check && !force;
    const pending = plan.filter((file) => file.outcome !== 'unchanged');
    if (!check && !refused && pending.length > 0) {
      yield* writeStaged(fs, path, pending, yield* Clock.currentTimeMillis);
    }
    if (!check && !refused && manifest !== undefined && entry !== undefined && targetPresent) {
      yield* pruneExtraFiles(fs, path, target, new Set(files));
    }

    const statuses = plan.map(({ file, outcome }) => ({ file, outcome }));
    const changed = statuses.some((status) => status.outcome !== 'unchanged');
    const outcome: SyncOutcome = refused
      ? 'refused'
      : !targetPresent
        ? 'added'
        : changed
          ? 'updated'
          : 'unchanged';
    return {
      name,
      outcome,
      source,
      target,
      files: refused ? [] : statuses,
      drift,
      manifestCommit: manifest?.source.commit,
      differingFiles,
    };
  });

/**
 * A skill's failure, naming what the run already published before it stopped.
 *
 * Skills are published one at a time, so a later failure can follow earlier
 * writes; the reader needs to know which skills are already at the new bytes.
 */
const failureReport = (
  message: string,
  applied: ReadonlyArray<SyncSkillStatus>,
  failed: string,
): string => {
  const done = applied.map((skill) => `${skill.name} (${skill.outcome})`).join(', ');
  return applied.length === 0
    ? `${message}; failed: ${failed}`
    : `${message} — already applied: ${done}; failed: ${failed}`;
};

/** Version from a SKILL.md frontmatter, defaulting like the skill module. */
const skillVersion = (markdown: string): string => {
  const parsed = parseSkillFile(markdown);
  if (parsed === null) return '1.0.0';
  return fieldString(parsed.fields, 'version') ?? '1.0.0';
};

/** Bytes for every file under one skill, keyed by relative path. */
const skillBytes = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<Record<string, Uint8Array>, string> =>
  Effect.gen(function* () {
    const files = yield* filesUnder(fs, path, dir);
    const entries = yield* Effect.forEach(files, (file) =>
      fs.readFile(path.join(dir, file)).pipe(
        Effect.map((bytes) => [file, bytes] as const),
        Effect.mapError(
          (cause) => `sync: cannot read '${path.join(dir, file)}': ${reasonOf(cause)}`,
        ),
      ),
    );
    return Object.fromEntries(entries);
  });

/** Version declared by the source checkout's skills package, when present. */
const sourceVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  sourceRoot: string,
): Effect.Effect<string | undefined> => {
  const manifest = path.join(sourceRoot, 'packages', 'skills', 'package.json');
  return fs.readFileString(manifest).pipe(
    Effect.map((text) => {
      try {
        const parsed: { version?: string } = JSON.parse(text);
        return parsed.version;
      } catch {
        return undefined;
      }
    }),
    Effect.orElseSucceed(() => undefined),
  );
};

/**
 * Build the manifest for one completed sync.
 *
 * Names, bytes, and git facts all come from the source checkout, so the result
 * depends only on what was synced; `syncedAt` is the one moving field.
 */
const buildManifest = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  sourceRoot: string,
  names: ReadonlyArray<string>,
  previous: Store.SyncManifest | undefined,
  keep: ReadonlySet<string> = new Set(),
): Effect.Effect<
  Store.SyncManifest,
  string,
  | import('effect/unstable/process/ChildProcessSpawner').ChildProcessSpawner
  | import('effect/Crypto').Crypto
> =>
  Effect.gen(function* () {
    const facts = yield* BuildInfo.checkoutFacts(sourceRoot);
    const version = yield* sourceVersion(fs, path, sourceRoot);
    const skills: Array<Store.ManifestSkill> = [];
    for (const name of names) {
      const dir = path.join(skillsStoreDir(path, sourceRoot), name);
      const markdown = (yield* readTextIfPresent(fs, path.join(dir, 'SKILL.md'))) ?? '';
      const bytes = yield* skillBytes(fs, path, dir);
      const hashed = yield* Store.hashSkill(bytes);
      skills.push({
        name,
        version: skillVersion(markdown),
        sha256: hashed.sha256,
        files: hashed.files,
      });
    }
    const current = new Set(names);
    const removed = (previous?.skills ?? [])
      .filter((skill) => !current.has(skill.name) && !keep.has(skill.name))
      .map((skill) => ({
        name: skill.name,
        version: skill.version,
        sha256: skill.sha256,
        files: skill.files,
        removed: true,
      }));
    const preserved = (previous?.skills ?? []).filter(
      (skill) => keep.has(skill.name) && !current.has(skill.name),
    );
    return {
      schemaVersion: Store.SCHEMA_VERSION,
      source: {
        path: sourceRoot,
        remote: facts.remote,
        commit: facts.commit,
        ref: facts.ref,
        version,
      },
      syncedAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
      skills: [...skills, ...preserved, ...removed],
    };
  });

/**
 * Publish every public skill from a checkout into a workspace store.
 *
 * Idempotent: only files whose bytes differ are written. A managed skill loses
 * files the source deleted, so an update cannot stay diverged; unrelated target
 * skills are untouched. `check` computes the same outcomes without writing;
 * `drifted` reports whether anything would change.
 *
 * Skills are published sequentially so a mid-run failure can name the skills
 * already applied, and each skill is staged in full before anything is
 * renamed, so a failure never leaves a half-synced skill behind.
 * @param options - source checkout, target workspace, and mode
 * @returns per-skill outcomes plus the aggregate drift flag
 */
export const runSync = (options: SyncOptions = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = given(options.cwd);
    const sourceRoot =
      given(options.from) ??
      (yield* resolveDefaultSource({ packageCheckout: checkoutRoot(path), cwd }));
    const targetRoot = given(options.dir) ?? cwd ?? '.';
    const check = options.check === true;
    const invocation = options.invocation ?? DEFAULT_SYNC_INVOCATION;
    const source = skillsStoreDir(path, sourceRoot);
    const target = skillsStoreDir(path, targetRoot);

    const present = yield* fs.exists(source).pipe(Effect.orElseSucceed(() => false));
    if (!present) {
      return yield* Effect.fail(
        `sync: no skills store at '${source}' — check out montflow there, or point at a checkout with '${invocation} --source <checkout>'`,
      );
    }

    const names = yield* directoryNames(fs, path, source);
    const store = yield* storeRootOf(fs, path, target);
    const previousState = yield* Store.read(targetRoot);
    if (
      previousState.status === 'corrupt' ||
      previousState.status === 'unreadable' ||
      previousState.status === 'unsupported'
    ) {
      return yield* Effect.fail(
        `sync: the manifest at '${Store.file(path, targetRoot)}' is ${previousState.status} — repair or remove it before syncing, so local edits are not overwritten`,
      );
    }
    const previous = previousState.status === 'managed' ? previousState.manifest : undefined;
    const facts = yield* BuildInfo.checkoutFacts(sourceRoot);
    const skills: Array<SyncSkillStatus> = [];
    const applied: Array<SyncSkillStatus> = [];
    for (const name of names) {
      const status = yield* syncSkill(
        fs,
        path,
        name,
        source,
        target,
        store,
        check,
        previous,
        facts.commit,
        options.force === true,
      ).pipe(Effect.mapError((message) => failureReport(message, applied, name)));
      if (status === undefined) continue;
      skills.push(status);
      if (status.outcome === 'added' || status.outcome === 'updated') applied.push(status);
    }

    // Directories without a `SKILL.md` are not skills, so `names` being
    // non-empty proves nothing: a store holding only notes still has no skill
    // to verify, and reporting it current would bless a mistyped `--source`.
    if (skills.length === 0) {
      return yield* Effect.fail(
        `sync: no skill directories in source store '${source}' — name a checkout with skills: '${invocation} --source <checkout>'`,
      );
    }

    const changed = skills
      .filter((skill) => skill.outcome === 'added' || skill.outcome === 'updated')
      .map((skill) => skill.name);

    const refusedSkills = skills.filter((skill) => skill.outcome === 'refused');
    const keep = new Set(refusedSkills.map((skill) => skill.name));
    if (!check) {
      const publicNames = skills
        .filter((skill) => skill.outcome !== 'skipped' && skill.outcome !== 'refused')
        .map((skill) => skill.name);
      const manifest = yield* buildManifest(fs, path, sourceRoot, publicNames, previous, keep);
      if (previous === undefined || !Store.same(previous, manifest)) {
        yield* Store.write(targetRoot, manifest);
      }
    }

    return {
      sourceRoot,
      targetRoot,
      source,
      target,
      check,
      invocation,
      skills,
      changed,
      refused: skills.filter((skill) => skill.outcome === 'refused').map((skill) => skill.name),
      drifted:
        changed.length > 0 ||
        skills.some((skill) => skill.drift === 'stale' || skill.drift === 'diverged'),
    };
  }).pipe(Effect.provide(NodeLive));
