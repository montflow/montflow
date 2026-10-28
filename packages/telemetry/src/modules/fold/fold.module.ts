// oxlint-disable-next-line montflow/no-node-platform-imports -- the fold is a filesystem pass over the telemetry directory; there is no Effect platform layer in the viewer and the adapter owns the driver.
import * as Fs from 'node:fs';
import { Option, Schema } from 'effect';
import type { JsonObject, Line } from '../event/index.js';
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

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, offset INTEGER NOT NULL);',
  'CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, title TEXT, agent TEXT, model TEXT, started_at INTEGER, ended_at INTEGER, span_count INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0);',
  'CREATE TABLE IF NOT EXISTS spans (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL, agent TEXT, model TEXT, cost REAL, input_tokens INTEGER, output_tokens INTEGER, payload TEXT NOT NULL);',
  'CREATE INDEX IF NOT EXISTS spans_session ON spans(session_id, ts, id);',
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

const numberField = (payload: JsonObject, key: string): number =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Number)(payload[key]), () => 0);

const objectField = (payload: JsonObject, key: string): JsonObject | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.JsonObject)(payload[key]));

const stringField = (payload: JsonObject, key: string): string | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(payload[key]));

const modelLabel = (line: Line): string | null =>
  line.model === undefined ? null : `${line.model.providerID}/${line.model.id}`;

const applySpan = (db: Sqlite.Database, line: Line): void => {
  const stepEnded = line.type === 'session.step.ended';
  const cost = stepEnded ? numberField(line.payload, 'cost') : 0;
  const tokens = stepEnded ? objectField(line.payload, 'tokens') : undefined;
  const inputTokens = tokens === undefined ? 0 : numberField(tokens, 'input');
  const outputTokens = tokens === undefined ? 0 : numberField(tokens, 'output');
  const model = modelLabel(line);
  const title =
    line.type === 'session.created' ? (stringField(line.payload, 'title') ?? null) : null;

  db.run(
    'INSERT INTO spans (session_id, ts, type, agent, model, cost, input_tokens, output_tokens, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
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

/**
 * Fold every NDJSON day file into `telemetry.db`, resuming each file at the
 * byte offset of its last complete line. Running twice without new bytes
 * inserts nothing; an appended file folds only its new lines. Malformed lines
 * are skipped by the tail reader.
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
    db.exec(SCHEMA);
    for (const name of Fs.readdirSync(options.directory)) {
      if (!name.endsWith('.ndjson')) continue;
      const path = `${options.directory.replace(/\/+$/u, '')}/${name}`;
      const size = Fs.statSync(path).size;
      const previous = db.all('SELECT offset FROM files WHERE path = ?', [name])[0];
      const offset = previous === undefined ? 0 : num(previous['offset']);
      if (size <= offset) continue;
      const tail = Tail.read(path, offset);
      if (tail.lines.length === 0 && tail.nextOffset === offset) continue;
      files += 1;
      db.exec('BEGIN');
      try {
        for (const line of tail.lines) {
          applySpan(db, line);
          spans += 1;
        }
        db.run(
          'INSERT INTO files (path, offset) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET offset = excluded.offset',
          [name, tail.nextOffset],
        );
        db.exec('COMMIT');
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

const spanOf = (row: Sqlite.Row): SpanRow => ({
  id: num(row['id']),
  sessionID: text(row['session_id']) ?? '',
  ts: num(row['ts']),
  type: text(row['type']) ?? '',
  agent: text(row['agent']),
  model: text(row['model']),
  cost: optionalNumber(row['cost']),
  payload: Option.getOrElse(
    Schema.decodeUnknownOption(Schema.JsonObject)(JSON.parse(text(row['payload']) ?? '{}')),
    () => ({}),
  ),
});

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
