import { RGBA } from '@opentui/core';
import type { JSX } from 'solid-js';
import { palette } from './palette.js';

export interface ModalProps {
  readonly children: JSX.Element;
  readonly minWidth?: number | undefined;
  readonly maxWidth?: number | undefined;
  readonly maxHeight?: number | undefined;
}

/**
 * Shared modal shell: dimmed fullscreen backdrop with a centered
 * frame (accent border, standard padding and gap). The frame is capped
 * (`maxWidth` 64, `maxHeight` 18) with clipped overflow, so dictated
 * or pasted user input can never stretch a dialog past the terminal —
 * growing regions (input values, option lists) scroll or window
 * internally instead. Content owns its own copy, alignment, and
 * buttons — this shell only frames, so every dialog shares one
 * backdrop. Mounted absolutely so the grid never rebalances.
 * @param props - dialog content plus optional frame width (default 48) and caps
 * @returns modal overlay element
 */
export const Modal = (props: ModalProps) => (
  <box
    position="absolute"
    left={0}
    right={0}
    top={0}
    bottom={1}
    backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    justifyContent="center"
    alignItems="center"
  >
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={palette.accent}
      backgroundColor={palette.bg}
      padding={1}
      gap={1}
      minWidth={props.minWidth ?? 48}
      maxWidth={props.maxWidth ?? 64}
      maxHeight={props.maxHeight ?? 18}
      overflow="hidden"
    >
      {props.children}
    </box>
  </box>
);
