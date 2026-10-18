import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  Runtime,
  Session,
  SessionRunner,
  type SessionRunnerImpl,
  type SessionRunnerStartInput,
} from '@montflow/pi-sessions';
import { Effect, Layer, Schema } from 'effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Vitest from '@effect/vitest';
import piReviewsExtension from './extension.js';

interface RegisteredCommand {
  readonly name: string;
  readonly options: { readonly description?: string };
}

interface FakePi {
  readonly commands: Array<RegisteredCommand>;
  readonly tools: Array<ToolDefinition>;
  readonly api: Pick<ExtensionAPI, 'registerCommand' | 'registerTool'>;
}

const makePi = (): FakePi => {
  const commands: Array<RegisteredCommand> = [];
  const tools: Array<ToolDefinition> = [];
  // SAFETY: the fake implements only the ExtensionAPI members the extension calls.
  const api = {
    registerCommand: (name: string, options: RegisteredCommand['options']) => {
      commands.push({ name, options });
    },
    registerTool: (definition: ToolDefinition) => {
      tools.push(definition);
    },
  } as Pick<ExtensionAPI, 'registerCommand' | 'registerTool'>;
  return { commands, tools, api };
};

const findTool = (fake: FakePi, name: string): ToolDefinition => {
  const found = fake.tools.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`tool not registered: ${name}`);
  return found;
};

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-extension-'));

/** Write a minimal decodable `PROFILE.md`. */
const writeProfile = async (root: string, name: string, model: string): Promise<void> => {
  const dir = join(root, '.agents', '@montflow', 'profiles', name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'PROFILE.md'),
    [
      '---',
      `name: ${name}`,
      `description: ${name} reviewer`,
      `model: ${model}`,
      'skills:',
      '  - montflow-adversarial-review',
      '---',
      '',
      `# ${name}`,
      '',
      '## Instructions',
      '',
      'Review.',
      '',
      '## Review Checklist',
      '',
      '- [ ] Check.',
      '',
    ].join('\n'),
    'utf8',
  );
};

/** A minimal running session for the runner stub to return. */
const fakeSession = (id: string): Session.Session =>
  Schema.decodeUnknownSync(Session.Session)({
    id,
    parent: null,
    status: 'running',
    created: '2026-10-15T00:00:00Z',
    updated: '2026-10-15T00:00:01Z',
    sessionFile: `.agents/@montflow/sessions/${id}/session.jsonl`,
    name: `Review: ${id}`,
  });

/** A `SessionRunner` stub that records every `start` input; other methods are unused. */
const recordingRunner = (captured: Array<SessionRunnerStartInput>): SessionRunnerImpl => ({
  start: (input) =>
    Effect.sync(() => {
      captured.push(input);
      return fakeSession('session-1');
    }),
  resume: () => Effect.fail('unused'),
  steer: () => Effect.void,
  answer: () => Effect.void,
  interrupt: () => Effect.void,
  detail: () => Effect.fail('unused'),
  verify: () => Effect.fail('unused'),
  verifyStore: () => Effect.succeed({ ignored: true, issues: [] }),
  progress: () => Effect.void,
  list: () => Effect.succeed([]),
  liveSessionIds: () => Effect.succeed(new Set()),
});

/** A session runner host backed by a real runtime over the recording runner. */
const recordingHost = (captured: Array<SessionRunnerStartInput>): Runtime.SessionRunnerHost => {
  const runtime = ManagedRuntime.make(Layer.succeed(SessionRunner, recordingRunner(captured)));
  return { runtimeFor: () => runtime, disposeAll: async () => {} };
};

/** A context carrying the workspace root the tool reads; `model` is absent. */
const context = (cwd: string): ExtensionContext => {
  // SAFETY: the review_create tool reads only `ctx.cwd`/`ctx.model`; the root
  // alone is a faithful structural stand-in for the full Pi context under test.
  return { cwd } as ExtensionContext;
};

Vitest.describe('piReviewsExtension review_create', () => {
  Vitest.it.effect('registers the tool with profile, round, phase, and thinking parameters', () =>
    Effect.promise(async () => {
      const fake = makePi();
      await piReviewsExtension(fake.api);
      Vitest.expect(fake.commands.map((entry) => entry.name)).toStrictEqual(['mf-reviews']);
      const tool = findTool(fake, 'review_create');
      const serialized = JSON.stringify(tool.parameters);
      for (const key of ['profile', 'round', 'phase', 'thinking']) {
        Vitest.expect(serialized).toContain(`"${key}"`);
      }
    }),
  );

  Vitest.it.effect('forwards profile, round, phase, and thinking into dispatch', () =>
    Effect.promise(async () => {
      const root = await freshRoot();
      await writeProfile(root, 'effect-reviewer', 'anthropic/claude-x');
      const captured: Array<SessionRunnerStartInput> = [];
      Runtime.setActiveSessionRunnerHost(recordingHost(captured));
      const fake = makePi();
      await piReviewsExtension(fake.api);
      const result = await findTool(fake, 'review_create').execute(
        'call-1',
        {
          name: 'demo-effect-reviewer',
          spec: 'demo',
          profile: 'effect-reviewer',
          round: '003',
          phase: 'C',
          model: 'openai/gpt-z',
          thinking: 'high',
        },
        undefined,
        undefined,
        context(root),
      );
      Vitest.expect(result.content).toStrictEqual([
        {
          type: 'text',
          text: "Started review session 'session-1' for series 'demo-effect-reviewer'.",
        },
      ]);
      Vitest.expect(captured).toHaveLength(1);
      Vitest.expect(captured[0]?.model).toBe('anthropic/claude-x');
      Vitest.expect(captured[0]?.thinking).toBe('high');
      Vitest.expect(captured[0]?.prompt).toContain('- Profile: effect-reviewer');
      Vitest.expect(captured[0]?.prompt).toContain('- Round: 003');
      Vitest.expect(captured[0]?.prompt).toContain('- Phase: C');
      await rm(root, { recursive: true, force: true });
    }),
  );

  Vitest.it.effect('rejects an unknown thinking level before dispatch', () =>
    Effect.promise(async () => {
      const root = await freshRoot();
      await writeProfile(root, 'effect-reviewer', '');
      const captured: Array<SessionRunnerStartInput> = [];
      Runtime.setActiveSessionRunnerHost(recordingHost(captured));
      const fake = makePi();
      await piReviewsExtension(fake.api);
      const result = await findTool(fake, 'review_create').execute(
        'call-1',
        {
          name: 'demo-effect-reviewer',
          profile: 'effect-reviewer',
          thinking: 'turbo',
        },
        undefined,
        undefined,
        context(root),
      );
      const [content] = result.content;
      Vitest.expect(content?.type === 'text' ? content.text : '').toContain('turbo');
      Vitest.expect(captured).toHaveLength(0);
      await rm(root, { recursive: true, force: true });
    }),
  );
});
