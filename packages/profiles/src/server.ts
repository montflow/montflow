import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { defineTool, entry, type Ports } from '@montflow/opencode';
import { Effect, Layer, Schema, type Scope } from 'effect';
import * as Cli from './apps/cli/index.js';
import * as Interactive from './apps/interactive/index.js';
import { runProfile, syncAgents } from './apps/server/index.js';
import type * as PiProfiles from './modules/pi-profiles/index.js';
import { ProfileStore } from './services/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'profiles';

/** Slash command registered by the server plugin (invoke as `/mf-profiles`). */
export const COMMAND_NAME = Interactive.COMMAND_NAME;

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION = Interactive.COMMAND_DESCRIPTION;

/** File-backed store with its platform dependencies hidden. */
const Live: Layer.Layer<ProfileStore.ProfileStore> = Layer.provide(
  ProfileStore.Default,
  Layer.merge(NodeFileSystem.layer, NodePath.layer),
);

/** Log a command result where the server host can see it. */
const notify = (message: string): void => {
  Effect.logInfo(message).pipe(Effect.runSync);
};

/**
 * Notify-only dialog surface for the headless CLI. `Cli.run` never opens a
 * dialog; the stubs keep the interactive type honest if that changes.
 */
const cliUi: Interactive.InteractiveUi = {
  select: () => Promise.resolve(undefined),
  confirm: () => Promise.resolve(false),
  input: () => Promise.resolve(undefined),
  notify,
};

/** Every stored profile. */
const listProfiles = (cwd: string): Effect.Effect<readonly PiProfiles.Profile[]> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    return yield* store.list(cwd);
  }).pipe(Effect.provide(Live));

/** Load one profile by name, failing with a readable message. */
const loadProfile = (cwd: string, name: string): Effect.Effect<PiProfiles.Profile, string> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    return yield* store.read(cwd, name);
  }).pipe(
    Effect.provide(Live),
    Effect.mapError((error) => error.message),
  );

/** The `profile_execute` tool: run a profile in a native session. */
const executeTool = (cwd: string, ports: Ports, scope: Scope.Scope) =>
  defineTool({
    name: 'profile_execute',
    description:
      "Run a stored agent profile on a task in a native session, returning the agent's last reply. The profile supplies the system prompt and pinned model; pass a model label to override it.",
    input: Schema.Struct({
      name: Schema.String,
      task: Schema.String,
      model: Schema.optional(Schema.String),
    }),
    execute: (input) =>
      Effect.gen(function* () {
        const profile = yield* loadProfile(cwd, input.name);
        return yield* runProfile(ports, profile, input.task, input.model, scope);
      }),
  });

/**
 * OpenCode server plugin entry: registers every stored profile as a native
 * agent, `/mf-profiles` as a slash command, and `profile_execute` as an
 * agent-callable tool. Agentic authoring and editing remain interactive
 * concerns; their child runs use the same native dispatch path.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const profiles = yield* listProfiles(ports.cwd);
    yield* syncAgents(ports, profiles);
    yield* ports.command.register({
      name: COMMAND_NAME,
      description: COMMAND_DESCRIPTION,
      execute: (invocation) =>
        Cli.run(invocation.prompt.text, cliUi, ports.cwd).pipe(
          Effect.provide(Live),
          Effect.catch((message) => Effect.sync(() => notify(message))),
        ),
    });
    yield* ports.tool.add(executeTool(ports.cwd, ports, scope));
  }),
);
