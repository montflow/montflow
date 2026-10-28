import { Model } from '@opencode/schema/model';
import * as Vitest from '@effect/vitest';
import { FallbackNotice } from '../index.js';

Vitest.describe('FallbackNotice.make runtime', () => {
  Vitest.it('announces a resume when the provider sent a status', () => {
    const notice = FallbackNotice.make({
      phase: 'resume',
      from: Model.Ref.parse('deepseek/deepseek-chat'),
      to: Model.Ref.parse('openrouter/claude-sonnet-4#beta'),
      failure: { type: 'provider.rate-limit', status: 429 },
    });

    Vitest.expect(notice.text).toBe(
      'deepseek/deepseek-chat failed with provider.rate-limit (429); resuming on openrouter/claude-sonnet-4#beta.',
    );
    Vitest.expect(notice.description).toBe('Model fallback');
    Vitest.expect(notice.metadata).toStrictEqual({
      source: 'montflow/model-fallback',
      phase: 'resume',
      from: 'deepseek/deepseek-chat',
      to: 'openrouter/claude-sonnet-4',
      reason: 'provider.rate-limit (429)',
    });
  });

  Vitest.it('announces a retry without a status', () => {
    const notice = FallbackNotice.make({
      phase: 'retry',
      from: Model.Ref.parse('a/one'),
      to: Model.Ref.parse('b/two'),
      failure: { type: 'provider.auth' },
    });

    Vitest.expect(notice.text).toBe('a/one failed with provider.auth; retrying on b/two.');
    Vitest.expect(notice.metadata).toStrictEqual({
      source: 'montflow/model-fallback',
      phase: 'retry',
      from: 'a/one',
      to: 'b/two',
      reason: 'provider.auth',
    });
  });

  Vitest.it('keeps the variant out of the metadata keys', () => {
    const notice = FallbackNotice.make({
      phase: 'resume',
      from: Model.Ref.parse('a/one#fast'),
      to: Model.Ref.parse('b/two#deep'),
      failure: { type: 'provider.timeout', status: 504 },
    });

    Vitest.expect(notice.metadata.from).toBe('a/one');
    Vitest.expect(notice.metadata.to).toBe('b/two');
    Vitest.expect(notice.text).toContain('a/one#fast failed');
    Vitest.expect(notice.text).toContain('resuming on b/two#deep.');
  });
});
