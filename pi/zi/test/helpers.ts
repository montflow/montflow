import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import type { FileSystem } from 'effect/FileSystem';
import type { Path } from 'effect/Path';

/**
 * Runs an effect that requires the Node platform services (FileSystem/Path)
 * against the real implementations from NodeServices.layer.
 * @param {Effect.Effect<A, E, FileSystem | Path>} effect The effect to run
 * @returns A promise for the effect's success value
 */
export const runEffect = <A, E>(
  effect: Effect.Effect<A, E, FileSystem | Path>,
): Promise<A> => Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

/**
 * Runs an effect and captures its typed failure channel as a Result.
 * @param {Effect.Effect<A, E, FileSystem | Path>} effect The effect to run
 * @returns A promise for the Result (Success/Failure)
 */
export const runResult = <A, E>(
  effect: Effect.Effect<A, E, FileSystem | Path>,
) => runEffect(Effect.result(effect));

export interface TempDir {
  readonly tmp: string;
  readonly cleanup: () => void;
}

/**
 * Creates a temp directory populated with the given relative files.
 * @param {Record<string, string>} files Map of relative path → file contents
 * @returns The temp dir handle with cleanup
 */
export const withProjectRoot = (files: Record<string, string>): TempDir => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arl-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmp, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return {
    tmp,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
};
