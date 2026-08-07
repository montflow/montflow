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
 * Runs a git command that may legitimately exit non-zero and still returns its
 * captured stdout. `git diff --no-index` exits 1 whenever the compared files
 * differ (always the case for a non-empty untracked file), so the plain `git`
 * helper cannot be used for it.
 * @param {string} cwd Working directory
 * @param {readonly string[]} args Git arguments
 * @returns The trimmed stdout, or '' when git fails outright
 */
const gitAllowNonZero = (cwd: string, args: readonly string[]): string => {
  try {
    return git(cwd, args);
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    return stdout !== undefined && stdout !== '' ? stdout.trim() : '';
  }
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
  /** Tracked unstaged `git diff` hunks plus full content of every untracked file (empty when none). */
  readonly diff: string;
}

/**
 * Collects the unstaged working-tree changes: `git diff --name-only` (tracked
 * unstaged modifications) plus `git ls-files --others --exclude-standard`
 * (untracked files). The returned diff includes BOTH the tracked `git diff`
 * hunks and the full content of every untracked file (`git diff --no-index
 * /dev/null <file>` per file), so reviewers materializing it can read brand-new
 * files in full. Returns empty results when not a git repository or git fails —
 * callers fall back to whole-directory scope.
 * @param {string} cwd Working directory
 * @returns The changed files and diff text
 */
export const getUnstagedChanges = (cwd: string): GitWorkingTreeChanges => {
  try {
    const tracked = git(cwd, ['diff', '--name-only']);
    const untrackedFiles = git(cwd, ['ls-files', '--others', '--exclude-standard'])
      .split(/\n/)
      .map((file) => file.trim())
      .filter((file) => file !== '');
    // Materialize untracked content so the diff carries brand-new files too:
    // `git diff --no-index /dev/null <file>` renders each untracked file as a
    // new-file hunk (it exits 1 on differences — hence gitAllowNonZero).
    const untrackedDiff = untrackedFiles
      .map((file) => gitAllowNonZero(cwd, ['diff', '--no-index', '--', '/dev/null', file]))
      .filter((part) => part !== '')
      .join('\n');
    const diff = [git(cwd, ['diff']), untrackedDiff]
      .filter((part) => part !== '')
      .join('\n');
    const files = [...tracked.split(/\n/), ...untrackedFiles]
      .map((file) => file.trim())
      .filter((file) => file !== '');
    return { files: [...new Set(files)], diff };
  } catch {
    return { files: [], diff: '' };
  }
};
