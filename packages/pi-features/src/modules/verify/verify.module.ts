/** One mechanical check failure: which field broke, and why. */
export interface Issue {
  readonly field: string;
  readonly message: string;
}

/** Mechanical verification outcome for one file or tree. */
export interface Result {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Issue>;
}

/**
 * Build one issue.
 * @param field - the field, path, or pseudo-key that failed
 * @param message - what is wrong and what the correct shape is
 * @returns the issue
 */
export const issue = (field: string, message: string): Issue => ({ field, message });

/**
 * True when `body` has a level-2 heading exactly equal to `heading`.
 * @param body - markdown body (frontmatter already stripped)
 * @param heading - heading text without the `## `
 * @returns true when the heading is present
 */
export const hasSection = (body: string, heading: string): boolean =>
  new RegExp(`^## ${heading}\\s*$`, 'm').test(body);

/**
 * One generic verify status line for a detail panel, verdict first.
 * @param result - a verification result
 * @returns one status line
 */
export const infoLine = (result: Result): string => {
  if (result.valid) return '\u2713 verified';
  const count = result.issues.length;
  return `\u2717 not verified \u2014 ${count} issue${count === 1 ? '' : 's'}`;
};
