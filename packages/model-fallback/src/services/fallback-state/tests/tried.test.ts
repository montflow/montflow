import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackState } from '../../../services/index.js';

Vitest.describe('FallbackState.tried runtime', () => {
  Vitest.it.effect('returns the keys marked for a session', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;
      yield* state.mark('ses_a', 'deepseek/deepseek-chat');
      yield* state.mark('ses_a', 'openrouter/claude-sonnet-4');

      const tried = yield* state.tried('ses_a');

      Vitest.expect([...tried]).toStrictEqual([
        'deepseek/deepseek-chat',
        'openrouter/claude-sonnet-4',
      ]);
    }).pipe(Effect.provide(FallbackState.Default)),
  );

  Vitest.it.effect('returns an empty set for a session that never failed', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;

      const tried = yield* state.tried('ses_unknown');

      Vitest.expect([...tried]).toStrictEqual([]);
    }).pipe(Effect.provide(FallbackState.Default)),
  );

  Vitest.it.effect('keeps sessions isolated from each other', () =>
    Effect.gen(function* () {
      const state = yield* FallbackState.FallbackState;
      yield* state.mark('ses_a', 'a/one');
      yield* state.mark('ses_b', 'b/two');

      Vitest.expect([...(yield* state.tried('ses_a'))]).toStrictEqual(['a/one']);
      Vitest.expect([...(yield* state.tried('ses_b'))]).toStrictEqual(['b/two']);
    }).pipe(Effect.provide(FallbackState.Default)),
  );
});
