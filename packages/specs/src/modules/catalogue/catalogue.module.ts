import { Result as R, Schema } from 'effect';
import type { Effect } from 'effect';
import type { Result } from 'effect/Result';
import {
  EFFORT_HINT,
  EFFORT_PATTERN,
  MODEL_HINT,
  MODEL_PATTERN,
  MODEL_RULE,
} from '../sizing/index.js';
import { type Issue, finding } from '../verify/index.js';
import { kindOf, faultLeaves, faultActual, isBlankInput } from '../json/index.js';
import type { FaultLeaf } from '../json/index.js';

/**
 * The harness model catalogue: the models a host can dispatch, the effort
 * variants each one reports, and the host's default model. The module is pure:
 * it normalizes descriptors, decodes and encodes the stable JSON document,
 * renders the table, and cross-checks `sizing.json` entries. Reading a port or
 * a `--catalog` file is the caller's job.
 *
 * The catalogue is the authority on dispatch targets, so it only ever exposes
 * ids, variant tokens, and a default label the sizing grammar can store:
 * `normalize` drops the rest from a host source, and `decode` refuses a file
 * that carries one.
 */

/** Stable, greppable codes for every catalogue failure class. */
export const CODES = {
  unknownModel: 'models.unknown-model',
  unknownEffort: 'models.unknown-effort',
  unknownProvider: 'models.unknown-provider',
  unavailable: 'models.unavailable',
  malformedCatalog: 'models.malformed-catalog',
} as const;

/** One stable catalogue code. */
export type Code = (typeof CODES)[keyof typeof CODES];

/**
 * One model a source reports. `variants` is absent or `null` when the source
 * does not know the effort variants, and an array (possibly empty) when it
 * does. The distinction is semantic: unknown variants never authorize an
 * effort and never produce an effort finding.
 */
export interface SourceModel {
  readonly providerID: string;
  readonly modelID: string;
  readonly variants?: readonly string[] | null;
}

/** A host default model, as the model seam reports it. */
export interface SourceDefault {
  readonly providerID: string;
  readonly modelID: string;
}

/** The slice of the host model seam the catalogue reads. */
export interface ModelSource {
  readonly list: () => Effect.Effect<readonly SourceModel[]>;
  readonly default: () => Effect.Effect<SourceDefault | undefined>;
}

/** One normalized catalogue entry. */
export interface CatalogueModel {
  readonly providerID: string;
  readonly modelID: string;
  /** `providerID/modelID`, the label every other surface prints. */
  readonly label: string;
  /** Known effort variants, or `null` when the host does not report them. */
  readonly variants: readonly string[] | null;
}

/** Counts of host descriptors normalization dropped because the sizing grammar
 * cannot store them. Zero when nothing was dropped. */
export interface Omitted {
  readonly models: number;
  readonly variants: number;
  readonly defaults: number;
}

/** Counts of host descriptors normalization dropped. Alias for {@link Omitted}. */
export type OmittedCounts = Omitted;

/** The normalized catalogue every surface consumes. */
export interface Catalogue {
  /** Host default label, or `null` when the host reports none. */
  readonly default: string | null;
  /** Models sorted by provider then model. */
  readonly models: ReadonlyArray<CatalogueModel>;
  /** How many host descriptors normalization dropped. */
  readonly omitted: Omitted;
}

/** One model in the stable JSON document. */
export interface CatalogueDocumentModel {
  readonly providerID: string;
  readonly modelID: string;
  readonly variants: readonly string[] | null;
}

/**
 * The stable, date-free JSON document. It is also valid `--catalog` input, so
 * `mf-specs models --json` round-trips through the file.
 */
