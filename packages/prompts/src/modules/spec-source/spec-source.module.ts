/** Derived state of one spec as the prompt picker needs it. */
export type SpecState = 'pending' | 'complete';

/** One spec directory the picker can offer as a variable value. */
export interface SpecEntry {
  /** Spec directory slug under `.agents/@montflow/specs`. */
  readonly name: string;
  /** `complete` only when `SPEC.md` says so; everything else is still runnable. */
  readonly state: SpecState;
}

/** Conventional branch prefixes a spec branch may carry. */
const BRANCH_PREFIXES = [
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

const normalizeFeature = (value: string): string =>
  value.toLowerCase().replaceAll('/', '-').replaceAll('_', '-');

/**
 * Pick the one spec the branch names: `feat/<spec>` matches a spec whose
 * normalized name equals, ends with, or starts with `<spec>`. Ambiguity returns
 * `undefined`, because a wrong guess is worse than no guess.
 * @param names - every spec slug the picker found
 * @param branch - current branch name, such as `feat/spec-standard`
 * @returns the matching spec slug, or undefined when the match is not certain
 */
export const guess = (names: ReadonlyArray<string>, branch: string): string | undefined => {
  const remainder = new RegExp(`^(?:${BRANCH_PREFIXES.join('|')})/(.+)$`, 'u').exec(branch)?.[1];
  if (remainder === undefined || remainder.trim() === '') return undefined;
  const feature = normalizeFeature(remainder);
  const exact = names.filter((name) => normalizeFeature(name) === feature);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const suffixed = names.filter((name) => normalizeFeature(name).endsWith(feature));
  if (suffixed.length === 1) return suffixed[0];
  if (suffixed.length > 1) return undefined;
  const prefixed = names.filter((name) => {
    const normalized = normalizeFeature(name);
    return normalized.startsWith(feature) || feature.startsWith(normalized);
  });
  return prefixed.length === 1 ? prefixed[0] : undefined;
};

/**
 * Read the `status` field out of a `SPEC.md` frontmatter block. A missing or
 * unreadable status is treated as `pending`, because an unfinished spec is the
 * safer default: it stays executable and stays above the completed specs.
 * @param markdown - raw `SPEC.md` contents
 * @returns the spec's declared state
 */
export const parseState = (markdown: string): SpecState => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown)?.[1];
  if (frontmatter === undefined) return 'pending';
  const status = /^status:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim();
  return status === 'complete' ? 'complete' : 'pending';
};

/**
 * Order specs for the picker: the branch guess first (so it is preselected),
 * then every pending spec, then every completed spec. Names break ties so the
 * list stays stable between openings.
 * @param entries - every spec the picker found
 * @param current - spec matching the current branch, when the match is certain
 * @returns a new array in display order
 */
export const order = (
  entries: ReadonlyArray<SpecEntry>,
  current?: string | undefined,
): ReadonlyArray<SpecEntry> => {
  const rank = (entry: SpecEntry): number => {
    if (entry.name === current) return 0;
    return entry.state === 'pending' ? 1 : 2;
  };
  return entries.toSorted(
    (left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name),
  );
};

/**
 * One-line description under a spec row, readable without colour.
 * @param entry - the spec shown
 * @param current - spec matching the current branch, when the match is certain
 * @returns the row description
 */
export const describe = (entry: SpecEntry, current?: string | undefined): string => {
  const parts: Array<string> = [];
  if (entry.name === current) parts.push('current branch');
  parts.push(entry.state === 'complete' ? 'complete — nothing left to run' : 'pending');
  return parts.join(' · ');
};
