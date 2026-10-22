import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PortsContext } from '@montflow/opencode';
import { Effect, type Scope } from 'effect';
import * as Vitest from '@effect/vitest';
import server from '../server.js';

type CommandDomain = NonNullable<PortsContext['command']>;
type CommandEditor = Parameters<CommandDomain['transform']>[0] extends (editor: infer E) => void
  ? E
  : never;
type CommandDefinition = Parameters<CommandEditor['add']>[0];

type ToolDomain = NonNullable<PortsContext['tool']>;
type ToolEditor = Parameters<ToolDomain['transform']>[0] extends (editor: infer E) => void
  ? E
  : never;
type ToolDefinition = Parameters<ToolEditor['add']>[0];

/** One dispatched session, as the fake host recorded it. */
interface Dispatched {
  readonly title: string | undefined;
  readonly model: unknown;
  readonly prompt: string;
}

/**
 * A server host context that records the registered command, tool, and
 * sessions, so the plugin effect runs without the real host. `directory` is
 * the plugin directory the tool resolves its stores from.
 */
const makeHost = (directory: string) => {
  const commands: CommandDefinition[] = [];
  const tools: ToolDefinition[] = [];
  const dispatched: Array<Dispatched> = [];
  const context: PortsContext = {
    location: { directory },
    command: {
      transform: (callback) =>
        Effect.sync(() => {
          // SAFETY: the fake editor implements the one member the port drives (`add`);
          // the host contract's remaining editor methods are never reached by registration.
          callback({
            add: (definition) => {
              commands.push(definition);
            },
          } as CommandEditor);
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed({ data: [] }),
    },
    tool: {
      transform: (callback) =>
        Effect.sync(() => {
          const editor: ToolEditor = {
            list: () => [],
            add: (tool) => {
              tools.push(tool);
            },
            update: () => {},
            remove: () => {},
          };
          callback(editor);
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed([]),
    },
    model: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({ list: () => [], get: () => undefined, default: { get: () => undefined } });
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed({ data: [] }),
      default: () => Effect.succeed({ data: undefined }),
    },
    session: {
      create: (input) =>
        Effect.sync(() => {
          dispatched.push({ title: input.title, model: input.model, prompt: '' });
          // SAFETY: the fixture stands in for the host, which mints the session id.
          return { id: `ses_${dispatched.length}` } as never;
        }),
      prompt: (input) =>
        Effect.sync(() => {
          const last = dispatched[dispatched.length - 1];
          if (last !== undefined) {
            dispatched[dispatched.length - 1] = { ...last, prompt: input.text };
          }
        }),
      wait: () => Effect.void,
      context: () => Effect.succeed([]),
    },
  };
  return { context, commands, tools, dispatched };
};

/** The plugin entry as this test drives it, with the narrowed port context. */
interface ServerEntry {
  readonly id: string;
  readonly effect: (context: PortsContext) => Effect.Effect<void, never, Scope.Scope>;
}

// SAFETY: `entry` is generic over the program's requirement only; its effect
// accepts the narrowed `PortsContext` named here (the host type is the wider
// side of the same contract).
const plugin = server as ServerEntry;

/** Register the plugin and hand back what it published. */
const register = (root: string) =>
  Effect.gen(function* () {
    const host = makeHost(root);
    yield* plugin.effect(host.context).pipe(Effect.scoped);
    const tool = host.tools.find((entry) => entry.name === 'review_create');
    if (tool === undefined) return yield* Effect.die('the review_create tool did not register');
    return { host, tool };
  });

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-server-'));

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

/** Input accepted by the `review_create` tool. */
interface ReviewCreateInput {
  readonly name: string;
  readonly target?: string | undefined;
  readonly spec?: string | undefined;
  readonly profile?: string | undefined;
  readonly round?: string | undefined;
  readonly phase?: string | undefined;
  readonly model?: string | undefined;
}

/** Invoke a registered tool the way the host does. */
const invoke = (tool: ToolDefinition, input: ReviewCreateInput) =>
  // SAFETY: the fixture supplies the tool's decoded input and a structurally
  // complete run context; the host mints both in production.
  tool.execute(
    input as never,
    {
      sessionID: 'ses_parent',
      agent: 'build',
      messageID: 'msg_1',
      id: 'call_1',
      progress: () => Effect.void,
    } as never,
  );

Vitest.describe('reviews server plugin', () => {
  Vitest.it.effect('registers /mf-reviews and the review_create tool', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const { host } = yield* register(root);
      Vitest.expect(host.commands.map((entry) => entry.name)).toStrictEqual(['mf-reviews']);
      Vitest.expect(host.tools.map((entry) => entry.name)).toStrictEqual(['review_create']);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('forwards profile, round, phase, and the profile model into dispatch', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer', 'anthropic/claude-x'));
      const { host, tool } = yield* register(root);
      const result = yield* invoke(tool, {
        name: 'demo-effect-reviewer',
        spec: 'demo',
        profile: 'effect-reviewer',
        round: '003',
        phase: 'C',
        model: 'openai/gpt-z',
      });
      Vitest.expect(result.content).toBe("Started review 'demo-effect-reviewer' in session ses_1.");
      Vitest.expect(host.dispatched).toHaveLength(1);
      const session = host.dispatched[0];
      Vitest.expect(session?.title).toBe('Review: demo-effect-reviewer');
      Vitest.expect(session?.prompt).toContain('- Profile: effect-reviewer');
      Vitest.expect(session?.prompt).toContain('- Round: 003');
      Vitest.expect(session?.prompt).toContain('- Phase: C');
      Vitest.expect(session?.prompt).toContain(
        "Load the 'montflow-adversarial-review' skill before starting.",
      );
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('fails on an unknown profile without starting a session', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const { host, tool } = yield* register(root);
      const error = yield* invoke(tool, {
        name: 'demo-effect-reviewer',
        profile: 'effect-reviewer',
      }).pipe(Effect.flip);
      Vitest.expect(error.message).toContain("profile 'effect-reviewer' was not found");
      Vitest.expect(host.dispatched).toStrictEqual([]);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }),
  );
});
