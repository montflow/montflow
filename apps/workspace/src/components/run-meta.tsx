/** @jsxImportSource @opentui/solid */
import { For, Show } from 'solid-js';
import type { Runs } from '../services/index.js';
import { palette } from './palette.js';
import {
  RUN_META_LABEL_COLUMNS,
  RUN_META_VALUE_COLUMNS,
  clipRunMetaValue,
  liveNote,
  runMetaRows,
} from './run-detail-lines.js';
import { RunStatusIcon } from './run-status-icon.js';

export interface RunMetaProps {
  readonly detail: Runs.RunDetail;
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
    <span style={{ fg: palette.dim }}>{`${label.padEnd(RUN_META_LABEL_COLUMNS)} `}</span>
    <span style={{ fg: palette.text }}>{value}</span>
  </text>
);

/**
 * Run detail sidebar: the status badge (glyph, status word, live
 * note), the agent-posted progress line when there is one, the
 * metadata rows, then the settlement receipt summary. Rows read as a
 * table: labels are padded to a fixed dim column so every value starts
 * on the same column, and the receipt summary is indented to it too.
 *
 * The status lives in exactly one place — the badge at the top. The
 * receipt contributes only its prose summary, never its outcome word,
 * so a settled run reads `✓ done` once and once. Every block is
 * fixed-height and clipped by the panel, so a long progress line or
 * receipt summary can never push the action menu the caller renders
 * below this out of view. Chromeless — the caller owns border, title,
 * and the action menu underneath.
 * @param props - loaded run detail
 * @returns run metadata element
 */
export const RunMeta = (props: RunMetaProps) => {
  const rows = () => runMetaRows(props.detail.summary);

  return (
    <box flexDirection="column" flexShrink={0}>
      <RunStatusIcon
        status={props.detail.summary.status}
        note={liveNote(props.detail.summary.status)}
      />
      <Show when={props.detail.summary.progress} fallback={undefined}>
        {(progress: () => string) =>
          metaRow('progress', clipRunMetaValue(progress(), RUN_META_VALUE_COLUMNS))
        }
      </Show>
      <For each={rows()}>{(meta) => metaRow(meta.label, meta.value)}</For>
      <Show when={props.detail.receipt} fallback={undefined}>
        {(receipt: () => { readonly summary: string }) => (
          <box flexDirection="column" flexShrink={0} paddingLeft={RUN_META_LABEL_COLUMNS + 2}>
            <text style={{ fg: palette.dim }}>{receipt().summary}</text>
          </box>
        )}
      </Show>
    </box>
  );
};
