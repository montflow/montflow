/** The five private CLIs that share one version and one fixed group. */
export const CLIS = [
  '@montflow/skills',
  '@montflow/specs',
  '@montflow/prompts',
  '@montflow/profiles',
  '@montflow/reviews',
] as const;

/** Sentence every CLI CHANGELOG must carry about releases versus checkouts. */
export const CHANGELOG_MARKER =
  'Releases: this package is versioned and tagged by changesets but never published to npm';
