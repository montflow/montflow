import * as Vitest from '@effect/vitest';
import { ModelCatalog } from '../index.js';

const candidate = (providerID: string, modelID: string): ModelCatalog.Candidate => ({
  label: `${providerID}/${modelID}`,
  providerID,
  modelID,
  name: modelID,
  context: 1000,
  outputCost: 1,
  tools: true,
  status: 'active',
});

const ranked: ReadonlyArray<ModelCatalog.Candidate> = [
  candidate('a', 'one'),
  candidate('b', 'two'),
  candidate('c', 'three'),
];

const preferences = (
  variant: ReadonlyArray<readonly [string, string]>,
): ModelCatalog.Preferences => ({
  favorite: [],
  recent: [],
  variant: new Map(variant),
});

Vitest.describe('ModelCatalog.suggest runtime', () => {
  Vitest.it('takes the first max ranked models', () => {
    Vitest.expect(ModelCatalog.suggest(ranked, preferences([]), 2)).toStrictEqual([
      'a/one',
      'b/two',
    ]);
  });

  Vitest.it('returns every model when max exceeds the ranking', () => {
    Vitest.expect(ModelCatalog.suggest(ranked, preferences([]), 10)).toStrictEqual([
      'a/one',
      'b/two',
      'c/three',
    ]);
  });

  Vitest.it('appends #variant when the user picked a non-default variant', () => {
    Vitest.expect(ModelCatalog.suggest(ranked, preferences([['b/two', 'fast']]), 3)).toStrictEqual([
      'a/one',
      'b/two#fast',
      'c/three',
    ]);
  });

  Vitest.it('leaves a default variant as a plain label', () => {
    Vitest.expect(
      ModelCatalog.suggest(ranked, preferences([['b/two', 'default']]), 3),
    ).toStrictEqual(['a/one', 'b/two', 'c/three']);
  });

  Vitest.it('leaves models without a variant as plain labels', () => {
    Vitest.expect(
      ModelCatalog.suggest(ranked, preferences([['c/three', 'deep']]), 2),
    ).toStrictEqual(['a/one', 'b/two']);
  });

  Vitest.it('returns no labels for max 0', () => {
    Vitest.expect(ModelCatalog.suggest(ranked, preferences([]), 0)).toStrictEqual([]);
  });
});
