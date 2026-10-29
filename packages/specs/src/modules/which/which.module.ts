/**
 * Mechanical answer to "which spec am I working on?".
 *
 * The module is pure: git metadata arrives as text, spec candidates arrive as
 * directory names, and the resolver returns one name, one coded miss, or one
 * ambiguity. Reading `.git`/`HEAD` off disk belongs to the caller (the `cli`
 * app for the `which` verb and the host tool), so `execute` and every other
 * consumer share this exact matching rule instead of restating it.
 */

// ─── Branch contract ──────────────────────────────────────────────────

/** Conventional branch prefixes the resolver accepts, lowercase only. */
export const PREFIXES = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'perf',
  'build',
  'ci',
  'release',
  'hotfix',
] as const;

/** A conventional branch prefix. */
export type Prefix = (typeof PREFIXES)[number];

/** `<prefix>/<feature-name>`; the feature is everything after the first `/`. */
export const BRANCH_PATTERN = new RegExp(`^(?:${PREFIXES.join('|')})/(.+)$`);

/** File that marks a directory as a spec, not a stray folder. */
export const SPEC_FILE = 'SPEC.md';

/** Display value for a checkout that carries no branch. */
export const NO_BRANCH = 'none';

/** `HEAD` names a branch through this ref namespace; anything else is no branch. */
const HEADS_PREFIX = 'refs/heads/';

/** Prefix of the `HEAD` line that names a ref instead of a commit. */
const HEAD_REF_PREFIX = 'ref:';

/** Prefix of the `.git` file line that names a worktree's git directory. */
const GITDIR_PREFIX = 'gitdir:';

/**
 * Separator a feature name normalizes `/` and `_` into, and the only character
 * a prefix match may stop in front of.
 */
const FEATURE_SEPARATOR = '-';

/** Stable codes for the two match failures. */
export const CODES = {
  noMatch: 'SPEC_NO_MATCH',
  ambiguous: 'SPEC_AMBIGUOUS',
} as const;

/** One stable match-failure code. */
export type WhichCode = (typeof CODES)[keyof typeof CODES];

// ─── Branch parsing ───────────────────────────────────────────────────

/** Why a branch could not be read, when the checkout carries none. */
export type BranchReason = 'detached' | 'missing-git' | 'unreadable-head';

/** What git metadata said about the checked-out branch. */
export type BranchSource =
  | { readonly kind: 'branch'; readonly branch: string }
  | {
      readonly kind: 'none';
      readonly reason: BranchReason;
      /** One-line statement of what was read instead. */
      readonly detail: string;
    };

/** A parsed branch: its normalized feature, or why it was rejected. */
export type BranchParse =
  | { readonly ok: true; readonly feature: string }
  | {
      readonly ok: false;
      /** Why a branch without a conventional prefix was rejected. */
      readonly problem: string;
      /** The accepted branch grammar, for the same diagnostic. */
      readonly expected: string;
    };

/**
 * Normalize a branch remainder or spec name: lowercase, `/` and `_` become `-`.
 * @param value - raw feature name or spec directory name
 * @returns the comparable form
 */
export const normalizeFeature = (value: string): string =>
  value.toLowerCase().replaceAll('/', FEATURE_SEPARATOR).replaceAll('_', FEATURE_SEPARATOR);

/**
 * Parse a branch as `<prefix>/<feature-name>`. The prefix must be one of
 * {@link PREFIXES} in lowercase; the feature is everything after the first `/`.
 * @param branch - checked-out branch name, e.g. `feat/ship-login`
 * @returns the normalized feature, or the reason the branch has no prefix
 */
export const parseBranch = (branch: string): BranchParse => {
  const matched = BRANCH_PATTERN.exec(branch);
  const remainder = matched === null ? undefined : matched[1];
  if (remainder === undefined || remainder.trim() === '') {
    return {
      ok: false,
      problem: `Branch '${branch}' does not start with a conventional prefix.`,
      expected: `a lowercase prefix (${PREFIXES.join(', ')}) followed by '/<feature-name>'`,
    };
  }
  return { ok: true, feature: normalizeFeature(remainder) };
};

