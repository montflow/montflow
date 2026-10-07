import { For, Show } from 'solid-js';
import type { Specs } from '../services/index.js';
import { specDetailLines, specMarker } from './spec-markers.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { palette } from './palette.js';

/** Detail body mode: truncated preview or scrollable full view. */
export type SpecDetailMode = 'preview' | 'view';

export interface SpecDetailProps {
  readonly detail: Specs.SpecDetail;
  readonly mode: SpecDetailMode;
  readonly scrollOffset: number;
  readonly maxBodyLines: number;
}

/**
 * Spec detail content: header (status, derived state, author, task
 * roll-up), verification issues, then every phase with its tasks and
 * per-task statuses — truncated in `preview`, windowed by
 * `scrollOffset` in `view`. Chromeless — the caller owns border and
 * title. The footer names the next action (`v` toggles modes, `j`/`k`
 * scroll the full view).
 * @param props - spec detail, view mode, scroll window, and body line budget
 * @returns detail content element
 */
export const SpecDetail = (props: SpecDetailProps) => {
  const lines = () => specDetailLines(props.detail);
  const budget = () => Math.max(props.maxBodyLines, 1);
  const offset = () =>
    props.mode === 'view'
      ? Math.min(Math.max(props.scrollOffset, 0), Math.max(lines().length - budget(), 0))
      : 0;
  const shown = () => lines().slice(offset(), offset() + budget());
  const hidden = () => lines().length - shown().length - offset();

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <Show
          when={lines().length > 0}
          fallback={<text style={{ fg: palette.dim }}>No spec data.</text>}
        >
          <For each={shown()}>{(line) => <text>{line === '' ? ' ' : line}</text>}</For>
        </Show>
        <Show
          when={props.mode === 'preview'}
          fallback={
            <text style={{ fg: palette.dim }}>
              lines {lines().length === 0 ? 0 : offset() + 1}–{offset() + shown().length}/
              {lines().length} · {formatKeybinds([Keybinds.scroll(), Keybinds.showPreview()])}
            </text>
          }
        >
          {hidden() > 0 ? (
            <text style={{ fg: palette.dim }}>
              … {hidden()} more lines · {formatKeybinds([Keybinds.showFull()])}
            </text>
          ) : undefined}
        </Show>
      </box>
      <box flexShrink={0}>
        <text style={{ fg: palette.dim }}>
          {`state ${specMarker(props.detail.state)} ${props.detail.state}`}
        </text>
      </box>
    </box>
  );
};
