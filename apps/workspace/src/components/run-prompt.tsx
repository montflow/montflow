import { palette } from './palette.js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { promptWindow } from './run-detail-lines.js';

export interface RunPromptProps {
  /** Full run prompt — the request that started the run. */
  readonly text: string;
  /** Columns the pane gives the prompt (its width minus panel chrome). */
  readonly columns: number;
  /** Rows the pane gives the prompt text. */
  readonly rows: number;
  /** Rows scrolled past above the window. */
  readonly offset: number;
  /** True when the prompt pane holds the detail's focus. */
  readonly focused: boolean;
}

/**
 * Prompt pane: one windowed slice of the run prompt — whole source
 * lines only, so the pane can never render past its own rows — with a
 * dim footer that reports how much sits above and below and names the
 * scroll keys. Chromeless: the caller owns the panel border and title,
 * and the accent border is how the pane says it has focus. Scroll only
 * moves when `focused`, so the transcript never moves under you.
 * @param props - prompt text, pane columns and rows, scroll offset, and focus flag
 * @returns prompt pane content element
 */
export const RunPrompt = (props: RunPromptProps) => {
  const view = () => promptWindow(props.text, props.columns, props.rows, props.offset);
  /** Footer copy: only the sides that actually have hidden rows. */
  const footer = (): string => {
    const { above, below } = view();
    const parts = [
      ...(above > 0 ? [`↑ ${above} more`] : []),
      ...(below > 0 ? [`↓ ${below} more`] : []),
      ...(props.focused ? [formatKeybinds([Keybinds.scroll()])] : []),
    ];
    return parts.join(' · ');
  };
  const hidden = () => view().above > 0 || view().below > 0;

  return (
    <box flexDirection="column" flexShrink={0} minHeight={0}>
      <text style={{ fg: palette.text }}>{view().lines.join('\n')}</text>
      <box flexShrink={0}>
        <text style={{ fg: palette.dim }}>{hidden() || props.focused ? footer() : ' '}</text>
      </box>
    </box>
  );
};
