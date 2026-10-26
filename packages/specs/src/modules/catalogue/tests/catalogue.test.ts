import * as Vitest from '@effect/vitest';
import { Result } from 'effect';
import * as Catalogue from '../index.js';

const source = (
  providerID: string,
  modelID: string,
  variants?: readonly string[] | null,
): Catalogue.SourceModel => {
  const model = { providerID, modelID };
  return variants === undefined ? model : { ...model, variants };
};

Vitest.describe('Catalogue.normalize', () => {
  Vitest.it('trims, dedupes, sorts by provider then model, and carries the default', () => {
    const catalogue = Catalogue.normalize(
      [
        source(' openai ', 'gpt-5', ['high', 'low']),
        source('anthropic', 'claude-sonnet-4'),
        source('openai', 'gpt-5', ['low', 'max']),
        source('', 'blank-provider'),
        source('openai', ''),
      ],
      { providerID: 'openai', modelID: 'gpt-5' },
    );

    Vitest.expect(catalogue.default).toBe('openai/gpt-5');
    Vitest.expect(catalogue.models.map((model) => model.label)).toStrictEqual([
      'anthropic/claude-sonnet-4',
      'openai/gpt-5',
    ]);
    Vitest.expect(catalogue.models[1]?.variants).toStrictEqual(['high', 'low', 'max']);
  });

  Vitest.it('keeps known-empty and unknown variant lists distinct', () => {
    const catalogue = Catalogue.normalize([
      source('fixture', 'empty', []),
      source('fixture', 'unknown'),
      source('fixture', 'null', null),
    ]);

    Vitest.expect(catalogue.models).toStrictEqual([
      {
        providerID: 'fixture',
        modelID: 'empty',
        label: 'fixture/empty',
        variants: [],
      },
      {
        providerID: 'fixture',
        modelID: 'null',
        label: 'fixture/null',
        variants: null,
      },
      {
        providerID: 'fixture',
        modelID: 'unknown',
        label: 'fixture/unknown',
        variants: null,
      },
    ]);
  });

  Vitest.it('a null on any duplicate keeps the entry unknown', () => {
    const catalogue = Catalogue.normalize([
      source('fixture', 'model', ['low']),
      source('fixture', 'model', null),
      source('fixture', 'model', ['high']),
    ]);

    Vitest.expect(catalogue.models[0]?.variants).toBeNull();
  });

  Vitest.it('accepts an already-joined default label and a null default', () => {
    Vitest.expect(Catalogue.normalize([], 'fixture/default').default).toBe('fixture/default');
    Vitest.expect(Catalogue.normalize([], null).default).toBeNull();
  });
});

