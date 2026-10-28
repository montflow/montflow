import { COMMAND_NAME, ID } from './ids.js';

export { ID, COMMAND_NAME };
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { defineTool, entry, makeCommandReply, type ServerPorts } from '@montflow/opencode';
import { ProfileStore } from '@montflow/profiles/services';
import { SpecStore } from '@montflow/specs/services';
import { Effect, Layer, Schema } from 'effect';
import * as Cli from './apps/cli/slash.apps.module.js';
import { startReview } from './apps/dispatch/index.js';
import { ProfileProbe, ReviewStore } from './services/index.js';

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION = Cli.COMMAND_DESCRIPTION;

/** File-backed store with its platform dependencies hidden. */
const NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** Every service the headless CLI needs; the probe stays optional at runtime. */
const Live: Layer.Layer<
  | ReviewStore.ReviewStore
  | ProfileProbe.ProfileProbe
  | ProfileStore.ProfileStore
  | SpecStore.SpecStore
> = Layer.mergeAll(
  Layer.provide(ReviewStore.Default, NodeLive),
  ProfileProbe.Default,
  Layer.provide(ProfileStore.Default, NodeLive),
  Layer.provide(SpecStore.Default, NodeLive),
);

/**
 * The `review_create` tool: scaffold a series if needed, then dispatch one
 * reviewer pass on a native session and return its session id.
 */
const createTool = (ports: ServerPorts) =>
  defineTool({
    name: 'review_create',
    description:
      'Start one pass of an adversarial review series on a native session. Scaffolds the series ledger when it does not exist yet, then prompts a reviewer session to write the next round. Returns the started session id; the review completes in that session.',
    input: Schema.Struct({
      name: Schema.String,
      target: Schema.optional(Schema.String),
      spec: Schema.optional(Schema.String),
      profile: Schema.optional(Schema.String),
      round: Schema.optional(Schema.String),
      phase: Schema.optional(Schema.String),
      model: Schema.optional(Schema.String),
    }),
    execute: (input) =>
      Effect.gen(function* () {
        const result = yield* startReview(ports, { root: ports.cwd, ...input }).pipe(
          Effect.provide(Live),
        );
        return `Started review '${result.series}' in session ${result.sessionId}.`;
      }),
  });

/**
 * OpenCode server plugin entry: registers `/mf-reviews` for the headless CLI
 * and `review_create` for agentic dispatch. A review pass runs in its own
 * native session, so no OpenCode session host is involved.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    yield* ports.command.register({
      name: COMMAND_NAME,
      description: COMMAND_DESCRIPTION,
      execute: (invocation) =>
        Effect.gen(function* () {
          const reply = makeCommandReply(ports.session, invocation);
          yield* Cli.run(invocation.prompt.text, { notify: reply.notify }, ports.cwd).pipe(
            Effect.provide(Live),
            Effect.catch((message) => Effect.sync(() => reply.notify(message, 'error'))),
          );
          yield* reply.flush();
        }),
    });
    yield* ports.tool.add(createTool(ports));
  }),
);
