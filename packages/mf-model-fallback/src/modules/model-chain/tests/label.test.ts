import * as Vitest from '@effect/vitest';
import { ModelChain } from '../index.js';

Vitest.describe('ModelChain.label runtime', () => {
  Vitest.it('renders provider/model when no variant was picked', () => {
    Vitest.expect(ModelChain.label(ModelChain.parseOne('deepseek/deepseek-chat'))).toBe(
      'deepseek/deepseek-chat',
    );
  });

  Vitest.it('appends the variant', () => {
    Vitest.expect(ModelChain.label(ModelChain.parseOne('a/one#fast'))).toBe('a/one#fast');
  });

  Vitest.it('agrees with key for a variant-free reference', () => {
    const ref = ModelChain.parseOne('a/one');

    Vitest.expect(ModelChain.label(ref)).toBe(ModelChain.key(ref));
  });
});
