import { For, Show } from 'solid-js';
import type { Runs } from '../services/index.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { palette } from './palette.js';
import { liveNote, parkedQuestion, runTranscriptLines } from './run-detail-lines.js';
import { type RunDetailMode } from './run-detail-keys.js';
import { runMarker } from './runs-panel.js';

export interface RunDetailProps {
  readonly detail: Runs.RunDetail;
  readonly mode: RunDetailMode;
  readonly scrollOffset: number;
  readonly maxBodyLines: number;
}

/**
 * Run detail content: status line (marker plus status plus live note),
 * the initial prompt, a callout for a parked question, then the live
 * transcript — truncated to fit in `preview`, windowed by `scrollOffset`
 * in `view`. Chromeless — the caller owns border and title. The footer
 * names the next action (`v` toggles modes, `j`/`k` scroll the full
 * view); the parked callout names `a answer` and the status bar owns
 * the live `s`/`x` hints. Mirrors `PromptDetail` line for line.
 * @param props - run detail, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const RunDetail = (props: RunDetailProps) => {
  const lines = () => runTranscriptLines(props.detail);
  const question = () => parkedQuestion(props.detail);
  const note = () => liveNote(props.detail.summary.status);
  const budget = () => Math.max(props.maxBodyLines, 1);
  const offset = () =>
    props.mode === 'view'
      ? Math.min(Math.max(props.scrollOffset, 0), Math.max(lines().length - budget(), 0))
      : 0;
  const shown = () => lines().slice(offset(), offset() + budget());
  const hidden = () => lines().length - shown().length - offset();

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
      <text style={{ fg: palette.text }}>{props.detail.summary.prompt}</text>
      <box flexDirection="column">
        <text>
          <span style={{ fg: palette.dim }}>status </span>
          {`${runMarker(props.detail.summary.status)} ${props.detail.summary.status}`}
          <Show when={note()} fallback={undefined}>
            {(text: () => string) => <span style={{ fg: palette.accent }}> · {text()}</span>}
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
      <Show when={question()} fallback={undefined}>
        {(text: () => string) => (
          <box flexDirection="column">
            <text>
              <span style={{ fg: palette.accent }}>question </span>
              <span style={{ fg: palette.text }}>{text()}</span>
            </text>
            <text style={{ fg: palette.dim }}>{formatKeybinds([Keybinds.answer()])}</text>
          </box>
        )}
      </Show>
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
