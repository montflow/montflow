import { Exit, Schema } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Uuid from '../index.js';

const VALID = '110ec58a-a0f2-4ac4-8393-c866d813b8d1';

Vitest.describe('Uuid.Blueprint runtime', () => {
  Vitest.it('decodes a v4 UUID into a branded uuid', () => {
    const decoded = Schema.decodeUnknownExit(Uuid.Blueprint)(VALID);
    Vitest.expect(decoded).toStrictEqual(Exit.succeed(Uuid.makeUnsafe(VALID)));
  });

  Vitest.it('rejects non-v4 UUIDs', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(Uuid.Blueprint)('not-a-uuid'))).toBe(
      true,
    );
  });

  Vitest.it('rejects non-strings', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(Uuid.Blueprint)(42))).toBe(true);
  });

  Vitest.it('encodes a branded uuid back to a string', () => {
    const encoded = Schema.encodeUnknownExit(Uuid.Blueprint)(Uuid.makeUnsafe(VALID));
    Vitest.expect(encoded).toStrictEqual(Exit.succeed(VALID));
  });
});
