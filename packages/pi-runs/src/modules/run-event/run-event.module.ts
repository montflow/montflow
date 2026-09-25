import { Schema } from 'effect';
import { Id as RunId } from '../run/run.module.ts';

/** Who produced the line. Pointer events use `system` with `subrunId` set; tool results use `toolResult`. */
export const Role = Schema.Literals(['user', 'assistant', 'system', 'toolResult']);

/** Who produced the line. */
export type Role = typeof Role.Type;

/**
 * One `session.jsonl` line. Appended live, replayed in `seq` order on resume.
 *
 * `text` is the human display projection (drives `run.md`); `message` carries
 * the raw Pi message for lossless replay. Legacy events without `message`
 * replay only when synthesizable (user turns).
 *
 * Subrun pointers are system lines with `subrunId` set — no second class,
 * query by presence of the field.
 */
export class Event extends Schema.Class<Event>('Event')({
  seq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  role: Role,
  text: Schema.String,
  at: Schema.String.check(Schema.isMinLength(1)),
  subrunId: Schema.optionalKey(RunId),
  /** Raw Pi `Message` JSON captured on `message_end`; the replay source of truth. */
  message: Schema.optionalKey(Schema.Unknown),
}) {}

/**
 * Constructor input for {@link Event}. Optional keys are added only when
 * present — callers build the object, then assign conditionally, so exact
 * optional-property typing never widens a value to `undefined`.
 */
export interface EventInput {
  seq: number;
  role: Role;
  text: string;
  at: string;
  subrunId?: RunId;
  message?: unknown;
}

/**
 * Decode untrusted input (session.jsonl lines, RPC payloads) into an `Event`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Event);

/**
 * Encode an `Event` for appending (`session.jsonl`).
 */
export const encode = Schema.encodeSync(Event);
