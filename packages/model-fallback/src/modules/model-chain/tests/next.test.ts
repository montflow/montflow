import { Model } from '@opencode/schema/model';
import * as Vitest from '@effect/vitest';
import { ModelChain } from '../index.js';

const chain = ModelChain.parse(['a/one', 'b/two', 'c/three']);
const one = Model.Ref.parse('a/one');
const two = Model.Ref.parse('b/two');
const three = Model.Ref.parse('c/three');

Vitest.describe('ModelChain.next types', () => {
  Vitest.it('resolves to a reference or undefined', () => {
    Vitest.expectTypeOf(ModelChain.next(chain, one, new Set<string>())).toEqualTypeOf<
      ModelChain.Ref | undefined
    >();
  });
});

Vitest.describe('ModelChain.next runtime', () => {
  Vitest.it('returns the entry right after the current model', () => {
    Vitest.expect(ModelChain.next(chain, one, new Set<string>())).toStrictEqual(two);
  });

  Vitest.it('skips models already tried', () => {
    Vitest.expect(ModelChain.next(chain, one, new Set([ModelChain.key(two)]))).toStrictEqual(three);
  });

  Vitest.it('starts at the head when the current model is outside the chain', () => {
    Vitest.expect(
      ModelChain.next(chain, Model.Ref.parse('x/other'), new Set<string>()),
    ).toStrictEqual(one);
  });

  Vitest.it('starts at the first untried entry when the current model is outside the chain', () => {
    Vitest.expect(
      ModelChain.next(chain, Model.Ref.parse('x/other'), new Set([ModelChain.key(one)])),
    ).toStrictEqual(two);
  });

  Vitest.it('does not wrap after the last entry', () => {
    Vitest.expect(ModelChain.next(chain, three, new Set<string>())).toBeUndefined();
  });

  Vitest.it('returns undefined when every remaining entry was tried', () => {
    const tried = new Set([ModelChain.key(two), ModelChain.key(three)]);

    Vitest.expect(ModelChain.next(chain, one, tried)).toBeUndefined();
  });

  Vitest.it('returns undefined for an empty chain', () => {
    Vitest.expect(ModelChain.next([], one, new Set<string>())).toBeUndefined();
  });

  Vitest.it('matches the current model by key, ignoring its variant', () => {
    Vitest.expect(
      ModelChain.next(chain, Model.Ref.parse('a/one#fast'), new Set<string>()),
    ).toStrictEqual(two);
  });
});
