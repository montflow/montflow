import * as Vitest from '@effect/vitest';

import * as Uuid from '../index.js';

const VALID = '110ec58a-a0f2-4ac4-8393-c866d813b8d1';

Vitest.describe('Uuid.fromGenerator runtime', () => {
  Vitest.it('brands the value produced by the generator', () => {
    const uuid = Uuid.fromGenerator(() => VALID);

    Vitest.expect(uuid).toBe(VALID);
    Vitest.expect(Uuid.check(uuid)).toBe(true);
  });

  Vitest.it('calls the generator for each value', () => {
    let calls = 0;
    const generator = () => {
      calls += 1;
      return VALID;
    };

    Uuid.fromGenerator(generator);
    Uuid.fromGenerator(generator);

    Vitest.expect(calls).toBe(2);
  });

  Vitest.it('throws when the generator returns an invalid value', () => {
    Vitest.expect(() => Uuid.fromGenerator(() => 'not-a-uuid')).toThrow();
  });
});
