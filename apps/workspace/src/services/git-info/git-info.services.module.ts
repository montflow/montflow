// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: shells out to git; migrate to Command when the app moves onto the platform layer graph.
import { execFile } from 'node:child_process';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: promisify adapts the git shell-out; both go away with the Command migration.
import { promisify } from 'node:util';
import { Workspace } from '../../modules/index.js';
import { Data, Effect } from 'effect';

export class GitError extends Data.TaggedError('@montflow/GitError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/**
 * Parse `git branch --show-current` stdout. Empty means detached HEAD.
 * @param stdout - raw command stdout
 * @returns branch name, or `unknown` when detached
 */
export const parseBranch = (stdout: string): string => {
  const branch = stdout.trim();
  return branch === '' ? 'unknown' : branch;
};

/**
 * Parse `git status --porcelain` stdout. Empty means clean.
 * @param stdout - raw command stdout
 * @returns true when the tree is clean
 */
export const parseClean = (stdout: string): boolean => stdout.trim() === '';

/**
 * Parse `git rev-parse --show-toplevel` stdout.
 * @param stdout - raw command stdout
 * @returns trimmed toplevel path (empty when unusable)
 */
export const parseToplevel = (stdout: string): string => stdout.trim();

const execFileAsync = promisify(execFile);

const runGit = (root: string, args: ReadonlyArray<string>): Effect.Effect<string, GitError> => {
  const operation = `git ${args[0] ?? 'git'}`;
  return Effect.tryPromise({
    try: () =>
      execFileAsync('git', [...args], { cwd: root }).then(({ stdout }) => stdout.toString()),
    catch: (cause) =>
      new GitError({ operation, reason: cause instanceof Error ? cause.message : String(cause) }),
  });
};

/**
 * Resolve the workspace root: git toplevel when inside a repo, else the
 * launch directory. The launcher pins cwd to `apps/workspace`, so without
 * this every `.agents/` lookup misses the repo.
 * @param cwd - launch directory fallback
 * @returns workspace root, never fails
 */
export const resolveRoot = (cwd: string): Effect.Effect<string, never> =>
  runGit(cwd, ['rev-parse', '--show-toplevel']).pipe(
    Effect.map((stdout) => {
      const top = parseToplevel(stdout);
      return top === '' ? cwd : top;
    }),
    Effect.orElseSucceed(() => cwd),
  );

/**
 * Read workspace info for a root: name from the path, branch and
 * cleanliness from git. Outside a repo the branch reads `unknown` and the
 * tree reads clean.
 * @param root - directory to inspect
 * @returns workspace info, never fails
 */
export const getInfo = (root: string): Effect.Effect<Workspace.Info, never> =>
  Effect.gen(function* () {
    const branchOut = yield* runGit(root, ['branch', '--show-current']).pipe(
      Effect.orElseSucceed(() => ''),
    );
    const statusOut = yield* runGit(root, ['status', '--porcelain']).pipe(
      Effect.orElseSucceed(() => ''),
    );
    return Workspace.make({
      name: Workspace.basename(root),
      root,
      branch: parseBranch(branchOut),
      clean: parseClean(statusOut),
    });
  });
