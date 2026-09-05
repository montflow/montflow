import { Schema } from 'effect';
import { Id as RunId } from '../run/run.module.ts';

/** Who produced the line. Pointer events use `system` with `subrunId` set. */
export const Role = Schema.Literals(['user', 'assistant', 'system']);

/** Who produced the line. */
export type Role = typeof Role.Type;

/**
 * One `session.jsonl` line. Appended live, replayed in `seq` order on resume.
 *
 * Subrun pointers are system lines with `subrunId` set — no second class,
 * query by presence of the field.
 */
export class Event extends Schema.Class<Event>('Event')({
  seq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  role: Role,
  text: Schema.String.check(Schema.isMinLength(1)),
  at: Schema.String.check(Schema.isMinLength(1)),
  subrunId: Schema.optionalKey(RunId),
}) {}

/**
 * Decode untrusted input (session.jsonl lines, RPC payloads) into an `Event`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Event);

/**
 * Encode an `Event` for appending (`session.jsonl`).
 */
export const encode = Schema.encodeSync(Event);
