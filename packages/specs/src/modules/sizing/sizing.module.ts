import { Data, Effect, Result, Schema } from 'effect';
import { PHASE_PATTERN } from '../spec/index.js';
import { type Issue, type Result as VerifyResult, finding, noErrors } from '../verify/index.js';

// ─── Sizes ────────────────────────────────────────────────────────────

/** The four task sizes — the single source of truth every consumer reads. */
export const SIZES = ['tiny', 'small', 'medium', 'large'] as const;

/** Task size. */
export const Size = Schema.Literals(SIZES);

/** Task size. */
export type Size = typeof Size.Type;

/** Size `mf-specs create` emits when the author omits one. */
export const DEFAULT_SIZE: Size = 'medium';

/** True when `value` is one of the four sizes. */
export const isSize = (value: string): value is Size => SIZES.some((size) => size === value);

/** Human-readable size list for diagnostics. */
export const SIZE_HINT = SIZES.join(', ');

// ─── Review cycles ────────────────────────────────────────────────────

/** Hard cap on review cycles per phase, whatever the task sizes are. */
export const MAX_REVIEW_CYCLES = 3;

/** Review-cycle budget each size buys, before the hard cap applies. */
export const REVIEW_CYCLES = {
  tiny: 1,
  small: 2,
  medium: 3,
  large: 3,
} as const satisfies Record<Size, number>;

/**
 * Review cycles one size buys.
 * @param size - declared task size
 * @returns the budget, never above {@link MAX_REVIEW_CYCLES}
 */
export const reviewCycles = (size: Size): number =>
  Math.min(REVIEW_CYCLES[size], MAX_REVIEW_CYCLES);

/** One phase member that contributes to the review budget. */
export interface TaskSizing {
  readonly type: string;
  /** Declared size; a task that carries none contributes no budget. */
  readonly size?: Size | undefined;
}

/** A review-budget input: a bare size, or a task that names its own type. */
export type BudgetInput = Size | TaskSizing;

/**
 * Review budget of a phase: the largest budget among its non-review tasks,
 * capped at {@link MAX_REVIEW_CYCLES}. The phase's own `review` task never
 * raises the budget, and a phase of tiny tasks gets exactly 1 cycle. Bare
 * sizes count as non-review tasks.
 *
 * Every non-empty phase gets at least 1 cycle, even when no non-review task
 * declares a size (a review-only phase, or completed unsized tasks plus their
 * pending review). A phase that can reach review must be able to hold the one
 * round its lock requires; a budget of 0 would deadlock the only path to
 * `locked-phases`. An empty phase has no review to hold and stays 0.
 * @param sizes - phase members, as sizes or typed tasks
 * @returns the budget, between 0 (empty phase) and {@link MAX_REVIEW_CYCLES}
 */
export const phaseReviewBudget = (sizes: ReadonlyArray<BudgetInput>): number => {
  if (sizes.length === 0) return 0;
  const largest = Math.min(
    MAX_REVIEW_CYCLES,
    sizes.reduce((budget, input) => {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `input` is the declared `Size | TaskSizing` union; `typeof` picks which arm of that contract to read, not an unparsed value.
      if (typeof input === 'string') return Math.max(budget, reviewCycles(input));
      if (input.type === 'review' || input.size === undefined) return budget;
      return Math.max(budget, reviewCycles(input.size));
    }, 0),
  );
  return Math.max(1, largest);
};

// ─── Error codes ──────────────────────────────────────────────────────

/** Stable, greppable codes for every sizing failure class. */
export const CODES = {
  malformedJson: 'sizing.malformed-json',
  malformedConfig: 'sizing.malformed-config',
  unknownKey: 'sizing.unknown-key',
  missingSizes: 'sizing.missing-sizes',
  nonObjectSizes: 'sizing.non-object-sizes',
  unknownConfigSize: 'sizing.unknown-size',
  nonObjectEntry: 'sizing.non-object-entry',
  missingModel: 'sizing.missing-model',
  malformedModel: 'sizing.malformed-model',
  malformedEffort: 'sizing.malformed-effort',
  effortWithoutModel: 'sizing.effort-without-model',
  nonObjectPhases: 'sizing.non-object-phases',
  nonObjectPhase: 'sizing.non-object-phase',
  unknownPhase: 'sizing.unknown-phase',
  invalidConfig: 'sizing.invalid-config',
  missingSize: 'task.missing-size',
  unknownTaskSize: 'task.unknown-size',
} as const;

