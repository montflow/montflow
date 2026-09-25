import { For, Show } from 'solid-js';
import type { Features } from '../services/index.js';
import { featureMarker } from './feature-markers.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { Loader, type LoaderVariant } from './loader.js';
import { palette } from './palette.js';

export interface FeaturesPanelProps {
  readonly loading: boolean;
  readonly loadingVariant?: LoaderVariant | undefined;
  readonly installed: boolean;
  readonly rows: ReadonlyArray<Features.FeatureSummary>;
  readonly highlight: number;
  readonly total: number;
  readonly query: string;
  readonly searching: boolean;
  readonly capacity: number;
  readonly selected: boolean;
}

/**
 * Features content that FILLS the panel: loader, empty note, and the
 * filterable read-only list share the same flex chrome, so loading and
 * filtering never shift the grid. Mirrors `RunsPanel` row for row —
 * each row shows the lifecycle marker, the feature name, and its
 * derived state. Read-only: no create, no delete, no install.
 * @param props - load state, visible rows, highlight, query, capacity, selection
 * @returns features content element
 */
export const FeaturesPanel = (props: FeaturesPanelProps) => {
  return (
    <Show when={!props.loading} fallback={<Loader variant={props.loadingVariant ?? 'features'} />}>
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
                      ? 'No features found.'
                      : 'No features directory.'
                    : 'No features match.'}
                </text>
                <Show when={props.selected} fallback={<text> </text>}>
                  <text style={{ fg: palette.dim }}>
                    author one under .agents/@montflow/features
                  </text>
                </Show>
              </box>
            }
          >
            <For each={props.rows}>
              {(row, index) => (
                <box backgroundColor={index() === props.highlight ? palette.highlight : palette.bg}>
                  <text style={{ fg: palette.text }}>
                    {`${index() === props.highlight ? '▸' : ' '} ${featureMarker(row.state)} ${row.name}  `}
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
              {formatKeybinds([Keybinds.search(), Keybinds.open(), Keybinds.refresh()])}
            </text>
            <text style={{ fg: palette.dim }}>{`${props.rows.length}/${props.total}`}</text>
          </box>
        </Show>
      </box>
    </Show>
  );
};
