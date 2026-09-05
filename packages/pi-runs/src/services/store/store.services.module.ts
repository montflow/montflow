import { Context, Data, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as ReceiptSchema from '../../modules/receipt/receipt.module.ts';
import * as RunSchema from '../../modules/run/run.module.ts';
import * as RunEventSchema from '../../modules/run-event/run-event.module.ts';

export class StoreError extends Data.TaggedError('@montflow/StoreError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/** File paths (or opaque keys) for one run. */
export interface RunFiles {
  readonly runMd: string;
  readonly session: string;
  readonly receipt: string;
}

/**
 * Storage backend. File and memory implementations share every rule in
 * `build` — backends move strings, never decide transitions.
 */
export interface Backend {
  readonly filesFor: (id: string) => RunFiles;
  readonly readText: (operation: string, file: string) => Effect.Effect<string, StoreError>;
  readonly writeText: (
    operation: string,
    file: string,
    text: string,
  ) => Effect.Effect<void, StoreError>;
  readonly exists: (file: string) => Effect.Effect<boolean, never>;
  readonly listRunIds: (operation: string) => Effect.Effect<ReadonlyArray<string>, StoreError>;
  readonly withLock: <A, E>(
    operation: string,
    id: string,
    self: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | StoreError>;
}

const fail = (operation: string, reason: string): Effect.Effect<never, StoreError> =>
  Effect.fail(new StoreError({ operation, reason }));

const ROOT_SEGMENTS = ['.agents', '@montflow', 'pi-runs', 'runs'] as const;

const defaultRoot = (path: Path.Path): string => path.join(process.cwd(), ...ROOT_SEGMENTS);

const repoRelativeSession = (id: string): string =>
  [...ROOT_SEGMENTS, id, 'session.jsonl'].join('/');

const nowIso = (): string => new Date().toISOString();

const toStoreError =
  (operation: string) =>
  // `cause` is the rule's exempt name for error-cause enrichment.
  (cause: unknown): StoreError =>
    new StoreError({ operation, reason: cause instanceof Error ? cause.message : String(cause) });

const frontmatter = (
  data:
    | Schema.Codec.Encoded<typeof RunSchema.Run>
    | Schema.Codec.Encoded<typeof ReceiptSchema.Receipt>,
  body: string,
): string => `---\n${JSON.stringify(data)}\n---\n${body}`;

const renderBody = (run: RunSchema.Run, events: ReadonlyArray<RunEventSchema.Event>): string => {
  const turns = events
    .map((event) => `## turn ${event.seq} — ${event.role}\n${event.text}\n`)
    .join('\n');
  return `# run ${run.id}\n\n${turns}`;
};

const decodeId = (operation: string, id: string) =>
  Schema.decodeUnknownEffect(RunSchema.Id)(id).pipe(
    Effect.mapError((error) => new StoreError({ operation, reason: String(error) })),
  );

const fileBackend = (fs: FileSystem.FileSystem, path: Path.Path, root: string): Backend => {
  const lockFor = (id: string): string => path.join(root, id, '.lock');
  return {
    filesFor: (id) => ({
      runMd: path.join(root, id, 'run.md'),
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
        yield* fs.writeFileString(file, text).pipe(Effect.mapError(toStoreError(operation)));
      }),
    exists: (file) =>
      fs.access(file).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(false),
          onSuccess: () => Effect.succeed(true),
        }),
      ),
    listRunIds: (operation) =>
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
        fs.makeDirectory(lockFor(id)).pipe(
          Effect.mapError((error) =>
            // Bracket read: Effect's PlatformError carries the syscall tag on `reason._tag`;
            // dot access trips no-underscore-dangle, so read the library field by name.
            error.reason['_tag'] === 'AlreadyExists'
              ? new StoreError({ operation, reason: `run '${id}' is locked` })
              : new StoreError({ operation, reason: String(error) }),
          ),
        ),
        () => self,
        () => fs.remove(lockFor(id), { recursive: true }).pipe(Effect.ignore),
      ),
  };
};

const MEMORY_PREFIX = 'memory:';

