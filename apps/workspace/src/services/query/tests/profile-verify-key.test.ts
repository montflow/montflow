import * as Vitest from '@effect/vitest';
import * as Query from '../index.js';

Vitest.describe('Query.profileVerifyKey', () => {
  Vitest.it('is stable for the same id', () => {
    Vitest.expect(Query.profileVerifyKey('demo')).toStrictEqual(Query.profileVerifyKey('demo'));
  });

  Vitest.it('collapses to the namespaced tuple per id', () => {
    Vitest.expect(Query.profileVerifyKey('demo')).toStrictEqual(['profile-verify', 'demo']);
    Vitest.expect(Query.profileVerifyKey('demo')).not.toStrictEqual(
      Query.profileVerifyKey('other'),
    );
  });
});
