import { Duration, Effect, Fiber } from 'effect';
import * as Vitest from '@effect/vitest';
import { TestClock } from 'effect/testing';
import { Agent } from '@opencode/schema/agent';
import { Model } from '@opencode/schema/model';
import { Session } from '@opencode/schema/session';
import * as SessionDispatch from '../index.js';

const sessionID = Session.ID.make('ses_test');

/** Assistant transcript entry with the given text parts. */
const assistant = (...texts: readonly string[]): SessionDispatch.SessionEntry => ({
  type: 'assistant',
  content: texts.map((text) => ({ type: 'text', text })),
});

const user = (text: string): SessionDispatch.SessionEntry => ({
  type: 'user',
  content: [{ type: 'text', text }],
});

type SessionDomain = NonNullable<SessionDispatch.SessionDispatchContext['session']>;

interface Calls {
  readonly create: Array<Parameters<SessionDomain['create']>[0]>;
  readonly prompt: Array<Parameters<SessionDomain['prompt']>[0]>;
  readonly wait: Array<Parameters<SessionDomain['wait']>[0]>;
}

const makeContext = (
  messages: ReadonlyArray<SessionDispatch.SessionEntry> = [],
  overrides: Partial<SessionDomain> = {},
) => {
  const calls: Calls = { create: [], prompt: [], wait: [] };
  const context: SessionDispatch.SessionDispatchContext = {
    location: { directory: '/project' },
    session: {
      create: (input) =>
        Effect.sync(() => {
          calls.create.push(input);
          return { id: sessionID };
        }),
      prompt: (input) =>
        Effect.sync(() => {
          calls.prompt.push(input);
        }),
      wait: (input) =>
        Effect.sync(() => {
          calls.wait.push(input);
        }),
      context: () => Effect.succeed(messages),
      ...overrides,
    },
  };
  return { context, calls };
};

Vitest.describe('SessionDispatchPort runtime', () => {
  Vitest.it.effect('create opens a session in the plugin directory and returns its id', () =>
    Effect.gen(function* () {
      const { context, calls } = makeContext();
      const port = SessionDispatch.makeSessionDispatchPort(context);
      const id = yield* port.create({ title: 'prompt: reviewer' });
      Vitest.expect(id).toBe(sessionID);
      Vitest.expect(calls.create).toStrictEqual([
        { title: 'prompt: reviewer', location: { directory: '/project' } },
      ]);
    }),
  );

  Vitest.it.effect('create forwards the agent and model when given', () =>
    Effect.gen(function* () {
      const { context, calls } = makeContext();
      const port = SessionDispatch.makeSessionDispatchPort(context);
      const model = Model.Ref.parse('anthropic/claude-sonnet-4');
      yield* port.create({ agent: Agent.ID.make('mf-reviewer'), model });
      Vitest.expect(calls.create).toStrictEqual([
        { agent: 'mf-reviewer', model, location: { directory: '/project' } },
      ]);
    }),
  );

  Vitest.it.effect('prompt and wait forward to the host', () =>
    Effect.gen(function* () {
      const { context, calls } = makeContext();
      const port = SessionDispatch.makeSessionDispatchPort(context);
      yield* port.prompt(sessionID, 'hello');
      yield* port.prompt(sessionID, 'follow-up', 'queue');
      yield* port.wait(sessionID);
      Vitest.expect(calls.prompt).toStrictEqual([
        { sessionID, text: 'hello' },
        { sessionID, text: 'follow-up', delivery: 'queue' },
      ]);
      Vitest.expect(calls.wait).toStrictEqual([{ sessionID }]);
    }),
  );

  Vitest.it.effect('reply returns the last non-empty assistant text', () =>
    Effect.gen(function* () {
      const { context } = makeContext([
        user('hi'),
        assistant('first'),
        assistant('second', 'part'),
        assistant('   '),
      ]);
      const port = SessionDispatch.makeSessionDispatchPort(context);
      Vitest.expect(yield* port.reply(sessionID)).toBe('second\npart');
    }),
  );

  Vitest.it.effect('reply is undefined when the session has no assistant text', () =>
    Effect.gen(function* () {
      const { context } = makeContext([user('hi')]);
      const port = SessionDispatch.makeSessionDispatchPort(context);
      Vitest.expect(yield* port.reply(sessionID)).toBeUndefined();
    }),
  );

  Vitest.it.effect('turns a host rejection into a DispatchError', () =>
    Effect.gen(function* () {
      const { context } = makeContext([], {
        create: () => Effect.fail(new Error('unknown agent mf-reviewer')),
      });
      const port = SessionDispatch.makeSessionDispatchPort(context);
      const error = yield* port.create({}).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SessionDispatch.DispatchError);
      Vitest.expect(error.operation).toBe('create');
      Vitest.expect(error.message).toBe('unknown agent mf-reviewer');
    }),
  );

  Vitest.it.effect('times out a session that never settles', () =>
    Effect.gen(function* () {
      const { context } = makeContext([], { wait: () => Effect.never });
      const port = SessionDispatch.makeSessionDispatchPort(context);
      const fiber = yield* Effect.forkChild(port.wait(sessionID));
      yield* TestClock.adjust(Duration.minutes(5));
      const error = yield* Fiber.join(fiber).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SessionDispatch.DispatchError);
      Vitest.expect(error.operation).toBe('wait');
      Vitest.expect(error.message).toContain('did not settle');
    }),
  );

  Vitest.it.effect('fails at call time without a server context', () =>
    Effect.gen(function* () {
      const port = SessionDispatch.makeSessionDispatchPort({});
      const error = yield* port.create({}).pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );

  Vitest.it.effect('fails at call time without a plugin directory', () =>
    Effect.gen(function* () {
      const { context } = makeContext();
      const port = SessionDispatch.makeSessionDispatchPort({ session: context.session });
      const error = yield* port.create({}).pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );
});
