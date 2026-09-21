import { Exit, Schema } from 'effect';
import * as Vitest from '@effect/vitest';

import * as PositiveInt from '../index.js';

Vitest.describe('PositiveInt.Blueprint runtime', () => {
  Vitest.it('decodes a positive integer into a branded value', () => {
    const decoded = Schema.decodeUnknownExit(PositiveInt.Blueprint)(5);
    Vitest.expect(decoded).toStrictEqual(Exit.succeed(PositiveInt.makeUnsafe(5)));
  });

  Vitest.it('rejects non-integers', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(PositiveInt.Blueprint)(5.5))).toBe(true);
  });

  Vitest.it('rejects non-positive integers', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(PositiveInt.Blueprint)(0))).toBe(true);
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(PositiveInt.Blueprint)(-5))).toBe(true);
  });

  Vitest.it('encodes a branded value back to a number', () => {
    const encoded = Schema.encodeUnknownExit(PositiveInt.Blueprint)(PositiveInt.makeUnsafe(5));
    Vitest.expect(encoded).toStrictEqual(Exit.succeed(5));
  });
});
