import { Cause, Context, Effect, Fiber, FileSystem, Layer, Path, Queue, Stream } from 'effect';
import type { Message } from '@earendil-works/pi-ai';
import { Replay, Run, RunEvent, Verify } from '../../modules/index.js';
import { Store } from '../store/index.js';

/**
 * Run engine: drives a Pi session per run while our `Store` owns the durable
 * transcript. Sessions are abstracted behind {@link SessionPort} so the
 * lifecycle logic is testable without Pi; {@link SessionFactory} supplies the
 * real session (see the Pi session factory).
 */

/** Normalized event from a live Pi session. */
export type SessionEvent =
  | { readonly type: 'message'; readonly message: Message }
  | { readonly type: 'settled' }
  | { readonly type: 'ask'; readonly question: string }
  | { readonly type: 'notify'; readonly title: string; readonly body: string }
  | {
      readonly type: 'toast';
      readonly message: string;
      readonly variant: 'info' | 'success' | 'error' | undefined;
    }
  | { readonly type: 'progress'; readonly message: string };

/** Callbacks a session can make into its host: ask, notify, toast, report progress. */
export interface SessionUi {
  readonly input: (title: string) => Promise<string | undefined>;
  readonly notify: (message: string, kind: 'info' | 'warning' | 'error') => void;
  readonly toast: (message: string, variant?: 'info' | 'success' | 'error') => void;
  readonly progress: (message: string) => void;
}

/** Live Pi session, abstracted for the runner. */
export interface SessionPort {
  readonly prompt: (text: string) => Effect.Effect<void, string>;
  readonly steer: (text: string) => Effect.Effect<void, string>;
  readonly followUp: (text: string) => Effect.Effect<void, string>;
  readonly abort: () => Effect.Effect<void, string>;
  readonly messages: () => ReadonlyArray<Message>;
  readonly subscribe: (listener: (event: SessionEvent) => void) => () => void;
  readonly dispose: () => void;
}

/** Inputs to build a session for one run. */
export interface SessionRequest {
  readonly root: string;
  readonly id: string;
  readonly model: string | undefined;
  /** Thinking-level pin; undefined keeps Pi's default (settings / current session). */
  readonly thinking?: Run.ThinkingLevel | undefined;
  readonly tools: ReadonlyArray<string> | undefined;
  /**
   * Pi-native session file the run persists to. When set, Pi owns the
   * transcript (compaction and branches survive resume) and `replay` is
   * ignored. When absent, the session is in-memory and seeded from `replay`.
   */
  readonly sessionFile?: string | undefined;
  /** Transcript to seed before prompting; empty for a fresh run. */
  readonly replay: ReadonlyArray<Message>;
  readonly ui: SessionUi;
}

/** Builds live sessions. The real implementation wraps `createAgentSession`. */
export interface SessionFactoryImpl {
  readonly create: (request: SessionRequest) => Effect.Effect<SessionPort, string>;
}

export class SessionFactory extends Context.Service<SessionFactory, SessionFactoryImpl>()(
  '@montflow/RunnerSessionFactory',
) {}

/**
 * Two calls a run may make to the workspace: a toast and a notification.
 * Default layer is a no-op; the workspace provides the live bridge.
 */
export interface WorkspaceBridgeImpl {
  readonly toast: (message: string, variant?: 'info' | 'success' | 'error') => Effect.Effect<void>;
  readonly notify: (title: string, body: string) => Effect.Effect<void>;
}

export class WorkspaceBridge extends Context.Service<WorkspaceBridge, WorkspaceBridgeImpl>()(
  '@montflow/RunnerWorkspaceBridge',
) {}

export const NoopWorkspaceBridge: Layer.Layer<WorkspaceBridge> = Layer.succeed(WorkspaceBridge, {
  toast: () => Effect.void,
  notify: () => Effect.void,
});

/** Full run detail: the run row plus transcript plus settlement receipt. */
export interface RunDetail {
  readonly run: Run.Run;
  readonly events: ReadonlyArray<RunEvent.Event>;
  readonly receipt: { readonly outcome: string; readonly summary: string } | undefined;
}

