import Fuse from 'fuse.js';

/**
 * Structural skill row the filter runs over. The skills service's
 * `SkillSummary` satisfies this — no module-to-service import needed.
 */
export interface Filterable {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/** Lowercased searchable fields of one row. */
const fieldsOf = (row: Filterable): ReadonlyArray<string> => [
  row.name.toLowerCase(),
  row.id.toLowerCase(),
  row.description.toLowerCase(),
];

/**
 * Gappy subsequence test: every needle char appears in the haystack in
 * order. Catches sparse fragments (`ckpa` → `Cooking Pasta`) that
 * Fuse's bitap scoring rejects. Both sides arrive lowercased.
 * @param haystack - lowercased text to search
 * @param needle - lowercased trimmed query
 * @returns true when the chars appear in order
 */
const matchesSubsequence = (haystack: string, needle: string): boolean => {
  let position = 0;
  for (const char of needle) {
    position = haystack.indexOf(char, position);
    if (position === -1) return false;
    position++;
  }
  return true;
};

/**
 * Fuse index over skill rows: name carries the most weight, then id,
 * then description. Typo-tolerant and location-independent — `psta`
 * finds `Cooking Pasta`, `tset` still finds `Effect Testing`. Runs
 * loose on purpose: precision comes from the tier order in
 * {@link filterByQuery}, not the threshold.
 * @param rows - skill rows to index
 * @returns Fuse index over the rows
 */
const indexFor = <T extends Filterable>(rows: ReadonlyArray<T>): Fuse<T> =>
  new Fuse(rows, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'id', weight: 1 },
      { name: 'description', weight: 0.2 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
  });

/**
 * Single-label Fuse hit: typo-tolerant, case-insensitive.
 * @param label - text to search
 * @param needle - trimmed query
 * @returns true on a Fuse hit
 */
const matchesFuse = (label: string, needle: string): boolean =>
  new Fuse([label], { threshold: 0.4, ignoreLocation: true }).search(needle).length > 0;

/**
 * True when a single label matches the query: exact substring first,
 * then Fuse typo-tolerant hit, then gappy subsequence fallback. Empty
 * query matches everything. The workspace TUI owns this Fuse-based
 * search; the pi-skills extension keeps a zero-dep subsequence matcher.
 * @param label - text to search
 * @param query - raw user query
 * @returns true when the label matches
 */
export const matchesFilter = (label: string, query: string): boolean => {
  const needle = query.trim();
  if (needle === '') return true;
  const lowerLabel = label.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  return (
    lowerLabel.includes(lowerNeedle) ||
    matchesFuse(label, needle) ||
    matchesSubsequence(lowerLabel, lowerNeedle)
  );
};

/**
 * Keep rows matching the query in tiers: exact-substring hits first
 * (ranked best-first, so `test` finds only `Effect Testing` — never a
 * fuzzy `timing` lookalike), then Fuse typo hits when nothing matches
 * exactly, then gappy subsequence leftovers. Empty query keeps
 * everything in original order.
 * @param rows - skill rows
 * @param query - raw user query
 * @returns matching rows, ranked
 */
export const filterByQuery = <T extends Filterable>(
  rows: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<T> => {
  const needle = query.trim();
  if (needle === '') return rows;
  const lower = needle.toLowerCase();
  const exact = rows.filter((row) => fieldsOf(row).some((field) => field.includes(lower)));
  if (exact.length > 0)
    return indexFor(exact)
      .search(needle)
      .map((hit) => hit.item);
  const fuzzy = indexFor(rows)
    .search(needle)
    .map((hit) => hit.item);
  if (fuzzy.length > 0) return fuzzy;
  return rows.filter((row) => fieldsOf(row).some((field) => matchesSubsequence(field, lower)));
};