const memoryBackend = (): Backend => {
  const files = new Map<string, string>();
  const seen = new Map<string, RunFiles>();
  const filesFor = (id: string): RunFiles => {
    const known = seen.get(id);
    if (known !== undefined) return known;
    const fresh: RunFiles = {
      runMd: `${MEMORY_PREFIX}${id}:run.md`,
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
    listRunIds: (_operation) =>
      Effect.succeed(
        [...seen.entries()].flatMap(([id, locations]) => (files.has(locations.runMd) ? [id] : [])),
      ),
    withLock: (_operation, _id, self) => self,
  };
};

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

  const decodeRun = (operation: string, json: string): Effect.Effect<RunSchema.Run, StoreError> =>
    Effect.try({
      try: () => Schema.decodeUnknownSync(RunSchema.Run)(JSON.parse(json)),
      catch: toStoreError(operation),
    });

  const decodeEvent = (
    operation: string,
    line: string,
  ): Effect.Effect<RunEventSchema.Event, StoreError> =>
    Effect.try({
      try: () => Schema.decodeUnknownSync(RunEventSchema.Event)(JSON.parse(line)),
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
  ): Effect.Effect<Array<RunEventSchema.Event>, StoreError> =>
    Effect.gen(function* () {
      const file = backend.filesFor(id).session;
      if (!(yield* backend.exists(file))) return [];
      const text = yield* backend.readText(operation, file);
      const lines = text.split('\n').filter((line) => line.trim().length > 0);
      const events: Array<RunEventSchema.Event> = [];
      for (const line of lines) {
        events.push(yield* decodeEvent(operation, line));
      }
      return events;
    });

  const readRun = (operation: string, id: string): Effect.Effect<RunSchema.Run, StoreError> =>
    Effect.gen(function* () {
      const text = yield* backend.readText(operation, backend.filesFor(id).runMd);
      const json = yield* extractFrontmatter(operation, text);
      return yield* decodeRun(operation, json);
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

  const create = (args: {
    readonly id: string;
    readonly parent?: string;
    readonly name?: string;
  }) =>
    Effect.gen(function* () {
      const operation = 'Store.create';
      const id = yield* decodeId(operation, args.id);
      if (yield* backend.exists(backend.filesFor(id).runMd)) {
        return yield* fail(operation, `run '${id}' already exists`);
      }
      const parent = args.parent !== undefined ? yield* decodeId(operation, args.parent) : null;
      const stamp = nowIso();
      const base = {
        id,
        parent,
        status: 'pending' as const,
        created: stamp,
        updated: stamp,
        sessionFile: repoRelativeSession(id),
      };
      const run =
        args.name !== undefined
          ? new RunSchema.Run({ ...base, name: args.name })
          : new RunSchema.Run(base);
      const files = backend.filesFor(id);
      yield* backend.writeText(
        operation,
        files.runMd,
        frontmatter(RunSchema.encode(run), `# run ${id}\n\n`),
      );
      yield* backend.writeText(operation, files.session, '');
      return run;
    });

  const start = (runId: string) =>
    backend.withLock(
      'Store.start',
      runId,
      Effect.gen(function* () {
        const operation = 'Store.start';
        const id = yield* decodeId(operation, runId);
        const run = yield* readRun(operation, id);
        if (run.status !== 'pending') {
          return yield* fail(operation, `cannot start run '${id}' from status '${run.status}'`);
        }
        const base = {
          id: run.id,
          parent: run.parent,
          status: 'running' as const,
          created: run.created,
          updated: nowIso(),
          sessionFile: run.sessionFile,
        };
        const started =
          run.name !== undefined
            ? new RunSchema.Run({ ...base, name: run.name })
            : new RunSchema.Run(base);
        const events = yield* readEvents(operation, id);
        const files = backend.filesFor(id);
        yield* backend.writeText(
          operation,
          files.runMd,
          frontmatter(RunSchema.encode(started), renderBody(started, events)),
        );
        return started;
      }),
    );

  const append = (args: {
    readonly runId: string;
    readonly role: RunEventSchema.Role;
    readonly text: string;
    readonly subrunId?: string;
  }) =>
    backend.withLock(
      'Store.append',
      args.runId,
      Effect.gen(function* () {
        const operation = 'Store.append';
        const id = yield* decodeId(operation, args.runId);
        const run = yield* readRun(operation, id);
        if (run.status !== 'running') {
          return yield* fail(operation, `cannot append to run '${id}' with status '${run.status}'`);
        }
        const events = yield* readEvents(operation, id);
        const subrunId =
          args.subrunId !== undefined ? yield* decodeId(operation, args.subrunId) : undefined;
        const base = {
          seq: events.length + 1,
          role: args.role,
          text: args.text,
          at: nowIso(),
        };
        const event =
          subrunId !== undefined
            ? new RunEventSchema.Event({ ...base, subrunId })
            : new RunEventSchema.Event(base);
        const prior = events
          .map((entry) => JSON.stringify(RunEventSchema.encode(entry)))
          .join('\n');
        const files = backend.filesFor(id);
        yield* backend.writeText(
          operation,
          files.session,
          `${prior}${events.length > 0 ? '\n' : ''}${JSON.stringify(RunEventSchema.encode(event))}\n`,
        );
        const next = [...events, event];
        yield* backend.writeText(
          operation,
          files.runMd,
          frontmatter(RunSchema.encode(run), renderBody(run, next)),
        );
        return event;
      }),
    );

  const settle = (args: {
    readonly runId: string;
    readonly outcome: ReceiptSchema.Outcome;
    readonly summary: string;
  }) =>
    backend.withLock(
      'Store.settle',
      args.runId,
      Effect.gen(function* () {
        const operation = 'Store.settle';
        const id = yield* decodeId(operation, args.runId);
        const run = yield* readRun(operation, id);
        if (run.status !== 'running') {
          return yield* fail(operation, `cannot settle run '${id}' from status '${run.status}'`);
        }
        const files = backend.filesFor(id);
        if (yield* backend.exists(files.receipt)) {
          return yield* fail(operation, `run '${id}' already has a receipt`);
        }
        const receipt = new ReceiptSchema.Receipt({
          runId: id,
          outcome: args.outcome,
          summary: args.summary,
          endedAt: nowIso(),
        });
        yield* backend.writeText(
          operation,
          files.receipt,
          frontmatter(ReceiptSchema.encode(receipt), `# receipt ${id}\n\n${args.summary}\n`),
        );
        const base = {
          id: run.id,
          parent: run.parent,
          status: args.outcome,
          created: run.created,
          updated: nowIso(),
          sessionFile: run.sessionFile,
        };
        const settled =
          run.name !== undefined
            ? new RunSchema.Run({ ...base, name: run.name })
            : new RunSchema.Run(base);
        const events = yield* readEvents(operation, id);
        yield* backend.writeText(
          operation,
          files.runMd,
          frontmatter(RunSchema.encode(settled), renderBody(settled, events)),
        );
        return receipt;
      }),
    );

  const load = (runId: string) =>
    Effect.gen(function* () {
      const operation = 'Store.load';
      const id = yield* decodeId(operation, runId);
      const run = yield* readRun(operation, id);
      const events = yield* readEvents(operation, id);
      const receipt = yield* readReceipt(operation, id);
      if (receipt === null && (run.status === 'done' || run.status === 'failed')) {
        return yield* fail(operation, `run '${id}' is '${run.status}' but has no receipt`);
      }
      if (receipt !== null && run.status !== receipt.outcome) {
        return yield* fail(
          operation,
          `run '${id}' status '${run.status}' mismatches receipt outcome '${receipt.outcome}'`,
        );
      }
      return { run, events, receipt };
    });

  const list = () =>
    Effect.gen(function* () {
      const operation = 'Store.list';
      const ids = yield* backend.listRunIds(operation);
      const runs: Array<RunSchema.Run> = [];
      for (const id of [...ids].toSorted()) {
        runs.push(yield* readRun(operation, id));
      }
      return runs;
    });

  return { create, start, append, settle, load, list } as const;
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
 * In-memory runs: same rules, no disk. `sessionFile` stays repo-relative but
 * advisory — nothing is written, nothing is resumable, nothing hits git.
 * One state map per layer build.
 */
export const Ephemeral: Layer.Layer<Store, never, never> = Layer.effect(Store, makeEphemeral);

export const Default = Layer.effect(Store, make);
