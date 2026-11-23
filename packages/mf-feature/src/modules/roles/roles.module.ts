import { Result, Schema } from 'effect';

/**
 * Roles: which harness and model run each kind of delegated work.
 *
 * Pure: no IO. A role is a list of seats; a seat is an ordered list of
 * candidates; a candidate is a harness, a model, and an optional effort. The
 * first candidate whose harness is available wins its seat. The file lives at
 * `<root>/.agents/@montflow/feature/roles.json` and is per user (git-ignored).
 */

/** Harnesses a candidate can name. */
export const HARNESSES = ['claude-code', 'codex', 'opencode', 'pi'] as const;
export type Harness = (typeof HARNESSES)[number];

/** The executable each harness ships, probed on `PATH` for availability. */
export const BINARIES = {
  'claude-code': 'claude',
  codex: 'codex',
  opencode: 'opencode',
  pi: 'pi',
} as const satisfies Record<Harness, string>;

/** Every role mf-feature's skills and playbooks name. */
export const ROLES = [
  'feature',
  'bug-fix',
  'perf-issue',
  'hillclimb',
  'judgment',
  'swarm-workers',
  'arena-runners',
  'arena-judges',
  'interrogate-reviewers',
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that hold several seats (a panel); every other role holds one. */
export const PANELS: ReadonlyArray<Role> = [
  'arena-runners',
  'arena-judges',
  'interrogate-reviewers',
];

/** Store location under the workspace root. */
export const STORE_DIR = ['.agents', '@montflow', 'feature'] as const;
export const FILE = 'roles.json';
export const VERSION = 1;

/** Effort levels each harness accepts; `variant` means provider-defined (OpenCode's `#variant`). */
export const EFFORTS = {
  'claude-code': ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  opencode: 'variant',
  pi: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
} as const satisfies Record<Harness, ReadonlyArray<string> | 'variant'>;

/** Every effort word any harness lists; used to split a candidate spec. */
const EFFORT_WORDS: ReadonlySet<string> = new Set(
  HARNESSES.flatMap((harness) => {
    const levels = EFFORTS[harness];
    return levels === 'variant' ? [] : [...levels];
  }),
);

export const Candidate = Schema.Struct({
  harness: Schema.Literals(HARNESSES),
  model: Schema.NonEmptyString,
  effort: Schema.optional(Schema.NonEmptyString),
});
export type Candidate = typeof Candidate.Type;

export const Seat = Schema.Array(Candidate);
export type Seat = typeof Seat.Type;

export const RolesFile = Schema.Struct({
  version: Schema.Literal(VERSION),
  roles: Schema.Record(Schema.String, Schema.Array(Seat)),
});
export type RolesFile = typeof RolesFile.Type;

/** The file's JSON text, decoded with every structural issue reported. */
export const FromJson = Schema.fromJsonString(RolesFile);

export const EMPTY: RolesFile = { version: VERSION, roles: {} };

export const isHarness = (value: string): value is Harness =>
  HARNESSES.some((harness) => harness === value);

export const isRole = (value: string): value is Role => ROLES.some((role) => role === value);

export const isPanel = (role: Role): boolean => PANELS.includes(role);

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning';

export interface Issue {
  /** Where in the file: `roles.bug-fix[1][2].model` (seats and candidates count from 1). */
  readonly path: string;
  readonly message: string;
  readonly severity: Severity;
}

const error = (path: string, message: string): Issue => ({ path, message, severity: 'error' });
const warning = (path: string, message: string): Issue => ({ path, message, severity: 'warning' });

export const errorCount = (issues: ReadonlyArray<Issue>): number =>
  issues.filter((issue) => issue.severity === 'error').length;

const CLAUDE_ALIASES: ReadonlyArray<string> = ['opus', 'sonnet', 'haiku', 'fable'];
const CLAUDE_ID = /^claude-[a-z0-9.-]+(\[1m\])?$/;
const OPENAI_ID = /^(gpt-|o\d|codex-)[a-z0-9.-]*$/;
const PROVIDER_MODEL = /^[a-z0-9._-]+\/[^\s#/][^\s#]*$/i;
const VARIANT = /^[a-z0-9-]+$/;

/**
 * Why a harness rejects a model id, if it does.
 * @param harness - the candidate's harness
 * @param model - the candidate's model
 * @returns undefined when accepted, else the reason
 */
export const modelProblem = (harness: Harness, model: string): string | undefined => {
  switch (harness) {
    case 'claude-code':
      return CLAUDE_ALIASES.includes(model) || CLAUDE_ID.test(model)
        ? undefined
        : `claude-code runs Anthropic models only: ${CLAUDE_ALIASES.join(', ')} or a claude-* id, not '${model}'.`;
    case 'codex':
      return OPENAI_ID.test(model)
        ? undefined
        : `codex runs OpenAI models only (gpt-*, o*, codex-*), not '${model}'.`;
    case 'opencode':
    case 'pi':
      return PROVIDER_MODEL.test(model)
        ? undefined
        : `${harness} takes provider/model (such as openai/gpt-5.5), not '${model}'. Put the effort in "effort", not after '#'.`;
  }
};

/**
 * Why a harness rejects an effort level, if it does.
 * @param harness - the candidate's harness
 * @param effort - the candidate's effort
 * @returns undefined when accepted, else the reason
 */
export const effortProblem = (harness: Harness, effort: string): string | undefined => {
  const levels = EFFORTS[harness];
  if (levels === 'variant') {
    return VARIANT.test(effort) ? undefined : `'${effort}' is not a variant name.`;
  }
  return levels.some((level) => level === effort)
    ? undefined
    : `${harness} takes effort ${levels.join(', ')}, not '${effort}'.`;
};

const checkCandidate = (path: string, candidate: Candidate): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  const model = modelProblem(candidate.harness, candidate.model);
  if (model !== undefined) issues.push(error(`${path}.model`, model));
  if (candidate.effort !== undefined) {
    const effort = effortProblem(candidate.harness, candidate.effort);
    if (effort !== undefined) issues.push(error(`${path}.effort`, effort));
  }
  return issues;
};

const checkSeat = (path: string, seat: Seat): ReadonlyArray<Issue> => {
  if (seat.length === 0) return [error(path, 'A seat is a non-empty, ordered list of candidates.')];
  const issues = seat.flatMap((candidate, index) =>
    checkCandidate(`${path}[${index + 1}]`, candidate),
  );
  const harnesses = seat.map((candidate) => candidate.harness);
  const repeated = new Set(
    harnesses.filter((harness, index) => harnesses.indexOf(harness) !== index),
  );
  for (const harness of repeated) {
    issues.push(
      warning(path, `'${harness}' appears twice; only its first candidate can ever win.`),
    );
  }
  return issues;
};

/**
 * The semantic checks a decoded file must pass: known roles, one seat for a
 * non-panel role, and every model and effort accepted by its harness.
 * @param file - a structurally valid roles file
 * @returns every issue, errors and warnings
 */
export const check = (file: RolesFile): ReadonlyArray<Issue> =>
  Object.entries(file.roles).flatMap(([role, seats]): ReadonlyArray<Issue> => {
    const path = `roles.${role}`;
    if (!isRole(role)) return [error(path, `Unknown role. Roles are ${ROLES.join(', ')}.`)];
    if (seats.length === 0) return [error(path, 'A role is a non-empty list of seats.')];
    const seatCount =
      !isPanel(role) && seats.length > 1
        ? [error(path, `'${role}' is not a panel; it holds exactly one seat.`)]
        : [];
    return [
      ...seatCount,
      ...seats.flatMap((seat, index) => checkSeat(`${path}[${index + 1}]`, seat)),
    ];
  });

/** `["roles"]["x"][0][1]["model"]` as `roles.x[1][2].model`. */
const pathOf = (schemaPath: string): string =>
  schemaPath
    .replaceAll(/\["([^"]*)"\]/g, '.$1')
    .replaceAll(/\[(\d+)\]/g, (_match, index: string) => `[${Number(index) + 1}]`)
    .replace(/^\./, '');

/** Split a schema error message into one issue per `Expected …` / `at …` block. */
const schemaIssues = (message: string): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  const lines = message.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const text = (lines[index] ?? '').trim();
    if (text.length === 0) continue;
    const next = (lines[index + 1] ?? '').trim();
    if (next.startsWith('at ')) {
      issues.push(error(pathOf(next.slice(3)), `${text}.`));
      index += 1;
    } else {
      issues.push(error('$', `${text}.`));
    }
  }
  return issues;
};

