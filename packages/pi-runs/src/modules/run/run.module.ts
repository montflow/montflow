import { Clock, Effect, Schema } from 'effect';

/** Characters a run id may hold, mirroring the {@link Id} check without the brand. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * True when `id` is a safe run directory name (no traversal, no blanks).
 * Unbranded twin of the {@link Id} schema check, for hosts that must
 * validate before they can build a branded value.
 * @param id - candidate run id
 * @returns true for safe ids
 */
export const isValidId = (id: string): boolean =>
  id.length >= 1 && id.length <= 64 && ID_PATTERN.test(id);

/**
 * Slugify a run name into a directory-safe id: lowercase,
 * non-alphanumerics to hyphens, collapsed and trimmed, capped at 48
 * chars with a time suffix for uniqueness. The suffix is the full
 * millisecond timestamp in base36 — a modulo suffix wrapped every
 * ~28 minutes, colliding same-named runs created a cycle apart.
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
  const base = slug === '' ? 'run' : slug;
  return `${base}-${now.toString(36)}`;
};

/**
 * Slug a fresh run id from a display name using the Effect `Clock` (no
 * wall-clock reads, so tests can drive time). Every surface that
 * dispatches a run mints its id here, so run naming reads the same
 * whether a host dispatches from a TUI or an extension.
 * @param name - display name for the run
 * @returns Effect resolving to a directory-safe run id
 */
export const newId = (name: string): Effect.Effect<string> =>
  Clock.currentTimeMillis.pipe(Effect.map((now) => slugifyName(name, now)));

/**
 * Directory-safe identifier. Matches the run directory name.
 * Scoped: use as `Run.Id`. Scalar brand, not a Class (Class models structs).
 */
export const Id = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
).pipe(Schema.brand('RunId'));

/** Branded run identifier. */
export type Id = typeof Id.Type;

/** Lifecycle status of a run. `awaiting-input` parks a live run while it waits on user answers; `cancelled` is a terminal interrupt. */
export const STATUSES = [
  'pending',
  'running',
  'awaiting-input',
  'done',
  'failed',
  'cancelled',
] as const;

export const Status = Schema.Literals(STATUSES);

/** Lifecycle status of a run. */
export type Status = typeof Status.Type;

/** Reasoning effort levels a run's Pi session can use. Mirrors Pi's own `ThinkingLevel`. */
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
 * A single pi run. One run owns exactly one Pi session file;
 * parents reference subruns by id only, never by transcript copy.
 *
 * Timestamps are ISO strings to keep `new Run(...)` call-site simple.
 * Schema.Class constructor takes decoded input, so DateTime objects
 * would force every caller to build DateTime instances.
 */
export class Run extends Schema.Class<Run>('Run')({
  id: Id,
  parent: Schema.NullOr(Id),
  status: Status,
  created: Schema.String.check(Schema.isMinLength(1)),
  updated: Schema.String.check(Schema.isMinLength(1)),
  sessionFile: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.optionalKey(Schema.String),
  /** Initial agent prompt captured at creation; the live transcript lives in `session.jsonl`. */
  prompt: Schema.optionalKey(Schema.String),
  /** `provider/model-id` pin for the run, if any. */
  model: Schema.optionalKey(Schema.String),
  /** Thinking-level pin for the run, if any. */
  thinking: Schema.optionalKey(ThinkingLevel),
  /**
   * Tool allowlist applied to the run's Pi session. Absent means Pi's default
   * tool set; persisted so a resumed run keeps the same capabilities.
   */
  tools: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Non-parent related run ids (siblings, review target, coordinator links). */
  related: Schema.optionalKey(Schema.Array(Id)),
  /** Spec this run works on (`<spec-slug>`), when bound to one. */
  spec: Schema.optionalKey(Schema.String),
  /** Latest agent-posted progress line, surfaced in the runs list. */
  progress: Schema.optionalKey(Schema.String),
}) {}

/**
 * Decode untrusted input (frontmatter, JSON, RPC payloads) into a `Run`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Run);

/**
 * Encode a `Run` for persistence (frontmatter, `session.jsonl` header).
 */
export const encode = Schema.encodeSync(Run);
