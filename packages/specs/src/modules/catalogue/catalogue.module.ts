import { Result as R, Schema } from 'effect';
import type { Effect } from 'effect';
import type { Result } from 'effect/Result';
import { type Issue, finding } from '../verify/index.js';

/**
 * The harness model catalogue: the models a host can dispatch, the effort
 * variants each one reports, and the host's default model. The module is pure:
 * it normalizes descriptors, decodes and encodes the stable JSON document,
 * renders the table, and cross-checks `sizing.json` entries. Reading a port or
 * a `--catalog` file is the caller's job.
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

/** The normalized catalogue every surface consumes. */
export interface Catalogue {
  /** Host default label, or `null` when the host reports none. */
  readonly default: string | null;
  /** Models sorted by provider then model. */
  readonly models: ReadonlyArray<CatalogueModel>;
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
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** Trim, dedupe, and sort a known variant list; `null`/absent stays unknown. */
const variantsOf = (values: readonly string[] | null | undefined): Array<string> | null => {
  if (values === null || values === undefined) return null;
  const unique = new Set<string>();
  for (const value of values) {
    const variant = value.trim();
    if (variant !== '') unique.add(variant);
  }
  return [...unique].toSorted(compare);
};

/**
 * Two duplicate entries collapse. Known lists union; a `null` on either side
 * keeps the entry unknown, because one source refusing to report variants
 * means the catalogue cannot claim to know them.
 */
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
  if (Schema.is(Schema.String)(value)) {
    const label = value.trim();
    return label === '' ? null : label;
  }
  const providerID = value.providerID.trim();
  const modelID = value.modelID.trim();
  return providerID === '' || modelID === '' ? null : `${providerID}/${modelID}`;
};

/**
 * Normalize descriptors into one catalogue: trim, drop blank entries, collapse
 * duplicates (union known variants, `null` wins), and sort by provider then
 * model.
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
  for (const source of sources) {
    const providerID = source.providerID.trim();
    const modelID = source.modelID.trim();
    if (providerID === '' || modelID === '') continue;
    const key = `${providerID}/${modelID}`;
    const variants = variantsOf(source.variants);
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
  return { default: defaultLabel(defaultModel), models };
};

/**
 * Keep only one provider's models, preserving the default label. A filter that
 * matches nothing returns an empty catalogue; the caller decides whether that
 * is a diagnostic.
 * @param catalogue - normalized catalogue
 * @param providerID - provider to keep, trimmed
 * @returns the filtered catalogue
 */
export const filterProvider = (catalogue: Catalogue, providerID: string): Catalogue => {
  const provider = providerID.trim();
  return {
    default: catalogue.default,
    models: catalogue.models.filter((model) => model.providerID === provider),
  };
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
  if (catalogue.models.length === 0) return 'no models';
  return catalogue.models
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
};

// ─── Catalog file ─────────────────────────────────────────────────────

/** JSON value decoded at the catalogue boundary. */
type Json = Schema.Json;

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const isString = Schema.is(Schema.String);

const isArray = Schema.is(Schema.Array(Schema.Json));

/** Name a value's JSON kind for an `actual` field, without echoing a cause. */
const kindOf = (value: Json): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (isString(value)) return 'string';
  if (Schema.is(Schema.Number)(value)) return 'number';
  if (Schema.is(Schema.Boolean)(value)) return 'boolean';
  return 'object';
};

const malformed = (
  path: string,
  field: string,
  problem: string,
  actual: string,
  fix: string,
): Issue =>
  finding({
    code: CODES.malformedCatalog,
    field,
    message: problem,
    expected: 'a JSON object with "default" and "models"',
    actual,
    fix,
  });

const DOCUMENT_KEYS = ['default', 'models'] as const;

