import { Effect, Stream } from 'effect';

/**
 * The one payload shape a subscriber reads. Every host event carries its
 * declared `type` and its `data`; a consumer narrows `data` for its own types.
 */
export interface HostEvent {
  readonly type: string;
  readonly data?: unknown;
}

/**
 * The slice of the host server context `EventPort` needs. The host
 * `subscribe` is generic over the event-type union, which a
 * `string`-constrained method accepts, so the port stays free of the host
 * event schema.
 */
export interface EventContext {
  readonly event?:
    | {
        subscribe<T extends string>(type: T): Stream.Stream<HostEvent, unknown>;
      }
    | undefined;
}

/**
 * Host event stream seam. `subscribe` yields only the named event type; the
 * stream ends when the host stream ends and never fails the caller on a host
 * error (a dropped subscription is an ended stream, not a defect in dispatch).
 */
export interface EventPort {
  readonly subscribe: (type: string) => Stream.Stream<HostEvent, never>;
}

/** Build the event seam over the host event domain. */
export const makeEventPort = (context: EventContext): EventPort => ({
  subscribe: (type) => {
    const domain = context.event;
    if (domain === undefined) {
      return Stream.fromEffect(
        Effect.die(new Error('EventPort requires a server plugin context (ctx.event)')),
      );
    }
    return domain.subscribe(type).pipe(Stream.catchCause(() => Stream.empty));
  },
});
