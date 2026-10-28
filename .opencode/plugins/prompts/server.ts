/**
 * Local dev wiring for `/mf-prompts list`.
 *
 * The real plugin entry (`packages/prompts/src/server.ts`) cannot load here:
 * it imports `@montflow/opencode`, whose ports build `@opencode/schema` values.
 * Those are pinned to `effect@4.0.0-rc.112`, while the running host provides
 * `effect@4.0.1`, which removed `Schema.isStartsWith` — the adapter throws at
 * import time. `apps/doctor` trips a second loader restriction, so this shim
 * talks to the prompt store directly instead of going through the CLI engines.
 *
 * Replies are posted back into the session: a server command has no toast
 * channel, so logging alone would make the command look like it did nothing.
 */
import * as NodeFileSystem from '../../../packages/prompts/node_modules/@effect/platform-node/dist/NodeFileSystem.js';
import * as NodePath from '../../../packages/prompts/node_modules/@effect/platform-node/dist/NodePath.js';
import { Effect, Layer, type Scope } from 'effect';
import { PromptStore } from '../../../packages/prompts/src/services/index.js';

/** Store directory segments under a working directory. */
const PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/** File-backed store with its platform dependencies hidden. */
const Live: Layer.Layer<PromptStore.PromptStore> = Layer.provide(
  PromptStore.Default,
  Layer.merge(NodeFileSystem.layer, NodePath.layer),
);

/** One slash-command invocation from the host. */
interface Invocation {
  readonly sessionID: string;
  readonly prompt: { readonly text: string };
  readonly delivery: string;
}

/** The slice of the host command editor this plugin writes through. */
interface CommandEditor {
  add(definition: {
    readonly name: string;
    readonly description?: string;
    readonly execute: (input: Invocation) => Effect.Effect<void, unknown>;
  }): void;
}

/** The slice of the host plugin context this plugin reads. */
interface Context {
  readonly location?: { readonly directory?: string | undefined } | undefined;
  readonly command: {
    transform(
      callback: (editor: CommandEditor) => void,
    ): Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never, Scope.Scope>;
  };
  readonly session: {
    prompt(input: {
      readonly sessionID: string;
      readonly text: string;
      readonly delivery: string;
    }): Effect.Effect<void, unknown>;
  };
}

/** Names in the store, one per line, or `--verbose` with the description. */
const listPrompts = (cwd: string, verbose: boolean): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const prompts = yield* store.list(cwd).pipe(Effect.mapError((error) => error.message));
    if (prompts.length === 0) {
      return `No prompts yet in ${cwd}/${PROMPTS_DIR.join('/')}. Create one with: mf-prompts create <name> --template "…"`;
    }
    return verbose
      ? prompts.map((prompt) => `${prompt.name} — ${prompt.description}`).join('\n')
      : prompts.map((prompt) => prompt.name).join('\n');
  }).pipe(Effect.provide(Live));

/** The reply for one `/mf-prompts` argument string. */
const reply = (args: string, cwd: string): Effect.Effect<string> => {
  const tokens = args.trim().split(/\s+/u).filter((token) => token !== '');
  const [verb] = tokens;
  const verbose = tokens.includes('--verbose');
  if (verb === undefined || verb === 'list') return listPrompts(cwd, verbose);
  return Effect.succeed(
    `This local shim only implements \`/mf-prompts list\` (got '${verb}'). Run the CLI for the rest: bun run --cwd packages/prompts cli ${verb} …`,
  );
};

/** Register `/mf-prompts`, surfacing every reply in the session. */
export default {
  id: 'prompts',
  effect: (context: Context) =>
    context.command.transform((editor) => {
      editor.add({
        name: 'mf-prompts',
        description:
          'List stored prompts. This local shim implements `list [--verbose]`; use the mf-prompts CLI for every other verb.',
        execute: (input: Invocation) =>
          reply(input.prompt.text, context.location?.directory ?? process.cwd()).pipe(
            Effect.catch((message: string) => Effect.succeed(message)),
            Effect.flatMap((text) =>
              context.session.prompt({
                sessionID: input.sessionID,
                text,
                delivery: input.delivery,
              }),
            ),
          ),
      });
    }),
};
