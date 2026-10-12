import { Effect, FileSystem, Path, PlatformError } from 'effect';
import type { SessionRunner } from '../../services/index.js';
import {
  COMMAND_DESCRIPTION,
  COMMAND_NAME,
  execute,
  parseArgv,
  parseCommand,
  USAGE,
} from '../commands/index.js';

export { COMMAND_DESCRIPTION, COMMAND_NAME, execute, parseCommand, USAGE };

/** Version reported by `--version` / `-v`. Mirrors the package version. */
export const VERSION = '0.0.1';

/**
 * Run one CLI invocation: parse argv and execute against the engine. argv is
 * already shell-split, so it is parsed element-by-element — never re-joined —
 * which keeps multi-word prompts and names intact. A lone `--version`/`-v`
 * prints the version without touching the engine.
 * @param argv - args after the command name
 * @param root - repo root (sessions store owner)
 * @returns Effect resolving to display text, failing with a message
 */
export const runCli = (
  argv: ReadonlyArray<string>,
  root: string,
): Effect.Effect<string, string, SessionRunner> => {
  const head = argv.length === 1 ? argv[0] : undefined;
  if (head === '--version' || head === '-v') return Effect.succeed(`mf-sessions ${VERSION}`);
  return execute(parseArgv(argv), root);
};

/**
 * Nearest ancestor of `startDir` containing a `.git` entry, so the sessions store
 * is always rooted at the repository, never a subdirectory. Falls back to
 * `startDir` when no repository is found.
 * @param startDir - directory to search from
 * @returns Effect resolving to the repository root, or `startDir` when none is found
 */
export const resolveRepoRoot = (
  startDir: string,
): Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let current = startDir;
    for (;;) {
      if (yield* fs.exists(path.join(current, '.git'))) return current;
      const parent = path.dirname(current);
      if (parent === current) return startDir;
      current = parent;
    }
  });
