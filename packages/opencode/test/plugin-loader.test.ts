import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect, type Scope } from 'effect';
import { Host } from '@opencode/plugin/host';

// The adapter is the only package allowed to import `@opencode/*`; it exercises
// the real host loader against the pilot plugin `@montflow/specs` by directory,
// so no dependency edge (and no build cycle) is added between the two packages.
const specsDirectory = fileURLToPath(new URL('../../specs', import.meta.url));
const specsTarget = { directory: specsDirectory, name: '@montflow/specs' };

/** The command editor the port drives through `ctx.command.transform`. */
interface HostCommandEditor {
  add(definition: { readonly name: string }): void;
}

/** The slice of the host `Plugin.Context.command` the `/specs` command touches. */
interface HostCommandDomain {
  transform(
    callback: (editor: HostCommandEditor) => void,
  ): Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never>;
  list(): Effect.Effect<{ readonly data: ReadonlyArray<{ readonly name: string }> }, unknown>;
}

/** Host server entry contract: `default = { id, effect }` (B002 fact 1). */
interface ServerModule {
  readonly default: {
    readonly id: string;
    readonly effect: (context: {
      readonly command: HostCommandDomain;
    }) => Effect.Effect<void, never, Scope.Scope>;
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
  if (entrypoint === undefined) throw new Error(`@montflow/specs has no ${label} entrypoint`);
  // SAFETY: Host.load returns the imported module namespace; the caller's T
  // names the entrypoint contract this test exists to prove ({ id, effect } for
  // ./server, { id, setup } for ./tui), asserted immediately after.
  return (await Host.load(entrypoint)) as T;
};

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
  const added: Array<{ readonly name: string }> = [];
  const context = {
    command: {
      transform: (callback: (editor: HostCommandEditor) => void) =>
        Effect.sync(() => {
          callback({
            add: (definition) => {
              added.push(definition);
            },
          });
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed({ data: [] }),
    },
  };
  await server.default.effect(context).pipe(Effect.scoped, Effect.runPromise);
  expect(added.map((definition) => definition.name)).toEqual(['specs']);
});
