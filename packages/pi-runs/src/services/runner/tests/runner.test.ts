import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodeOsPath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import type { Message } from '@earendil-works/pi-ai';
import { Store } from '../../store/index.js';
import {
  Default as RunnerDefault,
  NoopWorkspaceBridge,
  Runner,
  SessionFactory,
  WorkspaceBridge,
  type SessionEvent,
  type SessionFactoryImpl,
  type SessionPort,
  type SessionRequest,
  type WorkspaceBridgeImpl,
} from '../index.js';

/** One fake session created by the harness, with its recorded traffic. */
interface FakeSession {
  readonly request: SessionRequest;
  readonly listeners: Array<(event: SessionEvent) => void>;
  readonly prompts: string[];
  readonly steers: string[];
  readonly followUps: string[];
  aborts: number;
}

/** Harness knobs for failure and bridge behavior. */
interface HarnessOptions {
  /** Fail `prompt` on resumed sessions (those seeded with a replay). */
  readonly failResumePrompt?: boolean;
  /** Fail every `prompt` call, live or resumed. */
  readonly failPrompt?: boolean;
  /** Replace the default no-op workspace bridge. */
  readonly bridge?: WorkspaceBridgeImpl;
  /** Use a file-backed store under this root instead of the in-memory one. */
  readonly storeRoot?: string;
}

/** Fake factory plus the sessions it created, in order. */
const makeHarness = (options: HarnessOptions = {}) => {
  const sessions: FakeSession[] = [];
  const factory: SessionFactoryImpl = {
    create: (request) =>
      Effect.sync(() => {
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
          prompt: (text) => {
            if (options.failPrompt === true) return Effect.fail('prompt exploded');
            if (options.failResumePrompt === true && request.replay.length > 0) {
              return Effect.fail('prompt exploded');
            }
            return Effect.sync(() => {
              record.prompts.push(text);
            });
          },
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
      }),
  };
  const bridgeLayer =
    options.bridge === undefined
      ? NoopWorkspaceBridge
      : Layer.succeed(WorkspaceBridge, options.bridge);
  const base = Layer.mergeAll(
    options.storeRoot === undefined
      ? Store.Ephemeral
      : Layer.effect(Store.Store, Store.makeWithRoot(options.storeRoot)).pipe(
          Layer.provide(Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer)),
        ),
    Layer.succeed(SessionFactory, factory),
    bridgeLayer,
    // The engine reads `.gitignore`; provide filesystem/path services.
    Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer),
  );
  // `base` is shared so the test can drive the same Store the runner uses.
  const layer = Layer.mergeAll(RunnerDefault.pipe(Layer.provide(base)), base);
  return { sessions, layer };
};

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const user = (text: string): Message => ({ role: 'user', content: text, timestamp: 1 });

const assistant = (text: string): Message => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
  api: 'test',
  provider: 'test',
  model: 'test-model',
  usage,
  stopReason: 'stop',
  timestamp: 1,
});

/** Assistant turn that calls a tool and will not resume until its result lands. */
const toolCall = (id: string): Message => ({
  role: 'assistant',
  content: [{ type: 'toolCall', id, name: 'ask_user', arguments: {} }],
  api: 'test',
  provider: 'test',
  model: 'test-model',
  usage,
  stopReason: 'toolUse',
  timestamp: 1,
});

const toolResult = (id: string, text: string): Message => ({
  role: 'toolResult',
  toolCallId: id,
  toolName: 'ask_user',
  content: [{ type: 'text', text }],
  isError: false,
  timestamp: 1,
});

/** Push a mirrored message through every subscribed session listener. */
const emit = (session: FakeSession, message: Message): void => {
  for (const listener of session.listeners) listener({ type: 'message', message });
};

/** Push an `agent_settled` event through every subscribed session listener. */
const settleEvent = (session: FakeSession): void => {
  for (const listener of session.listeners) listener({ type: 'settled' });
};

/** Let the detached queue consumer drain pending events. */
const flush = Effect.gen(function* () {
  for (let index = 0; index < 20; index++) yield* Effect.yieldNow;
});