/** A decoded file (undefined when it has any error) and every issue found. */
export interface Decoded {
  readonly file: RolesFile | undefined;
  readonly issues: ReadonlyArray<Issue>;
}

/**
 * Decode raw file text: structure first (Schema, every issue, no unknown
 * fields), then the semantic checks.
 * @param raw - the file's bytes
 * @returns the file when it has no error, plus every issue
 */
export const decode = (raw: string): Decoded => {
  const result = Schema.decodeUnknownResult(FromJson)(raw, {
    onExcessProperty: 'error',
    errors: 'all',
  });
  if (Result.isFailure(result))
    return { file: undefined, issues: schemaIssues(result.failure.message) };
  const issues = check(result.success);
  return { file: errorCount(issues) === 0 ? result.success : undefined, issues };
};

/** The file's bytes: two-space JSON plus a trailing newline. */
export const encode = (file: RolesFile): string => `${JSON.stringify(file, null, 2)}\n`;

// ---------------------------------------------------------------------------
// Specs: `harness:model[:effort]`, the one-line form `set` reads and `show` prints
// ---------------------------------------------------------------------------

/** A parse that either succeeded or says why not. */
export type Parsed<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly reason: string };

const parsed = <A>(value: A): Parsed<A> => ({ ok: true, value });
const refused = <A>(reason: string): Parsed<A> => ({ ok: false, reason });

