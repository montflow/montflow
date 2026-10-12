import { Cause, Context, Effect, Fiber, FileSystem, Layer, Path, Queue, Stream } from 'effect';
import type { Message } from '@earendil-works/pi-ai';
import { Replay, Session, SessionEvent, Verify } from '../../modules/index.js';
import { Store } from '../store/index.js';

/**
 * Session engine: drives a Pi session per session while our `Store` owns the durable
 * transcript. Sessions are abstracted behind {@link SessionPort} so the
 * lifecycle logic is testable without Pi; {@link SessionFactory} supplies the
 * real session (see the Pi session factory).
 */

/** Normalized event from a live Pi session. */
export type PiSessionEvent =
  | { readonly type: 'message'; readonly message: Message }
  | { readonly type: 'settled' }
  | { readonly type: 'ask'; readonly question: string }
  | { readonly type: 'notify'; readonly title: string; readonly body: string }
  | {
      readonly type: 'toast';
      readonly message: string;
      readonly variant: 'info' | 'success' | 'error' | undefined;
    }
  | { readonly type: 'progress'; readonly message: string }
  /**
   * The model returned a terminal error (bad auth, no funds, etc.). Carries the
   * original assistant message and a human-readable reason so the runner can
   * mirror it and settle the session as failed instead of retrying forever.
   */
  | { readonly type: 'failed'; readonly message: Message; readonly reason: string };

/** Callbacks a session can make into its host: ask, notify, toast, report progress. */
export interface SessionUi {
  readonly input: (title: string) => Promise<string | undefined>;
  readonly notify: (message: string, kind: 'info' | 'warning' | 'error') => void;
  readonly toast: (message: string, variant?: 'info' | 'success' | 'error') => void;
  readonly progress: (message: string) => void;
}

/** Live Pi session, abstracted for the session runner. */
export interface SessionPort {
  readonly prompt: (text: string) => Effect.Effect<void, string>;
  readonly steer: (text: string) => Effect.Effect<void, string>;
  readonly followUp: (text: string) => Effect.Effect<void, string>;
  readonly abort: () => Effect.Effect<void, string>;
  readonly messages: () => ReadonlyArray<Message>;
  readonly subscribe: (listener: (event: PiSessionEvent) => void) => () => void;
  readonly dispose: () => void;
}

/** Inputs to build a session for one session. */
export interface SessionRequest {
  readonly root: string;
  readonly id: string;
  readonly model: string | undefined;
  /** Thinking-level pin; undefined keeps Pi's default (settings / current session). */
  readonly thinking?: Session.ThinkingLevel | undefined;
  readonly tools: ReadonlyArray<string> | undefined;
  /**
   * Pi-native session file the session persists to. When set, Pi owns the
   * transcript (compaction and branches survive resume) and `replay` is
   * ignored. When absent, the session is in-memory and seeded from `replay`.
   */
  readonly sessionFile?: string | undefined;
  /** Transcript to seed before prompting; empty for a fresh session. */
  readonly replay: ReadonlyArray<Message>;
  readonly ui: SessionUi;
}

/** Builds live sessions. The real implementation wraps `createAgentSession`. */
export interface SessionFactoryImpl {
  readonly create: (request: SessionRequest) => Effect.Effect<SessionPort, string>;
}

export class SessionFactory extends Context.Service<SessionFactory, SessionFactoryImpl>()(
  '@montflow/SessionRunnerFactory',
) {}

/**
 * Two calls a session may make to the workspace: a toast and a notification.
 * Default layer is a no-op; the workspace provides the live bridge.
 */
export interface WorkspaceBridgeImpl {
  readonly toast: (message: string, variant?: 'info' | 'success' | 'error') => Effect.Effect<void>;
  readonly notify: (title: string, body: string) => Effect.Effect<void>;
}

export class WorkspaceBridge extends Context.Service<WorkspaceBridge, WorkspaceBridgeImpl>()(
  '@montflow/SessionRunnerWorkspaceBridge',
) {}

export const NoopWorkspaceBridge: Layer.Layer<WorkspaceBridge> = Layer.succeed(WorkspaceBridge, {
  toast: () => Effect.void,
  notify: () => Effect.void,
});

