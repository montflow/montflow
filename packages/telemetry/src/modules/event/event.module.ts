// oxlint-disable-next-line montflow/no-node-platform-imports -- the ingest path is deliberately dependency-free: `node:crypto` hashes message bodies, and the telemetry package has no Effect runtime to provide a Crypto service to.
import { createHash } from 'node:crypto';
import { Option, Schema } from 'effect';

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
  readonly variant?: string;
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

const ALWAYS = new Set<string>(TYPES);
const DELTAS = new Set<string>(DELTA_TYPES);

/** Fields treated as message bodies: hashed by default, kept when opted in. */
interface BodyFieldMap {
  readonly [type: string]: readonly string[];
}

const BODY_FIELDS: BodyFieldMap = {
  'session.compaction.started': ['recent'],
  'session.compaction.ended': ['text', 'recent'],
  'session.compaction.delta': ['text'],
  'session.tool.called': ['input'],
  'session.tool.success': ['content'],
  'session.tool.failed': ['content'],
  'session.inbox.enqueued': ['item'],
  'session.text.delta': ['delta'],
  'session.reasoning.delta': ['delta'],
  'session.tool.input.delta': ['delta'],
  'permission.asked': ['message', 'metadata'],
};

/** The host event shape after boundary decoding: unknown keys dropped. */
const Incoming = Schema.Struct({
  type: Schema.String,
  created: Schema.optional(Schema.Number),
  data: Schema.optional(Schema.JsonObject),
});

const decodeEvent = Schema.decodeUnknownOption(Incoming);

const asString = (value: JsonValue | undefined): string | undefined =>
  value === undefined
    ? undefined
    : Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(value));

const asObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value === undefined
    ? undefined
    : Option.getOrUndefined(Schema.decodeUnknownOption(Schema.JsonObject)(value));

interface MutableModel {
  providerID: string;
  id: string;
  variant?: string;
}

const asModel = (value: JsonValue | undefined): Model | undefined => {
  const object = asObject(value);
  if (object === undefined) return undefined;
  const providerID = asString(object['providerID']);
  const id = asString(object['id']);
  if (providerID === undefined || id === undefined) return undefined;
  const model: MutableModel = { providerID, id };
  const variant = asString(object['variant']);
  if (variant !== undefined) model.variant = variant;
  return model;
};

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Replace a body with its digest, byte length, and redaction marker. */
const digest = (value: JsonValue): JsonObject => {
  const text = asString(value) ?? JSON.stringify(value);
  return {
    redacted: true,
    sha256: sha256(text),
    bytes: new TextEncoder().encode(text).byteLength,
  };
};

/** Mutable working copy used while redacting body fields. */
interface MutableJsonObject {
  [key: string]: JsonValue;
}

const redact = (data: JsonObject, type: string, captureBodies: boolean): JsonObject => {
  if (captureBodies) return data;
  const fields = BODY_FIELDS[type];
  if (fields === undefined) return data;
  const payload: MutableJsonObject = { ...data };
  for (const field of fields) {
    const value = payload[field];
    if (value !== undefined) payload[field] = digest(value);
  }
  return payload;
};

/** Whether a type passes the allowlist under the current capture settings. */
export const admits = (type: string, captureDeltas: boolean): boolean =>
  ALWAYS.has(type) || (captureDeltas && DELTAS.has(type));

/**
 * Extract one normalized line. A denied type, a missing session id, or a host
 * shape the schema rejects yields `undefined`: the event is skipped, never fatal.
 */
export const extract = (
  input: IncomingInput,
  settings: { readonly captureDeltas: boolean; readonly captureBodies: boolean },
  now: number,
): Line | undefined => {
  if (!admits(input.type, settings.captureDeltas)) return undefined;
  const decoded = Option.getOrUndefined(decodeEvent(input));
  if (decoded === undefined) return undefined;
  const data = decoded.data ?? {};
  const sessionID = asString(data['sessionID']);
  if (sessionID === undefined) return undefined;
  const agent = asString(data['agent']);
  const model = asModel(data['model']);
  const line: Line = {
    v: 1,
    ts: decoded.created ?? now,
    type: decoded.type,
    sessionID,
    payload: redact(data, decoded.type, settings.captureBodies),
  };
  if (agent !== undefined) line.agent = agent;
  if (model !== undefined) line.model = model;
  return line;
};
