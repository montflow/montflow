// oxlint-disable-next-line montflow/no-node-platform-imports -- SHA-256 over bytes is a pure computation producing a value; it performs no platform I/O.
import { createHash } from 'node:crypto';
import { Effect, FileSystem, Option } from 'effect';

import { REPO_SCOPE } from './scope.module.js';

/** Recorded results never contribute to a fingerprint. */
const RESULTS_FILE_NAME = 'GATE-RESULTS.jsonl';

/** Directory names never fingerprinted, at any depth. */
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.turbo', 'dist', 'build', 'coverage']);

/** The runtime tree never contributes to a fingerprint. */
const RUNTIME_PREFIX = '.agents/@montflow/.runtime';

/** Hex SHA-256 of a string or byte stream chunk. */
export const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

/** One fingerprinted file. */
interface PrintEntry {
  readonly path: string;
  readonly digest: string;
}

/** A fingerprint and what it covered. */
export interface Fingerprint {
  /** Hex digest over every file inside the scopes. */
  readonly fingerprint: string;
  /** Regular files hashed. */
  readonly files: number;
  /** Scope tokens whose path does not exist. */
  readonly missing: ReadonlyArray<string>;
}

/**
 * Hash every regular file inside a scope set. Paths enter the hash as
 * workspace-relative POSIX strings, each followed by the SHA-256 of its bytes; a
 * symlink contributes its target string. `.git/`, `node_modules/`, `.turbo/`,
 * `dist/`, `build/`, `coverage/`, the runtime tree, and every
 * `GATE-RESULTS.jsonl` are skipped, so recording a result never invalidates the
 * key that produced it.
 * @param workspace - workspace root
 * @param scopes - normalized workspace-relative scopes, or `repo`
 * @returns the fingerprint, file count, and any missing scope roots
 */
export const fingerprintScopes = (
  workspace: string,
  scopes: ReadonlyArray<string>,
): Effect.Effect<Fingerprint, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = workspace.replace(/\/+$/, '');
    const entries: Array<PrintEntry> = [];
    const missing: Array<string> = [];

    const excluded = (relative: string): boolean => {
      if (relative === RUNTIME_PREFIX || relative.startsWith(`${RUNTIME_PREFIX}/`)) return true;
      return relative.split('/').some((segment) => EXCLUDED_DIRS.has(segment));
    };

    const walk = (
      absolute: string,
      relative: string,
    ): Effect.Effect<void, never, FileSystem.FileSystem> =>
      Effect.gen(function* () {
        if (excluded(relative)) return;
        const link = yield* fs.readLink(absolute).pipe(Effect.option);
        if (Option.isSome(link)) {
          entries.push({ path: relative, digest: sha256(link.value) });
          return;
        }
        const info = yield* fs.stat(absolute).pipe(Effect.option);
        if (Option.isNone(info)) return;
        if (info.value.type === 'Directory') {
          const names = yield* fs.readDirectory(absolute).pipe(Effect.orElseSucceed(() => []));
          for (const name of names.toSorted((left, right) => left.localeCompare(right))) {
            yield* walk(`${absolute}/${name}`, relative === '' ? name : `${relative}/${name}`);
          }
          return;
        }
        if (info.value.type !== 'File') return;
        const leaf = relative.slice(relative.lastIndexOf('/') + 1);
        if (leaf === RESULTS_FILE_NAME) return;
        const bytes = yield* fs.readFile(absolute).pipe(Effect.option);
        if (Option.isNone(bytes)) return;
        entries.push({ path: relative, digest: sha256(bytes.value) });
      });

    for (const scope of scopes) {
      const relative = scope === REPO_SCOPE ? '' : scope;
      const absolute = relative === '' ? root : `${root}/${relative}`;
      const exists = yield* fs.exists(absolute).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        missing.push(scope);
        continue;
      }
      yield* walk(absolute, relative);
    }
    const sorted = entries
      .filter((entry) => entry.path !== '')
      .toSorted((left, right) => left.path.localeCompare(right.path));
    const stream = sorted.map((entry) => `${entry.path}\u0000${entry.digest}\n`).join('');
    return { fingerprint: sha256(stream), files: sorted.length, missing };
  });
