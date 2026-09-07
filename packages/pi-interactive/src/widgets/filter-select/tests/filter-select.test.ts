import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiInteractive from '../index.js';

Vitest.describe('PiInteractive.matchesFilter', () => {
  Vitest.it.effect('matches subsequences case-insensitively', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* PiInteractive.matchesFilter('adversarial-review', 'arv')).toBe(true);
      Vitest.expect(yield* PiInteractive.matchesFilter('adversarial-review', 'REVIEW')).toBe(true);
    }),
  );

  Vitest.it.effect('rejects out-of-order characters and passes blank queries', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* PiInteractive.matchesFilter('adversarial-review', 'wra')).toBe(false);
      Vitest.expect(yield* PiInteractive.matchesFilter('adversarial-review', '')).toBe(true);
      Vitest.expect(yield* PiInteractive.matchesFilter('adversarial-review', '   ')).toBe(true);
    }),
  );
});

Vitest.describe('PiInteractive.filterOptions', () => {
  const options = ['adversarial-review', 'code-reviewer', 'effect-testing'] as const;

  Vitest.it.effect('returns everything on a blank query', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* PiInteractive.filterOptions(options, '')).toStrictEqual(options);
    }),
  );

  Vitest.it.effect('narrows by subsequence match, preserving order', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* PiInteractive.filterOptions(options, 'review')).toStrictEqual([
        'adversarial-review',
        'code-reviewer',
      ]);
    }),
  );

  Vitest.it.effect('returns empty when nothing matches', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* PiInteractive.filterOptions(options, 'zzz')).toStrictEqual([]);
    }),
  );
});

Vitest.describe('PiInteractive.searchSelectFor', () => {
  // SAFETY: the stub never runs — searchSelectFor only threads `ui` into the
  // returned closure (invoked by the TUI in production), so `undefined` is never
  // observed as `T` in these tests.
  const ui: PiInteractive.CustomUi = {
    custom: <T>() => Promise.resolve(undefined as T),
  };

  Vitest.it.effect('returns a picker in TUI mode', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* PiInteractive.searchSelectFor({ ui, mode: 'tui' })).toBeDefined();
    }),
  );

  Vitest.it.effect('returns undefined outside the TUI', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* PiInteractive.searchSelectFor({ ui, mode: 'text' })).toBeUndefined();
    }),
  );
});
