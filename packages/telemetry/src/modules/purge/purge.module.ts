import { Option, Schema } from 'effect';
import { Fs } from '../platform/index.js';
import { file } from '../path/index.js';

const DAY_MS = 86_400_000;
const MAX_DAYS = 3650;
const MAX_TS = 8_640_000_000_000_000;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.ndjson$/u;
const DURATION = /^(\d+)([dhms])?$/u;

/** Telemetry data directory plus the derived database inside it. */
export interface Store {
  readonly directory: string;
  /** Derived database path; an empty string means files-only cleanup. */
  readonly database: string;
}

/** What one deletion removed. `files` counts NDJSON files removed or rewritten. */
export interface DeleteResult {
  readonly files: number;
  readonly lines: number;
  readonly bytes: number;
  readonly database: boolean;
}

const empty = (): DeleteResult => ({ files: 0, lines: 0, bytes: 0, database: false });
const Identity = Schema.Struct({ sessionID: Schema.optional(Schema.String) });
const decodeIdentity = Schema.decodeUnknownOption(Identity);

const dayOf = (ts: number): string | undefined => {
  if (!Number.isFinite(ts) || Math.abs(ts) > MAX_TS) return undefined;
  return new Date(ts).toISOString().slice(0, 10);
};

const remove = (path: string) => {
  let bytes = 0;
  try {
    bytes = Fs.statSync(path).size;
  } catch {
    return { removed: false, bytes: 0 };
  }
  try {
    Fs.rmSync(path, { force: true });
    return { removed: true, bytes };
  } catch {
    return { removed: false, bytes: 0 };
  }
};

/**
 * Parses `30d`, `12h`, `45m`, `10s`, or a bare number of days.
 * Returns epoch milliseconds, or undefined for anything malformed.
 */
export const parseDuration = (text: string): number | undefined => {
  const match = DURATION.exec(text.trim());
  if (match === null) return undefined;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value)) return undefined;
  const unit = match[2] ?? 'd';
  const multiplier =
    unit === 'd' ? DAY_MS : unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1_000;
  const duration = value * multiplier;
  return duration > MAX_DAYS * DAY_MS ? undefined : duration;
};

/** Day files in name order; any other file in the directory is ignored. */
export const dayFiles = (directory: string): string[] => {
  if (!Fs.existsSync(directory)) return [];
  return Fs.readdirSync(directory)
    .filter((entry) => DAY_FILE.test(entry))
    .toSorted();
};

const dropDatabase = (database: string | undefined): boolean => {
  if (database === undefined || database.length === 0) return false;
  let removed = false;
  for (const candidate of [database, `${database}-wal`, `${database}-shm`]) {
    if (remove(candidate).removed) removed = true;
  }
  return removed;
};

/** Delete every captured day file and the derived database. */
export const all = (store: Store): DeleteResult => {
  let files = 0;
  let bytes = 0;
  for (const entry of dayFiles(store.directory)) {
    const outcome = remove(file(store.directory, entry));
    if (!outcome.removed) continue;
    files += 1;
    bytes += outcome.bytes;
  }
  return { files, lines: 0, bytes, database: dropDatabase(store.database) };
};

/**
 * Delete every day file whose UTC day is before the cutoff day. Today and the
 * cutoff day itself are kept, matching retention semantics.
 */
export const olderThan = (store: Store, cutoff: number): DeleteResult => {
  const cutoffDay = dayOf(cutoff);
  if (cutoffDay === undefined) return empty();
  let files = 0;
  let bytes = 0;
  for (const entry of dayFiles(store.directory)) {
    const day = DAY_FILE.exec(entry)?.[1];
    if (day === undefined || day >= cutoffDay) continue;
    const outcome = remove(file(store.directory, entry));
    if (!outcome.removed) continue;
    files += 1;
    bytes += outcome.bytes;
  }
  if (files === 0) return { files, lines: 0, bytes, database: false };
  return { files, lines: 0, bytes, database: dropDatabase(store.database) };
};

const keeps = (line: string, sessionID: string): boolean => {
  if (line.length === 0) return true;
  try {
    const identity = Option.getOrUndefined(decodeIdentity(JSON.parse(line)));
    return identity?.sessionID !== sessionID;
  } catch {
    // A torn or foreign line cannot be attributed; keep it.
    return true;
  }
};

const rewrite = (path: string, sessionID: string) => {
  const content = Fs.readFileSync(path, 'utf8');
  const trailing = content.endsWith('\n');
  const rows = content.split('\n');
  if (trailing) rows.pop();
  let lines = 0;
  const kept: string[] = [];
  for (const row of rows) {
    if (keeps(row, sessionID)) kept.push(row);
    else lines += 1;
  }
  if (lines === 0) return { lines: 0, bytes: 0 };
  const next = kept.length === 0 ? '' : `${kept.join('\n')}${trailing ? '\n' : ''}`;
  const bytes = Buffer.byteLength(content) - Buffer.byteLength(next);
  if (kept.length === 0) {
    Fs.rmSync(path, { force: true });
  } else {
    const temporary = `${path}.tmp`;
    try {
      Fs.writeFileSync(temporary, next);
      Fs.renameSync(temporary, path);
    } finally {
      Fs.rmSync(temporary, { force: true });
    }
  }
  return { lines, bytes };
};

/**
 * Remove one session's lines from every day file, then drop the derived
 * database. Database removal is safe: the next fold rebuilds it from NDJSON.
 */
export const session = (store: Store, sessionID: string): DeleteResult => {
  let files = 0;
  let lines = 0;
  let bytes = 0;
  for (const entry of dayFiles(store.directory)) {
    const outcome = rewrite(file(store.directory, entry), sessionID);
    if (outcome.lines === 0) continue;
    files += 1;
    lines += outcome.lines;
    bytes += outcome.bytes;
  }
  if (files === 0) return { files, lines, bytes, database: false };
  return { files, lines, bytes, database: dropDatabase(store.database) };
};
