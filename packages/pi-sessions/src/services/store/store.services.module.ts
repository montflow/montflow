import { Clock, Context, Data, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import * as ReceiptSchema from '../../modules/receipt/receipt.module.ts';
import * as SessionSchema from '../../modules/session/session.module.ts';
import * as SessionEventSchema from '../../modules/session-event/session-event.module.ts';
import * as VerifySchema from '../../modules/verify/verify.module.ts';

export class StoreError extends Data.TaggedError('@montflow/StoreError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/** File paths (or opaque keys) for one session. */
export interface SessionFiles {
  readonly sessionMd: string;
  readonly session: string;
  readonly receipt: string;
}

/**
 * Storage backend. File and memory implementations share every rule in
 * `build` — backends move strings, never decide transitions.
 */
export interface Backend {
  readonly filesFor: (id: string) => SessionFiles;
  readonly readText: (operation: string, file: string) => Effect.Effect<string, StoreError>;
  readonly writeText: (
    operation: string,
    file: string,
    text: string,
  ) => Effect.Effect<void, StoreError>;
  readonly exists: (file: string) => Effect.Effect<boolean, never>;
  readonly listSessionIds: (operation: string) => Effect.Effect<ReadonlyArray<string>, StoreError>;
  readonly withLock: <A, E>(
    operation: string,
    id: string,
    self: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | StoreError>;
}

const fail = (operation: string, reason: string): Effect.Effect<never, StoreError> =>
  Effect.fail(new StoreError({ operation, reason }));

/** Path segments (under a repo root) owning the sessions store. Shared with surfaces. */
export const SESSIONS_SEGMENTS = ['.agents', '@montflow', 'sessions'] as const;

/** File name Pi writes the session's native session to, inside the session directory. */
export const NATIVE_SESSION_FILE = 'pi-session.jsonl';

/**
 * A held `.lock` older than this is treated as left behind by a crashed
 * writer and reclaimed. The lock is an *empty* directory, so it carries no
 * committable file — only a mid-write crash leaves one behind.
 */
const STALE_LOCK_MILLIS = 60_000;

/** Actionable error for a held lock: name the session and the lock directory. */
const lockedMessage = (id: string, lockDir: string): string =>
  `session '${id}' is locked by another writer at '${lockDir}'; remove it if no writer is active`;

const defaultRoot = (path: Path.Path): string => path.join(process.cwd(), ...SESSIONS_SEGMENTS);

const repoRelativeSession = (id: string): string =>
  [...SESSIONS_SEGMENTS, id, 'session.jsonl'].join('/');

const nowIso: Effect.Effect<string> = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => new Date(millis).toISOString()),
);

const toStoreError =
  (operation: string) =>
  // `cause` is the rule's exempt name for error-cause enrichment.
  (cause: unknown): StoreError =>
    new StoreError({ operation, reason: cause instanceof Error ? cause.message : String(cause) });

const frontmatter = (
  data:
    | Schema.Codec.Encoded<typeof SessionSchema.Session>
    | Schema.Codec.Encoded<typeof ReceiptSchema.Receipt>,
  body: string,
): string => `---\n${JSON.stringify(data)}\n---\n${body}`;

const renderBody = (
  session: SessionSchema.Session,
  events: ReadonlyArray<SessionEventSchema.Event>,
): string => {
  const turns = events
    .map((event) => `## turn ${event.seq} — ${event.role}\n${event.text}\n`)
    .join('\n');
  return `# session ${session.id}\n\n${turns}`;
};

const decodeId = (operation: string, id: string) =>
  Schema.decodeUnknownEffect(SessionSchema.Id)(id).pipe(
    Effect.mapError((error) => new StoreError({ operation, reason: String(error) })),
  );

const fileBackend = (fs: FileSystem.FileSystem, path: Path.Path, root: string): Backend => {
  const lockFor = (id: string): string => path.join(root, id, '.lock');
  const sessionDirFor = (id: string): string => path.join(root, id);

  /** True when the lock directory's mtime is older than the stale threshold. */
  const lockIsStale = (operation: string, lockDir: string): Effect.Effect<boolean, never> =>
    Effect.gen(function* () {
      const info = yield* fs.stat(lockDir).pipe(Effect.mapError(toStoreError(operation)));
      const now = yield* Clock.currentTimeMillis;
      return Option.match(info.mtime, {
        onNone: () => false,
        onSome: (mtime) => now - mtime.getTime() >= STALE_LOCK_MILLIS,
      });
    }).pipe(Effect.catch(() => Effect.succeed(false)));

  /**
   * Acquire the per-session lock directory. A live holder fails the write with an
   * actionable error; a stale holder (crashed writer) is reclaimed once. The
   * lock is an empty directory, so git never tracks it.
   */
  const acquireLock = (operation: string, id: string): Effect.Effect<void, StoreError> =>
    Effect.gen(function* () {
      const lockDir = lockFor(id);
      yield* fs
        .makeDirectory(sessionDirFor(id), { recursive: true })
        .pipe(Effect.mapError(toStoreError(operation)));
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const acquired = yield* fs.makeDirectory(lockDir).pipe(
          Effect.matchEffect({
            onSuccess: () => Effect.succeed(true),
            onFailure: (error) =>
              error.reason['_tag'] === 'AlreadyExists'
                ? Effect.succeed(false)
                : Effect.fail(toStoreError(operation)(error)),
          }),
        );
        if (acquired) return;
        if (!(yield* lockIsStale(operation, lockDir))) {
          return yield* fail(operation, lockedMessage(id, lockDir));
        }
        yield* fs
          .remove(lockDir, { recursive: true })
          .pipe(Effect.mapError(toStoreError(operation)));
      }
      return yield* fail(operation, lockedMessage(id, lockDir));
    });

  return {
    filesFor: (id) => ({
      sessionMd: path.join(root, id, 'session.md'),
      session: path.join(root, id, 'session.jsonl'),
      receipt: path.join(root, id, 'receipt.md'),
    }),
    readText: (operation, file) =>
      fs.readFileString(file).pipe(Effect.mapError(toStoreError(operation))),
    writeText: (operation, file, text) =>
      Effect.gen(function* () {
        yield* fs
          .makeDirectory(path.dirname(file), { recursive: true })
          .pipe(Effect.mapError(toStoreError(operation)));
        // Atomic replace: write a sibling temp file, then rename over the
        // target. A concurrent reader (the workspace's 1s detail poll) sees
        // either the old or the new file, never a truncated mid-write.
        const temp = `${file}.tmp`;
        yield* fs.writeFileString(temp, text).pipe(Effect.mapError(toStoreError(operation)));
        yield* fs.rename(temp, file).pipe(Effect.mapError(toStoreError(operation)));
      }),
    exists: (file) =>
      fs.access(file).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(false),
          onSuccess: () => Effect.succeed(true),
        }),
      ),
    listSessionIds: (operation) =>
      Effect.gen(function* () {
        const names = yield* fs.readDirectory(root).pipe(Effect.mapError(toStoreError(operation)));
        const ids: Array<string> = [];
        for (const name of names) {
          if (name.startsWith('.')) continue;
          const info = yield* fs
            .stat(path.join(root, name))
            .pipe(Effect.mapError(toStoreError(operation)));
          if (info.type === 'Directory') {
            ids.push(name);
          }
        }
        return ids;
      }),
    withLock: (operation, id, self) =>
      Effect.acquireUseRelease(
        acquireLock(operation, id),
        () => self,
        () => fs.remove(lockFor(id), { recursive: true }).pipe(Effect.ignore),
      ),
  };
};

