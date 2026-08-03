import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveReviewFile } from '../resolve-review-file';
import { runEffect, withProjectRoot, type TempDir } from './helpers';

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
