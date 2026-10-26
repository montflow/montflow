import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Sizing from '../index.js';

const repo: Sizing.ConfigSource = { path: 'sizing.json', kind: 'repo' };
const spec: Sizing.ConfigSource = { path: 'ship-login/sizing.json', kind: 'spec' };

Vitest.describe('Sizing.parse runtime', () => {
  Vitest.it.effect('decodes a valid repo config', () =>
    Effect.gen(function* () {
      const config = yield* Sizing.parse(
        repo,
        JSON.stringify({
          sizes: {
            tiny: { model: 'fixture/tiny-model', effort: 'low' },
            medium: { model: 'fixture/medium-model' },
          },
        }),
      );
      Vitest.expect(config.sizes.tiny).toStrictEqual({
        model: 'fixture/tiny-model',
        effort: 'low',
      });
      Vitest.expect(config.phases).toBeUndefined();
    }),
  );

  Vitest.it.effect('decodes a spec config with phase overrides', () =>
    Effect.gen(function* () {
      const config = yield* Sizing.parse(
        spec,
        JSON.stringify({
          sizes: { medium: { model: 'fixture/medium-model' } },
          phases: { A: { sizes: { tiny: { model: 'fixture/phase-model' } } } },
        }),
      );
      Vitest.expect(config.phases?.A?.sizes.tiny).toStrictEqual({ model: 'fixture/phase-model' });
    }),
  );

  Vitest.it.effect('fails malformed JSON with a coded error and the real parse cause', () =>
    Effect.gen(function* () {
      const error = yield* Sizing.parse(repo, '{ nope').pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(Sizing.SizingError);
      Vitest.expect(error.operation).toBe('Sizing.parse');
      Vitest.expect(error.path).toBe('sizing.json');
      Vitest.expect(error.field).toBe('root');
      Vitest.expect(error.code).toBe(Sizing.CODES.malformedJson);
      Vitest.expect(error.cause).toBeInstanceOf(SyntaxError);
      // SAFETY: the assertion above pins the cause to `SyntaxError`.
      const cause = error.cause as SyntaxError;
      Vitest.expect(cause.message).toContain('JSON');
      Vitest.expect(cause.message).toMatch(/position \d+/);
      Vitest.expect(cause.message).not.toContain('a valid JSON string');
    }),
  );

  Vitest.it.effect('fails the first contract violation as a coded error', () =>
    Effect.gen(function* () {
      const error = yield* Sizing.parse(
        spec,
        JSON.stringify({ sizes: { huge: { model: 'a/b' } } }),
      ).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(Sizing.CODES.unknownConfigSize);
      Vitest.expect(error.field).toBe('sizes.huge');
      Vitest.expect(error.path).toBe('ship-login/sizing.json');
      Vitest.expect(error.expected).toBe('tiny, small, medium, large');
      Vitest.expect(error.actual).toBe('huge');
    }),
  );

  Vitest.it.effect('decodes every config the verifier accepts', () =>
    Effect.gen(function* () {
      const text = JSON.stringify({
        sizes: { tiny: { model: 'fixture/tiny-model', effort: 'low' } },
        phases: { A: { sizes: { small: { model: 'fixture/phase-model' } } } },
      });
      Vitest.expect(Sizing.verifyText(spec, text).valid).toBe(true);
      const config = yield* Sizing.parse(spec, text);
      Vitest.expect(config.sizes.tiny).toStrictEqual({
        model: 'fixture/tiny-model',
        effort: 'low',
      });
      Vitest.expect(config.phases?.A?.sizes.small).toStrictEqual({
        model: 'fixture/phase-model',
      });
    }),
  );

  Vitest.it.effect('rejects an excess key through the verifier, not a generic schema error', () =>
    Effect.gen(function* () {
      const error = yield* Sizing.parse(
        repo,
        JSON.stringify({ sizes: {}, phases: { A: { sizes: {} } } }),
      ).pipe(Effect.flip);
      Vitest.expect(error.code).toBe(Sizing.CODES.unknownKey);
      Vitest.expect(error.field).toBe('phases');
    }),
  );
});
