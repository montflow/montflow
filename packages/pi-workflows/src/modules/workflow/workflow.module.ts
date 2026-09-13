import { Schema } from 'effect';

/**
 * One step in a workflow pipeline. Deliberately loose — `kind` is a
 * free-form string so hand-written steps with unknown kinds still decode
 * (as generic steps) and are never destroyed. Modeled on the pipeline half
 * of `pi/zi`'s preset schema (`preset-schema.ts`); the review-loop half
 * (`maxLoops`, `deadlock`, reviewer refs) stays in `zi` until a loop
 * module lands here.
 */
export class Step extends Schema.Class<Step>('WorkflowStep')({
  /** Stable step id within the workflow (e.g. `s1`). */
  id: Schema.NonEmptyString,
  /**
   * Step kind. Free-form (`reviewer`, `fixer`, `human`, …) — the executor
   * decides which kinds it runs; unknown kinds decode untouched.
   */
  kind: Schema.String,
  /** Optional human label for the step. */
  label: Schema.optional(Schema.String),
  /** Optional extra instructions for this step (focus directive, human-interruptor prompt). */
  prompt: Schema.optional(Schema.String),
  /** Model override for this step; omitted = executor default. */
  model: Schema.optional(Schema.String),
  /** Single fallback model tried after `model` fails. */
  fallbackModel: Schema.optional(Schema.String),
  /** Parallel agent count for fan-out steps. */
  concurrency: Schema.optional(Schema.Number),
  /** Kind-specific parameters — unvalidated for now. */
  params: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}) {}

/**
 * A named workflow: an ordered step pipeline. A descriptor only — no
 * execution state (no `status`): lifecycle lives with the run, mirroring
 * how `zi` separates preset configs from the run store. Persisted by the
 * consuming extension as a JSON file (see {@link FromJson}).
 */
export class Workflow extends Schema.Class<Workflow>('Workflow')({
  /** Slug name — matches the workflow file. */
  name: Schema.NonEmptyString,
  /** One-line summary shown in list views. */
  description: Schema.String,
  /** Global prompt injected into EVERY step run in this workflow. */
  prompt: Schema.optional(Schema.String),
  /** Ordered pipeline steps. */
  steps: Schema.Array(Step),
}) {}

/**
 * Decode untrusted input (JSON files, RPC payloads) into a `Workflow`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Workflow);

/**
 * Encode a `Workflow` for persistence (JSON files, RPC payloads).
 */
export const encode = Schema.encodeSync(Workflow);

/**
 * Schema that decodes/encodes a whole workflow file to/from a JSON string.
 */
export const FromJson = Schema.fromJsonString(Workflow);

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Create a new workflow descriptor with no steps.
 * @param name - slug name matching the workflow file
 * @param description - one-line summary shown in list views
 * @returns the new workflow descriptor
 */
export const make = (name: string, description = ''): Workflow =>
  Workflow.make({
    name,
    description,
    steps: [],
  });

/**
 * Create a minimal pipeline step — id plus kind only. Richer steps go
 * through `Step.make` or `decodeUnknown` directly.
 * @param id - stable step id within the workflow (e.g. `s1`)
 * @param kind - free-form step kind (`reviewer`, `fixer`, `human`, …)
 * @returns the new step
 */
export const makeStep = (id: string, kind: string): Step => Step.make({ id, kind });

/**
 * True when `name` is a valid workflow slug (lowercase, hyphen-separated).
 * @param name - candidate slug
 * @returns true for valid slugs
 */
export const isValidName = (name: string): boolean => SLUG_PATTERN.test(name);

/**
 * Lowercases and converts any run of non-alphanumeric characters into a
 * single hyphen, trimming leading/trailing hyphens.
 * @param name - raw display name
 * @returns slugified name
 */
export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
