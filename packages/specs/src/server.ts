import { COMMAND_NAME, ID } from './ids.js';

export { ID, COMMAND_NAME };
// Subpath imports, not the package root: the root re-exports `NodeClusterHttp`,
// which deep-imports `effect/dist/...`, and the OpenCode plugin loader refuses
// those specifiers. Subpaths pull only `effect/*` and node builtins.
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer, Path } from 'effect';
import { entry, makeCommandReply } from '@montflow/opencode';
import { DEFAULT_ROOT, runSlash } from './apps/cli/cli.apps.module.js';
import { SpecStore } from './services/index.js';

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION =
  'Specs: check [--name <spec>] [--verbose] [--strict] | status --name <spec> | state --name <spec> | next --name <spec> | list [--pending | --status <states>] [--verbose] | create --name <spec> [--description <text>] [--author <name>] [--workspace-type <in-place|worktree>] [--tasks <name[:type[:gates]],…>].';

/** File-backed store with its platform dependencies hidden. */
const Live: Layer.Layer<SpecStore.SpecStore> = Layer.provide(
  SpecStore.Default,
  Layer.merge(NodeFileSystem.layer, NodePath.layer),
);

/** The store plus the path service the command needs to resolve its arguments. */
const CommandLive = Layer.merge(Live, NodePath.layer);

/**
 * OpenCode server plugin entry: registers `/mf-specs` for mechanically
 * verifying specs. Pure filesystem checks — no model, no network. The
 * invocation text is the slash-command argument and every path resolves from
 * the plugin's directory, not the server process's: the default root is the
 * plugin workspace, and a relative `--dir` joins onto it the same way.
 */
export default entry(ID, (ports) =>
  ports.command.register({
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    execute: (invocation) =>
      Effect.gen(function* () {
        const reply = makeCommandReply(ports.session, invocation);
        const path = yield* Path.Path;
        const workspace = ports.cwd;
        const resolveDir = (dir: string) =>
          path.isAbsolute(dir) ? dir : path.join(workspace, dir);
        yield* runSlash(
          invocation.prompt.text,
          path.join(workspace, DEFAULT_ROOT),
          resolveDir,
        ).pipe(
          Effect.tap((report) => Effect.sync(() => reply.notify(report.output))),
          Effect.catch((error) =>
            Effect.sync(() => reply.notify(`${error.operation} failed: ${error.reason}`, 'error')),
          ),
        );
        yield* reply.flush();
      }).pipe(Effect.provide(CommandLive)),
  }),
);
