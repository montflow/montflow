import { Duration, Effect } from 'effect';

/**
 * Shared TUI picker helper for montflow plugins.
 * Uses host APIs: ui.dialog.select, keymap.layer, renderer.currentFocusedEditor.insertText (with retry).
 */

/** One entry the dialog renders for a picker. */
interface DialogOption<T> {
  title: string;
  value: T;
  description?: string;
}

export interface PickerItem<T> {
  title: string;
  description?: string | undefined;
  value: T;
}

export interface PickerConfig<T> {
  readonly commandName: string;
  readonly title: string;
  readonly description: string;
  readonly group?: string;
  readonly loadItems: (cwd: string) => Promise<ReadonlyArray<T>>;
  readonly formatItem: (item: T) => PickerItem<T>;
  readonly getInsertText: (item: T) => string;
  readonly search?: (
    query: string,
    items: ReadonlyArray<PickerItem<T>>,
  ) => ReadonlyArray<PickerItem<T>>;
  readonly forwardNonListToServer?: boolean;
  /**
   * Rewrite non-list arguments before forwarding them to the server. Return
   * undefined to cancel the invocation, for example when a dialog is dismissed.
   */
  readonly prepareForward?: (
    args: string,
    context: PickerContext,
  ) => Promise<string | undefined> | string | undefined;
  /**
   * Resolve the text inserted after a pick. Use it when the text depends on
   * dialogs, such as filling a template's variables. Return undefined to cancel.
   */
  readonly resolveInsertText?: (
    item: T,
    context: PickerContext,
  ) => Promise<string | undefined> | string | undefined;
}

export interface PickerContext {
  readonly location?: { readonly directory?: string | undefined } | undefined;
  readonly renderer: {
    readonly currentFocusedEditor?: {
      insertText?(text: string): void;
      gotoBufferEnd?(): void;
    } | null;
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
  readonly keymap: {
    layer(
      factory: () => {
        readonly mode?: string;
        readonly commands: ReadonlyArray<{
          readonly id: string;
          readonly title: string;
          readonly description?: string;
          readonly group?: string;
          readonly palette?: boolean;
          readonly slash?: { readonly name: string; readonly arguments?: boolean };
          readonly run: (input?: string) => void | Promise<void>;
        }>;
      },
    ): void;
  };
  readonly ui: {
    readonly dialog: {
      select<Value>(options: {
        readonly title: string;
        readonly placeholder?: string;
        readonly options: ReadonlyArray<{
          readonly title: string;
          readonly value: Value;
          readonly description?: string;
        }>;
        readonly search?: (
          query: string,
          options: ReadonlyArray<{
            readonly title: string;
            readonly value: Value;
            readonly description?: string;
          }>,
        ) => ReadonlyArray<{
          readonly title: string;
          readonly value: Value;
          readonly description?: string;
        }>;
      }): Promise<Value | undefined>;
      prompt(options: {
        readonly title: string;
        readonly description?: string;
        readonly placeholder?: string;
        readonly value?: string;
      }): Promise<string | undefined>;
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

const insertText = async (context: PickerContext, text: string, attempt = 0): Promise<void> => {
  if (attempt > 0) await Effect.sleep(Duration.millis(40)).pipe(Effect.runPromise);
  const editor = context.renderer.currentFocusedEditor;
  if (editor?.insertText !== undefined) {
    editor.insertText(text);
    editor.gotoBufferEnd?.();
    context.renderer.requestRender?.();
    return;
  }
  if (attempt < 4) {
    await insertText(context, text, attempt + 1);
    return;
  }
  context.ui.toast.show({
    message: 'Could not reach the composer — focus the prompt and try again.',
    variant: 'warning',
  });
};

const defaultSearch = <T>(
  query: string,
  items: ReadonlyArray<PickerItem<T>>,
): ReadonlyArray<PickerItem<T>> => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return items;
  return items.filter(
    (entry) =>
      entry.title.toLowerCase().includes(needle) ||
      (entry.description ?? '').toLowerCase().includes(needle),
  );
};

export const registerPicker = <T>(context: PickerContext, config: PickerConfig<T>): void => {
  const pick = async (): Promise<void> => {
    const directory = context.location?.directory ?? process.cwd();
    const items = await config.loadItems(directory);
    if (items.length === 0) {
      context.ui.toast.show({
        message: 'No items found.',
        variant: 'warning',
      });
      return;
    }
    const pickerItems = items.map((item) => config.formatItem(item));
    const searchFn = config.search ?? defaultSearch;
    const chosen = await context.ui.dialog.select<T>({
      title: config.title,
      placeholder: `Search ${config.title.toLowerCase()}`,
      options: pickerItems.map((item) => {
        const opt: DialogOption<T> = { title: item.title, value: item.value };
        if (item.description !== undefined) opt.description = item.description;
        return opt;
      }),
      search: (query, all) => {
        const mapped: ReadonlyArray<PickerItem<T>> = all.map((opt) => {
          const item: PickerItem<T> = { title: opt.title, value: opt.value };
          if (opt.description !== undefined) item.description = opt.description;
          return item;
        });
        return searchFn(query, mapped).map((item) => {
          const opt: DialogOption<T> = { title: item.title, value: item.value };
          if (item.description !== undefined) opt.description = item.description;
          return opt;
        });
      },
    });
    if (chosen === undefined) return;
    const text =
      config.resolveInsertText === undefined
        ? config.getInsertText(chosen)
        : await config.resolveInsertText(chosen, context);
    if (text !== undefined) insertText(context, text);
  };

  const forward = async (text: string): Promise<void> => {
    const route = context.ui.router.current();
    if (route.type !== 'session' || route.sessionID === undefined) {
      context.ui.toast.show({ message: 'Open a session first', variant: 'warning' });
      return;
    }
    await context.client.session
      .command({ sessionID: route.sessionID, name: config.commandName, text })
      .catch((cause: unknown) =>
        context.ui.toast.show({
          message: cause instanceof Error ? cause.message : String(cause),
          variant: 'error',
        }),
      );
  };

  context.keymap.layer(() => ({
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
            await pick();
            return;
          }
          if (config.forwardNonListToServer) {
            const prepared =
              config.prepareForward === undefined
                ? args
                : await config.prepareForward(args, context);
            if (prepared !== undefined) await forward(prepared);
            return;
          }
          await pick();
        },
      },
    ],
  }));
};
