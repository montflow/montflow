import { Effect, Option } from 'effect';
import { execSync } from 'node:child_process';

/**
 * Gets the current git branch name.
 * @param {string} cwd Working directory
 * @returns The branch name, or none when not a git repo or detached HEAD
 */
export const getCurrentGitBranch = (cwd: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return branch === 'HEAD' ? Option.none<string>() : Option.some(branch);
    } catch {
      return Option.none<string>();
    }
  });
