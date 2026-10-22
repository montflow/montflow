import { Effect } from 'effect';
import type { InteractionPort, ToastVariant } from '../../modules/ports/interaction/index.js';

/**
 * The dialog surface `@montflow/pi-interactive` used to carry. Same shape,
 * host-backed: every call resolves through `InteractionPort`, so a caller
 * written against the Pi widgets moves over without a rewrite.
 */
export interface Dialogs {
  readonly select: (title: string, options: ReadonlyArray<string>) => Promise<string | undefined>;
  readonly confirm: (title: string, message: string) => Promise<boolean>;
  readonly input: (title: string, placeholder?: string) => Promise<string | undefined>;
  readonly alert: (title: string, message: string) => Promise<void>;
  readonly notify: (message: string, type?: ToastVariant) => void;
  /** Host dialogs already filter as you type, so search and select are the same call. */
  readonly searchSelect: (
    title: string,
    options: ReadonlyArray<string>,
  ) => Promise<string | undefined>;
}

/**
 * Build the promise-shaped dialog widgets over the interaction seam. The
 * host owns fuzzy matching, input scope, and cancellation, so these are thin
 * adapters rather than a second widget layer.
 * @param interaction - host dialog/toast seam
 * @returns promise-based dialogs
 */
export const makeDialogs = (interaction: InteractionPort): Dialogs => {
  const select = (title: string, options: ReadonlyArray<string>) =>
    interaction
      .select<string>({
        title,
        options: options.map((option) => ({ title: option, value: option })),
      })
      .pipe(Effect.runPromise);

  return {
    select,
    searchSelect: select,
    confirm: (title, message) =>
      interaction
        .confirm({ title, message })
        .pipe(Effect.runPromise)
        .then((answer) => answer ?? false),
    input: (title, placeholder) =>
      (placeholder === undefined
        ? interaction.prompt({ title })
        : interaction.prompt({ title, placeholder })
      ).pipe(Effect.runPromise),
    alert: (title, message) => interaction.alert({ title, message }).pipe(Effect.runPromise),
    notify: (message, type) => {
      void interaction.notify({ message, variant: type ?? 'info' }).pipe(Effect.runPromise);
    },
  };
};
