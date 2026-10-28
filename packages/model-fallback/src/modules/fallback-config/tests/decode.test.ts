import { Model } from '@opencode/schema/model';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { FallbackConfig } from '../index.js';
import { FallbackTrigger } from '../../fallback-trigger/index.js';

Vitest.describe('FallbackConfig.decode runtime', () => {
  Vitest.it.effect('decodes a chain and the enabled triggers', () =>
    Effect.gen(function* () {
      const config = yield* FallbackConfig.decode({
        chain: ['deepseek/deepseek-chat', 'openrouter/claude-sonnet-4#beta'],
        triggers: ['quota', 'timeout'],
      });

      Vitest.expect(config.chain).toStrictEqual([
        Model.Ref.parse('deepseek/deepseek-chat'),
        Model.Ref.parse('openrouter/claude-sonnet-4#beta'),
      ]);
      Vitest.expect(config.triggers).toStrictEqual(['quota', 'timeout']);
    }),
  );

  Vitest.it.effect('deduplicates chain entries and triggers', () =>
    Effect.gen(function* () {
      const config = yield* FallbackConfig.decode({
        chain: ['a/one', 'a/one#fast', 'b/two'],
        triggers: ['auth', 'auth', 'quota'],
      });

      Vitest.expect(config.chain).toStrictEqual([
        Model.Ref.parse('a/one'),
        Model.Ref.parse('b/two'),
      ]);
      Vitest.expect(config.triggers).toStrictEqual(['auth', 'quota']);
    }),
  );

  Vitest.it.effect('uses an empty chain and the default triggers when options are missing', () =>
    Effect.gen(function* () {
      const config = yield* FallbackConfig.decode({});

      Vitest.expect(config.chain).toStrictEqual([]);
      Vitest.expect(config.triggers).toStrictEqual(FallbackTrigger.defaults);
    }),
  );

  Vitest.it.effect('fails with InvalidOptions for an unknown trigger', () =>
    Effect.gen(function* () {
      const error = yield* FallbackConfig.decode({ triggers: ['quota', 'nope'] }).pipe(Effect.flip);

      Vitest.expect(error).toMatchObject({ _tag: '@montflow/ModelFallbackInvalidOptions' });
      Vitest.expect(error.reason).toContain("Unknown fallback trigger 'nope'.");
    }),
  );

  Vitest.it.effect('fails with InvalidOptions for a malformed chain entry', () =>
    Effect.gen(function* () {
      const error = yield* FallbackConfig.decode({
        chain: ['deepseek/deepseek-chat', 'no-slash'],
      }).pipe(Effect.flip);

      Vitest.expect(error).toMatchObject({ _tag: '@montflow/ModelFallbackInvalidOptions' });
      Vitest.expect(error.reason).toContain('Invalid model reference: no-slash');
    }),
  );

  Vitest.it.effect('fails with InvalidOptions for a malformed JSON shape', () =>
    Effect.gen(function* () {
      const error = yield* FallbackConfig.decode({ chain: [42] }).pipe(Effect.flip);

      Vitest.expect(error).toMatchObject({ _tag: '@montflow/ModelFallbackInvalidOptions' });
      Vitest.expect(error.reason.length).toBeGreaterThan(0);
    }),
  );

  Vitest.it.effect('fails with InvalidOptions when an option has the wrong container type', () =>
    Effect.gen(function* () {
      const error = yield* FallbackConfig.decode({ triggers: 'quota' }).pipe(Effect.flip);

      Vitest.expect(error).toMatchObject({ _tag: '@montflow/ModelFallbackInvalidOptions' });
    }),
  );
});