const MEMORY_PREFIX = 'memory:';

const memoryBackend = (): Backend => {
  const files = new Map<string, string>();
  const seen = new Map<string, SessionFiles>();
  const filesFor = (id: string): SessionFiles => {
    const known = seen.get(id);
    if (known !== undefined) return known;
    const fresh: SessionFiles = {
      sessionMd: `${MEMORY_PREFIX}${id}:session.md`,
      session: `${MEMORY_PREFIX}${id}:session.jsonl`,
      receipt: `${MEMORY_PREFIX}${id}:receipt.md`,
    };
    seen.set(id, fresh);
    return fresh;
  };
  return {
    filesFor,
    readText: (operation, file) => {
      const text = files.get(file);
      return text === undefined ? fail(operation, `missing '${file}'`) : Effect.succeed(text);
    },
    writeText: (_operation, file, text) =>
      Effect.sync(() => {
        files.set(file, text);
      }),
    exists: (file) => Effect.succeed(files.has(file)),
    listSessionIds: (_operation) =>
      Effect.succeed(
        [...seen.entries()].flatMap(([id, locations]) =>
          files.has(locations.sessionMd) ? [id] : [],
        ),
      ),
    withLock: (_operation, _id, self) => self,
  };
};

/** Mutable session constructor input: base fields plus the optional display captures. */
interface SessionInput {
  id: SessionSchema.Id;
  parent: SessionSchema.Id | null;
  status: SessionSchema.Status;
  created: string;
  updated: string;
  sessionFile: string;
  name?: string;
  prompt?: string;
  model?: string;
  thinking?: SessionSchema.ThinkingLevel;
  tools?: ReadonlyArray<string>;
  related?: ReadonlyArray<SessionSchema.Id>;
  spec?: string;
  progress?: string;
}

