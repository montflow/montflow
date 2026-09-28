import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import type { Message } from '@earendil-works/pi-ai';
import type { AgentSessionEvent, CreateAgentSessionOptions } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  createPort,
  interactionTools,
  isPiMessage,
  sessionEventOf,
  toPort,
  withInteractionTools,
  type PiAgentSession,
  type SessionEvent,
  type SessionRequest,
  type SessionUi,
} from '../index.js';

/** Minimal event double: only the fields under test. */
interface TestEvent {
  readonly type: string;
  readonly message?: { readonly role: string };
}

/** Recorded traffic for a fake live session. */
interface FakeSessionCalls {
  readonly prompts: string[];
  readonly steers: string[];
  readonly followUps: string[];
  aborts: number;
  disposes: number;
}

// SAFETY: test doubles carry only the discriminated fields under test; the
// function reads `type` and `message` only.
const asEvent = (value: TestEvent): AgentSessionEvent => value as AgentSessionEvent;

/** One fake live session with recorded traffic and a manual event emitter. */
const makeFakeSession = (messages: ReadonlyArray<{ readonly role: string }> = []) => {
  const listeners: Array<(event: AgentSessionEvent) => void> = [];
  const calls: FakeSessionCalls = {
    prompts: [],
    steers: [],
    followUps: [],
    aborts: 0,
    disposes: 0,
  };
  const session: PiAgentSession = {
    prompt: (text) => {
      calls.prompts.push(text);
      return Promise.resolve();
    },
    steer: (text) => {
      calls.steers.push(text);
      return Promise.resolve();
    },
    followUp: (text) => {
      calls.followUps.push(text);
      return Promise.resolve();
    },
    abort: () => {
      calls.aborts += 1;
      return Promise.resolve();
    },
    messages,
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    dispose: () => {
      calls.disposes += 1;
    },
  };
  const emit = (event: AgentSessionEvent): void => {
    for (const listener of listeners) listener(event);
  };
  return { session, listeners, calls, emit };
};

/** A fake Pi coding-agent module plus the state `createPort` drives. */
const makeFakePi = (
  options: {
    readonly resolvedModel?: { readonly id: string };
    readonly resolvedError?: string;
    readonly messages?: ReadonlyArray<{ readonly role: string }>;
  } = {},
) => {
  const fake = makeFakeSession(options.messages);
  const appended: Message[] = [];
  const manager = {
    appendMessage: (message: Message) => {
      appended.push(message);
    },
  };
  const capturedOptions: CreateAgentSessionOptions[] = [];
  const state = {
    appended,
    cwd: '',
    manager,
    options: capturedOptions,
    fake,
  };
  // SAFETY: the double implements only the Pi surface `createPort` calls
  // (`ModelRuntime`, `SessionManager`, `resolveCliModel`, `createAgentSession`,
  // `defineTool`); `never` lets the partial double stand in for the full module.
  const pi = {
    ModelRuntime: { create: () => Promise.resolve({}) },
    SessionManager: {
      inMemory: (cwd: string) => {
        state.cwd = cwd;
        return manager;
      },
    },
    resolveCliModel: () => ({
      model: options.resolvedModel,
      warning: undefined,
      error: options.resolvedError,
    }),
    createAgentSession: (agentOptions: CreateAgentSessionOptions) => {
      state.options.push(agentOptions);
      return Promise.resolve({ session: fake.session });
    },
    defineTool: <T>(definition: T) => definition,
  } as never;
  return { pi, state };
};

/** A session request with sane defaults; override per test. */
const sessionRequest = (overrides: Partial<SessionRequest> = {}): SessionRequest => ({
  root: '/repo',
  id: 'run-1',
  model: undefined,
  tools: undefined,
  replay: [],
  ui: {
    input: () => Promise.resolve(undefined),
    notify: () => undefined,
    toast: () => undefined,
    progress: () => undefined,
  },
  ...overrides,
});

Vitest.describe('Pi session mapping runtime', () => {
  Vitest.it.effect('narrows only Pi messages', () =>
    Effect.sync(() => {
      Vitest.expect(isPiMessage({ role: 'user' })).toBe(true);
      Vitest.expect(isPiMessage({ role: 'assistant' })).toBe(true);
      Vitest.expect(isPiMessage({ role: 'toolResult' })).toBe(true);
      Vitest.expect(isPiMessage({ role: 'bashExecution' })).toBe(false);
    }),
  );

  Vitest.it.effect('maps message_end to a message event', () =>
    Effect.sync(() => {
      const message = { role: 'assistant', content: [] };
      const event = sessionEventOf(asEvent({ type: 'message_end', message }));
      Vitest.expect(event).toStrictEqual({ type: 'message', message });
    }),
  );

  Vitest.it.effect('maps agent_settled to settled', () =>
    Effect.sync(() => {
      Vitest.expect(sessionEventOf(asEvent({ type: 'agent_settled' }))).toStrictEqual({
        type: 'settled',
      });
    }),
  );

  Vitest.it.effect('ignores streaming and unrelated events', () =>
    Effect.sync(() => {
      Vitest.expect(sessionEventOf(asEvent({ type: 'turn_start' }))).toBeUndefined();
      Vitest.expect(
        sessionEventOf(asEvent({ type: 'message_end', message: { role: 'bashExecution' } })),
      ).toBeUndefined();
    }),
  );
});

