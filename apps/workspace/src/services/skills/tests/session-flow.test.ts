import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Sessions from '../../sessions/index.js';
import * as Skills from '../index.js';
import { makeHarness, poll, settleEvent } from '../../sessions/tests/harness.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'workspace-skill-session-'));

/** Skill directory for a scratch root. */
const skillDir = (root: string, id: string): string => join(root, '.agents', 'skills', id);

/** Seed one `SKILL.md` the way the editor session would. */
const writeSkill = (root: string, id: string, description: string): Promise<void> =>
  mkdir(skillDir(root, id), { recursive: true }).then(() =>
    writeFile(
      join(skillDir(root, id), 'SKILL.md'),
      `---\nname: ${id}\ndescription: ${description}\n---\n\nBody.\n`,
      'utf8',
    ),
  );

/**
 * Fake overlay ports: the agentic path picks the agent, continues past
 * the requirements gate, answers the description/change prompt, and
 * keeps the session model. The manual path answers the name and
 * description prompts. `loading` runs the Effect directly.
 */
const ports = (
  mode: 'agent' | 'manual' | 'cancel',
  text = 'reviews TypeScript and tests',
): Skills.FlowPorts => ({
  ui: {
    select: (title) => {
      if (title === 'Create skill') {
        if (mode === 'cancel') return Promise.resolve(undefined);
        return Promise.resolve(mode === 'agent' ? 'Create with agent' : 'Create manually');
      }
      if (title === 'Modify skill') {
        if (mode === 'cancel') return Promise.resolve(undefined);
        return Promise.resolve(mode === 'agent' ? 'Modify with agent' : 'Modify manually');
      }
      if (title.startsWith('Options')) return Promise.resolve('Continue with checked skills');
      return Promise.resolve(undefined);
    },
    confirm: () => Promise.resolve(false),
    input: (title) => {
      if (title === 'Skill name') return Promise.resolve('manual-reviewer');
      if (title === 'Description') return Promise.resolve(text);
      if (title.startsWith('Describe the skill')) return Promise.resolve(text);
      if (title.startsWith('How should the agent change')) return Promise.resolve(text);
      if (title.startsWith('Description for')) return Promise.resolve(text);
      return Promise.resolve(undefined);
    },
    notify: () => undefined,
  },
  modelPicker: (models) => Promise.resolve(models[0]?.label),
  loading: (_message, self) => self,
});

Vitest.afterEach(async () => {
  await Sessions.resetSessionRuntimes();
  Sessions.setSessionFactoryLayer(undefined);
  Sessions.setExtensionProbe(undefined);
  Skills.resetDispatchedSession();
  Skills.resetDispatchedModifySession();
});

Vitest.describe('Skills.runCreateFlow agentic dispatch', () => {
  Vitest.it.live('gates on the sessions extension without dispatching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      const error = yield* Skills.runCreateFlow(root, ports('agent')).pipe(Effect.flip);
      Vitest.expect(error).toBe(Sessions.SESSIONS_EXTENSION_INSTALL_HINT);
      Vitest.expect(harness.sessions.length).toBe(0);
    }),
  );

  Vitest.it.live('dispatches an author session and resolves the dispatched result', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const result = yield* Skills.runCreateFlow(root, ports('agent'));
      Vitest.expect(result?.kind).toBe('dispatched');
      const sessionId = result?.kind === 'dispatched' ? result.sessionId : '';
      Vitest.expect(sessionId).toMatch(/^create-skill-/);
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      Vitest.expect(session.request.tools).toStrictEqual([...Sessions.DEFAULT_SESSION_TOOLS]);
      const prompt = yield* poll(
        Effect.sync(() => session.prompts[0]),
        (value) => value !== undefined,
      );
      Vitest.expect(prompt).toContain('You are a skill author');
      Vitest.expect(prompt).toContain('Skill description: reviews TypeScript and tests');
    }),
  );

  Vitest.it.live('fires the completion hook with the fresh skill on settle', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const created: Array<readonly [string, string]> = [];
      const failed: Array<string> = [];
      const result = yield* Skills.runCreateFlow(root, ports('agent'), {
        onSkillCreated: (skill, sessionId) => created.push([skill.id, sessionId]),
        onSkillFailed: (message) => failed.push(message),
      });
      Vitest.expect(result?.kind).toBe('dispatched');
      const sessionId = result?.kind === 'dispatched' ? result.sessionId : '';
      yield* Effect.promise(() => writeSkill(root, 'typescript-reviewer', 'reviews TypeScript'));
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => created.length + failed.length),
        (count) => count > 0,
      );
      Vitest.expect(created).toStrictEqual([['typescript-reviewer', sessionId]]);
      Vitest.expect(failed).toStrictEqual([]);
    }),
  );

  Vitest.it.live('reports a settle with no fresh skill', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const failed: Array<string> = [];
      yield* Skills.runCreateFlow(root, ports('agent'), {
        onSkillCreated: () => undefined,
        onSkillFailed: (message) => failed.push(message),
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => failed.length),
        (count) => count > 0,
      );
      Vitest.expect(failed[0]).toContain('without creating a skill');
    }),
  );

  Vitest.it.live('resolves undefined on a real cancel without dispatching', () =>
    Effect.gen(function* () {
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const result = yield* Skills.runCreateFlow(root, ports('cancel'));
      Vitest.expect(result).toBeUndefined();
    }),
  );
});

