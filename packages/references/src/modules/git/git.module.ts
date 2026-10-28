// oxlint-disable-next-line montflow/no-node-platform-imports -- Git.Default is the package's single git composition seam; every command is argv-only and no other module spawns a process.
import { spawn } from 'node:child_process';
import { Context, Effect, Layer } from 'effect';
import { COMMIT_PATTERN } from '../reference/index.js';

/**
 * The git lifecycle: clone, checkout, fetch, and state probes behind one port,
 * so no engine spawns a process itself.
 *
 * Every mutation is a port call; every call is `execFile('git', argv)` with
 * `-C <path>` and no shell. Errors are encoded in {@link GitCommandResult} so a
 * caller can decide between a refusal and a failure without losing git's text.
 */

/** State of one clone on disk, as `status` reports it. */
export type CloneState = 'missing' | 'present' | 'dirty' | 'ref-mismatch';

/** What a recorded `ref` actually names inside the clone. */
export type RefKind = 'commit' | 'tag' | 'branch';

/** A ref's resolved kind, or `unresolved` when nothing in the clone names it. */
export type RefClass = RefKind | 'unresolved';

/** What a recorded `ref` actually names inside the clone. */
export interface RefResolution {
  /** Whether the ref resolved to a commit. */
  readonly resolved: boolean;
  /** Full 40-hex commit id, when resolved. */
  readonly sha?: string | undefined;
  /** Resolved class, or `unresolved`. */
  readonly kind: RefClass;
  /** Whether the spelling is a tag-shaped candidate (`v1` or `refs/tags/v1`). */
  readonly tagCandidate: boolean;
  /** Tag name after stripping one leading `refs/tags/`. */
  readonly tagName: string;
}

/** Whether git is installed and whether a path is a work tree. */
export interface RepoProbe {
  /** False when the `git` executable itself could not be spawned. */
  readonly available: boolean;
  /** True when `git rev-parse --is-inside-work-tree` prints `true`. */
  readonly workTree: boolean;
}

/** One dirty-worktree reading; an unreadable index is a failure, never clean. */
export interface DirtyState {
  /** False when `git status` did not complete, so the state was never read. */
  readonly ok: boolean;
  readonly dirty: boolean;
  /** Number of `git status --porcelain` lines. */
  readonly count: number;
  /** The status lines, in git order. */
  readonly entries: ReadonlyArray<string>;
  /** Git's message when the state could not be read. */
  readonly error?: string | undefined;
}

/** Ahead/behind counts relative to one upstream ref. */
export interface RefCounts {
  /** Commits on `HEAD` not on the upstream. */
  readonly ahead: number;
  /** Commits on the upstream not on `HEAD`. */
  readonly behind: number;
}

/** One row from `git ls-remote`, verbatim. */
export interface RemoteRefRow {
  readonly ref: string;
  readonly sha: string;
}

/** One `git` invocation, success and failure encoded. */
export interface GitCommandResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  /** First non-empty stderr line, or the spawn error message. */
  readonly message: string;
  /** True when `git` itself is missing from `PATH`. */
  readonly missingBinary: boolean;
}

/** One `git ls-remote` result. */
export interface LsRemoteResult {
  readonly ok: boolean;
  readonly rows: ReadonlyArray<RemoteRefRow>;
  readonly message: string;
}

/** How long one non-clone git call may run. */
const TIMEOUT_MS = 30_000;

/** How long a clone may run. */
const CLONE_TIMEOUT_MS = 300_000;

/**
 * First non-empty line of `text`, trimmed; the message suffix every refusal
 * uses.
 * @param text - captured stdout or stderr
 * @returns the first meaningful line, or an empty string
 */
export const firstLine = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '') ?? '';

/**
 * The tag name a tag-shaped candidate names: one leading `refs/tags/` removed.
 * @param ref - recorded ref value
 * @returns the normalized tag name
 */
export const tagName = (ref: string): string =>
  ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ref;

/**
 * The branch name a branch-shaped spelling names.
 * @param ref - recorded ref value
 * @returns the normalized branch name
 */
export const branchName = (ref: string): string => {
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (ref.startsWith('refs/remotes/origin/')) return ref.slice('refs/remotes/origin/'.length);
  if (ref.startsWith('refs/remotes/')) return ref.slice('refs/remotes/'.length);
  return ref;
};

/**
 * Outcome of the no-ref comparison B002 §8.3 pins down: the clone must be
 * attached to the remote's default branch.
 */
