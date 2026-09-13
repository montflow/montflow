import { palette } from './palette.js';

export interface StatusBarProps {
  readonly hint: string;
  readonly trailing: string;
}

/**
 * Footer bar: hints left, terminal size plus workspace summary right.
 * @param props - hint text and trailing summary
 * @returns status bar element
 */
export const StatusBar = (props: StatusBarProps) => (
  <box
    flexDirection="row"
    justifyContent="space-between"
    backgroundColor={palette.highlight}
    paddingLeft={1}
    paddingRight={1}
    flexShrink={0}
  >
    <text style={{ fg: palette.dim }}>{props.hint}</text>
    <text style={{ fg: palette.dim }}>{props.trailing}</text>
  </box>
);
