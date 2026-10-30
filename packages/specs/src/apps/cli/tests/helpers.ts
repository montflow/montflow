import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { PromptStore } from '@montflow/prompts';
import { Effect, FileSystem, Layer, Path } from 'effect';
import type { SeriesSnapshot } from '../../../modules/review-link/index.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { memoryMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';

/** One snapshot file entry. */
export const entry = (path: string, content: string): SpecFileEntry => ({ path, content });

/** Failure injection for the stub store. */
export interface StubOptions {
  /** Make every `readRootFile` fail, as an unreadable config file does. */
  readonly rootFileFailure?: SpecStore.StoreError;
  /** Make every `snapshot` fail, as an unreadable spec directory does. */
  readonly snapshotFailure?: SpecStore.StoreError;
  /** Review series the store reports for a matching spec (`<name>` / `<name>-*`). */
  readonly reviews?: ReadonlyArray<SeriesSnapshot>;
  /** Make every `reviewSeries` fail, as an unreadable review store does. */
  readonly reviewFailure?: SpecStore.StoreError;
}

/** MEMORY.md contents with the template's sections. */
export const memory = memoryMarkdown();

/** Repo-level `sizing.json`: defines `tiny` and `small`. */
export const REPO_SIZING = JSON.stringify({
  sizes: {
    tiny: { model: 'fixture/repo-model', effort: 'low' },
    small: { model: 'fixture/repo-model', effort: 'low' },
  },
});

/** Spec-level `sizing.json`: overrides `tiny`, defines `small`, overrides phase A. */
export const SPEC_SIZING = JSON.stringify({
  sizes: {
    tiny: { model: 'fixture/spec-model', effort: 'medium' },
    small: { model: 'fixture/spec-model' },
  },
  phases: { A: { sizes: { tiny: { model: 'fixture/phase-model', effort: 'high' } } } },
});

/**
 * In-memory `SpecStore` for CLI tests: specs keyed by directory name.
 * `snapshot` fails for unknown names, matching the file-backed store, and
 * `write` replaces the entry so a scaffold can be read back. `rootFiles`
 * backs `readRootFile` with repo-level config such as `sizing.json`. The
 * layer also carries the real `FileSystem` (the `which` resolver reads git
 * metadata with it) and the real `PromptStore` (author/execute read the
 * workspace prompts), both provided by the platform services; every other
 * engine ignores them.
 * @param specs - mutable spec map the stub reads from and writes into
 * @param rootFiles - repo-level files keyed by name
 * @param options - failure injection for unreadable files
 * @returns the stub layer
 */
export const stubLayer = (
  specs: Map<string, ReadonlyArray<SpecFileEntry>>,
  rootFiles: ReadonlyMap<string, string> = new Map(),
  options: StubOptions = {},
): Layer.Layer<SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore | Path.Path> =>
  Layer.mergeAll(
    Layer.succeed(
      SpecStore.SpecStore,
      SpecStore.SpecStore.of({
        names: () => Effect.succeed([...specs.keys()].toSorted()),
        hasRoot: () => Effect.succeed(true),
        exists: (_root, name) => Effect.succeed(specs.has(name)),
        hasFile: (_root, name, relative) =>
          Effect.succeed(specs.get(name)?.some((file) => file.path === relative) ?? false),
        snapshot: (_root, name) => {
          const files = specs.get(name);
          if (files === undefined) {
            return Effect.fail(
              new SpecStore.StoreError({ operation: 'test', reason: `missing '${name}'` }),
            );
          }
          return options.snapshotFailure === undefined
            ? Effect.succeed({ name, files })
            : Effect.fail(options.snapshotFailure);
        },
        reviewSeries: (_root, name) =>
          options.reviewFailure === undefined
            ? Effect.succeed(
                (options.reviews ?? []).filter(
                  (series) => series.name === name || series.name.startsWith(`${name}-`),
                ),
              )
            : Effect.fail(options.reviewFailure),
        readRootFile: (_root, name) =>
          options.rootFileFailure === undefined
            ? Effect.succeed(rootFiles.get(name))
            : Effect.fail(options.rootFileFailure),
        write: (_root, name, files) =>
          Effect.sync(() => {
            specs.set(name, files);
          }),
      }),
    ),
    NodeFileSystem.layer,
    NodePath.layer,
    Layer.provide(PromptStore.Default, Layer.merge(NodeFileSystem.layer, NodePath.layer)),
  );
