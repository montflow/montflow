import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer, Path } from 'effect';
import { entry } from '@montflow/opencode';
import { DEFAULT_ROOT, runSlash } from './apps/cli/index.js';
import { SpecStore } from './services/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'specs';

/** Slash command registered by the server plugin (invoke as `/specs`). */
export const COMMAND_NAME = 'specs';

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
 * OpenCode server plugin entry: registers `/specs` for mechanically verifying
 * specs. Pure filesystem checks — no model, no network. The invocation text is
 * the slash-command argument and every path resolves from the plugin's
 * directory, not the server process's: the default root is the plugin
 * workspace, and a relative `--dir` joins onto it the same way.
 */
export default entry(ID, (ports) =>
  ports.command.register({
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    execute: (invocation) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workspace = ports.cwd;
        const resolveDir = (dir: string) =>
          path.isAbsolute(dir) ? dir : path.join(workspace, dir);
        return yield* runSlash(
          invocation.prompt.text,
          path.join(workspace, DEFAULT_ROOT),
          resolveDir,
        );
      }).pipe(
        Effect.provide(CommandLive),
        Effect.tap((report) => Effect.logInfo(report.output)),
        Effect.catch((error) => Effect.logError(`${error.operation} failed: ${error.reason}`)),
      ),
  }),
);
