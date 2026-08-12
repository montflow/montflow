import { realpathSync } from 'node:fs';
import { Data, Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { isValidPresetName } from './preset-store';

/** Error raised when a review name/path escapes `.agents/@montflow/reviews/`. */
export class ReviewPathError extends Data.TaggedError('ReviewPathError')<{
  readonly message: string;
}> {}

/**
 * Absolute root of the reviews directory: `<cwd>/.agents/@montflow/reviews`.
 * @param {Path} path The Path service
 * @param {string} cwd Working directory
 * @returns The absolute reviews root path
 */
export const reviewsRoot = (path: Path, cwd: string): string =>
  path.resolve(cwd, '.agents', '@montflow', 'reviews');

/**
 * Resolve `p` to its real path, following symlinks. When a leaf on the path
 * does not exist yet (e.g. a fresh review file that `ensureStateDirs` has
 * not created), `realpathSync` throws ENOENT — in that case resolve the
 * deepest existing ancestor and re-append the missing suffix, so a symlinked
 * parent is still followed. Falls back to the lexical path only when no
 * ancestor exists at all.
 * @param {Path} path The Path service
 * @param {string} p Path to resolve
 * @returns The real path, or the lexical path when nothing exists
 */
const resolveRealOrLexical = (path: Path, p: string): string => {
  const suffix: string[] = [];
  let current = p;
  for (;;) {
    try {
      return path.join(realpathSync(current), ...suffix.toReversed());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p; // reached the fs root — give up
      suffix.push(path.basename(current));
      current = parent;
    }
  }
};

/**
 * True when `candidate` resolves to a path inside `<cwd>/.agents/@montflow/reviews`
 * (or equal to it). Blocks path traversal (`../`), absolute paths that
 * escape the reviews directory, and symlinked parents: both the root and the
 * candidate are resolved to their real paths (`resolveRealOrLexical`) before
 * the containment comparison, so `<cwd>/.agents/@montflow/reviews/link/001.md` with
 * `link` → `/etc` is rejected even when `/etc/001.md` does not exist yet,
 * and a reviews root that is itself a symlink is compared by its real
 * target.
 * @param {Path} path The Path service
 * @param {string} cwd Working directory
 * @param {string} candidate Path to check
 * @returns True when the resolved path is contained under the reviews root
 */
export const isWithinReviews = (path: Path, cwd: string, candidate: string): boolean => {
  const root = reviewsRoot(path, cwd);
  const resolved = path.resolve(candidate);
  const realRoot = resolveRealOrLexical(path, root);
  const realCandidate = resolveRealOrLexical(path, resolved);
  return realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep);
};

/**
 * Resolve the standalone review file path under `.agents/@montflow/reviews/<name>/`.
 * - If the directory exists and contains `.md` files and `fresh` is false,
 *   reuse the highest existing numeric code (re-review, overwrite in place).
 * - Otherwise start at the next unused code (`001` if new, else highest+1).
 *
 * Extracts the numeric portion of a review filename. The regex matches the
 * first digit run that is followed by optional non-dot chars and `.md`, so
 * `001-review.md`, `review-001.md`, and `SPEC_001.md` all yield `001`. For
 * multi-numbered names like `001-v2.md` the FIRST run (`001`) is used — if
 * you need the last run, swap to `(\d+)(?=[^.]*\.md$)`.
 *
 * Defensive: a missing or unreadable reviews directory resolves to `001.md`
 * (fresh review) rather than failing the loop before it starts.
 *
 * @param {string} cwd Working directory the review belongs to
 * @param {string} reviewName `<name>` segment of `.agents/@montflow/reviews/<name>/`
 * @param {boolean} fresh Allocate a new code instead of reusing the highest
 * @returns The absolute review file path, or ReviewPathError for names that
 *   would escape `.agents/@montflow/reviews/` (e.g. `../escape`, absolute paths)
 */
export const resolveReviewFile = (
  cwd: string,
  reviewName: string,
  fresh: boolean,
): Effect.Effect<string, ReviewPathError, FileSystem | Path> =>
  Effect.gen(function* () {
    if (!isValidPresetName(reviewName)) {
      return yield* Effect.fail(
        new ReviewPathError({
          message: `Invalid review name '${reviewName}': must match [a-zA-Z0-9][a-zA-Z0-9._-]* (no path separators, spaces, or '..')`,
        }),
      );
    }
    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    const dir = path.join(cwd, '.agents/@montflow/reviews', reviewName);
    const dirExists = yield* fileSystem
      .exists(dir)
      .pipe(Effect.orElseSucceed(() => false));

    // Ensure the reviews directory exists before returning a path — the
    // reviewer agent write tool may not create parent directories.
    if (!dirExists) {
      yield* fileSystem
        .makeDirectory(dir, { recursive: true })
        .pipe(Effect.orElseSucceed(() => undefined));
      return path.join(dir, '001.md');
    }

    const entries = yield* fileSystem
      .readDirectory(dir)
      .pipe(Effect.orElseSucceed((): readonly string[] => []));

    const numbers = entries.flatMap((file) => {
      if (!file.endsWith('.md')) return [];
      const match = file.match(/(\d+)(?:[^.]*)?\.md$/);
      const digits = match?.[1];
      return digits === undefined ? [] : [parseInt(digits, 10)];
    });

    if (numbers.length === 0) return path.join(dir, '001.md');

    const highest = Math.max(...numbers);
    const code = fresh ? highest + 1 : highest;
    return path.join(dir, `${String(code).padStart(3, '0')}.md`);
  });
