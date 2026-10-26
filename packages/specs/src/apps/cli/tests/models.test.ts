import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { PromptStore } from '@montflow/prompts';
import { Effect, FileSystem, Layer, Path, Result } from 'effect';
import * as Catalogue from '../../../modules/catalogue/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import { SurfaceError, listModels, verifyModels } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';
const catalog = 'fixtures/catalog.json';
const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** A host model source with the fixture catalogue's known/unknown variants. */
const modelSource = (
  models: ReadonlyArray<Catalogue.SourceModel>,
  defaultModel: Catalogue.SourceDefault | undefined,
): Catalogue.ModelSource => ({
  list: () => Effect.succeed(models),
  default: () => Effect.succeed(defaultModel),
});

const source = modelSource(
  [
    { providerID: 'fixture', modelID: 'known', variants: ['low', 'high'] },
    { providerID: 'fixture', modelID: 'empty', variants: [] },
    { providerID: 'fixture', modelID: 'unknown', variants: null },
  ],
  { providerID: 'fixture', modelID: 'known' },
);

/** A spec whose repo and spec configs exercise both warning classes. */
const specs = new Map([
  [
    'spec-a',
    [
      entry('SPEC.md', specMarkdown({ name: 'spec-a' })),
      entry(
        'sizing.json',
        JSON.stringify({
          sizes: {
            medium: { model: 'fixture/known', effort: 'ultra' },
            large: { model: 'fixture/unknown', effort: 'whatever' },
          },
          phases: { A: { sizes: { small: { model: 'fixture/known', effort: 'low' } } } },
        }),
      ),
      entry('A001-build/TASK.md', taskMarkdown({ id: 'A001', name: 'build', size: 'tiny' })),
      entry('A001-build/MEMORY.md', memory),
      entry(
        'A099-review-phase/TASK.md',
        taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
      ),
      entry('A099-review-phase/MEMORY.md', memory),
    ],
  ],
]);

const repoConfig = JSON.stringify({
  sizes: {
    tiny: { model: 'fixture/known', effort: 'low' },
    small: { model: 'fixture/ghost' },
  },
});

type TestLayer = Layer.Layer<
  SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore | Path.Path
>;

const runList = (options: Parameters<typeof listModels>[0], models = source) =>
  listModels(options, models).pipe(Effect.provide(Platform));

const runVerify = (name: string | undefined, layer: TestLayer) =>
  verifyModels(root, name === undefined ? {} : { name }, source).pipe(Effect.provide(layer));

/** Decode a rendered JSON document, failing the test when it is malformed. */
const jsonOf = (text: string): Catalogue.Catalogue => {
  const decoded = Catalogue.decode(text, 'models --json');
  if (Result.isFailure(decoded)) throw new Error(decoded.failure.message);
  return decoded.success;
};

