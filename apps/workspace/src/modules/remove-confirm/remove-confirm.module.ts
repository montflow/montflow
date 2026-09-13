import { Effect } from 'effect';

/** Seconds the remove modal waits before confirm unlocks. Long enough to catch a stray keypress. */
export const REMOVE_CONFIRM_DELAY_S = 3;

/** One countdown tick: step the remaining seconds down, floored at zero. Pure. */
export const tickCountdown = (remaining: number): number => Math.max(0, remaining - 1);

/** True once the countdown has elapsed and confirm is allowed. Pure. */
export const canConfirmRemove = (remaining: number): boolean => remaining <= 0;

/** Focusable remove-modal button. Delete unlocks only after the countdown. */
export type RemoveFocus = 'cancel' | 'delete';

/**
 * Flip the focused modal button. Pure — the caller gates moves on
 * `canConfirmRemove` so focus can never rest on a locked Delete.
 * @param focus - currently focused button
 * @returns the other button
 */
export const toggleRemoveFocus = (focus: RemoveFocus): RemoveFocus =>
  focus === 'cancel' ? 'delete' : 'cancel';

/**
 * One real second. Raw timer, not `Effect.sleep`: Effect Clock fibers
 * never resolve inside the OpenTUI render loop — only raw timers fire
 * (same constraint as the toast `later` helper and the `Loader`
 * spinner in `app.tsx`). Wrapped as an Effect so the countdown below
 * stays in the Effect graph.
 */
export const waitSecond: Effect.Effect<void> = Effect.promise(
  () =>
    // oxlint-disable-next-line montflow/no-timers -- documented above: Effect Clock hangs here.
    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
);

/**
 * Run the remove-confirm countdown: wait one step, report the ticked
 * remaining, repeat until zero. `wait` injects the clock — production
 * passes `waitSecond`, tests pass `Effect.void` for instant ticks.
 * Never fails; the caller owns cancellation by ignoring ticks after
 * the modal closes.
 * @param remaining - seconds left when the modal opens
 * @param onTick - receives each ticked remaining (down to zero)
 * @param wait - one-step clock, defaults to the raw-timer second
 */
export const countdown = (
  remaining: number,
  onTick: (ticked: number) => void,
  wait: Effect.Effect<void> = waitSecond,
): Effect.Effect<void> =>
  remaining <= 0
    ? Effect.void
    : wait.pipe(
        Effect.flatMap(() => Effect.sync(() => onTick(tickCountdown(remaining)))),
        Effect.flatMap(() => countdown(tickCountdown(remaining), onTick, wait)),
      );