/**
 * Parse one candidate spec, `harness:model[:effort]`. The effort is split off
 * only when the last segment is an effort word, so a model may contain `:`.
 * @param spec - such as `claude-code:opus:xhigh` or `opencode:openai/gpt-5.5`
 * @returns the candidate, or why it does not parse
 */
export const parseCandidate = (spec: string): Parsed<Candidate> => {
  const at = spec.indexOf(':');
  if (at <= 0) return refused(`'${spec}' is not harness:model[:effort].`);
  const harness = spec.slice(0, at);
  if (!isHarness(harness))
    return refused(`'${harness}' is not a harness (${HARNESSES.join(', ')}).`);
  const rest = spec.slice(at + 1);
  const last = rest.lastIndexOf(':');
  const tail = last === -1 ? '' : rest.slice(last + 1);
  if (last !== -1 && EFFORT_WORDS.has(tail)) {
    return parsed({ harness, model: rest.slice(0, last), effort: tail });
  }
  return rest.length === 0 ? refused(`'${spec}' has no model.`) : parsed({ harness, model: rest });
};

/**
 * Parse one seat spec: candidates in preference order, comma-separated.
 * @param spec - such as `claude-code:opus:xhigh,codex:gpt-5.5:high`
 * @returns the seat, or the first reason a candidate does not parse
 */
export const parseSeat = (spec: string): Parsed<Seat> => {
  const candidates: Array<Candidate> = [];
  for (const part of spec.split(',')) {
    const candidate = parseCandidate(part.trim());
    if (!candidate.ok) return refused(candidate.reason);
    candidates.push(candidate.value);
  }
  return parsed(candidates);
};

export const formatCandidate = (candidate: Candidate): string =>
  [
    candidate.harness,
    candidate.model,
    ...(candidate.effort === undefined ? [] : [candidate.effort]),
  ].join(':');

export const formatSeat = (seat: Seat): string => seat.map(formatCandidate).join(',');

/**
 * Replace one role's seats.
 * @param file - the current file
 * @param role - the role to set
 * @param seats - its seats, in order
 * @returns the new file
 */
export const setRole = (file: RolesFile, role: Role, seats: ReadonlyArray<Seat>): RolesFile => ({
  version: VERSION,
  roles: { ...file.roles, [role]: seats },
});

