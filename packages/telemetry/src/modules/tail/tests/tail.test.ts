import * as Vitest from '@effect/vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Tail from '../index.js';

const row = (sessionID: string, ts: number) =>
  JSON.stringify({ v: 1, ts, type: 'session.idle', sessionID, payload: { sessionID } });

const withFile = async (run: (path: string) => void): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-tail-'));
  try {
    run(join(directory, '2026-10-28.ndjson'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

Vitest.describe('Tail.read runtime', () => {
  Vitest.it('reads only complete lines and advances the byte offset', async () => {
    await withFile((path) => {
      const first = `${row('ses_a', 1)}\n${row('ses_b', 2)}\n`;
      writeFileSync(path, `${first}{"v":1,"ts":3`);
      const atZero = Tail.read(path, 0);
      Vitest.expect(atZero.lines.map((line) => line.sessionID)).toStrictEqual(['ses_a', 'ses_b']);
      Vitest.expect(atZero.nextOffset).toBe(Buffer.byteLength(first, 'utf8'));

      const again = Tail.read(path, atZero.nextOffset);
      Vitest.expect(again.lines).toStrictEqual([]);
      Vitest.expect(again.nextOffset).toBe(atZero.nextOffset);
    });
  });

  Vitest.it('picks up only the bytes appended since the last offset', async () => {
    await withFile((path) => {
      writeFileSync(path, `${row('ses_a', 1)}\n`);
      const first = Tail.read(path, 0);
      writeFileSync(path, `${row('ses_a', 2)}\n`, { flag: 'a' });
      const second = Tail.read(path, first.nextOffset);
      Vitest.expect(second.lines.map((line) => line.ts)).toStrictEqual([2]);
      Vitest.expect(Tail.read(path, second.nextOffset).lines).toStrictEqual([]);
    });
  });

  Vitest.it('skips malformed lines without losing the next good one', async () => {
    await withFile((path) => {
      writeFileSync(path, `${row('ses_a', 1)}\n{oops\n${row('ses_b', 2)}\n`);
      const result = Tail.read(path, 0);
      Vitest.expect(result.lines.map((line) => line.sessionID)).toStrictEqual(['ses_a', 'ses_b']);
    });
  });

  Vitest.it('reads an absent file as empty', () => {
    Vitest.expect(Tail.read('/tmp/does-not-exist-telemetry.ndjson', 0)).toStrictEqual({
      lines: [],
      nextOffset: 0,
    });
  });
});

Vitest.describe('Tail.fingerprint runtime', () => {
  Vitest.it('is stable across appends and changes when the folded prefix changes', async () => {
    await withFile((path) => {
      writeFileSync(path, `${row('ses_a', 1)}\n`);
      const before = Tail.fingerprint(path, Buffer.byteLength(`${row('ses_a', 1)}\n`, 'utf8'));
      Vitest.expect(before).not.toBe('');
      writeFileSync(path, `${row('ses_b', 2)}\n`, { flag: 'a' });
      Vitest.expect(
        Tail.fingerprint(
          path,
          before.length === 0 ? 0 : Buffer.byteLength(`${row('ses_a', 1)}\n`, 'utf8'),
        ),
      ).toBe(before);
      writeFileSync(path, `${row('ses_c', 3)}\n`);
      Vitest.expect(
        Tail.fingerprint(path, Buffer.byteLength(`${row('ses_a', 1)}\n`, 'utf8')),
      ).not.toBe(before);
    });
  });
});
