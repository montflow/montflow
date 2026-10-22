import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect, type Scope } from 'effect';
import { Agent } from '@opencode/schema/agent';
import { Host } from '@opencode/plugin/host';

// The adapter is the only package allowed to import `@opencode/*`; it exercises
// the real host loader against the montflow plugin packages by directory, so no
// dependency edge (and no build cycle) is added between the adapter and them.
// `Host.resolve` probes `./server`, `./tui`, then `./rpc` and ignores a
// missing module by checking `error instanceof Error` plus a Node `code`.
// Bun's `ResolveMessage` is not an `Error` (it only carries `code`), so the
// host rethrows on the first absent subpath instead of probing the next one.
// Normalize the thrown value once so resolution behaves as it does under Node.
const resolveSync = Bun.resolveSync.bind(Bun);

/** The Node-style code Bun attaches to a failed resolution. */
const codeOf = (cause: unknown): string | undefined => {
  if (!(cause instanceof Object) || !('code' in cause)) return undefined;
  return cause.code === undefined ? undefined : String(cause.code);
};

const patchedResolve: typeof Bun.resolveSync = (specifier, parent) => {
  try {
    return resolveSync(specifier, parent);
  } catch (cause) {
    const error: Error & { code?: string } = new Error(
      cause instanceof Error ? cause.message : String(cause),
    );
    const code = codeOf(cause);
    if (code !== undefined) error.code = code;
    throw error;
  }
};
Bun.resolveSync = patchedResolve;

const targetOf = (name: string) => ({
  directory: fileURLToPath(new URL(`../../${name}`, import.meta.url)),
  name: `@montflow/${name}`,
});

const specsTarget = targetOf('specs');
const promptsTarget = targetOf('prompts');
const profilesTarget = targetOf('profiles');
const reviewsTarget = targetOf('reviews');
const skillsTarget = targetOf('skills');

/** The command editor the port drives through `ctx.command.transform`. */
interface HostCommandEditor {
  add(definition: { readonly name: string }): void;
}

/** The slice of the host `Plugin.Context.command` the plugins touch. */
interface HostCommandDomain {
  transform(
    callback: (editor: HostCommandEditor) => void,
  ): Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never>;
  list(): Effect.Effect<{ readonly data: ReadonlyArray<{ readonly name: string }> }, unknown>;
}

/** The slice of the host `Plugin.Context.tool` the plugins touch. */
interface HostToolDomain {
  transform(
    callback: (editor: { add(tool: { readonly name: string }): void }) => void,
  ): Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never>;
  list(): Effect.Effect<ReadonlyArray<{ readonly name: string; readonly id: string }>, unknown>;
}

/** The slice of the host `Plugin.Context.agent` the plugins touch. */
interface HostAgentDomain {
  transform(
    callback: (editor: {
      list(): ReadonlyArray<Agent.Info>;
      get(id: string): Agent.Info | undefined;
      default(id: string | undefined): void;
      update(id: string, update: (agent: Agent.Info) => void): void;
      remove(id: string): void;
    }) => void,
  ): Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never>;
}

/** The slice of the host `Plugin.Context.skill` the plugins touch. */
interface HostSkillDomain {
  transform(
    callback: (editor: { add(skill: { readonly id: string }): void }) => void,
  ): Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never>;
}

/** The host server context fields the plugin programs read. */
interface HostContext {
  readonly command: HostCommandDomain;
  readonly tool: HostToolDomain;
  readonly agent: HostAgentDomain;
  readonly skill: HostSkillDomain;
  readonly location: { readonly directory: string };
}

/** Host server entry contract: `default = { id, effect }` (B002 fact 1). */
interface ServerModule {
  readonly default: {
    readonly id: string;
    readonly effect: (context: HostContext) => Effect.Effect<void, never, Scope.Scope>;
  };
}

/** Host TUI entry contract: `default = { id, setup }` (B002 fact 1). */
interface TuiModule {
  readonly default: {
    readonly id: string;
    readonly setup: () => void;
  };
}

const load = async <T>(entrypoint: string | undefined, label: string): Promise<T> => {
  if (entrypoint === undefined) throw new Error(`no ${label} entrypoint`);
  // SAFETY: Host.load returns the imported module namespace; the caller's T
  // names the entrypoint contract this test exists to prove ({ id, effect } for
  // ./server, { id, setup } for ./tui), asserted immediately after.
  return (await Host.load(entrypoint)) as T;
};

/**
 * A server host context recording every registration, so a plugin effect can
 * run without the real host. The agent editor creates missing agents on
 * `update`, mirroring the host contract `AgentPort.upsert` relies on.
 */
const makeHost = (directory: string) => {
  const commands: string[] = [];
  const tools: string[] = [];
  const agents: string[] = [];
  const skills: string[] = [];
  const registered: Agent.Info[] = [];
  const context: HostContext = {
    location: { directory },
    command: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            add: (definition) => {
              commands.push(definition.name);
            },
          });
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed({ data: [] }),
    },
    tool: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            add: (tool) => {
              tools.push(tool.name);
            },
          });
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed([]),
    },
    agent: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            list: () => registered,
            get: (id) => registered.find((agent) => agent.id === id),
            default: () => {},
            update: (id, update) => {
              const existing = registered.find((agent) => agent.id === id);
              const agent = existing ?? Agent.Info.default(Agent.ID.make(id));
              update(agent);
              if (existing === undefined) registered.push(agent);
              agents.push(agent.id);
            },
            remove: () => {},
          });
          return { dispose: Effect.void };
        }),
    },
    skill: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            add: (skill) => {
              skills.push(skill.id);
            },
          });
          return { dispose: Effect.void };
        }),
    },
  };
  return { context, commands, tools, agents, skills };
};

