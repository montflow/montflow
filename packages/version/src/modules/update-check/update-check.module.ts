import { Clock, Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess } from 'effect/unstable/process';
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner';
import { probeEnv } from '../build-info/index.js';

/**
 * Update awareness for one `mf-*` CLI.
 *
 * The git repository is the source of truth: the newest `@montflow/<cli>@*`
 * tag wins, and when no tag exists the main commit is the fallback. One
 * `ls-remote` request, a hard two-second cap, and a disk cache keep the check
 * cheap enough to run on every command.
 */

/** Default upstream repository. */
export const DEFAULT_REMOTE = 'https://github.com/montflow/montflow';

/** Success cache lifetime. */
export const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;

/** Failure cache lifetime. */
export const FAILURE_TTL_MS = 60 * 60 * 1000;

/** Hard limit on one remote probe. */
export const PROBE_TIMEOUT_MS = 2000;

/** What the check concluded. */
export type Verdict =
  | {
      readonly state: 'behind';
      readonly available: string;
      readonly basis: 'tag' | 'commit';
      readonly commit?: string | undefined;
    }
  | { readonly state: 'current' }
  | { readonly state: 'ahead'; readonly available: string }
  | { readonly state: 'unknown'; readonly reason: string }
  | { readonly state: 'skipped'; readonly reason: 'env' | 'flag' | 'ci' };

/** One ref returned by the probe. */
export interface RemoteRef {
  readonly name: string;
  readonly commit: string;
}

/** Probe request: which remote and which package's tag prefix. */
export interface ProbeRequest {
  readonly remote: string;
  readonly packageName: string;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** The remote read used by the check; injectable so tests never touch the network. */
export interface Probe {
  readonly refs: (
    request: ProbeRequest,
  ) => Effect.Effect<ReadonlyArray<RemoteRef>, string, ChildProcessSpawner>;
}

/** How to check one package. */
export interface CheckOptions {
  /** Package name, e.g. `@montflow/skills`; also the tag prefix. */
  readonly packageName: string;
  /** Version the running CLI reports. */
  readonly currentVersion: string;
  /** Checkout whose commit is compared when no tag matches. */
  readonly checkout: string;
  /** Local `HEAD`, when the install is in a git checkout. */
  readonly currentCommit?: string | undefined;
  /** Remote repository, defaulting to {@link DEFAULT_REMOTE}. */
  readonly remote?: string | undefined;
  /** Environment used for opt-outs, cache location, and the probe. */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** Already-parsed argv, used for `--no-update-check`. */
  readonly args?: ReadonlyArray<string> | undefined;
  /** Bypass a cached verdict; the only mode a caller may turn into exit 1. */
  readonly force?: boolean | undefined;
  /** Override the cache file (tests, or an embedder with its own cache). */
  readonly cacheFile?: string | undefined;
  /** Override the remote probe (tests). */
  readonly probe?: Probe | undefined;
}

/** Verdict plus whether it came from the cache. */
export interface CheckResult {
  readonly verdict: Verdict;
  readonly cached: boolean;
}

/** One cache entry. `notifiedAt` is written by the notice layer. */
interface CacheEntry {
  readonly checkedAt: number;
  readonly expiresAt: number;
  readonly verdict: Verdict;
  readonly notifiedAt?: number | undefined;
}

interface CacheFile {
  readonly schemaVersion: number;
  readonly entries: Readonly<Record<string, CacheEntry>>;
}

const VerdictSchema = Schema.Union([
  Schema.Struct({
    state: Schema.Literal('behind'),
    available: Schema.String,
    basis: Schema.Literals(['tag', 'commit']),
    commit: Schema.optional(Schema.String),
  }),
  Schema.Struct({ state: Schema.Literal('current') }),
  Schema.Struct({ state: Schema.Literal('ahead'), available: Schema.String }),
  Schema.Struct({ state: Schema.Literal('unknown'), reason: Schema.String }),
  Schema.Struct({
    state: Schema.Literal('skipped'),
    reason: Schema.Literals(['env', 'flag', 'ci']),
  }),
]);

const CacheEntrySchema = Schema.Struct({
  checkedAt: Schema.Number,
  expiresAt: Schema.Number,
  verdict: VerdictSchema,
  notifiedAt: Schema.optional(Schema.Number),
});

const CacheFileSchema = Schema.Struct({
  schemaVersion: Schema.Number,
  entries: Schema.Record(Schema.String, CacheEntrySchema),
});

/** SemVer core plus optional prerelease, enough for package versions. */
export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: ReadonlyArray<string>;
}

