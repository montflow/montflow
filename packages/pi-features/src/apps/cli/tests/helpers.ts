import { Effect, Layer } from 'effect';
import type { FeatureFileEntry } from '../../../modules/structure/index.js';
import { memoryMarkdown } from '../../../modules/task/tests/helpers.js';
import { FeatureStore } from '../../../services/index.js';

/** One snapshot file entry. */
export const entry = (path: string, content: string): FeatureFileEntry => ({ path, content });

/** MEMORY.md contents with the template's sections. */
export const memory = memoryMarkdown();

/**
 * In-memory `FeatureStore` for CLI tests: features keyed by directory name.
 * `snapshot` fails for unknown names, matching the file-backed store.
 */
export const stubLayer = (
  features: ReadonlyMap<string, ReadonlyArray<FeatureFileEntry>>,
): Layer.Layer<FeatureStore.FeatureStore> =>
  Layer.succeed(
    FeatureStore.FeatureStore,
    FeatureStore.FeatureStore.of({
      names: () => Effect.succeed([...features.keys()].toSorted()),
      hasRoot: () => Effect.succeed(true),
      exists: (_root, name) => Effect.succeed(features.has(name)),
      snapshot: (_root, name) => {
        const files = features.get(name);
        return files === undefined
          ? Effect.fail(
              new FeatureStore.StoreError({ operation: 'test', reason: `missing '${name}'` }),
            )
          : Effect.succeed({ name, files });
      },
    }),
  );
