import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PiProfiles from '../index.js';

Vitest.describe('PiProfiles.rename', () => {
  Vitest.it.effect('renames a profile to a valid slug', () =>
    Effect.gen(function* () {
      const renamed = yield* PiProfiles.rename(
        PiProfiles.make('code-reviewer', 'Reviews code'),
        'security-auditor',
      );
      Vitest.expect(renamed.name).toBe('security-auditor');
    }),
  );

  Vitest.it.effect('fails when the new name is not a valid slug', () =>
    Effect.gen(function* () {
      const profile = PiProfiles.make('code-reviewer', 'Reviews code');
      const error = yield* Effect.flip(PiProfiles.rename(profile, 'Bad Name'));
      Vitest.expect(error).toStrictEqual("invalid profile name 'Bad Name'");
    }),
  );
});
