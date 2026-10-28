import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CommandContext, PortsContext } from '@montflow/opencode';
import { Effect, type Scope } from 'effect';
import * as Vitest from '@effect/vitest';
import { specMarkdown } from '../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../modules/task/tests/helpers.js';
import server from '../server.js';

type CommandDomain = NonNullable<CommandContext['command']>;
type Editor = Parameters<CommandDomain['transform']>[0] extends (editor: infer E) => void
  ? E
  : never;
type Definition = Parameters<Editor['add']>[0];
type Invocation = Parameters<Definition['execute']>[0];

/**
 * A server host context that records the registered command, so the plugin
 * effect can run without the real host. `directory` is the plugin directory the
 * command must resolve its spec root from.
 */
const makeHost = (directory: string) => {
  const commands: Definition[] = [];
  const messages: string[] = [];
  captured = messages;
  const context: PortsContext = {
    location: { directory },
    session: {
      create: () => Effect.die('unused in this test'),
      prompt: (input) => Effect.sync(() => messages.push(input.text)),
      wait: () => Effect.void,
      context: () => Effect.succeed([]),
    },
    command: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            add: (definition) => {
              commands.push(definition);
            },
          });
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed({ data: [] }),
    },
  };
  return { context, commands };
};

/** The plugin entry as this test drives it, with the narrowed port context. */
interface ServerEntry {
  readonly id: string;
  readonly effect: (context: PortsContext) => Effect.Effect<void, never, Scope.Scope>;
}

/**
 * The adapter's `entry` narrows the host context to `PortsContext`; the host
 * `Plugin` type re-exposes the wider one, so name the contract the test drives.
 */
// SAFETY: `entry` is generic over the program's requirement only; its effect
// accepts the narrowed `PortsContext` named here (the host type is the wider
// side of the same contract).
const plugin = server as ServerEntry;

/** Register the plugin and hand back the command it published. */
const register = (root: string) =>
  Effect.gen(function* () {
    const host = makeHost(root);
    yield* plugin.effect(host.context).pipe(Effect.scoped);
    const command = host.commands[0];
    if (command === undefined) return yield* Effect.die('the /mf-specs command did not register');
    return command;
  });

/** Lines the command posted into its invoking session; reset per host. */
let captured: string[] = [];

/** Invoke the registered command with slash text, the way the host does. */
const invoke = (command: Definition, text: string) =>
  // SAFETY: only `prompt.text` is read; the host fills the rest of the invocation.
  command.execute({
    prompt: { text },
    sessionID: 'ses_test',
    delivery: 'queue',
  } as Invocation);

/** Read everything the command posted into the session. */
const logged = (): Effect.Effect<string> => Effect.sync(() => captured.join('\n'));

/** A throwaway workspace root. */
const freshRoot = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'mf-specs-server-'));

/** Write one valid spec under `<root>/.agents/@montflow/specs`. */
const writeSpec = async (root: string, name: string): Promise<void> => {
  const spec = path.join(root, '.agents', '@montflow', 'specs', name);
  const task = path.join(spec, 'A001-implement-login');
  await mkdir(task, { recursive: true });
  await writeFile(path.join(spec, 'SPEC.md'), specMarkdown({ name }));
  await writeFile(
    path.join(task, 'TASK.md'),
    taskMarkdown({ id: 'A001', name: 'implement-login' }),
  );
  await writeFile(path.join(task, 'MEMORY.md'), memoryMarkdown());
};

Vitest.describe('specs server command', () => {
  Vitest.it.effect('runs the invocation text against the plugin directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      try {
        yield* Effect.promise(() => writeSpec(root, 'ok'));
        const command = yield* register(root);
        // `status` only runs when the invocation text is forwarded; the old
        // empty argument defaulted to `check`.
        yield* invoke(command, 'status --name ok');
        Vitest.expect(yield* logged()).toContain('Phase A');
        Vitest.expect(yield* logged()).not.toContain('failed');
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }
    }),
  );

  Vitest.it.effect('creates under the plugin directory, not the process directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const name = 'created-from-invocation';
      try {
        const command = yield* register(root);
        yield* invoke(command, `create --name ${name}`);
        const created = path.join(root, '.agents', '@montflow', 'specs', name, 'SPEC.md');
        Vitest.expect(existsSync(created)).toBe(true);
        Vitest.expect(
          existsSync(path.join(process.cwd(), '.agents', '@montflow', 'specs', name)),
        ).toBe(false);
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }
    }),
  );

  Vitest.it.effect('resolves a relative --dir against the plugin directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      try {
        // The relative name only resolves when it joins onto the plugin
        // directory; the server process directory has no such checkout.
        yield* Effect.promise(() => writeSpec(path.join(root, 'nested'), 'nested'));
        const command = yield* register(root);
        yield* invoke(command, 'status --name nested --dir nested');
        Vitest.expect(yield* logged()).toContain('Phase A');
        Vitest.expect(yield* logged()).not.toContain('failed');
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }
    }),
  );

  Vitest.it.effect('surfaces a store failure instead of swallowing it', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      try {
        const command = yield* register(root);
        yield* invoke(command, 'status --name missing');
        Vitest.expect(yield* logged()).toContain('SpecStatus failed:');
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }
    }),
  );
});
