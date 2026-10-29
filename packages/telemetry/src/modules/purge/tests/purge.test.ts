import * as Vitest from '@effect/vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Purge from '../index.js';

const withStore = async (run: (store: Purge.Store) => void): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-purge-'));
  try {
    run({ directory, database: join(directory, 'telemetry.db') });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const line = (sessionID: string, day = '2026-10-28'): string =>
  JSON.stringify({ v: 1, ts: 1, type: 'session.idle', sessionID, payload: { sessionID, day } });

Vitest.describe('Purge.parseDuration', () => {
  Vitest.it('reads day, hour, minute, second, and bare values', () => {
    Vitest.expect(Purge.parseDuration('30d')).toBe(30 * 86_400_000);
    Vitest.expect(Purge.parseDuration('12h')).toBe(12 * 3_600_000);
    Vitest.expect(Purge.parseDuration('45m')).toBe(45 * 60_000);
    Vitest.expect(Purge.parseDuration('10s')).toBe(10_000);
    Vitest.expect(Purge.parseDuration('7')).toBe(7 * 86_400_000);
  });

  Vitest.it('rejects malformed and oversized windows', () => {
    for (const text of ['', 'week', '1.5d', '-1d', '30dd', '999999d']) {
      Vitest.expect(Purge.parseDuration(text)).toBeUndefined();
    }
  });
});

Vitest.describe('Purge.all', () => {
  Vitest.it('removes every day file and database artifact but leaves other files', async () => {
    await withStore((store) => {
      writeFileSync(join(store.directory, '2026-10-27.ndjson'), `${line('ses_a')}\n`);
      writeFileSync(join(store.directory, '2026-10-28.ndjson'), `${line('ses_b')}\n`);
      writeFileSync(store.database, 'db');
      writeFileSync(`${store.database}-wal`, 'wal');
      writeFileSync(join(store.directory, 'config.json'), '{}');
      const result = Purge.all(store);
      Vitest.expect(result.files).toBe(2);
      Vitest.expect(result.database).toBe(true);
      Vitest.expect(existsSync(join(store.directory, '2026-10-27.ndjson'))).toBe(false);
      Vitest.expect(existsSync(store.database)).toBe(false);
      Vitest.expect(existsSync(`${store.database}-wal`)).toBe(false);
      Vitest.expect(existsSync(join(store.directory, 'config.json'))).toBe(true);
    });
  });
});

Vitest.describe('Purge.olderThan', () => {
  Vitest.it('keeps the cutoff day and newer files', async () => {
    await withStore((store) => {
      writeFileSync(join(store.directory, '2026-09-20.ndjson'), `${line('ses_old')}\n`);
      writeFileSync(join(store.directory, '2026-09-27.ndjson'), `${line('ses_edge')}\n`);
      writeFileSync(join(store.directory, '2026-09-28.ndjson'), `${line('ses_keep')}\n`);
      writeFileSync(store.database, 'db');
      const result = Purge.olderThan(store, Date.UTC(2026, 8, 28, 12));
      Vitest.expect(result.files).toBe(2);
      Vitest.expect(result.database).toBe(true);
      Vitest.expect(existsSync(join(store.directory, '2026-09-20.ndjson'))).toBe(false);
      Vitest.expect(existsSync(join(store.directory, '2026-09-27.ndjson'))).toBe(false);
      Vitest.expect(existsSync(join(store.directory, '2026-09-28.ndjson'))).toBe(true);
    });
  });

  Vitest.it('does not touch the database when nothing was deleted', async () => {
    await withStore((store) => {
      writeFileSync(join(store.directory, '2026-10-28.ndjson'), `${line('ses_a')}\n`);
      writeFileSync(store.database, 'db');
      const result = Purge.olderThan(store, Date.UTC(2026, 8, 1));
      Vitest.expect(result.files).toBe(0);
      Vitest.expect(result.database).toBe(false);
      Vitest.expect(existsSync(store.database)).toBe(true);
    });
  });
});

Vitest.describe('Purge.session', () => {
  Vitest.it('removes only matching lines across files and drops the database', async () => {
    await withStore((store) => {
      writeFileSync(
        join(store.directory, '2026-10-27.ndjson'),
        `${line('ses_target')}\n${line('ses_keep')}\n`,
      );
      writeFileSync(
        join(store.directory, '2026-10-28.ndjson'),
        `${line('ses_keep_2')}\n${line('ses_target')}`,
      );
      writeFileSync(store.database, 'db');
      const result = Purge.session(store, 'ses_target');
      Vitest.expect(result.files).toBe(2);
      Vitest.expect(result.lines).toBe(2);
      Vitest.expect(result.database).toBe(true);
      const first = readFileSync(join(store.directory, '2026-10-27.ndjson'), 'utf8');
      const second = readFileSync(join(store.directory, '2026-10-28.ndjson'), 'utf8');
      Vitest.expect(first).not.toContain('ses_target');
      Vitest.expect(first).toContain('ses_keep');
      Vitest.expect(second).not.toContain('ses_target');
      Vitest.expect(second).toContain('ses_keep_2');
      Vitest.expect(second.endsWith('\n')).toBe(false);
    });
  });

  Vitest.it('deletes a file when every line belonged to the session', async () => {
    await withStore((store) => {
      writeFileSync(join(store.directory, '2026-10-28.ndjson'), `${line('ses_target')}\n`);
      const result = Purge.session(store, 'ses_target');
      Vitest.expect(result.files).toBe(1);
      Vitest.expect(existsSync(join(store.directory, '2026-10-28.ndjson'))).toBe(false);
    });
  });

  Vitest.it('keeps malformed lines that cannot be attributed', async () => {
    await withStore((store) => {
      writeFileSync(
        join(store.directory, '2026-10-28.ndjson'),
        `not json\n${line('ses_target')}\n`,
      );
      const result = Purge.session(store, 'ses_target');
      Vitest.expect(result.lines).toBe(1);
      Vitest.expect(readFileSync(join(store.directory, '2026-10-28.ndjson'), 'utf8')).toBe(
        'not json\n',
      );
    });
  });
});
