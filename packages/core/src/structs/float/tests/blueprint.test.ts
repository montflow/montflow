import { Exit, Schema } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Float from '../index.js';

Vitest.describe('Float.Blueprint runtime', () => {
  Vitest.it('decodes a float into a branded float', () => {
    const decoded = Schema.decodeUnknownExit(Float.Blueprint)(1.5);
    Vitest.expect(decoded).toStrictEqual(Exit.succeed(Float.makeUnsafe(1.5)));
  });

  Vitest.it('rejects integers', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(Float.Blueprint)(1))).toBe(true);
  });

  Vitest.it('rejects non-numbers', () => {
    Vitest.expect(Exit.isFailure(Schema.decodeUnknownExit(Float.Blueprint)('1.5'))).toBe(true);
  });

  Vitest.it('encodes a branded float back to a number', () => {
    const encoded = Schema.encodeUnknownExit(Float.Blueprint)(Float.makeUnsafe(1.5));
    Vitest.expect(encoded).toStrictEqual(Exit.succeed(1.5));
  });
});
