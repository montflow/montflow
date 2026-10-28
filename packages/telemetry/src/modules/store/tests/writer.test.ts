import * as Vitest from '@effect/vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Line } from '../../event/index.js';
import * as Store from '../index.js';

const OCT_27 = Date.UTC(2026, 9, 27, 23, 59);
const OCT_28 = Date.UTC(2026, 9, 28, 9, 0);

const line = (ts: number, sessionID = 'ses_1'): Line => ({
  v: 1,
  ts,
  type: 'session.idle',
  sessionID,
  payload: { sessionID },
});

const linesOf = (path: string): Line[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((row) => row.length > 0)
    .map((row) => JSON.parse(row));

const withTemp = async (run: (directory: string) => void): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-store-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

Vitest.describe('Store.make runtime', () => {
  Vitest.it('appends one JSON object per line in order', async () => {
    await withTemp((directory) => {
      const writer = Store.make({ directory, notify: () => {} });
      writer.append(line(OCT_28, 'ses_a'));
      writer.append(line(OCT_28 + 1, 'ses_b'));
      writer.close();
      const written = linesOf(join(directory, '2026-10-28.ndjson'));
      Vitest.expect(written.map((entry) => entry.sessionID)).toStrictEqual(['ses_a', 'ses_b']);
      Vitest.expect(readFileSync(join(directory, '2026-10-28.ndjson'), 'utf8').endsWith('\n')).toBe(
        true,
      );
    });
  });

  Vitest.it('creates no directory or file when a session emits nothing', async () => {
    await withTemp((directory) => {
      const writer = Store.make({ directory: join(directory, 'store'), notify: () => {} });
      writer.close();
      Vitest.expect(existsSync(join(directory, 'store'))).toBe(false);
    });
  });

  Vitest.it('rotates files by UTC day', async () => {
    await withTemp((directory) => {
      const writer = Store.make({ directory, notify: () => {} });
      writer.append(line(OCT_27));
      writer.append(line(OCT_28));
      writer.close();
      Vitest.expect(readdirSync(directory).toSorted()).toStrictEqual([
        '2026-10-27.ndjson',
        '2026-10-28.ndjson',
      ]);
    });
  });

  Vitest.it('swallows an injected write error and disables the writer once', async () => {
    await withTemp((directory) => {
      const reported: string[] = [];
      const writer = Store.make({
        directory,
        notify: (message) => reported.push(message),
        write: () => {
          throw new Error('disk full');
        },
      });
      Vitest.expect(() => writer.append(line(OCT_28))).not.toThrow();
      Vitest.expect(() => writer.append(line(OCT_28))).not.toThrow();
      Vitest.expect(writer.disabled).toBe(true);
      Vitest.expect(reported).toHaveLength(1);
      Vitest.expect(reported[0]).toContain('disk full');
      writer.close();
    });
  });

  Vitest.it('repairs a torn final line before the next append', async () => {
    await withTemp((directory) => {
      const path = join(directory, '2026-10-28.ndjson');
      const complete = JSON.stringify(line(OCT_28 - 1, 'ses_old'));
      writeFileSync(path, `${complete}\n{"v":1,"ts":`);
      const writer = Store.make({ directory, notify: () => {} });
      writer.append(line(OCT_28, 'ses_new'));
      writer.close();
      const written = linesOf(path);
      Vitest.expect(written.map((entry) => entry.sessionID)).toStrictEqual(['ses_old', 'ses_new']);
    });
  });

  Vitest.it('completes a line when the sink accepts fewer bytes per call', async () => {
    await withTemp((directory) => {
      const writer = Store.make({
        directory,
        notify: () => {},
        write: (fd, data) => writeSync(fd, data.subarray(0, Math.min(5, data.byteLength))),
      });
      writer.append(line(OCT_28));
      writer.close();
      Vitest.expect(linesOf(join(directory, '2026-10-28.ndjson'))).toHaveLength(1);
    });
  });

  Vitest.it(
    'disables the writer and truncates the torn line when the sink writes nothing',
    async () => {
      await withTemp((directory) => {
        const reported: string[] = [];
        const writer = Store.make({
          directory,
          notify: (message) => reported.push(message),
          write: () => 0,
        });
        writer.append(line(OCT_28));
        Vitest.expect(writer.disabled).toBe(true);
        Vitest.expect(reported).toHaveLength(1);
        Vitest.expect(linesOf(join(directory, '2026-10-28.ndjson'))).toStrictEqual([]);
      });
    },
  );

  Vitest.it('skips an out-of-range timestamp instead of disabling the writer', async () => {
    await withTemp((directory) => {
      const writer = Store.make({ directory, notify: () => {} });
      writer.append({ ...line(OCT_28), ts: 1e308 });
      writer.append(line(OCT_28, 'ses_ok'));
      writer.close();
      Vitest.expect(writer.disabled).toBe(false);
      Vitest.expect(
        linesOf(join(directory, '2026-10-28.ndjson')).map((entry) => entry.sessionID),
      ).toStrictEqual(['ses_ok']);
    });
  });
});

Vitest.describe('Store.prune runtime', () => {
  Vitest.it('removes only day files older than the retention window', async () => {
    await withTemp((directory) => {
      mkdirSync(directory, { recursive: true });
      for (const name of [
        '2026-09-20.ndjson',
        '2026-09-27.ndjson',
        '2026-09-28.ndjson',
        '2026-10-01.ndjson',
        '2026-10-28.ndjson',
        'notes.txt',
      ]) {
        writeFileSync(join(directory, name), '');
      }
      Store.prune({ directory, retentionDays: 30, now: OCT_28, notify: () => {} });
      Vitest.expect(readdirSync(directory).toSorted()).toStrictEqual([
        '2026-09-28.ndjson',
        '2026-10-01.ndjson',
        '2026-10-28.ndjson',
        'notes.txt',
      ]);
    });
  });

  Vitest.it('ignores an absent store without reporting', async () => {
    await withTemp((directory) => {
      const reported: string[] = [];
      Vitest.expect(() =>
        Store.prune({
          directory: join(directory, 'missing'),
          retentionDays: 30,
          now: OCT_28,
          notify: (message) => reported.push(message),
        }),
      ).not.toThrow();
      Vitest.expect(reported).toStrictEqual([]);
    });
  });

  Vitest.it('refuses a negative or non-finite retention window', async () => {
    await withTemp((directory) => {
      const path = join(directory, '2026-10-28.ndjson');
      writeFileSync(path, '');
      const reported: string[] = [];
      for (const retentionDays of [-1, Number.POSITIVE_INFINITY, 1e10]) {
        Store.prune({
          directory,
          retentionDays,
          now: OCT_28,
          notify: (message) => reported.push(message),
        });
      }
      Vitest.expect(existsSync(path)).toBe(true);
      Vitest.expect(reported).toHaveLength(3);
      Vitest.expect(reported.every((message) => message.includes('prune skipped'))).toBe(true);
    });
  });
});
