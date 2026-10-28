import { Option, Schema } from 'effect';
import type { JsonObject, Line } from '../event/index.js';
import { file } from '../path/index.js';
import { Fs } from '../platform/index.js';
import * as Sqlite from '../sqlite/index.js';
import * as Tail from '../tail/index.js';

/** One folded history session. */
export interface SessionRow {
  readonly sessionID: string;
  readonly title: string | null;
  readonly agent: string | null;
  readonly model: string | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly spanCount: number;
  readonly costUSD: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** One span row from the folded history. */
export interface SpanRow {
  readonly id: number;
  readonly file: string;
  readonly sessionID: string;
  readonly ts: number;
  readonly type: string;
  readonly agent: string | null;
  readonly model: string | null;
  readonly cost: number | null;
  readonly payload: JsonObject;
}

/** Fold outcome used by the viewer and tests. */
export interface FoldResult {
  readonly files: number;
  readonly spans: number;
}

/** Bumped when the derived schema changes incompatibly. */
const SCHEMA_VERSION = 1;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, offset INTEGER NOT NULL, fingerprint TEXT NOT NULL DEFAULT '');`,
  'CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, title TEXT, agent TEXT, model TEXT, started_at INTEGER, ended_at INTEGER, span_count INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0);',
  "CREATE TABLE IF NOT EXISTS spans (id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT NOT NULL DEFAULT '', session_id TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL, agent TEXT, model TEXT, cost REAL, input_tokens INTEGER, output_tokens INTEGER, payload TEXT NOT NULL);",
  'CREATE INDEX IF NOT EXISTS spans_session ON spans(session_id, ts, id);',
  'CREATE INDEX IF NOT EXISTS spans_file ON spans(file);',
].join('\n');

const num = (value: Sqlite.SqlValue | undefined, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: Sqlite.SqlValue | undefined): string | null => {
  if (value === null || value === undefined) return null;
  return String(value);
};

const optionalNumber = (value: Sqlite.SqlValue | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const decodeNumber = Schema.decodeUnknownOption(Schema.Number);
const decodeJsonObject = Schema.decodeUnknownOption(Schema.JsonObject);
const decodeObject = Schema.decodeUnknownOption(Schema.JsonObject);
const decodeString = Schema.decodeUnknownOption(Schema.String);

const numberField = (payload: JsonObject, key: string): number =>
  Option.getOrElse(decodeNumber(payload[key]), () => 0);

const objectField = (payload: JsonObject, key: string): JsonObject | undefined =>
  Option.getOrUndefined(decodeObject(payload[key]));

const stringField = (payload: JsonObject, key: string): string | undefined =>
  Option.getOrUndefined(decodeString(payload[key]));

const modelLabel = (line: Line): string | null =>
  line.model === undefined ? null : `${line.model.providerID}/${line.model.id}`;

const applySpan = (db: Sqlite.Database, line: Line, fileName: string): void => {
  const stepEnded = line.type === 'session.step.ended';
  const cost = stepEnded ? numberField(line.payload, 'cost') : 0;
  const tokens = stepEnded ? objectField(line.payload, 'tokens') : undefined;
  const inputTokens = tokens === undefined ? 0 : numberField(tokens, 'input');
  const outputTokens = tokens === undefined ? 0 : numberField(tokens, 'output');
  const model = modelLabel(line);
  // The collector hashes `title`; `slug` is the only non-sensitive label left.
  const title =
    line.type === 'session.created'
      ? (stringField(line.payload, 'title') ?? stringField(line.payload, 'slug') ?? null)
      : null;

  db.run(
    'INSERT INTO spans (file, session_id, ts, type, agent, model, cost, input_tokens, output_tokens, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      fileName,
      line.sessionID,
      line.ts,
      line.type,
      line.agent ?? null,
      model,
      cost,
      inputTokens,
      outputTokens,
      JSON.stringify(line.payload),
    ],
  );
  db.run(
    `INSERT INTO sessions (session_id, title, agent, model, started_at, ended_at, span_count, cost_usd, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       title = COALESCE(excluded.title, sessions.title),
       agent = COALESCE(excluded.agent, sessions.agent),
       model = COALESCE(excluded.model, sessions.model),
       started_at = MIN(sessions.started_at, excluded.started_at),
       ended_at = MAX(sessions.ended_at, excluded.ended_at),
       span_count = sessions.span_count + 1,
       cost_usd = sessions.cost_usd + excluded.cost_usd,
       input_tokens = sessions.input_tokens + excluded.input_tokens,
       output_tokens = sessions.output_tokens + excluded.output_tokens`,
    [
      line.sessionID,
      title,
      line.agent ?? null,
      model,
      line.ts,
      line.ts,
      cost,
      inputTokens,
      outputTokens,
    ],
  );
};

const rebuildSession = (db: Sqlite.Database, sessionID: string): void => {
  const previous = db.all('SELECT title FROM sessions WHERE session_id = ?', [sessionID])[0];
  const title = previous === undefined ? null : text(previous['title']);
  db.run('DELETE FROM sessions WHERE session_id = ?', [sessionID]);
  db.run(
    `INSERT INTO sessions (session_id, title, agent, model, started_at, ended_at, span_count, cost_usd, input_tokens, output_tokens)
     SELECT session_id, NULL, MAX(agent), MAX(model), MIN(ts), MAX(ts), COUNT(*),
            COALESCE(SUM(cost), 0), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0)
     FROM spans WHERE session_id = ? GROUP BY session_id`,
    [sessionID],
  );
  if (title !== null) {
    db.run('UPDATE sessions SET title = ? WHERE session_id = ?', [title, sessionID]);
    const present = db.all('SELECT session_id FROM sessions WHERE session_id = ?', [sessionID])[0];
    if (present === undefined) {
      db.run('INSERT INTO sessions (session_id, title) VALUES (?, ?)', [sessionID, title]);
    }
  }
};

/** Drop one file's spans (after a truncate/rewrite) and rebuild affected sessions. */
const resetFile = (db: Sqlite.Database, fileName: string): void => {
  const dirty = db
    .all('SELECT DISTINCT session_id FROM spans WHERE file = ?', [fileName])
    .map((row) => text(row['session_id']))
    .filter((value): value is string => value !== null);
  db.run('DELETE FROM spans WHERE file = ?', [fileName]);
  db.run('UPDATE files SET offset = 0 WHERE path = ?', [fileName]);
  for (const sessionID of dirty) rebuildSession(db, sessionID);
};

const ensureSchema = (db: Sqlite.Database): void => {
  db.exec(SCHEMA);
  const columns = db.all('PRAGMA table_info(spans)').map((row) => text(row['name']));
  if (!columns.includes('file'))
    db.exec("ALTER TABLE spans ADD COLUMN file TEXT NOT NULL DEFAULT '';");
  const fileColumns = db.all('PRAGMA table_info(files)').map((row) => text(row['name']));
  if (!fileColumns.includes('fingerprint'))
    db.exec("ALTER TABLE files ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';");
  const version = num(db.all('PRAGMA user_version')[0]?.['user_version']);
  if (version > SCHEMA_VERSION) {
    throw new Error(`telemetry.db schema ${version} is newer than ${SCHEMA_VERSION}`);
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
};

/**
 * Fold every NDJSON day file into `telemetry.db`, resuming each file at the
 * byte offset of its last complete line. A per-file `BEGIN IMMEDIATE` makes two
 * concurrent folds serialize instead of inserting the same lines twice; a file
 * that shrank (truncate + rewrite) has its spans replaced. Running twice
 * without new bytes inserts nothing. Malformed lines are skipped by the tail.
 */
export const run = async (options: {
  readonly directory: string;
  readonly database: string;
}): Promise<FoldResult> => {
  if (!Fs.existsSync(options.directory)) return { files: 0, spans: 0 };
  const db = await Sqlite.open(options.database, true);
  let files = 0;
  let spans = 0;
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      ensureSchema(db);
      db.exec('COMMIT');
    } catch (cause) {
      db.exec('ROLLBACK');
      throw cause;
    }
    for (const name of Fs.readdirSync(options.directory)) {
      if (!name.endsWith('.ndjson')) continue;
      const path = file(options.directory, name);
      const size = Fs.statSync(path).size;
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous = db.all('SELECT offset, fingerprint FROM files WHERE path = ?', [name])[0];
        let offset = previous === undefined ? 0 : num(previous['offset']);
        const current = Tail.fingerprint(path, offset);
        const previousPrint = previous === undefined ? '' : (text(previous['fingerprint']) ?? '');
        if (
          size < offset ||
          (current !== '' && previousPrint !== '' && current !== previousPrint)
        ) {
          resetFile(db, name);
          offset = 0;
        }
        if (size <= offset) {
          db.exec('COMMIT');
          continue;
        }
        const tail = Tail.read(path, offset);
        if (tail.lines.length === 0 && tail.nextOffset === offset) {
          db.exec('COMMIT');
          continue;
        }
        for (const line of tail.lines) {
          applySpan(db, line, name);
          spans += 1;
        }
        db.run(
          'INSERT INTO files (path, offset, fingerprint) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET offset = excluded.offset, fingerprint = excluded.fingerprint',
          [name, tail.nextOffset, Tail.fingerprint(path, tail.nextOffset)],
        );
        db.exec('COMMIT');
        files += 1;
      } catch (cause) {
        db.exec('ROLLBACK');
        throw cause;
      }
    }
  } finally {
    db.close();
  }
  return { files, spans };
};

const sessionOf = (row: Sqlite.Row): SessionRow => ({
  sessionID: text(row['session_id']) ?? '',
  title: text(row['title']),
  agent: text(row['agent']),
  model: text(row['model']),
  startedAt: optionalNumber(row['started_at']),
  endedAt: optionalNumber(row['ended_at']),
  spanCount: num(row['span_count']),
  costUSD: num(row['cost_usd']),
  inputTokens: num(row['input_tokens']),
  outputTokens: num(row['output_tokens']),
});

const spanOf = (row: Sqlite.Row): SpanRow => {
  let payload: JsonObject = {};
  try {
    payload = Option.getOrElse(
      decodeJsonObject(JSON.parse(text(row['payload']) ?? '{}')),
      () => ({}),
    );
  } catch {
    // A corrupt derived row must not hide the rest of the session.
  }
  return {
    id: num(row['id']),
    file: text(row['file']) ?? '',
    sessionID: text(row['session_id']) ?? '',
    ts: num(row['ts']),
    type: text(row['type']) ?? '',
    agent: text(row['agent']),
    model: text(row['model']),
    cost: optionalNumber(row['cost']),
    payload,
  };
};

const readOnly = async (database: string): Promise<Sqlite.Database | undefined> => {
  if (!Fs.existsSync(database)) return undefined;
  return Sqlite.open(database, false);
};

/** Prior sessions, newest first. An absent database is an empty history. */
export const sessions = async (database: string): Promise<SessionRow[]> => {
  const db = await readOnly(database);
  if (db === undefined) return [];
  try {
    return db.all('SELECT * FROM sessions ORDER BY ended_at DESC, session_id').map(sessionOf);
  } finally {
    db.close();
  }
};

/** All folded spans for one session, oldest first. */
export const spans = async (database: string, sessionID: string): Promise<SpanRow[]> => {
  const db = await readOnly(database);
  if (db === undefined) return [];
  try {
    return db
      .all('SELECT * FROM spans WHERE session_id = ? ORDER BY ts, id', [sessionID])
      .map(spanOf);
  } finally {
    db.close();
  }
};

/** Byte offset already folded for every day file; live tails resume here. */
export const offsets = async (database: string): Promise<Record<string, number>> => {
  const db = await readOnly(database);
  if (db === undefined) return {};
  try {
    const result: Record<string, number> = {};
    for (const row of db.all('SELECT path, offset FROM files')) {
      const path = text(row['path']);
      if (path !== null) result[path] = num(row['offset']);
    }
    return result;
  } finally {
    db.close();
  }
};
