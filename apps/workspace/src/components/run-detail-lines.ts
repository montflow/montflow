import type { Runs } from '../services/index.js';
import { isLiveRunStatus } from './run-detail-keys.js';

/**
 * Transcript line glyph by role: user `›`, assistant `◈`, system and
 * tool results `·`. Pure — shared by the renderer and its tests.
 * @param role - event role
 * @returns one-glyph marker
 */
export const runRoleMarker = (role: string): string =>
  role === 'user' ? '›' : role === 'assistant' ? '◈' : '·';

/**
 * Markdown block openers: a first line matching one of these starts a
 * heading, list, quote, table, fence, rule, or indented code, so a role
 * glyph prefixed onto it would swallow the construct. Events that open
 * a block get the glyph on its own line instead.
 */
const MARKDOWN_BLOCK_START =
  /^(?: {4,}|#{1,6}(?:\s|$)|[-*+](?:\s|$)|\d+[.)](?:\s|$)|>|\||```|~~~|-{3,}|\*{3,}|_{3,})/;

/** Lines a tool result keeps at the head — where the match or error is. */
export const RUN_TOOL_HEAD_LINES = 4;

/** Lines a tool result keeps at the tail — where the summary lines are. */
export const RUN_TOOL_TAIL_LINES = 2;

/**
 * Rows a prompt column spends on the text before it ellipsizes. Default
 * for callers that only know the width; the run detail passes its pane
 * height so a column-sized prompt uses every row it has.
 */
export const RUN_PROMPT_ROWS = 4;

/**
 * Rows a prompt needs in a pane `columns` wide: each source line costs
 * `ceil(length / columns)` rows, at least one, counted until the cap.
 * Pure, and shared by the pane sizing and the clip so a prompt's box is
 * exactly as tall as the text inside it.
 * @param prompt - full run prompt
 * @param columns - columns the pane gives the prompt
 * @param maxRows - rows to stop counting at
 * @returns rows the prompt occupies, never more than `maxRows`
 */
export const runPromptRows = (prompt: string, columns: number, maxRows: number): number => {
  const width = Math.max(columns, 8);
  const budget = Math.max(maxRows, 1);
  let used = 0;
  for (const line of prompt.split('\n')) {
    used += Math.max(1, Math.ceil(line.length / width));
    if (used > budget) return budget;
  }
  return Math.min(used, budget);
};

/**
 * Terminal height below which the detail drops its prompt pane: the
 * transcript then needs every row it can get.
 * @param height - terminal height
 * @returns true when the prompt pane is shown
 */
export const showsPromptPane = (height: number): boolean => height >= 20;

/**
 * One visible slice of the prompt column: whole source lines (never a
 * wrapped line cut in half) plus the row counts the pane's footer
 * reports.
 */
export interface PromptWindow {
  /** Source lines to render. */
  readonly lines: ReadonlyArray<string>;
  /** Rows hidden above the window. */
  readonly above: number;
  /** Rows hidden below the window. */
  readonly below: number;
  /** Rows the prompt occupies at this width. */
  readonly total: number;
}

/**
 * Window the prompt column: whole lines that fit `rows` rows starting at
 * the first line that begins at or after `offset`, so the pane can
 * never render more rows than it has — the overflow guard for a prompt
 * of any length. `offset` is clamped to the last window.
 * @param prompt - full run prompt
 * @param columns - columns the pane gives the prompt
 * @param rows - rows the pane has for text
 * @param offset - rows to skip above the window
 * @returns visible lines plus the rows hidden above and below
 */
export const promptWindow = (
  prompt: string,
  columns: number,
  rows: number,
  offset: number,
): PromptWindow => {
  const width = Math.max(columns, 8);
  const budget = Math.max(rows, 1);
  const source = prompt.split('\n');
  // Wrapped cost per source line, and the row each line starts on.
  const costs = source.map((line) => Math.max(1, Math.ceil(line.length / width)));
  const starts: Array<number> = [];
  costs.reduce((row, cost) => (starts.push(row), row + cost), 0);
  const total = starts.at(-1) !== undefined ? starts.at(-1)! + (costs.at(-1) ?? 0) : 0;

  // Clamp so the last page is full, the way a pager settles: scrolling
  // to the end shows the last rows, not one lonely line.
  const start = Math.min(Math.max(offset, 0), Math.max(total - budget, 0));
  let begin = starts.findIndex((row, index) => row <= start && start < row + (costs[index] ?? 1));
  if (begin < 0) begin = 0;
  // A single line longer than the pane (one enormous wrapped line) can
  // never fit whole; skip past it rather than overflow the pane.
  while (begin < source.length && (costs[begin] ?? 1) > budget) begin += 1;

  const out: Array<string> = [];
  let used = 0;
  for (let index = begin; index < source.length; index += 1) {
    const cost = costs[index] ?? 1;
    if (used + cost > budget) break;
    out.push(source[index] ?? '');
    used += cost;
  }
  const above = starts[begin] ?? 0;
  return { lines: out, above, below: Math.max(total - above - used, 0), total };
};

/**
 * Columns the detail pane gives the prompt text: the terminal less the
 * metadata sidebar, the column gap, and the panel's own chrome.
 * @param terminalWidth - terminal width
 * @returns columns available to the prompt text
 */
export const promptPaneColumns = (terminalWidth: number): number =>
  Math.max(terminalWidth - RUN_SIDEBAR_WIDTH - 9, 24);

/**
 * Rows the prompt text may take above the transcript, before the prompt
 * pane's own borders — a share of the pane, clamped so it can neither
 * vanish nor swallow the transcript.
 * @param height - terminal height
 * @returns row cap for the prompt text
 */
export const promptPaneTextRows = (height: number): number =>
  Math.max(4, Math.min(14, Math.floor(height * 0.35)));

/**
 * Rows the prompt pane takes above the transcript pane: the rows the
 * prompt needs — so a short prompt gets a short box — plus the panel's
 * two borders and the one row its hint footer always reserves, capped
 * by {@link promptPaneTextRows}.
 * @param height - terminal height
 * @param terminalWidth - terminal width
 * @param prompt - full run prompt
 * @returns rows the prompt pane occupies
 */
export const promptPaneRows = (height: number, terminalWidth: number, prompt: string): number =>
  runPromptRows(prompt, promptPaneColumns(terminalWidth), promptPaneTextRows(height)) + 3;

/**
 * Transcript rows the pane below the prompt can spend in full view: its
 * borders, the footer, slack for the parked-question callout, and the
 * rows the prompt pane took above it.
 * @param height - terminal height
 * @param terminalWidth - terminal width
 * @param prompt - full run prompt
 * @returns body line budget for the transcript
 */
export const detailBodyRows = (height: number, terminalWidth: number, prompt: string): number =>
  Math.max(
    5,
    height - 8 - (showsPromptPane(height) ? promptPaneRows(height, terminalWidth, prompt) : 0),
  );

/**
 * Clip a run prompt to the rows its pane can actually show. A character
 * budget alone is not enough: short lines wrap rarely and long lines
 * wrap often, so a budget that fits one prompt's style overflows the
 * next. This walks the lines {@link runPromptRows} accounts for, keeps
 * every line that fits, and marks the cut with an ellipsis row — so
 * nothing spills past the pane's last row and no line is cut in half.
 * @param prompt - full run prompt
 * @param columns - columns the pane gives the prompt
 * @param rows - rows the pane gives the prompt
 * @returns prompt text clipped to the pane's rows
 */
export const clipRunPrompt = (prompt: string, columns: number, rows = RUN_PROMPT_ROWS): string => {
  const width = Math.max(columns, 8);
  const budget = Math.max(rows, 1);
  const source = prompt.split('\n');
  let used = 0;
  let kept = 0;
  for (const [index, line] of source.entries()) {
    used += Math.max(1, Math.ceil(line.length / width));
    if (used > budget) break;
    kept = index + 1;
  }
  if (kept === 0) return '…';
  if (kept === source.length) return prompt;
  return `${source.slice(0, kept).join('\n').trimEnd()}\n…`;
};

/**
 * Transcribe one event for the markdown body, bounding a tool result.
 * Agent tool output is mostly whole files and command transcripts —
 * one `cat` can run to hundreds of lines — and a run's transcript is
 * mostly tool output. Left unbounded it buries the agent's prose under
 * a wall of code and the transcript reads as raw text, so a long tool
 * result keeps its head and tail around an italic note saying how much
 * was elided. Assistant and user prose is never clipped.
 * @param event - transcript event
 * @returns markdown source text for the event
 */
const eventText = (event: { readonly role: string; readonly text: string }): string => {
  if (event.role !== 'toolResult') return event.text;
  const lines = event.text.split('\n');
  const kept = RUN_TOOL_HEAD_LINES + RUN_TOOL_TAIL_LINES;
  if (lines.length <= kept + 1) return event.text;
  const hidden = lines.length - kept;
  return [
    ...lines.slice(0, RUN_TOOL_HEAD_LINES),
    '',
    `_… ${hidden} lines of tool output hidden · open the session file for the rest …_`,
    '',
    ...lines.slice(lines.length - RUN_TOOL_TAIL_LINES),
  ].join('\n');
};

/**
 * Transcript as markdown source lines for `MarkdownBody`: each event is
 * its own block (blank line between events) prefixed with its role
 * glyph, in `seq` order, with long tool results bounded by
 * {@link eventText}. The glyph rides the event's first line so the
 * transcript reads as prose the markdown renderer can style — headings,
 * lists, emphasis, code — instead of raw text. Pure so the renderer,
 * the app's scroll bound, and the tests share one projection.
 * @param detail - run detail
 * @returns markdown source lines
 */
export const runTranscriptMarkdown = (detail: Runs.RunDetail): ReadonlyArray<string> => {
  const out: Array<string> = [];
  for (const [index, event] of detail.events.entries()) {
    if (index > 0) out.push('');
    const marker = runRoleMarker(event.role);
    const [first = '', ...rest] = eventText(event).split('\n');
    if (event.text === '') {
      out.push(marker);
      continue;
    }
    if (first.trim() === '' || MARKDOWN_BLOCK_START.test(first)) out.push(marker, first);
    else out.push(`${marker} ${first}`);
    out.push(...rest);
  }
  return out;
};

/**
 * The parked question for an `awaiting-input` run: the last `system`
 * transcript line (the engine appends the `ask_user` question there).
 * @param detail - run detail
 * @returns question text, or undefined when the run is not parked
 */
export const parkedQuestion = (detail: Runs.RunDetail): string | undefined => {
  if (detail.summary.status !== 'awaiting-input') return undefined;
  return detail.events.findLast((event) => event.role === 'system')?.text;
};

/**
 * Live-state suffix for the status line: `live` while running, a call to
 * action while parked, undefined once the run settles.
 * @param status - run status, if loaded
 * @returns suffix copy, or undefined when not live
 */
export const liveNote = (status: string | undefined): string | undefined =>
  status === 'awaiting-input'
    ? 'waiting for your answer'
    : isLiveRunStatus(status)
      ? 'live'
      : undefined;

/** One detail-sidebar metadata row: a dim label plus the value beside it. */
export interface RunMetaRow {
  readonly label: string;
  readonly value: string;
}

/** Placeholder for a value the run never set, so an unset field keeps its row. */
export const RUN_META_NONE = '—';

/**
 * Sidebar panel width the detail page renders, borders and padding
 * included. The app sizes the column from this so the two cannot drift.
 */
export const RUN_SIDEBAR_WIDTH = 36;

/**
 * Content columns inside the sidebar (its width minus both borders and
 * both padding cells). Every value is clipped against this so a long
 * model pin or timestamp never wraps and pushes the action menu down.
 */
export const RUN_META_COLUMNS = RUN_SIDEBAR_WIDTH - 4;

/**
 * Columns the label column occupies. Labels are padded to it so every
 * value starts on the same column and the sidebar reads as a table
 * instead of a run of `label value` pairs of drifting widths.
 */
export const RUN_META_LABEL_COLUMNS = 8;

/** Columns a row's value may spend: the rest of the sidebar content. */
export const RUN_META_VALUE_COLUMNS = RUN_META_COLUMNS - RUN_META_LABEL_COLUMNS - 1;

/**
 * Clip one free-text metadata value to `max` characters, marking the
 * cut with an ellipsis. The progress line is agent-posted prose and the
 * sidebar is a fixed column, so a long line is clipped instead of
 * wrapping.
 * @param value - raw value
 * @param max - characters the value may spend
 * @returns clipped value
 */
export const clipRunMetaValue = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, Math.max(max - 1, 1))}…`;

/**
 * Compact an ISO timestamp for the sidebar: `2026-01-01T10:00:00.000Z`
 * becomes `2026-01-01 10:00`. Textual on purpose — no `Date`, no
 * timezone shift — and anything unparseable is returned as-is.
 * @param value - ISO timestamp from the run
 * @returns compact timestamp
 */
export const shortRunTimestamp = (value: string): string =>
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value)?.[0]?.replace('T', ' ') ?? value;

/**
 * Sidebar metadata for the detail page: the model's pin, the bound
 * spec, the thinking level, the tool allowlist, both timestamps,
 * and the run id. The status badge, the live progress line, and the
 * initial prompt are rendered by their own components, so they are
 * deliberately absent here. Unset optional values render as
 * {@link RUN_META_NONE} so the labels never reflow, labels are padded
 * to {@link RUN_META_LABEL_COLUMNS} so every value starts on the same
 * column, and values are clipped to the sidebar so each row stays one
 * line. Pure — the sidebar component and its tests share one
 * projection.
 * @param summary - run summary
 * @returns metadata rows in display order
 */
export const runMetaRows = (summary: Runs.RunSummary): ReadonlyArray<RunMetaRow> => {
  /** One row: placeholder an unset value, then clip it to the value column. */
  const row = (label: string, raw: string): RunMetaRow => ({
    label,
    value: clipRunMetaValue(raw === '' ? RUN_META_NONE : raw, RUN_META_VALUE_COLUMNS),
  });
  return [
    row('model', summary.model),
    row('spec', summary.spec),
    row('thinking', summary.thinking),
    row('tools', summary.tools.join(', ')),
    row('created', shortRunTimestamp(summary.created)),
    row('updated', shortRunTimestamp(summary.updated)),
    row('id', summary.id),
  ];
};
