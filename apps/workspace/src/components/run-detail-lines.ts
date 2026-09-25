import type { Runs } from '../services/index.js';
import { isLiveRunStatus } from './run-detail-keys.js';

/**
 * Transcript line glyph by role: user `›`, assistant `◈`, system and
 * tool results `·`. Pure — shared by the renderer and its tests.
 * @param role - event role
 * @returns one-glyph marker
 */
export const runRoleMarker = (role: string): string =>
  role === 'user' ? '›' : role === 'assistant' ? '◈' : '·';

/**
 * Transcript lines for the detail body: role marker plus text, in `seq`
 * order. Pure so the renderer and its tests share one projection.
 * @param detail - run detail
 * @returns one line per event
 */
export const runTranscriptLines = (detail: Runs.RunDetail): ReadonlyArray<string> =>
  detail.events.map((event) => `${runRoleMarker(event.role)} ${event.text}`);

/**
 * The parked question for an `awaiting-input` run: the last `system`
 * transcript line (the engine appends the `ask_user` question there).
 * @param detail - run detail
 * @returns question text, or undefined when the run is not parked
 */
export const parkedQuestion = (detail: Runs.RunDetail): string | undefined => {
  if (detail.summary.status !== 'awaiting-input') return undefined;
  return detail.events.findLast((event) => event.role === 'system')?.text;
};

/**
 * Live-state suffix for the status line: `live` while running, a call to
 * action while parked, undefined once the run settles.
 * @param status - run status, if loaded
 * @returns suffix copy, or undefined when not live
 */
export const liveNote = (status: string | undefined): string | undefined =>
  status === 'awaiting-input'
    ? 'waiting for your answer'
    : isLiveRunStatus(status)
      ? 'live'
      : undefined;
