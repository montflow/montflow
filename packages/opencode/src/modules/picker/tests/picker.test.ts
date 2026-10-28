import { describe, expect, it, vi } from 'vitest';
import type { KeymapLayer } from '../../ports/grid-page/index.js';
import { registerPicker, type PickerContext } from '../picker.module.js';

interface Item {
  readonly name: string;
  readonly body: string;
  readonly about?: string;
}

/** Fake host context recording every call the picker makes. */
const makeContext = (options: {
  readonly directory?: string | undefined;
  readonly chosen?: (items: ReadonlyArray<Item>) => Item | undefined;
}) => {
  const layers: Array<KeymapLayer> = [];
  const toasts: Array<{ readonly message: string; readonly variant?: string }> = [];
  const inserted: string[] = [];
  const commands: Array<{ readonly name: string; readonly text: string }> = [];
  let editor: { insertText(text: string): void; gotoBufferEnd?(): void } | null = null;
  let route = 'session:ses_1';
  let searchQuery: string | undefined;

  const context: PickerContext = {
    location: options.directory === undefined ? undefined : { directory: options.directory },
    renderer: {
      get currentFocusedEditor() {
        return editor;
      },
      requestRender: () => {},
    },
    client: {
      session: {
        command: async (input) => {
          commands.push({ name: input.name, text: input.text });
        },
      },
    },
    keymap: {
      layer: (input) => {
        layers.push(input());
      },
    },
    ui: {
      dialog: {
        select: async <Value>(input: {
          readonly title: string;
          readonly options: ReadonlyArray<{
            readonly title: string;
            readonly value: Value;
            readonly description?: string;
          }>;
          readonly search?: (
            query: string,
            rows: ReadonlyArray<{
              readonly title: string;
              readonly value: Value;
              readonly description?: string;
            }>,
          ) => ReadonlyArray<{
            readonly title: string;
            readonly value: Value;
            readonly description?: string;
          }>;
        }): Promise<Value | undefined> => {
          const values = input.options.map((option) => option.value);
          // SAFETY: this fake only ever receives the picker's Item rows, which the test controls.
          const items = values as ReadonlyArray<Item>;
          const query = searchQuery;
          if (query !== undefined && input.search !== undefined) {
            const matched = input.search(query, input.options);
            const found = matched[0];
            // SAFETY: matched rows come from the same options array the picker supplied.
            return found?.value as Value | undefined;
          }
          // SAFETY: the chosen Item is one of the same rows the picker passed in.
          return options.chosen?.(items) as Value | undefined;
        },
      },
      toast: {
        show: (input) => {
          toasts.push(input);
        },
      },
      router: {
        current: () => {
          const [type, sessionID] = route.split(':');
          return sessionID === undefined || type === undefined
            ? { type: 'home' }
            : { type, sessionID };
        },
      },
    },
  };

  return {
    context,
    layers,
    toasts,
    inserted,
    commands,
    setEditor(next: typeof editor) {
      editor = next;
    },
    setRoute(next: string) {
      route = next;
    },
    setSearchQuery(next: string | undefined) {
      searchQuery = next;
    },
  };
};

const config = (
  loadItems: PickerContext extends never ? never : (cwd: string) => Promise<Item[]>,
) => ({
  commandName: 'mf-test',
  title: 'Tests',
  description: 'Pick a test',
  loadItems,
  formatItem: (item: Item) => {
    if (item.about === undefined) return { title: item.name, value: item };
    return { title: item.name, value: item, description: item.about };
  },
  getInsertText: (item: Item) => item.body,
  forwardNonListToServer: true,
});

/** The single command the picker registered. */
const commandOf = (layers: ReadonlyArray<KeymapLayer>) => {
  const command = layers[0]?.commands?.[0];
  if (command === undefined) throw new Error('picker registered no keymap command');
  return command;
};

/** Let the picker's zero-delay insertion timer run. */
const flushTimers = async (): Promise<void> => {
  await vi.runAllTimersAsync();
};

