import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { defineTool, entry, type ServerPorts } from '@montflow/opencode';
import { Effect, Layer, Schema } from 'effect';
import * as Cli from './apps/cli/index.js';
import { startReview } from './apps/dispatch/index.js';
import { ProfileProbe, ReviewStore } from './services/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'reviews';

/** Slash command registered by the server plugin (invoke as `/mf-reviews`). */
export const COMMAND_NAME = Cli.COMMAND_NAME;

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION = Cli.COMMAND_DESCRIPTION;

/** File-backed store with its platform dependencies hidden. */
const StoreLive: Layer.Layer<ReviewStore.ReviewStore> = Layer.provide(
  ReviewStore.Default,
  Layer.merge(NodeFileSystem.layer, NodePath.layer),
);

/** Every service the headless CLI needs; the probe stays optional at runtime. */
const Live: Layer.Layer<ReviewStore.ReviewStore | ProfileProbe.ProfileProbe> = Layer.merge(
  StoreLive,
  ProfileProbe.Default,
);

/** Log a command result where the server host can see it. */
const notify = (message: string): void => {
  Effect.logInfo(message).pipe(Effect.runSync);
};

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
      model: Schema.optional(Schema.String),
    }),
    execute: (input) =>
      Effect.gen(function* () {
        const result = yield* startReview(ports, { root: ports.cwd, ...input }).pipe(
          Effect.provide(StoreLive),
        );
        return `Started review '${result.series}' in session ${result.sessionId}.`;
      }),
  });

/**
 * OpenCode server plugin entry: registers `/mf-reviews` for the headless CLI
 * and `review_create` for agentic dispatch. A review pass runs in its own
 * native session, so no Pi session host is involved.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    yield* ports.command.register({
      name: COMMAND_NAME,
      description: COMMAND_DESCRIPTION,
      execute: (invocation) =>
        Cli.run(invocation.prompt.text, { notify }, ports.cwd).pipe(
          Effect.provide(Live),
          Effect.catch((message) => Effect.sync(() => notify(message))),
        ),
    });
    yield* ports.tool.add(createTool(ports));
  }),
);