/** One stable sizing failure code. */
export type Code = (typeof CODES)[keyof typeof CODES];

// ─── Config contract ──────────────────────────────────────────────────

/** File name of both the repo-level and the spec-level config. */
export const CONFIG_FILE = 'sizing.json';

/**
 * Model id shape: the first `/` separates the provider from the model, and the
 * model part may carry further `/` or `:` because hosts use them (OpenRouter
 * namespaces, Ollama tags). No whitespace and no `#`, which separates effort in
 * a resolved target.
 */
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

/**
 * Effort shape: a non-empty variant token as a host catalogue reports it.
 * Case-insensitive and `:`/`.` tolerant so every storable catalogue token
 * passes; the catalogue's variant list stays the authority on which tokens a
 * model accepts. No whitespace and no `#` (the resolved-target separator).
 */
export const EFFORT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/**
 * A literal model id, for repair text that quotes one. It is itself a valid id,
 * so an agent can follow a `fix` line that embeds it verbatim.
 */
export const MODEL_HINT = 'provider/model';

/**
 * The model id grammar, for the `expected` field and prose. Not a literal: it
 * must never be quoted as a value, only described.
 */
export const MODEL_RULE =
  'provider/model: the first / separates the provider from the model, which may contain further / or :, with no whitespace and no #';

/** What an effort token must look like, for diagnostics. */
export const EFFORT_HINT = 'a catalogue variant token such as low, high, xhigh, or max';

/** One size's dispatch target: a model id plus an optional effort. */
export interface SizeEntry {
  readonly model: string;
  readonly effort?: string;
}

const SizeEntrySchema = Schema.Struct({
  model: Schema.String,
  effort: Schema.optionalKey(Schema.String),
});

const SizeMapSchema = Schema.Record(Schema.String, SizeEntrySchema);

const PhaseConfigSchema = Schema.Struct({ sizes: SizeMapSchema });

const RepoConfigSchema = Schema.Struct({ sizes: SizeMapSchema });

const SpecConfigSchema = Schema.Struct({
  sizes: SizeMapSchema,
  phases: Schema.optionalKey(Schema.Record(Schema.String, PhaseConfigSchema)),
});

/** Which config file a shape belongs to: the repo root, or a spec root. */
export type ConfigKind = 'repo' | 'spec';

/** Size entries one layer defines; absent sizes inherit from a less specific layer. */
export type SizeMap = Readonly<Partial<Record<Size, SizeEntry>>>;

/** One phase's size overrides, nested in the spec config. */
export interface PhaseConfig {
  readonly sizes: SizeMap;
}

/** One parsed `sizing.json`. The repo config never carries `phases`. */
export interface SizingConfig {
  readonly sizes: SizeMap;
  readonly phases?: Readonly<Partial<Record<string, PhaseConfig>>>;
}

/** A config file to verify or parse: where it lives and which shape applies. */
export interface ConfigSource {
  /** Display path, relative to the specs root (`sizing.json`, `my-spec/sizing.json`). */
  readonly path: string;
  readonly kind: ConfigKind;
  /** Phase ids the owning spec declares, when the caller knows them. */
  readonly phases?: ReadonlyArray<string> | undefined;
}

// ─── Effectful failures ───────────────────────────────────────────────

/** Failure raised while reading or decoding a `sizing.json`. */
export class SizingError extends Data.TaggedError('@montflow/SizingError')<{
  readonly operation: string;
  readonly path: string;
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
  /** Concrete edit or command that repairs the failure. */
  readonly fix?: string;
  /** The original failure, preserved for the CLI's cause chain. */
  readonly cause?: unknown;
}> {}

