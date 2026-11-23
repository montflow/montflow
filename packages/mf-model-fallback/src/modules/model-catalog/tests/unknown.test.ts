import * as Vitest from '@effect/vitest';
import { ModelCatalog } from '../index.js';
import { ModelChain } from '../../model-chain/index.js';

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

const catalog: ReadonlyArray<ModelCatalog.Candidate> = [
  candidate('a', 'one'),
  candidate('b', 'two'),
];

Vitest.describe('ModelCatalog.unknown runtime', () => {
  Vitest.it('returns the labels the catalog does not know', () => {
    const chain = ModelChain.parse(['a/one', 'z/missing']);

    Vitest.expect(ModelCatalog.unknown(chain, catalog)).toStrictEqual(['z/missing']);
  });

  Vitest.it('ignores the variant when resolving a chain entry', () => {
    const chain = ModelChain.parse(['a/one#fast']);

    Vitest.expect(ModelCatalog.unknown(chain, catalog)).toStrictEqual([]);
  });

  Vitest.it('is empty when every entry resolves', () => {
    const chain = ModelChain.parse(['a/one', 'b/two']);

    Vitest.expect(ModelCatalog.unknown(chain, catalog)).toStrictEqual([]);
  });

  Vitest.it('is empty for an empty chain', () => {
    Vitest.expect(ModelCatalog.unknown([], catalog)).toStrictEqual([]);
  });

  Vitest.it('reports every unknown entry in chain order', () => {
    const chain = ModelChain.parse(['z/first', 'a/one', 'z/second']);

    Vitest.expect(ModelCatalog.unknown(chain, catalog)).toStrictEqual(['z/first', 'z/second']);
  });
});
