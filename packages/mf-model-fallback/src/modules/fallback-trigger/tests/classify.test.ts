import * as Vitest from '@effect/vitest';
import { FallbackTrigger } from '../index.js';

Vitest.describe('FallbackTrigger.classify runtime', () => {
  Vitest.it('classifies each session error type', () => {
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.quota' })).toBe('quota');
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.rate-limit' })).toBe('rate-limit');
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.auth' })).toBe('auth');
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.timeout' })).toBe('timeout');
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.internal' })).toBe(
      'provider-internal',
    );
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.transport' })).toBe('transport');
  });

  Vitest.it('falls back to the HTTP status when the type is unknown', () => {
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 402 })).toBe('quota');
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 429 })).toBe('rate-limit');
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 401 })).toBe('auth');
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 403 })).toBe('auth');
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 408 })).toBe('timeout');
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 504 })).toBe('timeout');
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 500 })).toBe(
      'provider-internal',
    );
    Vitest.expect(FallbackTrigger.classify({ type: 'unknown', status: 503 })).toBe(
      'provider-internal',
    );
  });

  Vitest.it('lets the error type win over the status', () => {
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.quota', status: 401 })).toBe('quota');
    Vitest.expect(FallbackTrigger.classify({ type: 'provider.transport', status: 429 })).toBe(
      'transport',
    );
  });

  Vitest.it('returns undefined for an unknown type with no status', () => {
    Vitest.expect(FallbackTrigger.classify({ type: 'something.else' })).toBeUndefined();
  });

  Vitest.it('returns undefined for an unknown type with an unrelated status', () => {
    Vitest.expect(
      FallbackTrigger.classify({ type: 'something.else', status: 404 }),
    ).toBeUndefined();
    Vitest.expect(
      FallbackTrigger.classify({ type: 'something.else', status: 200 }),
    ).toBeUndefined();
  });
});
