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

/** Decode result, for the two narrowing helpers below. */
type Decoded = ReturnType<typeof Catalogue.decode>;

/** The failure arm of a decode result. */
type DecodedFailure = Extract<Decoded, { readonly _tag: 'Failure' }>['failure'];

/** Assert a decode succeeded, then narrow it. */
const successOf = (decoded: Decoded): Catalogue.Catalogue => {
  Vitest.expect(Result.isSuccess(decoded)).toBe(true);
  if (Result.isFailure(decoded)) throw new Error(`decode failed: ${decoded.failure.message}`);
  return decoded.success;
};

/** Assert a decode failed, then narrow it. */
const failureOf = (decoded: Decoded): DecodedFailure => {
  Vitest.expect(Result.isFailure(decoded)).toBe(true);
  if (Result.isSuccess(decoded)) throw new Error('decode unexpectedly succeeded');
  return decoded.failure;
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

  Vitest.it('drops a default label the sizing grammar cannot store', () => {
    Vitest.expect(Catalogue.normalize([], 'acme/weird id#tag').default).toBeNull();
    Vitest.expect(
      Catalogue.normalize([], { providerID: 'acme', modelID: 'ok+plus' }).default,
    ).toBeNull();
    Vitest.expect(
      Catalogue.normalize([], { providerID: 'acme', modelID: '.hidden' }).default,
    ).toBeNull();
    Vitest.expect(Catalogue.normalize([], { providerID: 'acme', modelID: 'ok' }).default).toBe(
      'acme/ok',
    );
  });

  Vitest.it('drops every id and variant the sizing grammar cannot store', () => {
    const catalogue = Catalogue.normalize([
      source('acme', 'weird id#tag', ['high']),
      source('acme', 'ok', ['hi there', 'High', '']),
      source('acme', 'only-bad-variants', ['#', 'no way']),
    ]);

    Vitest.expect(catalogue.models).toStrictEqual([
      {
        providerID: 'acme',
        modelID: 'ok',
        label: 'acme/ok',
        variants: ['High'],
      },
      {
        providerID: 'acme',
        modelID: 'only-bad-variants',
        label: 'acme/only-bad-variants',
        variants: [],
      },
    ]);
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
    const decoded = successOf(Catalogue.decode(json, 'catalog.json'));
    Vitest.expect(decoded).toStrictEqual(fixture);
  });

  Vitest.it('keeps a missing variants key unknown and an empty array known-empty', () => {
    const decoded = successOf(
      Catalogue.decode(
        JSON.stringify({
          default: null,
          models: [
            { providerID: 'fixture', modelID: 'unknown' },
            { providerID: 'fixture', modelID: 'empty', variants: [] },
          ],
        }),
        'catalog.json',
      ),
    );
    Vitest.expect(decoded.models.find((model) => model.modelID === 'unknown')?.variants).toBeNull();
    Vitest.expect(
      decoded.models.find((model) => model.modelID === 'empty')?.variants,
    ).toStrictEqual([]);
  });

  Vitest.it('rejects malformed JSON with models.malformed-catalog', () => {
    const found = failureOf(Catalogue.decode('{', 'catalog.json'));
    Vitest.expect(found.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(found.fix).toContain('catalog.json');
    Vitest.expect(found.cause).toBeInstanceOf(SyntaxError);
  });

  Vitest.it('rejects a wrong shape and a non-string variant', () => {
    const wrongDocument = failureOf(Catalogue.decode('{"models": {}}', 'catalog.json'));
    Vitest.expect(wrongDocument.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(wrongDocument.field).toBe('models');
    Vitest.expect(wrongDocument.expected).toBe('an array of catalogue models');

    const wrongVariant = failureOf(
      Catalogue.decode(
        '{"models":[{"providerID":"fixture","modelID":"m","variants":[1]}]}',
        'catalog.json',
      ),
    );
    Vitest.expect(wrongVariant.field).toBe('models.0.variants');
    Vitest.expect(wrongVariant.expected).toBe('an array of non-empty strings or null');
    Vitest.expect(wrongVariant.actual).toBe('number');
    Vitest.expect(wrongVariant.fix).toContain('Replace the non-string variant');

    const emptyVariant = failureOf(
      Catalogue.decode(
        '{"models":[{"providerID":"fixture","modelID":"m","variants":[""]}]}',
        'catalog.json',
      ),
    );
    Vitest.expect(emptyVariant.actual).toBe('empty string');
    Vitest.expect(emptyVariant.fix).toBe('Remove the empty variant from models.0.variants.');
  });

  Vitest.it('rejects a non-object root, unknown keys, and a blank default', () => {
    const arrayRoot = failureOf(Catalogue.decode('[]', 'catalog.json'));
    Vitest.expect(arrayRoot.field).toBe('root');
    Vitest.expect(arrayRoot.actual).toBe('array');

    const extraRoot = failureOf(Catalogue.decode('{"models":[],"extra":true}', 'catalog.json'));
    Vitest.expect(extraRoot.field).toBe('extra');
    Vitest.expect(extraRoot.fix).toContain("Remove 'extra'");

    const extraModel = failureOf(
      Catalogue.decode(
        '{"models":[{"providerID":"fixture","modelID":"m","nope":1}]}',
        'catalog.json',
      ),
    );
    Vitest.expect(extraModel.field).toBe('models.0.nope');
    Vitest.expect(extraModel.expected).toBe('only providerID, modelID, variants');

    const emptyDefault = failureOf(
      Catalogue.decode('{"default":"  ","models":[]}', 'catalog.json'),
    );
    Vitest.expect(emptyDefault.actual).toBe('empty string');
  });

  Vitest.it('refuses a --catalog id or variant the sizing grammar cannot store', () => {
    const badId = failureOf(
      Catalogue.decode(
        '{"models":[{"providerID":"acme","modelID":"weird id#tag"}]}',
        'catalog.json',
      ),
    );
    Vitest.expect(badId.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(badId.field).toBe('models.0');
    Vitest.expect(badId.message).toBe('A catalogue model id must match the sizing grammar.');
    Vitest.expect(badId.expected).toContain('the first / separates the provider');
    Vitest.expect(badId.expected).toContain('no whitespace and no #');
    Vitest.expect(badId.actual).toBe('acme/weird id#tag');
    Vitest.expect(badId.fix).toBe(
      `Rewrite models.0.providerID and models.0.modelID as a storable "provider/model" id: 'acme/weird id#tag' contains a space in the model, which may use only letters, digits, ".", "_", ":", "/", and "-".`,
    );

    const badVariant = failureOf(
      Catalogue.decode(
        '{"models":[{"providerID":"acme","modelID":"ok","variants":["hi there"]}]}',
        'catalog.json',
      ),
    );
    Vitest.expect(badVariant.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(badVariant.field).toBe('models.0.variants.0');
    Vitest.expect(badVariant.actual).toBe('hi there');
    Vitest.expect(badVariant.fix).toContain('Rewrite models.0.variants.0');
  });

  Vitest.it('names the real id violation for a +, @, or leading-dot id', () => {
    const probes = [
      {
        json: '{"models":[{"providerID":"acme","modelID":"ok+plus"}]}',
        actual: 'acme/ok+plus',
        fix: `Rewrite models.0.providerID and models.0.modelID as a storable "provider/model" id: 'acme/ok+plus' contains "+" in the model, which may use only letters, digits, ".", "_", ":", "/", and "-".`,
      },
      {
        json: '{"models":[{"providerID":"acme","modelID":"ok@x"}]}',
        actual: 'acme/ok@x',
        fix: `Rewrite models.0.providerID and models.0.modelID as a storable "provider/model" id: 'acme/ok@x' contains "@" in the model, which may use only letters, digits, ".", "_", ":", "/", and "-".`,
      },
      {
        json: '{"models":[{"providerID":"acme","modelID":".hidden"}]}',
        actual: 'acme/.hidden',
        fix: `Rewrite models.0.providerID and models.0.modelID as a storable "provider/model" id: 'acme/.hidden' starts the model with ".", so it must begin with a letter or digit.`,
      },
    ];

    for (const probe of probes) {
      const found = failureOf(Catalogue.decode(probe.json, 'catalog.json'));
      Vitest.expect(found.code).toBe(Catalogue.CODES.malformedCatalog);
      Vitest.expect(found.field).toBe('models.0');
      Vitest.expect(found.message).toBe('A catalogue model id must match the sizing grammar.');
      Vitest.expect(found.expected).toContain('the first / separates the provider');
      Vitest.expect(found.actual).toBe(probe.actual);
      Vitest.expect(found.fix).toBe(probe.fix);
    }
  });

  Vitest.it('repairs a blank id in place and adds only a missing key', () => {
    const blank = failureOf(
      Catalogue.decode('{"models":[{"providerID":"   ","modelID":"b"}]}', 'catalog.json'),
    );
    Vitest.expect(blank.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(blank.field).toBe('models.0.providerID');
    Vitest.expect(blank.message).toBe('A catalogue model requires a providerID.');
    Vitest.expect(blank.expected).toBe('a non-empty providerID string');
    Vitest.expect(blank.actual).toBe('empty string');
    Vitest.expect(blank.fix).toBe('Set models.0.providerID to a non-empty provider id.');

    const missing = failureOf(Catalogue.decode('{"models":[{"modelID":"b"}]}', 'catalog.json'));
    Vitest.expect(missing.field).toBe('models.0.providerID');
    Vitest.expect(missing.actual).toBe('missing');
    Vitest.expect(missing.fix).toBe('Add "providerID": "provider" to models.0.');
  });

  Vitest.it('refuses a --catalog default the sizing grammar cannot store', () => {
    const found = failureOf(
      Catalogue.decode('{"default":"acme/weird id#tag","models":[]}', 'catalog.json'),
    );
    Vitest.expect(found.code).toBe(Catalogue.CODES.malformedCatalog);
    Vitest.expect(found.field).toBe('default');
    Vitest.expect(found.message).toBe('`default` must be a provider/model label or null.');
    Vitest.expect(found.expected).toBe('a storable provider/model label or null');
    Vitest.expect(found.actual).toBe('acme/weird id#tag');
    Vitest.expect(found.fix).toBe(
      'Set catalog.json default to "provider/model", or null when the host has none.',
    );
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
