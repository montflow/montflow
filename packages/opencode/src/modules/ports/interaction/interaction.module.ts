import { Effect } from 'effect';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  readonly title?: string;
  readonly message: string;
  readonly variant?: ToastVariant;
  readonly duration?: number;
  readonly sessionID?: string;
}

export type AttentionWhen = 'always' | 'focused' | 'blurred';

export type AttentionSoundName =
  | 'default'
  | 'question'
  | 'permission'
  | 'error'
  | 'done'
  | 'subagent_done';

export type AttentionNotification = boolean | { readonly when?: AttentionWhen };

export type AttentionSound =
  | boolean
  | {
      readonly name?: AttentionSoundName;
      readonly volume?: number;
      readonly when?: AttentionWhen;
    };

export interface AttentionNotifyOptions {
  readonly title?: string;
  readonly message: string;
  readonly notification?: AttentionNotification;
  readonly sound?: AttentionSound;
}

export interface AttentionNotifyResult {
  readonly ok: boolean;
  readonly notification: boolean;
  readonly sound: boolean;
  readonly skipped?: string;
}

export type DialogSize = 'medium' | 'large' | 'xlarge';

export interface DialogOptions {
  readonly size?: DialogSize;
  readonly centered?: boolean;
}

export interface DialogAlertOptions {
  readonly title: string;
  readonly message: string;
}

export interface DialogConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly label?: {
    readonly confirm?: string;
    readonly cancel?: string;
  };
}

export interface DialogPromptOptions {
  readonly title: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly value?: string;
}

export interface DialogSelectOption<Value> {
  readonly title: string;
  readonly value: Value;
  readonly description?: string;
  readonly footer?: string;
  readonly category?: string;
  readonly disabled?: boolean;
}

export interface DialogSelectOptions<Value> {
  readonly title: string;
  readonly placeholder?: string;
  readonly options: readonly DialogSelectOption<Value>[];
  readonly current?: Value;
}

/**
 * The slice of the host TUI UI `InteractionPort` consumes. Structurally a
 * `Pick` of the host `UI`, so the real `ctx.ui` is assignable and fakes stay
 * tiny.
 */
export interface InteractionUi {
  readonly dialog: {
    select<Value>(options: DialogSelectOptions<Value>): Promise<Value | undefined>;
    confirm(options: DialogConfirmOptions): Promise<boolean | undefined>;
    prompt(options: DialogPromptOptions): Promise<string | undefined>;
    alert(options: DialogAlertOptions): Promise<void>;
  };
  readonly toast: {
    show(options: ToastOptions): void;
  };
}

/** The slice of the host TUI context `InteractionPort` needs. */
export interface InteractionContext {
  readonly ui?: InteractionUi | undefined;
  readonly attention?:
    | {
        notify(options: AttentionNotifyOptions): Promise<AttentionNotifyResult>;
      }
    | undefined;
}

/**
 * User-interaction seam. TUI-plugin only: dialogs and toasts resolve through
 * `ctx.ui`, notifications through `ctx.attention`.
 */
export interface InteractionPort {
  readonly select: <Value>(options: DialogSelectOptions<Value>) => Effect.Effect<Value | undefined>;
  readonly confirm: (options: DialogConfirmOptions) => Effect.Effect<boolean | undefined>;
  readonly prompt: (options: DialogPromptOptions) => Effect.Effect<string | undefined>;
  readonly alert: (options: DialogAlertOptions) => Effect.Effect<void>;
  readonly notify: (options: ToastOptions) => Effect.Effect<void>;
  readonly attention: (options: AttentionNotifyOptions) => Effect.Effect<AttentionNotifyResult>;
}

const unavailable = (): Error =>
  new Error('InteractionPort requires a TUI plugin context (ctx.ui / ctx.attention)');

/** Build the interaction seam over the host TUI context. */
export const makeInteractionPort = (context: InteractionContext): InteractionPort => ({
  select: (options) => {
    const ui = context.ui;
    if (ui === undefined) return Effect.die(unavailable());
    return Effect.promise(() => ui.dialog.select(options));
  },
  confirm: (options) => {
    const ui = context.ui;
    if (ui === undefined) return Effect.die(unavailable());
    return Effect.promise(() => ui.dialog.confirm(options));
  },
  prompt: (options) => {
    const ui = context.ui;
    if (ui === undefined) return Effect.die(unavailable());
    return Effect.promise(() => ui.dialog.prompt(options));
  },
  alert: (options) => {
    const ui = context.ui;
    if (ui === undefined) return Effect.die(unavailable());
    return Effect.promise(() => ui.dialog.alert(options));
  },
  notify: (options) => {
    const ui = context.ui;
    if (ui === undefined) return Effect.die(unavailable());
    return Effect.sync(() => {
      ui.toast.show(options);
    });
  },
  attention: (options) => {
    const attention = context.attention;
    if (attention === undefined) return Effect.die(unavailable());
    return Effect.promise(() => attention.notify(options));
  },
});
