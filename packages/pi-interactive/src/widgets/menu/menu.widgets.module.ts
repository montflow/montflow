import { DynamicBorder, type ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { SelectList, Spacer, Text } from '@earendil-works/pi-tui';
import { Effect } from 'effect';
import { box } from '../batch/index.js';
import * as Title from '../title/index.js';
import * as Widget from '../widget/index.js';

/**
 * Minimal UI surface this widget needs: Pi's custom-component renderer.
 * Same shape as the other widgets, so any real `ctx.ui` is assignable
 * and fakes stay tiny.
 */
export interface MenuUi {
  readonly custom: ExtensionUIContext['custom'];
}

/** Optional display tuning for {@link menuDialog}. */
export interface MenuDisplay {
  /** Rows shown in the scrollable list. Defaults to 10. */
  readonly visibleRows?: number;
  /** Hint line under the list. Defaults to the keybinding help. */
  readonly hint?: string;
}

const DEFAULT_HINT = '↑↓ navigate • enter select • esc back';

/**
 * Single-choice menu dialog: heading, then an info panel, then options.
 * The panel is display-only session context (dependency status, current
 * model) — never a menu slot. Arrows/enter/escape drive the list.
 * TUI-only — callers fall back to Pi-native `select` elsewhere.
 * @param ui - Pi ui context with custom component support
 * @param title - dialog heading
 * @param options - menu choices
 * @param info - session info lines for the panel (absent = no panel)
 * @param display - visible rows and hint overrides
 * @returns Effect resolving to the picked option, or undefined on cancel (or when empty)
 */
export const menuDialog = (
  ui: MenuUi,
  title: string,
  options: ReadonlyArray<string>,
  info?: ReadonlyArray<string>,
  display?: MenuDisplay,
) =>
  Effect.gen(function* () {
    if (options.length === 0) return undefined;
    return yield* Effect.promise(() =>
      ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
        const visibleRows = display?.visibleRows ?? 10;
        const hint = display?.hint ?? DEFAULT_HINT;
        const border = (): DynamicBorder =>
          new DynamicBorder((line: string) => theme.fg('accent', line));
        const selectList = new SelectList(
          options.map((value) => ({ value, label: value })),
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
        let body = Widget.container().pipe(Widget.add(border()), Widget.add(Title.make(title)));
        if (info !== undefined && info.length > 0) {
          body = body.pipe(
            Widget.add(new Spacer(1)),
            Widget.add(
              box(
                theme,
                info.map((line) => new Text(line, 1, 0)),
              ),
            ),
            Widget.add(new Spacer(1)),
          );
        }
        body = body.pipe(
          Widget.add(selectList),
          Widget.add(new Text(hint, 1, 0)),
          Widget.add(border()),
        );
        const container = Widget.compile(body);
        let focused = true;
        return {
          get focused() {
            return focused;
          },
          set focused(value: boolean) {
            focused = value;
          },
          render: (width: number) => container.render(width),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            selectList.handleInput(data);
            tui.requestRender();
          },
        };
      }),
    );
  });

/**
 * Menu dialog as an Effect of the picked option.
 * @param ui - Pi ui context with custom component support
 * @param title - dialog heading
 * @param options - menu choices
 * @param info - session info lines for the panel (absent = no panel)
 * @param display - visible rows and hint overrides
 * @returns Effect resolving to the choice, or undefined when cancelled (or empty)
 */
export const menu = (
  ui: MenuUi,
  title: string,
  options: ReadonlyArray<string>,
  info?: ReadonlyArray<string>,
  display?: MenuDisplay,
) => menuDialog(ui, title, options, info, display);
