import { DynamicBorder, type ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { Container, Input, Key, SelectList, Text, matchesKey } from '@earendil-works/pi-tui';
import { Effect } from 'effect';
import { matchesFilter } from '../filter-select/index.js';
import * as Title from '../title/index.js';
import * as Widget from '../widget/index.js';

/**
 * Minimal UI surface this widget needs: Pi's custom-component renderer.
 * Same shape as `PiInteractive.CustomUi`, so any real `ctx.ui` is
 * assignable and fakes stay tiny.
 */
export interface ModelPickerUi {
  readonly custom: ExtensionUIContext['custom'];
}

/**
 * One model offered by the picker: `provider/model-id` plus the
 * current-session marker. Same shape as the `ModelOption` in
 * `@montflow/pi-skills` flows, so callers pass options straight through.
 */
export interface ModelOption {
  readonly label: string;
  readonly current: boolean;
}

/** One row in the picker list: model label plus display text. */
export interface PickerItem {
  readonly value: string;
  readonly label: string;
}

/** Optional display tuning for {@link modelPickerDialog}. */
export interface ModelPickerDisplay {
  /** Rows shown in the scrollable list. Defaults to 10. */
  readonly visibleRows?: number;
  /** Hint line under the list. Defaults to the keybinding help. */
  readonly hint?: string;
  /** Heading above the search bar. Defaults to `'Model picker'`. */
  readonly title?: string;
  /** Small optional subheading under the title. Absent by default. */
  readonly subtitle?: string;
}

/** Display text for a row. The current model carries a short marker. */
export const displayModel = (option: ModelOption) =>
  Effect.sync(() => (option.current ? `${option.label} (current)` : option.label));

/**
 * The current session model, if any.
 * @param models - picker options
 * @returns Effect resolving to the current option, or undefined when none is marked
 */
export const currentOption = (models: ReadonlyArray<ModelOption>) =>
  Effect.sync(() => models.find((option) => option.current));

/**
 * Rows for the picker list: the current session model pinned first,
 * everything else in caller order.
 * @param models - picker options
 * @returns Effect resolving to list items with model labels as values
 */
export const pickerItems = (models: ReadonlyArray<ModelOption>) =>
  Effect.gen(function* () {
    const current = yield* currentOption(models);
    const rest = models.filter((option) => option !== current);
    const ordered = current === undefined ? rest : [current, ...rest];
    const rows: Array<PickerItem> = [];
    for (const option of ordered) {
      rows.push({ value: option.label, label: yield* displayModel(option) });
    }
    return rows;
  });

const defaultHint = () => `↑↓ navigate • type to filter • enter select • esc cancel`;

/**
 * Model picker dialog: a search bar over a scrollable model list. The
 * current session model is pinned first and highlighted, so plain enter
 * keeps it. Typing narrows by subsequence match; arrows/enter/escape
 * drive the list. TUI-only — callers fall back to input+select elsewhere.
 * @param ui - Pi ui context with custom component support
 * @param models - picker options (current first when marked)
 * @param display - title, subtitle, visible rows, and hint overrides
 * @returns Effect resolving to the picked model label, or undefined on cancel (or when empty)
 */
export const modelPickerDialog = (
  ui: ModelPickerUi,
  models: ReadonlyArray<ModelOption>,
  display?: ModelPickerDisplay,
) =>
  Effect.gen(function* () {
    const items = yield* pickerItems(models);
    if (items.length === 0) return undefined;
    return yield* Effect.promise(() =>
      ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
        const visibleRows = display?.visibleRows ?? 10;
        const hint = display?.hint ?? defaultHint();
        const container = new Container();
        // The shell threads the live root: the list node below is swapped on
        // every keystroke, so the dialog keeps owning the root for surgery.
        const shell = Widget.make(container);
        const border = (): DynamicBorder =>
          new DynamicBorder((line: string) => theme.fg('accent', line));
        const query = new Input();
        query.focused = true;
        let chrome = shell.pipe(
          Widget.add(border()),
          Widget.add(Title.make(display?.title ?? 'Model picker')),
        );
        if (display?.subtitle !== undefined)
          chrome = chrome.pipe(Widget.add(new Text(theme.fg('muted', display.subtitle), 1, 0)));
        chrome = chrome.pipe(Widget.add(query));
        const listIndex = container.children.length;
        const buildList = (rows: ReadonlyArray<PickerItem>): SelectList => {
          const selectList = new SelectList(
            rows.map((row) => ({ value: row.value, label: row.label })),
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
        let selectList = buildList(items);
        chrome.pipe(Widget.add(selectList), Widget.add(new Text(hint, 1, 0)), Widget.add(border()));
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
              selectList.handleInput(data);
            } else {
              query.handleInput(data);
              const needle = query.getValue();
              const filtered = items.filter((item) =>
                matchesFilter(item.value, needle).pipe(Effect.runSync),
              );
              const next = buildList(filtered);
              container.children.splice(listIndex, 1, next);
              selectList = next;
            }
            tui.requestRender();
          },
        };
      }),
    );
  });

/**
 * Model picker as an Effect of the picked model label.
 * @param ui - Pi ui context with custom component support
 * @param models - picker options (current first when marked)
 * @param display - title, subtitle, visible rows, and hint overrides
 * @returns Effect resolving to the label, or undefined when cancelled (or empty)
 */
export const pickModel = (
  ui: ModelPickerUi,
  models: ReadonlyArray<ModelOption>,
  display?: ModelPickerDisplay,
) => modelPickerDialog(ui, models, display);
