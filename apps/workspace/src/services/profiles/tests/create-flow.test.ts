import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Profiles from '../index.js';
import * as Runs from '../../runs/index.js';
import { makeHarness, messageEvent, poll, settleEvent } from '../../runs/tests/harness.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'workspace-profile-create-'));

/** Seed one profile file the way the author run would. */
const writeProfile = (root: string, id: string, description: string): Promise<void> =>
  mkdir(join(root, '.agents', '@montflow', 'pi-profiles', id), { recursive: true }).then(() =>
    writeFile(
      join(root, '.agents', '@montflow', 'pi-profiles', id, 'PROFILE.md'),
      `---\nname: ${id}\ndescription: ${description}\n---\n`,
    ),
  );

/** Write a raw, undecodable `PROFILE.md` (no frontmatter). */
const writeBrokenProfile = (root: string, id: string): Promise<void> =>
  mkdir(join(root, '.agents', '@montflow', 'pi-profiles', id), { recursive: true }).then(() =>
    writeFile(join(root, '.agents', '@montflow', 'pi-profiles', id, 'PROFILE.md'), 'not a profile'),
  );

/** Assistant turn carrying the author run's one-line reply. */
const assistantReply = (text: string) => ({
  role: 'assistant' as const,
  content: [{ type: 'text' as const, text }],
  api: 'test' as const,
  provider: 'test' as const,
  model: 'test-model',
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: 'stop' as const,
  timestamp: 1,
});

/**
 * Fake overlay ports: the agentic path picks the agent, continues past
 * the requirements gate, answers the description prompt, and keeps the
 * session model. The manual path answers the name and description
 * prompts. `loading` runs the Effect directly — no TUI overlay.
 */
const ports = (
  mode: 'agent' | 'manual' | 'cancel',
  description = 'A TypeScript reviewer',
): Profiles.FlowPorts => ({
  ui: {
    select: (title) => {
      if (title === 'Create profile') {
        if (mode === 'cancel') return Promise.resolve(undefined);
        return Promise.resolve(mode === 'agent' ? 'Create with agent' : 'Create manually');
      }
      if (title.startsWith('Options')) return Promise.resolve('Continue with checked skills');
      return Promise.resolve(undefined);
    },
    confirm: () => Promise.resolve(false),
    input: (title) => {
      if (title === 'Profile name') return Promise.resolve('manual-reviewer');
      if (title === 'Describe the profile' || title === 'Description')
        return Promise.resolve(description);
      return Promise.resolve(undefined);
    },
    notify: () => undefined,
  },
  modelPicker: (models) => Promise.resolve(models[0]?.label),
  loading: (_message, self) => self,
});

Vitest.afterEach(async () => {
  await Runs.resetRunnerRuntimes();
  Runs.setSessionFactoryLayer(undefined);
  Runs.setExtensionProbe(undefined);
  Profiles.resetDispatchedRun();
});

Vitest.describe('Profiles.runCreateFlow agentic dispatch', () => {
  Vitest.it.live('gates on the runs extension without dispatching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      const error = yield* Profiles.runCreateFlow(root, ports('agent')).pipe(Effect.flip);
      Vitest.expect(error).toBe(Runs.RUNS_EXTENSION_INSTALL_HINT);
      Vitest.expect(harness.sessions.length).toBe(0);
    }),
  );

  Vitest.it.live('dispatches an author run and resolves the dispatched result', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const result = yield* Profiles.runCreateFlow(root, ports('agent'));
      Vitest.expect(result?.kind).toBe('dispatched');
      const runId = result?.kind === 'dispatched' ? result.runId : '';
      Vitest.expect(runId).toMatch(/^create-profile-/);
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      Vitest.expect(session.request.tools).toStrictEqual([...Runs.DEFAULT_RUN_TOOLS]);
      const prompt = yield* poll(
        Effect.sync(() => session.prompts[0]),
        (value) => value !== undefined,
      );
      Vitest.expect(prompt).toContain('You are a profile author');
      Vitest.expect(prompt).toContain('Profile description: A TypeScript reviewer');
      Vitest.expect(prompt).toContain('reply with one short line');
    }),
  );

  Vitest.it.live('fires the completion hook with the fresh profile and run id on settle', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const created: Array<readonly [string, string]> = [];
      const failed: Array<string> = [];
      const result = yield* Profiles.runCreateFlow(root, ports('agent'), {
        onProfileCreated: (profile, runId) => created.push([profile.id, runId]),
        onProfileFailed: (message) => failed.push(message),
      });
      Vitest.expect(result?.kind).toBe('dispatched');
      const runId = result?.kind === 'dispatched' ? result.runId : '';
      yield* Effect.promise(() => writeProfile(root, 'typescript-reviewer', 'reviews TypeScript'));
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => created.length + failed.length),
        (count) => count > 0,
      );
      Vitest.expect(created).toStrictEqual([['typescript-reviewer', runId]]);
      Vitest.expect(failed).toStrictEqual([]);
    }),
  );

  Vitest.it.live('reports a settle with no fresh profile', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const failed: Array<string> = [];
      yield* Profiles.runCreateFlow(root, ports('agent'), {
        onProfileCreated: () => undefined,
        onProfileFailed: (message) => failed.push(message),
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => failed.length),
        (count) => count > 0,
      );
      Vitest.expect(failed[0]).toContain('without creating a profile');
    }),
  );
});

