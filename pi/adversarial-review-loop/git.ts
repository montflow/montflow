import { Effect, Option } from 'effect';
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';

/**
 * Runs a git command in the given directory and returns trimmed stdout.
 * Throws when git fails (e.g. not a repository).
 * @param {string} cwd Working directory
 * @param {readonly string[]} args Git arguments
 * @returns The trimmed stdout, or '' when empty
 */
const git = (cwd: string, args: readonly string[]): string => {
  const options: ExecFileSyncOptions = {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  };
  return execFileSync('git', [...args], options).toString().trim();
};

/**
 * Gets the current git branch name.
 * @param {string} cwd Working directory
 * @returns The branch name, or none when not a git repo or detached HEAD
 */
export const getCurrentGitBranch = (cwd: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => {
    try {
      const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
      return branch === 'HEAD' ? Option.none<string>() : Option.some(branch);
    } catch {
      return Option.none<string>();
    }
  });

/** The set of files with unstaged changes plus untracked files, and the diff text. */
export interface GitWorkingTreeChanges {
  /** Tracked files with unstaged modifications plus untracked files. */
  readonly files: readonly string[];
  /** `git diff` text for tracked unstaged changes (empty when none). */
  readonly diff: string;
}

/**
 * Collects the unstaged working-tree changes: `git diff --name-only` (tracked
 * unstaged modifications) plus `git ls-files --others --exclude-standard`
 * (untracked files). Returns empty results when not a git repository or git
 * fails — callers fall back to whole-directory scope.
 * @param {string} cwd Working directory
 * @returns The changed files and diff text
 */
export const getUnstagedChanges = (cwd: string): GitWorkingTreeChanges => {
  try {
    const tracked = git(cwd, ['diff', '--name-only']);
    const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']);
    const diff = git(cwd, ['diff']);
    const files = [...tracked.split(/\n/), ...untracked.split(/\n/)]
      .map((file) => file.trim())
      .filter((file) => file !== '');
    return { files: [...new Set(files)], diff };
  } catch {
    return { files: [], diff: '' };
  }
};
