import { For, Show } from 'solid-js';
import type { Runs } from '../services/index.js';
import { KeybindBanner } from './keybind-banner.js';
import { Keybinds } from './keybinds.js';
import { Loader, type LoaderVariant } from './loader.js';
import { palette } from './palette.js';

export interface RunsPanelProps {
  readonly loading: boolean;
  readonly installing: boolean;
  readonly loadingVariant?: LoaderVariant | undefined;
  readonly installed: boolean;
  readonly rows: ReadonlyArray<Runs.RunSummary>;
  readonly highlight: number;
  readonly total: number;
  readonly query: string;
  readonly searching: boolean;
  readonly capacity: number;
  readonly selected: boolean;
}

/**
 * Status glyph for a run row: live runs glow, parked runs warn, terminal
 * runs dim. Single source for the list marker so the panel and detail
 * never drift.
 * @param status - run status
 * @returns one-char marker
 */
export const runMarker = (status: string): string => {
  switch (status) {
    case 'running':
      return '●';
    case 'awaiting-input':
      return '◐';
    case 'pending':
      return '○';
    case 'done':
      return '✓';
    case 'failed':
      return '✗';
    case 'cancelled':
      return '■';
    default:
      return '·';
  }
};

/**
 * Runs content that FILLS the panel: the loader, missing-store note,
 * empty note, and filterable list all share the same flex chrome, so
 * loading, filtering, install state, and search toggling never shift
 * the grid. Mirrors `SkillsPanel` row for row — the search line stays
 * reserved (blank when idle); the list region grows to absorb slack
 * above a one-line footer pinned to the panel bottom. Each row shows
 * the status marker plus the run name; the footer names the next
 * action (`c` creates, `⏎` installs when missing).
 * @param props - load state, visible rows, highlight, query, capacity, selection
 * @returns runs content element
 */
export const RunsPanel = (props: RunsPanelProps) => {
  return (
    <Show
      when={!props.loading && !props.installing}
      fallback={
        <Loader variant={props.installing ? 'installing' : (props.loadingVariant ?? 'runs')} />
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
                <text style={{ fg: palette.dim }}>Runs extension not installed.</text>
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
                    {props.query.trim() === '' ? 'No runs found.' : 'No runs match.'}
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
                      {index() === props.highlight
                        ? `▸ ${runMarker(row.status)} ${row.name}`
                        : `  ${runMarker(row.status)} ${row.name}`}
                    </text>
                  </box>
                )}
              </For>
            </Show>
          </Show>
        </box>
        <Show when={props.selected} fallback={<text> </text>}>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <KeybindBanner items={Keybinds.listBanner(props.installed, props.total)} />
            <text style={{ fg: palette.dim }}>
              {props.installed ? `${props.rows.length}/${props.total}` : ' '}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  );
};
