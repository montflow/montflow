import { Schema } from 'effect';

/**
 * Effect Schema for the JSON preset configuration.
 *
 * Presets persist the loop **configuration** as `.agents/@montflow/review-presets/<name>.json`.
 * Reviewers are stored as **references** — a builtin id or a profile name — not
 * the expanded profile (objective, label, skill path, …). Everything derived
 * (objective text, bundled skill paths) is resolved from the source at use
 * time, so presets stay small, portable, and never go stale when a profile
 * changes.
 *
 * A preset is either a `loop` (the classic review loop — supervisor,
 * reviewers, fixers, loops×cycles, deadlock) or a `workflow` (open-ended step
 * pipeline — schematized but not yet executable). Legacy files without a
 * `type` field decode as loops.
 *
 * ```json
 * {
 *   "version": 1,
 *   "name": "security-audit",
 *   "type": "loop",
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
 * Thinking levels a preset may pin for a role. `null` is never stored — a
 * level is simply omitted when unset (pi default applies at use time).
 */
export const ThinkingLevelSchema = Schema.Literals([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

/**
 * One reviewer reference in a preset. The `type` discriminator selects the
 * reference source: `builtin` (the `id` field) or `profile` (the `name`
 * field). `model` is an optional override — omitted means the builtin's
 * default model / the profile's preferred model. `thinkingLevel` is an
 * optional per-reviewer thinking-level override (omitted = pi default).
 * Missing `id`/`name` for the selected type is caught with a clear error
 * when the preset is resolved.
 */
export const ReviewerRefSchema = Schema.Struct({
  type: Schema.Literals(['builtin', 'profile']),
  /** Builtin reviewer id from the catalog (`generic`, `security`, …) when type='builtin'. */
  id: Schema.optional(Schema.String),
  /** Profile slug under `.agents/@montflow/profiles/` when type='profile'. */
  name: Schema.optional(Schema.String),
  /** Model override; omitted = default/preferred model. */
  model: Schema.optional(Schema.String),
  /** Optional ordered fallback models tried after `model` fails. */
  fallbackModels: Schema.optional(Schema.Array(Schema.String)),
  /** Optional extended-thinking level override for this reviewer. */
  thinkingLevel: Schema.optional(ThinkingLevelSchema),
});

/** Supervisor reference: the model (and optional thinking level) — the skill path is always the bundled one. */
export const PresetSupervisorSchema = Schema.Struct({
  model: Schema.String,
  /** Optional ordered fallback models tried after `model` fails. */
  fallbackModels: Schema.optional(Schema.Array(Schema.String)),
  /** Optional extended-thinking level for the supervisor's sessions. */
  thinkingLevel: Schema.optional(ThinkingLevelSchema),
});

/** JSON shape of the deadlock config. */
export const DeadlockConfigSchema = Schema.Struct({
  flipThreshold: Schema.Number,
  action: Schema.Literal('escalate'),
});

/**
 * Preset kind. `loop` is the classic review loop (supervisor + reviewers +
 * fixers, loops×cycles, deadlock) — the executable form today. `workflow` is
 * the open-ended successor (arbitrary step pipeline) — schematized but NOT
 * yet executable. Legacy preset files omit `type` entirely; they are loops.
 */
export const PresetTypeSchema = Schema.Literals(['loop', 'workflow']);

/**
 * One reviewer inside a reviewer-group roster: a reviewer reference plus an
 * optional per-reviewer prompt. Legacy entries stored as a bare ref (no
 * `reviewer` key) still decode.
 */
export const WorkflowGroupReviewerSchema = Schema.Union([
  ReviewerRefSchema,
  Schema.Struct({
    reviewer: ReviewerRefSchema,
    /** Optional extra instructions for this specific reviewer. */
    prompt: Schema.optional(Schema.String),
  }),
]);

/** One open-ended step in a workflow preset. Deliberately loose — workflows are not executable yet. */
export const WorkflowStepSchema = Schema.Struct({
  /** Stable step id within the workflow (e.g. `s1`). */
  id: Schema.String,
  /** Step kind — free-form for now (`reviewer`, `reviewer-group`, `human`, `fixer`, …). */
  kind: Schema.String,
  /** Optional human label for the step. */
  label: Schema.optional(Schema.String),
  /** Kind-specific parameters (models, counts, prompts) — unvalidated for now. */
  params: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  /**
   * Reviewer roster inside a `reviewer-group` step (fan-out group). Each entry
   * is a reviewer reference (builtin id or profile name) with an optional
   * per-reviewer prompt. Absent on non-group steps.
   */
  reviewers: Schema.optional(Schema.Array(WorkflowGroupReviewerSchema)),
  /**
   * Selected reviewer for a single `reviewer` step — builtin id or profile
   * name. A reviewer step without one is unconfigured (invalid until picked).
   */
  reviewer: Schema.optional(ReviewerRefSchema),
  /** Optional extra instructions for this step (e.g. a reviewer's focus directive). */
  prompt: Schema.optional(Schema.String),
});

/**
 * Open-ended workflow configuration. Workflows are NOT yet executable — the
 * schema is intentionally loose so the editor can evolve the node vocabulary
 * (kinds, params, later edges/conditions) without schema churn. `steps` is an
 * ordered list of free-form steps.
 */
export const PresetWorkflowConfigSchema = Schema.Struct({
  /** Optional one-line description shown in list/detail views. */
  description: Schema.optional(Schema.String),
  /** Global prompt injected into EVERY agent run in this workflow. */
  prompt: Schema.optional(Schema.String),
  steps: Schema.Array(WorkflowStepSchema),
});

/** Stored loop configuration: reviewers are references, not expanded profiles. */
export const PresetLoopConfigSchema = Schema.Struct({
  reviewers: Schema.Array(ReviewerRefSchema),
  supervisor: PresetSupervisorSchema,
  fixerModel: Schema.String,
  /** Optional ordered fallback models tried after `fixerModel` fails. */
  fixerFallbackModels: Schema.optional(Schema.Array(Schema.String)),
  /** Optional extended-thinking level for every fixer session. */
  fixerThinkingLevel: Schema.optional(ThinkingLevelSchema),
  /** Number of independent reviewer loops. */
  maxLoops: Schema.Number,
  /** Optional for legacy presets; resolution defaults to the legacy maxLoops as the per-loop cycle cap. */
  maxCycles: Schema.optional(Schema.Number),
  /** Optional for legacy presets; resolution defaults to 5. */
  agentConcurrency: Schema.optional(Schema.Number),
  /** Optional per-turn supervisor budget in ms; defaults to 20 minutes. */
  supervisorTimeoutMs: Schema.optional(Schema.Number),
  deadlock: DeadlockConfigSchema,
});

/**
 * A stored LOOP preset: the classic review loop config. `type` is optional
 * (defaults to loop) so legacy v1 files decode unchanged — they have no
 * `type` field.
 */
export const LoopPresetSchema = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String,
  /** 'loop' — omitted in legacy files (decodes as loop). */
  type: Schema.optional(Schema.Literal('loop')),
  config: PresetLoopConfigSchema,
});

