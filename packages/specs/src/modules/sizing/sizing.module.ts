import { Data, Effect, Result, Schema } from 'effect';
import { PHASE_PATTERN } from '../spec/index.js';
import { type Issue, type Result as VerifyResult, finding, noErrors } from '../verify/index.js';
import { isRecord, kindOf, displayValue, faultLeaves, isBlankInput } from '../json/index.js';
import type { FaultLeaf } from '../json/index.js';

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
 * Review cycles one phase member contributes: the cycles its size buys, except
 * a `review` task (which spends the budget) and an unsized task (which declares
 * nothing), both `0`. A bare size counts as a non-review task. This is the only
 * per-input rule; {@link phaseReviewBudget} folds over it and every renderer
 * reads it, so a contribution a surface prints is the one the budget used.
 * @param input - a phase member, as a bare size or a typed task
 * @returns the cycles the member contributes
 */
export const taskContribution = (input: BudgetInput): number => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `input` is the declared `Size | TaskSizing` union; `typeof` picks which arm of that contract to read, not an unparsed value.
  if (typeof input === 'string') return reviewCycles(input);
  if (input.type === 'review' || input.size === undefined) return 0;
  return reviewCycles(input.size);
};

/**
 * Review budget of a phase: the largest {@link taskContribution}, capped at
 * {@link MAX_REVIEW_CYCLES}. The phase's own `review` task never raises the
 * budget, and a phase of tiny tasks gets exactly 1 cycle.
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
    sizes.reduce((budget, input) => Math.max(budget, taskContribution(input)), 0),
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
  model: Schema.String.pipe(
    Schema.check(
      Schema.makeFilter((value: string) => value.trim() !== '' && MODEL_PATTERN.test(value)),
    ),
  ),
  effort: Schema.optionalKey(
    Schema.String.pipe(
      Schema.check(Schema.makeFilter((value: string) => EFFORT_PATTERN.test(value))),
    ),
  ),
});

const SizeMapSchema = Schema.Struct({
  tiny: Schema.optionalKey(SizeEntrySchema),
  small: Schema.optionalKey(SizeEntrySchema),
  medium: Schema.optionalKey(SizeEntrySchema),
  large: Schema.optionalKey(SizeEntrySchema),
});

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

const isString = Schema.is(Schema.String);

const phaseKnown = (source: ConfigSource, phase: string): boolean =>
  PHASE_PATTERN.test(phase) &&
  (source.phases === undefined || source.phases.some((known) => known === phase));

const issueFromFault = (source: ConfigSource, leaf: FaultLeaf): Issue | undefined => {
  const field = leaf.field === '' ? 'root' : leaf.field;
  const segments = leaf.field === '' ? [] : leaf.field.split('.');
  const allowed = source.kind === 'repo' ? ['sizes'] : ['sizes', 'phases'];

  // Root not an object.
  if (leaf.field === '') {
    return finding({
      code: CODES.malformedConfig,
      field: 'root',
      message: 'Config must be a JSON object.',
      expected: 'an object with a "sizes" map',
      actual: kindOf(leaf.input),
      fix: `Rewrite ${source.path} as a JSON object with a "sizes" map.`,
    });
  }

  // Unknown top-level key.
  if (segments.length === 1 && leaf.tag === 'UnexpectedKey') {
    const key = segments[0] ?? field;
    return finding({
      code: CODES.unknownKey,
      field: key,
      message: `Unknown key '${key}'.`,
      expected: allowed.join(' or '),
      actual: key,
      fix: `Remove '${key}' from ${source.path}.`,
    });
  }

  if (segments[0] === 'sizes') {
    // `sizes` itself.
    if (segments.length === 1) {
      if (leaf.tag === 'MissingKey') {
        return finding({
          code: CODES.missingSizes,
          field: 'sizes',
          message: 'Config requires a `sizes` map.',
          expected: 'an object keyed by size',
          actual: 'missing',
          fix: `Add "sizes": {} to ${source.path}.`,
        });
      }
      return finding({
        code: CODES.nonObjectSizes,
        field: 'sizes',
        message: '`sizes` must be an object keyed by size.',
        expected: `an object keyed by ${SIZE_HINT}`,
        actual: kindOf(leaf.input),
        fix: `Rewrite sizes as an object keyed by ${SIZE_HINT}.`,
      });
    }

    // Unknown size key at sizes.<key>.
    if (segments.length === 2 && leaf.tag === 'UnexpectedKey') {
      const key = segments[1] ?? '';
      return finding({
        code: CODES.unknownConfigSize,
        field: `sizes.${key}`,
        message: `Unknown size '${key}'.`,
        expected: SIZE_HINT,
        actual: key,
        fix: `Rename 'sizes.${key}' to one of ${SIZE_HINT}, or remove it.`,
      });
    }

    // Entry not an object.
    if (segments.length === 2 && leaf.tag === 'InvalidType') {
      const sizeKey = segments[1] ?? '';
      return finding({
        code: CODES.nonObjectEntry,
        field: `sizes.${sizeKey}`,
        message: 'A size entry must be an object.',
        expected: 'an object with a "model"',
        actual: kindOf(leaf.input),
        fix: `Rewrite sizes.${sizeKey} as { "model": "${MODEL_HINT}" }.`,
      });
    }

    const entryField = segments.slice(0, 2).join('.');
    const keyName = segments[2];

    if (keyName === 'model') {
      if (leaf.tag === 'MissingKey') {
        return finding({
          code: CODES.missingModel,
          field: `${entryField}.model`,
          message: 'A size entry requires a model.',
          expected: MODEL_RULE,
          actual: 'missing',
          fix: `Add "model": "${MODEL_HINT}" to ${entryField}.`,
        });
      }
      if (isBlankInput(leaf)) {
        return finding({
          code: CODES.missingModel,
          field: `${entryField}.model`,
          message: 'A size entry requires a model.',
          expected: MODEL_RULE,
          actual: 'empty string',
          fix: `Add "model": "${MODEL_HINT}" to ${entryField}.`,
        });
      }
      // non-string input
      if (leaf.tag === 'InvalidType') {
        return finding({
          code: CODES.missingModel,
          field: `${entryField}.model`,
          message: 'A size entry requires a model.',
          expected: MODEL_RULE,
          actual: displayValue(leaf.input),
          fix: `Add "model": "${MODEL_HINT}" to ${entryField}.`,
        });
      }
      return finding({
        code: CODES.malformedModel,
        field: `${entryField}.model`,
        message: 'Model must be an id whose first segment is the provider.',
        expected: MODEL_RULE,
        actual: displayValue(leaf.input),
        fix: `Set ${entryField}.model to a "${MODEL_HINT}" id.`,
      });
    }

    if (keyName === 'effort') {
      return finding({
        code: CODES.malformedEffort,
        field: `${entryField}.effort`,
        message: 'Effort must be a non-empty catalogue variant token.',
        expected: EFFORT_HINT,
        actual: displayValue(leaf.input),
        fix: `Set ${entryField}.effort to a token such as "low", "high", or "max".`,
      });
    }

    // Unknown key inside an entry.
    if (segments.length === 3 && leaf.tag === 'UnexpectedKey') {
      const unknownKey = segments[2] ?? '';
      return finding({
        code: CODES.unknownKey,
        field: `${entryField}.${unknownKey}`,
        message: `Unknown key '${unknownKey}' in a size entry.`,
        expected: 'model or effort',
        actual: unknownKey,
        fix: `Remove '${entryField}.${unknownKey}'.`,
      });
    }
  }

  if (segments[0] === 'phases') {
    // `phases` itself.
    if (segments.length === 1) {
      if (leaf.tag === 'InvalidType') {
        return finding({
          code: CODES.nonObjectPhases,
          field: 'phases',
          message: '`phases` must be an object keyed by phase id.',
          expected: 'an object keyed by phase id such as A',
          actual: kindOf(leaf.input),
          fix: 'Rewrite phases as an object keyed by phase id.',
        });
      }
    }

    const phase = segments[1] ?? '';
    const phaseField = `phases.${phase}`;

    // Phase config not an object.
    if (segments.length === 2 && leaf.tag === 'InvalidType') {
      return finding({
        code: CODES.nonObjectPhase,
        field: phaseField,
        message: 'A phase override must be an object.',
        expected: 'an object with a "sizes" map',
        actual: kindOf(leaf.input),
        fix: `Rewrite ${phaseField} as { "sizes": {} }.`,
      });
    }

    if (segments.length === 3 && segments[2] === 'sizes') {
      if (leaf.tag === 'MissingKey') {
        return finding({
          code: CODES.missingSizes,
          field: `${phaseField}.sizes`,
          message: 'A phase override requires a `sizes` map.',
          expected: 'an object keyed by size',
          actual: 'missing',
          fix: `Add "sizes": {} to ${phaseField}.`,
        });
      }
      if (leaf.tag === 'InvalidType') {
        return finding({
          code: CODES.nonObjectSizes,
          field: `${phaseField}.sizes`,
          message: '`sizes` must be an object keyed by size.',
          expected: `an object keyed by ${SIZE_HINT}`,
          actual: kindOf(leaf.input),
          fix: `Rewrite ${phaseField}.sizes as an object keyed by ${SIZE_HINT}.`,
        });
      }
    }

    // Unknown key inside a phase override.
    if (segments.length === 3 && leaf.tag === 'UnexpectedKey') {
      const unknownKey = segments[2] ?? '';
      return finding({
        code: CODES.unknownKey,
        field: `${phaseField}.${unknownKey}`,
        message: `Unknown key '${unknownKey}' in a phase override.`,
        expected: 'sizes',
        actual: unknownKey,
        fix: `Remove '${phaseField}.${unknownKey}'.`,
      });
    }

    // Unknown size key under phase.
    if (segments.length === 4 && segments[2] === 'sizes' && leaf.tag === 'UnexpectedKey') {
      const sizeKey = segments[3] ?? '';
      return finding({
        code: CODES.unknownConfigSize,
        field: `phases.${phase}.sizes.${sizeKey}`,
        message: `Unknown size '${sizeKey}'.`,
        expected: SIZE_HINT,
        actual: sizeKey,
        fix: `Rename 'phases.${phase}.sizes.${sizeKey}' to one of ${SIZE_HINT}, or remove it.`,
      });
    }

    // Entry not an object under phase.
    if (segments.length === 4 && segments[2] === 'sizes' && leaf.tag === 'InvalidType') {
      const sizeKey = segments[3] ?? '';
      return finding({
        code: CODES.nonObjectEntry,
        field: `phases.${phase}.sizes.${sizeKey}`,
        message: 'A size entry must be an object.',
        expected: 'an object with a "model"',
        actual: kindOf(leaf.input),
        fix: `Rewrite phases.${phase}.sizes.${sizeKey} as { "model": "${MODEL_HINT}" }.`,
      });
    }

    // Model/effort under phase: sizes.<size>.model/effort
    if (segments.length === 5 && segments[2] === 'sizes') {
      const sizeKey = segments[3] ?? '';
      const entryField = `phases.${phase}.sizes.${sizeKey}`;
      const keyName = segments[4];
      if (keyName === 'model') {
        if (leaf.tag === 'MissingKey') {
          return finding({
            code: CODES.missingModel,
            field: `${entryField}.model`,
            message: 'A size entry requires a model.',
            expected: MODEL_RULE,
            actual: 'missing',
            fix: `Add "model": "${MODEL_HINT}" to ${entryField}.`,
          });
        }
        if (isBlankInput(leaf)) {
          return finding({
            code: CODES.missingModel,
            field: `${entryField}.model`,
            message: 'A size entry requires a model.',
            expected: MODEL_RULE,
            actual: 'empty string',
            fix: `Add "model": "${MODEL_HINT}" to ${entryField}.`,
          });
        }
        if (leaf.tag === 'InvalidType') {
          return finding({
            code: CODES.missingModel,
            field: `${entryField}.model`,
            message: 'A size entry requires a model.',
            expected: MODEL_RULE,
            actual: displayValue(leaf.input),
            fix: `Add "model": "${MODEL_HINT}" to ${entryField}.`,
          });
        }
        return finding({
          code: CODES.malformedModel,
          field: `${entryField}.model`,
          message: 'Model must be an id whose first segment is the provider.',
          expected: MODEL_RULE,
          actual: displayValue(leaf.input),
          fix: `Set ${entryField}.model to a "${MODEL_HINT}" id.`,
        });
      }
      if (keyName === 'effort') {
        return finding({
          code: CODES.malformedEffort,
          field: `${entryField}.effort`,
          message: 'Effort must be a non-empty catalogue variant token.',
          expected: EFFORT_HINT,
          actual: displayValue(leaf.input),
          fix: `Set ${entryField}.effort to a token such as "low", "high", or "max".`,
        });
      }
    }
  }

  // Fallback for non-object sizes under phases? handled above. Default undefined.
  return undefined;
};

/**
 * Mechanically verify one parsed `sizing.json` against the config contract using
 * schema-backed decoding: the config schemas are authoritative, and each schema
 * fault maps to one coded sizing issue. Pure — the caller supplies the decoded
 * JSON value.
 * @param source - where the config lives and which shape applies
 * @param value - the JSON value decoded at the config boundary
 * @returns the result; `valid` is true only with zero issues
 */
