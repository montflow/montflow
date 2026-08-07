import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Result } from 'effect';
import { Path } from 'effect/Path';
import { NodeServices } from '@effect/platform-node';
import { isWithinReviews, resolveReviewFile, ReviewPathError } from '../resolve-review-file';
import { runEffect, runResult, withProjectRoot, type TempDir } from './helpers';

/**
 * Creates a temp directory, runs the async callback, then cleans up.
 * @param {(dir: TempDir) => Promise<void>} callback The test body
 * @returns A promise completing after cleanup
 */
const withTempDir = async (callback: (dir: TempDir) => Promise<void>): Promise<void> => {
  const dir = withProjectRoot({});
  try {
    await callback(dir);
  } finally {
    dir.cleanup();
  }
};

test('resolveReviewFile: non-existent directory creates it and returns 001.md', () =>
  withTempDir(async ({ tmp }) => {
    const result = await runEffect(resolveReviewFile(tmp, 'myreview', false));
    expect(result).toMatch(/\.agents\/reviews\/myreview\/001\.md$/);
    expect(fs.existsSync(path.join(tmp, '.agents/reviews/myreview'))).toBe(true);
  }));

test('resolveReviewFile: empty directory (no .md files) returns 001.md', () =>
  withTempDir(async ({ tmp }) => {
    const dir = path.join(tmp, '.agents/reviews/myreview');
    fs.mkdirSync(dir, { recursive: true });
    const result = await runEffect(resolveReviewFile(tmp, 'myreview', false));
    expect(result).toMatch(/\.agents\/reviews\/myreview\/001\.md$/);
  }));

test('resolveReviewFile: existing reviews reuse highest code (re-review)', () =>
  withTempDir(async ({ tmp }) => {
    const dir = path.join(tmp, '.agents/reviews/myreview');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '001.md'), '# Review 1');
    fs.writeFileSync(path.join(dir, '002.md'), '# Review 2');
    const result = await runEffect(resolveReviewFile(tmp, 'myreview', false));
    expect(result).toMatch(/\.agents\/reviews\/myreview\/002\.md$/);
  }));

test('resolveReviewFile: fresh flag forces next number', () =>
  withTempDir(async ({ tmp }) => {
    const dir = path.join(tmp, '.agents/reviews/myreview');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '001.md'), '# Review 1');
    fs.writeFileSync(path.join(dir, '002.md'), '# Review 2');
    const result = await runEffect(resolveReviewFile(tmp, 'myreview', true));
    expect(result).toMatch(/\.agents\/reviews\/myreview\/003\.md$/);
  }));

test('resolveReviewFile: mixed filenames — regex matches first numeric sequence before .md', () =>
  withTempDir(async ({ tmp }) => {
    const dir = path.join(tmp, '.agents/reviews/myreview');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SPEC_001.md'), '# Spec review 1');
    fs.writeFileSync(path.join(dir, '003-review.md'), '# Review 3');
    // SPEC_001.md → regex /(\d+)(?:[^.]*)?\.md$/ matches "001"
    // 003-review.md → regex matches "003"
    const result = await runEffect(resolveReviewFile(tmp, 'myreview', false));
    expect(result).toMatch(/\.agents\/reviews\/myreview\/003\.md$/);
  }));

test('resolveReviewFile: non-.md files are ignored', () =>
  withTempDir(async ({ tmp }) => {
    const dir = path.join(tmp, '.agents/reviews/myreview');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '001.md'), '# Review 1');
    fs.writeFileSync(path.join(dir, '099.txt'), 'not a review');
    fs.writeFileSync(path.join(dir, 'notes.md.bak'), 'backup file');
    const result = await runEffect(resolveReviewFile(tmp, 'myreview', false));
    expect(result).toMatch(/\.agents\/reviews\/myreview\/001\.md$/);
  }));

test('resolveReviewFile: fresh with no matching nums falls back to 001', () =>
  withTempDir(async ({ tmp }) => {
    const dir = path.join(tmp, '.agents/reviews/myreview');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'readme.md'), '# readme not numbered');
    // No .md files have numeric codes → nums.length === 0 → returns 001.md even with fresh
    const result = await runEffect(resolveReviewFile(tmp, 'myreview', true));
    expect(result).toMatch(/\.agents\/reviews\/myreview\/001\.md$/);
  }));

