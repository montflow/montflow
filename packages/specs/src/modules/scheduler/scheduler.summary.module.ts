import { Effect, FileSystem } from 'effect';

import { DEFAULT_GATE_CONFIG, RUN_PANEL_TERMINAL_LIMIT } from './scheduler.module.js';
import {
  type RunState,
  isTerminal,
  lastTouchedAt,
  leaseExpired,
  listRunStates,
} from './scheduler.state.module.js';
/** Summary of the workspace run states, for `status`. */
export interface RunSummary {
  /** Runs whose owner still holds a live lease. */
  readonly inFlight: number;
  /** Waiters registered across every run. */
  readonly queued: number;
  /** Runs whose lease expired or that were reclaimed. */
  readonly stale: number;
  /** Heavy-lane bound the workspace config declares. */
  readonly lanes: number;
  /** Epoch milliseconds the summary was computed at, for elapsed display. */
  readonly at: number;
  /** Every run state, sorted by key. */
  readonly runs: ReadonlyArray<RunState>;
}

/**
 * Summarize the workspace run states: how many are live, how many waiters are
 * queued, and how many leases are stale.
 * @param workspace - workspace root
 * @param now - current epoch milliseconds
 * @param lanes - heavy-lane bound to display
 * @returns the summary
 */
export const runSummary = (
  workspace: string,
  now: number,
  lanes: number = DEFAULT_GATE_CONFIG.heavy.lanes,
): Effect.Effect<RunSummary, never, FileSystem.FileSystem> =>
  listRunStates(workspace).pipe(
    Effect.map((runs) => {
      const live = runs.filter((run) => !isTerminal(run));
      const terminal = runs
        .filter(isTerminal)
        .toSorted((left, right) => lastTouchedAt(right) - lastTouchedAt(left))
        .slice(0, RUN_PANEL_TERMINAL_LIMIT);
      return {
        inFlight: runs.filter((run) => run.state === 'running' && !leaseExpired(run, now)).length,
        queued: runs.reduce((total, run) => total + run.waiters.length, 0),
        stale: runs.filter(
          (run) => run.state === 'expired' || (run.state === 'running' && leaseExpired(run, now)),
        ).length,
        lanes,
        at: now,
        // The panel is for live runs plus the recent terminal window, so an
        // edit history of keys cannot grow the output without bound.
        runs: [...live, ...terminal],
      };
    }),
  );