Vitest.describe('Cli.models listing', () => {
  Vitest.it.effect('prints the stable JSON document from --catalog', () =>
    Effect.gen(function* () {
      const report = yield* runList({ catalog, json: true });
      const document = jsonOf(report.output);
      Vitest.expect(document.default).toBe('fixture/default-model');
      Vitest.expect(document.models.map((model) => model.label)).toStrictEqual([
        'alpha/a-model',
        'fixture/default-model',
        'fixture/unknown-model',
        'fixture/zeta-model',
      ]);
      Vitest.expect(document.models[1]?.variants).toStrictEqual(['high', 'low', 'max']);
      Vitest.expect(document.models[2]?.variants).toBeNull();
      Vitest.expect(document.models[3]?.variants).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('round-trips --json output back through --catalog', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-catalog-' });
      const first = yield* runList({ catalog, json: true });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(file, first.output);
      const second = yield* runList({ catalog: file, json: true });
      Vitest.expect(second.output).toBe(first.output);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('renders the table with unknown, known-empty, and default markers', () =>
    Effect.gen(function* () {
      const report = yield* runList({ catalog });
      Vitest.expect(report.output).toContain('fixture/default-model  variants high,low,max  *');
      Vitest.expect(report.output).toContain('fixture/unknown-model  variants unknown');
      Vitest.expect(report.output).toContain('fixture/zeta-model  variants none');
    }),
  );

  Vitest.it.effect('filters by provider and fails a provider with no models', () =>
    Effect.gen(function* () {
      const hit = yield* runList({ catalog, provider: 'alpha', json: true });
      const document = jsonOf(hit.output);
      Vitest.expect(document.models).toHaveLength(1);
      Vitest.expect(document.models[0]?.modelID).toBe('a-model');

      const error = yield* runList({ catalog, provider: 'nope' }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      Vitest.expect(error.diagnostics[0]?.code).toBe(Catalogue.CODES.unknownProvider);
      Vitest.expect(error.diagnostics[0]?.fix).toContain('--provider');
    }),
  );

  Vitest.it.effect('fails outside a host without --catalog and names the fix', () =>
    Effect.gen(function* () {
      const error = yield* listModels({}).pipe(Effect.provide(Platform), Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      Vitest.expect(error.diagnostics[0]?.code).toBe(Catalogue.CODES.unavailable);
      Vitest.expect(error.diagnostics[0]?.fix).toContain('--catalog');
    }),
  );

  Vitest.it.effect('fails a malformed catalog with models.malformed-catalog', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-catalog-bad-' });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(file, '{"models":');
      const error = yield* runList({ catalog: file }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      Vitest.expect(error.diagnostics[0]?.code).toBe(Catalogue.CODES.malformedCatalog);
      Vitest.expect(error.diagnostics[0]?.path).toBe(file);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('reads the host model source when no catalog is given', () =>
    Effect.gen(function* () {
      const report = yield* listModels({ json: true }, source).pipe(Effect.provide(Platform));
      const document = jsonOf(report.output);
      Vitest.expect(document.default).toBe('fixture/known');
      Vitest.expect(document.models).toHaveLength(3);
    }),
  );
});

Vitest.describe('Cli.models verification', () => {
  Vitest.it.effect('reports one unknown model and one unknown effort in one pass', () =>
    Effect.gen(function* () {
      const report = yield* runVerify(
        'spec-a',
        stubLayer(specs, new Map([['sizing.json', repoConfig]])),
      );
      Vitest.expect(report.findings.map((found) => found.code)).toStrictEqual([
        Catalogue.CODES.unknownModel,
        Catalogue.CODES.unknownEffort,
      ]);
      Vitest.expect(report.output).toContain('code     ! models.unknown-model');
      Vitest.expect(report.output).toContain('code     ! models.unknown-effort');
      Vitest.expect(report.output).toContain('fixture/ghost');
      Vitest.expect(report.output).toContain('one of high, low');
      Vitest.expect(report.output).toContain('2 warnings');
      Vitest.expect(report.exitCode).toBe(0);
    }),
  );

  Vitest.it.effect('skips the effort check for a model with unknown variants', () =>
    Effect.gen(function* () {
      const report = yield* runVerify(
        'spec-a',
        stubLayer(specs, new Map([['sizing.json', repoConfig]])),
      );
      Vitest.expect(report.findings.some((found) => found.actual === 'whatever')).toBe(false);
    }),
  );

  Vitest.it.effect('without --name verifies the repo config only', () =>
    Effect.gen(function* () {
      const report = yield* runVerify(
        undefined,
        stubLayer(specs, new Map([['sizing.json', repoConfig]])),
      );
      Vitest.expect(report.findings.map((found) => found.code)).toStrictEqual([
        Catalogue.CODES.unknownModel,
      ]);
      Vitest.expect(report.output).not.toContain('ultra');
      Vitest.expect(report.output).toContain('1 warning');
    }),
  );

  Vitest.it.effect('a repo with no config is a clean no-op', () =>
    Effect.gen(function* () {
      const report = yield* runVerify(undefined, stubLayer(specs));
      Vitest.expect(report.findings).toStrictEqual([]);
      Vitest.expect(report.output).toBe('\u2713 no model or effort findings');
    }),
  );

  Vitest.it.effect('fails an invalid config before checking the catalogue', () =>
    Effect.gen(function* () {
      const error = yield* runVerify(
        'spec-a',
        stubLayer(specs, new Map([['sizing.json', '{"sizes":']])),
      ).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      Vitest.expect(error.diagnostics[0]?.code).toBe('sizing.malformed-json');
    }),
  );
});