/**
 * Read the branch out of `HEAD` contents. `ref: refs/heads/<branch>` is a
 * branch; a bare commit, a tag ref, or any other ref resolves to no branch.
 * @param text - raw `<gitdir>/HEAD` contents
 * @returns the branch, or why there is none
 */
export const parseHead = (text: string): BranchSource => {
  const line = text.trim();
  if (line === '') {
    return { kind: 'none', reason: 'unreadable-head', detail: 'HEAD is empty.' };
  }
  if (!line.startsWith(HEAD_REF_PREFIX)) {
    return {
      kind: 'none',
      reason: 'detached',
      detail: `HEAD is detached at ${line.slice(0, 12)}; no branch is checked out.`,
    };
  }
  const ref = line.slice(HEAD_REF_PREFIX.length).trim();
  if (!ref.startsWith(HEADS_PREFIX)) {
    return {
      kind: 'none',
      reason: 'detached',
      detail: `HEAD points at '${ref}', which is not a branch.`,
    };
  }
  return { kind: 'branch', branch: ref.slice(HEADS_PREFIX.length) };
};

/**
 * Read the git directory out of a `.git` file (the worktree and submodule
 * form). A relative `gitdir:` resolves against the workspace that holds it.
 * @param text - raw `.git` file contents
 * @param workspace - directory the `.git` file lives in
 * @returns the git directory, or undefined when the file names none
 */
export const parseGitFile = (text: string, workspace: string): string | undefined => {
  const line = text
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.startsWith(GITDIR_PREFIX));
  if (line === undefined) return undefined;
  const target = line.slice(GITDIR_PREFIX.length).trim();
  if (target === '') return undefined;
  if (target.startsWith('/')) return target;
  const base = workspace.replace(/\/+$/, '');
  return base === '' ? target : `${base}/${target}`;
};

// ─── Matching ─────────────────────────────────────────────────────────

/**
 * One name is a prefix of the other *ending on a segment boundary*: the shorter
 * name must stop exactly where the longer one continues after a `-`. A bare
 * substring prefix is not a match, because `feat/s` would otherwise name every
 * spec whose name starts with `s` and `feat/fix` every `fixture-*` spec. A
 * whole-name prefix that ends mid-word (`spec` in `special-case`) is a different
 * word, not a shortening of it.
 */
const isPrefixPair = (feature: string, name: string): boolean => {
  const [shorter, longer] = feature.length <= name.length ? [feature, name] : [name, feature];
  return longer.startsWith(shorter) && longer.charAt(shorter.length) === FEATURE_SEPARATOR;
};

/** What a feature name matched among the candidate spec names. */
export type MatchRead =
  | { readonly ok: true; readonly name: string }
  | {
      readonly ok: false;
      readonly code: WhichCode;
      /** Names an explicit `--name` could use, in directory order. */
      readonly candidates: ReadonlyArray<string>;
    };

/**
 * Match a normalized feature name against spec directory names: an exact
 * normalized name wins, otherwise a unique prefix pair (either direction, ending
 * at a `-` boundary) wins. Zero or two or more candidates fail with a coded
 * miss. There is no fuzzy, edit-distance, keyword, or description matching.
 * @param feature - normalized feature name from the branch
 * @param names - every spec directory name that holds a `SPEC.md`
 * @returns the one match, or the candidate list that stopped it
 */
export const matchFeature = (feature: string, names: ReadonlyArray<string>): MatchRead => {
  const ordered = [...names].toSorted();
  const exact = ordered.filter((name) => normalizeFeature(name) === feature);
  const onlyExact = exact[0];
  if (exact.length === 1 && onlyExact !== undefined) return { ok: true, name: onlyExact };
  if (exact.length > 1) return { ok: false, code: CODES.ambiguous, candidates: exact };

  const prefixed = ordered.filter((name) => isPrefixPair(feature, normalizeFeature(name)));
  const onlyPrefixed = prefixed[0];
  if (prefixed.length === 1 && onlyPrefixed !== undefined) {
    return { ok: true, name: onlyPrefixed };
  }
  if (prefixed.length > 1) {
    return { ok: false, code: CODES.ambiguous, candidates: prefixed };
  }
  return { ok: false, code: CODES.noMatch, candidates: ordered };
};

