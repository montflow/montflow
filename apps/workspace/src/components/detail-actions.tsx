import { For } from 'solid-js';
import { palette } from './palette.js';

/** Selectable detail action id. `toggle-view` flips preview/view, the rest map to existing detail keys. Runs add `interrupt` (stop a live run) and `answer` (reply to a parked run). */
export type DetailActionId = 'toggle-view' | 'modify' | 'delete' | 'interrupt' | 'answer' | 'back';

export interface DetailAction {
  readonly id: DetailActionId;
  readonly label: string;
  readonly hint: string;
}

export interface DetailActionsProps {
  readonly actions: ReadonlyArray<DetailAction>;
  readonly highlight: number;
}

/**
 * Detail action menu: vertical option list with the highlighted row
 * inverted, mirroring `MenuDialog` rows. Dumb — the caller owns
 * highlight state and Enter activation so keybinds (`m`/`d`/`v`/`esc`)
 * keep working alongside menu navigation. Each row shows the label
 * plus its key hint on the right.
 * @param props - actions and highlight index
 * @returns action menu element
 */
export const DetailActions = (props: DetailActionsProps) => (
  <box flexDirection="column" flexGrow={1} minHeight={0}>
    <For each={props.actions}>
      {(action, index) => (
        <box backgroundColor={index() === props.highlight ? palette.highlight : palette.bg}>
          <box flexDirection="row" justifyContent="space-between" flexGrow={1}>
            <text style={{ fg: palette.text }}>
              {index() === props.highlight ? `▸ ${action.label}` : `  ${action.label}`}
            </text>
            <text style={{ fg: palette.dim }}>{action.hint}</text>
          </box>
        </box>
      )}
    </For>
  </box>
);