/**
 * Rebuild a session over new base fields while keeping its display captures
 * (name, prompt, model) and session-shaping inputs (tools). Module scope:
 * pure, so the linter keeps it out of the per-backend builder.
 * @param session - session carrying the captures
 * @param base - replacement identity and lifecycle fields
 * @returns rebuilt session
 */
const withExtras = (
  session: SessionSchema.Session,
  base: {
    readonly id: SessionSchema.Id;
    readonly parent: SessionSchema.Id | null;
    readonly status: SessionSchema.Status;
    readonly created: string;
    readonly updated: string;
    readonly sessionFile: string;
    readonly progress?: string | undefined;
  },
): SessionSchema.Session => {
  const input: SessionInput = {
    id: base.id,
    parent: base.parent,
    status: base.status,
    created: base.created,
    updated: base.updated,
    sessionFile: base.sessionFile,
  };
  if (session.name !== undefined) input.name = session.name;
  if (session.prompt !== undefined) input.prompt = session.prompt;
  if (session.model !== undefined) input.model = session.model;
  if (session.thinking !== undefined) input.thinking = session.thinking;
  if (session.tools !== undefined) input.tools = session.tools;
  if (session.related !== undefined) input.related = session.related;
  if (session.spec !== undefined) input.spec = session.spec;
  if (base.progress !== undefined) input.progress = base.progress;
  else if (session.progress !== undefined) input.progress = session.progress;
  return new SessionSchema.Session(input);
};

/** Inputs to `Store.create`: id plus optional parent and display captures. */
export interface CreateArgs {
  id: string;
  parent?: string;
  name?: string;
  prompt?: string;
  model?: string;
  thinking?: SessionSchema.ThinkingLevel;
  tools?: ReadonlyArray<string>;
  related?: ReadonlyArray<string>;
  spec?: string;
}

