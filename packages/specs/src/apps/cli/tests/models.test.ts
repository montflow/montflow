import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { PromptStore } from '@montflow/prompts';
import { Effect, FileSystem, Layer, Path, Result } from 'effect';
import * as Catalogue from '../../../modules/catalogue/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import { SurfaceError, check, listModels, models, verifyModels } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';
const catalog = 'fixtures/catalog.json';
const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** A host model source with the fixture catalogue's known/unknown variants. */
const modelSource = (
  listed: ReadonlyArray<Catalogue.SourceModel>,
  defaultModel: Catalogue.SourceDefault | undefined,
): Catalogue.ModelSource => ({
  list: () => Effect.succeed(listed),
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

const runList = (options: Parameters<typeof listModels>[0], modelList = source) =>
  listModels(options, modelList).pipe(Effect.provide(Platform));

const runVerify = (name: string | undefined, layer: TestLayer) =>
  verifyModels(root, name === undefined ? {} : { name }, source).pipe(Effect.provide(layer));

/** The flags a printed `models --verify` row carries. */
interface VerifyFlags {
  provider?: string;
  catalog?: string;
  name?: string;
}

/**
 * Parse a printed `mf-specs models --verify …` row back into the flags the
 * binary reads, replacing the `<spec>` placeholder with a real name, so a test
 * runs the exact command a diagnostic tells the caller to re-run.
 * @param command - the diagnostic's `next` row
 * @param name - the repaired spec name to substitute for `<spec>`
 * @returns the flags that row selects
 */
const flagsOf = (command: string, name: string): VerifyFlags => {
  const flags: VerifyFlags = {};
  // Drop `mf-specs models --verify`; every remaining token is `<flag> <value>`.
  const tokens = command.split(' ').slice(3);
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    const flag = tokens[index];
    const raw = tokens[index + 1];
    if (flag === undefined || raw === undefined) continue;
    const value = raw === '<spec>' ? name : raw;
    if (flag === '--provider') flags.provider = value;
    if (flag === '--catalog') flags.catalog = value;
    if (flag === '--name') flags.name = value;
  }
  return flags;
};

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

  Vitest.it.effect('refuses --name on the listing path instead of dropping it', () =>
    Effect.gen(function* () {
      const error = yield* models(root, { catalog, name: 'spec-a' }, source).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      const found = error.diagnostics[0];
      Vitest.expect(found?.code).toBe('cli.invalid-argument');
      Vitest.expect(found?.field).toBe('--name');
      Vitest.expect(found?.fix).toContain('--verify');
      Vitest.expect(found?.fix).toContain('--name spec-a');
      Vitest.expect(found?.next).toBe(
        'mf-specs models --verify --catalog fixtures/catalog.json --name spec-a',
      );
    }),
  );

  Vitest.it.effect('filters by provider and fails a provider with no models', () =>
    Effect.gen(function* () {
      const hit = yield* runList({ catalog, provider: 'alpha', json: true });
      const document = jsonOf(hit.output);
      Vitest.expect(document.models).toHaveLength(1);
      Vitest.expect(document.models[0]?.modelID).toBe('a-model');
      // The fixture default belongs to another provider, so the filtered
      // document carries none rather than a label pointing outside its list.
      Vitest.expect(document.default).toBeNull();

      const error = yield* runList({ catalog, provider: 'nope' }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      Vitest.expect(error.diagnostics[0]?.code).toBe(Catalogue.CODES.unknownProvider);
      Vitest.expect(error.diagnostics[0]?.fix).toContain('--provider');
    }),
  );

  Vitest.it.effect('round-trips a provider-filtered --json document back through --catalog', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-catalog-filtered-' });
      const first = yield* runList({ catalog, provider: 'alpha', json: true });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(file, first.output);
      const second = yield* runList({ catalog: file, json: true });
      Vitest.expect(second.output).toBe(first.output);
      Vitest.expect(jsonOf(second.output).default).toBeNull();
    }).pipe(Effect.provide(Platform)),
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
      Vitest.expect(error.diagnostics[0]?.cause).toBeInstanceOf(SyntaxError);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a --catalog id the sizing grammar cannot store', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-catalog-odd-' });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(
        file,
        JSON.stringify({
          default: null,
          models: [{ providerID: 'acme', modelID: 'weird id#tag', variants: ['High'] }],
        }),
      );
      const error = yield* runList({ catalog: file }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      Vitest.expect(error.diagnostics[0]?.code).toBe(Catalogue.CODES.malformedCatalog);
      Vitest.expect(error.diagnostics[0]?.field).toBe('models.0');
      Vitest.expect(error.diagnostics[0]?.actual).toBe('acme/weird id#tag');
      Vitest.expect(error.diagnostics[0]?.fix).toContain('models.0.providerID');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('drops a host id or variant the sizing grammar cannot store', () =>
    Effect.gen(function* () {
      const hostile = modelSource(
        [
          { providerID: 'acme', modelID: 'weird id#tag', variants: ['high'] },
          { providerID: 'acme', modelID: 'ok', variants: ['hi there', 'High', ''] },
        ],
        { providerID: 'acme', modelID: 'weird id#tag' },
      );
      const report = yield* runList({ json: true }, hostile);
      const document = jsonOf(report.output);
      Vitest.expect(document.models.map((model) => model.label)).toStrictEqual(['acme/ok']);
      Vitest.expect(document.models[0]?.variants).toStrictEqual(['High']);
      Vitest.expect(document.default).toBeNull();
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

  Vitest.it.effect('a repo with no config checks nothing and says so', () =>
    Effect.gen(function* () {
      const report = yield* runVerify(undefined, stubLayer(specs));
      Vitest.expect(report.findings).toStrictEqual([]);
      Vitest.expect(report.counts).toStrictEqual({
        checked: 0,
        skipped: 0,
        layers: [{ layer: 'repo', checked: 0, skipped: 0 }],
      });
      Vitest.expect(report.output).toBe(
        '0 entries checked \u00b7 0 skipped \u00b7 repo 0 checked, 0 skipped',
      );
      Vitest.expect(report.output).not.toContain('\u2713');
    }),
  );

  Vitest.it.effect('counts checked and skipped entries per layer', () =>
    Effect.gen(function* () {
      const layer = stubLayer(specs, new Map([['sizing.json', repoConfig]]));

      const repoOnly = yield* runVerify(undefined, layer);
      Vitest.expect(repoOnly.counts.checked).toBe(2);
      Vitest.expect(repoOnly.counts.skipped).toBe(0);
      Vitest.expect(repoOnly.counts.layers).toStrictEqual([
        { layer: 'repo', checked: 2, skipped: 0 },
      ]);
      Vitest.expect(repoOnly.output).toContain(
        '2 entries checked \u00b7 0 skipped \u00b7 repo 2 checked, 0 skipped',
      );

      const withSpec = yield* runVerify('spec-a', layer);
      Vitest.expect(withSpec.counts.checked).toBe(5);
      Vitest.expect(withSpec.counts.skipped).toBe(0);
      Vitest.expect(withSpec.counts.layers).toStrictEqual([
        { layer: 'repo', checked: 2, skipped: 0 },
        { layer: 'spec', checked: 3, skipped: 0 },
      ]);
      Vitest.expect(withSpec.output).toContain(
        '5 entries checked \u00b7 0 skipped \u00b7 repo 2 checked, 0 skipped \u00b7 spec 3 checked, 0 skipped',
      );
    }),
  );

  Vitest.it.effect(
    'round-trips a host-shaped id and a mixed-case variant through list, verify, and check',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-catalog-host-' });
        const file = path.join(dir, 'catalog.json');
        yield* fs.writeFileString(
          file,
          JSON.stringify({
            default: null,
            models: [
              {
                providerID: 'openrouter',
                modelID: 'meta-llama/llama-3.3-70b',
                variants: ['High', 'low'],
              },
              { providerID: 'ollama', modelID: 'qwen2.5-coder:7b', variants: ['max'] },
            ],
          }),
        );

        const listed = yield* runList({ catalog: file });
        Vitest.expect(listed.output).toContain(
          'openrouter/meta-llama/llama-3.3-70b  variants High,low',
        );
        Vitest.expect(listed.output).toContain('ollama/qwen2.5-coder:7b  variants max');

        const sizing = JSON.stringify({
          sizes: {
            tiny: { model: 'openrouter/meta-llama/llama-3.3-70b', effort: 'High' },
            small: { model: 'ollama/qwen2.5-coder:7b', effort: 'max' },
          },
        });
        const layer = stubLayer(new Map(), new Map([['sizing.json', sizing]]));
        const verified = yield* verifyModels(root, { catalog: file }, source).pipe(
          Effect.provide(layer),
        );
        Vitest.expect(verified.findings).toStrictEqual([]);
        Vitest.expect(verified.output).toContain('\u2713 no model or effort findings');
        Vitest.expect(verified.output).toContain(
          '2 entries checked \u00b7 0 skipped \u00b7 repo 2 checked, 0 skipped',
        );

        const checked = yield* check(root).pipe(
          Effect.provide(stubLayer(new Map(), new Map([['sizing.json', sizing]]))),
        );
        Vitest.expect(checked.rootIssues).toStrictEqual([]);
        Vitest.expect(checked.issueCount).toBe(0);
        Vitest.expect(checked.failed).toBe(0);
      }).pipe(Effect.provide(Platform)),
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

  Vitest.it.effect('fails a missing specs root instead of reporting a clean verification', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-models-root-' });
      const store = Layer.provide(SpecStore.Default, Platform);
      const error = yield* verifyModels(path.join(dir, 'absent'), {}, source).pipe(
        Effect.provide(store),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(SpecStore.StoreError);
      if (!(error instanceof SpecStore.StoreError)) return;
      Vitest.expect(error.reason).toContain('Specs directory not found');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('fails an unknown --name as spec.not-found, not a raw store error', () =>
    Effect.gen(function* () {
      const error = yield* runVerify('nope', stubLayer(specs)).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      Vitest.expect(error.diagnostics[0]?.code).toBe('spec.not-found');
      Vitest.expect(error.diagnostics[0]?.next).toBe('mf-specs list');
    }),
  );

  Vitest.it.effect('scopes a verification to one provider', () =>
    Effect.gen(function* () {
      const layer = stubLayer(specs, new Map([['sizing.json', repoConfig]]));
      const scoped = yield* verifyModels(root, { catalog, provider: 'alpha' }, source).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(scoped.findings).toStrictEqual([]);
      Vitest.expect(scoped.counts).toStrictEqual({
        checked: 0,
        skipped: 2,
        layers: [{ layer: 'repo', checked: 0, skipped: 2 }],
        provider: 'alpha',
      });
      Vitest.expect(scoped.output).toContain('0 entries checked');
      Vitest.expect(scoped.output).toContain('2 skipped');
      Vitest.expect(scoped.output).toContain('provider alpha');
      Vitest.expect(scoped.output).not.toContain('\u2713');
      Vitest.expect(scoped.output).not.toBe('');

      const kept = yield* verifyModels(root, { catalog, provider: 'fixture' }, source).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(kept.findings.map((found) => found.code)).toStrictEqual([
        Catalogue.CODES.unknownModel,
        Catalogue.CODES.unknownModel,
      ]);
      Vitest.expect(kept.counts.checked).toBe(2);
      Vitest.expect(kept.counts.skipped).toBe(0);
      Vitest.expect(kept.output).toContain('fixture/ghost');

      const miss = yield* verifyModels(root, { catalog, provider: 'nope' }, source).pipe(
        Effect.provide(layer),
        Effect.flip,
      );
      Vitest.expect(miss).toBeInstanceOf(SurfaceError);
      if (!(miss instanceof SurfaceError)) return;
      Vitest.expect(miss.diagnostics[0]?.code).toBe(Catalogue.CODES.unknownProvider);
    }),
  );

  Vitest.it.effect('a provider literally named all is never mistaken for an unfiltered run', () =>
    Effect.gen(function* () {
      const allSource: Catalogue.ModelSource = {
        list: () => Effect.succeed([{ providerID: 'all', modelID: 'known', variants: ['low'] }]),
        default: () => Effect.succeed(undefined),
      };
      const layer = stubLayer(
        new Map(),
        new Map([
          [
            'sizing.json',
            JSON.stringify({ sizes: { tiny: { model: 'all/known', effort: 'low' } } }),
          ],
        ]),
      );

      const unfiltered = yield* verifyModels(root, {}, allSource).pipe(Effect.provide(layer));
      const filtered = yield* verifyModels(root, { provider: 'all' }, allSource).pipe(
        Effect.provide(layer),
      );

      // The unfiltered run prints no provider segment at all, so the only
      // `provider all` line is the one a genuine filter produces.
      Vitest.expect(unfiltered.counts.provider).toBeUndefined();
      Vitest.expect(unfiltered.output).not.toContain('provider');
      Vitest.expect(filtered.counts.provider).toBe('all');
      Vitest.expect(filtered.output).toContain('provider all');
      Vitest.expect(unfiltered.output).not.toBe(filtered.output);
    }),
  );

  Vitest.it.effect('a zero-entry provider filter on a named spec states the zero', () =>
    Effect.gen(function* () {
      const layer = stubLayer(specs, new Map([['sizing.json', repoConfig]]));
      const report = yield* verifyModels(
        root,
        { name: 'spec-a', provider: 'alpha', catalog },
        source,
      ).pipe(Effect.provide(layer));
      Vitest.expect(report.findings).toStrictEqual([]);
      Vitest.expect(report.counts.layers).toStrictEqual([
        { layer: 'repo', checked: 0, skipped: 2 },
        { layer: 'spec', checked: 0, skipped: 3 },
      ]);
      Vitest.expect(report.output).toContain('0 entries checked');
      Vitest.expect(report.output).not.toContain('\u2713');
    }),
  );

  Vitest.it.effect('refuses --json with --verify and names the corrected command', () =>
    Effect.gen(function* () {
      const error = yield* models(
        root,
        { verify: true, json: true, catalog, provider: 'fixture' },
        source,
      ).pipe(Effect.provide(stubLayer(specs)), Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      const found = error.diagnostics[0];
      Vitest.expect(found?.code).toBe('cli.invalid-argument');
      Vitest.expect(found?.field).toBe('--json');
      Vitest.expect(found?.next).toBe(
        `mf-specs models --verify --provider fixture --catalog ${catalog}`,
      );
    }),
  );

  Vitest.it.effect(
    'a refused --name names a command that keeps --catalog and --provider, and it runs',
    () =>
      Effect.gen(function* () {
        const layer = stubLayer(specs, new Map([['sizing.json', repoConfig]]));
        const error = yield* verifyModels(
          root,
          { name: '..', catalog, provider: 'fixture' },
          source,
        ).pipe(Effect.provide(layer), Effect.flip);
        Vitest.expect(error).toBeInstanceOf(SurfaceError);
        if (!(error instanceof SurfaceError)) return;
        const found = error.diagnostics[0];
        Vitest.expect(found?.code).toBe('cli.invalid-argument');
        Vitest.expect(found?.next).toBe(
          `mf-specs models --verify --provider fixture --catalog ${catalog} --name <spec>`,
        );

        // Replay the printed row as the binary would: those flags alone, no host
        // model source (so `--catalog` is the only catalogue), and a real spec.
        const replayed = yield* models(root, {
          verify: true,
          ...flagsOf(found?.next ?? '', 'spec-a'),
        }).pipe(Effect.provide(layer));
        Vitest.expect(replayed.exitCode).toBe(0);
        Vitest.expect(replayed.output).not.toContain('models.unavailable');
        Vitest.expect(replayed.output).toContain('entries checked');
      }),
  );
});
