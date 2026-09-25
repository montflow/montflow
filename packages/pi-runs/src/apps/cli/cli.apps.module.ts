import { Effect, FileSystem, Path, PlatformError } from 'effect';
import type { Runner } from '../../services/index.js';
import {
  COMMAND_DESCRIPTION,
  COMMAND_NAME,
  execute,
  parseArgv,
  parseCommand,
  USAGE,
} from '../commands/index.js';

export { COMMAND_DESCRIPTION, COMMAND_NAME, execute, parseCommand, USAGE };

/**
 * Run one CLI invocation: parse argv and execute against the engine. argv is
 * already shell-split, so it is parsed element-by-element — never re-joined —
 * which keeps multi-word prompts and names intact.
 * @param argv - args after the command name
 * @param root - repo root (runs store owner)
 * @returns Effect resolving to display text, failing with a message
 */
export const runCli = (
  argv: ReadonlyArray<string>,
  root: string,
): Effect.Effect<string, string, Runner> => execute(parseArgv(argv), root);

/**
 * Nearest ancestor of `startDir` containing a `.git` entry, so the runs store
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
