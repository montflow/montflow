import { Clock, Effect, Schema } from 'effect';

/** Characters a session id may hold, mirroring the {@link Id} check without the brand. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * True when `id` is a safe session directory name (no traversal, no blanks).
 * Unbranded twin of the {@link Id} schema check, for hosts that must
 * validate before they can build a branded value.
 * @param id - candidate session id
 * @returns true for safe ids
 */
export const isValidId = (id: string): boolean =>
  id.length >= 1 && id.length <= 64 && ID_PATTERN.test(id);

/**
 * Slugify a session name into a directory-safe id: lowercase,
 * non-alphanumerics to hyphens, collapsed and trimmed, capped at 48
 * chars with a time suffix for uniqueness. The suffix is the full
 * millisecond timestamp in base36 — a modulo suffix wrapped every
 * ~28 minutes, colliding same-named sessions created a cycle apart.
 * @param name - display name the id is derived from
 * @param now - timestamp millis (Clock time at the call site; injected in tests)
 * @returns slug id
 */
export const slugifyName = (name: string, now: number): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
    .replace(/-+$/g, '');
  const base = slug === '' ? 'session' : slug;
  return `${base}-${now.toString(36)}`;
};

/**
 * Slug a fresh session id from a display name using the Effect `Clock` (no
 * wall-clock reads, so tests can drive time). Every surface that
 * dispatches a session mints its id here, so session naming reads the same
 * whether a host dispatches from a TUI or an extension.
 * @param name - display name for the session
 * @returns Effect resolving to a directory-safe session id
 */
export const newId = (name: string): Effect.Effect<string> =>
  Clock.currentTimeMillis.pipe(Effect.map((now) => slugifyName(name, now)));

/**
 * Directory-safe identifier. Matches the session directory name.
 * Scoped: use as `Session.Id`. Scalar brand, not a Class (Class models structs).
 */
export const Id = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
).pipe(Schema.brand('SessionId'));

/** Branded session identifier. */
export type Id = typeof Id.Type;

/** Lifecycle status of a session. `awaiting-input` parks a live session while it waits on user answers; `cancelled` is a terminal interrupt. */
export const STATUSES = [
  'pending',
  'running',
  'awaiting-input',
  'done',
  'failed',
  'cancelled',
] as const;

export const Status = Schema.Literals(STATUSES);

/** Lifecycle status of a session. */
export type Status = typeof Status.Type;

/** Reasoning effort levels a session's Pi session can use. Mirrors Pi's own `ThinkingLevel`. */
export const ThinkingLevel = Schema.Literals([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

/** Reasoning effort level. */
export type ThinkingLevel = typeof ThinkingLevel.Type;

/**
 * A single pi session. One session owns exactly one Pi session file;
 * parents reference subsessions by id only, never by transcript copy.
 *
 * Timestamps are ISO strings to keep `new Session(...)` call-site simple.
 * Schema.Class constructor takes decoded input, so DateTime objects
 * would force every caller to build DateTime instances.
 */
export class Session extends Schema.Class<Session>('Session')({
  id: Id,
  parent: Schema.NullOr(Id),
  status: Status,
  created: Schema.String.check(Schema.isMinLength(1)),
  updated: Schema.String.check(Schema.isMinLength(1)),
  sessionFile: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.optionalKey(Schema.String),
  /** Initial agent prompt captured at creation; the live transcript lives in `session.jsonl`. */
  prompt: Schema.optionalKey(Schema.String),
  /** `provider/model-id` pin for the session, if any. */
  model: Schema.optionalKey(Schema.String),
  /** Thinking-level pin for the session, if any. */
  thinking: Schema.optionalKey(ThinkingLevel),
  /**
   * Tool allowlist applied to the session's Pi session. Absent means Pi's default
   * tool set; persisted so a resumed session keeps the same capabilities.
   */
  tools: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Non-parent related session ids (siblings, review target, coordinator links). */
  related: Schema.optionalKey(Schema.Array(Id)),
  /** Spec this session works on (`<spec-slug>`), when bound to one. */
  spec: Schema.optionalKey(Schema.String),
  /** Latest agent-posted progress line, surfaced in the sessions list. */
  progress: Schema.optionalKey(Schema.String),
}) {}

/**
 * Decode untrusted input (frontmatter, JSON, RPC payloads) into a `Session`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Session);

/**
 * Encode a `Session` for persistence (frontmatter, `session.jsonl` header).
 */
export const encode = Schema.encodeSync(Session);
