import { Console, Effect, FileSystem, Result as EffectResult } from 'effect';
import { Command, Flag } from 'effect/cli';

import { CONFIG_FILE, SIZES, type SizeMap } from '../../modules/sizing/index.js';

import * as Catalogue from '../../modules/catalogue/index.js';

import { type Issue, isError } from '../../modules/verify/index.js';
import { renderDiagnostics } from '../../modules/diagnostic/index.js';

import { SpecStore } from '../../services/index.js';

import {
  storeDirOf,
  SURFACE_CODES,
  type SizingDiagnostic,
  diagnostic,
  SurfaceError,
  diagnosticOfIssue,
  guardSpecName,
  guardFailure,
  type SizingLoad,
  NO_SIZING,
  loadRepoLayer,
  loadSizing,
  runDiagnosed,
  verboseFlag,
  dirFlag,
  nameFlag,
  opt,
} from './cli.shared.module.js';
import { unknownSpecDiagnostic } from './cli.apps.module.js';
/** Spec store directory, relative to the workspace root. */

export interface ModelsOptions {
  /** Keep one provider; a miss is a diagnostic, not an empty table. */
  readonly provider?: string | undefined;
  /** Print the stable JSON document instead of the table. */
  readonly json?: boolean | undefined;
  /** Read a catalogue file instead of the host port. */
  readonly catalog?: string | undefined;
  /** Cross-check config entries instead of listing the catalogue. */
  readonly verify?: boolean | undefined;
  /** Spec whose config is verified; omitted verifies the repo config only. */
  readonly name?: string | undefined;
}

/** One model-catalogue run: text to print and the exit code it implies. */
export interface ModelsRun {
  readonly output: string;
  readonly exitCode: number;
}

/** Diagnostic for a models run outside a host with no `--catalog`. */
export const modelsUnavailableDiagnostic = (): SizingDiagnostic =>
  diagnostic({
    code: Catalogue.CODES.unavailable,
    path: 'models',
    field: 'catalog',
    problem: 'No host model catalogue is available.',
    rerun: 'mf-specs models --catalog <path>',
    expected: '--catalog <path>, or the host model port',
    actual: 'no catalogue source',
    fix: 'Pass --catalog <path> with the output of `mf-specs models --json` from a host, or run /specs models.',
  });

/** Diagnostic for a catalogue file that is unreadable or malformed. */
export const malformedCatalogueDiagnostic = (path: string, found: Issue): SizingDiagnostic =>
  diagnostic({
    code: found.code ?? Catalogue.CODES.malformedCatalog,
    path,
    field: found.field,
    problem: found.message,
    rerun: 'mf-specs models --catalog <path>',
    expected: found.expected,
    actual: found.actual,
    fix: found.fix,
    cause: found.cause,
  });

/** Diagnostic for a `--provider` filter that matches nothing. */
export const unknownProviderDiagnostic = (
  provider: string,
  catalogue: Catalogue.Catalogue,
): SizingDiagnostic => {
  const providers = Catalogue.providersOf(catalogue);
  const expected =
    providers.length === 0 ? 'a provider the host reports' : `one of ${providers.join(', ')}`;
  return diagnostic({
    code: Catalogue.CODES.unknownProvider,
    path: 'models',
    field: 'provider',
    problem: `Provider '${provider}' has no models.`,
    rerun: 'mf-specs models',
    expected,
    actual: provider,
    fix:
      providers.length === 0
        ? 'Run `mf-specs models` to see the providers this host reports.'
        : `Pass --provider with one of ${providers.join(', ')}, or omit --provider.`,
  });
};

