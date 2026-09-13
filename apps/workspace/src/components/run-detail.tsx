import { For, Show } from 'solid-js';
import type { Runs } from '../services/index.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { palette } from './palette.js';
import { runMarker } from './runs-panel.js';

/** Detail body mode: truncated preview or scrollable full view. */
export type RunDetailMode = 'preview' | 'view';

export interface RunDetailProps {
  readonly detail: Runs.RunDetail;
  readonly mode: RunDetailMode;
  readonly scrollOffset: number;
  readonly maxBodyLines: number;
}

/**
 * Run detail content: status line (marker plus status plus model),
 * the initial prompt, then the live transcript — truncated to fit in
 * `preview`, windowed by `scrollOffset` in `view`. Chromeless — the
 * caller owns border and title. The footer names the next action
 * (`v` toggles modes, `j`/`k` scroll the full view, `x` interrupts a
 * live run). Mirrors `PromptDetail` line for line.
 * @param props - run detail, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const RunDetail = (props: RunDetailProps) => {
  const lines = () =>
    props.detail.events.map(
      (event) =>
        `${event.role === 'user' ? '›' : event.role === 'assistant' ? '◈' : '·'} ${event.text}`,
    );
  const budget = () => Math.max(props.maxBodyLines, 1);
  const offset = () =>
    props.mode === 'view'
      ? Math.min(Math.max(props.scrollOffset, 0), Math.max(lines().length - budget(), 0))
      : 0;
  const shown = () => lines().slice(offset(), offset() + budget());
  const hidden = () => lines().length - shown().length - offset();
  const live =
    props.detail.summary.status === 'running' || props.detail.summary.status === 'awaiting-input';

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
      <text style={{ fg: palette.text }}>{props.detail.summary.prompt}</text>
      <box flexDirection="column">
        <text>
          <span style={{ fg: palette.dim }}>status </span>
          {`${runMarker(props.detail.summary.status)} ${props.detail.summary.status}`}
          <Show when={live} fallback={undefined}>
            <span style={{ fg: palette.accent }}> · live</span>
          </Show>
        </text>
        <text>
          <span style={{ fg: palette.dim }}>model </span>
          {props.detail.summary.model !== '' ? props.detail.summary.model : '—'}
        </text>
        <text>
          <span style={{ fg: palette.dim }}>updated </span>
          {props.detail.summary.updated}
        </text>
        <Show when={props.detail.receipt !== undefined} fallback={undefined}>
          {(receipt: () => { readonly outcome: string; readonly summary: string }) => (
            <text>
              <span style={{ fg: palette.dim }}>{receipt().outcome} </span>
              {receipt().summary}
            </text>
          )}
        </Show>
      </box>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <Show
          when={lines().length > 0}
          fallback={<text style={{ fg: palette.dim }}>No transcript yet.</text>}
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
    </box>
  );
};
