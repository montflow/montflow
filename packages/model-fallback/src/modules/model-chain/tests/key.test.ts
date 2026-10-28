import { Model } from '@opencode/schema/model';
import * as Vitest from '@effect/vitest';
import { ModelChain } from '../index.js';

Vitest.describe('ModelChain.key runtime', () => {
  Vitest.it('joins the provider and model id', () => {
    Vitest.expect(ModelChain.key(Model.Ref.parse('deepseek/deepseek-chat'))).toBe(
      'deepseek/deepseek-chat',
    );
  });

  Vitest.it('ignores the variant', () => {
    Vitest.expect(ModelChain.key(Model.Ref.parse('a/one#fast'))).toBe('a/one');
  });

  Vitest.it('keeps a slash inside the model id', () => {
    Vitest.expect(ModelChain.key(Model.Ref.parse('openrouter/anthropic/claude-sonnet-4'))).toBe(
      'openrouter/anthropic/claude-sonnet-4',
    );
  });
});
