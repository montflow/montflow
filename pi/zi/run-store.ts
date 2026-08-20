/**
 * Durable run snapshot store for the workspace router (SQLite).
 *
 * The router keeps agentic-run transcripts in memory (`cachedRuns`) so a
 * late-joining tab or page reload recovers a run even after the owning
 * backend disconnects. That cache dies with the router process; this SQLite
 * store persists the same snapshots so they survive router restarts too.
 *
 * Scope: the UI projection only — run id (uuid), workspace/folder, status,
 * transcript entries, tool activity, last-updated timestamp. The LIVE agent
 * conversation stays in its resumable pi session file; this store never
 * touches it, so resuming a run is unaffected.
 *
 * All encode/decode to/from the JSON columns goes through Effect Schema, so
 * a malformed or hand-edited row fails the schema on read instead of
 * silently producing garbage in the UI.
 *
 * Compatible with plain-node type stripping (the router daemon): erasable
 * TypeScript only; node:sqlite is imported lazily so an older Node falls
 * back to the in-memory cache instead of crashing.
 */

import { Schema } from 'effect';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

// ---------------------------------------------------------------------------
// Effect Schema — the single source of truth for a stored run
// ---------------------------------------------------------------------------

/** Run lifecycle states (mirrors the skillGen `status` field). */
export const RunStatusSchema = Schema.Literals([
  'running',
  'done',
  'awaiting',
  'interrupted',
  'error',
]);

/** One transcript entry (user prompt or assistant reply). */
export const RunEntrySchema = Schema.Struct({
  role: Schema.Literals(['user', 'assistant']),
  text: Schema.String,
});

/** Tool activity state (mirrors the skillGen `tools` field). */
export const RunToolStatusSchema = Schema.Literals(['running', 'done', 'error']);

export const RunToolSchema = Schema.Struct({
  name: Schema.String,
  status: RunToolStatusSchema,
  turn: Schema.Number,
  /** Tool-call arguments (absent in snapshots from before args existed). */
  args: Schema.optional(Schema.Unknown),
});

/** JSON-column codecs: entries/tools arrays ⇄ JSON strings. */
export const RunEntriesJsonSchema = Schema.fromJsonString(Schema.Array(RunEntrySchema));
export const RunToolsJsonSchema = Schema.fromJsonString(Schema.Array(RunToolSchema));

/** The full stored run: identity + metadata + UI transcript projection. */
export const StoredRunSchema = Schema.Struct({
  /** Client-generated run id (uuid). */
  runId: Schema.String,
  /** Folder slug the run belongs to. */
  folder: Schema.String,
  workspaceId: Schema.String,
  status: RunStatusSchema,
  entries: Schema.Array(RunEntrySchema),
  tools: Schema.Array(RunToolSchema),
  /** Short generated title (opencode big-pickle); absent until ready. */
  title: Schema.optional(Schema.String),
  /** Epoch ms of the last upsert. */
  updatedAt: Schema.Number,
});

export type StoredRun = Schema.Schema.Type<typeof StoredRunSchema>;

/** Encode a transcript into its JSON-column form (throws on invalid input). */
export const encodeEntries = (entries: StoredRun['entries']): string =>
  Schema.encodeSync(RunEntriesJsonSchema)(entries);

/** Decode a transcript JSON column (throws on malformed input). */
export const decodeEntries = (json: string): StoredRun['entries'] =>
  Schema.decodeUnknownSync(RunEntriesJsonSchema)(json);

/** Encode tool activity into its JSON-column form. */
export const encodeTools = (tools: StoredRun['tools']): string =>
  Schema.encodeSync(RunToolsJsonSchema)(tools);

/** Decode a tool-activity JSON column (throws on malformed input). */
export const decodeTools = (json: string): StoredRun['tools'] =>
  Schema.decodeUnknownSync(RunToolsJsonSchema)(json);

// ---------------------------------------------------------------------------
// SQLite store
// ---------------------------------------------------------------------------

