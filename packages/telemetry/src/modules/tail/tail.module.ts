import { createHash, Fs } from '../platform/index.js';
import { Option } from 'effect';
import { decodeLine, type Line } from '../event/index.js';

/** One incremental read: the complete lines after `offset`, and the byte offset after them. */
export interface Result {
  readonly lines: Line[];
  readonly nextOffset: number;
}

const parse = (row: string): Line | undefined => {
  try {
    const decoded = Option.getOrUndefined(decodeLine(JSON.parse(row)));
    if (decoded === undefined) return undefined;
    const line: Line = {
      v: 1,
      ts: decoded.ts,
      type: decoded.type,
      sessionID: decoded.sessionID,
      payload: decoded.payload,
    };
    if (decoded.agent !== undefined) line.agent = decoded.agent;
    if (decoded.model !== undefined) line.model = decoded.model;
    return line;
  } catch {
    return undefined;
  }
};

/** Prefix fingerprint: changes when a file is rewritten, stable across appends. */
export const fingerprint = (path: string, bytes: number): string => {
  try {
    if (bytes < 16) return '';
    const fd = Fs.openSync(path, 'r');
    try {
      const size = Fs.fstatSync(fd).size;
      if (bytes > size) return '';
      const length = Math.min(bytes, 64 * 1024 * 1024);
      const buffer = Buffer.alloc(length);
      Fs.readSync(fd, buffer, 0, length, 0);
      return createHash('sha256').update(buffer).digest('hex');
    } finally {
      Fs.closeSync(fd);
    }
  } catch {
    return '';
  }
};

/** Current file size in bytes; 0 when the file is absent. */
export const fileSize = (path: string): number => {
  try {
    return Fs.statSync(path).size;
  } catch {
    return 0;
  }
};

/**
 * Read complete NDJSON lines starting at `offset`. A trailing partial line is
 * left for the next call and never parsed; malformed lines are skipped. An
 * absent or unreadable file reads as empty, so a pruned session never throws.
 */
export const read = (path: string, offset: number): Result => {
  try {
    const fd = Fs.openSync(path, 'r');
    try {
      const size = Fs.fstatSync(fd).size;
      if (offset >= size) return { lines: [], nextOffset: offset };
      const buffer = Buffer.alloc(size - offset);
      Fs.readSync(fd, buffer, 0, buffer.length, offset);
      const end = buffer.lastIndexOf(0x0a);
      if (end === -1) return { lines: [], nextOffset: offset };
      const lines: Line[] = [];
      for (const row of buffer
        .subarray(0, end + 1)
        .toString('utf8')
        .split('\n')) {
        if (row.length === 0) continue;
        const line = parse(row);
        if (line !== undefined) lines.push(line);
      }
      return { lines, nextOffset: offset + end + 1 };
    } finally {
      Fs.closeSync(fd);
    }
  } catch {
    return { lines: [], nextOffset: offset };
  }
};