export interface CatalogueDocument {
  readonly default: string | null;
  readonly models: ReadonlyArray<CatalogueDocumentModel>;
  /** How many host descriptors normalization dropped. Optional on input. */
  readonly omitted?: Omitted;
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const unionVariants = (
  left: Array<string> | null,
  right: Array<string> | null,
): Array<string> | null => {
  if (left === null || right === null) return null;
  const unique = new Set([...left, ...right]);
  return [...unique].toSorted(compare);
};

const defaultLabel = (value: SourceDefault | string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  const label = Schema.is(Schema.String)(value)
    ? value.trim()
    : `${value.providerID.trim()}/${value.modelID.trim()}`;
  return MODEL_PATTERN.test(label) ? label : null;
};

/**
 * Normalize descriptors into one catalogue: trim, drop blank entries and any
 * label the sizing grammar cannot store, collapse duplicates (union known
 * variants, `null` wins), and sort by provider then model.
 * @param sources - descriptors from the host, the file decoder, or a test
 * @param defaultModel - host default, as an object or an already-joined label
 * @returns the normalized catalogue
 */
export const normalize = (
  sources: ReadonlyArray<SourceModel>,
  defaultModel?: SourceDefault | string | null,
): Catalogue => {
  interface Working {
    readonly providerID: string;
    readonly modelID: string;
    variants: Array<string> | null;
  }
  const merged = new Map<string, Working>();
  let omittedModels = 0;
  let omittedVariants = 0;
  for (const source of sources) {
    const providerID = source.providerID.trim();
    const modelID = source.modelID.trim();
    if (providerID === '' || modelID === '') {
      omittedModels++;
      continue;
    }
    const key = `${providerID}/${modelID}`;
    if (!MODEL_PATTERN.test(key)) {
      omittedModels++;
      continue;
    }
    let variants: Array<string> | null;
    if (source.variants === null || source.variants === undefined) {
      variants = null;
    } else {
      const unique = new Set<string>();
      for (const value of source.variants) {
        const variant = value.trim();
        if (variant !== '' && EFFORT_PATTERN.test(variant)) unique.add(variant);
        else omittedVariants++;
      }
      variants = [...unique].toSorted(compare);
    }
    const current = merged.get(key);
    if (current === undefined) {
      merged.set(key, { providerID, modelID, variants });
      continue;
    }
    current.variants = unionVariants(current.variants, variants);
  }
  const models = [...merged.values()]
    .map((entry): CatalogueModel => ({
      providerID: entry.providerID,
      modelID: entry.modelID,
      label: `${entry.providerID}/${entry.modelID}`,
      variants: entry.variants,
    }))
    .toSorted(
      (left, right) =>
        compare(left.providerID, right.providerID) || compare(left.modelID, right.modelID),
    );
  let omittedDefaults = 0;
  const defaultResult = defaultLabel(defaultModel);
  if (defaultModel !== undefined && defaultModel !== null) {
    const hasLabel = Schema.is(Schema.String)(defaultModel) ? defaultModel.trim() !== '' : true;
    if (hasLabel && defaultResult === null) omittedDefaults = 1;
  }
  return {
    default: defaultResult,
    models,
    omitted: { models: omittedModels, variants: omittedVariants, defaults: omittedDefaults },
  };
};

/**
 * Keep only one provider's models. The default label is kept only when it names
 * a model that survives the filter: a filtered document must never carry a
 * `default` pointing outside its own `models` array, because that document is
 * also `--catalog` input and a `*` marker on a model the caller filtered out
 * would contradict the list. A filter that matches nothing returns an empty,
 * default-free catalogue; the caller decides whether that is a diagnostic.
 * @param catalogue - normalized catalogue
 * @param providerID - provider to keep, trimmed
 * @returns the filtered catalogue
 */
export const filterProvider = (catalogue: Catalogue, providerID: string): Catalogue => {
  const provider = providerID.trim();
  const models = catalogue.models.filter((model) => model.providerID === provider);
  const kept =
    catalogue.default !== null && models.some((model) => model.label === catalogue.default)
      ? catalogue.default
      : null;
  return { default: kept, models, omitted: catalogue.omitted };
};

/** Distinct providers in catalogue order, for miss diagnostics. */
export const providersOf = (catalogue: Catalogue): ReadonlyArray<string> => {
  const seen = new Set<string>();
  for (const model of catalogue.models) seen.add(model.providerID);
  return [...seen];
};

/**
 * Find one catalogue entry by its `provider/model` label.
 * @param catalogue - normalized catalogue
 * @param label - model label from a config entry
 * @returns the entry, or undefined when the host does not have it
 */
export const findModel = (catalogue: Catalogue, label: string): CatalogueModel | undefined => {
  const wanted = label.trim();
  return catalogue.models.find((model) => model.label === wanted);
};

/** The JSON document for one catalogue. */
export const toDocument = (catalogue: Catalogue): CatalogueDocument => ({
  default: catalogue.default,
  models: catalogue.models.map((model): CatalogueDocumentModel => ({
    providerID: model.providerID,
    modelID: model.modelID,
    variants: model.variants,
  })),
  omitted: catalogue.omitted,
});

/**
 * Render the stable JSON document. No dates, no host-specific metadata, and a
 * key order that does not depend on insertion order.
 * @param catalogue - normalized catalogue
 * @returns pretty JSON without a trailing newline
 */
export const toJson = (catalogue: Catalogue): string =>
  JSON.stringify(toDocument(catalogue), null, 2);

/** The default table: one line per model, variants, and a default marker. */
export const renderTable = (catalogue: Catalogue): string => {
  const footer = `omitted: ${catalogue.omitted.models} models, ${catalogue.omitted.variants} variants, ${catalogue.omitted.defaults} defaults`;
  if (catalogue.models.length === 0) return `no models\n${footer}`;
  const body = catalogue.models
    .map((model) => {
      const variants =
        model.variants === null
          ? 'variants unknown'
          : model.variants.length === 0
            ? 'variants none'
            : `variants ${model.variants.join(',')}`;
      const marker = catalogue.default === model.label ? '  *' : '';
      return `${model.label}  ${variants}${marker}`;
    })
    .join('\n');
  return `${body}\n${footer}`;
};

// ─── Catalog file ─────────────────────────────────────────────────────

/** Narrow to a JSON string. */
const isString = Schema.is(Schema.String);

const malformed = (
  path: string,
  field: string,
  problem: string,
  expected: string,
  actual: string,
  fix: string,
  cause?: unknown,
): Issue => {
  const base = { code: CODES.malformedCatalog, field, message: problem, expected, actual, fix };
  return finding(cause === undefined ? base : { ...base, cause });
};

const DOCUMENT_HINT = 'a JSON object with "default" and "models"';

const ENTRY_HINT = 'an object with "providerID", "modelID", and optional "variants"';

const VARIANTS_HINT = 'an array of non-empty strings or null';

/** The variant grammar, for `expected`; derived from the sizing hint. */
const EFFORT_RULE = `${EFFORT_HINT}, with no whitespace and no #`;

/** A catalogue id or variant: a string with at least one non-whitespace character. */
const NonBlank = Schema.String.pipe(
  Schema.check(Schema.makeFilter((value: string) => value.trim() !== '')),
);

/** A variant token `sizing.json` can store as an `effort`. */
const EffortToken = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      const token = value.trim();
      return token !== '' && EFFORT_PATTERN.test(token);
    }),
  ),
);