/** Fields a {@link SizingError} is built from. */
interface SizingErrorInput {
  operation: string;
  path: string;
  field: string;
  code: string;
  message: string;
  expected?: string;
  actual?: string;
  fix?: string;
  cause?: unknown;
}

const PARSE_OPERATION = 'Sizing.parse';

const errorFromIssue = (source: ConfigSource, found: Issue): SizingError => {
  const input: SizingErrorInput = {
    operation: PARSE_OPERATION,
    path: source.path,
    field: found.field,
    code: found.code ?? CODES.invalidConfig,
    message: found.message,
  };
  if (found.expected !== undefined) input.expected = found.expected;
  if (found.actual !== undefined) input.actual = found.actual;
  if (found.fix !== undefined) input.fix = found.fix;
  if (found.cause !== undefined) input.cause = found.cause;
  return new SizingError(input);
};

const malformedJson = (source: ConfigSource, cause: unknown): SizingError =>
  new SizingError({
    operation: PARSE_OPERATION,
    path: source.path,
    field: 'root',
    code: CODES.malformedJson,
    message: 'Config is not valid JSON.',
    expected: 'a JSON object with a "sizes" map',
    actual: 'unparseable JSON',
    fix: `Rewrite ${source.path} as valid JSON.`,
    cause,
  });

const invalidConfig = (source: ConfigSource, cause: unknown): SizingError =>
  new SizingError({
    operation: PARSE_OPERATION,
    path: source.path,
    field: 'root',
    code: CODES.invalidConfig,
    message: 'Config does not match the sizing schema.',
    expected: 'a valid sizing config',
    actual: 'invalid config',
    fix: `Rewrite ${source.path} as an object with a "sizes" map keyed by ${SIZE_HINT}.`,
    cause,
  });

// ─── Verification ─────────────────────────────────────────────────────

/** JSON value decoded at the config boundary. */
type Json = Schema.Json;

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const isString = Schema.is(Schema.String);

const isNumber = Schema.is(Schema.Number);

const isBoolean = Schema.is(Schema.Boolean);

/** Name a value's JSON kind for an `actual` field, without echoing a cause. */
const kindOf = (value: Json): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (isString(value)) return 'string';
  if (isNumber(value)) return 'number';
  if (isBoolean(value)) return 'boolean';
  return 'object';
};

/** Render a value as an `actual` field, distinguishing an empty value. */
const displayValue = (value: Json): string => {
  if (isString(value)) return value === '' ? 'empty string' : value;
  if (isNumber(value) || isBoolean(value)) return String(value);
  return kindOf(value);
};

const unknownSize = (field: string): Issue => {
  const key = field.slice(field.lastIndexOf('.') + 1);
  return finding({
    code: CODES.unknownConfigSize,
    field,
    message: `Unknown size '${key}'.`,
    expected: SIZE_HINT,
    actual: key,
    fix: `Rename '${field}' to one of ${SIZE_HINT}, or remove it.`,
  });
};