Vitest.describe('Profiles.runCreateFlow manual create', () => {
  Vitest.it.live('persists the manual profile and resolves the saved result', () =>
    Effect.gen(function* () {
      Runs.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      const result = yield* Profiles.runCreateFlow(root, ports('manual', 'manual description'));
      Vitest.expect(result?.kind).toBe('saved');
      Vitest.expect(result?.kind === 'saved' ? result.profile.id : '').toBe('manual-reviewer');
      const listed = yield* Profiles.fetchProfiles(root);
      Vitest.expect(listed.map((profile) => profile.id)).toStrictEqual(['manual-reviewer']);
    }),
  );
});

Vitest.describe('Profiles.runCreateFlow completion correlation', () => {
  Vitest.it.live('correlates concurrent author runs to their own profile', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const created: string[] = [];
      const hooks: Profiles.CreateFlowHooks = {
        onProfileCreated: (profile) => created.push(profile.id),
        onProfileFailed: (message) => created.push(`fail:${message}`),
      };
      const first = yield* Profiles.runCreateFlow(root, ports('agent'), hooks);
      yield* Effect.sleep('2 millis');
      const second = yield* Profiles.runCreateFlow(root, ports('agent'), hooks);
      const firstId = first?.kind === 'dispatched' ? first.runId : '';
      const secondId = second?.kind === 'dispatched' ? second.runId : '';
      Vitest.expect(firstId).not.toBe('');
      Vitest.expect(secondId).not.toBe('');
      Vitest.expect(firstId).not.toBe(secondId);
      yield* Effect.promise(() => writeProfile(root, 'alpha-profile', 'alpha'));
      yield* Effect.promise(() => writeProfile(root, 'beta-profile', 'beta'));
      const [sessionA, sessionB] = harness.sessions;
      if (sessionA === undefined || sessionB === undefined)
        return yield* Effect.fail('sessions not created');
      messageEvent(sessionA, assistantReply('alpha-profile — does alpha things'));
      messageEvent(sessionB, assistantReply('beta-profile — does beta things'));
      settleEvent(sessionA);
      settleEvent(sessionB);
      yield* poll(
        Effect.sync(() => created.length),
        (count) => count >= 2,
      );
      Vitest.expect(created.toSorted()).toStrictEqual(['alpha-profile', 'beta-profile']);
    }),
  );

  Vitest.it.live('re-encodes the authored profile canonically on settle', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const created: string[] = [];
      yield* Profiles.runCreateFlow(root, ports('agent'), {
        onProfileCreated: (profile) => created.push(profile.id),
        onProfileFailed: (message) => created.push(`fail:${message}`),
      });
      yield* Effect.promise(() => writeProfile(root, 'raw-profile', 'raw description'));
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => created.length),
        (count) => count > 0,
      );
      Vitest.expect(created).toStrictEqual(['raw-profile']);
      const raw = yield* Profiles.readRawProfile(root, 'raw-profile');
      Vitest.expect(raw).toContain('# Raw Profile');
      Vitest.expect(raw).toContain('## Instructions');
      Vitest.expect(raw).toContain('## Review Checklist');
    }),
  );

  Vitest.it.live('reports an invalid authored profile distinctly from nothing written', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const failed: string[] = [];
      yield* Profiles.runCreateFlow(root, ports('agent'), {
        onProfileCreated: () => undefined,
        onProfileFailed: (message) => failed.push(message),
      });
      yield* Effect.promise(() => writeBrokenProfile(root, 'broken-profile'));
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => failed.length),
        (count) => count > 0,
      );
      Vitest.expect(failed[0]).toContain('invalid profile');
      Vitest.expect(failed[0]).toContain('broken-profile');
    }),
  );

  Vitest.it.live('re-attaches the author completion hook when resuming a run', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const created: string[] = [];
      const hooks: Profiles.CreateFlowHooks = {
        onProfileCreated: (profile) => created.push(profile.id),
        onProfileFailed: (message) => created.push(`fail:${message}`),
      };
      const result = yield* Profiles.runCreateFlow(root, ports('agent'), hooks);
      const runId = result?.kind === 'dispatched' ? result.runId : '';
      Vitest.expect(runId).not.toBe('');
      // App restart: drop the runtime (and the in-memory completion hook).
      yield* Effect.promise(() => Runs.resetRunnerRuntimes());
      const libs = Profiles.loadedPiProfiles();
      if (libs === undefined) return yield* Effect.fail('runtime not loaded');
      yield* Runs.resumeRun(
        root,
        runId,
        undefined,
        Profiles.authorCompletion(root, libs, runId, undefined, hooks),
      );
      const resumed = harness.sessions[1];
      if (resumed === undefined) return yield* Effect.fail('resumed session not created');
      yield* Effect.promise(() => writeProfile(root, 'resumed-profile', 'resumed description'));
      messageEvent(resumed, assistantReply('resumed-profile — does resumed things'));
      settleEvent(resumed);
      yield* poll(
        Effect.sync(() => created.length),
        (count) => count > 0,
      );
      Vitest.expect(created).toStrictEqual(['resumed-profile']);
    }),
  );

  Vitest.it.live('resolves undefined on a real cancel without dispatching', () =>
    Effect.gen(function* () {
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const result = yield* Profiles.runCreateFlow(root, ports('cancel'));
      Vitest.expect(result).toBeUndefined();
    }),
  );
});