/** Full session detail: the session row plus transcript plus settlement receipt. */
export interface SessionDetail {
  readonly session: Session.Session;
  readonly events: ReadonlyArray<SessionEvent.Event>;
  readonly receipt: { readonly outcome: string; readonly summary: string } | undefined;
}

/** Inputs to dispatch a new session. */
export interface SessionRunnerStartInput {
  readonly root: string;
  readonly id: string;
  readonly name?: string | undefined;
  readonly prompt: string;
  readonly model?: string | undefined;
  /** Thinking-level pin for the session's Pi session. */
  readonly thinking?: Session.ThinkingLevel | undefined;
  readonly tools?: ReadonlyArray<string> | undefined;
  /** Parent session id: this session is a subsession of that session. */
  readonly parent?: string | undefined;
  /** Non-parent related session ids (siblings, review target). */
  readonly related?: ReadonlyArray<string> | undefined;
  /** Spec this session works on (`<spec-slug>`), when bound to one. */
  readonly spec?: string | undefined;
  /** Called once when the session settles; the profile-create hook lives here. */
  readonly onSettled?: ((detail: SessionDetail) => Effect.Effect<void>) | undefined;
}

export interface SessionRunnerImpl {
  readonly start: (input: SessionRunnerStartInput) => Effect.Effect<Session.Session, string>;
  readonly resume: (
    root: string,
    id: string,
    prompt?: string,
    /** Re-attached completion hook: a resumed author session still fires it on settle. */
    onSettled?: (detail: SessionDetail) => Effect.Effect<void>,
  ) => Effect.Effect<Session.Session, string>;
  readonly steer: (root: string, id: string, text: string) => Effect.Effect<void, string>;
  readonly answer: (root: string, id: string, text: string) => Effect.Effect<void, string>;
  readonly interrupt: (root: string, id: string) => Effect.Effect<void, string>;
  readonly detail: (root: string, id: string) => Effect.Effect<SessionDetail, string>;
  readonly verify: (root: string, id: string) => Effect.Effect<Verify.VerifyResult, string>;
  /** Check the repo ignores the sessions store, so transcripts stay local. */
  readonly verifyStore: (root: string) => Effect.Effect<Verify.StoreIgnoreResult, string>;
  readonly progress: (root: string, id: string, message: string) => Effect.Effect<void, string>;
  readonly list: (root: string) => Effect.Effect<ReadonlyArray<Session.Session>, string>;
  /**
   * Ids of sessions with a live session in this runtime's registry. Persisted
   * `running` statuses left behind by a dead process are excluded, so
   * callers can trust this for "is something actually working".
   */
  readonly liveSessionIds: (root: string) => Effect.Effect<ReadonlySet<string>, never>;
}

export const Id = '@montflow/SessionRunner';

export class SessionRunner extends Context.Service<SessionRunner, SessionRunnerImpl>()(Id) {}

/** One live session held in the process registry. */
interface ActiveSession {
  readonly root: string;
  readonly id: string;
  readonly session: SessionPort;
  readonly onSettled: ((detail: SessionDetail) => Effect.Effect<void>) | undefined;
  /** Session events land here from the sync listener; the consumer runs on the session runner's runtime. */
  readonly queue: Queue.Queue<PiSessionEvent, Cause.Done>;
  unsubscribe: () => void;
  consumer: Fiber.Fiber<void, never> | undefined;
  /** Once-guard: a session settles or is interrupted exactly once. */
  settled: boolean;
}

/** Display projection of a Pi message: joined text blocks, `''` when none. */
const displayText = (message: Message): string => {
  const content = message.content;
  if (!Array.isArray(content)) return content;
  return content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');
};

/** Summary for the receipt: last assistant text, else a default line. */
const summaryOf = (events: ReadonlyArray<SessionEvent.Event>): string => {
  const last = events.findLast((event) => event.role === 'assistant');
  return (last?.text ?? 'Session finished.').slice(0, 500);
};