const verifyEntry = (issues: Array<Issue>, field: string, entry: Json): void => {
  if (!isRecord(entry)) {
    issues.push(
      finding({
        code: CODES.nonObjectEntry,
        field,
        message: 'A size entry must be an object.',
        expected: 'an object with a "model"',
        actual: kindOf(entry),
        fix: `Rewrite ${field} as { "model": "${MODEL_HINT}" }.`,
      }),
    );
    return;
  }
  for (const key of Object.keys(entry)) {
    if (key === 'model' || key === 'effort') continue;
    issues.push(
      finding({
        code: CODES.unknownKey,
        field: `${field}.${key}`,
        message: `Unknown key '${key}' in a size entry.`,
        expected: 'model or effort',
        actual: key,
        fix: `Remove '${field}.${key}'.`,
      }),
    );
  }

  const model = entry.model;
  const hasModel = model !== undefined && isString(model) && model.trim() !== '';
  if (model === undefined || !isString(model) || model.trim() === '') {
    issues.push(
      finding({
        code: CODES.missingModel,
        field: `${field}.model`,
        message: 'A size entry requires a model.',
        expected: MODEL_RULE,
        actual: model === undefined ? 'missing' : displayValue(model),
        fix: `Add "model": "${MODEL_HINT}" to ${field}.`,
      }),
    );
  } else if (!MODEL_PATTERN.test(model)) {
    issues.push(
      finding({
        code: CODES.malformedModel,
        field: `${field}.model`,
        message: 'Model must be an id whose first segment is the provider.',
        expected: MODEL_RULE,
        actual: displayValue(model),
        fix: `Set ${field}.model to a "${MODEL_HINT}" id.`,
      }),
    );
  }

  const effort = entry.effort;
  if (effort === undefined) return;
  if (!isString(effort) || !EFFORT_PATTERN.test(effort)) {
    issues.push(
      finding({
        code: CODES.malformedEffort,
        field: `${field}.effort`,
        message: 'Effort must be a non-empty catalogue variant token.',
        expected: EFFORT_HINT,
        actual: displayValue(effort),
        fix: `Set ${field}.effort to a token such as "low", "high", or "max".`,
      }),
    );
  }
  if (!hasModel) {
    issues.push(
      finding({
        code: CODES.effortWithoutModel,
        field: `${field}.effort`,
        message: 'An effort without a model is invalid.',
        expected: 'a "model" alongside "effort"',
        actual: 'model missing',
        fix: `Add "model" to ${field}, or remove "effort".`,
      }),
    );
  }
};

const verifySizes = (issues: Array<Issue>, prefix: string, sizes: Json): void => {
  if (!isRecord(sizes)) {
    issues.push(
      finding({
        code: CODES.nonObjectSizes,
        field: prefix,
        message: '`sizes` must be an object keyed by size.',
        expected: `an object keyed by ${SIZE_HINT}`,
        actual: kindOf(sizes),
        fix: `Rewrite ${prefix} as an object keyed by ${SIZE_HINT}.`,
      }),
    );
    return;
  }
  for (const [key, entry] of Object.entries(sizes)) {
    const field = `${prefix}.${key}`;
    if (!isSize(key)) {
      issues.push(unknownSize(field));
      continue;
    }
    verifyEntry(issues, field, entry);
  }
};

const phaseKnown = (source: ConfigSource, phase: string): boolean =>
  PHASE_PATTERN.test(phase) &&
  (source.phases === undefined || source.phases.some((known) => known === phase));

const verifyPhases = (issues: Array<Issue>, source: ConfigSource, phases: Json): void => {
  if (!isRecord(phases)) {
    issues.push(
      finding({
        code: CODES.nonObjectPhases,
        field: 'phases',
        message: '`phases` must be an object keyed by phase id.',
        expected: 'an object keyed by phase id such as A',
        actual: kindOf(phases),
        fix: 'Rewrite phases as an object keyed by phase id.',
      }),
    );
    return;
  }
  for (const [phase, config] of Object.entries(phases)) {
    const field = `phases.${phase}`;
    if (!phaseKnown(source, phase)) {
      issues.push(
        finding({
          code: CODES.unknownPhase,
          field,
          message: `Unknown phase '${phase}'.`,
          expected: 'a phase id such as A or AA',
          actual: phase,
          fix: `Rename '${field}' to a phase id such as A, or remove it.`,
        }),
      );
      continue;
    }
    if (!isRecord(config)) {
      issues.push(
        finding({
          code: CODES.nonObjectPhase,
          field,
          message: 'A phase override must be an object.',
          expected: 'an object with a "sizes" map',
          actual: kindOf(config),
          fix: `Rewrite ${field} as { "sizes": {} }.`,
        }),
      );
      continue;
    }
    for (const key of Object.keys(config)) {
      if (key === 'sizes') continue;
      issues.push(
        finding({
          code: CODES.unknownKey,
          field: `${field}.${key}`,
          message: `Unknown key '${key}' in a phase override.`,
          expected: 'sizes',
          actual: key,
          fix: `Remove '${field}.${key}'.`,
        }),
      );
    }
    if (config.sizes === undefined) {
      issues.push(
        finding({
          code: CODES.missingSizes,
          field: `${field}.sizes`,
          message: 'A phase override requires a `sizes` map.',
          expected: 'an object keyed by size',
          actual: 'missing',
          fix: `Add "sizes": {} to ${field}.`,
        }),
      );
      continue;
    }
    verifySizes(issues, `${field}.sizes`, config.sizes);
  }
};

