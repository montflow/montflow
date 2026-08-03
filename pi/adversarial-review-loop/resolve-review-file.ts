import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

/**
 * Resolve the standalone review file path under `.agents/reviews/<name>/`.
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
 * @param {string} reviewName `<name>` segment of `.agents/reviews/<name>/`
 * @param {boolean} fresh Allocate a new code instead of reusing the highest
 * @returns The absolute review file path
 */
export const resolveReviewFile = (
  cwd: string,
  reviewName: string,
  fresh: boolean,
): Effect.Effect<string, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const path = yield* Path;

    const dir = path.join(cwd, '.agents/reviews', reviewName);
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
