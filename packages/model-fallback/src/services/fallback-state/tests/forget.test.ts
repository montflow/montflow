import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackState } from '../../../services/index.js';

Vitest.describe('FallbackState.forget runtime', () => {
  Vitest.it.effect('clears the keys of a session', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;
      yield* state.mark('ses_a', 'a/one');
      yield* state.forget('ses_a');

      Vitest.expect([...(yield* state.tried('ses_a'))]).toStrictEqual([]);
    }).pipe(Effect.provide(FallbackState.Default)),
  );

  Vitest.it.effect('leaves other sessions untouched', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;
      yield* state.mark('ses_a', 'a/one');
      yield* state.mark('ses_b', 'b/two');
      yield* state.forget('ses_a');

      Vitest.expect([...(yield* state.tried('ses_b'))]).toStrictEqual(['b/two']);
    }).pipe(Effect.provide(FallbackState.Default)),
  );

  Vitest.it.effect('is a no-op for a session that was never marked', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;

      yield* state.forget('ses_unknown');

      Vitest.expect([...(yield* state.tried('ses_unknown'))]).toStrictEqual([]);
    }).pipe(Effect.provide(FallbackState.Default)),
  );
});