const build = (backend: Backend) => {
  const extractFrontmatter = (operation: string, text: string): Effect.Effect<string, StoreError> =>
    Effect.try({
      try: () => {
        const lines = text.split('\n');
        if (lines[0] !== '---') throw new Error('missing opening ---');
        const end = lines.indexOf('---', 1);
        if (end === -1) throw new Error('missing closing ---');
        return lines.slice(1, end).join('\n');
      },
      catch: toStoreError(operation),
    });

  const decodeSession = (
    operation: string,
    json: string,
  ): Effect.Effect<SessionSchema.Session, StoreError> =>
    Effect.try({
      try: () => Schema.decodeUnknownSync(SessionSchema.Session)(JSON.parse(json)),
      catch: toStoreError(operation),
    });

  const decodeEvent = (
    operation: string,
    line: string,
  ): Effect.Effect<SessionEventSchema.Event, StoreError> =>
    Effect.try({
      try: () => Schema.decodeUnknownSync(SessionEventSchema.Event)(JSON.parse(line)),
      catch: toStoreError(operation),
    });

  const decodeReceipt = (
    operation: string,
    json: string,
  ): Effect.Effect<ReceiptSchema.Receipt, StoreError> =>
    Effect.try({
      try: () => Schema.decodeUnknownSync(ReceiptSchema.Receipt)(JSON.parse(json)),
      catch: toStoreError(operation),
    });

  const readEvents = (
    operation: string,
    id: string,
  ): Effect.Effect<Array<SessionEventSchema.Event>, StoreError> =>
    Effect.gen(function* () {
      const file = backend.filesFor(id).session;
      if (!(yield* backend.exists(file))) return [];
      const text = yield* backend.readText(operation, file);
      const lines = text.split('\n').filter((line) => line.trim().length > 0);
      const events: Array<SessionEventSchema.Event> = [];
      for (const line of lines) {
        events.push(yield* decodeEvent(operation, line));
      }
      return events;
    });

  const readSession = (
    operation: string,
    id: string,
  ): Effect.Effect<SessionSchema.Session, StoreError> =>
    Effect.gen(function* () {
      const text = yield* backend.readText(operation, backend.filesFor(id).sessionMd);
      const json = yield* extractFrontmatter(operation, text);
      return yield* decodeSession(operation, json);
    });

  const readReceipt = (
    operation: string,
    id: string,
  ): Effect.Effect<ReceiptSchema.Receipt | null, StoreError> =>
    Effect.gen(function* () {
      const file = backend.filesFor(id).receipt;
      if (!(yield* backend.exists(file))) return null;
      const text = yield* backend.readText(operation, file);
      const json = yield* extractFrontmatter(operation, text);
      return yield* decodeReceipt(operation, json);
    });

  const create = (args: CreateArgs) =>
    Effect.gen(function* () {
      const operation = 'Store.create';
      const id = yield* decodeId(operation, args.id);
      return yield* backend.withLock(
        operation,
        id,
        Effect.gen(function* () {
          if (yield* backend.exists(backend.filesFor(id).sessionMd)) {
            return yield* fail(operation, `session '${id}' already exists`);
          }
          const parent = args.parent !== undefined ? yield* decodeId(operation, args.parent) : null;
          const related =
            args.related === undefined
              ? undefined
              : yield* Effect.forEach(args.related, (entry) => decodeId(operation, entry));
          const stamp = yield* nowIso;
          const input: SessionInput = {
            id,
            parent,
            status: 'pending',
            created: stamp,
            updated: stamp,
            sessionFile: repoRelativeSession(id),
          };
          if (args.name !== undefined) input.name = args.name;
          if (args.prompt !== undefined) input.prompt = args.prompt;
          if (args.model !== undefined) input.model = args.model;
          if (args.thinking !== undefined) input.thinking = args.thinking;
          if (args.tools !== undefined) input.tools = args.tools;
          if (related !== undefined) input.related = related;
          if (args.spec !== undefined) input.spec = args.spec;
          const session = new SessionSchema.Session(input);
          const files = backend.filesFor(id);
          yield* backend.writeText(
            operation,
            files.sessionMd,
            frontmatter(SessionSchema.encode(session), `# session ${id}\n\n`),
          );
          yield* backend.writeText(operation, files.session, '');
          return session;
        }),
      );
    });

  const start = (sessionId: string) =>
    backend.withLock(
      'Store.start',
      sessionId,
      Effect.gen(function* () {
        const operation = 'Store.start';
        const id = yield* decodeId(operation, sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'pending') {
          return yield* fail(
            operation,
            `cannot start session '${id}' from status '${session.status}'`,
          );
        }
        const started = withExtras(session, {
          id: session.id,
          parent: session.parent,
          status: 'running' as const,
          created: session.created,
          updated: yield* nowIso,
          sessionFile: session.sessionFile,
        });
        const events = yield* readEvents(operation, id);
        const files = backend.filesFor(id);
        yield* backend.writeText(
          operation,
          files.sessionMd,
          frontmatter(SessionSchema.encode(started), renderBody(started, events)),
        );
        return started;
      }),
    );

  /**
   * Persist one transcript event under the caller's lock: append it to
   * `session.jsonl` and rewrite the `session.md` body so both files stay in sync.
   * `message` carries the raw Pi value for replay; `text` is the display
   * projection.
   */
  const persistEvent = (
    operation: string,
    session: SessionSchema.Session,
    events: ReadonlyArray<SessionEventSchema.Event>,
    event: {
      readonly role: SessionEventSchema.Role;
      readonly text: string;
      readonly subsessionId: SessionSchema.Id | undefined;
      readonly message: unknown;
    },
  ): Effect.Effect<SessionEventSchema.Event, StoreError> =>
    Effect.gen(function* () {
      const input: SessionEventSchema.EventInput = {
        seq: events.length + 1,
        role: event.role,
        text: event.text,
        at: yield* nowIso,
      };
      if (event.subsessionId !== undefined) input.subsessionId = event.subsessionId;
      if (event.message !== undefined) input.message = event.message;
      const created = new SessionEventSchema.Event(input);
      const prior = events
        .map((entry) => JSON.stringify(SessionEventSchema.encode(entry)))
        .join('\n');
      const files = backend.filesFor(session.id);
      yield* backend.writeText(
        operation,
        files.session,
        `${prior}${events.length > 0 ? '\n' : ''}${JSON.stringify(SessionEventSchema.encode(created))}\n`,
      );
      yield* backend.writeText(
        operation,
        files.sessionMd,
        frontmatter(SessionSchema.encode(session), renderBody(session, [...events, created])),
      );
      return created;
    });

  const append = (args: {
    readonly sessionId: string;
    readonly role: SessionEventSchema.Role;
    readonly text: string;
    readonly subsessionId?: string;
    /** Raw Pi `Message` JSON for lossless replay; `text` is the display projection. */
    readonly message?: unknown;
  }) =>
    backend.withLock(
      'Store.append',
      args.sessionId,
      Effect.gen(function* () {
        const operation = 'Store.append';
        const id = yield* decodeId(operation, args.sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'running' && session.status !== 'awaiting-input') {
          return yield* fail(
            operation,
            `cannot append to session '${id}' with status '${session.status}'`,
          );
        }
        const events = yield* readEvents(operation, id);
        const subsessionId =
          args.subsessionId !== undefined
            ? yield* decodeId(operation, args.subsessionId)
            : undefined;
        return yield* persistEvent(operation, session, events, {
          role: args.role,
          text: args.text,
          subsessionId,
          message: args.message,
        });
      }),
    );

  const settle = (args: {
    readonly sessionId: string;
    readonly outcome: ReceiptSchema.Outcome;
    readonly summary: string;
  }) =>
    backend.withLock(
      'Store.settle',
      args.sessionId,
      Effect.gen(function* () {
        const operation = 'Store.settle';
        const id = yield* decodeId(operation, args.sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'running' && session.status !== 'awaiting-input') {
          return yield* fail(
            operation,
            `cannot settle session '${id}' from status '${session.status}'`,
          );
        }
        const files = backend.filesFor(id);
        if (yield* backend.exists(files.receipt)) {
          return yield* fail(operation, `session '${id}' already has a receipt`);
        }
        const receipt = new ReceiptSchema.Receipt({
          sessionId: id,
          outcome: args.outcome,
          summary: args.summary,
          endedAt: yield* nowIso,
        });
        yield* backend.writeText(
          operation,
          files.receipt,
          frontmatter(ReceiptSchema.encode(receipt), `# receipt ${id}\n\n${args.summary}\n`),
        );
        const settled = withExtras(session, {
          id: session.id,
          parent: session.parent,
          status: args.outcome,
          created: session.created,
          updated: yield* nowIso,
          sessionFile: session.sessionFile,
        });
        const events = yield* readEvents(operation, id);
        yield* backend.writeText(
          operation,
          files.sessionMd,
          frontmatter(SessionSchema.encode(settled), renderBody(settled, events)),
        );
        return receipt;
      }),
    );

  const ask = (args: { readonly sessionId: string; readonly question: string }) =>
    backend.withLock(
      'Store.ask',
      args.sessionId,
      Effect.gen(function* () {
        const operation = 'Store.ask';
        const id = yield* decodeId(operation, args.sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'running') {
          return yield* fail(
            operation,
            `cannot ask on session '${id}' with status '${session.status}'`,
          );
        }
        const parked = withExtras(session, {
          id: session.id,
          parent: session.parent,
          status: 'awaiting-input' as const,
          created: session.created,
          updated: yield* nowIso,
          sessionFile: session.sessionFile,
        });
        const events = yield* readEvents(operation, id);
        yield* persistEvent(operation, parked, events, {
          role: 'system',
          text: args.question,
          subsessionId: undefined,
          message: undefined,
        });
        return parked;
      }),
    );

  const answer = (args: {
    readonly sessionId: string;
    readonly text: string;
    readonly message?: unknown;
  }) =>
    backend.withLock(
      'Store.answer',
      args.sessionId,
      Effect.gen(function* () {
        const operation = 'Store.answer';
        const id = yield* decodeId(operation, args.sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'awaiting-input') {
          return yield* fail(
            operation,
            `cannot answer session '${id}' with status '${session.status}'`,
          );
        }
        const resumed = withExtras(session, {
          id: session.id,
          parent: session.parent,
          status: 'running' as const,
          created: session.created,
          updated: yield* nowIso,
          sessionFile: session.sessionFile,
        });
        const events = yield* readEvents(operation, id);
        return yield* persistEvent(operation, resumed, events, {
          role: 'user',
          text: args.text,
          subsessionId: undefined,
          message: args.message,
        });
      }),
    );

  /**
   * Leave the parked `awaiting-input` state without recording a turn. The
   * answer itself lives in the `ask_user` tool result, so the engine must not
   * wedge a user turn between the assistant tool call and that result.
   */
  const unpark = (sessionId: string) =>
    backend.withLock(
      'Store.unpark',
      sessionId,
      Effect.gen(function* () {
        const operation = 'Store.unpark';
        const id = yield* decodeId(operation, sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'awaiting-input') {
          return yield* fail(
            operation,
            `cannot unpark session '${id}' from status '${session.status}'`,
          );
        }
        const running = withExtras(session, {
          id: session.id,
          parent: session.parent,
          status: 'running' as const,
          created: session.created,
          updated: yield* nowIso,
          sessionFile: session.sessionFile,
        });
        const events = yield* readEvents(operation, id);
        const files = backend.filesFor(id);
        yield* backend.writeText(
          operation,
          files.sessionMd,
          frontmatter(SessionSchema.encode(running), renderBody(running, events)),
        );
        return running;
      }),
    );

  const cancel = (sessionId: string) =>
    backend.withLock(
      'Store.cancel',
      sessionId,
      Effect.gen(function* () {
        const operation = 'Store.cancel';
        const id = yield* decodeId(operation, sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'running' && session.status !== 'awaiting-input') {
          return yield* fail(
            operation,
            `cannot cancel session '${id}' from status '${session.status}'`,
          );
        }
        const files = backend.filesFor(id);
        if (yield* backend.exists(files.receipt)) {
          return yield* fail(operation, `session '${id}' already has a receipt`);
        }
        const receipt = new ReceiptSchema.Receipt({
          sessionId: id,
          outcome: 'cancelled' as const,
          summary: 'Interrupted by the user.',
          endedAt: yield* nowIso,
        });
        yield* backend.writeText(
          operation,
          files.receipt,
          frontmatter(
            ReceiptSchema.encode(receipt),
            `# receipt ${id}\n\nInterrupted by the user.\n`,
          ),
        );
        const cancelled = withExtras(session, {
          id: session.id,
          parent: session.parent,
          status: 'cancelled' as const,
          created: session.created,
          updated: yield* nowIso,
          sessionFile: session.sessionFile,
        });
        const events = yield* readEvents(operation, id);
        yield* backend.writeText(
          operation,
          files.sessionMd,
          frontmatter(SessionSchema.encode(cancelled), renderBody(cancelled, events)),
        );
        return receipt;
      }),
    );

  const load = (sessionId: string) =>
    Effect.gen(function* () {
      const operation = 'Store.load';
      const id = yield* decodeId(operation, sessionId);
      const session = yield* readSession(operation, id);
      const events = yield* readEvents(operation, id);
      const receipt = yield* readReceipt(operation, id);
      if (
        receipt === null &&
        (session.status === 'done' || session.status === 'failed' || session.status === 'cancelled')
      ) {
        return yield* fail(operation, `session '${id}' is '${session.status}' but has no receipt`);
      }
      if (receipt !== null && session.status !== receipt.outcome) {
        return yield* fail(
          operation,
          `session '${id}' status '${session.status}' mismatches receipt outcome '${receipt.outcome}'`,
        );
      }
      if (receipt !== null && receipt.sessionId !== id) {
        return yield* fail(operation, `session '${id}' receipt belongs to '${receipt.sessionId}'`);
      }
      const verdict = yield* verify(id);
      if (!verdict.valid) {
        const detail = verdict.issues
          .map((entry) => `[${entry.field}] ${entry.message}`)
          .join('; ');
        return yield* fail(operation, `session '${id}' failed verification: ${detail}`);
      }
      return { session, events, receipt };
    });

  const list = () =>
    Effect.gen(function* () {
      const operation = 'Store.list';
      const ids = yield* backend.listSessionIds(operation);
      const sessions: Array<SessionSchema.Session> = [];
      for (const id of [...ids].toSorted()) {
        const session = yield* readSession(operation, id).pipe(
          Effect.matchEffect({
            onSuccess: (value) => Effect.succeed(value),
            onFailure: (error) =>
              Effect.logWarning(
                `Store.list: skipping unreadable session '${id}': ${error.reason}`,
              ).pipe(Effect.as(undefined)),
          }),
        );
        if (session !== undefined) sessions.push(session);
      }
      return sessions;
    });

  /**
   * Mechanically verify one session's raw files: validity plus resumability. Pure
   * checks live in the verify module; this reads the files the backend owns.
   */
  /**
   * Record an agent-posted progress line on a live session. Lifecycle status is
   * unchanged; the message lands in `session.md` frontmatter for the UI to read.
   */
  const progress = (args: { readonly sessionId: string; readonly message: string }) =>
    backend.withLock(
      'Store.progress',
      args.sessionId,
      Effect.gen(function* () {
        const operation = 'Store.progress';
        const id = yield* decodeId(operation, args.sessionId);
        const session = yield* readSession(operation, id);
        if (session.status !== 'running' && session.status !== 'awaiting-input') {
          return yield* fail(
            operation,
            `cannot update progress on session '${id}' with status '${session.status}'`,
          );
        }
        const updated = withExtras(session, {
          id: session.id,
          parent: session.parent,
          status: session.status,
          created: session.created,
          updated: yield* nowIso,
          sessionFile: session.sessionFile,
          progress: args.message,
        });
        const events = yield* readEvents(operation, id);
        const files = backend.filesFor(id);
        yield* backend.writeText(
          operation,
          files.sessionMd,
          frontmatter(SessionSchema.encode(updated), renderBody(updated, events)),
        );
        return updated;
      }),
    );

  const verify = (sessionId: string) =>
    Effect.gen(function* () {
      const operation = 'Store.verify';
      const id = yield* decodeId(operation, sessionId);
      const files = backend.filesFor(id);
      const sessionMd = yield* backend.readText(operation, files.sessionMd);
      const session = (yield* backend.exists(files.session))
        ? yield* backend.readText(operation, files.session)
        : '';
      const receipt = (yield* backend.exists(files.receipt))
        ? yield* backend.readText(operation, files.receipt)
        : undefined;
      return VerifySchema.verifySession({ id, sessionMd, session, receipt });
    });

  return {
    create,
    start,
    append,
    settle,
    ask,
    answer,
    unpark,
    cancel,
    load,
    list,
    verify,
    progress,
  } as const;
};

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return build(fileBackend(fs, path, defaultRoot(path)));
});

export const makeWithRoot = (
  root: string,
): Effect.Effect<Impl, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return build(fileBackend(fs, path, root));
  });

const makeEphemeral = Effect.sync(() => build(memoryBackend()));

export const Id = '@montflow/Store';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class Store extends Context.Service<Store, Impl>()(Id) {}

/**
 * In-memory sessions: same rules, no disk. `sessionFile` stays repo-relative but
 * advisory — nothing is written, nothing is resumable, nothing hits git.
 * One state map per layer build.
 */
export const Ephemeral: Layer.Layer<Store, never, never> = Layer.effect(Store, makeEphemeral);

export const Default = Layer.effect(Store, make);
