import * as Vitest from '@effect/vitest';

import * as Uuid from '../index.js';

Vitest.describe('Uuid.check runtime', () => {
  Vitest.it('accepts v4 UUIDs', () => {
    Vitest.expect(Uuid.check('110ec58a-a0f2-4ac4-8393-c866d813b8d1')).toBe(true);
    Vitest.expect(Uuid.check('110EC58A-A0F2-4AC4-8393-C866D813B8D1')).toBe(true);
  });

  Vitest.it('rejects non-v4 UUIDs with a message', () => {
    Vitest.expect(Uuid.check('110ec58a-a0f2-1ac4-8393-c866d813b8d1')).toBe(
      'Uuid must be a valid UUID v4',
    );
    Vitest.expect(Uuid.check('not-a-uuid')).toBe('Uuid must be a valid UUID v4');
  });

  Vitest.it('rejects empty strings', () => {
    Vitest.expect(Uuid.check('')).toBe('Uuid must be a valid UUID v4');
  });
});