/** How long snapshots are kept before pruning on open. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface RunStore {
  /** Insert or replace a run snapshot. */
  upsert(run: StoredRun): void;
  /** Load one run snapshot, or null when missing/corrupt. */
  load(runId: string): StoredRun | null;
  /** All stored snapshots, newest first. */
  list(): StoredRun[];
  close(): void;
}

/** Map a flat SQLite row (snake_case, JSON columns) back to a typed run. */
const rowToRun = (row: unknown): StoredRun => {
  const r = row as {
    run_id?: unknown;
    folder?: unknown;
    workspace_id?: unknown;
    status?: unknown;
    entries?: unknown;
    tools?: unknown;
    title?: unknown;
    updated_at?: unknown;
  };
  return Schema.decodeUnknownSync(StoredRunSchema)({
    runId: r.run_id,
    folder: r.folder,
    workspaceId: r.workspace_id,
    status: r.status,
    entries: typeof r.entries === 'string' ? decodeEntries(r.entries) : r.entries,
    tools: typeof r.tools === 'string' ? decodeTools(r.tools) : r.tools,
    title: typeof r.title === 'string' ? r.title : undefined,
    updatedAt: r.updated_at,
  });
};

class SqliteRunStore implements RunStore {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  upsert(run: StoredRun): void {
    this.#db
      .prepare(
        `INSERT INTO runs (run_id, folder, workspace_id, status, entries, tools, title, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET
           folder = excluded.folder,
           workspace_id = excluded.workspace_id,
           status = excluded.status,
           entries = excluded.entries,
           tools = excluded.tools,
           title = excluded.title,
           updated_at = excluded.updated_at`,
      )
      .run(
        run.runId,
        run.folder,
        run.workspaceId,
        run.status,
        encodeEntries(run.entries),
        encodeTools(run.tools),
        run.title ?? null,
        run.updatedAt,
      );
  }

  load(runId: string): StoredRun | null {
    try {
      const row = this.#db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId);
      return row === undefined ? null : rowToRun(row);
    } catch {
      return null; // corrupt row — caller falls back to not-found
    }
  }

  list(): StoredRun[] {
    try {
      const rows = this.#db.prepare('SELECT * FROM runs ORDER BY updated_at DESC').all();
      const runs: StoredRun[] = [];
      for (const row of rows) {
        try {
          runs.push(rowToRun(row));
        } catch {
          // skip corrupt rows rather than failing the whole load
        }
      }
      return runs;
    } catch {
      return [];
    }
  }

  close(): void {
    this.#db.close();
  }
}

/**
 * Opens (creating if needed) the SQLite run store at `dbPath`. Returns null
 * when node:sqlite is unavailable (older Node) or the file cannot be opened
 * — callers keep the in-memory cache as the source of truth then.
 */
export const openRunStore = async (dbPath: string): Promise<RunStore | null> => {
  let DatabaseSyncCtor: typeof DatabaseSync;
  try {
    ({ DatabaseSync: DatabaseSyncCtor } = await import('node:sqlite'));
  } catch {
    return null; // node:sqlite unavailable
  }
  try {
    // SQLite does not create missing parent directories — the state dir may
    // not exist yet on first boot (router.json is written later in main()).
    await mkdir(dirname(dbPath), { recursive: true });
    const db = new DatabaseSyncCtor(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(
      `CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        folder TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        entries TEXT NOT NULL,
        tools TEXT NOT NULL,
        title TEXT,
        updated_at INTEGER NOT NULL
      )`,
    );
    // Migrate databases created before the title column existed.
    try {
      db.exec('ALTER TABLE runs ADD COLUMN title TEXT');
    } catch {
      // Column already present — nothing to do.
    }
    db.prepare('DELETE FROM runs WHERE updated_at < ?').run(Date.now() - RETENTION_MS);
    return new SqliteRunStore(db);
  } catch {
    return null; // open/init failure — non-fatal
  }
};