/** A stored WORKFLOW preset: an open-ended step pipeline (not yet executable). */
export const WorkflowPresetSchema = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String,
  /** 'workflow' — required: a workflow file must declare its kind. */
  type: Schema.Literal('workflow'),
  config: PresetWorkflowConfigSchema,
});

/**
 * A stored preset: a versioned wrapper discriminating loop vs workflow
 * configs on the `type` field. Legacy files (no `type`) match the loop
 * member. The union is strict: a workflow config without `type: "workflow"`
 * is rejected, and a mismatched `type`/config pair is rejected.
 */
export const ReviewPresetSchema = Schema.Union([LoopPresetSchema, WorkflowPresetSchema]);

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

/** Decoded (validated) shape of an open-ended workflow config. */
export type PresetWorkflowConfigDecoded = Schema.Schema.Type<typeof PresetWorkflowConfigSchema>;

/** Decoded (validated) shape of a single reviewer reference. */
export type ReviewerRefDecoded = Schema.Schema.Type<typeof ReviewerRefSchema>;

/** The effective preset kind: `loop` or `workflow`. */
export type PresetType = 'loop' | 'workflow';

/**
 * Effective kind of a decoded preset — legacy files (no `type` field) are loops.
 * @param {ReviewPresetDecoded} preset The decoded preset
 * @returns The effective preset kind
 */
export const presetTypeOf = (preset: ReviewPresetDecoded): PresetType => preset.type ?? 'loop';

/** True when the preset is a loop (explicit `workflow` is the only non-loop). */
export const isLoopPreset = (preset: ReviewPresetDecoded): boolean =>
  preset.type !== 'workflow';

/** True when the preset is a workflow. */
export const isWorkflowPreset = (preset: ReviewPresetDecoded): boolean =>
  preset.type === 'workflow';

/** Narrowing guard: is this a loop config (has `reviewers`) rather than a workflow config? */
export const isLoopConfig = (
  config: PresetLoopConfigDecoded | PresetWorkflowConfigDecoded,
): config is PresetLoopConfigDecoded => 'reviewers' in config;

/** Narrowing guard: is this a workflow config (has `steps`) rather than a loop config? */
export const isWorkflowConfig = (
  config: PresetLoopConfigDecoded | PresetWorkflowConfigDecoded,
): config is PresetWorkflowConfigDecoded => 'steps' in config;
