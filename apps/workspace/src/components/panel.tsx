import type { BoxRenderable } from '@opentui/core';
import type { JSX, Ref } from 'solid-js';
import { palette } from './palette.js';

export interface PanelProps {
  readonly title: string;
  readonly selected: boolean;
  readonly grow?: number;
  readonly panelRef?: Ref<BoxRenderable> | undefined;
  readonly children: JSX.Element;
}

/**
 * Grid cell chrome: rounded border with a `[key] Title` binding affordance,
 * accent border when selected. Content is the caller's (info rows, skill
 * lists, placeholders) — this panel owns all border and padding.
 * `flexBasis={0}` (opencode's stack-trace panel pattern) grows the panel
 * from a zero base so grid shares split the cell exactly — with the
 * default `auto` basis, heights leak content size and every state swap
 * (loading to loaded, empty to full) shifts the grid.
 * @param props - title, selection, flex share, and content
 * @returns panel element
 */
export const Panel = (props: PanelProps) => (
  <box
    {...(props.panelRef === undefined ? {} : { ref: props.panelRef })}
    flexGrow={props.grow ?? 1}
    flexBasis={0}
    flexDirection="column"
    minHeight={0}
    border
    borderStyle="rounded"
    borderColor={props.selected ? palette.accent : palette.border}
    title={props.title}
    padding={1}
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