const decodeEntries = (
  path: string,
  models: ReadonlyArray<Json>,
): Result<ReadonlyArray<SourceModel>, Issue> => {
  const entries: Array<SourceModel> = [];
  for (let index = 0; index < models.length; index++) {
    const entry = models[index];
    const field = `models.${index}`;
    if (entry === undefined || !isRecord(entry)) {
      return R.fail(
        malformed(
          path,
          field,
          'A catalogue model must be an object.',
          entry === undefined ? 'missing' : kindOf(entry),
          `Rewrite ${field} as { "providerID": "provider", "modelID": "model", "variants": null }.`,
        ),
      );
    }
    for (const key of Object.keys(entry)) {
      if (key === 'providerID' || key === 'modelID' || key === 'variants') continue;
      return R.fail(
        malformed(
          path,
          `${field}.${key}`,
          `Unknown key '${key}' in a catalogue model.`,
          key,
          `Remove '${field}.${key}' from ${path}.`,
        ),
      );
    }
    const providerID = entry.providerID;
    if (!isString(providerID) || providerID.trim() === '') {
      return R.fail(
        malformed(
          path,
          `${field}.providerID`,
          'A catalogue model requires a providerID.',
          providerID === undefined ? 'missing' : kindOf(providerID),
          `Add "providerID": "provider" to ${field}.`,
        ),
      );
    }
    const modelID = entry.modelID;
    if (!isString(modelID) || modelID.trim() === '') {
      return R.fail(
        malformed(
          path,
          `${field}.modelID`,
          'A catalogue model requires a modelID.',
          modelID === undefined ? 'missing' : kindOf(modelID),
          `Add "modelID": "model" to ${field}.`,
        ),
      );
    }
    const rawVariants = entry.variants;
    if (rawVariants === undefined || rawVariants === null) {
      entries.push({ providerID, modelID, variants: null });
      continue;
    }
    if (!isArray(rawVariants)) {
      return R.fail(
        malformed(
          path,
          `${field}.variants`,
          'Variants must be an array of strings or null.',
          kindOf(rawVariants),
          `Set ${field}.variants to an array of strings, or null when unknown.`,
        ),
      );
    }
    const variants: Array<string> = [];
    for (const variant of rawVariants) {
      if (!isString(variant) || variant.trim() === '') {
        return R.fail(
          malformed(
            path,
            `${field}.variants`,
            'Every variant must be a non-empty string.',
            isString(variant) ? 'empty string' : kindOf(variant),
            `Remove the empty variant from ${field}.variants.`,
          ),
        );
      }
      variants.push(variant);
    }
    entries.push({ providerID, modelID, variants });
  }
  return R.succeed(entries);
};

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
    // SAFETY: `JSON.parse` returns the JSON value the text encodes; the
    // verifier below rejects anything that is not the documented shape.
    try: () => JSON.parse(text) as Json,
    catch: (cause) => cause,
  });
  if (R.isFailure(parsed)) {
    return R.fail(
      malformed(
        path,
        'root',
        'Catalogue is not valid JSON.',
        'unparseable JSON',
        `Rewrite ${path} as valid JSON.`,
      ),
    );
  }
  const value = parsed.success;
  if (!isRecord(value)) {
    return R.fail(
      malformed(
        path,
        'root',
        'Catalogue must be a JSON object.',
        kindOf(value),
        `Rewrite ${path} as { "default": "provider/model", "models": [] }.`,
      ),
    );
  }
  for (const key of Object.keys(value)) {
    if (DOCUMENT_KEYS.some((allowed) => allowed === key)) continue;
    return R.fail(
      malformed(
        path,
        key,
        `Unknown key '${key}' in a catalogue.`,
        key,
        `Remove '${key}' from ${path}.`,
      ),
    );
  }
  const rawModels = value.models;
  if (rawModels === undefined) {
    return R.fail(
      malformed(
        path,
        'models',
        'Catalogue requires a `models` array.',
        'missing',
        `Add "models": [] to ${path}.`,
      ),
    );
  }
  if (!isArray(rawModels)) {
    return R.fail(
      malformed(
        path,
        'models',
        '`models` must be an array.',
        kindOf(rawModels),
        `Rewrite ${path} models as an array of catalogue models.`,
      ),
    );
  }

  let defaultModel: string | null = null;
  const rawDefault = value.default;
  if (rawDefault !== undefined && rawDefault !== null) {
    if (!isString(rawDefault)) {
      return R.fail(
        malformed(
          path,
          'default',
          '`default` must be a provider/model label or null.',
          kindOf(rawDefault),
          `Set ${path} default to "provider/model", or null when the host has none.`,
        ),
      );
    }
    const label = rawDefault.trim();
    if (label === '') {
      return R.fail(
        malformed(
          path,
          'default',
          '`default` must not be empty.',
          'empty string',
          `Set ${path} default to "provider/model", or null when the host has none.`,
        ),
      );
    }
    defaultModel = label;
  }

  const entries = decodeEntries(path, rawModels);
  if (R.isFailure(entries)) return R.fail(entries.failure);
  return R.succeed(normalize(entries.success, defaultModel));
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
  readonly code: string;
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
