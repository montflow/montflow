import * as Vitest from '@effect/vitest';
import { ModelCatalog } from '../index.js';

interface CandidateOptions {
  readonly outputCost?: number;
  readonly context?: number;
  readonly status?: string;
}

const candidate = (
  providerID: string,
  modelID: string,
  options: CandidateOptions = {},
): ModelCatalog.Candidate => ({
  label: `${providerID}/${modelID}`,
  providerID,
  modelID,
  name: modelID,
  context: options.context ?? 1000,
  outputCost: options.outputCost ?? 1,
  tools: true,
  status: options.status ?? 'active',
});

const noPreferences: ModelCatalog.Preferences = { favorite: [], recent: [], variant: new Map() };

const labels = (ranked: ReadonlyArray<ModelCatalog.Ranked>): ReadonlyArray<string> =>
  ranked.map((entry) => entry.label);

const flags = (
  ranked: ReadonlyArray<ModelCatalog.Ranked>,
): ReadonlyArray<{ favorite: boolean; recent: boolean }> =>
  ranked.map((entry) => ({ favorite: entry.favorite, recent: entry.recent }));

Vitest.describe('ModelCatalog.rank runtime', () => {
  Vitest.it('puts favorites first in preference-file order', () => {
    const ranked = ModelCatalog.rank(
      [
        candidate('a', 'one', { outputCost: 1 }),
        candidate('b', 'two', { outputCost: 2 }),
        candidate('c', 'three', { outputCost: 3 }),
      ],
      { favorite: ['c/three', 'a/one'], recent: [], variant: new Map() },
    );

    Vitest.expect(labels(ranked)).toStrictEqual(['c/three', 'a/one', 'b/two']);
    Vitest.expect(flags(ranked)).toStrictEqual([
      { favorite: true, recent: false },
      { favorite: true, recent: false },
      { favorite: false, recent: false },
    ]);
  });

  Vitest.it('puts recents after favorites', () => {
    const ranked = ModelCatalog.rank(
      [candidate('a', 'one'), candidate('b', 'two'), candidate('c', 'three')],
      { favorite: ['b/two'], recent: ['c/three'], variant: new Map() },
    );

    Vitest.expect(labels(ranked)).toStrictEqual(['b/two', 'c/three', 'a/one']);
    Vitest.expect(flags(ranked)[1]).toStrictEqual({ favorite: false, recent: true });
  });

  Vitest.it('marks a model that is both favorite and recent as recent: false', () => {
    const ranked = ModelCatalog.rank([candidate('a', 'one'), candidate('b', 'two')], {
      favorite: ['a/one'],
      recent: ['a/one', 'b/two'],
      variant: new Map(),
    });

    Vitest.expect(labels(ranked)).toStrictEqual(['a/one', 'b/two']);
    Vitest.expect(flags(ranked)).toStrictEqual([
      { favorite: true, recent: false },
      { favorite: false, recent: true },
    ]);
  });

  Vitest.it('takes the cheapest active model per provider, then the remaining models', () => {
    const ranked = ModelCatalog.rank(
      [
        candidate('p1', 'expensive', { outputCost: 9 }),
        candidate('p1', 'cheap', { outputCost: 1 }),
        candidate('p2', 'only', { outputCost: 5 }),
      ],
      noPreferences,
    );

    Vitest.expect(labels(ranked)).toStrictEqual(['p1/cheap', 'p2/only', 'p1/expensive']);
  });

  Vitest.it('never picks a deprecated model as a provider best, but keeps it visible last', () => {
    const ranked = ModelCatalog.rank(
      [
        candidate('p1', 'legacy', { outputCost: 0, status: 'deprecated' }),
        candidate('p1', 'current', { outputCost: 5 }),
        candidate('p2', 'other', { outputCost: 3 }),
      ],
      noPreferences,
    );

    Vitest.expect(labels(ranked)).toStrictEqual(['p2/other', 'p1/current', 'p1/legacy']);
    Vitest.expect(ranked.find((entry) => entry.label === 'p1/legacy')?.status).toBe('deprecated');
  });

  Vitest.it('prefers a larger context window when output costs tie', () => {
    const ranked = ModelCatalog.rank(
      [
        candidate('p1', 'small', { outputCost: 4, context: 8_000 }),
        candidate('p1', 'large', { outputCost: 4, context: 200_000 }),
      ],
      noPreferences,
    );

    Vitest.expect(labels(ranked)).toStrictEqual(['p1/large', 'p1/small']);
  });

  Vitest.it('ignores a preference for a model that is not in the catalog', () => {
    const ranked = ModelCatalog.rank([candidate('a', 'one')], {
      favorite: ['gone/model'],
      recent: [],
      variant: new Map(),
    });

    Vitest.expect(labels(ranked)).toStrictEqual(['a/one']);
    Vitest.expect(flags(ranked)).toStrictEqual([{ favorite: false, recent: false }]);
  });
});