/** A default label `sizing.json` can store. */
const DefaultLabel = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      const label = value.trim();
      return label !== '' && MODEL_PATTERN.test(label);
    }),
  ),
);

/** The `--catalog` contract: the same document `models --json` writes. */
const FileDocument = Schema.Struct({
  default: Schema.optionalKey(Schema.NullOr(DefaultLabel)),
  models: Schema.Array(
    Schema.Struct({
      providerID: NonBlank,
      modelID: NonBlank,
      variants: Schema.optionalKey(Schema.NullOr(Schema.Array(EffortToken))),
    }).pipe(
      // The joined label is the dispatch target, so it must be storable even
      // though each half is non-blank on its own.
      Schema.check(
        Schema.makeFilter((model: { readonly providerID: string; readonly modelID: string }) =>
          MODEL_PATTERN.test(`${model.providerID.trim()}/${model.modelID.trim()}`),
        ),
      ),
    ),
  ),
  omitted: Schema.optionalKey(
    Schema.Struct({
      models: Schema.Int,
      variants: Schema.Int,
      defaults: Schema.Int,
    }),
  ),
});

type FileDocument = typeof FileDocument.Type;

/** The two id halves a rejected entry declares. */
const IdHalves = Schema.Struct({ providerID: Schema.String, modelID: Schema.String });