test('resolveReviewFile: rejects path-traversal and invalid review names', () =>
  withTempDir(async ({ tmp }) => {
    for (const bad of ['../escape', 'a/b', 'a b', '.hidden', '', '..', 'a\\b']) {
      const result = await runResult(resolveReviewFile(tmp, bad, false));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(ReviewPathError);
        expect(result.failure.message).toContain('Invalid review name');
      }
      // Nothing may be created outside the reviews root.
      expect(fs.existsSync(path.join(tmp, 'escape'))).toBe(false);
      expect(fs.existsSync(path.join(tmp, 'b'))).toBe(false);
    }
  }));

/**
 * Runs a callback with the real Node `Path` service (as used by the
 * production runtime and the graph tests).
 * @param {(path: Path) => A} f The callback
 * @returns A promise resolving to the callback's result
 */
const withNodePath = <A>(f: (path: Path) => A): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const pathService = yield* Path;
      return f(pathService);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

test('resolveReviewFile: accepts safe names only', () =>
  withTempDir(async ({ tmp }) => {
    for (const good of ['adversarial', 'security-audit', 'a_b.c-d', 'audit2']) {
      const result = await runResult(resolveReviewFile(tmp, good, false));
      expect(Result.isSuccess(result)).toBe(true);
    }
  }));

test('isWithinReviews: rejects a candidate escaping via a symlinked parent', () =>
  withTempDir(async ({ tmp }) => {
    const reviews = path.join(tmp, '.agents/reviews');
    fs.mkdirSync(reviews, { recursive: true });
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(reviews, 'link'), 'dir');

    await withNodePath((p) => {
      // Existing target: realpath resolves fully outside the reviews root.
      fs.writeFileSync(path.join(outside, '001.md'), '# Review\n');
      expect(isWithinReviews(p, tmp, path.join(reviews, 'link', '001.md'))).toBe(false);
      // Not-yet-existing target (what ensureStateDirs would create): the
      // deepest existing ancestor (`link` → outside) is resolved, so the
      // missing leaf cannot smuggle the path back inside the root.
      expect(isWithinReviews(p, tmp, path.join(reviews, 'link', '002.md'))).toBe(false);
    });
  }));

test('isWithinReviews: a reviews root that is itself a symlink is compared by its real target', () =>
  withTempDir(async ({ tmp }) => {
    const realRoot = path.join(tmp, 'real-reviews');
    fs.mkdirSync(realRoot, { recursive: true });
    fs.mkdirSync(path.join(tmp, '.agents'), { recursive: true });
    fs.symlinkSync(realRoot, path.join(tmp, '.agents', 'reviews'), 'dir');

    await withNodePath((p) => {
      // Writes through the symlinked reviews root land in its real target,
      // so legitimate review paths (via either spelling) stay contained.
      expect(isWithinReviews(p, tmp, path.join(realRoot, 'myreview', '001.md'))).toBe(true);
      expect(isWithinReviews(p, tmp, path.join(tmp, '.agents', 'reviews', 'myreview', '001.md'))).toBe(true);
      // An internal link escaping the real root is still rejected.
      const outside = path.join(tmp, 'outside');
      fs.mkdirSync(outside, { recursive: true });
      fs.symlinkSync(outside, path.join(realRoot, 'link'), 'dir');
      expect(isWithinReviews(p, tmp, path.join(realRoot, 'link', '001.md'))).toBe(false);
    });
  }));

test('isWithinReviews: accepts real (non-symlinked) review paths', () =>
  withTempDir(async ({ tmp }) => {
    const reviews = path.join(tmp, '.agents/reviews');
    fs.mkdirSync(reviews, { recursive: true });
    await withNodePath((p) => {
      expect(isWithinReviews(p, tmp, path.join(reviews, 'myreview', '001.md'))).toBe(true);
      // The reviews root itself is contained.
      expect(isWithinReviews(p, tmp, reviews)).toBe(true);
      // A sibling directory outside the root is not.
      expect(isWithinReviews(p, tmp, path.join(tmp, 'elsewhere', '001.md'))).toBe(false);
    });
  }));