Vitest.describe('Skills.runCreateFlow manual create', () => {
  Vitest.it.live('persists the manual skill and resolves the saved result', () =>
    Effect.gen(function* () {
      Sessions.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      const result = yield* Skills.runCreateFlow(root, ports('manual'));
      Vitest.expect(result?.kind).toBe('saved');
      Vitest.expect(result?.kind === 'saved' ? result.skill.id : '').toBe('manual-reviewer');
      const { skills } = yield* Skills.getSkills(root);
      Vitest.expect(skills.map((skill) => skill.id)).toStrictEqual(['manual-reviewer']);
    }),
  );
});

Vitest.describe('Skills.runModifyFlow agentic dispatch', () => {
  Vitest.it.live('gates on the sessions extension without dispatching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSkill(root, 'reviewer', 'reviews TypeScript'));
      const error = yield* Skills.runModifyFlow(root, 'reviewer', ports('agent')).pipe(Effect.flip);
      Vitest.expect(error).toBe(Sessions.SESSIONS_EXTENSION_INSTALL_HINT);
      Vitest.expect(harness.sessions.length).toBe(0);
    }),
  );

  Vitest.it.live('dispatches an editor session and resolves the dispatched result', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSkill(root, 'reviewer', 'reviews TypeScript'));
      const result = yield* Skills.runModifyFlow(root, 'reviewer', ports('agent'));
      Vitest.expect(result?.kind).toBe('dispatched');
      const sessionId = result?.kind === 'dispatched' ? result.sessionId : '';
      Vitest.expect(sessionId).toMatch(/^modify-skill-/);
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      Vitest.expect(session.request.tools).toStrictEqual([...Sessions.DEFAULT_SESSION_TOOLS]);
      const prompt = yield* poll(
        Effect.sync(() => session.prompts[0]),
        (value) => value !== undefined,
      );
      Vitest.expect(prompt).toContain('Skill to edit: reviewer');
      Vitest.expect(prompt).toContain('Change request: reviews TypeScript and tests');
    }),
  );

  Vitest.it.live('fires the completion hook with the updated skill on settle', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSkill(root, 'reviewer', 'reviews TypeScript'));
      const modified: Array<readonly [string, string]> = [];
      const failed: Array<string> = [];
      const result = yield* Skills.runModifyFlow(root, 'reviewer', ports('agent'), {
        onSkillModified: (skill, sessionId) => modified.push([skill.id, sessionId]),
        onSkillFailed: (message) => failed.push(message),
      });
      Vitest.expect(result?.kind).toBe('dispatched');
      const sessionId = result?.kind === 'dispatched' ? result.sessionId : '';
      yield* Effect.promise(() => writeSkill(root, 'reviewer', 'reviews TypeScript and tests'));
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => modified.length + failed.length),
        (count) => count > 0,
      );
      Vitest.expect(modified).toStrictEqual([['reviewer', sessionId]]);
      Vitest.expect(failed).toStrictEqual([]);
    }),
  );

  Vitest.it.live('reports a settle that left the skill unchanged', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Sessions.setSessionFactoryLayer(harness.layer);
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSkill(root, 'reviewer', 'reviews TypeScript'));
      const failed: Array<string> = [];
      yield* Skills.runModifyFlow(root, 'reviewer', ports('agent'), {
        onSkillModified: () => undefined,
        onSkillFailed: (message) => failed.push(message),
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

  Vitest.it.live('resolves undefined on a real cancel without dispatching', () =>
    Effect.gen(function* () {
      Sessions.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSkill(root, 'reviewer', 'reviews TypeScript'));
      const result = yield* Skills.runModifyFlow(root, 'reviewer', ports('cancel'));
      Vitest.expect(result).toBeUndefined();
    }),
  );
});

Vitest.describe('Skills.runModifyFlow manual modify', () => {
  Vitest.it.live('persists the manual edit and resolves the saved result', () =>
    Effect.gen(function* () {
      Sessions.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeSkill(root, 'reviewer', 'reviews TypeScript'));
      const result = yield* Skills.runModifyFlow(root, 'reviewer', ports('manual'));
      Vitest.expect(result?.kind).toBe('saved');
      Vitest.expect(result?.kind === 'saved' ? result.skill.description : '').toBe(
        'reviews TypeScript and tests',
      );
      const { skills } = yield* Skills.getSkills(root);
      Vitest.expect(skills[0]?.description).toBe('reviews TypeScript and tests');
    }),
  );
});