/** Inputs to dispatch a new run. */
export interface RunnerStartInput {
  readonly root: string;
  readonly id: string;
  readonly name?: string | undefined;
  readonly prompt: string;
  readonly model?: string | undefined;
  /** Thinking-level pin for the run's Pi session. */
  readonly thinking?: Run.ThinkingLevel | undefined;
  readonly tools?: ReadonlyArray<string> | undefined;
  /** Parent run id: this run is a subrun of that run. */
  readonly parent?: string | undefined;
  /** Non-parent related run ids (siblings, review target). */
  readonly related?: ReadonlyArray<string> | undefined;
  /** Feature spec this run works on (`<feature-slug>`), when bound to one. */
  readonly feature?: string | undefined;
  /** Called once when the run settles; the profile-create hook lives here. */
  readonly onSettled?: ((detail: RunDetail) => Effect.Effect<void>) | undefined;
}

export interface RunnerImpl {
  readonly start: (input: RunnerStartInput) => Effect.Effect<Run.Run, string>;
  readonly resume: (
    root: string,
    id: string,
    prompt?: string,
    /** Re-attached completion hook: a resumed author run still fires it on settle. */
    onSettled?: (detail: RunDetail) => Effect.Effect<void>,
  ) => Effect.Effect<Run.Run, string>;
  readonly steer: (root: string, id: string, text: string) => Effect.Effect<void, string>;
  readonly answer: (root: string, id: string, text: string) => Effect.Effect<void, string>;
  readonly interrupt: (root: string, id: string) => Effect.Effect<void, string>;
  readonly detail: (root: string, id: string) => Effect.Effect<RunDetail, string>;
  readonly verify: (root: string, id: string) => Effect.Effect<Verify.VerifyResult, string>;
  /** Check the repo ignores the runs store, so transcripts stay local. */
  readonly verifyStore: (root: string) => Effect.Effect<Verify.StoreIgnoreResult, string>;
  readonly progress: (root: string, id: string, message: string) => Effect.Effect<void, string>;
  readonly list: (root: string) => Effect.Effect<ReadonlyArray<Run.Run>, string>;
  /**
   * Ids of runs with a live session in this runtime's registry. Persisted
   * `running` statuses left behind by a dead process are excluded, so
   * callers can trust this for "is something actually working".
   */
  readonly liveRunIds: (root: string) => Effect.Effect<ReadonlySet<string>, never>;
}

export const Id = '@montflow/Runner';

export class Runner extends Context.Service<Runner, RunnerImpl>()(Id) {}

/** One live run held in the process registry. */
interface ActiveRun {
  readonly root: string;
  readonly id: string;
  readonly session: SessionPort;
  readonly onSettled: ((detail: RunDetail) => Effect.Effect<void>) | undefined;
  /** Session events land here from the sync listener; the consumer runs on the runner's runtime. */
  readonly queue: Queue.Queue<SessionEvent, Cause.Done>;
  unsubscribe: () => void;
  consumer: Fiber.Fiber<void, never> | undefined;
  /** Once-guard: a run settles or is interrupted exactly once. */
  settled: boolean;
}

/** Display projection of a Pi message: joined text blocks, `''` when none. */
const displayText = (message: Message): string => {
  const content = message.content;
  if (!Array.isArray(content)) return content;
  return content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');
};

/** Summary for the receipt: last assistant text, else a default line. */
const summaryOf = (events: ReadonlyArray<RunEvent.Event>): string => {
  const last = events.findLast((event) => event.role === 'assistant');
  return (last?.text ?? 'Run finished.').slice(0, 500);
};

const toDetail = (loaded: {
  readonly run: Run.Run;
  readonly events: ReadonlyArray<RunEvent.Event>;
  readonly receipt: { readonly outcome: string; readonly summary: string } | null;
}): RunDetail => ({
  run: loaded.run,
  events: loaded.events,
  receipt:
    loaded.receipt === null
      ? undefined
      : { outcome: loaded.receipt.outcome, summary: loaded.receipt.summary },
});