Vitest.describe('Pi session port runtime', () => {
  Vitest.it.effect('toPort dispatches normalized events and ignores the rest', () =>
    Effect.sync(() => {
      const fake = makeFakeSession();
      const port = toPort(fake.session);
      const seen: SessionEvent[] = [];
      port.subscribe((event) => seen.push(event));
      const message = { role: 'user', content: 'hi' };
      fake.emit(asEvent({ type: 'message_end', message }));
      fake.emit(asEvent({ type: 'agent_settled' }));
      fake.emit(asEvent({ type: 'turn_start' }));
      fake.emit(asEvent({ type: 'message_end', message: { role: 'bashExecution' } }));
      Vitest.expect(seen).toStrictEqual([{ type: 'message', message }, { type: 'settled' }]);
    }),
  );

  Vitest.it.effect('toPort unsubscribe removes the listener', () =>
    Effect.sync(() => {
      const fake = makeFakeSession();
      const port = toPort(fake.session);
      const seen: SessionEvent[] = [];
      const unsubscribe = port.subscribe((event) => seen.push(event));
      fake.emit(asEvent({ type: 'agent_settled' }));
      unsubscribe();
      fake.emit(asEvent({ type: 'agent_settled' }));
      Vitest.expect(seen).toStrictEqual([{ type: 'settled' }]);
    }),
  );

  Vitest.it.effect('toPort forwards calls, filters messages, and disposes', () =>
    Effect.gen(function* () {
      const fake = makeFakeSession([{ role: 'user' }, { role: 'bashExecution' }]);
      const port = toPort(fake.session);
      yield* port.prompt('go');
      yield* port.steer('left');
      yield* port.followUp('more');
      yield* port.abort();
      Vitest.expect(fake.calls.prompts).toStrictEqual(['go']);
      Vitest.expect(fake.calls.steers).toStrictEqual(['left']);
      Vitest.expect(fake.calls.followUps).toStrictEqual(['more']);
      Vitest.expect(fake.calls.aborts).toBe(1);
      Vitest.expect(port.messages().map((message) => message.role)).toStrictEqual(['user']);
      port.dispose();
      Vitest.expect(fake.calls.disposes).toBe(1);
    }),
  );

  Vitest.it.effect('toPort surfaces a rejected session call as a typed failure', () =>
    Effect.gen(function* () {
      const fake = makeFakeSession();
      const session: PiAgentSession = {
        ...fake.session,
        prompt: () => Promise.reject(new Error('prompt exploded')),
      };
      const port = toPort(session);
      const error = yield* port.prompt('go').pipe(Effect.flip);
      Vitest.expect(error).toBe('prompt exploded');
    }),
  );
});

Vitest.describe('Pi interaction tools runtime', () => {
  Vitest.it.effect('withInteractionTools unions names only when tools are restricted', () =>
    Effect.sync(() => {
      Vitest.expect(withInteractionTools(undefined, ['ask_user'])).toBeUndefined();
      Vitest.expect(withInteractionTools([], ['ask_user', 'notify_user'])).toStrictEqual([
        'ask_user',
        'notify_user',
      ]);
      Vitest.expect(
        withInteractionTools(['read', 'ask_user'], ['ask_user', 'notify_user']),
      ).toStrictEqual(['read', 'ask_user', 'notify_user']);
    }),
  );

  Vitest.it.effect('interactionTools binds ask_user and notify_user to the UI', () =>
    Effect.gen(function* () {
      const { pi } = makeFakePi();
      const asked: string[] = [];
      const notified: Array<readonly [string, string]> = [];
      const toasted: Array<readonly [string, string | undefined]> = [];
      const progressed: string[] = [];
      const ui: SessionUi = {
        input: (title) => {
          asked.push(title);
          return Promise.resolve('main');
        },
        notify: (message, kind) => {
          notified.push([message, kind]);
        },
        toast: (message, variant) => {
          toasted.push([message, variant]);
        },
        progress: (message) => {
          progressed.push(message);
        },
      };
      const tools = interactionTools(pi, Type, ui);
      Vitest.expect(tools.map((tool) => tool.name)).toStrictEqual([
        'ask_user',
        'notify_user',
        'toast_user',
        'update_status',
      ]);
      const ask = tools[0];
      const notify = tools[1];
      const toast = tools[2];
      const update = tools[3];
      if (ask === undefined || notify === undefined || toast === undefined || update === undefined)
        return yield* Effect.fail('tools missing');
      // SAFETY: the harness `defineTool` is an identity stub, so the execute
      // context is never read; `never` satisfies the unused fifth parameter.
      const answer = yield* Effect.promise(() =>
        ask.execute(
          'call-1',
          { question: 'Which branch?' },
          undefined,
          undefined,
          undefined as never,
        ),
      );
      Vitest.expect(asked).toStrictEqual(['Which branch?']);
      Vitest.expect(answer.content).toStrictEqual([{ type: 'text', text: 'main' }]);
      // SAFETY: same identity `defineTool` stub — the execute context is unused.
      yield* Effect.promise(() =>
        notify.execute('call-2', { message: 'heads up' }, undefined, undefined, undefined as never),
      );
      Vitest.expect(notified).toStrictEqual([['heads up', 'info']]);
      // SAFETY: same identity `defineTool` stub — the execute context is unused.
      yield* Effect.promise(() =>
        toast.execute(
          'call-toast',
          { message: 'on it', variant: 'success' },
          undefined,
          undefined,
          undefined as never,
        ),
      );
      Vitest.expect(toasted).toStrictEqual([['on it', 'success']]);
      // SAFETY: same identity `defineTool` stub — the execute context is unused.
      yield* Effect.promise(() =>
        update.execute('call-3', { message: 'halfway' }, undefined, undefined, undefined as never),
      );
      Vitest.expect(progressed).toStrictEqual(['halfway']);
    }),
  );
});

