import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { ProfileProbe } from '../index.js';

Vitest.describe('ProfileProbe runtime', () => {
  Vitest.it.effect('reports passed when the profiles binary exits zero', () =>
    Effect.gen(function* () {
      const probe = yield* ProfileProbe.ProfileProbe;
      Vitest.expect(yield* probe.verify('effect-reviewer', '/repo')).toStrictEqual({
        kind: 'passed',
      });
    }).pipe(Effect.provide(ProfileProbe.layer('/bin/true'))),
  );

  Vitest.it.effect('reports failed when the profiles binary exits non-zero', () =>
    Effect.gen(function* () {
      const probe = yield* ProfileProbe.ProfileProbe;
      const outcome = yield* probe.verify('effect-reviewer', '/repo');
      Vitest.expect(outcome.kind).toBe('failed');
    }).pipe(Effect.provide(ProfileProbe.layer('/bin/false'))),
  );

  Vitest.it.effect('reports unavailable when the profiles binary is missing', () =>
    Effect.gen(function* () {
      const probe = yield* ProfileProbe.ProfileProbe;
      Vitest.expect(yield* probe.verify('effect-reviewer', '/repo')).toStrictEqual({
        kind: 'unavailable',
        message:
          "Profiles extension ('mf-profiles-definitely-missing') is not installed — skipped verifying profile 'effect-reviewer'.",
      });
    }).pipe(Effect.provide(ProfileProbe.layer('mf-profiles-definitely-missing'))),
  );
});