/** Read the catalogue from `--catalog`, the host port, or fail unavailable. */
export const readCatalogue = (
  catalog: string | undefined,
  source: Catalogue.ModelSource | undefined,
): Effect.Effect<Catalogue.Catalogue, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (catalog !== undefined && catalog !== '') {
      const fs = yield* FileSystem.FileSystem;
      const text = yield* fs.readFileString(catalog).pipe(
        Effect.mapError(
          (cause) =>
            new SurfaceError({
              operation: 'SpecsModels',
              diagnostics: [
                diagnostic({
                  code: Catalogue.CODES.malformedCatalog,
                  path: catalog,
                  field: 'file',
                  problem: `Cannot read catalogue file '${catalog}'.`,
                  rerun: 'mf-specs models --catalog <path>',
                  expected: 'a readable JSON catalogue',
                  actual: 'unreadable file',
                  fix: 'Pass --catalog with a readable file path, or generate one with `mf-specs models --json`.',
                  cause,
                }),
              ],
            }),
        ),
      );
      const decoded = Catalogue.decode(text, catalog);
      if (EffectResult.isFailure(decoded)) {
        return yield* Effect.fail(
          new SurfaceError({
            operation: 'SpecsModels',
            diagnostics: [malformedCatalogueDiagnostic(catalog, decoded.failure)],
          }),
        );
      }
      return decoded.success;
    }
    if (source !== undefined) {
      const models = yield* source.list();
      const defaultModel = yield* source.default();
      return Catalogue.normalize(models, defaultModel);
    }
    return yield* Effect.fail(
      new SurfaceError({
        operation: 'SpecsModels',
        diagnostics: [modelsUnavailableDiagnostic()],
      }),
    );
  });

/** Load and filter the catalogue; a provider miss fails with a diagnostic. */
export const loadCatalogue = (
  options: Pick<ModelsOptions, 'catalog' | 'provider'>,
  source?: Catalogue.ModelSource,
): Effect.Effect<Catalogue.Catalogue, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const catalogue = yield* readCatalogue(options.catalog, source);
    const provider = options.provider;
    const filtered =
      provider === undefined || provider.trim() === ''
        ? catalogue
        : Catalogue.filterProvider(catalogue, provider);
    if (provider !== undefined && provider.trim() !== '' && filtered.models.length === 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecsModels',
          diagnostics: [unknownProviderDiagnostic(provider, catalogue)],
        }),
      );
    }
    return filtered;
  });

/** A catalogued listing: the filtered catalogue and its rendered document. */
export interface ModelsListReport {
  readonly catalogue: Catalogue.Catalogue;
  readonly output: string;
}

/**
 * List the catalogue as the stable JSON document or the one-line-per-model
 * table. No host state, no store, no dates.
 */
export const listModels = (
  options: ModelsOptions,
  source?: Catalogue.ModelSource,
): Effect.Effect<ModelsListReport, SurfaceError, FileSystem.FileSystem> =>
  loadCatalogue(options, source).pipe(
    Effect.map((catalogue) => ({
      catalogue,
      output:
        options.json === true ? Catalogue.toJson(catalogue) : Catalogue.renderTable(catalogue),
    })),
  );

/** Repo-level config only: the same load `models --verify` uses without a name. */
export const loadRepoSizing = (
  root: string,
): Effect.Effect<SizingLoad, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const layer = yield* loadRepoLayer(root);
    if (layer.file === undefined) return NO_SIZING;
    return { files: [layer.file], repo: layer.config, spec: undefined, issues: layer.issues };
  });

/** A config layer one verification pass reads, least to most specific. */
export type VerifyLayer = 'repo' | 'spec';

/** One model entry, tagged with the config layer that defines it. */
export interface TaggedEntry {
  readonly layer: VerifyLayer;
  readonly entry: Catalogue.ConfigEntry;
}

/** Every model entry a loaded config defines, with its file, field, and layer. */
export const configEntries = (
  load: SizingLoad,
  name: string | undefined,
): ReadonlyArray<TaggedEntry> => {
  const entries: Array<TaggedEntry> = [];
  const pushSizes = (layer: VerifyLayer, path: string, prefix: string, sizes: SizeMap): void => {
    for (const size of SIZES) {
      const entry = sizes[size];
      if (entry === undefined) continue;
      entries.push({
        layer,
        entry:
          entry.effort === undefined
            ? { path, field: `${prefix}.${size}`, model: entry.model }
            : { path, field: `${prefix}.${size}`, model: entry.model, effort: entry.effort },
      });
    }
  };
  if (load.repo !== undefined) pushSizes('repo', CONFIG_FILE, 'sizes', load.repo.sizes);
  if (load.spec !== undefined && name !== undefined) {
    const path = `${name}/${CONFIG_FILE}`;
    pushSizes('spec', path, 'sizes', load.spec.sizes);
    const phases = load.spec.phases ?? {};
    for (const phase of Object.keys(phases).toSorted()) {
      const config = phases[phase];
      if (config !== undefined) pushSizes('spec', path, `phases.${phase}.sizes`, config.sizes);
    }
  }
  return entries;
};

