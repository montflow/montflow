import type { CommandInvocation } from '@opencode/plugin/effect/command';
import { Effect } from 'effect';
import type { SessionDispatchPort } from '../ports/session-dispatch/index.js';

/** Tone of one command reply; carried for future host-side styling. */
export type ReplyTone = 'info' | 'warning' | 'error';

/** Queue-and-flush surface a server command uses instead of a toast channel. */
export interface CommandReply {
  /** Queue one line; it posts when {@link flush} runs. */
  readonly notify: (message: string, tone?: ReplyTone) => void;
  /** Post every queued line into the invoking session, in order. */
  readonly flush: () => Effect.Effect<void>;
}

/**
 * Build a reply channel over the host session. The host gives a server
 * command no toast or dialog, so text reaches the user only by prompting the
 * session that invoked the command. Messages queue because command handlers
 * render synchronously, then flush once the work settles.
 *
 * @param session - server session seam
 * @param invocation - the slash invocation that owns the reply
 * @returns queue-and-flush reply channel
 */
export const makeCommandReply = (
  session: SessionDispatchPort,
  invocation: CommandInvocation,
): CommandReply => {
  const pending: Array<{ readonly message: string; readonly tone: ReplyTone }> = [];

  return {
    notify: (message, tone = 'info') => {
      pending.push({ message, tone });
    },
    flush: () =>
      Effect.forEach(
        pending.splice(0),
        (entry) =>
          session.prompt(invocation.sessionID, entry.message, invocation.delivery).pipe(
            // A failed reply must not abort the command, but it must leave a trace.
            Effect.catchCause((cause) =>
              Effect.logWarning(
                `command reply could not be posted to ${invocation.sessionID}: ${String(cause)}`,
              ),
            ),
          ),
        { discard: true },
      ),
  };
};