const SEMVER_PATTERN =
  /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<pre>[0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;

/** Parse `1.2.3` / `1.2.3-rc.1`; `undefined` when it is not SemVer. */
export const parseSemVer = (value: string): SemVer | undefined => {
  const match = SEMVER_PATTERN.exec(value);
  if (match?.groups === undefined) return undefined;
  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.pre === undefined ? [] : match.groups.pre.split('.'),
  };
};

const compareIdentifier = (a: string, b: string): number => {
  const an = /^\d+$/u.test(a);
  const bn = /^\d+$/u.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * SemVer precedence: negative when `a` is older, positive when newer.
 * Build metadata is ignored; a prerelease sorts before its release.
 */
export const compareSemVer = (a: string, b: string): number => {
  const left = parseSemVer(a);
  const right = parseSemVer(b);
  if (left === undefined || right === undefined) return 0;
  const core = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
  if (core !== 0) return core;
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index++) {
    const l = left.prerelease[index];
    const r = right.prerelease[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const order = compareIdentifier(l, r);
    if (order !== 0) return order;
  }
  return 0;
};

/** The version in `@montflow/skills@1.2.3`, or `undefined` for another ref. */
export const versionOfTag = (packageName: string, ref: string): string | undefined => {
  const prefix = `refs/tags/${packageName}@`;
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : undefined;
};

const parseRefs = (stdout: string): ReadonlyArray<RemoteRef> =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [commit = '', name = ''] = line.split('\t');
      return { commit, name };
    })
    .filter((ref) => ref.commit !== '' && ref.name !== '');

/** The real probe: one `git ls-remote` request, no API and no token. */
const readRefs = (request: ProbeRequest) =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make(
      'git',
      ['ls-remote', '--refs', request.remote, `${request.packageName}@*`, 'refs/heads/main'],
      { stderr: 'ignore', env: probeEnv(request.env), extendEnv: true },
    );
    const stdout = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString);
    const code = yield* handle.exitCode;
    if (code !== 0) return yield* Effect.fail('git ls-remote failed');
    return parseRefs(stdout);
  }).pipe(
    Effect.scoped,
    Effect.orElseSucceed((): ReadonlyArray<RemoteRef> => []),
  );

/** The real probe: one `git ls-remote` request, no API and no token. */
const gitProbe: Probe = {
  refs: Effect.fnUntraced(function* (request: ProbeRequest) {
    return yield* readRefs(request);
  }),
};

/** Which opt-out, if any, applies before any cache or network access. */
export const skipReason = (
  env: Readonly<Record<string, string | undefined>> | undefined,
  args: ReadonlyArray<string> | undefined,
): 'env' | 'flag' | 'ci' | undefined => {
  if (args?.includes('--no-update-check') === true) return 'flag';
  if (env?.MONTFLOW_NO_UPDATE_CHECK === '1') return 'env';
  if (env?.CI === 'true') return 'ci';
  return undefined;
};

/** `${XDG_CACHE_HOME:-$HOME/.cache}/montflow/version-check.json`, if resolvable. */
export const cacheFileFor = (
  path: Path.Path,
  env: Readonly<Record<string, string | undefined>> | undefined,
): string | undefined => {
  const base =
    env?.XDG_CACHE_HOME ?? (env?.HOME === undefined ? undefined : path.join(env.HOME, '.cache'));
  return base === undefined ? undefined : path.join(base, 'montflow', 'version-check.json');
};

const emptyCache = (): CacheFile => ({ schemaVersion: 1, entries: {} });

const readCache = (
  path: Path.Path,
  file: string,
): Effect.Effect<CacheFile, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));
    if (text === undefined) return emptyCache();
    try {
      const parsed: unknown = JSON.parse(text);
      return (
        Option.getOrUndefined(Schema.decodeUnknownOption(CacheFileSchema)(parsed)) ?? emptyCache()
      );
    } catch {
      return emptyCache();
    }
  });

