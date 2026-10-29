import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import type { PortsContext } from '@montflow/opencode';
import { Effect, type Scope } from 'effect';
import {
  makeClone,
  makeOrigin,
  makeWorkspace,
  PURPOSE,
  seedEntry,
  seedStoreRoot,
  URL,
} from '../apps/cli/tests/fixtures.js';
import { Git, Reference } from '../modules/index.js';
import server, { addSuccessText } from '../server.js';
import tui from '../tui.js';

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

/**
 * A server host context that records the registered command and tools. The
 * session domain is a trap: every reference tool is deterministic, so any call
 * to it is a defect with a named message.
 */
const makeHost = (directory: string) => {
  const commands: CommandDefinition[] = [];
  const tools: ToolDefinition[] = [];
  const dispatches: Array<string> = [];
  const trap = (operation: string) =>
    Effect.sync(() => {
      dispatches.push(operation);
      throw new Error(`reference tools must not call the session port (${operation})`);
    });
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
    session: {
      create: () => trap('create'),
      prompt: () => trap('prompt'),
      wait: () => trap('wait'),
      context: () => trap('context'),
    },
  };
  return { context, commands, tools, dispatches };
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
    return host;
  });

/** One registered tool by name, or a defect naming the gap. */
const toolNamed = (host: { readonly tools: ReadonlyArray<ToolDefinition> }, name: string) =>
  Effect.gen(function* () {
    const tool = host.tools.find((entry) => entry.name === name);
    if (tool === undefined) return yield* Effect.die(`the ${name} tool did not register`);
    return tool;
  });

/** Run one tool the way the host does and return its model-facing text. */
const invoke = <Input>(tool: ToolDefinition, input: Input) =>
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

/** Write one entry whose body carries searchable notes. */
const seedWithNotes = async (root: string, slug: string, notes: string): Promise<void> => {
  const reference = Reference.Reference.make({
    name: slug,
    url: `https://example.test/montflow/${slug}.git`,
    purpose: `Reference ${slug} for the find tool.`,
    added: '2026-10-26',
  });
  const dir = join(root, Reference.STORE_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, Reference.ENTRY_FILE),
    Reference.encodeReferenceFile({ reference, body: `\n${notes}\n` }),
  );
};

const cleanup = (root: string) => Effect.promise(() => rm(root, { recursive: true, force: true }));

Vitest.describe('references server plugin', () => {
  Vitest.it.effect('registers /mf-references and exactly the two deterministic tools', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const host = yield* register(root);
      Vitest.expect(host.commands.map((entry) => entry.name)).toStrictEqual(['mf-references']);
      Vitest.expect(host.commands[0]?.description).toContain('mf-references');
      Vitest.expect(host.tools.map((entry) => entry.name)).toStrictEqual([
        'reference_add',
        'reference_find',
      ]);
      Vitest.expect(host.dispatches).toStrictEqual([]);
      yield* cleanup(root);
    }),
  );

  Vitest.it('builds the single success line for created and routed adds', () => {
    const created: Git.AddCreated = {
      kind: 'created',
      slug: 'effect',
      url: 'https://github.com/Effect-TS/effect-smol',
      message: 'created effect https://github.com/Effect-TS/effect-smol',
    };
    Vitest.expect(addSuccessText(created)).toBe(
      'created effect https://github.com/Effect-TS/effect-smol; registered .agents/@montflow/references/effect/REFERENCE.md.',
    );

    const notice = `routed add -> update opencode: ${URL} is already registered as opencode`;
    const routed: Git.AddRouted = {
      kind: 'routed',
      slug: 'opencode',
      url: URL,
      notice,
      update: { kind: 'present', slug: 'opencode', message: 'present opencode' },
      message: notice,
    };
    Vitest.expect(addSuccessText(routed)).toBe(`${notice}; present opencode.`);
  });

  Vitest.it.effect('a reference_add refusal is a displayable string and dispatches nothing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      const host = yield* register(root);
      const tool = yield* toolNamed(host, 'reference_add');
      const error = yield* invoke(tool, { url: 'git@github.com:owner/repo.git' }).pipe(Effect.flip);
      Vitest.expect(error.message).toContain('refused: invalid url');
      Vitest.expect(error.message).toContain('use the https URL');
      Vitest.expect(host.dispatches).toStrictEqual([]);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('reference_find returns an exact entry with its clone path', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      yield* Effect.promise(() => seedStoreRoot(root));
      yield* Effect.promise(() =>
        seedEntry(root, {
          name: 'opencode',
          url: 'https://github.com/sst/opencode.git',
          purpose: PURPOSE,
        }),
      );
      const host = yield* register(root);
      const tool = yield* toolNamed(host, 'reference_find');
      const result = yield* invoke(tool, { query: 'opencode' });
      Vitest.expect(result.content).toBe(
        [
          'opencode  missing',
          'url: https://github.com/sst/opencode.git',
          `purpose: ${PURPOSE}`,
          'path: .agents/references/opencode (missing — run mf-references sync opencode)',
        ].join('\n'),
      );

      const origin = yield* Effect.promise(makeOrigin);
      const cloneUrl = 'https://example.test/montflow/effect.git';
      yield* Effect.promise(() =>
        seedEntry(root, { name: 'effect', url: cloneUrl, purpose: 'Effect runtime sources.' }),
      );
      yield* Effect.promise(() => makeClone(root, 'effect', origin.dir, cloneUrl));
      const installed = yield* invoke(tool, { query: cloneUrl });
      Vitest.expect(installed.content).toBe(
        [
          'effect  installed',
          `url: ${cloneUrl}`,
          'purpose: Effect runtime sources.',
          'path: .agents/references/effect',
        ].join('\n'),
      );

      Vitest.expect(host.dispatches).toStrictEqual([]);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('reference_find matches purpose and notes as candidate rows', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeWorkspace);
      yield* Effect.promise(() => seedStoreRoot(root));
      yield* Effect.promise(() =>
        seedEntry(root, {
          name: 'alpha',
          url: 'https://example.test/montflow/alpha.git',
          purpose: 'WebSocket protocol implementation for the fixture.',
        }),
      );
      yield* Effect.promise(() => seedWithNotes(root, 'beta', 'Hibernates until the first byte.'));
      const host = yield* register(root);
      const tool = yield* toolNamed(host, 'reference_find');

      const byPurpose = yield* invoke(tool, { query: 'WEBSOCKET' });
      Vitest.expect(byPurpose.content).toBe(
        'missing alpha  WebSocket protocol implementation for the fixture.',
      );

      const byNotes = yield* invoke(tool, { query: 'hibernate' });
      Vitest.expect(byNotes.content).toBe('missing beta  Reference beta for the find tool.');

      const none = yield* invoke(tool, { query: 'nope' });
      Vitest.expect(none.content).toBe(
        "No reference matches 'nope'. 2 references registered; run mf-references list to see them.",
      );
      Vitest.expect(host.dispatches).toStrictEqual([]);
      yield* cleanup(root);
    }),
  );

  Vitest.it('loads the TUI entry as an id-only no-op', () => {
    Vitest.expect(tui.id).toBe('references');
    Vitest.expect(tui.setup()).toBeTypeOf('function');
    Vitest.expect(tui.setup()()).toBeUndefined();
  });
});
