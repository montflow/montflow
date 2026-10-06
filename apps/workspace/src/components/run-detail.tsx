import { Show } from 'solid-js';
import type { Runs } from '../services/index.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { MarkdownBody } from './markdown-body.js';
import { palette } from './palette.js';
import { parkedQuestion, runTranscriptMarkdown } from './run-detail-lines.js';
import { type RunDetailMode } from './run-detail-keys.js';

/**
 * Transcript rows the run preview shows. The preview is a small window
 * on the transcript, not a share of the pane: the run's metadata and
 * prompt live in their own columns, so this pane only answers "what
 * has the agent done so far". `j`/`k` page through it; `v` opens the
 * full transcript.
 */
export const RUN_PREVIEW_LINES = 8;

export interface RunDetailProps {
  readonly detail: Runs.RunDetail;
  readonly mode: RunDetailMode;
  readonly scrollOffset: number;
  readonly maxBodyLines: number;
}

/**
 * Run detail transcript pane: a callout for a parked question, then
 * the transcript rendered as markdown through the shared
 * `MarkdownBody`, exactly like the skill, profile, and prompt details.
 * The callout is the pane's own chrome; the body fills the rest, so `v`
 * changes the window and never the framing. Chromeless — the caller
 * owns the panel border and title, and renders the run's metadata and
 * prompt in the columns beside this one. The footer names the next
 * action (`v` toggles modes, `j`/`k` scroll); the parked callout names
 * `a answer` and the status bar owns the live `s`/`x` hints.
 * @param props - run detail, view mode, scroll window, and the body line budget
 * @returns detail content element
 */
export const RunDetail = (props: RunDetailProps) => {
  const lines = () => runTranscriptMarkdown(props.detail);
  const question = () => parkedQuestion(props.detail);

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1}>
      <Show when={question()} fallback={undefined}>
        {(text: () => string) => (
          <box flexDirection="column" flexShrink={0}>
            <text>
              <span style={{ fg: palette.warn }}>question </span>
              <span style={{ fg: palette.text }}>{text()}</span>
            </text>
            <text style={{ fg: palette.dim }}>{formatKeybinds([Keybinds.answer()])}</text>
          </box>
        )}
      </Show>
      <Show
        when={lines().length > 0}
        fallback={<text style={{ fg: palette.dim }}>No transcript yet.</text>}
      >
        <MarkdownBody
          lines={lines()}
          mode={props.mode}
          scrollOffset={props.scrollOffset}
          maxBodyLines={props.mode === 'preview' ? RUN_PREVIEW_LINES : props.maxBodyLines}
          previewLines={RUN_PREVIEW_LINES}
          previewScroll
        />
      </Show>
    </box>
  );
};
