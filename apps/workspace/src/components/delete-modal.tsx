import { Show } from 'solid-js';
import { KeybindBanner } from './keybind-banner.js';
import { Keybinds } from './keybinds.js';
import { Modal } from './modal.js';
import { palette } from './palette.js';

/** Focusable delete-modal button. Delete unlocks only after the countdown. */
export type DeleteModalFocus = 'back' | 'delete';

export interface DeleteModalProps {
  readonly title: string;
  readonly message: string;
  readonly remaining: number;
  readonly deleting: boolean;
  readonly focus: DeleteModalFocus;
}

/**
 * Minimalist delete-confirm modal: centered title plus message, one
 * reserved status line (`Removing…` while deleting, blank otherwise),
 * Back and Delete always visible in a centered row, then the keybind
 * hint. The countdown lives in exactly one place — the dimmed Delete
 * label (`Delete (3s)`) — turning red once unlocked. Dumb — the caller
 * owns focus, countdown, key routing, and the delete Effect. Framed by
 * the shared `Modal` shell.
 * @param props - title, message, seconds left, deleting flag, focused button
 * @returns delete-confirm overlay element
 */
export const DeleteModal = (props: DeleteModalProps) => {
  const locked = () => props.remaining > 0 || props.deleting;
  const deleteLabel = () => (props.remaining > 0 ? `Delete (${props.remaining}s)` : 'Delete');
  return (
    <Modal minWidth={48}>
      <box flexDirection="column" alignItems="center" gap={1}>
        <text style={{ fg: palette.text }}>{props.title}</text>
        <text style={{ fg: palette.dim }}>{props.message}</text>
        <text style={{ fg: props.deleting ? palette.text : palette.dim }}>
          {props.deleting ? 'Removing…' : ' '}
        </text>
        <box flexDirection="row" justifyContent="center" gap={2}>
          <box
            backgroundColor={
              props.focus === 'back' && !props.deleting ? palette.highlight : palette.bg
            }
            paddingLeft={1}
            paddingRight={1}
          >
            <text style={{ fg: props.focus === 'back' ? palette.text : palette.dim }}>
              {props.focus === 'back' ? '▸ Back' : '  Back'}
            </text>
          </box>
          <box
            backgroundColor={props.focus === 'delete' && !locked() ? palette.highlight : palette.bg}
            paddingLeft={1}
            paddingRight={1}
          >
            <text style={{ fg: locked() ? palette.dim : palette.bad }}>
              {props.focus === 'delete' && !locked() ? `▸ ${deleteLabel()}` : `  ${deleteLabel()}`}
            </text>
          </box>
        </box>
        <Show when={!props.deleting} fallback={<text> </text>}>
          <KeybindBanner
            items={
              props.remaining > 0
                ? [Keybinds.cancel()]
                : [
                    Keybinds.modalSelect(),
                    Keybinds.choose(),
                    Keybinds.confirmYes(),
                    Keybinds.cancel(),
                  ]
            }
          />
        </Show>
      </box>
    </Modal>
  );
};
