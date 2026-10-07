import type { BoxRenderable } from '@opentui/core';
import type { JSX, Ref } from 'solid-js';
import { palette } from './palette.js';

export interface PanelProps {
  readonly title: string;
  readonly selected: boolean;
  readonly grow?: number;
  /** Whole-row height. When set, the panel is pinned instead of flex-grown. */
  readonly height?: number | undefined;
  readonly panelRef?: Ref<BoxRenderable> | undefined;
  readonly children: JSX.Element;
}

/**
 * Grid cell chrome: square border with a `[key] Title` binding affordance,
 * accent border when selected. Content is the caller's (info rows, skill
 * lists, placeholders) — this panel owns all border and padding. Vertical
 * padding is zero and only one column sits either side, keeping the grid
 * tight. `flexBasis={0}` (opencode's stack-trace panel pattern) grows the
 * panel from a zero base so grid shares split the cell exactly — with the
 * default `auto` basis, heights leak content size and every state swap
 * (loading to loaded, empty to full) shifts the grid. A `height` pins the
 * cell to a whole row count the caller computed (keeping Yoga's rounding
 * off the bottom border); otherwise `flexBasis={0}` grows it. The body is
 * clipped to the content box (`overflow="hidden"`): a panel too short
 * for its caller's rows cuts the surplus at the border instead of
 * painting it over the border.
 * @param props - title, selection, flex share or fixed height, and content
 * @returns panel element
 */
export const Panel = (props: PanelProps) => (
  <box
    {...(props.panelRef === undefined ? {} : { ref: props.panelRef })}
    {...(props.height === undefined
      ? { flexGrow: props.grow ?? 1, flexBasis: 0 }
      : { height: props.height })}
    flexDirection="column"
    minHeight={0}
    overflow="hidden"
    border
    borderStyle="single"
    borderColor={props.selected ? palette.accent : palette.border}
    backgroundColor={palette.bg}
    title={props.title}
    paddingX={1}
  >
    {props.children}
  </box>
);

export interface PanelMessageProps {
  readonly message: string;
  readonly hint?: string | undefined;
  readonly height?: number | undefined;
}

/**
 * Centered panel state: loaders, missing-extension notes,
 * unimplemented placeholders. Chromeless — the parent `Panel` owns
 * border, title, and padding. The hint line is ALWAYS reserved (blank
 * when absent) so selecting a panel never changes its content height
 * and shifts the grid. A fixed `height` pins the state to a list
 * region's height so state swaps never shift the grid either.
 * @param props - message, optional keybind hint, and optional fixed height
 * @returns message element
 */
export const PanelMessage = (props: PanelMessageProps) => {
  const content = (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
      <text style={{ fg: palette.dim }}>{props.message}</text>
      {props.hint !== undefined ? (
        <text style={{ fg: palette.accent }}>{props.hint}</text>
      ) : (
        <text> </text>
      )}
    </box>
  );
  return props.height === undefined ? (
    content
  ) : (
    <box flexDirection="column" height={props.height} minHeight={0}>
      {content}
    </box>
  );
};
