import { Effect } from 'effect';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

/**
 * Minimal UI surface these wrappers need. Mirrors Pi's own narrowing for
 * tools (`Pick<ExtensionUIContext, "select" | "confirm" | "input" | "notify">`),
 * so any real `ctx.ui` is assignable and fakes stay tiny.
 */
export type PiUi = Pick<ExtensionContext['ui'], 'select' | 'confirm' | 'input' | 'notify'>;

/**
 * Fire-and-forget notification as an infallible Effect.
 * @param ui - Pi ui context
 * @param message - text to show
 * @param type - severity
 * @returns Effect completing once the notification is queued
 */
export const notify = (ui: PiUi, message: string, type?: 'info' | 'warning' | 'error') =>
  Effect.sync(() => {
    ui.notify(message, type);
  });

/**
 * Confirmation dialog as an Effect of the user's answer.
 * @param ui - Pi ui context
 * @param title - dialog title
 * @param message - dialog body
 * @returns Effect resolving to true when confirmed
 */
export const confirm = (ui: PiUi, title: string, message: string) =>
  Effect.promise(() => ui.confirm(title, message));

/**
 * Single-choice selector as an Effect of the picked option.
 * @param ui - Pi ui context
 * @param title - dialog title
 * @param options - choices to present
 * @returns Effect resolving to the choice, or undefined when cancelled
 */
export const select = (ui: PiUi, title: string, options: string[]) =>
  Effect.promise(() => ui.select(title, options));

/**
 * Text input dialog as an Effect of the entered value.
 * @param ui - Pi ui context
 * @param title - dialog title
 * @param placeholder - hint text
 * @returns Effect resolving to the value, or undefined when cancelled
 */
export const input = (ui: PiUi, title: string, placeholder?: string) =>
  Effect.promise(() => ui.input(title, placeholder));

/**
 * Send a message into the current session as an Effect.
 * @param api - Pi extension API
 * @param args - same arguments as `pi.sendUserMessage`
 * @returns Effect completing once the message is queued
 */
export const sendUserMessage = (
  api: Pick<ExtensionAPI, 'sendUserMessage'>,
  ...args: Parameters<ExtensionAPI['sendUserMessage']>
) =>
  Effect.sync(() => {
    api.sendUserMessage(...args);
  });

/**
 * Run an Effect from a command handler, notifying on failure.
 * @param ctx - Pi context for failure notifications
 * @param self - Effect to run
 * @returns Promise settling once the Effect is done
 */
export const runAndNotify = <A, E>(ctx: { readonly ui: PiUi }, self: Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.matchEffect(self, {
      onFailure: (error) => notify(ctx.ui, String(error), 'error'),
      onSuccess: () => Effect.sync(() => {}),
    }),
  );

/**
 * Maps a command failure to notification severity. Return `'info'` for benign
 * aborts such as user cancellation, `'error'` (or `'warning'`) otherwise.
 */
export type CommandFailureSeverity<E> = (error: E) => 'info' | 'warning' | 'error';

const commandHandler =
  <E>(
    run: (args: string, ctx: ExtensionCommandContext) => Effect.Effect<void, E>,
    severity: CommandFailureSeverity<E>,
  ) =>
  (args: string, ctx: ExtensionCommandContext): Promise<void> =>
    Effect.runPromise(
      Effect.matchEffect(run(args, ctx), {
        onFailure: (error) => notify(ctx.ui, String(error), severity(error)),
        onSuccess: () => Effect.sync(() => {}),
      }),
    );

/**
 * Register a slash command whose handler is an Effect workflow.
 * @param api - Pi extension API
 * @param name - command name without the leading slash
 * @param description - help text shown for the command
 * @param run - Effect workflow receiving args and command context
 * @returns Nothing
 */
export const registerCommand = <E>(
  api: Pick<ExtensionAPI, 'registerCommand'>,
  name: string,
  description: string,
  run: (args: string, ctx: ExtensionCommandContext) => Effect.Effect<void, E>,
): void => {
  api.registerCommand(name, {
    description,
    handler: commandHandler(run, () => 'error'),
  });
};

/**
 * Register a slash command as an Effect, for composition into larger load
 * programs. Same handler semantics as {@link registerCommand}; failures
 * notify at the mapped severity.
 * @param api - Pi extension API
 * @param name - command name without the leading slash
 * @param description - help text shown for the command
 * @param run - Effect workflow receiving args and command context
 * @param severity - maps failures to notification severity
 * @returns Effect completing once the command is registered
 */
export const registerCommandEffect = <E>(
  api: Pick<ExtensionAPI, 'registerCommand'>,
  name: string,
  description: string,
  run: (args: string, ctx: ExtensionCommandContext) => Effect.Effect<void, E>,
  severity: CommandFailureSeverity<E> = () => 'error',
): Effect.Effect<void> =>
  Effect.sync(() => {
    api.registerCommand(name, {
      description,
      handler: commandHandler(run, severity),
    });
  });
