import { For, Show } from 'solid-js';
import type { Skills } from '../services/index.js';
import { KeybindBanner } from './keybind-banner.js';
import { Keybinds } from './keybinds.js';
import { Loader, type LoaderVariant } from './loader.js';
import { palette } from './palette.js';

export interface SkillsPanelProps {
  readonly loading: boolean;
  readonly installing: boolean;
  readonly loadingVariant?: LoaderVariant | undefined;
  readonly installed: boolean;
  readonly rows: ReadonlyArray<Skills.SkillSummary>;
  readonly highlight: number;
  readonly total: number;
  readonly query: string;
  readonly searching: boolean;
  readonly capacity: number;
  readonly selected: boolean;
}

/**
 * Skills content that FILLS the panel: the loader, missing-extension
 * note, empty note, and filterable list all share the same flex chrome,
 * so loading, filtering, install state, and search toggling never shift
 * the grid. The search line stays reserved (blank when idle); the list
 * region grows to absorb slack above a one-line footer pinned to the
 * panel bottom. The footer shows contextual keybinds plus the row
 * count only while selected — unselected panels render the same line
 * blank, so selecting never moves anything. The list arrives
 * pre-windowed (capped at `capacity` rows) — this panel only renders.
 * `capacity` documents the caller's windowing contract; height comes
 * from the grid, never from row counts. `loadingVariant` narrates the
 * boot stage (`extension` for the runtime import, `skills` for the list
 * read) while `loading` is true.
 * @param props - load state, visible rows, highlight, query, capacity, selection
 * @returns skills content element
 */
export const SkillsPanel = (props: SkillsPanelProps) => {
  return (
    <Show
      when={!props.loading && !props.installing}
      fallback={
        <Loader variant={props.installing ? 'installing' : (props.loadingVariant ?? 'skills')} />
      }
    >
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <box flexShrink={0}>
          <Show
            when={props.installed && (props.searching || props.query !== '')}
            fallback={<text> </text>}
          >
            <text style={{ fg: palette.accent }}>/{props.query}</text>
          </Show>
        </box>
        <box flexDirection="column" flexGrow={1} minHeight={0}>
          <Show
            when={props.installed}
            fallback={
              <box
                flexGrow={1}
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap={1}
              >
                <text style={{ fg: palette.dim }}>Skills extension not installed.</text>
                <Show when={props.selected} fallback={<text> </text>}>
                  <text style={{ fg: palette.accent }}>press ⏎ to install</text>
                </Show>
              </box>
            }
          >
            <Show
              when={props.total > 0}
              fallback={
                <box
                  flexGrow={1}
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  gap={1}
                >
                  <text style={{ fg: palette.dim }}>
                    {props.query.trim() === '' ? 'No skills found.' : 'No skills match.'}
                  </text>
                  <Show when={props.selected} fallback={<text> </text>}>
                    <text style={{ fg: palette.accent }}>press c to create</text>
                  </Show>
                </box>
              }
            >
              <For each={props.rows}>
                {(row, index) => (
                  <box
                    backgroundColor={index() === props.highlight ? palette.highlight : palette.bg}
                  >
                    <text style={{ fg: palette.text }}>
                      {index() === props.highlight ? `▸ ${row.name}` : `  ${row.name}`}
                    </text>
                  </box>
                )}
              </For>
            </Show>
          </Show>
        </box>
        <Show when={props.selected} fallback={<text> </text>}>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <KeybindBanner
              items={Keybinds.listBanner(props.installed, props.total, { quickRemove: true })}
            />
            <text style={{ fg: palette.dim }}>
              {props.installed ? `${props.rows.length}/${props.total}` : ' '}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  );
};
