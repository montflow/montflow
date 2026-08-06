import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { Option, Result } from 'effect';

import { getCurrentGitBranch, validateFeatureSpecFromBranch } from '../index';
import { getUnstagedChanges } from '../git';
import { runEffect, runResult, withProjectRoot, type TempDir } from './helpers';

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Creates a temp directory initialized as a git repo with the given branch name.
 * @param {string} [branchName] Branch to check out ('main' keeps the default)
 * @returns The temp repo handle with cleanup
 */
const withGitRepo = (branchName = 'feat/test-feature'): TempDir => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-branch-test-'));
  execSync('git init', { cwd: tmp, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: tmp, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: tmp, stdio: 'ignore' });

  // Create initial commit
  fs.writeFileSync(path.join(tmp, 'README.md'), '# Test');
  execSync('git add README.md', { cwd: tmp, stdio: 'ignore' });
  execSync('git commit -m "init"', { cwd: tmp, stdio: 'ignore' });

  // Create and checkout the feature branch
  if (branchName !== 'main') {
    execSync(`git checkout -b ${branchName}`, { cwd: tmp, stdio: 'ignore' });
  }

  return {
    tmp,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
};

/**
 * Detaches HEAD at the current commit.
 * @param {string} cwd The repo path
 * @returns Nothing
 */
const detachHead = (cwd: string): void => {
  const commitHash = execSync('git rev-parse HEAD', {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  execSync(`git checkout ${commitHash}`, { cwd, stdio: 'ignore' });
};

// ─── getCurrentGitBranch Tests ────────────────────────────────────────

test('getCurrentGitBranch: returns branch name for feat/* branch', async () => {
  const { tmp, cleanup } = withGitRepo('feat/auth-flow');
  try {
    const branch = await runEffect(getCurrentGitBranch(tmp));
    expect(Option.getOrNull(branch)).toBe('feat/auth-flow');
  } finally {
    cleanup();
  }
});

test('getCurrentGitBranch: returns branch name for main branch', async () => {
  const { tmp, cleanup } = withGitRepo('main');
  try {
    const branch = await runEffect(getCurrentGitBranch(tmp));
    expect(Option.getOrNull(branch)).toBe('main');
  } finally {
    cleanup();
  }
});

test('getCurrentGitBranch: returns none for detached HEAD', async () => {
  const { tmp, cleanup } = withGitRepo('feat/test');
  try {
    detachHead(tmp);
    const branch = await runEffect(getCurrentGitBranch(tmp));
    expect(Option.isNone(branch)).toBe(true);
  } finally {
    cleanup();
  }
});

test('getCurrentGitBranch: returns none for non-git directory', async () => {
  const { tmp, cleanup } = withProjectRoot({});
  try {
    const branch = await runEffect(getCurrentGitBranch(tmp));
    expect(Option.isNone(branch)).toBe(true);
  } finally {
    cleanup();
  }
});

// ─── getUnstagedChanges Tests ────────────────────────────────────────

test('getUnstagedChanges: lists unstaged + untracked files and the diff', () => {
  const { tmp, cleanup } = withGitRepo('main');
  try {
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Test\nchanged\n');
    fs.writeFileSync(path.join(tmp, 'new-file.ts'), 'export const x = 1;\n');

    const changes = getUnstagedChanges(tmp);
    expect(changes.files).toContain('README.md');
    expect(changes.files).toContain('new-file.ts');
    expect(changes.diff).toContain('README.md');
    expect(changes.diff).toContain('+changed');
  } finally {
    cleanup();
  }
});

test('getUnstagedChanges: empty when the working tree is clean', () => {
  const { tmp, cleanup } = withGitRepo('main');
  try {
    const changes = getUnstagedChanges(tmp);
    expect(changes.files).toEqual([]);
    expect(changes.diff).toBe('');
  } finally {
    cleanup();
  }
});

test('getUnstagedChanges: empty for a non-git directory', () => {
  const { tmp, cleanup } = withProjectRoot({});
  try {
    const changes = getUnstagedChanges(tmp);
    expect(changes.files).toEqual([]);
    expect(changes.diff).toBe('');
  } finally {
    cleanup();
  }
});

// ─── validateFeatureSpecFromBranch Tests ──────────────────────────────

test('validateFeatureSpecFromBranch: returns specName for valid feat/* branch with feature dir', async () => {
  const { tmp, cleanup } = withGitRepo('feat/auth-flow');
  try {
    // Create feature spec directory
    const featureDir = path.join(tmp, '.agents/features/auth-flow');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(path.join(featureDir, 'FEATURE.md'), '---\nname: auth-flow\n---\n# Auth Flow');

    const result = await runResult(validateFeatureSpecFromBranch(tmp));
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isFailure(result)) return;
    expect(result.success).toBe('auth-flow');
  } finally {
    cleanup();
  }
});

test('validateFeatureSpecFromBranch: fails when branch is not feat/* format', async () => {
  const { tmp, cleanup } = withGitRepo('main');
  try {
    const result = await runResult(validateFeatureSpecFromBranch(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain("does not match expected format 'feat/<feature-name>'");
  } finally {
    cleanup();
  }
});

test('validateFeatureSpecFromBranch: fails when branch is fix/* format', async () => {
  const { tmp, cleanup } = withGitRepo('fix/bug-123');
  try {
    const result = await runResult(validateFeatureSpecFromBranch(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain("does not match expected format 'feat/<feature-name>'");
  } finally {
    cleanup();
  }
});

test('validateFeatureSpecFromBranch: fails when feature directory does not exist', async () => {
  const { tmp, cleanup } = withGitRepo('feat/nonexistent-feature');
  try {
    const result = await runResult(validateFeatureSpecFromBranch(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('Feature directory not found');
  } finally {
    cleanup();
  }
});

test('validateFeatureSpecFromBranch: fails when FEATURE.md does not exist', async () => {
  const { tmp, cleanup } = withGitRepo('feat/auth-flow');
  try {
    // Create feature directory but no FEATURE.md
    const featureDir = path.join(tmp, '.agents/features/auth-flow');
    fs.mkdirSync(featureDir, { recursive: true });

    const result = await runResult(validateFeatureSpecFromBranch(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('FEATURE.md not found');
  } finally {
    cleanup();
  }
});

test('validateFeatureSpecFromBranch: fails for non-git directory', async () => {
  const { tmp, cleanup } = withProjectRoot({});
  try {
    const result = await runResult(validateFeatureSpecFromBranch(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('Not a git repository');
  } finally {
    cleanup();
  }
});

test('validateFeatureSpecFromBranch: fails for detached HEAD', async () => {
  const { tmp, cleanup } = withGitRepo('feat/test');
  try {
    detachHead(tmp);
    const result = await runResult(validateFeatureSpecFromBranch(tmp));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('detached HEAD');
  } finally {
    cleanup();
  }
});
