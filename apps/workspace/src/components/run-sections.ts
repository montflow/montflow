import type { Runs } from '../services/index.js';

/**
 * True while a run belongs in the runs panel's always-visible Active
 * section: queued (`pending`), live (`running`), or parked
 * (`awaiting-input`). Terminal runs are history and stay behind the
 * `A` toggle.
 * @param status - run status
 * @returns active-section flag
 */
export const isActiveRunStatus = (status: string): boolean =>
  status === 'pending' || status === 'running' || status === 'awaiting-input';

/**
 * Active run rows for the pinned section: the active statuses only, with
 * `running` ahead of the queue. Stable — store order is preserved within
 * each group so the list never reshuffles between live polls.
 * @param rows - filtered run rows
 * @returns active rows, running first
 */
export const activeRunRows = (
  rows: ReadonlyArray<Runs.RunSummary>,
): ReadonlyArray<Runs.RunSummary> => [
  ...rows.filter((row) => row.status === 'running'),
  ...rows.filter((row) => isActiveRunStatus(row.status) && row.status !== 'running'),
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
export const runSelectableRows = (
  active: ReadonlyArray<Runs.RunSummary>,
  all: ReadonlyArray<Runs.RunSummary>,
  showAll: boolean,
): ReadonlyArray<Runs.RunSummary> => (showAll ? [...active, ...all] : active);
