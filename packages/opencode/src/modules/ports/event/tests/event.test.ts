import { Effect, Stream } from 'effect';
import * as Vitest from '@effect/vitest';
import * as EventPort from '../index.js';

/** A host stream that emits the recorded events, then ends. */
const makeContext = (events: ReadonlyArray<EventPort.HostEvent>) => {
  const subscribed: Array<string> = [];
  const context: EventPort.EventContext = {
    event: {
      subscribe: (type) => {
        subscribed.push(type);
        return Stream.fromIterable(events.filter((event) => event.type === type)).pipe(
          Stream.map((event) => event),
        );
      },
    },
  };
  return { context, subscribed };
};

Vitest.describe('EventPort runtime', () => {
  Vitest.it.effect('subscribe yields only the named event type', () =>
    Effect.gen(function* () {
      const { context, subscribed } = makeContext([
        { type: 'session.execution.succeeded', data: { sessionID: 'ses_1' } },
        { type: 'session.execution.failed', data: { sessionID: 'ses_2' } },
      ]);
      const port = EventPort.makeEventPort(context);
      const events = yield* Stream.runCollect(port.subscribe('session.execution.succeeded'));
      Vitest.expect(subscribed).toStrictEqual(['session.execution.succeeded']);
      Vitest.expect([...events]).toStrictEqual([
        { type: 'session.execution.succeeded', data: { sessionID: 'ses_1' } },
      ]);
    }),
  );

  Vitest.it.effect('an empty event type yields an empty stream', () =>
    Effect.gen(function* () {
      const { context } = makeContext([]);
      const port = EventPort.makeEventPort(context);
      const events = yield* Stream.runCollect(port.subscribe('session.execution.interrupted'));
      Vitest.expect([...events]).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('a host stream failure ends the stream instead of failing it', () =>
    Effect.gen(function* () {
      const context: EventPort.EventContext = {
        event: {
          subscribe: () => Stream.fail(new Error('host stream dropped')),
        },
      };
      const port = EventPort.makeEventPort(context);
      const events = yield* Stream.runCollect(port.subscribe('session.execution.succeeded'));
      Vitest.expect([...events]).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('dies when the host context has no event domain', () =>
    Effect.gen(function* () {
      const port = EventPort.makeEventPort({});
      const error = yield* Stream.runCollect(port.subscribe('session.execution.succeeded')).pipe(
        Effect.catchCause((cause) => Effect.fail(cause)),
        Effect.flip,
      );
      Vitest.expect(String(error)).toContain('EventPort');
    }),
  );
});
