import { Effect, Layer, Option } from 'effect';
import {
  SessionFactory,
  type SessionEvent,
  type SessionFactoryImpl,
  type SessionPort,
  type SessionRequest,
} from '@montflow/pi-runs';

/** One fake session created by the harness, with its recorded traffic. */
export interface FakeSession {
  readonly request: SessionRequest;
  readonly listeners: Array<(event: SessionEvent) => void>;
  readonly prompts: string[];
  readonly steers: string[];
  readonly followUps: string[];
  aborts: number;
}

/** Fake factory plus the sessions it created, in order. */
export interface EngineHarness {
  readonly sessions: FakeSession[];
  readonly layer: Layer.Layer<SessionFactory>;
}

/** Harness knobs for failure behavior. */
export interface HarnessOptions {
  /** Fail every session `create` with this reason (simulates a missing Pi install). */
  readonly failCreate?: string | undefined;
}

/**
 * Build a fake `SessionFactory` layer the engine can run against, so
 * lifecycle tests exercise the real runner without a Pi install. Mirrors
 * the harness in `packages/pi-runs/src/services/runner/tests`.
 * @param options - failure knobs
 * @returns recorded sessions plus the injectable factory layer
 */
export const makeHarness = (options: HarnessOptions = {}): EngineHarness => {
  const sessions: FakeSession[] = [];
  const factory: SessionFactoryImpl = {
    create: (request) =>
      options.failCreate === undefined
        ? Effect.sync(() => {
            const record: FakeSession = {
              request,
              listeners: [],
              prompts: [],
              steers: [],
              followUps: [],
              aborts: 0,
            };
            sessions.push(record);
            const port: SessionPort = {
              prompt: (text) =>
                Effect.sync(() => {
                  record.prompts.push(text);
                }),
              steer: (text) =>
                Effect.sync(() => {
                  record.steers.push(text);
                }),
              followUp: (text) =>
                Effect.sync(() => {
                  record.followUps.push(text);
                }),
              abort: () =>
                Effect.sync(() => {
                  record.aborts += 1;
                }),
              messages: () => [],
              subscribe: (listener) => {
                record.listeners.push(listener);
                return () => {
                  const index = record.listeners.indexOf(listener);
                  if (index >= 0) record.listeners.splice(index, 1);
                };
              },
              dispose: () => undefined,
            };
            return port;
          })
        : Effect.fail(options.failCreate),
  };
  return { sessions, layer: Layer.succeed(SessionFactory, factory) };
};

/** Push an `agent_settled` event through every subscribed session listener. */
export const settleEvent = (session: FakeSession): void => {
  for (const listener of session.listeners) listener({ type: 'settled' });
};

/** Raw Pi message payload, derived from the engine's session event type. */
type SessionMessage = Extract<SessionEvent, { type: 'message' }>['message'];

/**
 * Push a mirrored `message` event through every subscribed session
 * listener. The message is the engine's own event payload type, so no
 * parsing is needed at this test boundary.
 * @param session - fake session to emit through
 * @param message - raw Pi message payload
 */
export const messageEvent = (session: FakeSession, message: SessionMessage): void => {
  for (const listener of session.listeners) listener({ type: 'message', message });
};

/**
 * Poll a read until its value satisfies `done`, sleeping briefly between
 * attempts. The engine's consumer runs on its own runtime, so lifecycle
 * tests that depend on streamed events need a real-time wait.
 * @param read - value to poll
 * @param done - predicate that ends the wait
 * @returns the first satisfying value, or a timeout failure
 */
export const poll = <A>(
  read: Effect.Effect<A, string>,
  done: (value: A) => boolean,
): Effect.Effect<A, string> =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = yield* read.pipe(Effect.option);
      if (Option.isSome(value) && done(value.value)) return value.value;
      yield* Effect.sleep('5 millis');
    }
    return yield* Effect.fail('poll timed out');
  });
