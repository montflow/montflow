import { Effect, Layer } from 'effect';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { memoryMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';

/** One snapshot file entry. */
export const entry = (path: string, content: string): SpecFileEntry => ({ path, content });

/** MEMORY.md contents with the template's sections. */
export const memory = memoryMarkdown();

/**
 * In-memory `SpecStore` for CLI tests: specs keyed by directory name.
 * `snapshot` fails for unknown names, matching the file-backed store.
 */
export const stubLayer = (
  specs: ReadonlyMap<string, ReadonlyArray<SpecFileEntry>>,
): Layer.Layer<SpecStore.SpecStore> =>
  Layer.succeed(
    SpecStore.SpecStore,
    SpecStore.SpecStore.of({
      names: () => Effect.succeed([...specs.keys()].toSorted()),
      hasRoot: () => Effect.succeed(true),
      exists: (_root, name) => Effect.succeed(specs.has(name)),
      snapshot: (_root, name) => {
        const files = specs.get(name);
        return files === undefined
          ? Effect.fail(
              new SpecStore.StoreError({ operation: 'test', reason: `missing '${name}'` }),
            )
          : Effect.succeed({ name, files });
      },
    }),
  );
