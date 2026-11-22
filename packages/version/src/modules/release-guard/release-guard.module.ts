/** The seven private CLIs that share one version and one fixed group. */
export const CLIS = [
  '@montflow/skills',
  '@montflow/prompts',
  '@montflow/profiles',
  '@montflow/reviews',
  '@montflow/references',
  '@montflow/principles',
  '@montflow/playbooks',
] as const;

/** Sentence every CLI CHANGELOG must carry about releases versus checkouts. */
export const CHANGELOG_MARKER =
  'Releases: this package is versioned and tagged by changesets but never published to npm';