/** Render catalogue findings through the same agent-first diagnostic shape. */
export const renderModelFindings = (
  findings: ReadonlyArray<Catalogue.ConfigFinding>,
  rerun: string,
): string => {
  if (findings.length === 0) return '';
  const diagnostics = findings.map((found) =>
    diagnostic({
      code: found.code,
      path: found.path,
      field: found.field,
      problem: found.message,
      rerun,
      expected: found.expected,
      actual: found.actual,
      fix: found.fix,
      warning: true,
    }),
  );
  const unknownModels = findings.filter(
    (found) => found.code === Catalogue.CODES.unknownModel,
  ).length;
  const unknownEfforts = findings.filter(
    (found) => found.code === Catalogue.CODES.unknownEffort,
  ).length;
  const counts = [
    `${findings.length} warning${findings.length === 1 ? '' : 's'}`,
    ...(unknownModels === 0
      ? []
      : [`${unknownModels} unknown model${unknownModels === 1 ? '' : 's'}`]),
    ...(unknownEfforts === 0
      ? []
      : [`${unknownEfforts} unknown effort${unknownEfforts === 1 ? '' : 's'}`]),
  ];
  return `${renderDiagnostics(diagnostics)}\n\n${counts.join(' \u00b7 ')}`;
};

/** A verification run: the catalogue, its warnings, the counts, and the rendered report. */
export interface ModelsVerifyReport {
  readonly catalogue: Catalogue.Catalogue;
  readonly findings: ReadonlyArray<Catalogue.ConfigFinding>;
  /** What the pass inspected, split by layer and provider filter. */
  readonly counts: ModelsVerifyCounts;
  readonly output: string;
  readonly exitCode: number;
}

/** Counts one config layer contributed to a verification pass. */
export interface VerifyLayerCounts {
  readonly layer: VerifyLayer;
  /** Entries cross-checked against the catalogue. */
  readonly checked: number;
  /** Entries the provider filter excluded. */
  readonly skipped: number;
}

/**
 * What a verification pass actually inspected. `checked + skipped` is every
 * entry the loaded configs define, so a filtered run can never look like a
 * clean one and a pass that inspected nothing says exactly that. The totals are
 * derived from {@link layers}, so the header and the per-layer rows cannot
 * disagree.
 */
export interface ModelsVerifyCounts {
  readonly checked: number;
  readonly skipped: number;
  /** Checked and skipped per consulted layer, least to most specific. */
  readonly layers: ReadonlyArray<VerifyLayerCounts>;
  /** Provider filter applied; absent when the run was unfiltered. */
  readonly provider?: string;
}

/** A {@link ModelsVerifyCounts} being filled in, so absent keys stay absent. */
export interface MutableModelsVerifyCounts {
  checked: number;
  skipped: number;
  layers: ReadonlyArray<VerifyLayerCounts>;
  provider?: string;
}

/** True when a config entry survives the provider filter. */
export const providerMatches = (
  entry: Catalogue.ConfigEntry,
  provider: string | undefined,
): boolean => provider === undefined || entry.model.startsWith(`${provider}/`);

/** Count one layer's entries: cross-checked, and excluded by the provider filter. */
export const layerCounts = (
  entries: ReadonlyArray<TaggedEntry>,
  layer: VerifyLayer,
  provider: string | undefined,
): VerifyLayerCounts => {
  const held = entries.filter((tagged) => tagged.layer === layer);
  const skipped = held.filter((tagged) => !providerMatches(tagged.entry, provider)).length;
  return { layer, checked: held.length - skipped, skipped };
};

/**
 * Render the count line every verification run prints: totals, then each
 * consulted layer, then the provider filter. Reads as plain facts, so a
 * zero-entry pass states `0 entries checked` instead of implying success. The
 * `provider` segment appears only when a filter was applied, so an unfiltered
 * pass can never be confused with a pass filtered to a provider named `all` —
 * there is no sentinel label at all.
 * @param counts - the pass's counts
 * @returns one line
 */
export const renderVerifyCounts = (counts: ModelsVerifyCounts): string => {
  const layers = counts.layers
    .map((layer) => `${layer.layer} ${layer.checked} checked, ${layer.skipped} skipped`)
    .join(' \u00b7 ');
  const entries = counts.checked === 1 ? 'entry' : 'entries';
  const parts = [
    `${counts.checked} ${entries} checked`,
    `${counts.skipped} skipped`,
    layers,
    ...(counts.provider === undefined ? [] : [`provider ${counts.provider}`]),
  ];
  return parts.join(' \u00b7 ');
};

