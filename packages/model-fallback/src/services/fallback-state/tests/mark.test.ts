import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackState } from '../../../services/index.js';

Vitest.describe('FallbackState.mark runtime', () => {
  Vitest.it.effect('accumulates keys instead of replacing them', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;
      yield* state.mark('ses_a', 'a/one');
      yield* state.mark('ses_a', 'b/two');

      Vitest.expect([...(yield* state.tried('ses_a'))]).toStrictEqual(['a/one', 'b/two']);
    }).pipe(Effect.provide(FallbackState.Default)),
  );

  Vitest.it.effect('is idempotent for the same model', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;
      yield* state.mark('ses_a', 'a/one');
      yield* state.mark('ses_a', 'a/one');

      Vitest.expect([...(yield* state.tried('ses_a'))]).toStrictEqual(['a/one']);
    }).pipe(Effect.provide(FallbackState.Default)),
  );

  Vitest.it.effect('records the model only for the given session', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;
      yield* state.mark('ses_a', 'a/one');

      Vitest.expect([...(yield* state.tried('ses_a'))]).toStrictEqual(['a/one']);
      Vitest.expect([...(yield* state.tried('ses_b'))]).toStrictEqual([]);
    }).pipe(Effect.provide(FallbackState.Default)),
  );
});
