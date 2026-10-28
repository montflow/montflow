import { Option, Schema } from 'effect';
import type { Hash } from '../digest/index.js';

/** JSON value shape the store can serialize; events arrive as JSON already. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

/** JSON object shape of the recorded `payload` field. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Provider/model pair copied from an event's `data.model`. */
export interface Model {
  readonly providerID: string;
  readonly id: string;
  readonly variant?: string | undefined;
}

/** One persisted line. Exactly one JSON object is written per NDJSON line. */
export interface Line {
  v: 1;
  ts: number;
  type: string;
  sessionID: string;
  agent?: string;
  model?: Model;
  payload: JsonObject;
}

/** The minimal host event slice telemetry reads; the host sends more. */
export interface IncomingInput {
  readonly type: string;
  readonly created?: number;
  readonly data?: object;
}

/** Capture settings that decide whether bodies and deltas are persisted. */
export interface Capture {
  readonly captureDeltas: boolean;
  readonly captureBodies: boolean;
}

/** Events always persisted. An explicit allowlist, not a denylist. */
export const TYPES = [
  'session.created',
  'session.execution.started',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
  'session.step.started',
  'session.step.ended',
  'session.step.failed',
  'session.tool.called',
  'session.tool.success',
  'session.tool.failed',
  'session.usage.updated',
  'session.compaction.started',
  'session.compaction.ended',
  'session.compaction.failed',
  'session.retry.scheduled',
  'session.idle',
  'session.inbox.enqueued',
  'permission.asked',
  'permission.replied',
] as const;

/** Streaming deltas, persisted only when `captureDeltas` is on. */
export const DELTA_TYPES = [
  'session.text.delta',
  'session.reasoning.delta',
  'session.tool.input.delta',
  'session.compaction.delta',
] as const;

type AllowedType = (typeof TYPES)[number] | (typeof DELTA_TYPES)[number];

const ALWAYS = new Set<string>(TYPES);
const DELTAS = new Set<string>(DELTA_TYPES);

/**
 * Fields treated as message bodies: hashed by default, kept when opted in.
 * Delta text is intentionally absent: `captureDeltas` is the opt-in that makes
 * a delta readable, so delta payloads skip body hashing. `session.created.slug`
 * is a project identifier, not conversation content, and stays verbatim.
 */
const BODY_FIELDS = new Map<AllowedType, readonly string[]>([
  ['session.created', ['title', 'metadata']],
  ['session.compaction.started', ['recent']],
  ['session.compaction.ended', ['text', 'recent']],
  ['session.compaction.failed', []],
  ['session.tool.called', ['input']],
  ['session.tool.success', ['content']],
  ['session.tool.failed', ['content']],
  ['session.inbox.enqueued', ['item']],
  ['permission.asked', ['message', 'metadata']],
]);

const bodyFields = (type: AllowedType): readonly string[] | undefined => BODY_FIELDS.get(type);

/** Whether a string is one of the allowlisted types, independent of capture flags. */
const isKnownType = (type: string): type is AllowedType => ALWAYS.has(type) || DELTAS.has(type);

/** The host event shape after boundary decoding: unknown keys dropped. */
const Incoming = Schema.Struct({
  type: Schema.String,
  created: Schema.optional(Schema.Number),
  data: Schema.optional(Schema.JsonObject),
});

const ModelSchema = Schema.Struct({
  providerID: Schema.String,
  id: Schema.String,
  variant: Schema.optional(Schema.String),
});

/** The persisted line contract, shared by the tail reader. */
export const LineSchema = Schema.Struct({
  v: Schema.Literal(1),
  ts: Schema.Number,
  type: Schema.String,
  sessionID: Schema.String,
  agent: Schema.optional(Schema.String),
  model: Schema.optional(ModelSchema),
  payload: Schema.JsonObject,
});

const decodeEvent = Schema.decodeUnknownOption(Incoming);
const decodeModel = Schema.decodeUnknownOption(ModelSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);
export const decodeLine = Schema.decodeUnknownOption(LineSchema);

/** Largest timestamp a JavaScript Date can represent, in milliseconds. */
const MAX_TS = 8_640_000_000_000_000;

const asString = (value: JsonValue | undefined): string | undefined =>
  value === undefined ? undefined : Option.getOrUndefined(decodeString(value));

const asModel = (value: JsonValue | undefined): Model | undefined =>
  value === undefined ? undefined : Option.getOrUndefined(decodeModel(value));

/** Replace a body with its digest, byte length, and redaction marker. */
const digest = (value: JsonValue, hash: Hash): JsonObject => {
  const text = asString(value) ?? JSON.stringify(value);
  return {
    redacted: true,
    sha256: hash(text),
    bytes: new TextEncoder().encode(text).byteLength,
  };
};

const redact = (data: JsonObject, type: AllowedType, settings: Capture, hash: Hash): JsonObject => {
  if (settings.captureBodies) return data;
  if (settings.captureDeltas && DELTAS.has(type)) return data;
  const fields = bodyFields(type);
  if (fields === undefined || fields.length === 0) return data;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      fields.includes(key) ? digest(value, hash) : value,
    ]),
  );
};

/** Whether a type passes the allowlist under the current capture settings. */
export const admits = (type: string, captureDeltas: boolean): boolean =>
  ALWAYS.has(type) || (captureDeltas && DELTAS.has(type));

/** Clamp an out-of-range event timestamp to the caller's clock. */
const timestamp = (created: number | undefined, now: number): number =>
  created !== undefined && Number.isFinite(created) && Math.abs(created) <= MAX_TS ? created : now;

/**
 * Extract one normalized line. A denied type, a missing session id, an
 * out-of-range timestamp, or a host shape the schema rejects yields a safe
 * value: the event is skipped or its timestamp falls back, never fatal.
 */
export const extract = (
  input: IncomingInput,
  settings: Capture,
  now: number,
  hash: Hash,
): Line | undefined => {
  if (!admits(input.type, settings.captureDeltas)) return undefined;
  const decoded = Option.getOrUndefined(decodeEvent(input));
  if (decoded === undefined) return undefined;
  const type = decoded.type;
  if (!isKnownType(type)) return undefined;
  const data = decoded.data ?? {};
  const sessionID = asString(data['sessionID']);
  if (sessionID === undefined) return undefined;
  const agent = asString(data['agent']);
  const model = asModel(data['model']);
  const line: Line = {
    v: 1,
    ts: timestamp(decoded.created, now),
    type,
    sessionID,
    payload: redact(data, type, settings, hash),
  };
  if (agent !== undefined) line.agent = agent;
  if (model !== undefined) line.model = model;
  return line;
};
