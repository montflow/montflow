/** @jsxImportSource @opentui/solid */
import { For, Show } from 'solid-js';
import type { Sessions } from '../services/index.js';
import { palette } from './palette.js';
import {
  SESSION_META_LABEL_COLUMNS,
  SESSION_META_VALUE_COLUMNS,
  clipSessionMetaValue,
  liveNote,
  sessionMetaRows,
} from './session-detail-lines.js';
import { SessionStatusIcon } from './session-status-icon.js';

export interface SessionMetaProps {
  readonly detail: Sessions.SessionDetail;
}

/**
 * One `label value` row: dim label padded to the sidebar's label
 * column, bright value after it. Module scope — it captures nothing.
 * @param label - metadata label
 * @param value - clipped metadata value
 * @returns one sidebar row element
 */
const metaRow = (label: string, value: string) => (
  <text>
    <span style={{ fg: palette.dim }}>{`${label.padEnd(SESSION_META_LABEL_COLUMNS)} `}</span>
    <span style={{ fg: palette.text }}>{value}</span>
  </text>
);

/**
 * Session detail sidebar: the status badge (glyph, status word, live
 * note), the agent-posted progress line when there is one, the
 * metadata rows, then the settlement receipt summary. Rows read as a
 * table: labels are padded to a fixed dim column so every value starts
 * on the same column, and the receipt summary is indented to it too.
 *
 * The status lives in exactly one place — the badge at the top. The
 * receipt contributes only its prose summary, never its outcome word,
 * so a settled session reads `✓ done` once and once. Every block is
 * fixed-height and clipped by the panel, so a long progress line or
 * receipt summary can never push the action menu the caller renders
 * below this out of view. Chromeless — the caller owns border, title,
 * and the action menu underneath.
 * @param props - loaded session detail
 * @returns session metadata element
 */
export const SessionMeta = (props: SessionMetaProps) => {
  const rows = () => sessionMetaRows(props.detail.summary);

  return (
    <box flexDirection="column" flexShrink={0}>
      <SessionStatusIcon
        status={props.detail.summary.status}
        note={liveNote(props.detail.summary.status)}
      />
      <Show when={props.detail.summary.progress} fallback={undefined}>
        {(progress: () => string) =>
          metaRow('progress', clipSessionMetaValue(progress(), SESSION_META_VALUE_COLUMNS))
        }
      </Show>
      <For each={rows()}>{(meta) => metaRow(meta.label, meta.value)}</For>
      <Show when={props.detail.receipt} fallback={undefined}>
        {(receipt: () => { readonly summary: string }) => (
          <box flexDirection="column" flexShrink={0} paddingLeft={SESSION_META_LABEL_COLUMNS + 2}>
            <text style={{ fg: palette.dim }}>{receipt().summary}</text>
          </box>
        )}
      </Show>
    </box>
  );
};