/**
 * Render one verification pass: findings when there are any, then the counts.
 * A pass that checked nothing prints no success line at all — only the zero.
 * @param findings - catalogue warnings in input order
 * @param counts - the pass's counts
 * @param rerun - command to name in each warning
 * @returns the display text
 */
export const renderModelsVerify = (
  findings: ReadonlyArray<Catalogue.ConfigFinding>,
  counts: ModelsVerifyCounts,
  rerun: string,
): string => {
  const summary =
    findings.length > 0
      ? renderModelFindings(findings, rerun)
      : counts.checked === 0
        ? ''
        : '\u2713 no model or effort findings';
  const countLine = renderVerifyCounts(counts);
  return summary === '' ? countLine : `${summary}\n\n${countLine}`;
};

/**
 * Cross-check the repo config and, when named, the spec config including every
 * phase override. Warnings never fail the run; malformed catalogues and
 * invalid config files do.
 */
export const verifyModels = (
  root: string,
  options: Pick<ModelsOptions, 'name' | 'catalog' | 'provider'>,
  source?: Catalogue.ModelSource,
): Effect.Effect<
  ModelsVerifyReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const name = options.name;
    yield* guardFailure(
      'SpecsModelsVerify',
      name === undefined ? undefined : guardSpecName(name, modelsVerifyGuardCommand(options)),
    );
    const store = yield* SpecStore.SpecStore;
    const catalogue = yield* loadCatalogue(
      { catalog: options.catalog, provider: options.provider },
      source,
    );
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecsModelsVerify',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    if (name !== undefined && !(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecsModelsVerify',
          diagnostics: [unknownSpecDiagnostic(name)],
        }),
      );
    }
    const load =
      name === undefined
        ? yield* loadRepoSizing(root)
        : yield* Effect.gen(function* () {
            const snapshot = yield* store.snapshot(root, name);
            return yield* loadSizing(root, name, snapshot);
          });
    const errors = load.issues.filter(isError);
    const rerun =
      name === undefined ? 'mf-specs models --verify' : `mf-specs models --verify --name ${name}`;
    if (errors.length > 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecsModelsVerify',
          diagnostics: errors.map((found) => diagnosticOfIssue('', found, rerun)),
        }),
      );
    }
    const provider = options.provider?.trim();
    const filter = provider === undefined || provider === '' ? undefined : provider;
    const tagged = configEntries(load, name);
    const layers =
      name === undefined
        ? [layerCounts(tagged, 'repo', filter)]
        : [layerCounts(tagged, 'repo', filter), layerCounts(tagged, 'spec', filter)];
    const counts: MutableModelsVerifyCounts = {
      checked: layers.reduce((sum, layer) => sum + layer.checked, 0),
      skipped: layers.reduce((sum, layer) => sum + layer.skipped, 0),
      layers,
    };
    if (filter !== undefined) counts.provider = filter;
    const entries = tagged
      .filter((item) => providerMatches(item.entry, filter))
      .map((item) => item.entry);
    const findings = Catalogue.verify(catalogue, entries);
    return {
      catalogue,
      findings,
      counts,
      output: renderModelsVerify(findings, counts, rerun),
      exitCode: 0,
    };
  });

/**
 * The corrected `models --verify` command for the flags a caller supplied, so
 * every refusal names a command that honours them. The CLI and the
 * `spec_models` tool both build their `--name` refusal from this.
 */
export const modelsVerifyCommand = (options: ModelsOptions): string => {
  const flags = ['mf-specs models --verify'];
  if (options.provider !== undefined && options.provider.trim() !== '') {
    flags.push(`--provider ${options.provider.trim()}`);
  }
  if (options.catalog !== undefined && options.catalog !== '') {
    flags.push(`--catalog ${options.catalog}`);
  }
  if (options.name !== undefined && options.name.trim() !== '') {
    flags.push(`--name ${options.name.trim()}`);
  }
  return flags.join(' ');
};

/**
 * The `next` row for a refused `--name` on the verification path: the corrected
 * command for the flags the caller supplied, with the repaired name left as the
 * `<spec>` placeholder. Built through {@link modelsVerifyCommand} so a refusal
 * keeps `--catalog` and `--provider`, and therefore prints a command that runs
 * outside the host instead of one with no catalogue source.
 * @param options - the flags the refused run carried
 * @returns the command to re-run after the repair
 */