const make = Effect.gen(function* () {
  const store = yield* Store.Store;
  const factory = yield* SessionFactory;
  const bridge = yield* WorkspaceBridge;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  /** Live runs by id; a run leaves the registry when it settles or is interrupted. */
  const active = new Map<string, ActiveRun>();
  /** Parked questions by id; `answer` resolves the promise the ask is awaiting. */
  const pendingAsks = new Map<string, (answer: string | undefined) => void>();

  /** Persist one mirrored message; Pi's event stream is the transcript source. */
  const mirror = (run: ActiveRun, message: Message): Effect.Effect<void, string> =>
    store
      .append({
        runId: run.id,
        role: message.role,
        text: displayText(message),
        message,
      })
      .pipe(
        Effect.mapError((error) => error.reason),
        Effect.asVoid,
      );

  /** Fail the parked ask, if any, so `ask_user` never awaits a dead run. */
  const failPendingAsk = (id: string): Effect.Effect<void> => {
    const pending = pendingAsks.get(id);
    if (pending === undefined) return Effect.void;
    pendingAsks.delete(id);
    pending(undefined);
    return Effect.void;
  };

  /** Settle once: write the receipt, notify the hook, dispose the session. */
  const settle = (run: ActiveRun): Effect.Effect<void, string> =>
    Effect.gen(function* () {
      // Claim the run synchronously: a second `agent_settled`, or an
      // interrupt that already claimed it, must not fire the hook again.
      if (run.settled) return;
      run.settled = true;
      active.delete(run.id);
      run.unsubscribe();
      yield* failPendingAsk(run.id);
      const loaded = yield* store.load(run.id).pipe(Effect.mapError((error) => error.reason));
      if (loaded.receipt === null) {
        yield* store
          .settle({ runId: run.id, outcome: 'done', summary: summaryOf(loaded.events) })
          .pipe(Effect.mapError((error) => error.reason));
      }
      const detail = yield* store.load(run.id).pipe(Effect.mapError((error) => error.reason));
      run.session.dispose();
      Queue.endUnsafe(run.queue);
      yield* notifyParent(detail);
      if (run.onSettled !== undefined) yield* run.onSettled(toDetail(detail));
    });

  /** Tell a live parent run that one of its subruns settled. */
  const notifyParent = (detail: {
    readonly run: Run.Run;
    readonly receipt: { readonly outcome: string; readonly summary: string } | null;
  }): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      if (detail.run.parent === null) return;
      const parent = active.get(detail.run.parent);
      if (parent === undefined) return;
      const outcome = detail.receipt?.outcome ?? 'done';
      const summary = detail.receipt?.summary ?? '';
      const message = `Subrun '${detail.run.id}' settled: ${outcome}. ${summary}`.trim();
      yield* parent.session.followUp(message).pipe(Effect.catch(() => Effect.void));
    });

  /** Park one run's question via the store; a store failure releases the asker. */
  const ask = (run: ActiveRun, question: string): Effect.Effect<void, string> =>
    store.ask({ runId: run.id, question }).pipe(
      Effect.mapError((error) => error.reason),
      Effect.tapError(() =>
        Effect.sync(() => {
          const pending = pendingAsks.get(run.id);
          pendingAsks.delete(run.id);
          pending?.(undefined);
        }),
      ),
      Effect.asVoid,
    );

  /** Route one session event into the store and lifecycle. */
  const handle = (run: ActiveRun, event: SessionEvent): Effect.Effect<void, string> => {
    switch (event.type) {
      case 'message':
        return mirror(run, event.message);
      case 'settled':
        return settle(run);
      case 'ask':
        return ask(run, event.question);
      case 'notify':
        return bridge.notify(event.title, event.body).pipe(Effect.asVoid);
      case 'toast':
        return bridge.toast(event.message, event.variant).pipe(Effect.asVoid);
      case 'progress':
        return store.progress({ runId: run.id, message: event.message }).pipe(
          Effect.mapError((error) => error.reason),
          Effect.asVoid,
        );
    }
  };

  /** Build, subscribe, and register a live session. */
  const attach = (
    request: SessionRequest,
    onSettled: ((detail: RunDetail) => Effect.Effect<void>) | undefined,
    queue: Queue.Queue<SessionEvent, Cause.Done>,
  ): Effect.Effect<ActiveRun, string> =>
    Effect.gen(function* () {
      const session = yield* factory.create(request);
      const run: ActiveRun = {
        root: request.root,
        id: request.id,
        session,
        onSettled,
        queue,
        unsubscribe: () => undefined,
        consumer: undefined,
        settled: false,
      };
      // Sync listener: Pi emits from its own callback. Hand off to the queue so
      // the consumer processes on the runner's runtime (store layers included).
      run.unsubscribe = session.subscribe((event) => Queue.offerUnsafe(queue, event));
      run.consumer = yield* Effect.forkDetach(
        Stream.fromQueue(queue).pipe(
          Stream.runForEach((event) =>
            handle(run, event).pipe(
              Effect.catch((reason) => bridge.toast(`Run '${run.id}': ${reason}`, 'error')),
            ),
          ),
          Effect.catch(() => Effect.void),
        ),
      );
      active.set(request.id, run);
      return run;
    });

  /** UI for one run: both calls hand off to the consumer on the runner's runtime. */
  const uiFor = (id: string, queue: Queue.Queue<SessionEvent, Cause.Done>): SessionUi => ({
    input: (title) =>
      new Promise<string | undefined>((resolve) => {
        // Register before offering: an answer that lands while the ask is in
        // flight must find the resolver, or `ask_user` deadlocks.
        pendingAsks.set(id, resolve);
        Queue.offerUnsafe(queue, { type: 'ask', question: title });
      }),
    notify: (message) => {
      Queue.offerUnsafe(queue, { type: 'notify', title: `Run '${id}'`, body: message });
    },
    toast: (message, variant) => {
      Queue.offerUnsafe(queue, { type: 'toast', message, variant });
    },
    progress: (message) => {
      Queue.offerUnsafe(queue, { type: 'progress', message });
    },
  });

  const start = (input: RunnerStartInput): Effect.Effect<Run.Run, string> =>
    Effect.gen(function* () {
      const createArgs: Store.CreateArgs = { id: input.id, prompt: input.prompt };
      if (input.name !== undefined) createArgs.name = input.name;
      if (input.model !== undefined) createArgs.model = input.model;
      if (input.thinking !== undefined) createArgs.thinking = input.thinking;
      if (input.tools !== undefined) createArgs.tools = input.tools;
      if (input.parent !== undefined) createArgs.parent = input.parent;
      if (input.related !== undefined) createArgs.related = input.related;
      if (input.feature !== undefined) createArgs.feature = input.feature;
      yield* store.create(createArgs).pipe(Effect.mapError((error) => error.reason));
      const started = yield* store.start(input.id).pipe(Effect.mapError((error) => error.reason));
      // Pi owns the run transcript: point the session at its native file.
      const nativeSession = path.join(
        input.root,
        ...Store.RUNS_SEGMENTS,
        input.id,
        Store.NATIVE_SESSION_FILE,
      );
      // The user turn mirrors from Pi's `message_end` in emission order.
      const queue = yield* Queue.unbounded<SessionEvent, Cause.Done>();
      const run = yield* attach(
        {
          root: input.root,
          id: input.id,
          model: input.model,
          thinking: input.thinking,
          tools: input.tools,
          sessionFile: nativeSession,
          replay: [],
          ui: uiFor(input.id, queue),
        },
        input.onSettled,
        queue,
      );
      yield* Effect.forkDetach(
        run.session
          .prompt(input.prompt)
          .pipe(
            Effect.catch((reason) => bridge.toast(`Run '${input.id}' failed: ${reason}`, 'error')),
          ),
      );
      return started;
    });

  const resume = (
    root: string,
    id: string,
    prompt?: string,
    onSettled?: (detail: RunDetail) => Effect.Effect<void>,
  ): Effect.Effect<Run.Run, string> =>
    Effect.gen(function* () {
      const verdict = yield* store.verify(id).pipe(Effect.mapError((error) => error.reason));
      if (!verdict.valid) {
        const detail = verdict.issues
          .map((entry) => `[${entry.field}] ${entry.message}`)
          .join('; ');
        return yield* Effect.fail(`Run '${id}' failed verification: ${detail}`);
      }
      if (!verdict.resumable) return yield* Effect.fail(`Run '${id}' is not resumable.`);
      const loaded = yield* store.load(id).pipe(Effect.mapError((error) => error.reason));
      const nativeSession = path.join(root, ...Store.RUNS_SEGMENTS, id, Store.NATIVE_SESSION_FILE);
      const queue = yield* Queue.unbounded<SessionEvent, Cause.Done>();
      const run = yield* attach(
        {
          root,
          id,
          model: loaded.run.model,
          thinking: loaded.run.thinking,
          tools: loaded.run.tools,
          sessionFile: nativeSession,
          replay: Replay.toMessages(loaded.events),
          ui: uiFor(id, queue),
        },
        onSettled,
        queue,
      );
      if (prompt !== undefined) {
        yield* Effect.forkDetach(
          run.session
            .prompt(prompt)
            .pipe(Effect.catch((reason) => bridge.toast(`Run '${id}' failed: ${reason}`, 'error'))),
        );
      }
      return loaded.run;
    });

  const steer = (root: string, id: string, text: string): Effect.Effect<void, string> =>
    Effect.gen(function* () {
      const run = active.get(id);
      if (run === undefined) return yield* Effect.fail(`Run '${id}' is not live.`);
      // Pi delivers the steering turn after the in-flight tool results and
      // mirrors it as a user `message_end`, so never interpose it here.
      yield* run.session.steer(text);
    });

  const answer = (root: string, id: string, text: string): Effect.Effect<void, string> =>
    Effect.gen(function* () {
      // Mirror `steer`: a persisted `awaiting-input` run with no live session
      // (e.g. after a workspace restart) must not unpark into a session-less
      // `running` state — the answer would be silently discarded.
      if (!active.has(id))
        return yield* Effect.fail(`Run '${id}' is not live — resume it instead.`);
      // Unpark only: the answer travels in the `ask_user` tool result, so a
      // user turn here would wedge itself before that result on replay.
      yield* store.unpark(id).pipe(Effect.mapError((error) => error.reason));
      const pending = pendingAsks.get(id);
      if (pending !== undefined) {
        pendingAsks.delete(id);
        pending(text);
      }
    });

  const interrupt = (root: string, id: string): Effect.Effect<void, string> =>
    Effect.gen(function* () {
      const run = active.get(id);
      if (run !== undefined) {
        // Claim the run before aborting: abort emits `agent_settled`, and a
        // claimed run must not be receipted as `done`.
        if (run.settled) return;
        run.settled = true;
        active.delete(id);
        run.unsubscribe();
        Queue.endUnsafe(run.queue);
        if (run.consumer !== undefined) yield* Fiber.interrupt(run.consumer);
        yield* failPendingAsk(id);
        yield* run.session.abort().pipe(Effect.catch(() => Effect.void));
        run.session.dispose();
      }
      yield* store.cancel(id).pipe(Effect.mapError((error) => error.reason));
    });

  const detail = (root: string, id: string): Effect.Effect<RunDetail, string> =>
    store.load(id).pipe(
      Effect.mapError((error) => error.reason),
      Effect.map(toDetail),
    );

  const verify = (_root: string, id: string): Effect.Effect<Verify.VerifyResult, string> =>
    store.verify(id).pipe(Effect.mapError((error) => error.reason));

  /**
   * Check the repo's `.gitignore` ignores the runs store. The store lives at
   * `<root>/.agents/@montflow/runs`; an active rule keeps transcripts local.
   */
  const verifyStore = (root: string): Effect.Effect<Verify.StoreIgnoreResult, string> =>
    Effect.gen(function* () {
      const file = path.join(root, '.gitignore');
      const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
      const gitignore = exists
        ? yield* fs
            .readFileString(file)
            .pipe(
              Effect.mapError((cause) => (cause instanceof Error ? cause.message : String(cause))),
            )
        : '';
      return Verify.verifyStoreIgnored(gitignore, Store.RUNS_SEGMENTS.join('/'));
    });

  const progress = (_root: string, id: string, message: string): Effect.Effect<void, string> =>
    store.progress({ runId: id, message }).pipe(
      Effect.mapError((error) => error.reason),
      Effect.asVoid,
    );

  const list = (_root: string): Effect.Effect<ReadonlyArray<Run.Run>, string> =>
    store.list().pipe(Effect.mapError((error) => error.reason));

  const liveRunIds = (_root: string): Effect.Effect<ReadonlySet<string>, never> =>
    Effect.sync(() => new Set(active.keys()));

  return {
    start,
    resume,
    steer,
    answer,
    interrupt,
    detail,
    verify,
    verifyStore,
    progress,
    list,
    liveRunIds,
  } satisfies RunnerImpl;
});

export const Default: Layer.Layer<
  Runner,
  never,
  Store.Store | SessionFactory | WorkspaceBridge | FileSystem.FileSystem | Path.Path
> = Layer.effect(Runner, make);