/**
 * Mechanically verify one parsed `sizing.json` against the config contract:
 * known keys, known sizes and phases, object entries, and a well-formed model
 * plus effort. Pure — the caller supplies the decoded JSON value.
 * @param source - where the config lives and which shape applies
 * @param value - the JSON value decoded at the config boundary
 * @returns the result; `valid` is true only with zero issues
 */
export const verify = (source: ConfigSource, value: Json): VerifyResult => {
  const issues: Array<Issue> = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [
        finding({
          code: CODES.malformedConfig,
          field: 'root',
          message: 'Config must be a JSON object.',
          expected: 'an object with a "sizes" map',
          actual: kindOf(value),
          fix: `Rewrite ${source.path} as a JSON object with a "sizes" map.`,
        }),
      ],
    };
  }

  const allowed = source.kind === 'repo' ? ['sizes'] : ['sizes', 'phases'];
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    issues.push(
      finding({
        code: CODES.unknownKey,
        field: key,
        message: `Unknown key '${key}'.`,
        expected: allowed.join(' or '),
        actual: key,
        fix: `Remove '${key}' from ${source.path}.`,
      }),
    );
  }

  if (value.sizes === undefined) {
    issues.push(
      finding({
        code: CODES.missingSizes,
        field: 'sizes',
        message: 'Config requires a `sizes` map.',
        expected: 'an object keyed by size',
        actual: 'missing',
        fix: `Add "sizes": {} to ${source.path}.`,
      }),
    );
  } else {
    verifySizes(issues, 'sizes', value.sizes);
  }

  if (source.kind === 'spec' && value.phases !== undefined) {
    verifyPhases(issues, source, value.phases);
  }

  return { valid: noErrors(issues), issues };
};

/**
 * Verify raw config text. The pure text-level entry point: malformed JSON
 * becomes one coded issue, so the tree verifier never throws.
 * @param source - where the config lives and which shape applies
 * @param text - raw `sizing.json` contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyText = (source: ConfigSource, text: string): VerifyResult => {
  const decoded = Result.try({
    // SAFETY: `JSON.parse` returns the JSON value the text encodes; the config
    // verifier below rejects anything that is not the documented shape.
    try: () => JSON.parse(text) as Json,
    catch: (cause) => cause,
  });
  if (Result.isFailure(decoded)) {
    return {
      valid: false,
      issues: [
        finding({
          code: CODES.malformedJson,
          field: 'root',
          message: 'Config is not valid JSON.',
          expected: 'a JSON object with a "sizes" map',
          actual: 'unparseable JSON',
          fix: `Rewrite ${source.path} as valid JSON.`,
          cause: decoded.failure,
        }),
      ],
    };
  }
  return verify(source, decoded.success);
};

// ─── Effectful decode ─────────────────────────────────────────────────

const configSchema = (kind: ConfigKind) => (kind === 'repo' ? RepoConfigSchema : SpecConfigSchema);

/**
 * Parse config text into a JSON value, preserving the real `JSON.parse`
 * failure. `Schema`'s JSON-string getter replaces the `SyntaxError` with a
 * constant schema issue, which is why the boundary parses text itself.
 * @param source - where the config lives and which shape applies
 * @param text - raw `sizing.json` contents
 * @returns the JSON value, or a coded failure carrying the `SyntaxError`
 */
const decodeJson = (source: ConfigSource, text: string): Effect.Effect<Json, SizingError> =>
  Effect.try({
    // SAFETY: `JSON.parse` returns the JSON value the text encodes; the
    // verifier below rejects anything that is not the documented shape.
    try: () => JSON.parse(text) as Json,
    catch: (cause) => malformedJson(source, cause),
  });