export type UnpinnedComparison =
  | { readonly kind: 'match' }
  | { readonly kind: 'no-upstream' }
  | { readonly kind: 'detached'; readonly expected: string }
  | { readonly kind: 'branch'; readonly current: string; readonly expected: string };

/**
 * The one unpinned comparison `status` and `verify --clones` share.
 *
 * `currentRef` is the observation's branch (`HEAD` when detached); an absent
 * default branch means the clone records no upstream and cannot be proven
 * attached.
 * @param currentRef - checked-out branch, or `HEAD`/undefined when detached
 * @param defaultBranch - `origin/HEAD`'s branch, when the clone has one
 * @returns the comparison token the callers render
 */
export const compareUnpinned = (
  currentRef: string | undefined,
  defaultBranch: string | undefined,
): UnpinnedComparison => {
  if (defaultBranch === undefined) return { kind: 'no-upstream' };
  if (currentRef === undefined || currentRef === '' || currentRef === 'HEAD') {
    return { kind: 'detached', expected: defaultBranch };
  }
  if (currentRef !== defaultBranch) {
    return { kind: 'branch', current: currentRef, expected: defaultBranch };
  }
  return { kind: 'match' };
};

/**
 * True when a ref is a tag-shaped candidate: a bare name, or the literal
 * `refs/tags/<name>` spelling. A commit is never a candidate.
 * @param ref - recorded ref value
 * @returns true for a candidate spelling
 */
export const isTagCandidate = (ref: string): boolean =>
  !COMMIT_PATTERN.test(ref) && (!ref.includes('/') || ref.startsWith('refs/tags/'));

/**
 * Resolve the commit a tag-shaped ref names from `ls-remote` rows.
 *
 * The peeled `^{}` row wins for an annotated tag; a lightweight tag has no such
 * row, so its plain row is authoritative. The argument is the normalized tag
 * name, never the raw spelling.
 * @param rows - rows from {@link GitPortImpl.lsRemote}
 * @param ref - normalized tag name
 * @returns the commit id, or undefined when the remote did not report the ref
 */
export const resolveRemoteRef = (
  rows: ReadonlyArray<RemoteRefRow>,
  ref: string,
): string | undefined =>
  rows.find((row) => row.ref === `refs/tags/${ref}^{}`)?.sha ??
  rows.find((row) => row.ref === `refs/tags/${ref}`)?.sha ??
  rows.find((row) => row.ref === `refs/heads/${ref}`)?.sha ??
  rows.find((row) => row.ref === `refs/remotes/origin/${ref}`)?.sha;

/** Run one `git` command with the stable `C` locale. Interruption kills the child. */
const runGit = (
  args: ReadonlyArray<string>,
  timeout = TIMEOUT_MS,
): Effect.Effect<GitCommandResult> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      // oxlint-disable-next-line montflow/no-process-env -- Git.Default is the one composition seam that spawns git; LC_ALL=C keeps stderr text stable for messages.
      const env = { ...process.env, LC_ALL: 'C' };
      return spawn('git', [...args], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: AbortSignal.timeout(timeout),
      });
    }),
    (child) =>
      Effect.callback<GitCommandResult>((resume) => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        const settle = (result: GitCommandResult): void => {
          if (settled) return;
          settled = true;
          resume(Effect.succeed(result));
        };
        child.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on('error', (error: NodeJS.ErrnoException) => {
          const missingBinary = error.code === 'ENOENT';
          settle({
            ok: false,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            message: missingBinary
              ? 'git is not installed or not on PATH'
              : firstLine(error.message),
            missingBinary,
          });
        });
        child.on('close', (code) => {
          const out = stdout.trim();
          const err = stderr.trim();
          settle({
            ok: code === 0,
            stdout: out,
            stderr: err,
            message: firstLine(err) || (code === 0 ? '' : `git exited with code ${code ?? 'null'}`),
            missingBinary: false,
          });
        });
        return Effect.void;
      }),
    (child) =>
      Effect.sync(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      }),
  );

/** Parse `ls-remote` lines into verbatim rows. */
const parseRemoteRows = (stdout: string): ReadonlyArray<RemoteRefRow> => {
  const rows: Array<RemoteRefRow> = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const separator = trimmed.indexOf('\t');
    if (separator === -1) continue;
    const sha = trimmed.slice(0, separator).trim();
    const ref = trimmed.slice(separator + 1).trim();
    if (sha === '' || ref === '') continue;
    rows.push({ ref, sha });
  }
  return rows;
};

