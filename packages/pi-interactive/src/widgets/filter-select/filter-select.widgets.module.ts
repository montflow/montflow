import { DynamicBorder, type ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { Container, Input, Key, SelectList, Text, matchesKey } from '@earendil-works/pi-tui';
import { Effect } from 'effect';
import * as Title from '../title/index.js';
import * as Widget from '../widget/index.js';

/**
 * Minimal UI surface this widget needs: Pi's custom-component renderer.
 * Mirrors Pi's own narrowing for dialogs, so any real `ctx.ui` is
 * assignable and fakes stay tiny.
 */
export interface CustomUi {
  readonly custom: ExtensionUIContext['custom'];
}

/** Live filter-as-you-type picker signature (matches the `searchSelect` port). */
export type SearchSelect = (title: string, options: string[]) => Effect.Effect<string | undefined>;

/** Optional display tuning for {@link filterSelectDialog}. */
export interface FilterSelectOptions {
  /** Rows shown in the scrollable list. Defaults to 10. */
  readonly visibleRows?: number;
  /** Hint line under the list. Defaults to the keybinding help. */
  readonly hint?: string;
}

/**
 * Subsequence fuzzy match: every query character appears in the label in
 * order (not necessarily consecutive). Case-insensitive.
 * @param label - option label to test
 * @param query - user filter text
 * @returns Effect resolving to true when the label matches
 */
export const matchesFilter = (label: string, query: string) =>
  Effect.sync(() => {
    const haystack = label.toLowerCase();
    const needle = query.trim().toLowerCase();
    if (needle === '') return true;
    let position = 0;
    for (const char of needle) {
      position = haystack.indexOf(char, position);
      if (position === -1) return false;
      position++;
    }
    return true;
  });

/**
 * Narrow an option list by subsequence match, preserving order.
 * @param options - full option list
 * @param query - user filter text
 * @returns Effect resolving to matching options (all of them when blank)
 */
export const filterOptions = (options: ReadonlyArray<string>, query: string) =>
  Effect.gen(function* () {
    if (query.trim() === '') return options;
    const kept: Array<string> = [];
    for (const option of options) {
      if (yield* matchesFilter(option, query)) kept.push(option);
    }
    return kept;
  });

const DEFAULT_HINT = '↑↓ navigate • type to filter • enter select • esc cancel';

/**
 * Live filter-as-you-type picker: an input row over a scrollable list.
 * Typing narrows by subsequence match; arrows/enter/escape drive the list.
 * TUI-only — callers fall back to input+select elsewhere.
 * @param ui - Pi ui context with custom component support
 * @param title - dialog title
 * @param options - full option list
 * @param display - visible rows and hint overrides
 * @returns Effect resolving to the picked option, or undefined on cancel
 */
export const filterSelectDialog = (
  ui: CustomUi,
  title: string,
  options: ReadonlyArray<string>,
  display?: FilterSelectOptions,
) =>
  Effect.promise(() =>
    ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
      const visibleRows = display?.visibleRows ?? 10;
      const hint = display?.hint ?? DEFAULT_HINT;
      const container = new Container();
      // The shell threads the live root: the list node below is swapped on
      // every keystroke, so the dialog keeps owning the root for surgery.
      const shell = Widget.make(container);
      const border = (): DynamicBorder =>
        new DynamicBorder((line: string) => theme.fg('accent', line));
      const query = new Input();
      query.focused = true;
      const buildList = (items: ReadonlyArray<string>): SelectList => {
        const selectList = new SelectList(
          items.map((value) => ({ value, label: value })),
          visibleRows,
          {
            selectedPrefix: (text) => theme.fg('accent', text),
            selectedText: (text) => theme.fg('accent', text),
            description: (text) => theme.fg('muted', text),
            scrollInfo: (text) => theme.fg('dim', text),
            noMatch: (text) => theme.fg('warning', text),
          },
        );
        selectList.onSelect = (item) => done(item.value);
        selectList.onCancel = () => done(undefined);
        return selectList;
      };
      let current = buildList(options);
      shell.pipe(
        Widget.add(border()),
        Widget.add(Title.make(title)),
        Widget.add(query),
        Widget.add(current),
        Widget.add(new Text(hint, 1, 0)),
        Widget.add(border()),
      );
      const LIST_INDEX = 3;
      return {
        get focused() {
          return query.focused;
        },
        set focused(value: boolean) {
          query.focused = value;
        },
        render: (width: number) => container.render(width),
        invalidate: () => container.invalidate(),
        handleInput: (data: string) => {
          if (
            matchesKey(data, Key.up) ||
            matchesKey(data, Key.down) ||
            matchesKey(data, Key.enter) ||
            matchesKey(data, Key.escape)
          ) {
            current.handleInput(data);
          } else {
            query.handleInput(data);
            const filtered = Effect.runSync(filterOptions(options, query.getValue()));
            const next = buildList(filtered);
            container.children.splice(LIST_INDEX, 1, next);
            current = next;
          }
          tui.requestRender();
        },
      };
    }),
  );

/**
 * Filter-select picker as an Effect of the picked option.
 * @param ui - Pi ui context with custom component support
 * @param title - dialog title
 * @param options - full option list
 * @param display - visible rows and hint overrides
 * @returns Effect resolving to the choice, or undefined when cancelled
 */
export const filterSelect = (
  ui: CustomUi,
  title: string,
  options: ReadonlyArray<string>,
  display?: FilterSelectOptions,
) => filterSelectDialog(ui, title, options, display);

/**
 * TUI-only picker factory for command registration: returns a
 * `searchSelect` closure when the session runs in the TUI, else undefined
 * so callers fall back to Pi-native input+select.
 * @param ctx - Pi command context carrying ui and mode
 * @returns Effect resolving to the picker closure, or undefined outside the TUI
 */
export const searchSelectFor = (ctx: { readonly ui: CustomUi; readonly mode: string }) =>
  Effect.sync(() =>
    ctx.mode === 'tui'
      ? (title: string, dialogOptions: string[]) => filterSelectDialog(ctx.ui, title, dialogOptions)
      : undefined,
  );
