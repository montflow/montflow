import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { TestClock } from 'effect/testing';

import { ISO_INSTANT_PATTERN, instant, isInstant, stampNow } from '../stamp.module.js';

Vitest.describe('Stamp runtime', () => {
  Vitest.it('formats an epoch instant to UTC seconds with a Z suffix', () => {
    Vitest.expect(instant(Date.UTC(2026, 10, 3, 12, 0, 0))).toBe('2026-11-03T12:00:00Z');
  });

  Vitest.it('accepts exactly the record format and rejects a typed variant', () => {
    Vitest.expect(isInstant('2026-11-03T12:00:00Z')).toBe(true);
    Vitest.expect(isInstant('2026-11-03T12:00:00.000Z')).toBe(false);
    Vitest.expect(isInstant('2026-11-03 12:00:00Z')).toBe(false);
    Vitest.expect(ISO_INSTANT_PATTERN.test('2026-13-03T12:00:00Z')).toBe(false);
  });

  Vitest.it.effect('stamps the current clock instant', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 10, 3, 12, 34, 56));
      Vitest.expect(yield* stampNow).toBe('2026-11-03T12:34:56Z');
    }),
  );
});