/** The joined label a rejected entry declares, for the `actual` cell. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this reads a schema issue's rejected input, which the issue types as `unknown`.
const labelOf = (value: unknown): string => {
  if (!Schema.is(IdHalves)(value)) return kindOf(value);
  return `${value.providerID.trim()}/${value.modelID.trim()}`;
};

/** Quote a character for repair text, naming a space instead of echoing `" "`. */
const namedChar = (char: string): string => (char === ' ' ? 'a space' : `"${char}"`);

/**
 * Name the first rule `MODEL_PATTERN` the label breaks, so the `fix` cell
 * describes the actual violation instead of guessing at whitespace or `#`.
 * The pattern is one `/`, an alphanumeric first character on each half, and a
 * per-half character set.
 */
const idViolation = (label: string): string => {
  const slash = label.indexOf('/');
  if (slash === -1) return 'has no "/" between the provider and the model';
  const provider = label.slice(0, slash);
  const model = label.slice(slash + 1);
  if (!/^[A-Za-z0-9]/.test(provider))
    return `starts the provider with ${namedChar(provider[0] ?? '')}, so it must begin with a letter or digit`;
  const providerBad = /[^A-Za-z0-9._-]/.exec(provider);
  if (providerBad !== null)
    return `contains ${namedChar(providerBad[0])} in the provider, which may use only letters, digits, ".", "_", and "-"`;
  if (!/^[A-Za-z0-9]/.test(model))
    return `starts the model with ${namedChar(model[0] ?? '')}, so it must begin with a letter or digit`;
  const modelBad = /[^A-Za-z0-9._:/-]/.exec(model);
  if (modelBad !== null)
    return `contains ${namedChar(modelBad[0])} in the model, which may use only letters, digits, ".", "_", ":", "/", and "-"`;
  return 'does not match the sizing grammar';
};

