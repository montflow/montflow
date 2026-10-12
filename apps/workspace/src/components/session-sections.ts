import type { Sessions } from '../services/index.js';

/**
 * True while a session belongs in the sessions panel's always-visible Active
 * section: queued (`pending`), live (`running`), or parked
 * (`awaiting-input`). Terminal sessions are history and stay behind the
 * `A` toggle.
 * @param status - session status
 * @returns active-section flag
 */
export const isActiveSessionStatus = (status: string): boolean =>
  status === 'pending' || status === 'running' || status === 'awaiting-input';

/**
 * Active session rows for the pinned section: the active statuses only, with
 * `running` ahead of the queue. Stable — store order is preserved within
 * each group so the list never reshuffles between live polls.
 * @param rows - filtered session rows
 * @returns active rows, running first
 */
export const activeSessionRows = (
  rows: ReadonlyArray<Sessions.SessionSummary>,
): ReadonlyArray<Sessions.SessionSummary> => [
  ...rows.filter((row) => row.status === 'running'),
  ...rows.filter((row) => isActiveSessionStatus(row.status) && row.status !== 'running'),
];

/**
 * Flat selectable rows in panel display order: the Active section first,
 * then the full filtered list while the All section is expanded.
 * Highlight navigation walks this list, so headers stay unselectable and
 * movement crosses sections without special cases.
 * @param active - always-visible Active rows (running first)
 * @param all - full filtered list backing the All section
 * @param showAll - whether the All section is expanded
 * @returns selectable rows in display order
 */
export const sessionSelectableRows = (
  active: ReadonlyArray<Sessions.SessionSummary>,
  all: ReadonlyArray<Sessions.SessionSummary>,
  showAll: boolean,
): ReadonlyArray<Sessions.SessionSummary> => (showAll ? [...active, ...all] : active);
