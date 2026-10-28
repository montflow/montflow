import * as Vitest from '@effect/vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Sqlite from '../index.js';

const withDatabase = async (run: (path: string) => Promise<void>): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-sqlite-'));
  try {
    await run(join(directory, 'telemetry.db'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

Vitest.describe('Sqlite.open runtime', () => {
  Vitest.it('opens writable through the first driver with WAL and a busy timeout', async () => {
    await withDatabase(async (path) => {
      const db = await Sqlite.open(path, true);
      try {
        Vitest.expect(['bun:sqlite', 'node:sqlite']).toContain(db.driver);
        db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);');
        db.run('INSERT INTO t (name) VALUES (?)', ['one']);
        Vitest.expect(db.all('SELECT id, name FROM t').map((row) => ({ ...row }))).toStrictEqual([
          { id: 1, name: 'one' },
        ]);
        const journal = db.all('PRAGMA journal_mode');
        Vitest.expect(String(journal[0]?.['journal_mode']).toLowerCase()).toBe('wal');
        const busy = db.all('PRAGMA busy_timeout');
        Vitest.expect(Number(busy[0]?.['timeout'])).toBe(5000);
      } finally {
        db.close();
      }
    });
  });

  Vitest.it('opens read-only and refuses writes', async () => {
    await withDatabase(async (path) => {
      const writable = await Sqlite.open(path, true);
      writable.exec('CREATE TABLE t (id INTEGER PRIMARY KEY);');
      writable.close();
      const db = await Sqlite.open(path, false);
      try {
        Vitest.expect(() => db.run('INSERT INTO t (id) VALUES (1)')).toThrow();
      } finally {
        db.close();
      }
    });
  });
});
