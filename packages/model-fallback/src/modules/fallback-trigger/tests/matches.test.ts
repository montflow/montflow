import * as Vitest from '@effect/vitest';
import { FallbackTrigger } from '../index.js';

Vitest.describe('FallbackTrigger.matches runtime', () => {
  Vitest.it('matches a failure whose trigger is enabled', () => {
    Vitest.expect(
      FallbackTrigger.matches({ type: 'provider.quota' }, ['quota', 'rate-limit']),
    ).toBe(true);
    Vitest.expect(FallbackTrigger.matches({ type: 'unknown', status: 429 }, ['rate-limit'])).toBe(
      true,
    );
  });

  Vitest.it('does not match a failure whose trigger is disabled', () => {
    Vitest.expect(FallbackTrigger.matches({ type: 'provider.auth' }, ['quota', 'rate-limit'])).toBe(
      false,
    );
  });

  Vitest.it('does not match when nothing is enabled', () => {
    Vitest.expect(FallbackTrigger.matches({ type: 'provider.quota' }, [])).toBe(false);
  });

  Vitest.it('does not match an unclassifiable failure', () => {
    Vitest.expect(
      FallbackTrigger.matches({ type: 'something.else', status: 404 }, FallbackTrigger.all),
    ).toBe(false);
  });

  Vitest.it('matches when the classified trigger is one of several enabled ones', () => {
    Vitest.expect(
      FallbackTrigger.matches({ type: 'unknown', status: 503 }, ['quota', 'provider-internal']),
    ).toBe(true);
  });
});
