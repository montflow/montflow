import { Schema } from 'effect';

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

/** Lifecycle status of a run. */
export const Status = Schema.Literals(['pending', 'running', 'done', 'failed']);

/** Lifecycle status of a run. */
export type Status = typeof Status.Type;

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
}) {}

/**
 * Decode untrusted input (frontmatter, JSON, RPC payloads) into a `Run`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Run);

/**
 * Encode a `Run` for persistence (frontmatter, `session.jsonl` header).
 */
export const encode = Schema.encodeSync(Run);
