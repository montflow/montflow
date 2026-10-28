/**
 * Shared TUI picker helper for montflow plugins.
 * Uses host APIs: ui.dialog.select, keymap.layer, renderer.currentFocusedEditor.insertText (with retry).
 */

export interface PickerItem<T = unknown> {
  readonly title: string;
  readonly description?: string | undefined;
  readonly value: T;
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
}

// SAFETY: host session.command returns opaque payload; callers do not read fields here.
export interface SessionCommandResult extends Record<string, unknown> {}

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
      }): Promise<SessionCommandResult>;
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

const scheduleInsert = (callback: () => void, delayMs: number): void => {
  // SAFETY: retry scheduling is a UI timing concern in the TUI context; host expects direct timers here and tests control via context.
  // oxlint-disable-next-line montflow/no-timers -- UI retry timing required by host API
  setTimeout(callback, delayMs);
};

const insertText = (context: PickerContext, text: string, attempt = 0): void => {
  scheduleInsert(
    () => {
      const editor = context.renderer.currentFocusedEditor;
      if (editor?.insertText !== undefined) {
        editor.insertText(text);
        editor.gotoBufferEnd?.();
        context.renderer.requestRender?.();
        return;
      }
      if (attempt < 4) {
        insertText(context, text, attempt + 1);
        return;
      }
      context.ui.toast.show({
        message: 'Could not reach the composer — focus the prompt and try again.',
        variant: 'warning',
      });
    },
    attempt === 0 ? 0 : 40,
  );
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
        if (item.description !== undefined) {
          return { title: item.title, value: item.value, description: item.description };
        }
        return { title: item.title, value: item.value };
      }),
      search: (query, all) => {
        const mapped: ReadonlyArray<PickerItem<T>> = all.map((opt) => {
          if (opt.description !== undefined) {
            return { title: opt.title, value: opt.value, description: opt.description };
          }
          return { title: opt.title, value: opt.value };
        });
        const result = searchFn(query, mapped);
        return result.map((item) => {
          if (item.description !== undefined) {
            return { title: item.title, value: item.value, description: item.description };
          }
          return { title: item.title, value: item.value };
        });
      },
    });
    if (chosen === undefined) return;
    insertText(context, config.getInsertText(chosen));
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
            await forward(args);
            return;
          }
          await pick();
        },
      },
    ],
  }));
};
