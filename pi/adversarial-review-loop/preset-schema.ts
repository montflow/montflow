import { Schema } from 'effect';

/**
 * Effect Schema for the JSON preset configuration.
 *
 * Presets persist the loop **configuration** as `.agents/review-presets/<name>.json`.
 * Reviewers are stored as **references** — a builtin id or a profile name — not
 * the expanded profile (objective, label, skill path, …). Everything derived
 * (objective text, bundled skill paths) is resolved from the source at use
 * time, so presets stay small, portable, and never go stale when a profile
 * changes.
 *
 * ```json
 * {
 *   "version": 1,
 *   "name": "security-audit",
 *   "config": {
 *     "reviewers": [
 *       { "type": "builtin", "id": "generic" },
 *       { "type": "profile", "name": "security-auditor", "model": "anthropic/claude-sonnet-4-5" }
 *     ],
 *     "supervisor": { "model": "deepseek-v4-pro" },
 *     "fixerModel": "deepseek-v4-flash-free",
 *     "maxLoops": 5,
 *     "deadlock": { "flipThreshold": 2, "action": "escalate" }
 *   }
 * }
 * ```
 */

/**
 * One reviewer reference in a preset. The `type` discriminator selects the
 * reference source: `builtin` (the `id` field) or `profile` (the `name`
 * field). `model` is an optional override — omitted means the builtin's
 * default model / the profile's preferred model. Missing `id`/`name` for the
 * selected type is caught with a clear error when the preset is resolved.
 */
export const ReviewerRefSchema = Schema.Struct({
  type: Schema.Literals(['builtin', 'profile']),
  /** Builtin reviewer id from the catalog (`generic`, `security`, …) when type='builtin'. */
  id: Schema.optional(Schema.String),
  /** Profile slug under `.agents/profiles/` when type='profile'. */
  name: Schema.optional(Schema.String),
  /** Model override; omitted = default/preferred model. */
  model: Schema.optional(Schema.String),
  /** Optional ordered fallback models tried after `model` fails. */
  fallbackModels: Schema.optional(Schema.Array(Schema.String)),
});

/** Supervisor reference: the model only — the skill path is always the bundled one. */
export const PresetSupervisorSchema = Schema.Struct({
  model: Schema.String,
  /** Optional ordered fallback models tried after `model` fails. */
  fallbackModels: Schema.optional(Schema.Array(Schema.String)),
});

/** JSON shape of the deadlock config. */
export const DeadlockConfigSchema = Schema.Struct({
  flipThreshold: Schema.Number,
  action: Schema.Literal('escalate'),
});

/** Stored loop configuration: reviewers are references, not expanded profiles. */
export const PresetLoopConfigSchema = Schema.Struct({
  reviewers: Schema.Array(ReviewerRefSchema),
  supervisor: PresetSupervisorSchema,
  fixerModel: Schema.String,
  /** Optional ordered fallback models tried after `fixerModel` fails. */
  fixerFallbackModels: Schema.optional(Schema.Array(Schema.String)),
  /** Number of independent reviewer loops. */
  maxLoops: Schema.Number,
  /** Optional for legacy presets; resolution defaults to the legacy maxLoops as the per-loop cycle cap. */
  maxCycles: Schema.optional(Schema.Number),
  /** Optional for legacy presets; resolution defaults to 5. */
  agentConcurrency: Schema.optional(Schema.Number),
  deadlock: DeadlockConfigSchema,
});

/** A stored preset: a versioned wrapper around the reference-based config. */
export const ReviewPresetSchema = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String,
  config: PresetLoopConfigSchema,
});

/**
 * Schema that decodes/encodes a whole preset file to/from a JSON string.
 * Decoding validates the structure and throws `ParseError` on malformed
 * input; encoding produces the compact JSON text.
 */
export const ReviewPresetFromJson = Schema.fromJsonString(ReviewPresetSchema);

/** Decoded (validated) shape of a preset file. */
export type ReviewPresetDecoded = Schema.Schema.Type<typeof ReviewPresetSchema>;

/** Decoded (validated) shape of the stored reference-based config. */
export type PresetLoopConfigDecoded = Schema.Schema.Type<typeof PresetLoopConfigSchema>;

/** Decoded (validated) shape of a single reviewer reference. */
export type ReviewerRefDecoded = Schema.Schema.Type<typeof ReviewerRefSchema>;
