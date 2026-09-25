import type { DetailAction } from './detail-actions.js';
import { Keybinds, formatKeybinds } from './keybinds.js';

/** Detail body mode: truncated preview or scrollable full view. */
export type RunDetailMode = 'preview' | 'view';

/**
 * True while a run is live: running or parked awaiting input. Terminal
 * statuses (`done`/`failed`/`cancelled`) are not live.
 * @param status - run status, if loaded
 * @returns live flag
 */
export const isLiveRunStatus = (status: string | undefined): boolean =>
  status === 'running' || status === 'awaiting-input';

/**
 * One run-detail intent: the action a keypress performs. Keeps dispatch
 * in `app.tsx` free of keystroke strings and testable without a renderer.
 */
export type RunDetailIntent =
  | 'close'
  | 'quit'
  | 'toggle-view'
  | 'refresh'
  | 'interrupt'
  | 'steer'
  | 'answer'
  | 'activate'
  | 'menu-up'
  | 'menu-down'
  | 'scroll-up'
  | 'scroll-down';

/**
 * Map a keypress to a run-detail intent. `j`/`k` scroll in full view and
 * move the action menu otherwise; `s` steers and `a` answers — the caller
 * guards both by status. `x` is gated here on {@link isLiveRunStatus} so
 * the raw key never disagrees with the menu/hint on a settled run.
 * `esc` always closes the detail; `x` is the sole interrupt route — D003's
 * detail UI supersedes D001's esc-interrupt touch-point.
 * @param key - pressed key (name plus raw sequence)
 * @param mode - preview or full-view mode
 * @param status - run status, if loaded
 * @returns intent, or undefined when the key is unbound
 */
export const runDetailIntent = (
  key: { readonly name: string; readonly sequence: string },
  mode: RunDetailMode,
  status: string | undefined,
): RunDetailIntent | undefined => {
  if (key.name === 'escape') return 'close';
  if (key.name === 'q') return 'quit';
  if (key.sequence === 'v') return 'toggle-view';
  if (key.sequence === 'R') return 'refresh';
  if (key.sequence === 'x') return isLiveRunStatus(status) ? 'interrupt' : undefined;
  if (key.sequence === 's') return 'steer';
  if (key.sequence === 'a') return 'answer';
  if (key.name === 'enter' || key.name === 'return') return 'activate';
  if (key.name === 'up') return 'menu-up';
  if (key.name === 'down') return 'menu-down';
  if (key.sequence === 'j') return mode === 'view' ? 'scroll-down' : 'menu-down';
  if (key.sequence === 'k') return mode === 'view' ? 'scroll-up' : 'menu-up';
  return undefined;
};

/**
 * Action-menu rows for the open run detail: view toggle plus the live
 * controls (`s` steer while running, `x` interrupt while live, `a` answer
 * while parked) and back. Mirrors the keybinds so menu and keys never
 * drift.
 * @param status - run status, if loaded
 * @param mode - preview or full-view mode
 * @returns menu actions in display order
 */
export const runDetailActions = (
  status: string | undefined,
  mode: RunDetailMode,
): ReadonlyArray<DetailAction> => {
  const actions: Array<DetailAction> = [
    {
      id: 'toggle-view',
      label: mode === 'view' ? 'Show preview' : 'Show full view',
      hint: 'v',
    },
  ];
  if (status === 'running') actions.push({ id: 'steer', label: 'Steer run', hint: 's' });
  if (isLiveRunStatus(status)) actions.push({ id: 'interrupt', label: 'Interrupt run', hint: 'x' });
  if (status === 'awaiting-input')
    actions.push({ id: 'answer', label: 'Answer question', hint: 'a' });
  actions.push({ id: 'back', label: 'Back', hint: 'esc' });
  return actions;
};

/**
 * Status-bar hint for the open run detail: navigation, view toggle, and
 * the live controls for the run's current status.
 * @param status - run status, if loaded
 * @param mode - preview or full-view mode
 * @returns one-line hint copy
 */
export const runDetailHint = (status: string | undefined, mode: RunDetailMode): string =>
  formatKeybinds([
    Keybinds.menuNavigate(),
    Keybinds.selectRow(),
    ...(mode === 'view' ? [Keybinds.scroll(), Keybinds.showPreview()] : [Keybinds.showFull()]),
    ...(status === 'running' ? [Keybinds.steer()] : []),
    ...(isLiveRunStatus(status) ? [Keybinds.interrupt()] : []),
    ...(status === 'awaiting-input' ? [Keybinds.answer()] : []),
    Keybinds.refresh(),
    Keybinds.back(),
  ]);
