import { Clock, Effect } from 'effect';

/**
 * The one instant format every generated record carries: UTC, second
 * precision, `Z` suffix. `stamp`, `mail`, and the gate records all read this
 * pattern, so a hand-typed timestamp is rejected by the same rule the writer
 * follows.
 */
export const ISO_INSTANT_PATTERN =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;

/** The instant pattern as a source string, without anchors, for composed regexes. */
export const ISO_INSTANT_SOURCE = ISO_INSTANT_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '');

/**
 * Format an instant exactly as a generated record carries it: UTC, seconds
 * precision, `Z` suffix.
 * @param millis - milliseconds since the epoch
 * @returns `YYYY-MM-DDTHH:MM:SSZ`
 */
export const instant = (millis: number): string =>
  new Date(millis).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * The current instant, formatted for a record. This is the helper the `stamp`
 * verb and every generator share, so no agent ever types a timestamp.
 */
export const stampNow: Effect.Effect<string> = Clock.currentTimeMillis.pipe(Effect.map(instant));

/** True when `value` is one record instant. */
export const isInstant = (value: string): boolean => ISO_INSTANT_PATTERN.test(value);
