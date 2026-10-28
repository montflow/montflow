import { Model } from '@opencode/schema/model';
import * as Vitest from '@effect/vitest';
import { ModelChain } from '../index.js';

Vitest.describe('ModelChain.parse runtime', () => {
  Vitest.it('parses provider/model into a reference', () => {
    Vitest.expect(ModelChain.parse(['deepseek/deepseek-chat'])).toStrictEqual([
      Model.Ref.parse('deepseek/deepseek-chat'),
    ]);
  });

  Vitest.it('parses provider/model#variant into a reference carrying the variant', () => {
    const [ref] = ModelChain.parse(['openrouter/claude-sonnet-4#beta']);

    Vitest.expect(ref).toStrictEqual(Model.Ref.parse('openrouter/claude-sonnet-4#beta'));
    Vitest.expect(ref?.variant).toBe('beta');
  });

  Vitest.it('preserves order across distinct models', () => {
    const parsed = ModelChain.parse(['a/one', 'b/two', 'c/three']);

    Vitest.expect(parsed.map(ModelChain.label)).toStrictEqual(['a/one', 'b/two', 'c/three']);
  });

  Vitest.it('drops duplicate models, keeping the first occurrence', () => {
    const parsed = ModelChain.parse(['a/one', 'b/two', 'a/one', 'c/three']);

    Vitest.expect(parsed.map(ModelChain.label)).toStrictEqual(['a/one', 'b/two', 'c/three']);
  });

  Vitest.it('treats the same model with different variants as one duplicate', () => {
    const parsed = ModelChain.parse(['a/one#fast', 'a/one', 'a/one#deep']);

    Vitest.expect(parsed.map(ModelChain.label)).toStrictEqual(['a/one#fast']);
  });

  Vitest.it('returns an empty list for an empty chain', () => {
    Vitest.expect(ModelChain.parse([])).toStrictEqual([]);
  });

  Vitest.it('throws on a malformed entry', () => {
    Vitest.expect(() => ModelChain.parse(['no-slash'])).toThrow(
      'Invalid model reference: no-slash',
    );
  });
});