/** Render one schema failure as the coded `models.malformed-catalog` finding. */
const malformedFromFault = (path: string, leaf: FaultLeaf): Issue => {
  const field = leaf.field === '' ? 'root' : leaf.field;
  const actual = faultActual(leaf);
  if (leaf.field === '') {
    return malformed(
      path,
      'root',
      'Catalogue must be a JSON object.',
      DOCUMENT_HINT,
      actual,
      `Rewrite ${path} as { "default": "provider/model", "models": [] }.`,
    );
  }
  const segments = leaf.field.split('.');
  const [head, index, key] = segments;
  if (segments.length === 1 && leaf.tag === 'UnexpectedKey') {
    return malformed(
      path,
      field,
      `Unknown key '${head}' in a catalogue.`,
      'only "default" and "models"',
      head ?? field,
      `Remove '${head}' from ${path}.`,
    );
  }
  if (head === 'default') {
    if (isBlankInput(leaf)) {
      return malformed(
        path,
        'default',
        '`default` must not be empty.',
        'a non-empty provider/model label or null',
        'empty string',
        `Set ${path} default to "provider/model", or null when the host has none.`,
      );
    }
    const label = leaf.hasInput && isString(leaf.input) ? leaf.input.trim() : actual;
    return malformed(
      path,
      'default',
      '`default` must be a provider/model label or null.',
      'a storable provider/model label or null',
      label,
      `Set ${path} default to "provider/model", or null when the host has none.`,
    );
  }
  if (head === 'models') {
    if (segments.length === 1) {
      return leaf.tag === 'MissingKey'
        ? malformed(
            path,
            'models',
            'Catalogue requires a `models` array.',
            'an array of catalogue models',
            'missing',
            `Add "models": [] to ${path}.`,
          )
        : malformed(
            path,
            'models',
            '`models` must be an array.',
            'an array of catalogue models',
            actual,
            `Rewrite ${path} models as an array of catalogue models.`,
          );
    }
    if (segments.length === 2) {
      if (leaf.tag === 'InvalidType') {
        return malformed(
          path,
          field,
          'A catalogue model must be an object.',
          ENTRY_HINT,
          actual,
          `Rewrite ${field} as { "providerID": "provider", "modelID": "model", "variants": null }.`,
        );
      }
      const label = labelOf(leaf.input);
      return malformed(
        path,
        field,
        'A catalogue model id must match the sizing grammar.',
        MODEL_RULE,
        label,
        `Rewrite ${field}.providerID and ${field}.modelID as a storable "${MODEL_HINT}" id: '${label}' ${idViolation(label)}.`,
      );
    }
    const entry = `models.${index}`;
    if (key === 'providerID' || key === 'modelID') {
      const missing = leaf.tag === 'MissingKey';
      return malformed(
        path,
        field,
        `A catalogue model requires a ${key}.`,
        `a non-empty ${key} string`,
        isBlankInput(leaf) ? 'empty string' : actual,
        missing
          ? `Add "${key}": "${key === 'providerID' ? 'provider' : 'model'}" to ${entry}.`
          : `Set ${entry}.${key} to a non-empty ${key === 'providerID' ? 'provider' : 'model'} id.`,
      );
    }
    if (key === 'variants' && segments.length === 3) {
      return malformed(
        path,
        field,
        'Variants must be an array of strings or null.',
        VARIANTS_HINT,
        actual,
        `Set ${entry}.variants to an array of strings, or null when unknown.`,
      );
    }
    if (key === 'variants') {
      const token = leaf.hasInput && isString(leaf.input) ? leaf.input.trim() : undefined;
      if (token !== undefined && token !== '') {
        return malformed(
          path,
          field,
          'Every variant must be a storable effort token.',
          EFFORT_RULE,
          token,
          `Rewrite ${field} to a token such as "low", "high", or "max", with no whitespace or '#'.`,
        );
      }
      const empty = isBlankInput(leaf);
      return malformed(
        path,
        `${entry}.variants`,
        'Every variant must be a non-empty string.',
        VARIANTS_HINT,
        empty ? 'empty string' : actual,
        empty
          ? `Remove the empty variant from ${entry}.variants.`
          : `Replace the non-string variant in ${entry}.variants with a non-empty string.`,
      );
    }
    if (key !== undefined) {
      return malformed(
        path,
        field,
        `Unknown key '${key}' in a catalogue model.`,
        'only providerID, modelID, variants',
        key,
        `Remove '${field}' from ${path}.`,
      );
    }
  }
  return malformed(
    path,
    field,
    'Catalogue does not match the document schema.',
    DOCUMENT_HINT,
    actual,
    `Rewrite ${path} as { "default": "provider/model", "models": [] }.`,
  );
};

const decodeFile = Schema.decodeUnknownResult(FileDocument, {
  onExcessProperty: 'error',
  reportInput: true,
});

/**
 * Decode a `--catalog` document. Strict on the root keys and each model, so a
 * file that only looks like JSON fails with `models.malformed-catalog` instead
 * of producing a partial catalogue.
 * @param text - raw file contents
 * @param path - display path named in the repair text
 * @returns the normalized catalogue, or the first malformed finding
 */
