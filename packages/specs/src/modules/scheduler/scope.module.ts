/**
 * Scope, lane, and command primitives shared by the gate verifier and the
 * scheduler. Leaf module: it imports nothing, so both sides can depend on it
 * without a cycle.
 */

/** The universal scope token: the whole workspace. */
export const REPO_SCOPE = 'repo';

/** A gate lane: heavy runs are bounded, light ones only count toward in-flight. */
export const GATE_LANES = ['heavy', 'light'] as const;

/** A gate lane. */
export type GateLane = (typeof GATE_LANES)[number];

/** True when a declared value is a lane. */
export const isGateLane = (value: string): value is GateLane =>
  GATE_LANES.some((lane) => lane === value);

/** True when a token is a C2 write-scope or a C3 gate scope. */
export const isScopeToken = (token: string): boolean => {
  if (token === REPO_SCOPE || token === '.') return true;
  if (token === '' || token.startsWith('/') || /\s/.test(token)) return false;
  if (/[*?[\]{}]/.test(token)) return false;
  const trimmed = token.endsWith('/') ? token.slice(0, -1) : token;
  if (trimmed === '' || trimmed.startsWith('/')) return false;
  return !trimmed.split('/').some((segment) => segment === '..' || segment === '');
};

/** True when every token of a comma-separated scope list is valid. */
export const isScopeList = (text: string): boolean =>
  text
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .every((token) => isScopeToken(token));

/**
 * Normalize one scope list: `.` and a phase-boundary scope become `repo`,
 * duplicates and order never enter the run key.
 * @param tokens - scope tokens
 * @returns sorted unique workspace-relative scopes
 */
export const normalizeScopeList = (tokens: ReadonlyArray<string>): ReadonlyArray<string> => {
  const normalized = new Set<string>();
  for (const raw of tokens) {
    const token = raw.trim().replace(/\/+$/, '');
    if (token === '') continue;
    normalized.add(token === '.' ? REPO_SCOPE : token);
  }
  return [...normalized].toSorted((left, right) => left.localeCompare(right));
};

/** A scope token that means the task writes nothing. */
export const isNoneScope = (tokens: ReadonlyArray<string>): boolean =>
  tokens.length === 1 && tokens[0] === 'none';

/**
 * True when `outer` covers `inner`: the same path, `repo`, or a parent path at a
 * `/` boundary.
 */
export const coversToken = (outer: string, inner: string): boolean =>
  outer === inner || outer === REPO_SCOPE || inner.startsWith(`${outer}/`);

/** True when one scope list contains the other. */
export const scopeContains = (
  outer: ReadonlyArray<string>,
  inner: ReadonlyArray<string>,
): boolean =>
  isNoneScope(inner)
    ? isNoneScope(outer)
    : !isNoneScope(outer) &&
      inner.every((token) => outer.some((cover) => coversToken(cover, token)));

/** True when two scope lists name any shared path. `none` never overlaps. */
export const scopesOverlap = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  !isNoneScope(left) &&
  !isNoneScope(right) &&
  left.some((a) => right.some((b) => coversToken(a, b) || coversToken(b, a)));

/**
 * Split a comma-separated scope list and normalize it.
 * @param text - comma-separated scopes
 * @returns sorted unique workspace-relative scopes
 */
export const normalizeScopes = (text: string): ReadonlyArray<string> =>
  normalizeScopeList(text.split(','));

/** Collapse every whitespace run to one space, so formatting never changes a key. */
export const normalizeCommand = (command: string): string => command.trim().replace(/\s+/g, ' ');