Vitest.describe('Catalogue document', () => {
  const fixture = Catalogue.normalize(
    [
      source('fixture', 'default-model', ['high', 'low']),
      source('fixture', 'known-empty', []),
      source('fixture', 'unknown-model', null),
    ],
    'fixture/default-model',
  );

  Vitest.it('round-trips through JSON without dates or host metadata', () => {
    const json = Catalogue.toJson(fixture);
    Vitest.expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const decoded = Catalogue.decode(json, 'catalog.json');
    Vitest.expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isFailure(decoded)) return;
    Vitest.expect(decoded.success).toStrictEqual(fixture);
  });

  Vitest.it('keeps a missing variants key unknown and an empty array known-empty', () => {
    const decoded = Catalogue.decode(
      JSON.stringify({
        default: null,
        models: [
          { providerID: 'fixture', modelID: 'unknown' },
          { providerID: 'fixture', modelID: 'empty', variants: [] },
        ],
      }),
      'catalog.json',
    );
    if (Result.isFailure(decoded)) return;
    Vitest.expect(
      decoded.success.models.find((model) => model.modelID === 'unknown')?.variants,
    ).toBeNull();
    Vitest.expect(
      decoded.success.models.find((model) => model.modelID === 'empty')?.variants,
    ).toStrictEqual([]);
  });

  Vitest.it('rejects malformed JSON with models.malformed-catalog', () => {
    const decoded = Catalogue.decode('{', 'catalog.json');
    if (Result.isSuccess(decoded)) return;
    Vitest.expect(decoded.failure.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(decoded.failure.fix).toContain('catalog.json');
  });

  Vitest.it('rejects a wrong shape and a non-string variant', () => {
    const wrongDocument = Catalogue.decode('{"models": {}}', 'catalog.json');
    if (Result.isSuccess(wrongDocument)) return;
    Vitest.expect(wrongDocument.failure.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(wrongDocument.failure.field).toBe('models');

    const wrongVariant = Catalogue.decode(
      '{"models":[{"providerID":"fixture","modelID":"m","variants":[1]}]}',
      'catalog.json',
    );
    if (Result.isSuccess(wrongVariant)) return;
    Vitest.expect(wrongVariant.failure.field).toBe('models.0.variants');
  });
});

Vitest.describe('Catalogue rendering', () => {
  const catalogue = Catalogue.normalize(
    [
      source('fixture', 'default-model', ['high', 'low']),
      source('fixture', 'known-empty', []),
      source('fixture', 'unknown-model'),
    ],
    'fixture/default-model',
  );

  Vitest.it('marks the default and distinguishes unknown from known-empty', () => {
    const table = Catalogue.renderTable(catalogue);
    Vitest.expect(table).toContain('fixture/default-model  variants high,low  *');
    Vitest.expect(table).toContain('fixture/known-empty  variants none');
    Vitest.expect(table).toContain('fixture/unknown-model  variants unknown');
  });

  Vitest.it('filters by provider and keeps the default label', () => {
    const filtered = Catalogue.filterProvider(catalogue, 'fixture');
    Vitest.expect(filtered.models).toHaveLength(3);
    Vitest.expect(filtered.default).toBe('fixture/default-model');
    Vitest.expect(Catalogue.providersOf(catalogue)).toStrictEqual(['fixture']);
    Vitest.expect(Catalogue.filterProvider(catalogue, 'nope').models).toStrictEqual([]);
  });
});

Vitest.describe('Catalogue.verify', () => {
  const catalogue = Catalogue.normalize(
    [
      source('fixture', 'known', ['low', 'high']),
      source('fixture', 'empty', []),
      source('fixture', 'unknown', null),
    ],
    'fixture/known',
  );

  Vitest.it('reports one unknown model and one unknown effort in one pass', () => {
    const findings = Catalogue.verify(catalogue, [
      { path: 'sizing.json', field: 'sizes.tiny', model: 'fixture/ghost' },
      { path: 'sizing.json', field: 'sizes.small', model: 'fixture/known', effort: 'max' },
    ]);

    Vitest.expect(findings.map((found) => found.code)).toStrictEqual([
      Catalogue.CODES.unknownModel,
      Catalogue.CODES.unknownEffort,
    ]);
    Vitest.expect(findings[0]?.fix).toContain('mf-specs models');
    Vitest.expect(findings[1]?.expected).toBe('one of high, low');
    Vitest.expect(findings[1]?.fix).toContain('sizing.json');
  });

  Vitest.it('skips the effort check when the model has unknown variants', () => {
    const findings = Catalogue.verify(catalogue, [
      { path: 'sizing.json', field: 'sizes.tiny', model: 'fixture/unknown', effort: 'whatever' },
    ]);
    Vitest.expect(findings).toStrictEqual([]);
  });

  Vitest.it('reports an effort against a known-empty list and accepts a known effort', () => {
    const empty = Catalogue.verify(catalogue, [
      { path: 'sizing.json', field: 'sizes.tiny', model: 'fixture/empty', effort: 'low' },
    ]);
    Vitest.expect(empty[0]?.code).toBe(Catalogue.CODES.unknownEffort);
    Vitest.expect(empty[0]?.expected).toBe('no effort (this model has no variants)');

    const known = Catalogue.verify(catalogue, [
      { path: 'sizing.json', field: 'sizes.tiny', model: 'fixture/known', effort: 'high' },
    ]);
    Vitest.expect(known).toStrictEqual([]);
  });
});
