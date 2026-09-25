import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Runs from '../index.js';
import { makeHarness, messageEvent, poll, settleEvent } from './harness.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): string => mkdtempSync(join(tmpdir(), 'workspace-runs-'));

Vitest.afterEach(async () => {
  await Runs.resetRunnerRuntimes();
  Runs.setSessionFactoryLayer(undefined);
  Runs.setRunNotifier(undefined);
});

Vitest.describe('Runs engine dispatch', () => {
  Vitest.it.live('startRun creates a running run and the read paths see it', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      const created = yield* Runs.startRun(root, {
        id: 'run-1',
        name: 'Run One',
        prompt: 'do it',
      });
      Vitest.expect(created.status).toBe('running');
      Vitest.expect(created.name).toBe('Run One');
      Vitest.expect(created.prompt).toBe('do it');
      const listed = yield* Runs.fetchRuns(root);
      Vitest.expect(listed.map((row) => row.id)).toStrictEqual(['run-1']);
      const detail = yield* Runs.loadRun(root, 'run-1');
      Vitest.expect(detail.summary.status).toBe('running');
      const prompts = yield* poll(
        Effect.sync(() => harness.sessions[0]?.prompts.length ?? 0),
        (count) => count > 0,
      );
      Vitest.expect(prompts).toBe(1);
      Vitest.expect(harness.sessions[0]?.prompts).toStrictEqual(['do it']);
    }),
  );

  Vitest.it.live('startRun applies the default tool allowlist and pins the model', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, {
        id: 'run-tools',
        prompt: 'go',
        model: 'anthropic/claude',
      });
      Vitest.expect(harness.sessions[0]?.request.tools).toStrictEqual([...Runs.DEFAULT_RUN_TOOLS]);
      Vitest.expect(harness.sessions[0]?.request.model).toBe('anthropic/claude');
    }),
  );

  Vitest.it.live('startRun honors an explicit tool allowlist override', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-tools-2', prompt: 'go', tools: ['read'] });
      Vitest.expect(harness.sessions[0]?.request.tools).toStrictEqual(['read']);
    }),
  );

  Vitest.it.live('mirrors streamed messages into the stored transcript', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-mirror', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      messageEvent(session, { role: 'user', content: 'go', timestamp: 1 });
      const detail = yield* poll(
        Runs.loadRun(root, 'run-mirror'),
        (loaded) => loaded.events.length >= 1,
      );
      Vitest.expect(detail.events.map((event) => event.role)).toStrictEqual(['user']);
      Vitest.expect(detail.events[0]?.text).toBe('go');
    }),
  );

  Vitest.it.live('forwards parent, related, and the onSettled hook', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      const outcomes: string[] = [];
      yield* Runs.startRun(root, {
        id: 'run-child',
        prompt: 'go',
        parent: 'run-parent',
        related: ['run-sib'],
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

  Vitest.it.live('steerRun forwards to the live session', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-2', prompt: 'go' });
      yield* Runs.steerRun(root, 'run-2', 'change course');
      Vitest.expect(harness.sessions[0]?.steers).toStrictEqual(['change course']);
    }),
  );

  Vitest.it.live('answerRun resolves the parked ask without relaunching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-3', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      const parked = session.request.ui.input('Which branch?');
      yield* poll(
        Runs.loadRun(root, 'run-3'),
        (loaded) => loaded.summary.status === 'awaiting-input',
      );
      yield* Runs.answerRun(root, 'run-3', 'main');
      const reply = yield* Effect.promise(() => parked);
      Vitest.expect(reply).toBe('main');
      Vitest.expect(harness.sessions.length).toBe(1);
      const detail = yield* Runs.loadRun(root, 'run-3');
      Vitest.expect(detail.summary.status).toBe('running');
    }),
  );

  Vitest.it.live('interruptRun aborts the session and writes the cancelled receipt', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-4', prompt: 'go' });
      yield* Runs.interruptRun(root, 'run-4');
      Vitest.expect(harness.sessions[0]?.aborts).toBe(1);
      const detail = yield* Runs.loadRun(root, 'run-4');
      Vitest.expect(detail.summary.status).toBe('cancelled');
      Vitest.expect(detail.receipt?.outcome).toBe('cancelled');
    }),
  );

  Vitest.it.live('resumeRun opens a second session from the stored transcript', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-5', prompt: 'go' });
      yield* Runs.resumeRun(root, 'run-5', 'continue');
      Vitest.expect(harness.sessions.length).toBe(2);
      yield* poll(
        Effect.sync(() => harness.sessions[1]?.prompts.length ?? 0),
        (count) => count > 0,
      );
      Vitest.expect(harness.sessions[1]?.prompts).toStrictEqual(['continue']);
    }),
  );

  Vitest.it.live('resumeRun re-attaches a completion hook to the resumed session', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-resume-hook', prompt: 'go' });
      // Simulate an app restart: drop the runtime (and its in-memory hook).
      yield* Effect.promise(() => Runs.resetRunnerRuntimes());
      const outcomes: string[] = [];
      yield* Runs.resumeRun(root, 'run-resume-hook', undefined, (detail) =>
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

  Vitest.it.live('settles the run on agent_settled', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-6', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      const detail = yield* poll(
        Runs.loadRun(root, 'run-6'),
        (loaded) => loaded.receipt !== undefined,
      );
      Vitest.expect(detail.receipt?.outcome).toBe('done');
      Vitest.expect(detail.summary.status).toBe('done');
    }),
  );

  Vitest.it.live('routes notify_user to the workspace notifier', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const notes: Array<readonly [string, string]> = [];
      Runs.setRunNotifier({
        toast: () => undefined,
        notify: (title, body) => {
          notes.push([title, body]);
        },
      });
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-7', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      session.request.ui.notify('something happened', 'info');
      yield* poll(
        Effect.sync(() => notes.length),
        (count) => count > 0,
      );
      Vitest.expect(notes).toStrictEqual([["Run 'run-7'", 'something happened']]);
    }),
  );

  Vitest.it.live('sanitizes run-controlled notification text at the bridge', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      const notes: Array<readonly [string, string]> = [];
      Runs.setRunNotifier({
        toast: () => undefined,
        notify: (title, body) => {
          notes.push([title, body]);
        },
      });
      const root = freshRoot();
      yield* Runs.startRun(root, { id: 'run-sanitize', prompt: 'go' });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      const esc = String.fromCharCode(27);
      session.request.ui.notify(`${esc}[31mboom${esc}[0m\nnext`, 'info');
      yield* poll(
        Effect.sync(() => notes.length),
        (count) => count > 0,
      );
      Vitest.expect(notes).toStrictEqual([["Run 'run-sanitize'", 'boom next']]);
    }),
  );

  Vitest.it.live(
    'surfaces a missing Pi runtime as a single failure without a duplicate toast',
    () =>
      Effect.gen(function* () {
        const harness = makeHarness({
          failCreate: "Cannot find module '@earendil-works/pi-coding-agent'",
        });
        Runs.setSessionFactoryLayer(harness.layer);
        const toasts: string[] = [];
        Runs.setRunNotifier({
          toast: (message) => {
            toasts.push(message);
          },
          notify: () => undefined,
        });
        const root = freshRoot();
        const error = yield* Runs.startRun(root, { id: 'run-8', prompt: 'go' }).pipe(Effect.flip);
        Vitest.expect(error).toContain('Pi runtime not found');
        // The caller owns the display; the service must not also toast it.
        Vitest.expect(toasts).toStrictEqual([]);
      }),
  );
});
