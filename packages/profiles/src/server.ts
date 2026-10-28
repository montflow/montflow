import { COMMAND_NAME, ID } from './ids.js';

export { ID, COMMAND_NAME };
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { defineTool, entry, makeCommandReply, type ServerPorts } from '@montflow/opencode';
import { Effect, Layer, Schema, type Scope } from 'effect';
import * as Cli from './apps/cli/cli.apps.module.js';
import * as Interactive from './apps/interactive/index.js';
import { runProfile, syncAgents } from './apps/server/index.js';
import type * as Profiles from './modules/profile/index.js';
import { ProfileStore } from './services/index.js';

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION = Interactive.COMMAND_DESCRIPTION;

/** File-backed store with its platform dependencies hidden. */
const Live: Layer.Layer<ProfileStore.ProfileStore> = Layer.provide(
  ProfileStore.Default,
  Layer.merge(NodeFileSystem.layer, NodePath.layer),
);

/**
 * Notify-only dialog surface for the headless CLI. `Cli.run` never opens a
 * dialog; the stubs keep the interactive type honest if that changes.
 */
const cliUi = (
  notify: (message: string, tone?: 'info' | 'warning' | 'error') => void,
): Interactive.InteractiveUi => ({
  select: () => Promise.resolve(undefined),
  confirm: () => Promise.resolve(false),
  input: () => Promise.resolve(undefined),
  notify,
});

/** Every stored profile. */
const listProfiles = (cwd: string): Effect.Effect<readonly Profiles.Profile[]> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    return yield* store.list(cwd);
  }).pipe(Effect.provide(Live));

/** Load one profile by name, failing with a readable message. */
const loadProfile = (cwd: string, name: string): Effect.Effect<Profiles.Profile, string> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    return yield* store.read(cwd, name);
  }).pipe(
    Effect.provide(Live),
    Effect.mapError((error) => error.message),
  );

/** The `profile_execute` tool: run a profile in a native session. */
const executeTool = (cwd: string, ports: ServerPorts, scope: Scope.Scope) =>
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
        Effect.gen(function* () {
          const reply = makeCommandReply(ports.session, invocation);
          yield* Cli.run(invocation.prompt.text, cliUi(reply.notify), ports.cwd).pipe(
            Effect.provide(Live),
            Effect.catch((message) => Effect.sync(() => reply.notify(message, 'error'))),
          );
          yield* reply.flush();
        }),
    });
    yield* ports.tool.add(executeTool(ports.cwd, ports, scope));
  }),
);