Vitest.describe('Pi session factory runtime', () => {
  Vitest.it.effect('createPort seeds replay through SessionManager and wires options', () =>
    Effect.gen(function* () {
      const replay: Message[] = [
        { role: 'user', content: 'first', timestamp: 1 },
        { role: 'user', content: 'second', timestamp: 2 },
      ];
      const { pi, state } = makeFakePi({ resolvedModel: { id: 'test-model' }, messages: replay });
      const tools = ['read', 'bash'];
      const port = yield* Effect.promise(() =>
        createPort(pi, Type, sessionRequest({ model: 'test-model', tools, replay })),
      );
      // The options snapshot must not alias the caller's mutable array.
      tools.push('write');
      Vitest.expect(state.cwd).toBe('/repo');
      Vitest.expect(state.appended).toStrictEqual(replay);
      const options = state.options[0];
      Vitest.expect(options?.cwd).toBe('/repo');
      Vitest.expect(options?.sessionManager).toBe(state.manager);
      Vitest.expect(options?.tools).toStrictEqual([
        'read',
        'bash',
        'ask_user',
        'notify_user',
        'toast_user',
        'update_status',
      ]);
      Vitest.expect(options?.model).toStrictEqual({ id: 'test-model' });
      Vitest.expect(options?.customTools?.map((tool) => tool.name)).toStrictEqual([
        'ask_user',
        'notify_user',
        'toast_user',
        'update_status',
      ]);
      yield* port.prompt('continue');
      Vitest.expect(state.fake.calls.prompts).toStrictEqual(['continue']);
    }),
  );

  Vitest.it.effect('createPort leaves tools and model unset when not requested', () =>
    Effect.gen(function* () {
      const { pi, state } = makeFakePi();
      yield* Effect.promise(() => createPort(pi, Type, sessionRequest()));
      const options = state.options[0];
      Vitest.expect(options?.tools).toBeUndefined();
      Vitest.expect(options?.model).toBeUndefined();
    }),
  );

  Vitest.it.effect(
    'createPort enables ask_user and notify_user under the default run allowlist',
    () =>
      Effect.gen(function* () {
        const { pi, state } = makeFakePi();
        // The workspace's `DEFAULT_RUN_TOOLS`: read/write/edit must not filter
        // out the interaction tools Pi checks through `allowedToolNames`.
        yield* Effect.promise(() =>
          createPort(pi, Type, sessionRequest({ tools: ['read', 'write', 'edit'] })),
        );
        const options = state.options[0];
        Vitest.expect(options?.tools).toContain('ask_user');
        Vitest.expect(options?.tools).toContain('notify_user');
        Vitest.expect(options?.tools).toContain('toast_user');
        Vitest.expect(options?.tools).toContain('update_status');
        Vitest.expect(options?.tools).toStrictEqual([
          'read',
          'write',
          'edit',
          'ask_user',
          'notify_user',
          'toast_user',
          'update_status',
        ]);
        Vitest.expect(options?.customTools?.map((tool) => tool.name)).toStrictEqual([
          'ask_user',
          'notify_user',
          'toast_user',
          'update_status',
        ]);
      }),
  );

  Vitest.it.effect('createPort rejects an unknown model before creating a session', () =>
    Effect.gen(function* () {
      const { pi, state } = makeFakePi({ resolvedError: 'no such model' });
      const error = yield* Effect.tryPromise({
        try: () => createPort(pi, Type, sessionRequest({ model: 'nope' })),
        catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
      }).pipe(Effect.flip);
      Vitest.expect(error).toContain("Unknown model 'nope'");
      Vitest.expect(state.options).toStrictEqual([]);
    }),
  );
});
