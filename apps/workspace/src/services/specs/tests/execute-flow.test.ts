import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Specs from '../index.js';
import * as Sessions from '../../sessions/index.js';
import { makeHarness, poll, settleEvent } from '../../sessions/tests/harness.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'workspace-spec-execute-'));

/** SPEC.md with one execution task and its phase review. */
const specMarkdown = (name: string): string =>
  [
    '---',
    `name: ${name}`,
    'status: in-progress',
    'workspace-type: in-place',
    'author: Tester',
    'created: 2026-10-12',
    'locked-phases:',
    '---',
    '',
    `# ${name}`,
    '',
    '## Description',
    '',
    'Ship the login flow.',
    '',
    '## Tasks',
    '',
    '| ID   | Name         | Type      | Status  | Gates |',
    '| ---- | ------------ | --------- | ------- | ----- |',
    '| A001 | build-login  | execution | pending | No    |',
    '| A099 | review-phase | review    | pending | No    |',
    '',
  ].join('\n');

/** One TASK.md, valid against the pi-specs contract. */
const taskMarkdown = (id: string, name: string, type: string): string =>
  [
    '---',
    `id: ${id}`,
    `name: ${name}`,
    `type: ${type}`,
    'originator: user',
    'depends-on:',
    'related-tasks:',
    'status: pending',
    '---',
    '',
    `# Task ${id}: ${name}`,
    '',
    `## Type: ${type}`,
    '',
    '## Description',
    '',
    'Do the thing.',
    '',
    '## Requirements',
    '',
    '- It works.',
    '',
    '## Completion',
    '',
    '- [ ] Done.',
    '',
  ].join('\n');

const memoryMarkdown = ['# Memory', '', '## Context', '', 'None.', ''].join('\n');

/** Seed a spec tree with an execution task and its phase review. */
const writeSpecTree = async (root: string, id: string): Promise<void> => {
  const dir = join(root, '.agents', '@montflow', 'specs', id);
  const write = (rel: string, content: string): Promise<void> =>
    mkdir(join(dir, rel, '..'), { recursive: true }).then(() => writeFile(join(dir, rel), content));
  await write('SPEC.md', specMarkdown(id));
  await write('A001-build-login/TASK.md', taskMarkdown('A001', 'build-login', 'execution'));
  await write('A001-build-login/MEMORY.md', memoryMarkdown);
  await write('A099-review-phase/TASK.md', taskMarkdown('A099', 'review-phase', 'review'));
  await write('A099-review-phase/MEMORY.md', memoryMarkdown);
};

Vitest.afterEach(async () => {
  await Sessions.resetSessionRuntimes();
  Sessions.setSessionFactoryLayer(undefined);
  Sessions.setExtensionProbe(undefined);
  Specs.resetExtensionCache();
});

Vitest.describe('Specs.executeSpec dispatch', () => {
  Vitest.it.live('gates on the sessions extension without dispatching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      const error = yield* Specs.executeSpec(root, { id: 'ship-login' }).pipe(Effect.flip);
      Vitest.expect(error).toBe(Sessions.SESSIONS_EXTENSION_INSTALL_HINT);
      Vitest.expect(harness.sessions.length).toBe(0);
    }),
  );

  Vitest.it.live('dispatches a resume session bound to the spec', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSpecTree(root, 'ship-login'));
      const { sessionId } = yield* Specs.executeSpec(root, { id: 'ship-login' });
      Vitest.expect(sessionId).toMatch(/^execute-ship-login-/);
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      Vitest.expect([...(session.request.tools ?? [])].toSorted()).toStrictEqual(
        [...Specs.SPEC_EXECUTE_TOOLS, ...Sessions.SESSION_TOOL_NAMES].toSorted(),
      );
      const prompt = yield* poll(
        Effect.sync(() => session.prompts[0]),
        (value) => value !== undefined,
      );
      Vitest.expect(prompt).toContain('You are a spec orchestrator');
      Vitest.expect(prompt).toContain('# executing-spec');
      Vitest.expect(prompt).toContain('Spec: ship-login');
      Vitest.expect(prompt).toContain('A001 [execution] pending');
      Vitest.expect(prompt).toContain('.agents/@montflow/reviews/ship-login/001 (missing)');
      const active = yield* Specs.activeSpecIds(root);
      Vitest.expect([...active]).toStrictEqual(['ship-login']);
    }),
  );

  Vitest.it.live('flags a review phase missing its round in the spec detail', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSpecTree(root, 'ship-login'));
      const detail = yield* Specs.loadSpec(root, 'ship-login');
      Vitest.expect(detail.summary.valid).toBe(false);
      Vitest.expect(detail.issues).toContainEqual({
        field: 'phase A',
        message: "Phase 'A' has a review task but series 'ship-login' has no round 001.",
      });
    }),
  );

  Vitest.it.live('fires the settle hook with the outcome', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSpecTree(root, 'ship-login'));
      const settled: Array<readonly [string, string, string]> = [];
      yield* Specs.executeSpec(root, {
        id: 'ship-login',
        hooks: {
          onSpecSettled: (specId, id, message) => settled.push([specId, id, message]),
        },
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => settled.length),
        (count) => count > 0,
      );
      Vitest.expect(settled[0]?.[0]).toBe('ship-login');
      Vitest.expect(settled[0]?.[2]).toContain('done');
    }),
  );
});