Vitest.describe('Runner runtime', () => {
  Vitest.it.effect('start mirrors the prompt and settles on agent_settled', () => {
    const harness = makeHarness();
    let settled: string | undefined;
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({
        root: '/repo',
        id: 'run-1',
        name: 'Run One',
        prompt: 'do it',
        onSettled: (detail) =>
          Effect.sync(() => {
            settled = detail.receipt?.outcome;
          }),
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      yield* Effect.yieldNow;
      Vitest.expect(session.prompts).toStrictEqual(['do it']);
      emit(session, user('do it'));
      emit(session, assistant('all done'));
      yield* flush;
      settleEvent(session);
      yield* flush;
      const detail = yield* runner.detail('/repo', 'run-1');
      Vitest.expect(detail.events.map((event) => event.role)).toStrictEqual(['user', 'assistant']);
      Vitest.expect(detail.receipt?.outcome).toBe('done');
      Vitest.expect(settled).toBe('done');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('steer forwards to the live session and mirrors the delivered turn', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-2', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      yield* runner.steer('/repo', 'run-2', 'change course');
      Vitest.expect(session.steers).toStrictEqual(['change course']);
      // Pi delivers the steering turn when the current turn yields.
      emit(session, user('change course'));
      yield* flush;
      const detail = yield* runner.detail('/repo', 'run-2');
      Vitest.expect(detail.events.map((event) => event.text)).toStrictEqual([
        'go',
        'change course',
      ]);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('steer is not interposed before the in-flight tool result', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-2b', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      emit(session, toolCall('call-1'));
      yield* flush;
      yield* runner.steer('/repo', 'run-2b', 'change course');
      // Pi only delivers the steering turn after the tool result.
      emit(session, toolResult('call-1', 'tool output'));
      emit(session, user('change course'));
      yield* flush;
      const detail = yield* runner.detail('/repo', 'run-2b');
      Vitest.expect(detail.events.map((event) => event.role)).toStrictEqual([
        'user',
        'assistant',
        'toolResult',
        'user',
      ]);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('answer unpark the run and leaves the reply to the tool result', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-3', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      const parked = session.request.ui.input('Which branch?');
      yield* flush;
      yield* runner.answer('/repo', 'run-3', 'main');
      const reply = yield* Effect.promise(() => parked);
      Vitest.expect(reply).toBe('main');
      // Pi reports the answer as the `ask_user` tool result.
      emit(session, toolResult('call-1', 'main'));
      yield* flush;
      const detail = yield* runner.detail('/repo', 'run-3');
      // `Store.ask` records the question as a replay-ignored system turn.
      Vitest.expect(detail.events.map((event) => event.role)).toStrictEqual([
        'user',
        'system',
        'toolResult',
      ]);
      Vitest.expect(detail.events.map((event) => event.text)).toStrictEqual([
        'go',
        'Which branch?',
        'main',
      ]);
      Vitest.expect(detail.run.status).toBe('running');
      // A resume must not replay an interposed user turn.
      yield* runner.resume('/repo', 'run-3');
      yield* Effect.yieldNow;
      const resumed = harness.sessions[1];
      Vitest.expect(resumed?.request.replay.map((message) => message.role)).toStrictEqual([
        'user',
        'toolResult',
      ]);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('answer fails when the run has no live session', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      const error = yield* runner.answer('/repo', 'missing', 'main').pipe(Effect.flip);
      Vitest.expect(error).toContain('is not live');
      Vitest.expect(harness.sessions).toHaveLength(0);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('persists the tools allowlist and replays it on resume', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({
        root: '/repo',
        id: 'run-tools',
        prompt: 'go',
        tools: ['read', 'grep'],
      });
      const first = harness.sessions[0];
      if (first === undefined) return yield* Effect.fail('session not created');
      Vitest.expect(first.request.tools).toStrictEqual(['read', 'grep']);
      emit(first, user('go'));
      emit(first, assistant('partial'));
      yield* flush;
      // The allowlist survives the create → start transition in the store.
      const detail = yield* runner.detail('/repo', 'run-tools');
      Vitest.expect(detail.run.tools).toStrictEqual(['read', 'grep']);
      yield* runner.resume('/repo', 'run-tools');
      yield* Effect.yieldNow;
      Vitest.expect(harness.sessions[1]?.request.tools).toStrictEqual(['read', 'grep']);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('resume replays the stored transcript into a new session', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-4', prompt: 'first' });
      const first = harness.sessions[0];
      if (first === undefined) return yield* Effect.fail('session not created');
      emit(first, user('first'));
      emit(first, assistant('partial'));
      yield* flush;
      yield* runner.resume('/repo', 'run-4', 'continue');
      yield* Effect.yieldNow;
      const resumed = harness.sessions[1];
      Vitest.expect(resumed?.request.replay.map((message) => message.role)).toStrictEqual([
        'user',
        'assistant',
      ]);
      Vitest.expect(resumed?.prompts).toStrictEqual(['continue']);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('resume re-attaches the completion hook', () => {
    const harness = makeHarness();
    let settled: string | undefined;
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-resume-hook', prompt: 'first' });
      const first = harness.sessions[0];
      if (first === undefined) return yield* Effect.fail('session not created');
      emit(first, user('first'));
      emit(first, assistant('partial'));
      yield* flush;
      yield* runner.resume('/repo', 'run-resume-hook', 'continue', (detail) =>
        Effect.sync(() => {
          settled = detail.receipt?.outcome;
        }),
      );
      yield* Effect.yieldNow;
      const resumed = harness.sessions[1];
      if (resumed === undefined) return yield* Effect.fail('resumed session not created');
      settleEvent(resumed);
      yield* flush;
      Vitest.expect(settled).toBe('done');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('interrupt aborts the session and writes the cancelled receipt', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-5', prompt: 'go' });
      yield* runner.interrupt('/repo', 'run-5');
      Vitest.expect(harness.sessions[0]?.aborts).toBe(1);
      const detail = yield* runner.detail('/repo', 'run-5');
      Vitest.expect(detail.receipt?.outcome).toBe('cancelled');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('a settling child notifies its live parent', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'parent-1', prompt: 'coordinate' });
      yield* runner.start({
        root: '/repo',
        id: 'child-1',
        prompt: 'fix it',
        parent: 'parent-1',
      });
      const child = harness.sessions[1];
      if (child === undefined) return yield* Effect.fail('child not created');
      settleEvent(child);
      yield* flush;
      const notified = harness.sessions[0]?.followUps.some((line) => line.includes('child-1'));
      Vitest.expect(notified).toBe(true);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('records agent progress updates on the run', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-progress', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      session.request.ui.progress('scouting auth');
      yield* flush;
      const detail = yield* runner.detail('/repo', 'run-progress');
      Vitest.expect(detail.run.progress).toBe('scouting auth');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('persists related run ids and returns the running run', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      const run = yield* runner.start({
        root: '/repo',
        id: 'rel-1',
        prompt: 'x',
        related: ['other-1', 'other-2'],
      });
      Vitest.expect(run.status).toBe('running');
      Vitest.expect(run.related).toStrictEqual(['other-1', 'other-2']);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('settles once even when agent_settled fires twice', () => {
    const harness = makeHarness();
    let settled = 0;
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({
        root: '/repo',
        id: 'run-8',
        prompt: 'go',
        onSettled: () =>
          Effect.sync(() => {
            settled += 1;
          }),
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      settleEvent(session);
      settleEvent(session);
      yield* flush;
      Vitest.expect(settled).toBe(1);
      const detail = yield* runner.detail('/repo', 'run-8');
      Vitest.expect(detail.receipt?.outcome).toBe('done');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('interrupt releases a parked ask instead of hanging it', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-9', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      const parked = session.request.ui.input('Which branch?');
      yield* flush;
      yield* runner.interrupt('/repo', 'run-9');
      const reply = yield* Effect.promise(() => parked);
      Vitest.expect(reply).toBeUndefined();
      const detail = yield* runner.detail('/repo', 'run-9');
      Vitest.expect(detail.receipt?.outcome).toBe('cancelled');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('settle releases a parked ask', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-10', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      const parked = session.request.ui.input('Q?');
      yield* flush;
      settleEvent(session);
      yield* flush;
      const reply = yield* Effect.promise(() => parked);
      Vitest.expect(reply).toBeUndefined();
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('routes notify_user to the workspace notify bridge', () => {
    const notifies: Array<readonly [string, string]> = [];
    const toasts: Array<readonly [string, string | undefined]> = [];
    const bridge: WorkspaceBridgeImpl = {
      toast: (message, variant) =>
        Effect.sync(() => {
          toasts.push([message, variant]);
        }),
      notify: (title, body) =>
        Effect.sync(() => {
          notifies.push([title, body]);
        }),
    };
    const harness = makeHarness({ bridge });
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-11', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      session.request.ui.notify('something happened', 'info');
      yield* flush;
      Vitest.expect(notifies).toStrictEqual([["Run 'run-11'", 'something happened']]);
      Vitest.expect(toasts).toStrictEqual([]);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('routes a run toast to the workspace toast bridge', () => {
    const toasts: Array<readonly [string, string | undefined]> = [];
    const notifies: Array<readonly [string, string]> = [];
    const bridge: WorkspaceBridgeImpl = {
      toast: (message, variant) =>
        Effect.sync(() => {
          toasts.push([message, variant]);
        }),
      notify: (title, body) =>
        Effect.sync(() => {
          notifies.push([title, body]);
        }),
    };
    const harness = makeHarness({ bridge });
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-12', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      session.request.ui.toast('working on it', 'success');
      yield* flush;
      Vitest.expect(toasts).toStrictEqual([['working on it', 'success']]);
      Vitest.expect(notifies).toStrictEqual([]);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('surfaces a resumed prompt failure as an error toast', () => {
    const toasts: Array<readonly [string, string | undefined]> = [];
    const bridge: WorkspaceBridgeImpl = {
      toast: (message, variant) =>
        Effect.sync(() => {
          toasts.push([message, variant]);
        }),
      notify: () => Effect.void,
    };
    const harness = makeHarness({ bridge, failResumePrompt: true });
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-12', prompt: 'first' });
      const first = harness.sessions[0];
      if (first === undefined) return yield* Effect.fail('session not created');
      emit(first, user('first'));
      emit(first, assistant('partial'));
      yield* flush;
      yield* runner.resume('/repo', 'run-12', 'continue');
      yield* flush;
      Vitest.expect(toasts.some(([message]) => message.includes('prompt exploded'))).toBe(true);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('surfaces a start prompt failure as an error toast', () => {
    const toasts: Array<readonly [string, string | undefined]> = [];
    const bridge: WorkspaceBridgeImpl = {
      toast: (message, variant) =>
        Effect.sync(() => {
          toasts.push([message, variant]);
        }),
      notify: () => Effect.void,
    };
    const harness = makeHarness({ bridge, failPrompt: true });
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-16', prompt: 'go' });
      yield* flush;
      Vitest.expect(toasts.some(([message]) => message.includes('prompt exploded'))).toBe(true);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('surfaces a transcript append failure as an error toast', () => {
    const toasts: Array<readonly [string, string | undefined]> = [];
    const bridge: WorkspaceBridgeImpl = {
      toast: (message, variant) =>
        Effect.sync(() => {
          toasts.push([message, variant]);
        }),
      notify: () => Effect.void,
    };
    const harness = makeHarness({ bridge });
    return Effect.gen(function* () {
      const runner = yield* Runner;
      const store = yield* Store.Store;
      yield* runner.start({ root: '/repo', id: 'run-13', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      // Cancelling the run makes the next mirrored turn impossible to append.
      yield* store.cancel('run-13');
      emit(session, user('go'));
      yield* flush;
      Vitest.expect(toasts.some(([message]) => message.includes('cannot append'))).toBe(true);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('refuses to resume a non-replayable run', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      const store = yield* Store.Store;
      yield* runner.start({ root: '/repo', id: 'run-15', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      // A legacy assistant turn with no raw message cannot be replayed.
      yield* store.append({ runId: 'run-15', role: 'assistant', text: 'legacy turn' });
      const error = yield* runner.resume('/repo', 'run-15').pipe(Effect.flip);
      Vitest.expect(error).toContain('is not resumable');
      Vitest.expect(harness.sessions.length).toBe(1);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.live('refuses to resume a run that fails verification', () => {
    const root = Fs.mkdtempSync(NodeOsPath.join(Os.tmpdir(), 'pi-runs-runner-'));
    const harness = makeHarness({ storeRoot: root });
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root, id: 'run-18', prompt: 'go' });
      // A non-monotonic seq makes the transcript fail mechanical verification.
      yield* Effect.sync(() =>
        Fs.writeFileSync(
          NodeOsPath.join(root, 'run-18', 'session.jsonl'),
          '{"seq":5,"role":"user","text":"hi","at":"x"}\n',
        ),
      );
      const error = yield* runner.resume(root, 'run-18').pipe(Effect.flip);
      Vitest.expect(error).toContain('failed verification');
      Vitest.expect(error).toContain('session.seq');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('interrupt wins over a late agent_settled', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-14', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      yield* runner.interrupt('/repo', 'run-14');
      // Interrupt claims the run and unsubscribes before aborting, so the
      // `agent_settled` that abort emits cannot retroactively receipt `done`.
      Vitest.expect(session.listeners.length).toBe(0);
      settleEvent(session);
      yield* flush;
      const detail = yield* runner.detail('/repo', 'run-14');
      Vitest.expect(detail.receipt?.outcome).toBe('cancelled');
      Vitest.expect(detail.run.status).toBe('cancelled');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('unsubscribes the session listener once a run settles', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-17', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      emit(session, user('go'));
      yield* flush;
      Vitest.expect(session.listeners.length).toBe(1);
      settleEvent(session);
      yield* flush;
      Vitest.expect(session.listeners.length).toBe(0);
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('reports the store ignore verdict from the repo .gitignore', () => {
    const root = Fs.mkdtempSync(NodeOsPath.join(Os.tmpdir(), 'pi-runs-runner-ignore-'));
    const gitignore = NodeOsPath.join(root, '.gitignore');
    Fs.writeFileSync(gitignore, '# local transcripts\n.agents/@montflow/runs\n');
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      const ignored = yield* runner.verifyStore(root);
      Vitest.expect(ignored.ignored).toBe(true);
      // Commenting the rule out re-enables tracking, so the check must flag it.
      Fs.writeFileSync(gitignore, '# .agents/@montflow/runs\n');
      const tracked = yield* runner.verifyStore(root);
      Vitest.expect(tracked.ignored).toBe(false);
      Vitest.expect(tracked.issues.map((entry) => entry.field)).toContain('.gitignore');
    }).pipe(Effect.provide(harness.layer));
  });

  Vitest.it.effect('liveRunIds lists a started run and drops it after settle', () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const runner = yield* Runner;
      yield* runner.start({ root: '/repo', id: 'run-1', prompt: 'do it', feature: 'ship-login' });
      const before = yield* runner.liveRunIds('/repo');
      Vitest.expect([...before]).toStrictEqual(['run-1']);
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      yield* Effect.yieldNow;
      emit(session, assistant('done'));
      yield* flush;
      settleEvent(session);
      yield* flush;
      const after = yield* runner.liveRunIds('/repo');
      Vitest.expect([...after]).toStrictEqual([]);
      const stored = yield* runner.detail('/repo', 'run-1');
      Vitest.expect(stored.run.feature).toBe('ship-login');
    }).pipe(Effect.provide(harness.layer));
  });
});
