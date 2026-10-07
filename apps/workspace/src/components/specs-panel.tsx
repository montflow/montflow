import { For, Show } from 'solid-js';
import type { Specs } from '../services/index.js';
import { specMarker } from './spec-markers.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { Loader, type LoaderVariant } from './loader.js';
import { palette } from './palette.js';

export interface SpecsPanelProps {
  readonly loading: boolean;
  readonly loadingVariant?: LoaderVariant | undefined;
  readonly installed: boolean;
  readonly rows: ReadonlyArray<Specs.SpecSummary>;
  readonly highlight: number;
  readonly total: number;
  readonly query: string;
  readonly searching: boolean;
  readonly capacity: number;
  readonly selected: boolean;
}

/**
 * Specs content that FILLS the panel: loader, empty note, and the
 * filterable list share the same flex chrome, so loading and filtering
 * never shift the grid. Mirrors `RunsPanel` row for row — each row shows
 * the lifecycle marker, the spec name, and its derived state.
 * `c` dispatches an author run (handled by the app, not this panel).
 * @param props - load state, visible rows, highlight, query, capacity, selection
 * @returns specs content element
 */
export const SpecsPanel = (props: SpecsPanelProps) => {
  return (
    <Show when={!props.loading} fallback={<Loader variant={props.loadingVariant ?? 'specs'} />}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <box flexShrink={0}>
          <Show when={props.searching || props.query !== ''} fallback={<text> </text>}>
            <text style={{ fg: palette.accent }}>/{props.query}</text>
          </Show>
        </box>
        <box flexDirection="column" flexGrow={1} minHeight={0}>
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
                  {props.query.trim() === ''
                    ? props.installed
                      ? 'No specs found.'
                      : 'No specs directory.'
                    : 'No specs match.'}
                </text>
                <Show when={props.selected} fallback={<text> </text>}>
                  <text style={{ fg: palette.dim }}>author one under .agents/@montflow/specs</text>
                </Show>
              </box>
            }
          >
            <For each={props.rows}>
              {(row, index) => (
                <box backgroundColor={index() === props.highlight ? palette.highlight : palette.bg}>
                  <text style={{ fg: palette.text }}>
                    {`${index() === props.highlight ? '▸' : ' '} ${specMarker(row.state)} ${row.name}  `}
                    <span style={{ fg: palette.dim }}>{row.state}</span>
                  </text>
                </box>
              )}
            </For>
          </Show>
        </box>
        <Show when={props.selected} fallback={<text> </text>}>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <text style={{ fg: palette.dim }}>
              {formatKeybinds([
                Keybinds.search(),
                Keybinds.open(),
                Keybinds.create(),
                Keybinds.refresh(),
              ])}
            </text>
            <text style={{ fg: palette.dim }}>{`${props.rows.length}/${props.total}`}</text>
          </box>
        </Show>
      </box>
    </Show>
  );
};
