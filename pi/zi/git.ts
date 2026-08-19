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
