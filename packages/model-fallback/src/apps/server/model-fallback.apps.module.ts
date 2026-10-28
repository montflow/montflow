import { Plugin } from '@opencode/plugin/effect';
import type { Session } from '@opencode/schema/session';
import { Effect, Stream, type Scope } from 'effect';
import {
  FallbackConfig,
  FallbackNotice,
  FallbackTrigger,
  ModelChain,
} from '../../modules/index.js';
import { FallbackState } from '../../services/index.js';

/** Plugin id shared with the host loader and `opencode.jsonc`. */
export const ID = 'model-fallback';

type Context = Plugin.Context;
type Event = Stream.Success<ReturnType<Context['event']['subscribe']>>;

interface SwitchInput {
  readonly sessionID: Session.ID;
  readonly from: ModelChain.Ref;
  readonly to: ModelChain.Ref;
  readonly phase: FallbackNotice.Phase;
  readonly failure: FallbackTrigger.Failure;
  readonly resume: boolean;
}

/**
 * Switch the session model and leave the visible history note. A failed switch
 * leaves the session untouched and reports `false` so the caller does not
 * retry into the same model.
 */
const switchTo = (context: Context, input: SwitchInput): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const switched = yield* context.session
      .switchModel({ sessionID: input.sessionID, model: input.to })
      .pipe(Effect.as(true), Effect.catch(describeFailure('switch model', false)));
    if (!switched) return false;

    const notice = FallbackNotice.make({
      phase: input.phase,
      from: input.from,
      to: input.to,
      failure: input.failure,
    });
    yield* context.session
      .synthetic({
        sessionID: input.sessionID,
        text: notice.text,
        description: notice.description,
        metadata: notice.metadata,
        resume: input.resume,
      })
      .pipe(Effect.catch(describeFailure('record notice', false)));
    return true;
  });

/** Log a host call failure without failing the hook, resolving to `fallback`. */
const describeFailure =
  <A>(operation: string, fallback: A) =>
  (cause: unknown): Effect.Effect<A> =>
    Effect.logError(`[${ID}] could not ${operation}: ${String(cause)}`).pipe(Effect.as(fallback));

/**
 * Walk to the next untried model for a session. Marks the failing model first,
 * so a later failure in the same session cannot select it again.
 */
const advance = (
  state: FallbackState.Impl,
  input: {
    readonly sessionID: Session.ID;
    readonly from: ModelChain.Ref;
    readonly config: FallbackConfig.Config;
  },
): Effect.Effect<ModelChain.Ref | undefined> =>
  Effect.gen(function* () {
    const tried = yield* state.tried(input.sessionID);
    yield* state.mark(input.sessionID, ModelChain.key(input.from));
    const next = ModelChain.next(input.config.chain, input.from, tried);
    if (next === undefined) {
      yield* Effect.logWarning(
        `[${ID}] no fallback left after ${ModelChain.label(input.from)}; leaving the session on it.`,
      );
    }
    return next;
  });

/** Fallback driven by the retry hook: flip a doomed retry onto the next model. */
const onRetry = (
  context: Context,
  state: FallbackState.Impl,
  config: FallbackConfig.Config,
): Effect.Effect<void, never, Scope.Scope> =>
  context.session
    .hook('retry', (input) =>
      Effect.gen(function* () {
        if (!FallbackTrigger.matches(input.error, config.triggers)) return;
        const to = yield* advance(state, { sessionID: input.sessionID, from: input.model, config });
        if (to === undefined) return;
        const switched = yield* switchTo(context, {
          sessionID: input.sessionID,
          from: input.model,
          to,
          phase: 'retry',
          failure: input.error,
          resume: false,
        });
        if (switched) input.decision = { retry: true, delay: 0 };
      }),
    )
    .pipe(Effect.asVoid);

/** Fallback driven by terminal failure: switch, note, and resume the session. */
const onFailure = (
  context: Context,
  state: FallbackState.Impl,
  config: FallbackConfig.Config,
  event: Extract<Event, { type: 'session.execution.failed' }>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (!FallbackTrigger.matches(event.data.error, config.triggers)) return;
    const session = yield* context.session
      .get({ sessionID: event.data.sessionID })
      .pipe(Effect.catch(describeFailure('read session', undefined)));
    if (session === undefined || session.model === undefined) return;
    const to = yield* advance(state, {
      sessionID: event.data.sessionID,
      from: session.model,
      config,
    });
    if (to === undefined) return;
    yield* switchTo(context, {
      sessionID: event.data.sessionID,
      from: session.model,
      to,
      phase: 'resume',
      failure: event.data.error,
      resume: true,
    });
  });

/** Subscribe to the events the plugin reacts to; scoped to the plugin lifetime. */
const onEvents = (
  context: Context,
  state: FallbackState.Impl,
  config: FallbackConfig.Config,
): Effect.Effect<void, never, Scope.Scope> =>
  context.event.subscribe().pipe(
    Stream.runForEach((event) => {
      if (event.type === 'session.execution.failed')
        return onFailure(context, state, config, event);
      if (event.type === 'session.deleted') return state.forget(event.data.sessionID);
      return Effect.void;
    }),
    Effect.forkScoped,
    Effect.asVoid,
  );

/** Read options and wire the hooks; an unusable chain leaves the plugin inert. */
const run = (
  context: Context,
): Effect.Effect<void, never, FallbackState.FallbackState | Scope.Scope> =>
  Effect.gen(function* () {
    const config = yield* FallbackConfig.decode(context.options).pipe(
      Effect.catch((error) =>
        Effect.logError(`[${ID}] invalid options: ${error.reason}`).pipe(
          Effect.as(FallbackConfig.idle),
        ),
      ),
    );
    if (config.chain.length === 0) {
      yield* Effect.logWarning(
        `[${ID}] no fallback chain configured; set options.chain in opencode.jsonc.`,
      );
      return;
    }
    yield* Effect.logInfo(
      `[${ID}] fallback chain: ${config.chain.map(ModelChain.label).join(' -> ')}`,
    );
    const state = yield* FallbackState.FallbackState;
    yield* onRetry(context, state, config);
    yield* onEvents(context, state, config);
  });

/** Activate the plugin: `session.hook("retry")` plus the terminal-failure resume. */
export const activate = (context: Context): Effect.Effect<void, never, Scope.Scope> =>
  run(context).pipe(Effect.provide(FallbackState.Default));
