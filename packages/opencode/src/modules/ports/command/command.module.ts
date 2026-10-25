import type { Command } from '@opencode/plugin/effect';
import type { CommandDefinition, CommandDomain } from '@opencode/plugin/effect/command';
import { Effect, type Scope } from 'effect';

/**
 * The slice of the host server context `CommandPort` needs. Narrowed so the
 * real `Plugin.Context` is assignable and fakes stay tiny: `list` reads only
 * the `data` half of the host `CommandListOutput` envelope.
 */
export interface CommandContext {
  readonly command?:
    | {
        readonly transform: CommandDomain['transform'];
        readonly list: () => Effect.Effect<{ readonly data: ReadonlyArray<Command.Info> }, unknown>;
      }
    | undefined;
}

/**
 * Slash-command registration seam. Server-plugin only: `register` appends a
 * command through the host command transform; `list` reads the live registry.
 */
export interface CommandPort {
  readonly register: (definition: CommandDefinition) => Effect.Effect<void, never, Scope.Scope>;
  readonly list: () => Effect.Effect<readonly Command.Info[]>;
}

const unavailable = (): Error =>
  new Error('CommandPort requires a server plugin context (ctx.command)');

/** Build the command seam over the host command domain. */
export const makeCommandPort = (context: CommandContext): CommandPort => ({
  register: (definition) => {
    const command = context.command;
    if (command === undefined) return Effect.die(unavailable());
    return Effect.asVoid(command.transform((editor) => editor.add(definition)));
  },
  list: () => {
    const command = context.command;
    if (command === undefined) return Effect.die(unavailable());
    return command.list().pipe(
      Effect.orDie,
      Effect.map((output) => output.data),
    );
  },
});