describe('registerPicker', () => {
  it('registers one palette slash command for the plugin', () => {
    const host = makeContext({ directory: '/repo', chosen: () => undefined });
    registerPicker(
      host.context,
      config(async () => []),
    );

    expect(host.layers).toHaveLength(1);
    const command = commandOf(host.layers);
    expect(command.slash?.name).toBe('mf-test');
    expect(command.palette).toBe(true);
    expect(command.id).toBe('mf-test.pick');
  });

  it('warns when the host has no project directory', async () => {
    const host = makeContext({ chosen: () => undefined });
    registerPicker(
      host.context,
      config(async () => []),
    );

    await commandOf(host.layers).run('list');

    expect(host.toasts).toStrictEqual([{ message: 'Open a project first.', variant: 'warning' }]);
  });

  it('warns when the store is empty', async () => {
    const host = makeContext({ directory: '/repo', chosen: () => undefined });
    registerPicker(
      host.context,
      config(async () => []),
    );

    await commandOf(host.layers).run('');

    expect(host.toasts).toStrictEqual([{ message: 'No items found.', variant: 'warning' }]);
  });

  it('maps items to dialog rows, descriptions included', async () => {
    const host = makeContext({
      directory: '/repo',
      chosen: (items) => items[0],
    });
    const select = vi.spyOn(host.context.ui.dialog, 'select');
    registerPicker(
      host.context,
      config(async () => [{ name: 'one', body: 'body', about: 'about' }]),
    );

    await commandOf(host.layers).run('list');

    expect(select.mock.calls[0]?.[0].options).toStrictEqual([
      { title: 'one', value: { name: 'one', body: 'body', about: 'about' }, description: 'about' },
    ]);
  });

  it('inserts the plugin text into the focused editor', async () => {
    vi.useFakeTimers();
    const host = makeContext({ directory: '/repo', chosen: (items) => items[0] });
    host.setEditor({ insertText: (text) => host.inserted.push(text) });
    registerPicker(
      host.context,
      config(async () => [{ name: 'one', body: 'pasted body' }]),
    );

    await commandOf(host.layers).run('list');
    await flushTimers();

    expect(host.inserted).toStrictEqual(['pasted body']);
    vi.useRealTimers();
  });

  it('retries until an editor appears, then inserts once', async () => {
    vi.useFakeTimers();
    const host = makeContext({ directory: '/repo', chosen: (items) => items[0] });
    registerPicker(
      host.context,
      config(async () => [{ name: 'one', body: 'late body' }]),
    );

    await commandOf(host.layers).run('list');
    await vi.advanceTimersByTimeAsync(80);
    host.setEditor({ insertText: (text) => host.inserted.push(text) });
    await flushTimers();

    expect(host.inserted).toStrictEqual(['late body']);
    vi.useRealTimers();
  });

  it('warns after every retry misses the composer', async () => {
    vi.useFakeTimers();
    const host = makeContext({ directory: '/repo', chosen: (items) => items[0] });
    registerPicker(
      host.context,
      config(async () => [{ name: 'one', body: 'lost body' }]),
    );

    await commandOf(host.layers).run('list');
    await flushTimers();

    expect(host.inserted).toStrictEqual([]);
    expect(host.toasts.at(-1)?.message).toContain('Could not reach the composer');
    vi.useRealTimers();
  });

  it('drops insertion when the route changed before the timer fired', async () => {
    vi.useFakeTimers();
    const host = makeContext({ directory: '/repo', chosen: (items) => items[0] });
    host.setEditor({ insertText: (text) => host.inserted.push(text) });
    registerPicker(
      host.context,
      config(async () => [{ name: 'one', body: 'wrong session' }]),
    );

    await commandOf(host.layers).run('list');
    host.setRoute('session:ses_2');
    await flushTimers();

    expect(host.inserted).toStrictEqual([]);
    vi.useRealTimers();
  });

  it('cancels a pending insertion on cleanup', async () => {
    vi.useFakeTimers();
    const host = makeContext({ directory: '/repo', chosen: (items) => items[0] });
    const cleanup = registerPicker(
      host.context,
      config(async () => [{ name: 'one', body: 'cancelled body' }]),
    );

    await commandOf(host.layers).run('list');
    cleanup();
    host.setEditor({ insertText: (text) => host.inserted.push(text) });
    await flushTimers();

    expect(host.inserted).toStrictEqual([]);
    vi.useRealTimers();
  });

  it('filters by description through the host search callback', async () => {
    vi.useFakeTimers();
    const host = makeContext({ directory: '/repo', chosen: () => undefined });
    host.setEditor({ insertText: (text) => host.inserted.push(text) });
    host.setSearchQuery('retry');
    registerPicker(
      host.context,
      config(async () => [
        { name: 'one', body: 'body one', about: 'mentions retry' },
        { name: 'two', body: 'body two', about: 'nothing here' },
      ]),
    );

    await commandOf(host.layers).run('list');
    await flushTimers();

    // Only the description match survives the filter, so it is inserted.
    expect(host.inserted).toStrictEqual(['body one']);
    expect(host.toasts).toStrictEqual([]);
    vi.useRealTimers();
  });

  it('returns every row for an empty query', async () => {
    vi.useFakeTimers();
    const host = makeContext({ directory: '/repo', chosen: () => undefined });
    host.setSearchQuery('');
    host.setEditor({ insertText: (text) => host.inserted.push(text) });
    registerPicker(
      host.context,
      config(async () => [
        { name: 'one', body: 'body one' },
        { name: 'two', body: 'body two' },
      ]),
    );

    await commandOf(host.layers).run('list');
    await flushTimers();

    // An empty query keeps display order, so the first row is chosen.
    expect(host.inserted).toStrictEqual(['body one']);
    vi.useRealTimers();
  });

  it('forwards a non-list argument to the server command', async () => {
    const host = makeContext({ directory: '/repo', chosen: () => undefined });
    registerPicker(
      host.context,
      config(async () => []),
    );

    await commandOf(host.layers).run('show one');

    expect(host.commands).toStrictEqual([{ name: 'mf-test', text: 'show one' }]);
  });

  it('warns instead of forwarding without an open session', async () => {
    const host = makeContext({ directory: '/repo', chosen: () => undefined });
    host.setRoute('home');
    registerPicker(
      host.context,
      config(async () => []),
    );

    await commandOf(host.layers).run('show one');

    expect(host.commands).toStrictEqual([]);
    expect(host.toasts).toStrictEqual([{ message: 'Open a session first', variant: 'warning' }]);
  });

  it('reports a store failure as an error toast', async () => {
    const host = makeContext({ directory: '/repo', chosen: () => undefined });
    registerPicker(
      host.context,
      config(async () => {
        throw new Error('store exploded');
      }),
    );

    await commandOf(host.layers).run('list');

    expect(host.toasts).toStrictEqual([{ message: 'store exploded', variant: 'error' }]);
  });
});