/**
 * Decode raw config text into a validated {@link SizingConfig}. Malformed JSON
 * and the first contract violation fail with a {@link SizingError} that keeps
 * the original cause. `verify` owns the contract and its coded messages; the
 * single strict schema decode that follows it only narrows the verified JSON to
 * the config type, and rejects excess properties so verifier and schema cannot
 * drift apart silently.
 * @param source - where the config lives and which shape applies
 * @param text - raw `sizing.json` contents
 * @returns the decoded config, or a coded failure
 */
export const parse = (
  source: ConfigSource,
  text: string,
): Effect.Effect<SizingConfig, SizingError> =>
  Effect.gen(function* () {
    const value = yield* decodeJson(source, text);

    const first = verify(source, value).issues[0];
    if (first !== undefined) return yield* Effect.fail(errorFromIssue(source, first));

    return yield* Schema.decodeUnknownEffect(configSchema(source.kind), {
      onExcessProperty: 'error',
    })(value).pipe(Effect.mapError((cause) => invalidConfig(source, cause)));
  });

// ─── Merge and resolve ────────────────────────────────────────────────

/** Precedence layers, least to most specific. */
export const LAYERS = ['repo', 'spec', 'phase'] as const;

/** One precedence layer. */
export type Layer = (typeof LAYERS)[number];

/** Dispatch target when no layer defines a size: keep the current model. */
export const INHERIT = 'inherit';

/** The three config layers plus the phase whose overrides apply. */
export interface ConfigSet {
  readonly repo?: SizingConfig | undefined;
  readonly spec?: SizingConfig | undefined;
  readonly phase?: string | undefined;
}

/** A size entry with the layer that supplied it. */
export interface SourcedEntry {
  readonly entry: SizeEntry;
  readonly layer: Layer;
}

/** Size → winning entry, for every size some layer defines. */
export type Merged = Readonly<Partial<Record<Size, SourcedEntry>>>;

/**
 * Winning entry for one size: the most specific layer that defines it wins,
 * and it replaces the whole entry (fields are never partially inherited).
 * @param config - the config layers
 * @param size - size to resolve
 * @returns the entry and its layer, or undefined when nothing defines it
 */
export const mergedEntry = (config: ConfigSet, size: Size): SourcedEntry | undefined => {
  const phaseEntry =
    config.phase === undefined ? undefined : config.spec?.phases?.[config.phase]?.sizes[size];
  if (phaseEntry !== undefined) return { entry: phaseEntry, layer: 'phase' };
  const specEntry = config.spec?.sizes[size];
  if (specEntry !== undefined) return { entry: specEntry, layer: 'spec' };
  const repoEntry = config.repo?.sizes[size];
  if (repoEntry !== undefined) return { entry: repoEntry, layer: 'repo' };
  return undefined;
};

/**
 * Merge repo → spec → phase for every size.
 * @param config - the config layers
 * @returns each defined size's winning entry and layer
 */
export const merge = (config: ConfigSet) =>
  SIZES.reduce<Partial<Record<Size, SourcedEntry>>>((merged, size) => {
    const found = mergedEntry(config, size);
    return found === undefined ? merged : { ...merged, [size]: found };
  }, {});

/**
 * Render a size entry as the dispatch string `provider/model#effort`.
 * @param entry - the winning size entry
 * @returns the dispatch target
 */
export const targetOf = (entry: SizeEntry): string =>
  entry.effort === undefined ? entry.model : `${entry.model}#${entry.effort}`;

/** One size's resolved dispatch target and provenance. */
export interface Resolved {
  readonly size: Size;
  /** `provider/model#effort`, or `inherit` when no layer defines the size. */
  readonly target: string;
  /** Winning layer; absent when the target is `inherit`. */
  readonly source?: Layer;
  /** Winning entry; absent when the target is `inherit`. */
  readonly entry?: SizeEntry;
}

/**
 * Resolve one size's dispatch target and the layer that supplied it.
 * @param config - the config layers
 * @param size - size to resolve
 * @returns the target plus its source, or `inherit`
 */
export const resolve = (config: ConfigSet, size: Size): Resolved => {
  const found = mergedEntry(config, size);
  if (found === undefined) return { size, target: INHERIT };
  return { size, target: targetOf(found.entry), source: found.layer, entry: found.entry };
};
