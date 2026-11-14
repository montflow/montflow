import { Data, Effect, FileSystem, Path } from 'effect';

import { PHASE_FILE } from '../phase/index.js';
import { TASK_STATUSES, type TaskStatus, isTaskStatus } from '../task/index.js';

/** One file a claim transaction stages and renames. */
export interface TransactionEntry {
  /** Absolute path of the target file. */
  readonly path: string;
  /** The full new content. */
  readonly content: string;
}

/** A failed transaction; every already-renamed target was restored. */
export class TransactionError extends Data.TaggedError('@montflow/TransactionError')<{
  readonly reason: string;
  readonly path: string;
  readonly cause?: unknown;
}> {}

/** Optional test seam: the rename primitive, so a failure can be injected. */
export interface TransactionOptions {
  readonly rename?:
    | ((from: string, to: string, index: number) => Effect.Effect<void, unknown>)
    | undefined;
}

const readOrUndefined = (
  fs: FileSystem.FileSystem,
  path: string,
): Effect.Effect<string | undefined> =>
  fs.readFileString(path).pipe(Effect.orElseSucceed(() => undefined));

/** Restore one target from its original bytes (or remove a file this run created). */
const restore = (
  fs: FileSystem.FileSystem,
  target: string,
  original: string | undefined,
  rename: (from: string, to: string, index: number) => Effect.Effect<void, unknown>,
  index: number,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (original === undefined) {
      yield* fs.remove(target).pipe(Effect.orElseSucceed(() => undefined));
      return true;
    }
    const temp = `${target}.rollback-${index}`;
    const written = yield* fs.writeFileString(temp, original).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(false),
        onSuccess: () => Effect.succeed(true),
      }),
    );
    if (!written) return false;
    return yield* rename(temp, target, index).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(false),
        onSuccess: () => Effect.succeed(true),
      }),
    );
  });

/**
 * Stage every file as a sibling temp, then rename them in order. A failure while
 * staging leaves every target untouched. A failure while renaming restores every
 * already-renamed target from its saved bytes (or removes a file this run
 * created) and removes the remaining temps, so no partial write survives.
 * @param entries - files to write, in rename order
 * @param options - optional rename seam for a forced-failure test
 * @returns the transaction result, failing with {@link TransactionError}
 */
export const commitTransaction = (
  entries: ReadonlyArray<TransactionEntry>,
  options: TransactionOptions = {},
): Effect.Effect<void, TransactionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (entries.length === 0) return;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rename = options.rename ?? ((from: string, to: string) => fs.rename(from, to));

    const originals = new Map<string, string | undefined>();
    const temps: Array<string> = [];
    const staging = Effect.gen(function* () {
      for (const [index, entry] of entries.entries()) {
        originals.set(entry.path, yield* readOrUndefined(fs, entry.path));
        const temp = `${entry.path}.tmp-${process.pid}-${index}`;
        const parent = path.dirname(entry.path);
        yield* fs.makeDirectory(parent, { recursive: true }).pipe(
          Effect.mapError(
            (cause) =>
              new TransactionError({
                reason: `Cannot create the directory for '${entry.path}'.`,
                path: entry.path,
                cause,
              }),
          ),
        );
        yield* fs.writeFileString(temp, entry.content).pipe(
          Effect.mapError(
            (cause) =>
              new TransactionError({
                reason: `Cannot stage '${entry.path}'.`,
                path: entry.path,
                cause,
              }),
          ),
        );
        temps.push(temp);
      }
    });
    yield* staging.pipe(
      Effect.onError(() =>
        Effect.forEach(temps, (pending) =>
          fs.remove(pending).pipe(Effect.orElseSucceed(() => undefined)),
        ),
      ),
    );

    const renamed: Array<string> = [];
    for (const [index, entry] of entries.entries()) {
      const temp = temps[index] ?? '';
      const outcome = yield* rename(temp, entry.path, index).pipe(Effect.result);
      if ('failure' in outcome) {
        for (const [restoreIndex, target] of renamed.toReversed().entries()) {
          yield* restore(fs, target, originals.get(target), rename, entries.length + restoreIndex);
        }
        for (const pending of temps.slice(entries.indexOf(entry))) {
          yield* fs.remove(pending).pipe(Effect.orElseSucceed(() => undefined));
        }
        return yield* Effect.fail(
          new TransactionError({
            reason: `Cannot rename '${temp}' into place.`,
            path: entry.path,
            cause: outcome.failure,
          }),
        );
      }
      renamed.push(entry.path);
    }
  });

/** Replace the frontmatter `status:` line of a markdown file, preserving newlines. */
export const renderStatusField = (markdown: string, status: TaskStatus): string => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(newline);
  if ((lines[0] ?? '').trim() !== '---') return markdown;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closing === -1) return markdown;
  const index = lines.findIndex(
    (line, position) => position > 0 && position < closing && /^status\s*:/.test(line.trim()),
  );
  if (index === -1) return markdown;
  lines[index] = `status: ${status}`;
  return lines.join(newline);
};

/** One row of the SPEC.md task table, preserving its cells. */
const TASK_ROW =
  /^\|\s*([A-Z]{1,2}\d{3})\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(Yes|No)\s*\|$/;

/**
 * Rewrite one SPEC.md task row's status cell. A missing row is `undefined`, so
 * the caller reports `claim.row-missing` instead of inventing a row.
 * @param markdown - raw SPEC.md contents
 * @param id - task id
 * @param status - the new status
 * @returns the rewritten document, or undefined when the row is absent
 */
export const renderSpecRow = (
  markdown: string,
  id: string,
  status: TaskStatus,
): string | undefined => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  let found = false;
  const lines = markdown.split(newline).map((line) => {
    const match = TASK_ROW.exec(line.trim());
    if (match === null || match[1] !== id) return line;
    found = true;
    return `| ${match[1]} | ${match[2]} | ${match[3]} | ${status} | ${match[5]} |`;
  });
  return found ? lines.join(newline) : undefined;
};

/** Rewrite the SPEC.md frontmatter `status:` line. */
export const renderSpecStatus = (markdown: string, status: 'in-progress' | 'complete'): string => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(newline);
  if ((lines[0] ?? '').trim() !== '---') return markdown;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closing === -1) return markdown;
  const index = lines.findIndex(
    (line, position) => position > 0 && position < closing && /^status\s*:/.test(line.trim()),
  );
  if (index === -1) return markdown;
  lines[index] = `status: ${status}`;
  return lines.join(newline);
};

/** The PHASE.md `status:` line, rewritten from the derived phase status. */
export const renderPhaseStatus = (markdown: string, status: string): string => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(newline);
  if ((lines[0] ?? '').trim() !== '---') return markdown;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closing === -1) return markdown;
  const index = lines.findIndex(
    (line, position) => position > 0 && position < closing && /^status\s*:/.test(line.trim()),
  );
  if (index === -1) return markdown;
  lines[index] = `status: ${status}`;
  return lines.join(newline);
};

/** True when a declared value is a task status. */
export const isStatus = (value: string): value is TaskStatus => isTaskStatus(value);

/** Every status a claim generator may write. */
export const CLAIM_STATUSES = TASK_STATUSES;

/** The phase file name a claim transaction mirrors. */
export const CLAIM_PHASE_FILE = PHASE_FILE;