const run = (server: ServerModule, context: HostContext) =>
  server.default.effect(context).pipe(Effect.scoped, Effect.runPromise);

test('Host.resolve prefers the ./server entrypoint over the root export', () => {
  const entries = Host.resolve(specsTarget);
  expect(entries.server?.endsWith('/src/server.ts')).toBe(true);
  expect(entries.tui?.endsWith('/src/tui.ts')).toBe(true);
  expect(entries.rpc).toBeUndefined();
});

test('Host.resolve never executes plugin code', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'montflow-loader-'));
  const directory = path.join(root, 'node_modules', '@fixture', 'plugin');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: '@fixture/plugin', exports: { './server': './server.js' } }),
  );
  await writeFile(path.join(directory, 'server.js'), 'throw new Error("must not run")');
  const entries = Host.resolve({ directory, name: '@fixture/plugin' });
  expect(entries.server).toBe(pathToFileURL(path.join(directory, 'server.js')).href);
  await rm(root, { recursive: true, force: true });
});

test('Host.load yields { id, effect } for ./server and { id, setup } for ./tui', async () => {
  const entries = Host.resolve(specsTarget);
  const server = await load<ServerModule>(entries.server, 'server');
  const tui = await load<TuiModule>(entries.tui, 'tui');
  expect(server.default.id).toBe('specs');
  expect(server.default.effect).toBeTypeOf('function');
  expect(tui.default.id).toBe('specs');
  expect(tui.default.setup).toBeTypeOf('function');
});

test('the /specs slash command registers in the host command transform', async () => {
  const entries = Host.resolve(specsTarget);
  const server = await load<ServerModule>(entries.server, 'server');
  const host = makeHost(process.cwd());
  await run(server, host.context);
  expect(host.commands).toEqual(['specs']);
});

test('prompts, profiles, reviews, and skills expose native server and TUI faces', async () => {
  const targets = [
    ['prompts', promptsTarget],
    ['profiles', profilesTarget],
    ['reviews', reviewsTarget],
    ['skills', skillsTarget],
  ] as const;
  await Promise.all(
    targets.map(async ([id, target]) => {
      const entries = Host.resolve(target);
      expect(entries.server?.endsWith('/src/server.ts')).toBe(true);
      expect(entries.tui?.endsWith('/src/tui.ts')).toBe(true);
      const server = await load<ServerModule>(entries.server, 'server');
      const tui = await load<TuiModule>(entries.tui, 'tui');
      expect(server.default.id).toBe(id);
      expect(server.default.effect).toBeTypeOf('function');
      expect(tui.default.id).toBe(id);
      expect(tui.default.setup).toBeTypeOf('function');
    }),
  );
});

test('prompts registers /mf-prompts and its tools without a Pi runtime', async () => {
  const entries = Host.resolve(promptsTarget);
  const server = await load<ServerModule>(entries.server, 'server');
  const host = makeHost(process.cwd());
  await run(server, host.context);
  expect(host.commands).toEqual(['mf-prompts']);
  expect(host.tools).toEqual(['prompt_inspect', 'prompt_execute']);
  expect(host.agents).toEqual([]);
});

test('profiles registers stored profiles as agents plus /mf-profiles and its tool', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'montflow-profiles-'));
  const profile = path.join(root, '.agents', '@montflow', 'profiles', 'reviewer');
  await mkdir(profile, { recursive: true });
  await writeFile(
    path.join(profile, 'PROFILE.md'),
    [
      '---',
      'name: reviewer',
      'description: Reviews diffs for bugs',
      'model: anthropic/claude-sonnet-4',
      'skills:',
      '  - authoring-skills',
      '---',
      '',
      '# Reviewer',
      '',
      '## Instructions',
      '',
      'Be hostile.',
      '',
      '## Review Checklist',
      '',
      '- [ ] Tests cover changes',
      '',
    ].join('\n'),
  );
  const entries = Host.resolve(profilesTarget);
  const server = await load<ServerModule>(entries.server, 'server');
  const host = makeHost(root);
  try {
    await run(server, host.context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  expect(host.agents).toEqual(['mf-reviewer']);
  expect(host.commands).toEqual(['mf-profiles']);
  expect(host.tools).toEqual(['profile_execute']);
});

test('reviews registers /mf-reviews and review_create without a Pi runtime', async () => {
  const entries = Host.resolve(reviewsTarget);
  const server = await load<ServerModule>(entries.server, 'server');
  const host = makeHost(process.cwd());
  await run(server, host.context);
  expect(host.commands).toEqual(['mf-reviews']);
  expect(host.tools).toEqual(['review_create']);
  expect(host.agents).toEqual([]);
});

test('skills publishes the stored skills, /mf-skills, and the dispatch tools', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'montflow-skills-'));
  const directory = path.join(root, '.agents', 'skills', 'authoring-skills');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'SKILL.md'),
    [
      '---',
      'name: authoring-skills',
      'description: Write a skill',
      '---',
      '',
      '# When To Use',
      '',
      'When authoring a skill.',
      '',
    ].join('\n'),
  );
  const entries = Host.resolve(skillsTarget);
  const server = await load<ServerModule>(entries.server, 'server');
  const host = makeHost(root);
  try {
    await run(server, host.context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  expect(host.skills).toEqual(['authoring-skills']);
  expect(host.commands).toEqual(['mf-skills']);
  expect(host.tools).toEqual(['skill_create', 'skill_modify', 'skill_transform']);
  expect(host.agents).toEqual([]);
});
