import { For, Show, createSignal, onCleanup } from 'solid-js';
import type { Runs } from '../services/index.js';
import { KeybindBanner } from './keybind-banner.js';
import { Keybinds } from './keybinds.js';
import { FRAME_MS, LOADER_FRAMES, Loader, type LoaderVariant } from './loader.js';
import { palette } from './palette.js';

export interface RunsPanelProps {
  readonly loading: boolean;
  readonly installing: boolean;
  readonly loadingVariant?: LoaderVariant | undefined;
  readonly installed: boolean;
  /** Active rows (running first), rendered unwindowed under the Active header. */
  readonly activeRows: ReadonlyArray<Runs.RunSummary>;
  /** Windowed slice of the full filtered list, under the All runs header. */
  readonly allRows: ReadonlyArray<Runs.RunSummary>;
  /** Whether the full-history section is expanded. */
  readonly showAll: boolean;
  /** Flat highlight across `activeRows` then `allRows`. */
  readonly highlight: number;
  readonly total: number;
  readonly query: string;
  readonly searching: boolean;
  readonly capacity: number;
  readonly selected: boolean;
  /** Fixed spinner frame index. Set in tests for a deterministic snapshot. */
  readonly frame?: number | undefined;
}

/**
 * Status glyph for a run row: live runs glow, parked runs warn, terminal
 * runs dim. Single source for the list marker so the panel and detail
 * never drift. With a `frame`, a `running` row returns that braille
 * spinner frame instead of the static marker; without one it stays
 * static (the run-detail header never animates).
 * @param status - run status
 * @param frame - optional spinner frame index for `running` rows
 * @returns one-char marker
 */
export const runMarker = (status: string, frame?: number): string => {
  switch (status) {
    case 'running':
      return frame === undefined ? '●' : (LOADER_FRAMES[frame % LOADER_FRAMES.length] ?? '●');
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
 * empty note, and the two filterable sections all share the same flex
 * chrome, so loading, filtering, install state, search toggling, and the
 * Active/All section toggle never shift the grid. Section headers are
 * non-selectable plain lines; highlight navigation walks
 * `activeRows` then `allRows`, so movement crosses sections in one
 * sequence. Running rows animate the loader's braille spinner; every
 * other status keeps its static marker.
 * @param props - load state, section rows, highlight, query, capacity, selection, frame
 * @returns runs content element
 */
export const RunsPanel = (props: RunsPanelProps) => {
  const [frame, setFrame] = createSignal(props.frame ?? 0);
  if (props.frame === undefined) {
    // oxlint-disable-next-line montflow/no-timers -- documented above: Effect Clock hangs here.
    const timer = setInterval(() => {
      setFrame((index) => (index + 1) % LOADER_FRAMES.length);
    }, FRAME_MS);
    onCleanup(() => {
      // oxlint-disable-next-line montflow/no-timers -- spinner teardown for the raw interval above.
      clearInterval(timer);
    });
  }

  /** Row marker with the animated frame for running rows; static otherwise. */
  const markerFor = (status: string): string => runMarker(status, frame());

  /** Footer count: the windowed All section when expanded, else the Active section. */
  const shownCount = (): number => (props.showAll ? props.allRows.length : props.activeRows.length);

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
              <box flexDirection="column">
                <text style={{ fg: palette.dim }}>Active</text>
                <For each={props.activeRows}>
                  {(row, index) => (
                    <box
                      backgroundColor={index() === props.highlight ? palette.highlight : palette.bg}
                    >
                      <text style={{ fg: palette.text }}>
                        {`${index() === props.highlight ? '▸' : ' '} ${markerFor(row.status)} ${row.name}${row.progress === '' ? '' : ` — ${row.progress}`}`}
                      </text>
                    </box>
                  )}
                </For>
                <Show when={props.showAll}>
                  <text style={{ fg: palette.dim }}>All runs</text>
                  <For each={props.allRows}>
                    {(row, index) => {
                      const position = (): number => props.activeRows.length + index();
                      return (
                        <box
                          backgroundColor={
                            position() === props.highlight ? palette.highlight : palette.bg
                          }
                        >
                          <text style={{ fg: palette.text }}>
                            {`${position() === props.highlight ? '▸' : ' '} ${markerFor(row.status)} ${row.name}${row.progress === '' ? '' : ` — ${row.progress}`}`}
                          </text>
                        </box>
                      );
                    }}
                  </For>
                </Show>
              </box>
            </Show>
          </Show>
        </box>
        <Show when={props.selected} fallback={<text> </text>}>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <KeybindBanner
              items={Keybinds.listBanner(props.installed, props.total, { allRuns: true })}
            />
            <text style={{ fg: palette.dim, flexShrink: 0, marginLeft: 1 }}>
              {props.installed ? `${shownCount()}/${props.total}` : ' '}
            </text>
          </box>
        </Show>
      </box>
    </Show>
  );
};
