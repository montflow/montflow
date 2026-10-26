import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { PromptStore, Server as PromptServer } from '@montflow/prompts';
import { defineTool, entry } from '@montflow/opencode';
import { Effect, Layer, Path } from 'effect';
import { DEFAULT_ROOT, runSlash } from './apps/cli/index.js';
import {
  specAuthorTool,
  specExecuteTool,
  specModelsTool,
  specSizingTool,
} from './apps/server/index.js';
import { SpecStore } from './services/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'specs';

/** Slash command registered by the server plugin (invoke as `/specs`). */
export const COMMAND_NAME = 'specs';

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION =
  'Specs: check [--name <spec>] [--verbose] [--strict] | status --name <spec> | state --name <spec> | next --name <spec> | resolve --name <spec> --task <id> | sizing --name <spec> --task <id> [--verbose|--human] | models [--provider <id>] [--json] [--catalog <path>] [--verify [--name <spec>]] | which [--branch <name>] [--dir <path>] | list [--pending | --status <states>] [--verbose] | create --name <spec> [--description <text>] [--author <name>] [--workspace-type <in-place|worktree>] [--tasks <name[:type[:gates[:size]]],…>] | author --request <text> [--notes <text>] | execute [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous] | sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous] (no --scope asks which layer; --name implies spec and --name --phase implies phase).';

/** Platform services the store, prompts, and git reads need. */
const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** File-backed spec store with its platform dependencies hidden. */
const Live: Layer.Layer<SpecStore.SpecStore> = Layer.provide(SpecStore.Default, Platform);

/** File-backed prompt store the rendered prompts are read from. */
const PromptLive: Layer.Layer<PromptStore.PromptStore> = Layer.provide(
  PromptStore.Default,
  Platform,
);

/** The stores plus the platform services the commands need to resolve paths and git. */
const CommandLive = Layer.mergeAll(Live, PromptLive, NodePath.layer, NodeFileSystem.layer);

/**
 * OpenCode server plugin entry: registers `/specs` for mechanically verifying
 * specs and rendering the shipped author/execute/sizing prompts, plus the
 * `spec_author` / `spec_execute` / `spec_sizing` tools that dispatch those
 * rendered prompts. The binary stays model-free; only these tools reach the
 * host `ModelPort` and `SessionDispatchPort`, through `@montflow/prompts`'
 * shared executor. The invocation text is the slash-command argument and every
 * path resolves from the plugin's directory, not the server process's.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    const executor = PromptServer.makePromptExecutor(ports);
    const toolOptions = {
      cwd: ports.cwd,
      execute: executor,
      defaultModel: () =>
        ports.model
          .default()
          .pipe(
            Effect.map((model) =>
              model === undefined ? undefined : `${model.providerID}/${model.modelID}`,
            ),
          ),
    };
    yield* ports.tool.add(defineTool(specAuthorTool(toolOptions)));
    yield* ports.tool.add(defineTool(specExecuteTool(toolOptions)));
    yield* ports.tool.add(defineTool(specSizingTool(toolOptions)));
    yield* ports.tool.add(defineTool(specModelsTool({ cwd: ports.cwd, model: ports.model })));
    yield* ports.command.register({
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
            ports.model,
          );
        }).pipe(
          Effect.provide(CommandLive),
          Effect.tap((report) =>
            report.ok ? Effect.logInfo(report.output) : Effect.logError(report.output),
          ),
          Effect.catch((error) =>
            Effect.logError(
              'diagnostics' in error
                ? error.diagnostics.map((item) => `${item.code}: ${item.problem}`).join(' | ')
                : `${error.operation} failed: ${error.reason}`,
            ),
          ),
        ),
    });
  }),
);