const writeCache = (
  path: Path.Path,
  file: string,
  cache: CacheFile,
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(Effect.ignore);
    yield* fs.writeFileString(file, `${JSON.stringify(cache)}\n`).pipe(Effect.ignore);
  });

/** Cache key: a package in a checkout, never a package alone. */
export const cacheKey = (packageName: string, checkout: string): string =>
  `${packageName}\u0000${checkout}`;

/** Decide from the ref list, or `unknown` when there is nothing to compare. */
export const decide = (
  options: Pick<CheckOptions, 'packageName' | 'currentVersion' | 'currentCommit'>,
  refs: ReadonlyArray<RemoteRef>,
): Verdict => {
  const tags = refs
    .map((ref) => versionOfTag(options.packageName, ref.name))
    .filter((version): version is string => version !== undefined)
    .toSorted(compareSemVer);
  const newest = tags.at(-1);
  if (newest !== undefined) {
    const order = compareSemVer(options.currentVersion, newest);
    if (order === 0) return { state: 'current' };
    if (order > 0) return { state: 'ahead', available: newest };
    return { state: 'behind', available: newest, basis: 'tag' };
  }

  const main = refs.find((ref) => ref.name === 'refs/heads/main');
  if (main === undefined || options.currentCommit === undefined) {
    return {
      state: 'unknown',
      reason: 'no matching tag and no commit to compare',
    };
  }
  if (main.commit === options.currentCommit) return { state: 'current' };
  return {
    state: 'behind',
    available: main.commit.slice(0, 7),
    basis: 'commit',
    commit: main.commit,
  };
};

/** Query the remote under the two-second cap. */
const probeVerdict = (options: CheckOptions): Effect.Effect<Verdict, never, ChildProcessSpawner> =>
  Effect.gen(function* () {
    const probe = options.probe ?? gitProbe;
    const result = yield* probe
      .refs({
        remote: options.remote ?? DEFAULT_REMOTE,
        packageName: options.packageName,
        env: options.env,
      })
      .pipe(
        Effect.timeoutOption(PROBE_TIMEOUT_MS),
        Effect.match({
          onFailure: (reason) => ({ kind: 'failed' as const, reason }),
          onSuccess: (refs) =>
            Option.isNone(refs)
              ? { kind: 'timeout' as const }
              : { kind: 'refs' as const, refs: refs.value },
        }),
      );
    if (result.kind === 'timeout') {
      return { state: 'unknown', reason: `probe timed out after ${PROBE_TIMEOUT_MS}ms` };
    }
    if (result.kind === 'failed') {
      return { state: 'unknown', reason: result.reason };
    }
    return decide(options, result.refs);
  });

/**
 * Decide whether this CLI is behind upstream, using the cache unless forced.
 *
 * Opt-outs skip cache and network entirely. A forced check always probes and
 * refreshes the cache. Probe failures, timeouts, a non-git install, and a
 * remote with no matching refs all yield `unknown` rather than an error.
 * @param options - package, versions, checkout, environment, and probe
 * @returns the verdict and whether it came from cache
 */
export const check = Effect.fn('UpdateCheck.check')(function* (options: CheckOptions) {
  const path = yield* Path.Path;
  const skipped = skipReason(options.env, options.args);
  if (skipped !== undefined) {
    return { verdict: { state: 'skipped', reason: skipped }, cached: false } satisfies CheckResult;
  }

  const now = yield* Clock.currentTimeMillis;
  const file = options.cacheFile ?? cacheFileFor(path, options.env);
  const key = cacheKey(options.packageName, options.checkout);

  if (!options.force && file !== undefined) {
    const cache = yield* readCache(path, file);
    const entry = cache.entries[key];
    if (entry !== undefined && now < entry.expiresAt) {
      return { verdict: entry.verdict, cached: true } satisfies CheckResult;
    }
  }

  const verdict = yield* probeVerdict(options);
  if (file !== undefined) {
    const cache = yield* readCache(path, file);
    const ttl = verdict.state === 'unknown' ? FAILURE_TTL_MS : SUCCESS_TTL_MS;
    yield* writeCache(path, file, {
      schemaVersion: 1,
      entries: {
        ...cache.entries,
        [key]: { checkedAt: now, expiresAt: now + ttl, verdict },
      },
    });
  }
  return { verdict, cached: false } satisfies CheckResult;
});
