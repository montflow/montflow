// oxlint-disable-next-line montflow/no-node-platform-imports -- NDJSON append is the ingest path and must stay a bare `node:fs` write: the server plugin has no Effect layer to provide FileSystem to, and a native/async adapter would add weight the spec forbids.
import * as Fs from 'node:fs';
import type { Line } from '../event/index.js';

const DAY_MS = 86_400_000;

/** Write syscall seam; tests inject a throwing writer. */
export type Write = (fd: number, data: Uint8Array) => number;

/** Writer dependencies. */
export interface WriterOptions {
  readonly directory: string;
  readonly notify: (message: string) => void;
  readonly write?: Write;
}

/** Appends normalized lines to day-rotated NDJSON files. */
export interface Writer {
  readonly disabled: boolean;
  append(line: Line): void;
  close(): void;
}

/** Pruning inputs; `now` is epoch milliseconds. */
export interface PruneOptions {
  readonly directory: string;
  readonly retentionDays: number;
  readonly now: number;
  readonly notify: (message: string) => void;
}

/** Wrap a logger so a process reports at most one telemetry failure. */
export const once = (log: (message: string) => void): ((message: string) => void) => {
  let reported = false;
  return (message) => {
    if (reported) return;
    reported = true;
    log(message);
  };
};

const dayOf = (ts: number): string => new Date(ts).toISOString().slice(0, 10);

const fileOf = (directory: string, day: string): string =>
  `${directory.replace(/\/+$/u, '')}/${day}.ndjson`;

/**
 * A SIGKILL during `write` can leave a torn final line. Truncate it before the
 * next append so every line in the file parses; a reprinted line is lost, a
 * corrupt store is not.
 */
const repairTail = (fd: number): void => {
  const size = Fs.fstatSync(fd).size;
  if (size === 0) return;
  const last = Buffer.alloc(1);
  Fs.readSync(fd, last, 0, 1, size - 1);
  if (last[0] === 0x0a) return;
  const chunk = 4096;
  let end = size;
  while (end > 0) {
    const start = Math.max(0, end - chunk);
    const buffer = Buffer.alloc(end - start);
    Fs.readSync(fd, buffer, 0, buffer.length, start);
    const index = buffer.lastIndexOf(0x0a);
    if (index !== -1) {
      Fs.ftruncateSync(fd, start + index + 1);
      return;
    }
    end = start;
  }
  Fs.ftruncateSync(fd, 0);
};

const encoder = new TextEncoder();

const defaultWrite: Write = (fd, data) => Fs.writeSync(fd, data);

/**
 * Make a lazy writer: no directory and no file exist until the first line, so a
 * session with no events leaves nothing behind. Every failure is swallowed,
 * logged once, and disables the writer for the process lifetime.
 */
export const make = (options: WriterOptions): Writer => {
  const write = options.write ?? defaultWrite;
  let fd: number | undefined;
  let day: string | undefined;
  let disabled = false;

  const closeHandle = (flush: boolean): void => {
    const handle = fd;
    fd = undefined;
    day = undefined;
    if (handle === undefined) return;
    try {
      if (flush) Fs.fsyncSync(handle);
    } finally {
      Fs.closeSync(handle);
    }
  };

  const fail = (cause: string): void => {
    if (disabled) return;
    disabled = true;
    options.notify(cause);
    try {
      closeHandle(false);
    } catch {
      // The writer is already disabled; a failing close changes nothing.
    }
  };

  const open = (nextDay: string): void => {
    Fs.mkdirSync(options.directory, { recursive: true });
    const handle = Fs.openSync(fileOf(options.directory, nextDay), 'a+');
    try {
      repairTail(handle);
    } catch (cause) {
      Fs.closeSync(handle);
      throw cause;
    }
    fd = handle;
    day = nextDay;
  };

  const append = (line: Line): void => {
    if (disabled) return;
    try {
      const nextDay = dayOf(line.ts);
      if (fd === undefined || nextDay !== day) {
        closeHandle(true);
        open(nextDay);
      }
      if (fd === undefined) return;
      write(fd, encoder.encode(`${JSON.stringify(line)}\n`));
    } catch (cause) {
      fail(`write failed: ${String(cause)}`);
    }
  };

  const close = (): void => {
    if (disabled) return;
    try {
      closeHandle(true);
    } catch (cause) {
      fail(`close failed: ${String(cause)}`);
    }
  };

  return {
    get disabled() {
      return disabled;
    },
    append,
    close,
  };
};

/**
 * Delete day files older than the retention window. Only files named
 * `YYYY-MM-DD.ndjson` are candidates; anything else in the directory is left
 * alone. Failure to prune is reported once and otherwise ignored.
 */
export const prune = (options: PruneOptions): void => {
  if (!Fs.existsSync(options.directory)) return;
  const cutoff = dayOf(options.now - options.retentionDays * DAY_MS);
  let entries: string[];
  try {
    entries = Fs.readdirSync(options.directory);
  } catch (cause) {
    options.notify(`prune failed: ${String(cause)}`);
    return;
  }
  for (const entry of entries) {
    const match = /^(\d{4}-\d{2}-\d{2})\.ndjson$/u.exec(entry);
    const candidate = match?.[1];
    if (candidate === undefined || candidate >= cutoff) continue;
    try {
      Fs.rmSync(fileOf(options.directory, candidate), { force: true });
    } catch (cause) {
      options.notify(`prune failed: ${String(cause)}`);
    }
  }
};
