import type { DialogSelectOption } from '../ports/interaction/index.js';
import type { KeymapLayer } from '../ports/grid-page/index.js';
import type { TuiCleanup } from '../ports/plugin-entry/index.js';

/** One row a plugin offers the shared picker. */
export interface PickerItem<T> {
  readonly title: string;
  readonly description?: string | undefined;
  readonly value: T;
}

/** The editor surface insertion writes through. */
export interface PickerEditor {
  insertText(text: string): void;
  gotoBufferEnd?(): void;
}

/** The slices of the host TUI context the picker reads. */
export interface PickerContext {
  readonly location?: { readonly directory?: string | undefined } | undefined;
  readonly renderer: {
    readonly currentFocusedEditor: PickerEditor | null;
    requestRender?(): void;
  };
  readonly client: {
    readonly session: {
      command(input: {
        readonly sessionID: string;
        readonly name: string;
        readonly text: string;
      }): Promise<void>;
    };
  };
  readonly keymap?: { layer(input: () => KeymapLayer): void } | undefined;
  readonly ui: {
    readonly dialog: {
      select<Value>(options: {
        readonly title: string;
        readonly placeholder?: string;
        readonly options: ReadonlyArray<DialogSelectOption<Value>>;
        readonly current?: Value;
      }): Promise<Value | undefined>;
    };
    readonly toast: {
      show(options: {
        readonly message: string;
        readonly variant?: 'info' | 'success' | 'warning' | 'error';
      }): void;
    };
    readonly router: {
      current(): { readonly type: string; readonly sessionID?: string | undefined };
    };
  };
}

/** What one plugin contributes to the shared picker. */
export interface PickerConfig<T> {
  /** Slash command the picker hangs off, shared with the server command. */
  readonly commandName: string;
  readonly title: string;
  readonly description: string;
  readonly group?: string;
  /** Read the plugin's store for the active project directory. */
  readonly loadItems: (cwd: string) => Promise<ReadonlyArray<T>>;
  /** Map one item to its dialog row. */
  readonly formatItem: (item: T) => PickerItem<T>;
  /** Text inserted into the composer for the chosen item. */
  readonly getInsertText: (item: T) => string;
  /**
   * Forward every non-list argument to the server command of the same name,
   * so one slash command owns both interactive and headless behaviour.
   */
  readonly forwardNonListToServer?: boolean;
}

/** Attempts before the picker admits it cannot reach the composer. */
const INSERT_ATTEMPTS = 5;
/** Delay between insertion retries; the host restores dialog focus first. */
const INSERT_RETRY_MS = 40;

/** Strip an optional description so the row matches the host's exact options. */
const toOption = <T>(item: PickerItem<T>): DialogSelectOption<T> => {
  if (item.description === undefined) return { title: item.title, value: item.value };
  return { title: item.title, value: item.value, description: item.description };
};

/** Human-readable reason for an unknown rejection. */
const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Register the shared picker behind a plugin's single slash command.
 *
 * `list` (or no argument) opens a select dialog over the plugin's store and
 * inserts the plugin-specific text into the composer. Any other argument is
 * forwarded to the server command when the plugin asks for forwarding.
 *
 * The host's `dialog.select` owns filtering, so the picker does not ship a
 * second search implementation; descriptions stay visible in each row.
 *
 * @param context - host TUI context slices the picker reads
 * @param config - plugin-specific store, mapping, and insertion
 * @returns cleanup that cancels pending insertion retries
 */
export const registerPicker = <T>(context: PickerContext, config: PickerConfig<T>): TuiCleanup => {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    cancelled = true;
    if (timer !== undefined) {
      // oxlint-disable-next-line montflow/no-timers -- cancelling the picker's own UI retry timer
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const warn = (message: string): void => {
    context.ui.toast.show({ message, variant: 'warning' });
  };

  const insertText = (text: string, route: string, attempt = 0): void => {
    if (cancelled) return;
    // oxlint-disable-next-line montflow/no-timers -- composer focus restore is UI timing, not Effect work
    timer = setTimeout(
      () => {
        if (cancelled) return;
        const current = context.ui.router.current();
        if (`${current.type}:${current.sessionID ?? ''}` !== route) return;
        const editor = context.renderer.currentFocusedEditor;
        if (editor !== null) {
          editor.insertText(text);
          editor.gotoBufferEnd?.();
          context.renderer.requestRender?.();
          return;
        }
        if (attempt < INSERT_ATTEMPTS - 1) {
          insertText(text, route, attempt + 1);
          return;
        }
        warn('Could not reach the composer — focus the prompt and try again.');
      },
      attempt === 0 ? 0 : INSERT_RETRY_MS,
    );
  };

  const pick = async (): Promise<void> => {
    const directory = context.location?.directory;
    if (directory === undefined) {
      warn('Open a project first.');
      return;
    }
    const route = context.ui.router.current();
    const routeKey = `${route.type}:${route.sessionID ?? ''}`;
    const items = await config.loadItems(directory);
    if (items.length === 0) {
      warn('No items found.');
      return;
    }
    const chosen = await context.ui.dialog.select<T>({
      title: config.title,
      placeholder: `Search ${config.title.toLowerCase()}`,
      options: items.map((item) => toOption(config.formatItem(item))),
    });
    if (chosen === undefined || cancelled) return;
    insertText(config.getInsertText(chosen), routeKey);
  };

  const forward = async (text: string): Promise<void> => {
    const route = context.ui.router.current();
    if (route.type !== 'session' || route.sessionID === undefined) {
      warn('Open a session first');
      return;
    }
    await context.client.session
      .command({ sessionID: route.sessionID, name: config.commandName, text })
      .catch((cause: unknown) =>
        context.ui.toast.show({ message: reasonOf(cause), variant: 'error' }),
      );
  };

  const report = async (run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (cause) {
      context.ui.toast.show({ message: reasonOf(cause), variant: 'error' });
    }
  };

  const layer = (): KeymapLayer => ({
    mode: 'global',
    commands: [
      {
        id: `${config.commandName}.pick`,
        title: config.description,
        description: config.description,
        group: config.group ?? config.title,
        palette: true,
        slash: { name: config.commandName, arguments: true },
        async run(input) {
          const args = (input ?? '').trim();
          const [verb] = args.split(/\s+/u);
          if (verb === undefined || verb === '' || verb === 'list') {
            await report(pick);
            return;
          }
          if (config.forwardNonListToServer === true) {
            await report(() => forward(args));
            return;
          }
          await report(pick);
        },
      },
    ],
  });

  // External TUI plugin contexts carry no slot claim, so the layer is
  // registered directly; the host scopes it to the plugin registration and
  // disposes it with the plugin.
  context.keymap?.layer(layer);

  return cancel;
};