/**
 * Remove one role, so it falls back to mf-feature's defaults.
 * @param file - the current file
 * @param role - the role to remove
 * @returns the new file
 */
export const unsetRole = (file: RolesFile, role: Role): RolesFile => ({
  version: VERSION,
  roles: Object.fromEntries(Object.entries(file.roles).filter(([name]) => name !== role)),
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** How one seat runs from the current harness. */
export type Run = 'native' | 'dispatch' | 'dropped';

export interface SkippedCandidate {
  readonly candidate: Candidate;
  readonly reason: string;
}

export interface ResolvedSeat {
  /** 1-based. */
  readonly seat: number;
  readonly run: Run;
  /** The winning candidate; absent when dropped or when the role is unset. */
  readonly candidate?: Candidate | undefined;
  /** Candidates passed over before the winner, with why. */
  readonly skipped: ReadonlyArray<SkippedCandidate>;
}

export interface Resolution {
  readonly role: Role;
  /** `set` from the roles file; `default` falls back to mf-feature's Subagents defaults. */
  readonly source: 'set' | 'default';
  readonly current: Harness;
  readonly seats: ReadonlyArray<ResolvedSeat>;
}

/**
 * Resolve every seat of a role from the current harness. The current harness
 * is always available; another is available when its CLI is installed.
 * @param file - the roles file (verified)
 * @param role - the role to resolve
 * @param current - the harness the caller runs in
 * @param installed - which harness CLIs are on `PATH`
 * @returns one resolved seat per seat in the file, or one native default seat
 */
export const resolve = (
  file: RolesFile,
  role: Role,
  current: Harness,
  installed: (harness: Harness) => boolean,
): Resolution => {
  const seats = file.roles[role];
  if (seats === undefined) {
    return { role, source: 'default', current, seats: [{ seat: 1, run: 'native', skipped: [] }] };
  }
  const resolved = seats.map((seat, index): ResolvedSeat => {
    const skipped: Array<SkippedCandidate> = [];
    for (const candidate of seat) {
      if (candidate.harness === current)
        return { seat: index + 1, run: 'native', candidate, skipped };
      if (installed(candidate.harness))
        return { seat: index + 1, run: 'dispatch', candidate, skipped };
      skipped.push({ candidate, reason: `${BINARIES[candidate.harness]} not installed` });
    }
    return { seat: index + 1, run: 'dropped', skipped };
  });
  return { role, source: 'set', current, seats: resolved };
};

// ---------------------------------------------------------------------------
// Current harness
// ---------------------------------------------------------------------------

/** Set by `mf-feature dispatch` in the child, so a nested session knows its harness. */
export const HARNESS_ENV = 'MF_FEATURE_HARNESS';

/** Environment markers each harness sets for the commands it runs. */
const MARKERS: ReadonlyArray<readonly [Harness, ReadonlyArray<string>]> = [
  ['claude-code', ['CLAUDECODE']],
  [
    'codex',
    ['CODEX_THREAD_ID', 'CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED', 'CODEX_MANAGED_BY_NPM'],
  ],
  ['opencode', ['OPENCODE']],
];

/**
 * Detect the harness the caller runs in, from its environment. `MF_FEATURE_HARNESS`
 * wins; otherwise exactly one harness's markers must be present. Two sets of
 * markers (one harness started inside another by hand) is ambiguous.
 * @param env - the process environment
 * @returns the harness, or why it cannot be told
 */
export const detectHarness = (
  env: Readonly<Record<string, string | undefined>>,
): Parsed<Harness> => {
  const pinned = env[HARNESS_ENV] ?? '';
  if (pinned.length > 0) {
    return isHarness(pinned)
      ? parsed(pinned)
      : refused(`${HARNESS_ENV}='${pinned}' is not a harness.`);
  }
  const present = (key: string): boolean => (env[key] ?? '').length > 0;
  const found = MARKERS.filter(([, keys]) => keys.some(present)).map(([harness]) => harness);
  const [only] = found;
  if (found.length === 1 && only !== undefined) return parsed(only);
  return refused(
    found.length === 0
      ? 'Cannot tell which harness this is.'
      : `Ambiguous harness (${found.join(', ')}).`,
  );
};
