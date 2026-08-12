import { connect } from 'node:net';

/**
 * herdr pane agent-state reporting.
 *
 * herdr (the terminal multiplexer) tracks per-pane agent state. Its own pi
 * integration reports the MAIN session's `agent_start`/`agent_end` events —
 * but the workspace's agents run in background sessions while
 * the main session sits idle, so herdr shows the pane as idle mid-loop. This
 * module speaks herdr's `pane.report_agent` socket protocol directly (same
 * shape as herdr's integration): the loop reports `working` (heartbeat-
 * refreshed) while it runs and `idle` when it ends. No-op outside a herdr
 * pane.
 */

/** States herdr tracks per pane (subset of herdr's pane.report_agent protocol). */
export type HerdrAgentState = 'working' | 'idle';

/**
 * Heartbeat while the loop runs: keeps the `working` report fresh (and our
 * seq above any stale report another reporter might emit during the loop).
 */
export const HERDR_HEARTBEAT_MS = 30_000;

/** Report timeout: a quick 500ms attempt, retried once at 1500ms. */
const SEND_TIMEOUT_MS = 500;
const SEND_RETRY_TIMEOUT_MS = 1500;

/** Monotonic report seq — herdr resolves concurrent reporters by seq. */
let seq = Date.now() * 1000;

const nextSeq = (): number => {
  seq += 1;
  return seq;
};

/** True when running inside a herdr pane with the report socket available. */
export const herdrEnabled = (): boolean =>
  process.env.HERDR_ENV === '1' &&
  process.env.HERDR_SOCKET_PATH !== undefined &&
  process.env.HERDR_SOCKET_PATH !== '' &&
  process.env.HERDR_PANE_ID !== undefined &&
  process.env.HERDR_PANE_ID !== '';

/**
 * Sends one newline-delimited JSON request to the herdr socket and waits for
 * any ack data. Never throws — a delivery failure resolves false.
 * @param {unknown} request The request payload
 * @param {number} timeoutMs Timeout for this attempt
 * @returns True when the request was acknowledged
 */
const sendOnce = (request: unknown, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socketPath = process.env.HERDR_SOCKET_PATH;
    if (socketPath === undefined || socketPath === '') {
      resolve(false);
      return;
    }
    let done = false;
    const socket = connect(socketPath);
    const finish = (delivered: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(delivered);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    socket.on('error', () => finish(false));
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', () => finish(true));
    socket.on('end', () => finish(false));
  });

/**
 * Reports the loop's agent state to herdr's pane. Best-effort and fully
 * non-blocking for the loop: a failed send never fails a review pass. No-op
 * outside a herdr pane.
 * @param {HerdrAgentState} state `working` while agents run, `idle` at the end
 * @param {string} [message] Human-readable detail (phase/progress), shown by herdr
 * @returns Nothing
 */
export const reportHerdrState = async (
  state: HerdrAgentState,
  message?: string,
): Promise<void> => {
  if (!herdrEnabled()) return;
  const request = {
    id: `workspace:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    method: 'pane.report_agent',
    params: {
      pane_id: process.env.HERDR_PANE_ID,
      source: 'herdr:pi',
      agent: 'pi',
      state,
      message,
      seq: nextSeq(),
    },
  };
  if (await sendOnce(request, SEND_TIMEOUT_MS)) return;
  await sendOnce(request, SEND_RETRY_TIMEOUT_MS);
};