export const verify = (source: ConfigSource, value: Json): VerifyResult => {
  const issues: Array<Issue> = [];

  const configSchema = source.kind === 'repo' ? RepoConfigSchema : SpecConfigSchema;
  const decoded = Schema.decodeUnknownResult(configSchema, {
    onExcessProperty: 'error',
    reportInput: true,
  })(value);

  const unknownPhases = new Set<string>();
  if (isRecord(value) && source.kind === 'spec' && isRecord(value.phases)) {
    for (const phase of Object.keys(value.phases)) {
      if (!phaseKnown(source, phase)) unknownPhases.add(phase);
    }
  }

  // Map schema faults to coded issues, dropping any fault that lives under an
  // unknown phase (that phase is reported once by the semantic pass below).
  if (Result.isFailure(decoded)) {
    const leaves = faultLeaves(decoded.failure.issue);
    for (const leaf of leaves) {
      const segments = leaf.field.split('.').filter((part) => part !== '');
      if (segments[0] === 'phases' && segments[1] !== undefined && unknownPhases.has(segments[1])) {
        continue;
      }
      const mapped = issueFromFault(source, leaf);
      if (mapped !== undefined) issues.push(mapped);
    }
  }

  // Semantic checks that the schemas cannot express per-key.
  if (isRecord(value)) {
    if (source.kind === 'spec' && isRecord(value.phases)) {
      for (const phase of Object.keys(value.phases)) {
        if (!phaseKnown(source, phase)) {
          issues.push(
            finding({
              code: CODES.unknownPhase,
              field: `phases.${phase}`,
              message: `Unknown phase '${phase}'.`,
              expected: 'a phase id such as A or AA',
              actual: phase,
              fix: `Rename 'phases.${phase}' to a phase id such as A, or remove it.`,
            }),
          );
        }
      }
    }

    // effort without a model (raw semantic check, independent of schema success)
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- this reads a decoded JSON value whose shape is validated by the schema above.
    const checkEffortWithoutModel = (prefix: string, sizesValue: unknown): void => {
      if (!isRecord(sizesValue)) return;
      for (const [sizeKey, entry] of Object.entries(sizesValue)) {
        if (!isSize(sizeKey)) continue;
        if (!isRecord(entry)) continue;
        if (entry.effort === undefined) continue;
        const model = entry.model;
        const hasModel = model !== undefined && isString(model) && model.trim() !== '';
        if (!hasModel) {
          issues.push(
            finding({
              code: CODES.effortWithoutModel,
              field: `${prefix}.${sizeKey}.effort`,
              message: 'An effort without a model is invalid.',
              expected: 'a "model" alongside "effort"',
              actual: 'model missing',
              fix: `Add "model" to ${prefix}.${sizeKey}, or remove "effort".`,
            }),
          );
        }
      }
    };
    if (isRecord(value.sizes)) checkEffortWithoutModel('sizes', value.sizes);
    if (source.kind === 'spec' && isRecord(value.phases)) {
      for (const phase of Object.keys(value.phases)) {
        if (!phaseKnown(source, phase)) continue;
        const phaseConfig = value.phases[phase];
        if (!isRecord(phaseConfig)) continue;
        if (isRecord(phaseConfig.sizes)) {
          checkEffortWithoutModel(`phases.${phase}.sizes`, phaseConfig.sizes);
        }
      }
    }
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
