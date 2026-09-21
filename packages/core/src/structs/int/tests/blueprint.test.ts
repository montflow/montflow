import { Exit, Schema } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Int from '../index.js';

Vitest.describe('Int.Blueprint runtime', () => {
  Vitest.it('decodes an integer into a branded integer', () => {
    const decoded = Schema.decodeUnknownExit(Int.Blueprint)(42);
    Vitest.expect(decoded).toStrictEqual(Exit.succeed(Int.makeUnsafe(42)));
  });

  Vitest.it('rejects non-integers', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(Int.Blueprint)(3.14))).toBe(true);
  });

  Vitest.it('rejects non-numbers', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(Int.Blueprint)('42'))).toBe(true);
  });

  Vitest.it('encodes a branded integer back to a number', () => {
    const encoded = Schema.encodeUnknownExit(Int.Blueprint)(Int.makeUnsafe(42));
    Vitest.expect(encoded).toStrictEqual(Exit.succeed(42));
  });
});
