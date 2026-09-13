/** Delivery channel a notification is emitted through. */
export type Channel = 'phone' | 'push' | 'desktop';

/** Channels this package names. Adapters implement delivery per channel. */
export const CHANNELS: ReadonlyArray<Channel> = ['phone', 'push', 'desktop'];

/** Minimal descriptor of a notification. */
export interface PiNotification {
  readonly title: string;
  readonly body: string;
  readonly channel: Channel;
}

/** Input for {@link make}: channel defaults to `desktop`. */
export interface MakeInput {
  readonly title: string;
  readonly body: string;
  readonly channel?: Channel | undefined;
}

/**
 * Create a new notification descriptor, defaulting to the `desktop` channel.
 * @param input - title, body, and optional channel
 * @returns the new notification descriptor
 */
export const make = (input: MakeInput): PiNotification => ({
  title: input.title,
  body: input.body,
  channel: input.channel ?? 'desktop',
});

/**
 * True when `value` names a known delivery channel.
 * @param value - candidate channel name
 * @returns true for `phone`, `push`, and `desktop`
 */
export const isValidChannel = (value: string): value is Channel =>
  CHANNELS.some((channel) => channel === value);
