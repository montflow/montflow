import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Sessions from '../index.js';
import { makeHarness, messageEvent, poll, settleEvent } from './harness.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): string => mkdtempSync(join(tmpdir(), 'workspace-sessions-'));

Vitest.afterEach(async () => {
  await Sessions.resetSessionRuntimes();
  Sessions.setSessionFactoryLayer(undefined);
  Sessions.setSessionNotifier(undefined);
});

Vitest.describe('Sessions engine dispatch', () => {
  Vitest.it.live('startSession creates a running session and the read paths see it', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      const created = yield* Sessions.startSession(root, {
        id: 'session-1',
        name: 'Session One',
        prompt: 'do it',
      });
      Vitest.expect(created.status).toBe('running');
      Vitest.expect(created.name).toBe('Session One');
      Vitest.expect(created.prompt).toBe('do it');
      const listed = yield* Sessions.fetchSessions(root);
      Vitest.expect(listed.map((row) => row.id)).toStrictEqual(['session-1']);
      const detail = yield* Sessions.loadSession(root, 'session-1');
      Vitest.expect(detail.summary.status).toBe('running');
      const prompts = yield* poll(
        Effect.sync(() => harness.sessions[0]?.prompts.length ?? 0),
        (count) => count > 0,
      );
      Vitest.expect(prompts).toBe(1);
      Vitest.expect(harness.sessions[0]?.prompts).toStrictEqual(['do it']);
    }),
  );

  Vitest.it.live('startSession applies the default tool allowlist and pins the model', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, {
        id: 'session-tools',
        prompt: 'go',
        model: 'anthropic/claude',
      });
      Vitest.expect(harness.sessions[0]?.request.tools).toStrictEqual([
        ...Sessions.DEFAULT_SESSION_TOOLS,
      ]);
      Vitest.expect(harness.sessions[0]?.request.model).toBe('anthropic/claude');
    }),
  );

  Vitest.it.live('startSession honors an explicit tool allowlist override', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-tools-2', prompt: 'go', tools: ['read'] });
      Vitest.expect(harness.sessions[0]?.request.tools).toStrictEqual(['read']);
    }),
  );

  Vitest.it.live('mirrors streamed messages into the stored transcript', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-mirror', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      messageEvent(session, { role: 'user', content: 'go', timestamp: 1 });
      const detail = yield* poll(
        Sessions.loadSession(root, 'session-mirror'),
        (loaded) => loaded.events.length >= 1,
      );
      Vitest.expect(detail.events.map((event) => event.role)).toStrictEqual(['user']);
      Vitest.expect(detail.events[0]?.text).toBe('go');
    }),
  );

  Vitest.it.live('forwards parent, related, and the onSettled hook', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      const outcomes: string[] = [];
      yield* Sessions.startSession(root, {
        id: 'session-child',
        prompt: 'go',
        parent: 'session-parent',
        related: ['session-sib'],
        onSettled: (detail) =>
          Effect.sync(() => {
            outcomes.push(detail.receipt?.outcome ?? 'none');
          }),
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => outcomes.length),
        (count) => count > 0,
      );
      Vitest.expect(outcomes).toStrictEqual(['done']);
    }),
  );

  Vitest.it.live('steerSession forwards to the live session', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-2', prompt: 'go' });
      yield* Sessions.steerSession(root, 'session-2', 'change course');
      Vitest.expect(harness.sessions[0]?.steers).toStrictEqual(['change course']);
    }),
  );

  Vitest.it.live('answerSession resolves the parked ask without relaunching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-3', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      const parked = session.request.ui.input('Which branch?');
      yield* poll(
        Sessions.loadSession(root, 'session-3'),
        (loaded) => loaded.summary.status === 'awaiting-input',
      );
      yield* Sessions.answerSession(root, 'session-3', 'main');
      const reply = yield* Effect.promise(() => parked);
      Vitest.expect(reply).toBe('main');
      Vitest.expect(harness.sessions.length).toBe(1);
      const detail = yield* Sessions.loadSession(root, 'session-3');
      Vitest.expect(detail.summary.status).toBe('running');
    }),
  );

  Vitest.it.live('interruptSession aborts the session and writes the cancelled receipt', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-4', prompt: 'go' });
      yield* Sessions.interruptSession(root, 'session-4');
      Vitest.expect(harness.sessions[0]?.aborts).toBe(1);
      const detail = yield* Sessions.loadSession(root, 'session-4');
      Vitest.expect(detail.summary.status).toBe('cancelled');
      Vitest.expect(detail.receipt?.outcome).toBe('cancelled');
    }),
  );

  Vitest.it.live('resumeSession opens a second session from the stored transcript', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-5', prompt: 'go' });
      yield* Sessions.resumeSession(root, 'session-5', 'continue');
      Vitest.expect(harness.sessions.length).toBe(2);
      yield* poll(
        Effect.sync(() => harness.sessions[1]?.prompts.length ?? 0),
        (count) => count > 0,
      );
      Vitest.expect(harness.sessions[1]?.prompts).toStrictEqual(['continue']);
    }),
  );

  Vitest.it.live('resumeSession re-attaches a completion hook to the resumed session', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-resume-hook', prompt: 'go' });
      // Simulate an app restart: drop the runtime (and its in-memory hook).
      yield* Effect.promise(() => Sessions.resetSessionRuntimes());
      const outcomes: string[] = [];
      yield* Sessions.resumeSession(root, 'session-resume-hook', undefined, (detail) =>
        Effect.sync(() => {
          outcomes.push(detail.receipt?.outcome ?? 'none');
        }),
      );
      const resumed = harness.sessions[1];
      if (resumed === undefined) return yield* Effect.fail('resumed session not created');
      settleEvent(resumed);
      yield* poll(
        Effect.sync(() => outcomes.length),
        (count) => count > 0,
      );
      Vitest.expect(outcomes).toStrictEqual(['done']);
    }),
  );

  Vitest.it.live('settles the session on agent_settled', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-6', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      const detail = yield* poll(
        Sessions.loadSession(root, 'session-6'),
        (loaded) => loaded.receipt !== undefined,
      );
      Vitest.expect(detail.receipt?.outcome).toBe('done');
      Vitest.expect(detail.summary.status).toBe('done');
    }),
  );

  Vitest.it.live('routes notify_user to the workspace notifier', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const notes: Array<readonly [string, string]> = [];
      Sessions.setSessionNotifier({
        toast: () => undefined,
        notify: (title, body) => {
          notes.push([title, body]);
        },
      });
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-7', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      session.request.ui.notify('something happened', 'info');
      yield* poll(
        Effect.sync(() => notes.length),
        (count) => count > 0,
      );
      Vitest.expect(notes).toStrictEqual([["Session 'session-7'", 'something happened']]);
    }),
  );

  Vitest.it.live('sanitizes session-controlled notification text at the bridge', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      const notes: Array<readonly [string, string]> = [];
      Sessions.setSessionNotifier({
        toast: () => undefined,
        notify: (title, body) => {
          notes.push([title, body]);
        },
      });
      const root = freshRoot();
      yield* Sessions.startSession(root, { id: 'session-sanitize', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      const esc = String.fromCharCode(27);
      session.request.ui.notify(`${esc}[31mboom${esc}[0m\nnext`, 'info');
      yield* poll(
        Effect.sync(() => notes.length),
        (count) => count > 0,
      );
      Vitest.expect(notes).toStrictEqual([["Session 'session-sanitize'", 'boom next']]);
    }),
  );

  Vitest.it.live(
    'surfaces a missing Pi runtime as a single failure without a duplicate toast',
    () =>
      Effect.gen(function* () {
        const harness = makeHarness({
          failCreate: "Cannot find module '@earendil-works/pi-coding-agent'",
        });
        Sessions.setSessionFactoryLayer(harness.layer);
        const toasts: string[] = [];
        Sessions.setSessionNotifier({
          toast: (message) => {
            toasts.push(message);
          },
          notify: () => undefined,
        });
        const root = freshRoot();
        const error = yield* Sessions.startSession(root, { id: 'session-8', prompt: 'go' }).pipe(
          Effect.flip,
        );
        Vitest.expect(error).toContain('Pi runtime not found');
        // The caller owns the display; the service must not also toast it.
        Vitest.expect(toasts).toStrictEqual([]);
      }),
  );
});
