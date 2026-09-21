import { Exit, Schema } from 'effect';
import * as Vitest from '@effect/vitest';

import * as PositiveNumber from '../index.js';

Vitest.describe('PositiveNumber.Blueprint runtime', () => {
  Vitest.it('decodes a positive number into a branded value', () => {
    const decoded = Schema.decodeUnknownExit(PositiveNumber.Blueprint)(2.5);
    Vitest.expect(decoded).toStrictEqual(Exit.succeed(PositiveNumber.makeUnsafe(2.5)));
  });

  Vitest.it('rejects zero and negatives', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(PositiveNumber.Blueprint)(0))).toBe(true);
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(PositiveNumber.Blueprint)(-1))).toBe(
      true,
    );
  });

  Vitest.it('encodes a branded value back to a number', () => {
    const encoded = Schema.encodeUnknownExit(PositiveNumber.Blueprint)(
      PositiveNumber.makeUnsafe(2.5),
    );
    Vitest.expect(encoded).toStrictEqual(Exit.succeed(2.5));
  });
});