export const modelsVerifyGuardCommand = (
  options: Pick<ModelsOptions, 'catalog' | 'provider'>,
): string =>
  `${modelsVerifyCommand({ catalog: options.catalog, provider: options.provider })} --name <spec>`;

/** Diagnostic for `--json`, which only the listing path can produce. */
export const verifyJsonDiagnostic = (options: ModelsOptions): SizingDiagnostic => {
  const command = modelsVerifyCommand(options);
  return diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: 'models',
    field: '--json',
    problem: '--json has no meaning with --verify.',
    rerun: command,
    expected: '--json on the listing path, or --verify without it',
    actual: '--json --verify',
    fix: `Drop --json to verify: ${command}.`,
  });
};

/**
 * Diagnostic for a `--name` on a surface that cannot honour it: the catalogue
 * listing. `models` without `--verify` and the `spec_models` tool's `list`
 * action both print this, so the two agree on the flag and on the corrected
 * command. The `actual` row echoes the value as supplied; the corrected command
 * carries it trimmed.
 * @param name - the supplied spec name
 * @param command - the corrected `models --verify` command
 * @returns the coded refusal
 */
export const listNameDiagnostic = (name: string, command: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: 'models',
    field: '--name',
    problem: '--name has no meaning without --verify.',
    rerun: command,
    expected: '--name on the verification path, or the listing path without it',
    actual: `--name ${name}`,
    fix: `Add --verify to cross-check that spec's config: ${command}.`,
  });

/**
 * `mf-specs models`: list the catalogue or verify config entries. The binary
 * has no host port, so it must receive `--catalog`; the slash form and the
 * `spec_models` tool pass the host's model port instead.
 */
export const models = (
  root: string,
  options: ModelsOptions,
  source?: Catalogue.ModelSource,
): Effect.Effect<
  ModelsRun,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    if (options.verify === true) {
      if (options.json === true) {
        return yield* Effect.fail(
          new SurfaceError({
            operation: 'SpecsModels',
            diagnostics: [verifyJsonDiagnostic(options)],
          }),
        );
      }
      const report = yield* verifyModels(
        root,
        { name: options.name, catalog: options.catalog, provider: options.provider },
        source,
      );
      return { output: report.output, exitCode: report.exitCode };
    }
    // `--name` scopes the verification pass; the listing path cannot honour it,
    // so it is a usage error instead of a flag that silently changes nothing.
    if (options.name !== undefined && options.name.trim() !== '') {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecsModels',
          diagnostics: [listNameDiagnostic(options.name, modelsVerifyCommand(options))],
        }),
      );
    }
    const report = yield* listModels(options, source);
    return { output: report.output, exitCode: 0 };
  });

/** One task's declared size and resolved dispatch target. */
export const modelsCommand = Command.make(
  'models',
  {
    dir: dirFlag,
    provider: Flag.optional(
      Flag.String('provider').pipe(
        Flag.withDescription('Keep one provider id; a miss is a diagnostic.'),
      ),
    ),
    json: Flag.Boolean('json').pipe(
      Flag.withDescription('Print the stable JSON document (also valid --catalog input).'),
      Flag.withDefault(false),
    ),
    catalog: Flag.optional(
      Flag.String('catalog').pipe(
        Flag.withDescription('Read a catalogue file instead of the host model port.'),
      ),
    ),
    verify: Flag.Boolean('verify').pipe(
      Flag.withDescription('Cross-check sizing config entries; warnings exit 0.'),
      Flag.withDefault(false),
    ),
    name: Flag.optional(nameFlag),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* models(storeDirOf(config.dir), {
          provider: opt(config.provider),
          json: config.json,
          catalog: opt(config.catalog),
          verify: config.verify,
          name: opt(config.name),
        });
        yield* Console.log(report.output);
        if (report.exitCode !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = report.exitCode;
          });
        }
      }),
      () => ({
        path: storeDirOf(config.dir),
        rerun: config.verify
          ? 'mf-specs models --verify --dir <repo root>'
          : 'mf-specs models --dir <repo root>',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'List the host model catalogue with its effort variants, or verify config entries against it.',
  ),
  Command.provide(SpecStore.Default),
);

/**
 * `which`, `author`, and `execute` default to the nearest repository root, not
 * the process directory.
 */
