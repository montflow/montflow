/** @jsxImportSource @opentui/solid */
import { Show } from 'solid-js';
import type { Workspace } from '../modules/index.js';
import { palette } from './palette.js';

export interface InfoPanelProps {
  readonly info: Workspace.Info;
  /** Current prompt model, read through the adapter `ModelPort`; absent when the host has none. */
  readonly model?: string | undefined;
}

/**
 * Workspace info content: name, root, branch, clean/dirty state, and the
 * host's selected model as label/value rows. Chromeless — the parent `Panel`
 * owns border, title, and padding.
 * @param props - resolved workspace info and optional model label
 * @returns info content element
 */
export const InfoPanel = (props: InfoPanelProps) => (
  <box flexDirection="column" flexGrow={1}>
    <text>
      <span style={{ fg: palette.dim }}>workspace </span>
      <span style={{ fg: palette.accent }}>{props.info.name}</span>
    </text>
    <text>
      <span style={{ fg: palette.dim }}>root </span>
      {props.info.root}
    </text>
    <text>
      <span style={{ fg: palette.dim }}>branch </span>
      {props.info.branch}{' '}
      <span style={{ fg: props.info.clean ? palette.good : palette.bad }}>
        {props.info.clean ? '✓ clean' : '✗ dirty'}
      </span>
    </text>
    <Show when={props.model}>
      <text>
        <span style={{ fg: palette.dim }}>model </span>
        {props.model}
      </text>
    </Show>
  </box>
);