export const decode = (text: string, path: string): Result<Catalogue, Issue> => {
  const parsed = R.try({
    try: () => JSON.parse(text),
    catch: (cause) => cause,
  });
  if (R.isFailure(parsed)) {
    return R.fail(
      malformed(
        path,
        'root',
        'Catalogue is not valid JSON.',
        DOCUMENT_HINT,
        'unparseable JSON',
        `Rewrite ${path} as valid JSON.`,
        parsed.failure,
      ),
    );
  }
  const decoded = decodeFile(parsed.success);
  if (R.isFailure(decoded)) {
    const leaf = faultLeaves(decoded.failure.issue)[0];
    return R.fail(
      leaf === undefined
        ? malformed(
            path,
            'root',
            'Catalogue does not match the document schema.',
            DOCUMENT_HINT,
            'unknown',
            `Rewrite ${path} as { "default": "provider/model", "models": [] }.`,
          )
        : malformedFromFault(path, leaf),
    );
  }
  const document = decoded.success;
  const catalogue = normalize(
    document.models.map((model): SourceModel => ({
      providerID: model.providerID,
      modelID: model.modelID,
      variants: model.variants ?? null,
    })),
    document.default ?? null,
  );
  return R.succeed(
    document.omitted === undefined ? catalogue : { ...catalogue, omitted: document.omitted },
  );
};

// ─── Config cross-check ───────────────────────────────────────────────

/** One `sizing.json` model entry to cross-check. */
export interface ConfigEntry {
  /** Display path of the config file (`sizing.json`, `my-spec/sizing.json`). */
  readonly path: string;
  /** Field inside the file (`sizes.tiny`, `phases.A.sizes.tiny`). */
  readonly field: string;
  readonly model: string;
  readonly effort?: string | undefined;
}

/** One advisory finding from {@link verify}. */
export interface ConfigFinding {
  readonly path: string;
  readonly field: string;
  readonly code: Code;
  readonly message: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly fix?: string | undefined;
  readonly severity: 'warning';
}

const unknownModelFinding = (entry: ConfigEntry): ConfigFinding => ({
  path: entry.path,
  field: `${entry.field}.model`,
  code: CODES.unknownModel,
  message: `Model '${entry.model}' is not in the host catalogue.`,
  expected: 'a model id listed by `mf-specs models`',
  actual: entry.model,
  fix: `Use a model from \`mf-specs models\`, or install '${entry.model}' on this host and re-run.`,
  severity: 'warning',
});

const unknownEffortFinding = (entry: ConfigEntry, model: CatalogueModel): ConfigFinding => {
  const variants = model.variants ?? [];
  const expected =
    variants.length === 0
      ? 'no effort (this model has no variants)'
      : `one of ${variants.join(', ')}`;
  const fix =
    variants.length === 0
      ? `Remove "effort" from ${entry.field}; '${model.label}' has no variants.`
      : `Set ${entry.path} ${entry.field}.effort to one of ${variants.join(', ')}, or remove "effort".`;
  return {
    path: entry.path,
    field: `${entry.field}.effort`,
    code: CODES.unknownEffort,
    message: `Effort '${entry.effort ?? ''}' is not a variant of '${model.label}'.`,
    expected,
    actual: entry.effort ?? '',
    fix,
    severity: 'warning',
  };
};

/**
 * Cross-check every config entry against the catalogue in one pass. An absent
 * model is `models.unknown-model`; an effort absent from a known variant list
 * is `models.unknown-effort`. Unknown variants (`null`) skip the effort check
 * entirely, so a partial host catalogue never invents a finding.
 * @param catalogue - normalized catalogue
 * @param entries - every model entry from the repo and spec configs
 * @returns warnings in input order
 */
export const verify = (
  catalogue: Catalogue,
  entries: ReadonlyArray<ConfigEntry>,
): ReadonlyArray<ConfigFinding> => {
  const findings: Array<ConfigFinding> = [];
  for (const entry of entries) {
    const model = findModel(catalogue, entry.model);
    if (model === undefined) {
      findings.push(unknownModelFinding(entry));
      continue;
    }
    if (entry.effort === undefined) continue;
    if (model.variants === null) continue;
    if (model.variants.includes(entry.effort)) continue;
    findings.push(unknownEffortFinding(entry, model));
  }
  return findings;
};