const toDetail = (loaded: {
  readonly session: Session.Session;
  readonly events: ReadonlyArray<SessionEvent.Event>;
  readonly receipt: { readonly outcome: string; readonly summary: string } | null;
}): SessionDetail => ({
  session: loaded.session,
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

  /** Live sessions by id; a session leaves the registry when it settles or is interrupted. */
  const active = new Map<string, ActiveSession>();
  /** Parked questions by id; `answer` resolves the promise the ask is awaiting. */
  const pendingAsks = new Map<string, (answer: string | undefined) => void>();

  /** Persist one mirrored message; Pi's event stream is the transcript source. */
  const mirror = (session: ActiveSession, message: Message): Effect.Effect<void, string> =>
    store
      .append({
        sessionId: session.id,
        role: message.role,
        text: displayText(message),
        message,
      })
      .pipe(
        Effect.mapError((error) => error.reason),
        Effect.asVoid,
      );

  /** Fail the parked ask, if any, so `ask_user` never awaits a dead session. */
  const failPendingAsk = (id: string): Effect.Effect<void> => {
    const pending = pendingAsks.get(id);
    if (pending === undefined) return Effect.void;
    pendingAsks.delete(id);
    pending(undefined);
    return Effect.void;
  };

  /**
   * Settle once: write the receipt, notify the hook, dispose the session.
   * `outcome` defaults to `done`; a terminal model error passes `failed` with
   * the reason as the summary.
   */
  const settle = (
    session: ActiveSession,
    outcome: 'done' | 'failed' = 'done',
    summary?: string,
  ): Effect.Effect<void, string> =>
    Effect.gen(function* () {
      // Claim the session synchronously: a second `agent_settled`, or an
      // interrupt that already claimed it, must not fire the hook again.
      if (session.settled) return;
      session.settled = true;
      active.delete(session.id);
      session.unsubscribe();
      yield* failPendingAsk(session.id);
      const loaded = yield* store.load(session.id).pipe(Effect.mapError((error) => error.reason));
      if (loaded.receipt === null) {
        yield* store
          .settle({
            sessionId: session.id,
            outcome,
            summary: summary ?? summaryOf(loaded.events),
          })
          .pipe(Effect.mapError((error) => error.reason));
      }
      const detail = yield* store.load(session.id).pipe(Effect.mapError((error) => error.reason));
      session.session.dispose();
      Queue.endUnsafe(session.queue);
      yield* notifyParent(detail);
      if (session.onSettled !== undefined) yield* session.onSettled(toDetail(detail));
    });

  /** Tell a live parent session that one of its subsessions settled. */
  const notifyParent = (detail: {
    readonly session: Session.Session;
    readonly receipt: { readonly outcome: string; readonly summary: string } | null;
  }): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      if (detail.session.parent === null) return;
      const parent = active.get(detail.session.parent);
      if (parent === undefined) return;
      const outcome = detail.receipt?.outcome ?? 'done';
      const summary = detail.receipt?.summary ?? '';
      const message = `Subsession '${detail.session.id}' settled: ${outcome}. ${summary}`.trim();
      yield* parent.session.followUp(message).pipe(Effect.catch(() => Effect.void));
    });

  /** Park one session's question via the store; a store failure releases the asker. */
  const ask = (session: ActiveSession, question: string): Effect.Effect<void, string> =>
    store.ask({ sessionId: session.id, question }).pipe(
      Effect.mapError((error) => error.reason),
      Effect.tapError(() =>
        Effect.sync(() => {
          const pending = pendingAsks.get(session.id);
          pendingAsks.delete(session.id);
          pending?.(undefined);
        }),
      ),
      Effect.asVoid,
    );

  /** Route one session event into the store and lifecycle. */
  const handle = (session: ActiveSession, event: PiSessionEvent): Effect.Effect<void, string> => {
    switch (event.type) {
      case 'message':
        return mirror(session, event.message);
      case 'settled':
        return settle(session);
      case 'failed':
        // Fail fast: mirror the error turn, then settle as failed with the
        // reason so a caller gets a receipt (and notification) instead of a
        // session that retries the same provider error forever.
        return Effect.gen(function* () {
          yield* mirror(session, event.message);
          yield* settle(session, 'failed', event.reason);
        });
      case 'ask':
        return ask(session, event.question);
      case 'notify':
        return bridge.notify(event.title, event.body).pipe(Effect.asVoid);
      case 'toast':
        return bridge.toast(event.message, event.variant).pipe(Effect.asVoid);
      case 'progress':
        return store.progress({ sessionId: session.id, message: event.message }).pipe(
          Effect.mapError((error) => error.reason),
          Effect.asVoid,
        );
    }
  };

  /** Build, subscribe, and register a live session. */
  const attach = (
    request: SessionRequest,
    onSettled: ((detail: SessionDetail) => Effect.Effect<void>) | undefined,
    queue: Queue.Queue<PiSessionEvent, Cause.Done>,
  ): Effect.Effect<ActiveSession, string> =>
    Effect.gen(function* () {
      const port = yield* factory.create(request);
      const session: ActiveSession = {
        root: request.root,
        id: request.id,
        session: port,
        onSettled,
        queue,
        unsubscribe: () => undefined,
        consumer: undefined,
        settled: false,
      };
      // Sync listener: Pi emits from its own callback. Hand off to the queue so
      // the consumer processes on the session runner's runtime (store layers included).
      session.unsubscribe = port.subscribe((event) => Queue.offerUnsafe(queue, event));
      session.consumer = yield* Effect.forkDetach(
        Stream.fromQueue(queue).pipe(
          Stream.runForEach((event) =>
            handle(session, event).pipe(
              Effect.catch((reason) => bridge.toast(`Session '${session.id}': ${reason}`, 'error')),
            ),
          ),
          Effect.catch(() => Effect.void),
        ),
      );
      active.set(request.id, session);
      return session;
    });

  /** UI for one session: both calls hand off to the consumer on the session runner's runtime. */
  const uiFor = (id: string, queue: Queue.Queue<PiSessionEvent, Cause.Done>): SessionUi => ({
    input: (title) =>
      new Promise<string | undefined>((resolve) => {
        // Register before offering: an answer that lands while the ask is in
        // flight must find the resolver, or `ask_user` deadlocks.
        pendingAsks.set(id, resolve);
        Queue.offerUnsafe(queue, { type: 'ask', question: title });
      }),
    notify: (message) => {
      Queue.offerUnsafe(queue, { type: 'notify', title: `Session '${id}'`, body: message });
    },
    toast: (message, variant) => {
      Queue.offerUnsafe(queue, { type: 'toast', message, variant });
    },
    progress: (message) => {
      Queue.offerUnsafe(queue, { type: 'progress', message });
    },
  });

  const start = (input: SessionRunnerStartInput): Effect.Effect<Session.Session, string> =>
    Effect.gen(function* () {
      const createArgs: Store.CreateArgs = { id: input.id, prompt: input.prompt };
      if (input.name !== undefined) createArgs.name = input.name;
      if (input.model !== undefined) createArgs.model = input.model;
      if (input.thinking !== undefined) createArgs.thinking = input.thinking;
      if (input.tools !== undefined) createArgs.tools = input.tools;
      if (input.parent !== undefined) createArgs.parent = input.parent;
      if (input.related !== undefined) createArgs.related = input.related;
      if (input.spec !== undefined) createArgs.spec = input.spec;
      yield* store.create(createArgs).pipe(Effect.mapError((error) => error.reason));
      const started = yield* store.start(input.id).pipe(Effect.mapError((error) => error.reason));
      // Pi owns the session transcript: point the session at its native file.
      const nativeSession = path.join(
        input.root,
        ...Store.SESSIONS_SEGMENTS,
        input.id,
        Store.NATIVE_SESSION_FILE,
      );
      // The user turn mirrors from Pi's `message_end` in emission order.
      const queue = yield* Queue.unbounded<PiSessionEvent, Cause.Done>();
      const session = yield* attach(
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
        session.session
          .prompt(input.prompt)
          .pipe(
            Effect.catch((reason) =>
              bridge.toast(`Session '${input.id}' failed: ${reason}`, 'error'),
            ),
          ),
      );
      return started;
    });

  const resume = (
    root: string,
    id: string,
    prompt?: string,
    onSettled?: (detail: SessionDetail) => Effect.Effect<void>,
  ): Effect.Effect<Session.Session, string> =>
    Effect.gen(function* () {
      const verdict = yield* store.verify(id).pipe(Effect.mapError((error) => error.reason));
      if (!verdict.valid) {
        const detail = verdict.issues
          .map((entry) => `[${entry.field}] ${entry.message}`)
          .join('; ');
        return yield* Effect.fail(`Session '${id}' failed verification: ${detail}`);
      }
      if (!verdict.resumable) return yield* Effect.fail(`Session '${id}' is not resumable.`);
      const loaded = yield* store.load(id).pipe(Effect.mapError((error) => error.reason));
      const nativeSession = path.join(
        root,
        ...Store.SESSIONS_SEGMENTS,
        id,
        Store.NATIVE_SESSION_FILE,
      );
      const queue = yield* Queue.unbounded<PiSessionEvent, Cause.Done>();
      const session = yield* attach(
        {
          root,
          id,
          model: loaded.session.model,
          thinking: loaded.session.thinking,
          tools: loaded.session.tools,
          sessionFile: nativeSession,
          replay: Replay.toMessages(loaded.events),
          ui: uiFor(id, queue),
        },
        onSettled,
        queue,
      );
      if (prompt !== undefined) {
        yield* Effect.forkDetach(
          session.session
            .prompt(prompt)
            .pipe(
              Effect.catch((reason) => bridge.toast(`Session '${id}' failed: ${reason}`, 'error')),
            ),
        );
      }
      return loaded.session;
    });

  const steer = (root: string, id: string, text: string): Effect.Effect<void, string> =>
    Effect.gen(function* () {
      const session = active.get(id);
      if (session === undefined) return yield* Effect.fail(`Session '${id}' is not live.`);
      // Pi delivers the steering turn after the in-flight tool results and
      // mirrors it as a user `message_end`, so never interpose it here.
      yield* session.session.steer(text);
    });

  const answer = (root: string, id: string, text: string): Effect.Effect<void, string> =>
    Effect.gen(function* () {
      // Mirror `steer`: a persisted `awaiting-input` session with no live session
      // (e.g. after a workspace restart) must not unpark into a session-less
      // `running` state — the answer would be silently discarded.
      if (!active.has(id))
        return yield* Effect.fail(`Session '${id}' is not live — resume it instead.`);
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
      const session = active.get(id);
      if (session !== undefined) {
        // Claim the session before aborting: abort emits `agent_settled`, and a
        // claimed session must not be receipted as `done`.
        if (session.settled) return;
        session.settled = true;
        active.delete(id);
        session.unsubscribe();
        Queue.endUnsafe(session.queue);
        if (session.consumer !== undefined) yield* Fiber.interrupt(session.consumer);
        yield* failPendingAsk(id);
        yield* session.session.abort().pipe(Effect.catch(() => Effect.void));
        session.session.dispose();
      }
      yield* store.cancel(id).pipe(Effect.mapError((error) => error.reason));
    });

  const detail = (root: string, id: string): Effect.Effect<SessionDetail, string> =>
    store.load(id).pipe(
      Effect.mapError((error) => error.reason),
      Effect.map(toDetail),
    );

  const verify = (_root: string, id: string): Effect.Effect<Verify.VerifyResult, string> =>
    store.verify(id).pipe(Effect.mapError((error) => error.reason));

  /**
   * Check the repo's `.gitignore` ignores the sessions store. The store lives at
   * `<root>/.agents/@montflow/sessions`; an active rule keeps transcripts local.
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
      return Verify.verifyStoreIgnored(gitignore, Store.SESSIONS_SEGMENTS.join('/'));
    });

  const progress = (_root: string, id: string, message: string): Effect.Effect<void, string> =>
    store.progress({ sessionId: id, message }).pipe(
      Effect.mapError((error) => error.reason),
      Effect.asVoid,
    );

  const list = (_root: string): Effect.Effect<ReadonlyArray<Session.Session>, string> =>
    store.list().pipe(Effect.mapError((error) => error.reason));

  const liveSessionIds = (_root: string): Effect.Effect<ReadonlySet<string>, never> =>
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
    liveSessionIds,
  } satisfies SessionRunnerImpl;
});

export const Default: Layer.Layer<
  SessionRunner,
  never,
  Store.Store | SessionFactory | WorkspaceBridge | FileSystem.FileSystem | Path.Path
> = Layer.effect(SessionRunner, make);
