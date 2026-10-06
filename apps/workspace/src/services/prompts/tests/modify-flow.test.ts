import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Prompts from '../index.js';
import * as Runs from '../../runs/index.js';
import { makeHarness, poll, settleEvent } from '../../runs/tests/harness.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'workspace-prompt-modify-'));

/** Prompt file path for a scratch root. */
const promptFile = (root: string, id: string): string =>
  join(root, '.agents', '@montflow', 'pi-prompts', `${id}.json`);

/** One prompt file as the editor run would leave it. */
const promptJson = (id: string, template: string): string =>
  `${JSON.stringify(
    {
      name: id,
      description: `the ${id} prompt`,
      template,
      variables: [],
      skills: [],
      model: '',
    },
    null,
    2,
  )}\n`;

/** Seed one prompt file the way the editor run would. */
const writePrompt = (root: string, id: string, template: string): Promise<void> =>
  mkdir(join(root, '.agents', '@montflow', 'pi-prompts'), { recursive: true }).then(() =>
    writeFile(promptFile(root, id), promptJson(id, template), 'utf8'),
  );

/** Write a raw, undecodable prompt file (missing required fields). */
const writeBrokenPrompt = (root: string, id: string): Promise<void> =>
  mkdir(join(root, '.agents', '@montflow', 'pi-prompts'), { recursive: true }).then(() =>
    writeFile(promptFile(root, id), '{ not json', 'utf8'),
  );

/**
 * Fake overlay ports for the modify flow: the agentic path picks the
 * agent, answers the change prompt, and keeps the session model. The
 * manual path answers the template prompt. `loading` runs the Effect
 * directly — no TUI overlay.
 */
const ports = (
  mode: 'agent' | 'manual' | 'cancel',
  text = 'mention the reviewer',
): Prompts.FlowPorts => ({
  ui: {
    select: (title) => {
      if (title === 'Modify prompt') {
        if (mode === 'cancel') return Promise.resolve(undefined);
        return Promise.resolve(mode === 'agent' ? 'Modify with agent' : 'Modify manually');
      }
      return Promise.resolve(undefined);
    },
    confirm: () => Promise.resolve(false),
    input: (title) => {
      if (title.startsWith('Change to')) return Promise.resolve(text);
      if (title.startsWith('Template for')) return Promise.resolve(text);
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
  Prompts.resetDispatchedModifyRun();
});

Vitest.describe('Prompts.runModifyFlow agentic dispatch', () => {
  Vitest.it.live('gates on the runs extension without dispatching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writePrompt(root, 'review', 'Review {{files}}'));
      const error = yield* Prompts.runModifyFlow(root, 'review', ports('agent')).pipe(Effect.flip);
      Vitest.expect(error).toBe(Runs.RUNS_EXTENSION_INSTALL_HINT);
      Vitest.expect(harness.sessions.length).toBe(0);
    }),
  );

  Vitest.it.live('dispatches an editor run and resolves the dispatched result', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writePrompt(root, 'review', 'Review {{files}}'));
      const result = yield* Prompts.runModifyFlow(root, 'review', ports('agent'));
      Vitest.expect(result?.kind).toBe('dispatched');
      const runId = result?.kind === 'dispatched' ? result.runId : '';
      Vitest.expect(runId).toMatch(/^modify-prompt-/);
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      Vitest.expect(session.request.tools).toStrictEqual([...Runs.DEFAULT_RUN_TOOLS]);
      const prompt = yield* poll(
        Effect.sync(() => session.prompts[0]),
        (value) => value !== undefined,
      );
      Vitest.expect(prompt).toContain('You are a prompt author');
      Vitest.expect(prompt).toContain('Prompt file: .agents/@montflow/pi-prompts/review.json');
      Vitest.expect(prompt).toContain('Change: mention the reviewer');
      Vitest.expect(prompt).toContain('reply with one short line');
    }),
  );

  Vitest.it.live('fires the completion hook with the updated prompt and run id on settle', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writePrompt(root, 'review', 'Review {{files}}'));
      const modified: Array<readonly [string, string]> = [];
      const failed: Array<string> = [];
      const result = yield* Prompts.runModifyFlow(root, 'review', ports('agent'), {
        onPromptModified: (prompt, runId) => modified.push([prompt.id, runId]),
        onPromptFailed: (message) => failed.push(message),
      });
      Vitest.expect(result?.kind).toBe('dispatched');
      const runId = result?.kind === 'dispatched' ? result.runId : '';
      yield* Effect.promise(() =>
        writePrompt(root, 'review', 'Review {{files}} with the reviewer'),
      );
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => modified.length + failed.length),
        (count) => count > 0,
      );
      Vitest.expect(modified).toStrictEqual([['review', runId]]);
      Vitest.expect(failed).toStrictEqual([]);
    }),
  );

  Vitest.it.live('reports a settle that left the prompt unchanged', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writePrompt(root, 'review', 'Review {{files}}'));
      const failed: Array<string> = [];
      yield* Prompts.runModifyFlow(root, 'review', ports('agent'), {
        onPromptModified: () => undefined,
        onPromptFailed: (message) => failed.push(message),
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => failed.length),
        (count) => count > 0,
      );
      Vitest.expect(failed[0]).toContain('without updating');
    }),
  );

  Vitest.it.live('reports an invalid prompt file distinctly from nothing written', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writePrompt(root, 'review', 'Review {{files}}'));
      const failed: Array<string> = [];
      yield* Prompts.runModifyFlow(root, 'review', ports('agent'), {
        onPromptModified: () => undefined,
        onPromptFailed: (message) => failed.push(message),
      });
      yield* Effect.promise(() => writeBrokenPrompt(root, 'review'));
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => failed.length),
        (count) => count > 0,
      );
      Vitest.expect(failed[0]).toContain('wrote an invalid prompt');
    }),
  );

  Vitest.it.live('resolves undefined on a real cancel without dispatching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writePrompt(root, 'review', 'Review {{files}}'));
      const result = yield* Prompts.runModifyFlow(root, 'review', ports('cancel'));
      Vitest.expect(result).toBeUndefined();
      Vitest.expect(harness.sessions.length).toBe(0);
    }),
  );
});

Vitest.describe('Prompts.runModifyFlow manual modify', () => {
  Vitest.it.live('persists the manual edit and resolves the saved result', () =>
    Effect.gen(function* () {
      Runs.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writePrompt(root, 'review', 'Review {{files}}'));
      const result = yield* Prompts.runModifyFlow(
        root,
        'review',
        ports('manual', 'Review {{files}} with the reviewer'),
      );
      Vitest.expect(result?.kind).toBe('saved');
      Vitest.expect(result?.kind === 'saved' ? result.prompt.template : '').toBe(
        'Review {{files}} with the reviewer',
      );
      const listed = yield* Prompts.fetchPrompts(root);
      Vitest.expect(listed[0]?.template).toBe('Review {{files}} with the reviewer');
    }),
  );
});
