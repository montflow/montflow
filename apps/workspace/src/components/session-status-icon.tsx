/** @jsxImportSource @opentui/solid */
import { Show, createSignal, onCleanup } from 'solid-js';
import { FRAME_MS, LOADER_FRAMES } from './loader.js';
import { palette } from './palette.js';
import { sessionMarker } from './sessions-panel.js';

export interface SessionStatusIconProps {
  readonly status: string;
  /**
   * Dim line under the badge: `live`, `waiting for your answer`. It
   * rides its own row so a long note never wraps and shoves the badge
   * glyph onto the next line in a narrow column.
   */
  readonly note?: string | undefined;
  /** Fixed spinner frame index. Set in tests for a deterministic snapshot. */
  readonly frame?: number | undefined;
}

/**
 * Colour for one session status: accent while running, warn while parked
 * awaiting an answer, `good`/`bad` once settled, dim for pending,
 * cancelled, and anything unrecognised. The badge inverts the glyph
 * against this colour, so it carries the state at a glance.
 * @param status - session status
 * @returns palette colour
 */
export const sessionStatusColor = (status: string): string => {
  switch (status) {
    case 'running':
      return palette.accent;
    case 'awaiting-input':
      return palette.warn;
    case 'done':
      return palette.good;
    case 'failed':
      return palette.bad;
    default:
      return palette.dim;
  }
};

/**
 * Session status badge: the status marker inverted inside a coloured chip,
 * the status word beside it in the same colour, and the note on its own
 * dim line underneath. Reuses the list `sessionMarker`, so the panel row
 * and the detail badge never disagree on glyphs, and animates the
 * braille spinner for a `running` session on the raw interval every other
 * spinner in the app uses.
 * @param props - session status, optional dim note, optional fixed frame
 * @returns status badge element
 */
export const SessionStatusIcon = (props: SessionStatusIconProps) => {
  const [frame, setFrame] = createSignal(props.frame ?? 0);
  if (props.frame === undefined) {
    // oxlint-disable-next-line montflow/no-timers -- Loader pattern: Effect Clock hangs here.
    const timer = setInterval(() => {
      setFrame((index) => (index + 1) % LOADER_FRAMES.length);
    }, FRAME_MS);
    onCleanup(() => {
      // oxlint-disable-next-line montflow/no-timers -- spinner teardown for the raw interval above.
      clearInterval(timer);
    });
  }
  const color = (): string => sessionStatusColor(props.status);

  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
        <box backgroundColor={color()} paddingLeft={1} paddingRight={1} flexShrink={0}>
          <text style={{ fg: palette.bg }}>{sessionMarker(props.status, frame())}</text>
        </box>
        <text style={{ fg: color() }}>{props.status}</text>
      </box>
      <Show when={props.note} fallback={undefined}>
        {(note: () => string) => <text style={{ fg: palette.dim }}>{note()}</text>}
      </Show>
    </box>
  );
};