/** Git lifecycle surface the engines consume. */
export interface GitPortImpl {
  /** Whether git is available and whether `path` is a work tree. */
  readonly isRepo: (path: string) => Effect.Effect<RepoProbe>;
  /** `origin` URL, or undefined when it is not configured. */
  readonly origin: (path: string) => Effect.Effect<string | undefined>;
  /** Whether the clone is shallow. */
  readonly isShallow: (path: string) => Effect.Effect<boolean>;
  /** Porcelain dirty state and count. */
  readonly isDirty: (path: string) => Effect.Effect<DirtyState>;
  /** Current `HEAD` commit, when there is one. */
  readonly head: (path: string) => Effect.Effect<string | undefined>;
  /** Current branch, or undefined when `HEAD` is detached. */
  readonly currentBranch: (path: string) => Effect.Effect<string | undefined>;
  /** Resolve a recorded ref in B002 §2.6 order. */
  readonly resolveRef: (path: string, ref: string) => Effect.Effect<RefResolution>;
  /** Remote default branch, with the offline upstream fallback. */
  readonly defaultBranch: (path: string) => Effect.Effect<string | undefined>;
  /** Ahead/behind counts of `HEAD` against one upstream ref. */
  readonly counts: (path: string, upstream: string) => Effect.Effect<RefCounts | undefined>;
  /** Full clone, no depth, no single-branch, no submodules. */
  readonly clone: (url: string, path: string) => Effect.Effect<GitCommandResult>;
  /** Plain `fetch --prune` of origin; never forced. */
  readonly fetch: (path: string) => Effect.Effect<GitCommandResult>;
  /** One explicit refspec fetch, used only to repair a missing ref. */
  readonly fetchRef: (path: string, refspec: string) => Effect.Effect<GitCommandResult>;
  /** `remote set-head origin --auto`, the default-branch repair. */
  readonly setHeadAuto: (path: string) => Effect.Effect<GitCommandResult>;
  /** Query origin refs; the package's only remote-ref lookup. */
  readonly lsRemote: (
    path: string,
    patterns: ReadonlyArray<string>,
  ) => Effect.Effect<LsRemoteResult>;
  /** Resolve-then-detach, optionally discarding local changes. */
  readonly checkoutDetached: (
    path: string,
    sha: string,
    force?: boolean,
  ) => Effect.Effect<GitCommandResult>;
  /** Attach to `branch` at `startPoint`, optionally discarding local changes. */
  readonly checkoutBranch: (
    path: string,
    branch: string,
    startPoint: string,
    force?: boolean,
  ) => Effect.Effect<GitCommandResult>;
  /** `merge --ff-only`. */
  readonly fastForward: (path: string, target: string) => Effect.Effect<GitCommandResult>;
  /** `reset --hard`. */
  readonly resetHard: (path: string, target: string) => Effect.Effect<GitCommandResult>;
  /** `clean -fd`; never `-x`, so ignored dependency dirs survive. */
  readonly clean: (path: string) => Effect.Effect<GitCommandResult>;
  /** `add -f -- <paths>`, the `.gitkeep` staging call. */
  readonly addForce: (
    path: string,
    paths: ReadonlyArray<string>,
  ) => Effect.Effect<GitCommandResult>;
}

