import type { Message } from '@earendil-works/pi-ai';
import { Option, Schema } from 'effect';
import { RunEvent } from '../run-event/index.js';

/**
 * Replay of a stored transcript into a fresh Pi session. The store is the
 * source of truth: a run started on one machine is committed, pushed, and
 * replayed on another. Pure — callers append the returned messages to a
 * `SessionManager`.
 */

/** The three Pi message roles the store mirrors into a transcript. */
const REPLAY_ROLES = ['user', 'assistant', 'toolResult'] as const;

/** Minimal decoded shape establishing that a raw value is a Pi message. */
const ReplayMessage = Schema.Struct({
  role: Schema.Literals(REPLAY_ROLES),
  content: Schema.Unknown,
});

const decodeReplayMessage = Schema.decodeUnknownOption(ReplayMessage);

/**
 * True when a stored raw `message` decodes to a Pi `Message` shape. Transcripts
 * are untrusted input (committed, pushed, replayed on another machine), so a
 * corrupt or hostile line may carry `null`, a string, an array, or an
 * arbitrary object; only a typed message with a replayable role passes.
 * @param message - stored raw message value
 * @returns true when the value is a replayable Pi message
 */
export const isReplayMessage = (message: RunEvent.Event['message']): message is Message =>
  message !== undefined && Option.isSome(decodeReplayMessage(message));

/**
 * True when one event can seed a Pi session: a valid raw `message`, or a
 * synthesizable user turn, or a skippable system pointer. Assistant and
 * tool-result events without a valid raw `message` are not replayable.
 * @param event - stored transcript event
 * @returns true when the event replays
 */
export const replayable = (event: RunEvent.Event): boolean => {
  if (event.message !== undefined) return isReplayMessage(event.message);
  if (event.role === 'user') return true;
  if (event.role === 'system') return true;
  return false;
};

/**
 * True when every event in a transcript replays.
 * @param events - stored transcript events
 * @returns true when the run is resumable from transcript
 */
export const canReplay = (events: ReadonlyArray<RunEvent.Event>): boolean =>
  events.every((event) => replayable(event));

/** Epoch millis from an event timestamp; `0` when unparseable. */
const timestampOf = (event: RunEvent.Event): number => {
  const parsed = Date.parse(event.at);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Map one event to the Pi message to append, or undefined when the event is
 * not part of LLM context (system pointers) or cannot be replayed.
 * @param event - stored transcript event
 * @returns the message to append, if any
 */
export const toMessage = (event: RunEvent.Event): Message | undefined => {
  if (event.message !== undefined) {
    const raw = event.message;
    return isReplayMessage(raw) ? raw : undefined;
  }
  if (event.role === 'user') {
    return { role: 'user', content: event.text, timestamp: timestampOf(event) };
  }
  return undefined;
};

/**
 * Map a stored transcript to the Pi messages that reconstruct it, in order.
 * Precondition: {@link canReplay} — otherwise assistant/tool-result turns are
 * silently dropped.
 * @param events - stored transcript events
 * @returns messages to append to a fresh session
 */
export const toMessages = (events: ReadonlyArray<RunEvent.Event>): ReadonlyArray<Message> =>
  events.flatMap((event) => {
    const message = toMessage(event);
    return message === undefined ? [] : [message];
  });
