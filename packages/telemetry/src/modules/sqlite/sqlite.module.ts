/** SQLite value shape shared by both runtime drivers. */
export type SqlValue = string | number | bigint | null | Uint8Array;

/** One result row; columns are known to the query that produced it. */
export type Row = Readonly<Record<string, SqlValue | undefined>>;

/** Positional bindings for one statement. */
export type Params = SqlValue[];

/** Driver names retained for diagnostics and tests. */
export type Driver = 'bun:sqlite' | 'node:sqlite';

/** Minimal database surface the store and fold use; no driver details leak. */
export interface Database {
  readonly driver: Driver;
  all(sql: string, params?: Params): Row[];
  run(sql: string, params?: Params): void;
  exec(sql: string): void;
  close(): void;
}

const configure = (db: Database, writable: boolean): void => {
  db.exec('PRAGMA busy_timeout = 5000;');
  if (writable) db.exec('PRAGMA journal_mode = WAL;');
};

const hasBunSqlite = async (): Promise<boolean> => {
  try {
    await import('bun:sqlite');
    return true;
  } catch {
    return false;
  }
};

/**
 * Open `telemetry.db` through the first available driver: `bun:sqlite`, then
 * `node:sqlite`. Writable opens create the file and enable WAL; read-only opens
 * never write. This module is the only place a SQLite driver is referenced.
 */
export const open = async (path: string, writable: boolean): Promise<Database> => {
  if (await hasBunSqlite()) {
    const { Database } = await import('bun:sqlite');
    const db = writable
      ? new Database(path, { create: true })
      : new Database(path, { readonly: true });
    const wrapped: Database = {
      driver: 'bun:sqlite',
      // SAFETY: `bun:sqlite` returns the selected columns as one plain object per row; this adapter is the driver boundary and every caller reads named columns.
      all: (sql, params = []) => db.query(sql).all(...params) as Row[],
      run: (sql, params = []) => {
        db.query(sql).run(...params);
      },
      exec: (sql) => {
        db.exec(sql);
      },
      close: () => {
        db.close();
      },
    };
    configure(wrapped, writable);
    return wrapped;
  }
  // oxlint-disable-next-line montflow/no-node-platform-imports -- the fallback driver for runtimes without bun:sqlite; the isolation test proves this is the only driver reference outside tests.
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: !writable });
  const wrapped: Database = {
    driver: 'node:sqlite',
    // SAFETY: `node:sqlite` returns the selected columns as one plain object per row; this adapter is the driver boundary and every caller reads named columns.
    all: (sql, params = []) => db.prepare(sql).all(...params) as Row[],
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    exec: (sql) => {
      db.exec(sql);
    },
    close: () => {
      db.close();
    },
  };
  configure(wrapped, writable);
  return wrapped;
};