// ─── Resolution ───────────────────────────────────────────────────────

/** A resolution request: what git said, and which spec names exist. */
export interface WhichRequest {
  readonly source: BranchSource;
  /** Every spec directory name that holds a {@link SPEC_FILE}. */
  readonly names: ReadonlyArray<string>;
}

/** One coded, agent-facing match failure. */
export interface WhichMiss {
  readonly code: WhichCode;
  readonly problem: string;
  readonly expected: string;
  readonly actual: string;
  /** Branch read, or {@link NO_BRANCH}. */
  readonly branch: string;
  /** Spec names an explicit `--name` could use. */
  readonly candidates: ReadonlyArray<string>;
}

/** The one spec a branch names. */
export interface WhichMatch {
  readonly name: string;
  readonly branch: string;
  /** Normalized feature name the branch carried. */
  readonly feature: string;
}

/** Either the one match, or the reason no single spec was named. */
export type WhichResolution =
  | { readonly ok: true; readonly match: WhichMatch }
  | { readonly ok: false; readonly miss: WhichMiss };

/** What a checkout without a branch reports for its source. */
const NO_SOURCE_ACTUAL = {
  detached: 'detached',
  'missing-git': 'missing .git',
  'unreadable-head': 'unreadable HEAD',
} as const;

/** Render a candidate list, naming an empty list instead of omitting it. */
const candidateText = (candidates: ReadonlyArray<string>): string =>
  candidates.length === 0 ? 'none' : candidates.join(', ');

const fail = (miss: WhichMiss): WhichResolution => ({ ok: false, miss });

/**
 * Resolve one branch against the candidate spec names. Every path that cannot
 * name exactly one spec returns a {@link WhichMiss} with the branch read, the
 * candidates, and the repair; nothing throws and nothing guesses.
 * @param request - git metadata plus the spec names that exist
 * @returns the one match, or the coded miss
 */
export const resolve = (request: WhichRequest): WhichResolution => {
  const candidates = [...request.names].toSorted();
  const source = request.source;
  if (source.kind === 'none') {
    return fail({
      code: CODES.noMatch,
      problem: source.detail,
      expected: `a branch shaped <prefix>/<feature-name> (${PREFIXES.join(', ')})`,
      actual: `${NO_SOURCE_ACTUAL[source.reason]} · branch ${NO_BRANCH} · candidates ${candidateText(candidates)}`,
      branch: NO_BRANCH,
      candidates,
    });
  }

  const parsed = parseBranch(source.branch);
  if (!parsed.ok) {
    return fail({
      code: CODES.noMatch,
      problem: parsed.problem,
      expected: parsed.expected,
      actual: `${source.branch} · candidates ${candidateText(candidates)}`,
      branch: source.branch,
      candidates,
    });
  }

  const matched = matchFeature(parsed.feature, candidates);
  if (matched.ok) {
    return {
      ok: true,
      match: { name: matched.name, branch: source.branch, feature: parsed.feature },
    };
  }
  const ambiguous = matched.code === CODES.ambiguous;
  return fail({
    code: matched.code,
    problem: ambiguous
      ? `Feature '${parsed.feature}' from branch '${source.branch}' matches ${matched.candidates.length} specs.`
      : `No spec matches feature '${parsed.feature}' from branch '${source.branch}'.`,
    expected: 'exactly one spec name equal to the feature, or a prefix of it ending at a "-"',
    actual: `${source.branch} · candidates ${candidateText(matched.candidates)}`,
    branch: source.branch,
    candidates: matched.candidates,
  });
};