const make = Effect.sync(() => {
  const isRepo = Effect.fn('Git.isRepo')(function* (path: string) {
    const result = yield* runGit(['-C', path, 'rev-parse', '--is-inside-work-tree']);
    return {
      available: !result.missingBinary,
      workTree: result.ok && result.stdout === 'true',
    } satisfies RepoProbe;
  });

  const origin = Effect.fn('Git.origin')(function* (path: string) {
    const result = yield* runGit(['-C', path, 'remote', 'get-url', 'origin']);
    return result.ok && result.stdout !== '' ? result.stdout : undefined;
  });

  const isShallow = Effect.fn('Git.isShallow')(function* (path: string) {
    const result = yield* runGit(['-C', path, 'rev-parse', '--is-shallow-repository']);
    return result.ok && result.stdout === 'true';
  });

  const isDirty = Effect.fn('Git.isDirty')(function* (path: string) {
    const result = yield* runGit([
      '-C',
      path,
      'status',
      '--porcelain=v1',
      '--untracked-files=normal',
    ]);
    const entries = result.ok ? result.stdout.split('\n').filter((line) => line.trim() !== '') : [];
    return {
      ok: result.ok,
      dirty: result.ok && entries.length > 0,
      count: entries.length,
      entries,
      error: result.ok ? undefined : result.message || 'git status did not complete',
    } satisfies DirtyState;
  });

  const head = Effect.fn('Git.head')(function* (path: string) {
    const result = yield* runGit(['-C', path, 'rev-parse', 'HEAD']);
    return result.ok && result.stdout !== '' ? result.stdout : undefined;
  });

  const currentBranch = Effect.fn('Git.currentBranch')(function* (path: string) {
    const result = yield* runGit(['-C', path, 'rev-parse', '--abbrev-ref', 'HEAD']);
    if (!result.ok || result.stdout === '' || result.stdout === 'HEAD') return undefined;
    return result.stdout;
  });

  const tryResolve = Effect.fn('Git.tryResolve')(function* (path: string, candidate: string) {
    const result = yield* runGit([
      '-C',
      path,
      'rev-parse',
      '--verify',
      '--quiet',
      `${candidate}^{commit}`,
    ]);
    return result.ok && result.stdout !== '' ? result.stdout : undefined;
  });

  const resolveRef = Effect.fn('Git.resolveRef')(function* (path: string, value: string) {
    const ref = value.trim();
    const name = tagName(ref);
    const candidate = isTagCandidate(ref);
    if (COMMIT_PATTERN.test(ref)) {
      const sha = yield* tryResolve(path, ref);
      if (sha !== undefined) {
        return {
          resolved: true,
          sha,
          kind: 'commit',
          tagCandidate: false,
          tagName: name,
        } satisfies RefResolution;
      }
    } else {
      if (candidate) {
        const tagSha = yield* tryResolve(path, `refs/tags/${name}`);
        if (tagSha !== undefined) {
          return {
            resolved: true,
            sha: tagSha,
            kind: 'tag',
            tagCandidate: true,
            tagName: name,
          } satisfies RefResolution;
        }
      }
      const remoteSha = yield* tryResolve(path, `refs/remotes/origin/${ref}`);
      if (remoteSha !== undefined) {
        return {
          resolved: true,
          sha: remoteSha,
          kind: 'branch',
          tagCandidate: candidate,
          tagName: name,
        } satisfies RefResolution;
      }
      const localSha = yield* tryResolve(path, `refs/heads/${ref}`);
      if (localSha !== undefined) {
        return {
          resolved: true,
          sha: localSha,
          kind: 'branch',
          tagCandidate: candidate,
          tagName: name,
        } satisfies RefResolution;
      }
      if (ref.startsWith('refs/')) {
        const literalSha = yield* tryResolve(path, ref);
        if (literalSha !== undefined) {
          return {
            resolved: true,
            sha: literalSha,
            kind: ref.startsWith('refs/tags/') ? 'tag' : 'branch',
            tagCandidate: candidate,
            tagName: name,
          } satisfies RefResolution;
        }
      }
    }
    return {
      resolved: false,
      kind: 'unresolved',
      tagCandidate: candidate,
      tagName: name,
    } satisfies RefResolution;
  });

  const defaultBranch = Effect.fn('Git.defaultBranch')(function* (path: string) {
    const symbolic = yield* runGit([
      '-C',
      path,
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ]);
    if (symbolic.ok && symbolic.stdout.startsWith('origin/')) {
      return symbolic.stdout.slice('origin/'.length);
    }
    const current = yield* currentBranch(path);
    if (current === undefined) return undefined;
    const upstream = yield* runGit([
      '-C',
      path,
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}',
    ]);
    if (upstream.ok && upstream.stdout === `origin/${current}`) return current;
    return undefined;
  });

  const counts = Effect.fn('Git.counts')(function* (path: string, upstream: string) {
    const result = yield* runGit([
      '-C',
      path,
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...${upstream}`,
    ]);
    if (!result.ok || result.stdout === '') return undefined;
    const [aheadText, behindText] = result.stdout.split(/\s+/);
    const ahead = Number.parseInt(aheadText ?? '', 10);
    const behind = Number.parseInt(behindText ?? '', 10);
    if (Number.isNaN(ahead) || Number.isNaN(behind)) return undefined;
    return { ahead, behind } satisfies RefCounts;
  });

  const clone = Effect.fn('Git.clone')(function* (url: string, path: string) {
    return yield* runGit(['clone', '--quiet', '--', url, path], CLONE_TIMEOUT_MS);
  });

  const fetch = Effect.fn('Git.fetch')(function* (path: string) {
    return yield* runGit(['-C', path, 'fetch', '--prune', '--quiet', 'origin']);
  });

  const fetchRef = Effect.fn('Git.fetchRef')(function* (path: string, refspec: string) {
    return yield* runGit(['-C', path, 'fetch', '--quiet', 'origin', refspec]);
  });

  const setHeadAuto = Effect.fn('Git.setHeadAuto')(function* (path: string) {
    return yield* runGit(['-C', path, 'remote', 'set-head', 'origin', '--auto']);
  });

  const lsRemote = Effect.fn('Git.lsRemote')(function* (
    path: string,
    patterns: ReadonlyArray<string>,
  ) {
    const result = yield* runGit(['-C', path, 'ls-remote', '--quiet', 'origin', ...patterns]);
    return {
      ok: result.ok,
      rows: result.ok ? parseRemoteRows(result.stdout) : [],
      message: result.message,
    } satisfies LsRemoteResult;
  });

  const checkoutDetached = Effect.fn('Git.checkoutDetached')(function* (
    path: string,
    sha: string,
    force = false,
  ) {
    const args = ['-C', path, '-c', 'advice.detachedHead=false', 'checkout'];
    if (force) args.push('-f');
    args.push('--detach', sha);
    return yield* runGit(args);
  });

  const checkoutBranch = Effect.fn('Git.checkoutBranch')(function* (
    path: string,
    branch: string,
    startPoint: string,
    force = false,
  ) {
    const args = ['-C', path, 'checkout'];
    if (force) args.push('-f');
    args.push('-B', branch, startPoint);
    return yield* runGit(args);
  });

  const fastForward = Effect.fn('Git.fastForward')(function* (path: string, target: string) {
    return yield* runGit(['-C', path, 'merge', '--ff-only', target]);
  });

  const resetHard = Effect.fn('Git.resetHard')(function* (path: string, target: string) {
    return yield* runGit(['-C', path, 'reset', '--hard', target]);
  });

  const clean = Effect.fn('Git.clean')(function* (path: string) {
    return yield* runGit(['-C', path, 'clean', '-fd']);
  });

  const addForce = Effect.fn('Git.addForce')(function* (
    path: string,
    paths: ReadonlyArray<string>,
  ) {
    return yield* runGit(['-C', path, 'add', '-f', '--', ...paths]);
  });

  return {
    isRepo,
    origin,
    isShallow,
    isDirty,
    head,
    currentBranch,
    resolveRef,
    defaultBranch,
    counts,
    clone,
    fetch,
    fetchRef,
    setHeadAuto,
    lsRemote,
    checkoutDetached,
    checkoutBranch,
    fastForward,
    resetHard,
    clean,
    addForce,
  } as const;
});

export const Id = '@montflow/GitPort';
export type Id = typeof Id;

export type Impl = GitPortImpl;

export class GitPort extends Context.Service<GitPort, GitPortImpl>()(Id) {}

export const Default = Layer.effect(GitPort, make);

/**
 * One read-only observation of a clone directory. Every field is derived from
 * the filesystem or a `git` query; nothing is written.
 */
export interface CloneObservation {
  /** Derived clone path, `<root>/.agents/references/<slug>`. */
  readonly path: string;
  /** Coarse state: absent, present, dirty, or pinned ref mismatch. */
  readonly state: CloneState;
  /** Whether anything exists at {@link path}. */
  readonly present: boolean;
  /** Whether {@link path} is a directory (a file or symlink is not). */
  readonly isDirectory: boolean;
  /** Whether `git rev-parse --is-inside-work-tree` reports `true`. */
  readonly gitWorkTree: boolean;
  /** Number of paths reported by `git status --porcelain`. */
  readonly dirtyPaths: number;
  /** Git's message when the dirty state could not be read; absent when read. */
  readonly dirtyError?: string | undefined;
  /** Current `HEAD` commit id, when the clone is a git work tree. */
  readonly head?: string | undefined;
  /** Current branch name, or `HEAD` when detached. */
  readonly currentRef?: string | undefined;
  /** Remote default branch (`origin/HEAD`), when the clone records one. */
  readonly defaultBranch?: string | undefined;
  /** Current `origin` URL, when configured. */
  readonly origin?: string | undefined;
  /** Whether {@link origin} normalizes to the recorded URL. */
  readonly matchesOrigin: boolean;
  /** Whether the recorded `ref` resolved in the clone; absent when unpinned. */
  readonly refResolved?: boolean | undefined;
  /** Commit id the recorded `ref` resolves to, when it resolves. */
  readonly resolvedRefHead?: string | undefined;
  /** Whether `HEAD` equals the recorded `ref` (always true when unpinned). */
  readonly matchesRef: boolean;
}
